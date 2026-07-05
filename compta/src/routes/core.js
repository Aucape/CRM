'use strict';
// Routes : paramètres, clients, produits, outils, sauvegarde.

const express = require('express');
const { db, getSetting, setSetting } = require('../db');
const { checkBelgianVat, carDeductibility } = require('../services/belgium');

const router = express.Router();

// ---- Paramètres ------------------------------------------------------------
router.get('/settings', (req, res) => {
  res.json({
    company: getSetting('company'),
    fiscal: getSetting('fiscal'),
    tax_params: getSetting('tax_params'),
  });
});

router.put('/settings', (req, res) => {
  for (const key of ['company', 'fiscal', 'tax_params']) {
    if (req.body[key]) setSetting(key, Object.assign(getSetting(key), req.body[key]));
  }
  res.json({ ok: true });
});

// ---- Clients ---------------------------------------------------------------
router.get('/clients', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COALESCE(SUM(CASE WHEN d.doc_type='credit_note' THEN -d.total_excl ELSE d.total_excl END),0)
       FROM documents d WHERE d.client_id = c.id AND d.doc_type IN ('invoice','credit_note')
       AND d.status NOT IN ('draft','cancelled')) AS turnover,
      (SELECT COUNT(*) FROM documents d WHERE d.client_id = c.id AND d.doc_type='invoice'
       AND d.status NOT IN ('draft','cancelled')) AS invoice_count
    FROM clients c WHERE c.archived = 0 ORDER BY c.name COLLATE NOCASE
  `).all();
  res.json(rows);
});

const CLIENT_FIELDS = ['kind', 'name', 'vat_number', 'email', 'phone', 'address', 'zip', 'city', 'country', 'peppol_id', 'payment_days', 'default_vat_regime', 'notes'];
const CLIENT_DEFAULTS = { kind: 'company', country: 'BE', payment_days: 30 };

router.post('/clients', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  const vals = CLIENT_FIELDS.map((f) => req.body[f] ?? CLIENT_DEFAULTS[f] ?? '');
  const info = db.prepare(`INSERT INTO clients (${CLIENT_FIELDS.join(',')}) VALUES (${CLIENT_FIELDS.map(() => '?').join(',')})`).run(...vals);
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/clients/:id', (req, res) => {
  const sets = CLIENT_FIELDS.filter((f) => f in req.body);
  if (sets.length) {
    db.prepare(`UPDATE clients SET ${sets.map((f) => f + ' = ?').join(', ')} WHERE id = ?`)
      .run(...sets.map((f) => req.body[f]), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

router.delete('/clients/:id', (req, res) => {
  const used = db.prepare('SELECT COUNT(*) AS n FROM documents WHERE client_id = ?').get(req.params.id).n;
  if (used > 0) {
    db.prepare('UPDATE clients SET archived = 1 WHERE id = ?').run(req.params.id);
    return res.json({ ok: true, archived: true });
  }
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Produits & services -----------------------------------------------------
router.get('/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM products WHERE archived = 0 ORDER BY name COLLATE NOCASE').all());
});

router.post('/products', (req, res) => {
  const { name, description = '', unit = 'pièce', unit_price = 0, vat_rate = 21 } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  const info = db.prepare('INSERT INTO products (name, description, unit, unit_price, vat_rate) VALUES (?,?,?,?,?)')
    .run(name, description, unit, unit_price, vat_rate);
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/products/:id', (req, res) => {
  const fields = ['name', 'description', 'unit', 'unit_price', 'vat_rate'].filter((f) => f in req.body);
  if (fields.length) {
    db.prepare(`UPDATE products SET ${fields.map((f) => f + ' = ?').join(', ')} WHERE id = ?`)
      .run(...fields.map((f) => req.body[f]), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

router.delete('/products/:id', (req, res) => {
  db.prepare('UPDATE products SET archived = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Outils -------------------------------------------------------------------
router.get('/tools/check-vat', (req, res) => {
  res.json(checkBelgianVat(req.query.number || ''));
});

router.get('/tools/car-deduct', (req, res) => {
  res.json(carDeductibility({ co2: Number(req.query.co2), fuel: req.query.fuel || 'diesel' }));
});

// ---- Sauvegarde complète -------------------------------------------------------
const BACKUP_TABLES = ['settings', 'clients', 'products', 'documents', 'document_lines',
  'recurring_invoices', 'expense_categories', 'expenses', 'assets', 'bank_accounts',
  'bank_transactions', 'vat_declarations'];

router.get('/backup', (req, res) => {
  const dump = { exported_at: new Date().toISOString(), version: 1, tables: {} };
  for (const t of BACKUP_TABLES) dump.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  res.setHeader('Content-Disposition', `attachment; filename="compta-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(dump);
});

router.post('/backup/restore', (req, res) => {
  const dump = req.body;
  if (!dump || !dump.tables) return res.status(400).json({ error: 'Fichier de sauvegarde invalide.' });
  const tx = db.transaction(() => {
    for (const t of [...BACKUP_TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
    for (const t of BACKUP_TABLES) {
      const rows = dump.tables[t] || [];
      for (const row of rows) {
        const cols = Object.keys(row);
        db.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
          .run(...cols.map((c) => row[c]));
      }
    }
  });
  tx();
  res.json({ ok: true });
});

module.exports = router;
