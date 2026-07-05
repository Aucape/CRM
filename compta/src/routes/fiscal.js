'use strict';
// Routes : déclarations TVA, listing clients, relevé intracom, impôts,
// dashboard, calendrier fiscal, rapports.

const express = require('express');
const { db, getSetting } = require('../db');
const vat = require('../services/vat');
const tax = require('../services/tax');
const { round2, todayISO } = require('../services/belgium');

const router = express.Router();

function currentPeriod(fiscalSettings) {
  const now = new Date();
  const year = now.getFullYear();
  if (fiscalSettings.vat_periodicity === 'monthly') {
    return { year, period: 'M' + String(now.getMonth() + 1).padStart(2, '0') };
  }
  return { year, period: 'Q' + (Math.floor(now.getMonth() / 3) + 1) };
}

// ---- TVA ----------------------------------------------------------------------
router.get('/vat/declaration', (req, res) => {
  const fiscal = getSetting('fiscal');
  const cur = currentPeriod(fiscal);
  const year = Number(req.query.year) || cur.year;
  const period = req.query.period || cur.period;
  const decl = vat.computeDeclaration(year, period);
  const saved = db.prepare('SELECT * FROM vat_declarations WHERE year = ? AND period = ?').get(year, period);
  res.json({ ...decl, saved_status: saved?.status || null, filed_at: saved?.filed_at || null, vat_regime: fiscal.vat_regime });
});

router.post('/vat/declaration/file', (req, res) => {
  const { year, period } = req.body;
  if (!year || !period) return res.status(400).json({ error: 'Année et période requises.' });
  const decl = vat.computeDeclaration(Number(year), period);
  db.prepare(`INSERT INTO vat_declarations (year, period, grids_json, status, filed_at)
    VALUES (?,?,?,'filed', datetime('now'))
    ON CONFLICT(year, period) DO UPDATE SET grids_json = excluded.grids_json, status = 'filed', filed_at = datetime('now')`)
    .run(Number(year), period, JSON.stringify(decl.grids));
  res.json({ ok: true });
});

router.get('/vat/declaration/intervat.xml', (req, res) => {
  const fiscal = getSetting('fiscal');
  const cur = currentPeriod(fiscal);
  const decl = vat.computeDeclaration(Number(req.query.year) || cur.year, req.query.period || cur.period);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="intervat-${decl.year}-${decl.period}.xml"`);
  res.send(vat.intervatXml(decl));
});

router.get('/vat/client-listing', (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear() - 1;
  res.json({ year, clients: vat.clientListing(year) });
});

router.get('/vat/client-listing.xml', (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear() - 1;
  const rows = vat.clientListing(year);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="listing-clients-${year}.xml"`);
  res.send(vat.clientListingXml(year, rows));
});

router.get('/vat/intracom', (req, res) => {
  const fiscal = getSetting('fiscal');
  const cur = currentPeriod(fiscal);
  const year = Number(req.query.year) || cur.year;
  const period = req.query.period || cur.period;
  res.json({ year, period, rows: vat.intracomStatement(year, period) });
});

router.get('/vat/intracom.xml', (req, res) => {
  const fiscal = getSetting('fiscal');
  const cur = currentPeriod(fiscal);
  const year = Number(req.query.year) || cur.year;
  const period = req.query.period || cur.period;
  const rows = vat.intracomStatement(year, period);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="intracom-${year}-${period}.xml"`);
  res.send(vat.intracomXml(year, period, rows));
});

// Suivi du seuil de franchise (25 000 € de CA).
router.get('/vat/franchise-status', (req, res) => {
  const p = getSetting('tax_params');
  const year = Number(req.query.year) || new Date().getFullYear();
  const rev = db.prepare(`SELECT COALESCE(SUM(CASE WHEN doc_type='credit_note' THEN -total_excl ELSE total_excl END),0) AS rev
    FROM documents WHERE doc_type IN ('invoice','credit_note') AND status NOT IN ('draft','cancelled')
    AND strftime('%Y', issue_date) = ?`).get(String(year)).rev;
  res.json({
    year, revenue: round2(rev), threshold: p.franchise_threshold,
    pct_used: round2((rev / p.franchise_threshold) * 100),
    exceeded: rev > p.franchise_threshold,
  });
});

// ---- Impôts ----------------------------------------------------------------------
router.get('/tax/estimate', (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  res.json(tax.estimate(year));
});

// ---- Dashboard --------------------------------------------------------------------
router.get('/dashboard', (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const y = String(year);
  const fiscal = getSetting('fiscal');

  const monthly = db.prepare(`
    SELECT strftime('%m', issue_date) AS month,
      SUM(CASE WHEN doc_type='credit_note' THEN -total_excl ELSE total_excl END) AS revenue
    FROM documents WHERE doc_type IN ('invoice','credit_note') AND status NOT IN ('draft','cancelled')
      AND strftime('%Y', issue_date) = ? GROUP BY month`).all(y);
  const monthlyExp = db.prepare(`
    SELECT strftime('%m', expense_date) AS month, SUM(amount_excl * professional_pct / 100) AS expenses
    FROM expenses WHERE strftime('%Y', expense_date) = ? GROUP BY month`).all(y);

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    return {
      month: m,
      revenue: round2(monthly.find((r) => r.month === m)?.revenue || 0),
      expenses: round2(monthlyExp.find((r) => r.month === m)?.expenses || 0),
    };
  });

  const outstanding = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_incl),0) AS total
    FROM documents WHERE doc_type='invoice' AND status = 'sent'`).get();
  const overdue = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_incl),0) AS total
    FROM documents WHERE doc_type='invoice' AND status = 'overdue'`).get();
  const bankToReview = db.prepare("SELECT COUNT(*) AS n FROM bank_transactions WHERE status = 'new'").get().n;
  const draftCount = db.prepare("SELECT COUNT(*) AS n FROM documents WHERE status = 'draft'").get().n;

  const cur = currentPeriod(fiscal);
  const vatDecl = vat.computeDeclaration(cur.year, cur.period);
  const estimate = tax.estimate(year);
  const revenueTotal = round2(months.reduce((s, m) => s + m.revenue, 0));
  const expensesTotal = round2(months.reduce((s, m) => s + m.expenses, 0));

  res.json({
    year,
    months,
    revenue_total: revenueTotal,
    expenses_total: expensesTotal,
    profit: round2(revenueTotal - expensesTotal),
    outstanding, overdue,
    bank_to_review: bankToReview,
    draft_count: draftCount,
    vat_period: { ...cur, due: vatDecl.grids['71'] || 0, credit: vatDecl.grids['72'] || 0 },
    tax_to_set_aside: estimate.total_to_set_aside,
    effective_rate_pct: estimate.effective_rate_pct,
    net_in_pocket: estimate.net_in_pocket,
  });
});

// ---- Calendrier fiscal ---------------------------------------------------------------
router.get('/calendar', (req, res) => {
  const fiscal = getSetting('fiscal');
  const year = Number(req.query.year) || new Date().getFullYear();
  const events = [];

  if (getSetting('fiscal').vat_regime === 'assujetti') {
    if (fiscal.vat_periodicity === 'quarterly') {
      for (let q = 1; q <= 4; q++) {
        const month = q * 3 + 1;
        const date = month > 12 ? `${year + 1}-01-25` : `${year}-${String(month).padStart(2, '0')}-25`;
        events.push({ date, type: 'tva', label: `Déclaration TVA T${q} ${year} + paiement`, detail: 'À déposer sur Intervat au plus tard le 25 du mois suivant le trimestre.' });
      }
    } else {
      for (let m = 1; m <= 12; m++) {
        const next = m === 12 ? `${year + 1}-01-20` : `${year}-${String(m + 1).padStart(2, '0')}-20`;
        events.push({ date: next, type: 'tva', label: `Déclaration TVA ${String(m).padStart(2, '0')}/${year} + paiement`, detail: 'Déclaration mensuelle à déposer sur Intervat.' });
      }
    }
    events.push({ date: `${year}-03-31`, type: 'tva', label: `Listing clients ${year - 1}`, detail: 'Liste annuelle des clients assujettis belges (> 250 €) à déposer sur Intervat avant le 31 mars.' });
  }

  events.push(
    { date: `${year}-03-31`, type: 'social', label: 'Cotisations sociales T1', detail: 'Paiement à votre caisse d’assurances sociales avant la fin du trimestre.' },
    { date: `${year}-06-30`, type: 'social', label: 'Cotisations sociales T2', detail: 'Paiement avant la fin du trimestre.' },
    { date: `${year}-09-30`, type: 'social', label: 'Cotisations sociales T3', detail: 'Paiement avant la fin du trimestre.' },
    { date: `${year}-12-31`, type: 'social', label: 'Cotisations sociales T4', detail: 'Paiement avant la fin du trimestre.' },
    { date: `${year}-04-10`, type: 'impot', label: 'Versement anticipé VA1', detail: 'Recommandé pour éviter la majoration d’impôt (sauf 3 premières années d’activité).' },
    { date: `${year}-07-10`, type: 'impot', label: 'Versement anticipé VA2', detail: '' },
    { date: `${year}-10-10`, type: 'impot', label: 'Versement anticipé VA3', detail: '' },
    { date: `${year}-12-20`, type: 'impot', label: 'Versement anticipé VA4', detail: '' },
    { date: `${year}-07-15`, type: 'impot', label: `Déclaration IPP revenus ${year - 1} (Tax-on-web)`, detail: 'Date indicative — vérifiez la date exacte sur MyMinfin (prolongée via mandataire).' },
  );

  events.sort((a, b) => a.date.localeCompare(b.date));
  const today = todayISO();
  res.json(events.map((e) => ({ ...e, passed: e.date < today })));
});

// ---- Rapports -------------------------------------------------------------------------
router.get('/reports/pnl', (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const y = String(year);
  const revenue = db.prepare(`SELECT COALESCE(SUM(CASE WHEN doc_type='credit_note' THEN -total_excl ELSE total_excl END),0) AS v
    FROM documents WHERE doc_type IN ('invoice','credit_note') AND status NOT IN ('draft','cancelled')
    AND strftime('%Y', issue_date) = ?`).get(y).v;
  const byCategory = db.prepare(`SELECT COALESCE(c.name, 'Sans catégorie') AS category,
      SUM(e.amount_excl * e.professional_pct / 100) AS total,
      SUM((e.amount_excl + e.vat_amount * (1 - e.vat_deduct_pct / 100.0)) * e.professional_pct / 100.0 * e.income_deduct_pct / 100.0) AS deductible
    FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE strftime('%Y', e.expense_date) = ? AND e.is_asset = 0
    GROUP BY category ORDER BY total DESC`).all(y);
  const depreciation = tax.depreciationForYear(year);
  const totalExpenses = round2(byCategory.reduce((s, c) => s + c.total, 0) + depreciation.total);
  res.json({
    year,
    revenue: round2(revenue),
    expenses_by_category: byCategory.map((c) => ({ ...c, total: round2(c.total), deductible: round2(c.deductible) })),
    depreciation: depreciation.total,
    total_expenses: totalExpenses,
    profit: round2(revenue - totalExpenses),
  });
});

/** Export CSV complet pour le comptable : ventes + achats de l'année. */
router.get('/reports/export.csv', (req, res) => {
  const year = String(Number(req.query.year) || new Date().getFullYear());
  const sales = db.prepare(`SELECT d.*, c.name AS client_name, c.vat_number AS client_vat FROM documents d
    LEFT JOIN clients c ON c.id = d.client_id
    WHERE d.doc_type IN ('invoice','credit_note') AND d.status NOT IN ('draft','cancelled')
    AND strftime('%Y', d.issue_date) = ? ORDER BY d.issue_date`).all(year);
  const purchases = db.prepare(`SELECT e.*, c.name AS category_name FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE strftime('%Y', e.expense_date) = ? ORDER BY e.expense_date`).all(year);

  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['Journal;Date;Numéro;Tiers;N° TVA;Description;HTVA;TVA;TVAC;Régime/Catégorie;Statut'];
  for (const s of sales) {
    const sign = s.doc_type === 'credit_note' ? -1 : 1;
    lines.push(['VENTES', s.issue_date, s.number, s.client_name, s.client_vat, s.doc_type === 'credit_note' ? 'Note de crédit' : 'Facture',
      (sign * s.total_excl).toFixed(2).replace('.', ','), (sign * s.total_vat).toFixed(2).replace('.', ','),
      (sign * s.total_incl).toFixed(2).replace('.', ','), s.vat_regime, s.status].map(esc).join(';'));
  }
  for (const p of purchases) {
    lines.push(['ACHATS', p.expense_date, 'DEP-' + p.id, p.supplier, p.supplier_vat, p.description,
      (-p.amount_excl).toFixed(2).replace('.', ','), (-p.vat_amount).toFixed(2).replace('.', ','),
      (-p.amount_incl).toFixed(2).replace('.', ','), p.category_name || '', ''].map(esc).join(';'));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="export-comptable-${year}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
});

module.exports = router;
