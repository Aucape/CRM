'use strict';
// Génération de factures électroniques UBL 2.1 conformes Peppol BIS Billing 3.0
// (norme EN 16931) — le format requis pour la facturation électronique B2B
// obligatoire en Belgique depuis le 1er janvier 2026.

const { getSetting } = require('../db');
const { computeTotals } = require('./vat');

function esc(s) {
  return String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function vatCategory(regime, rate) {
  if (regime === 'intracom_goods' || regime === 'intracom_services') return { id: 'K', pct: 0, reason: 'Intra-Community supply — Art. 39bis/21 §2' };
  if (regime === 'export') return { id: 'G', pct: 0, reason: 'Export outside the EU — Art. 39' };
  if (regime === 'cocontractant') return { id: 'AE', pct: 0, reason: 'Reverse charge — Art. 20 RD n°1' };
  if (regime === 'exempt' || regime === 'franchise') return { id: 'E', pct: 0, reason: 'Exempt — Art. 44 / 56bis CTVA' };
  if (Number(rate) === 0) return { id: 'Z', pct: 0, reason: '' };
  return { id: 'S', pct: Number(rate), reason: '' };
}

function cleanVat(v) { return String(v || '').toUpperCase().replace(/[.\s-]/g, ''); }

/** Génère le XML UBL Invoice / CreditNote pour un document. */
function buildUbl(doc, lines, client) {
  const company = getSetting('company');
  const isCN = doc.doc_type === 'credit_note';
  const root = isCN ? 'CreditNote' : 'Invoice';
  const nsMain = isCN
    ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'
    : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
  const typeCode = isCN ? 381 : 380;
  const lineTag = isCN ? 'CreditNoteLine' : 'InvoiceLine';
  const qtyTag = isCN ? 'CreditedQuantity' : 'InvoicedQuantity';
  const totals = computeTotals(lines, doc.vat_regime);

  // Sous-totaux TVA par catégorie/taux
  const subtotals = new Map();
  for (const l of lines) {
    const cat = vatCategory(doc.vat_regime, l.vat_rate);
    const key = cat.id + ':' + cat.pct;
    const excl = Number(l.quantity) * Number(l.unit_price) * (1 - Number(l.discount_pct || 0) / 100);
    const cur = subtotals.get(key) || { cat, base: 0, vat: 0 };
    cur.base += excl;
    cur.vat += excl * cat.pct / 100;
    subtotals.set(key, cur);
  }

  const supplierEndpoint = cleanVat(company.vat_number).replace(/^BE/, '');
  const customerVat = cleanVat(client?.vat_number);

  const xmlLines = lines.map((l, i) => {
    const cat = vatCategory(doc.vat_regime, l.vat_rate);
    const excl = (Number(l.quantity) * Number(l.unit_price) * (1 - Number(l.discount_pct || 0) / 100)).toFixed(2);
    return `  <cac:${lineTag}>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:${qtyTag} unitCode="C62">${Number(l.quantity)}</cbc:${qtyTag}>
    <cbc:LineExtensionAmount currencyID="EUR">${excl}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(l.description.slice(0, 100))}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${cat.id}</cbc:ID>
        <cbc:Percent>${cat.pct.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="EUR">${Number(l.unit_price).toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:${lineTag}>`;
  }).join('\n');

  const xmlSubtotals = [...subtotals.values()].map((s) => `      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="EUR">${s.base.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="EUR">${s.vat.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:ID>${s.cat.id}</cbc:ID>
          <cbc:Percent>${s.cat.pct.toFixed(2)}</cbc:Percent>${s.cat.reason ? `
          <cbc:TaxExemptionReason>${esc(s.cat.reason)}</cbc:TaxExemptionReason>` : ''}
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="${nsMain}"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(doc.number)}</cbc:ID>
  <cbc:IssueDate>${doc.issue_date}</cbc:IssueDate>${!isCN ? `
  <cbc:DueDate>${doc.due_date || doc.issue_date}</cbc:DueDate>` : ''}
  <cbc:${isCN ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>${typeCode}</cbc:${isCN ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0208">${esc(supplierEndpoint)}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${esc(company.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(company.address)}</cbc:StreetName>
        <cbc:CityName>${esc(company.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(company.zip)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(company.country || 'BE')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(cleanVat(company.vat_number))}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(company.name)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0208">${esc(supplierEndpoint)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>${client?.peppol_id ? `
      <cbc:EndpointID schemeID="${esc(client.peppol_id.split(':')[0] || '0208')}">${esc(client.peppol_id.split(':').slice(1).join(':') || client.peppol_id)}</cbc:EndpointID>` : customerVat ? `
      <cbc:EndpointID schemeID="9925">${esc(customerVat)}</cbc:EndpointID>` : ''}
      <cac:PartyName><cbc:Name>${esc(client?.name || '')}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(client?.address || '')}</cbc:StreetName>
        <cbc:CityName>${esc(client?.city || '')}</cbc:CityName>
        <cbc:PostalZone>${esc(client?.zip || '')}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(client?.country || 'BE')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>${customerVat ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(customerVat)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(client?.name || '')}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>${doc.structured_comm ? `
    <cbc:PaymentID>${esc(doc.structured_comm)}</cbc:PaymentID>` : ''}
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(String(company.iban || '').replace(/\s+/g, ''))}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${totals.total_vat.toFixed(2)}</cbc:TaxAmount>
${xmlSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${totals.total_excl.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${totals.total_excl.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${totals.total_incl.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${totals.total_incl.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${xmlLines}
</${root}>
`;
}

module.exports = { buildUbl };
