'use strict';
// Calculs TVA belges : totaux de documents, déclaration périodique (grilles),
// export Intervat XML, listing clients annuel et relevé intracommunautaire.

const { db, getSetting } = require('../db');
const { round2 } = require('./belgium');

// Régimes pour lesquels la TVA n'est pas portée en compte sur la facture.
const ZERO_VAT_REGIMES = new Set(['cocontractant', 'intracom_services', 'intracom_goods', 'export', 'exempt', 'franchise']);

const REGIME_MENTIONS = {
  cocontractant: 'Autoliquidation — art. 20 AR n°1 (cocontractant).',
  intracom_services: 'Autoliquidation — art. 21, §2 CTVA (services intracommunautaires B2B).',
  intracom_goods: 'Livraison intracommunautaire exemptée — art. 39bis CTVA.',
  export: 'Exportation exemptée — art. 39 CTVA.',
  exempt: 'Opération exemptée — art. 44 CTVA.',
  franchise: 'Régime particulier de franchise des petites entreprises — TVA non applicable, art. 56bis CTVA.',
};

/** Calcule les totaux d'un document à partir de ses lignes et de son régime TVA. */
function computeTotals(lines, vatRegime) {
  const zeroVat = ZERO_VAT_REGIMES.has(vatRegime);
  let totalExcl = 0;
  let totalVat = 0;
  const byRate = {};
  for (const l of lines) {
    const gross = Number(l.quantity) * Number(l.unit_price);
    const excl = round2(gross * (1 - Number(l.discount_pct || 0) / 100));
    const rate = zeroVat ? 0 : Number(l.vat_rate);
    const vat = round2(excl * rate / 100);
    totalExcl += excl;
    totalVat += vat;
    byRate[rate] = byRate[rate] || { base: 0, vat: 0 };
    byRate[rate].base = round2(byRate[rate].base + excl);
    byRate[rate].vat = round2(byRate[rate].vat + vat);
  }
  return {
    total_excl: round2(totalExcl),
    total_vat: round2(totalVat),
    total_incl: round2(totalExcl + totalVat),
    by_rate: byRate,
    mention: REGIME_MENTIONS[vatRegime] || '',
  };
}

function periodRange(year, period) {
  if (/^Q[1-4]$/.test(period)) {
    const q = Number(period[1]);
    const from = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
    const toMonth = q * 3;
    const to = `${year}-${String(toMonth).padStart(2, '0')}-${new Date(year, toMonth, 0).getDate()}`;
    return { from, to };
  }
  const m = Number(period.slice(1));
  const from = `${year}-${String(m).padStart(2, '0')}-01`;
  const to = `${year}-${String(m).padStart(2, '0')}-${new Date(year, m, 0).getDate()}`;
  return { from, to };
}

const RATE_GRID = { 0: '00', 6: '01', 12: '02', 21: '03' };

/**
 * Calcule les grilles de la déclaration TVA périodique pour une période donnée.
 * Ventes : documents 'invoice' et 'credit_note' non brouillon, par date d'émission.
 * Achats : dépenses par date, selon la grille de leur catégorie et leur régime.
 */
function computeDeclaration(year, period) {
  const { from, to } = periodRange(year, period);
  const grids = {};
  const add = (g, amount) => { grids[g] = round2((grids[g] || 0) + amount); };

  // --- Ventes -----------------------------------------------------------
  const docs = db.prepare(`
    SELECT d.*, c.country AS client_country FROM documents d
    LEFT JOIN clients c ON c.id = d.client_id
    WHERE d.doc_type IN ('invoice','credit_note') AND d.status != 'draft' AND d.status != 'cancelled'
      AND d.issue_date >= ? AND d.issue_date <= ?
  `).all(from, to);

  const lineStmt = db.prepare('SELECT * FROM document_lines WHERE document_id = ?');
  for (const doc of docs) {
    const totals = computeTotals(lineStmt.all(doc.id), doc.vat_regime);
    const isCN = doc.doc_type === 'credit_note';
    if (isCN) {
      // Notes de crédit émises : base en 49 (ou 48 si intracom), TVA à récupérer en 64.
      if (doc.vat_regime === 'intracom_services' || doc.vat_regime === 'intracom_goods') {
        add('48', totals.total_excl);
      } else {
        add('49', totals.total_excl);
      }
      add('64', totals.total_vat);
      continue;
    }
    switch (doc.vat_regime) {
      case 'standard':
        for (const [rate, v] of Object.entries(totals.by_rate)) {
          add(RATE_GRID[rate] ?? '03', v.base);
        }
        add('54', totals.total_vat);
        break;
      case 'cocontractant': add('45', totals.total_excl); break;
      case 'intracom_services': add('44', totals.total_excl); break;
      case 'intracom_goods': add('46', totals.total_excl); break;
      case 'export': add('47', totals.total_excl); break;
      default: add('00', totals.total_excl); break;
    }
  }

  // --- Achats -----------------------------------------------------------
  const expenses = db.prepare(`
    SELECT e.*, cat.vat_grid FROM expenses e
    LEFT JOIN expense_categories cat ON cat.id = e.category_id
    WHERE e.expense_date >= ? AND e.expense_date <= ?
  `).all(from, to);

  for (const e of expenses) {
    const proPct = Number(e.professional_pct) / 100;
    const base = round2(Number(e.amount_excl) * proPct);
    const grid = e.vat_grid || '82';
    add(grid, base);
    const deductPct = (Number(e.vat_deduct_pct) / 100) * proPct;

    if (e.vat_regime === 'intracom_goods' || e.vat_regime === 'intracom_services') {
      // Acquisitions intracommunautaires : autoliquidation (TVA due + déductible).
      add(e.vat_regime === 'intracom_goods' ? '86' : '88', base);
      const reverseVat = round2(base * 0.21);
      add('55', reverseVat);
      add('59', round2(reverseVat * deductPct));
    } else if (e.vat_regime === 'cocontractant') {
      add('87', base);
      const reverseVat = round2(base * 0.21);
      add('56', reverseVat);
      add('59', round2(reverseVat * deductPct));
    } else if (e.vat_regime === 'import') {
      add('87', base);
      const reverseVat = round2(base * 0.21);
      add('57', reverseVat);
      add('59', round2(reverseVat * deductPct));
    } else {
      add('59', round2(Number(e.vat_amount) * deductPct));
    }
  }

  // --- Soldes -----------------------------------------------------------
  const due = round2(['54', '55', '56', '57', '61', '63'].reduce((s, g) => s + (grids[g] || 0), 0));
  const deductible = round2(['59', '62', '64'].reduce((s, g) => s + (grids[g] || 0), 0));
  if (due >= deductible) grids['71'] = round2(due - deductible);
  else grids['72'] = round2(deductible - due);

  // tri des grilles pour l'affichage
  const ordered = {};
  Object.keys(grids).sort().forEach((k) => { if (grids[k] !== 0) ordered[k] = grids[k]; });
  return { year, period, from, to, grids: ordered, total_due: due, total_deductible: deductible };
}

function xmlEscape(s) {
  return String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function bareVatNumber(vat) {
  return String(vat || '').toUpperCase().replace(/[^0-9]/g, '');
}

/** Génère le XML Intervat (déclaration périodique) prêt à déposer sur Intervat. */
function intervatXml(declaration) {
  const company = getSetting('company');
  const vatNum = bareVatNumber(company.vat_number);
  const isQuarter = declaration.period.startsWith('Q');
  const periodTag = isQuarter
    ? `<ns2:Quarter>${declaration.period[1]}</ns2:Quarter>`
    : `<ns2:Month>${Number(declaration.period.slice(1))}</ns2:Month>`;
  const amounts = Object.entries(declaration.grids)
    .filter(([g]) => !['71', '72'].includes(g) || true)
    .map(([g, v]) => `      <ns2:Amount GridNumber="${Number(g)}">${v.toFixed(2)}</ns2:Amount>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ns2:VATConsignment xmlns="http://www.minfin.fgov.be/InputCommon" xmlns:ns2="http://www.minfin.fgov.be/VATConsignment" VATDeclarationsNbr="1">
  <ns2:VATDeclaration SequenceNumber="1" DeclarantReference="${xmlEscape(declaration.year + '-' + declaration.period)}">
    <ns2:Declarant>
      <VATNumber>${vatNum}</VATNumber>
      <Name>${xmlEscape(company.name)}</Name>
      <Street>${xmlEscape(company.address)}</Street>
      <PostCode>${xmlEscape(company.zip)}</PostCode>
      <City>${xmlEscape(company.city)}</City>
      <CountryCode>${xmlEscape(company.country || 'BE')}</CountryCode>
      <EmailAddress>${xmlEscape(company.email)}</EmailAddress>
      <Phone>${xmlEscape(company.phone)}</Phone>
    </ns2:Declarant>
    <ns2:Period>
      ${periodTag}
      <ns2:Year>${declaration.year}</ns2:Year>
    </ns2:Period>
    <ns2:Data>
${amounts}
    </ns2:Data>
    <ns2:ClientListingNihil>NO</ns2:ClientListingNihil>
  </ns2:VATDeclaration>
</ns2:VATConsignment>
`;
}

/** Listing clients annuel : clients belges assujettis avec CA HTVA > 250 €. */
function clientListing(year) {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.vat_number,
      SUM(CASE WHEN d.doc_type = 'credit_note' THEN -d.total_excl ELSE d.total_excl END) AS turnover,
      SUM(CASE WHEN d.doc_type = 'credit_note' THEN -d.total_vat ELSE d.total_vat END) AS vat
    FROM documents d
    JOIN clients c ON c.id = d.client_id
    WHERE d.doc_type IN ('invoice','credit_note') AND d.status NOT IN ('draft','cancelled')
      AND strftime('%Y', d.issue_date) = ?
      AND c.vat_number LIKE 'BE%'
    GROUP BY c.id HAVING turnover > 250
    ORDER BY turnover DESC
  `).all(String(year));
  return rows.map((r) => ({ ...r, turnover: round2(r.turnover), vat: round2(r.vat) }));
}

/** XML Intervat pour le listing clients annuel. */
function clientListingXml(year, rows) {
  const company = getSetting('company');
  const vatNum = bareVatNumber(company.vat_number);
  const totalTurnover = round2(rows.reduce((s, r) => s + r.turnover, 0));
  const totalVat = round2(rows.reduce((s, r) => s + r.vat, 0));
  const clients = rows.map((r, i) => `    <ns2:Client SequenceNumber="${i + 1}">
      <ns2:CompanyVATNumber issuedBy="BE">${bareVatNumber(r.vat_number)}</ns2:CompanyVATNumber>
      <ns2:TurnOver>${r.turnover.toFixed(2)}</ns2:TurnOver>
      <ns2:VATAmount>${r.vat.toFixed(2)}</ns2:VATAmount>
    </ns2:Client>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ns2:ClientListingConsignment xmlns="http://www.minfin.fgov.be/InputCommon" xmlns:ns2="http://www.minfin.fgov.be/ClientListingConsignment" ClientListingsNbr="1">
  <ns2:ClientListing SequenceNumber="1" ClientsNbr="${rows.length}" DeclarantReference="listing-${year}"
      TurnOverSum="${totalTurnover.toFixed(2)}" VATAmountSum="${totalVat.toFixed(2)}">
    <ns2:Declarant>
      <VATNumber>${vatNum}</VATNumber>
      <Name>${xmlEscape(company.name)}</Name>
      <Street>${xmlEscape(company.address)}</Street>
      <PostCode>${xmlEscape(company.zip)}</PostCode>
      <City>${xmlEscape(company.city)}</City>
      <CountryCode>${xmlEscape(company.country || 'BE')}</CountryCode>
      <EmailAddress>${xmlEscape(company.email)}</EmailAddress>
      <Phone>${xmlEscape(company.phone)}</Phone>
    </ns2:Declarant>
    <ns2:Period>${year}</ns2:Period>
${clients}
  </ns2:ClientListing>
</ns2:ClientListingConsignment>
`;
}

/** Relevé intracommunautaire : ventes intracom par client UE et par période. */
function intracomStatement(year, period) {
  const { from, to } = periodRange(year, period);
  const rows = db.prepare(`
    SELECT c.name, c.vat_number, c.country, d.vat_regime,
      SUM(CASE WHEN d.doc_type = 'credit_note' THEN -d.total_excl ELSE d.total_excl END) AS amount
    FROM documents d
    JOIN clients c ON c.id = d.client_id
    WHERE d.doc_type IN ('invoice','credit_note') AND d.status NOT IN ('draft','cancelled')
      AND d.vat_regime IN ('intracom_goods','intracom_services')
      AND d.issue_date >= ? AND d.issue_date <= ?
    GROUP BY c.id, d.vat_regime
    ORDER BY c.name
  `).all(from, to);
  return rows.map((r) => ({
    ...r,
    amount: round2(r.amount),
    code: r.vat_regime === 'intracom_goods' ? 'L' : 'S',
  }));
}

/** XML Intervat pour le relevé intracommunautaire. */
function intracomXml(year, period, rows) {
  const company = getSetting('company');
  const vatNum = bareVatNumber(company.vat_number);
  const isQuarter = period.startsWith('Q');
  const periodTag = isQuarter
    ? `<ns2:Quarter>${period[1]}</ns2:Quarter>`
    : `<ns2:Month>${Number(period.slice(1))}</ns2:Month>`;
  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  const clients = rows.map((r, i) => `    <ns2:IntraClient SequenceNumber="${i + 1}">
      <ns2:CompanyVATNumber issuedBy="${xmlEscape((r.vat_number || '').slice(0, 2))}">${xmlEscape(String(r.vat_number || '').replace(/^[A-Z]{2}/i, '').replace(/\s+/g, ''))}</ns2:CompanyVATNumber>
      <ns2:Code>${r.code}</ns2:Code>
      <ns2:Amount>${r.amount.toFixed(2)}</ns2:Amount>
    </ns2:IntraClient>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ns2:IntraConsignment xmlns="http://www.minfin.fgov.be/InputCommon" xmlns:ns2="http://www.minfin.fgov.be/IntraConsignment" IntraListingsNbr="1">
  <ns2:IntraListing SequenceNumber="1" ClientsNbr="${rows.length}" DeclarantReference="intra-${year}-${period}" AmountSum="${total.toFixed(2)}">
    <ns2:Declarant>
      <VATNumber>${vatNum}</VATNumber>
      <Name>${xmlEscape(company.name)}</Name>
      <Street>${xmlEscape(company.address)}</Street>
      <PostCode>${xmlEscape(company.zip)}</PostCode>
      <City>${xmlEscape(company.city)}</City>
      <CountryCode>${xmlEscape(company.country || 'BE')}</CountryCode>
      <EmailAddress>${xmlEscape(company.email)}</EmailAddress>
      <Phone>${xmlEscape(company.phone)}</Phone>
    </ns2:Declarant>
    <ns2:Period>
      ${periodTag}
      <ns2:Year>${year}</ns2:Year>
    </ns2:Period>
${clients}
  </ns2:IntraListing>
</ns2:IntraConsignment>
`;
}

module.exports = {
  computeTotals, computeDeclaration, intervatXml,
  clientListing, clientListingXml, intracomStatement, intracomXml,
  periodRange, REGIME_MENTIONS, ZERO_VAT_REGIMES,
};
