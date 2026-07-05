'use strict';
// Peppol : envoi de factures via un point d'accès (API) et lecture des
// factures UBL reçues (converties automatiquement en dépenses).

const { getSetting } = require('../db');

// ---- Lecture d'une facture UBL reçue ----------------------------------------

function tag(xml, name) {
  // Extrait le contenu de la première balise <ns:name ...>...</ns:name>.
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]*)<`, 'i'));
  return m ? m[1].trim() : '';
}

function section(xml, name) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}[\\s>][\\s\\S]*?</(?:\\w+:)?${name}>`, 'i'));
  return m ? m[0] : '';
}

/** Parse une facture UBL (Invoice ou CreditNote) reçue via Peppol. */
function parseInboundUbl(xml) {
  const isCreditNote = /<(?:\w+:)?CreditNote[\s>]/i.test(xml);
  if (!isCreditNote && !/<(?:\w+:)?Invoice[\s>]/i.test(xml)) {
    throw new Error('Fichier non reconnu : ce n\'est pas une facture UBL (Invoice/CreditNote).');
  }
  const supplierSection = section(xml, 'AccountingSupplierParty') || xml;
  const totalsSection = section(xml, 'LegalMonetaryTotal') || xml;
  const taxSection = section(xml, 'TaxTotal') || xml;

  const supplierVat = (supplierSection.match(/<(?:\w+:)?CompanyID[^>]*>([A-Z]{2}[\w.]+)</i) || [])[1] || '';
  const totalExcl = Number(tag(totalsSection, 'TaxExclusiveAmount')) || 0;
  const totalIncl = Number(tag(totalsSection, 'TaxInclusiveAmount') || tag(totalsSection, 'PayableAmount')) || 0;
  const totalVat = Number(tag(taxSection, 'TaxAmount')) || Math.max(totalIncl - totalExcl, 0);
  const sign = isCreditNote ? -1 : 1;

  return {
    doc_type: isCreditNote ? 'credit_note' : 'invoice',
    number: tag(xml, 'ID'),
    issue_date: tag(xml, 'IssueDate'),
    due_date: tag(xml, 'DueDate'),
    supplier: tag(supplierSection, 'RegistrationName') || tag(supplierSection, 'Name'),
    supplier_vat: supplierVat.replace(/[.\s]/g, ''),
    amount_excl: sign * totalExcl,
    vat_amount: sign * totalVat,
    amount_incl: sign * (totalIncl || totalExcl + totalVat),
    payment_ref: tag(xml, 'PaymentID'),
  };
}

// ---- Envoi via un point d'accès ------------------------------------------------

/**
 * Envoie le XML UBL d'une facture sur le réseau Peppol via le point d'accès
 * configuré. Retourne la réponse du fournisseur.
 */
async function sendUbl(ublXml, { clientPeppolId, clientVat } = {}) {
  const integ = getSetting('integrations');
  const provider = integ.peppol_provider || 'none';

  if (provider === 'none') {
    const err = new Error('Aucun point d\'accès Peppol configuré (Paramètres → Intégrations). Téléchargez le fichier UBL et transmettez-le via votre point d\'accès.');
    err.status = 400;
    throw err;
  }

  if (provider === 'storecove') {
    if (!integ.peppol_api_key || !integ.peppol_legal_entity_id) {
      const err = new Error('Clé API et identifiant d\'entité légale Storecove requis.');
      err.status = 400;
      throw err;
    }
    const res = await fetch('https://api.storecove.com/api/v2/document_submissions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + integ.peppol_api_key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        legalEntityId: Number(integ.peppol_legal_entity_id),
        document: {
          documentType: 'invoice',
          rawDocumentData: {
            document: Buffer.from(ublXml).toString('base64'),
            parse: true,
            parseStrategy: 'ubl',
          },
        },
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      const err = new Error(`Storecove a refusé l'envoi (${res.status}) : ${body.slice(0, 300)}`);
      err.status = 502;
      throw err;
    }
    return { provider: 'storecove', response: safeJson(body) };
  }

  // Endpoint personnalisé : POST du XML brut avec Bearer token.
  if (!integ.peppol_custom_url) {
    const err = new Error('URL du point d\'accès personnalisé manquante.');
    err.status = 400;
    throw err;
  }
  const res = await fetch(integ.peppol_custom_url, {
    method: 'POST',
    headers: {
      ...(integ.peppol_api_key ? { Authorization: 'Bearer ' + integ.peppol_api_key } : {}),
      'Content-Type': 'application/xml; charset=utf-8',
      ...(clientPeppolId ? { 'X-Peppol-Recipient': clientPeppolId } : {}),
      ...(clientVat ? { 'X-Recipient-Vat': clientVat } : {}),
    },
    body: ublXml,
  });
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`Le point d'accès a refusé l'envoi (${res.status}) : ${body.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }
  return { provider: 'custom', response: safeJson(body) };
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return s.slice(0, 500); }
}

module.exports = { parseInboundUbl, sendUbl };
