'use strict';
// Routes : dépenses professionnelles, catégories, immobilisations & amortissements.

const express = require('express');
const path = require('path');
const multer = require('multer');
const { db, DATA_DIR } = require('../db');
const { round2 } = require('../services/belgium');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(DATA_DIR, 'uploads'),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-]/g, '_');
      cb(null, Date.now() + '-' + safe);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// ---- Catégories -------------------------------------------------------------
router.get('/expense-categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM expense_categories ORDER BY name COLLATE NOCASE').all());
});

router.post('/expense-categories', (req, res) => {
  const { name, vat_grid = '82', income_deduct_pct = 100, vat_deduct_pct = 100, professional_pct = 100 } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  const info = db.prepare(`INSERT INTO expense_categories (name, vat_grid, income_deduct_pct, vat_deduct_pct, professional_pct)
    VALUES (?,?,?,?,?)`).run(name, vat_grid, income_deduct_pct, vat_deduct_pct, professional_pct);
  res.json(db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/expense-categories/:id', (req, res) => {
  const fields = ['name', 'vat_grid', 'income_deduct_pct', 'vat_deduct_pct', 'professional_pct'].filter((f) => f in req.body);
  if (fields.length) {
    db.prepare(`UPDATE expense_categories SET ${fields.map((f) => f + ' = ?').join(', ')} WHERE id = ?`)
      .run(...fields.map((f) => req.body[f]), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(req.params.id));
});

// ---- Dépenses ----------------------------------------------------------------
router.get('/expenses', (req, res) => {
  const { year, category_id, q } = req.query;
  let sql = `SELECT e.*, c.name AS category_name, c.vat_grid FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id WHERE 1=1`;
  const params = [];
  if (year) { sql += " AND strftime('%Y', e.expense_date) = ?"; params.push(String(year)); }
  if (category_id) { sql += ' AND e.category_id = ?'; params.push(category_id); }
  if (q) { sql += ' AND (e.supplier LIKE ? OR e.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY e.expense_date DESC, e.id DESC';
  res.json(db.prepare(sql).all(...params));
});

const EXPENSE_FIELDS = ['supplier', 'supplier_vat', 'description', 'category_id', 'expense_date',
  'amount_excl', 'vat_amount', 'amount_incl', 'professional_pct', 'income_deduct_pct',
  'vat_deduct_pct', 'vat_regime', 'payment_method', 'notes'];
const EXPENSE_DEFAULTS = {
  supplier: '', supplier_vat: '', description: '', category_id: null,
  professional_pct: 100, income_deduct_pct: 100, vat_deduct_pct: 100,
  vat_regime: 'domestic', payment_method: 'bank', notes: '',
};

function applyCategoryDefaults(body) {
  if (!body.category_id) return body;
  const cat = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(body.category_id);
  if (!cat) return body;
  return {
    income_deduct_pct: cat.income_deduct_pct,
    vat_deduct_pct: cat.vat_deduct_pct,
    professional_pct: cat.professional_pct,
    ...body,
  };
}

router.post('/expenses', upload.single('receipt'), (req, res) => {
  const b = applyCategoryDefaults(req.body);
  if (!b.expense_date) return res.status(400).json({ error: 'La date est obligatoire.' });
  // Complète les montants manquants (TVAC = HTVA + TVA).
  const excl = Number(b.amount_excl) || 0;
  const vat = Number(b.vat_amount) || 0;
  const incl = Number(b.amount_incl) || round2(excl + vat);
  const info = db.prepare(`INSERT INTO expenses (${EXPENSE_FIELDS.join(',')}, receipt_path)
    VALUES (${EXPENSE_FIELDS.map(() => '?').join(',')}, ?)`)
    .run(...EXPENSE_FIELDS.map((f) => {
      if (f === 'amount_excl') return excl;
      if (f === 'vat_amount') return vat;
      if (f === 'amount_incl') return incl;
      return b[f] ?? EXPENSE_DEFAULTS[f] ?? null;
    }), req.file ? req.file.filename : '');
  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/expenses/:id', upload.single('receipt'), (req, res) => {
  const b = req.body;
  const fields = EXPENSE_FIELDS.filter((f) => f in b);
  const sets = fields.map((f) => f + ' = ?');
  const vals = fields.map((f) => b[f]);
  if (req.file) { sets.push('receipt_path = ?'); vals.push(req.file.filename); }
  if (sets.length) db.prepare(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id));
});

router.delete('/expenses/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/expenses/:id/receipt', (req, res) => {
  const e = db.prepare('SELECT receipt_path FROM expenses WHERE id = ?').get(req.params.id);
  if (!e || !e.receipt_path) return res.status(404).json({ error: 'Aucun justificatif.' });
  res.sendFile(path.join(DATA_DIR, 'uploads', e.receipt_path));
});

/** Convertit une dépense en immobilisation (amortissement sur N années). */
router.post('/expenses/:id/to-asset', (req, res) => {
  const e = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Dépense introuvable.' });
  const duration = Number(req.body.duration_years) || 5;
  const info = db.prepare(`INSERT INTO assets (name, purchase_date, amount_excl, duration_years, income_deduct_pct, expense_id)
    VALUES (?,?,?,?,?,?)`)
    .run(e.description || e.supplier || 'Immobilisation', e.expense_date,
      round2(e.amount_excl * e.professional_pct / 100), duration, e.income_deduct_pct, e.id);
  db.prepare('UPDATE expenses SET is_asset = 1 WHERE id = ?').run(e.id);
  res.json(db.prepare('SELECT * FROM assets WHERE id = ?').get(info.lastInsertRowid));
});

// ---- Immobilisations -----------------------------------------------------------
router.get('/assets', (req, res) => {
  const assets = db.prepare('SELECT * FROM assets ORDER BY purchase_date DESC').all();
  const currentYear = new Date().getFullYear();
  res.json(assets.map((a) => {
    const startYear = Number(a.purchase_date.slice(0, 4));
    const annuity = round2(a.amount_excl / a.duration_years);
    const schedule = [];
    for (let i = 0; i < a.duration_years; i++) {
      schedule.push({
        year: startYear + i,
        annuity,
        remaining: round2(a.amount_excl - annuity * (i + 1)),
      });
    }
    const yearsDone = Math.min(Math.max(currentYear - startYear + 1, 0), a.duration_years);
    return { ...a, annuity, schedule, book_value: round2(a.amount_excl - annuity * yearsDone) };
  }));
});

router.post('/assets', (req, res) => {
  const b = req.body;
  if (!b.name || !b.purchase_date || !b.amount_excl) {
    return res.status(400).json({ error: 'Nom, date et montant obligatoires.' });
  }
  const info = db.prepare(`INSERT INTO assets (name, purchase_date, amount_excl, duration_years, income_deduct_pct, notes)
    VALUES (?,?,?,?,?,?)`)
    .run(b.name, b.purchase_date, Number(b.amount_excl), Number(b.duration_years) || 5,
      Number(b.income_deduct_pct) || 100, b.notes || '');
  res.json(db.prepare('SELECT * FROM assets WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/assets/:id', (req, res) => {
  const fields = ['name', 'purchase_date', 'amount_excl', 'duration_years', 'income_deduct_pct', 'notes', 'sold_date'].filter((f) => f in req.body);
  if (fields.length) {
    db.prepare(`UPDATE assets SET ${fields.map((f) => f + ' = ?').join(', ')} WHERE id = ?`)
      .run(...fields.map((f) => req.body[f]), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id));
});

router.delete('/assets/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (a?.expense_id) db.prepare('UPDATE expenses SET is_asset = 0 WHERE id = ?').run(a.expense_id);
  db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
