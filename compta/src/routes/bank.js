'use strict';
// Routes : comptes bancaires, import CODA/CSV, rapprochement des transactions.

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { db } = require('../db');
const { parseCoda, parseBankCsv } = require('../services/coda');
const { todayISO } = require('../services/belgium');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ---- Comptes -----------------------------------------------------------------
router.get('/bank/accounts', (req, res) => {
  res.json(db.prepare(`SELECT a.*,
    (SELECT COUNT(*) FROM bank_transactions t WHERE t.account_id = a.id AND t.status = 'new') AS to_review
    FROM bank_accounts a`).all());
});

router.post('/bank/accounts', (req, res) => {
  const { name, iban = '', bic = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  const info = db.prepare('INSERT INTO bank_accounts (name, iban, bic) VALUES (?,?,?)').run(name, iban, bic);
  res.json(db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/bank/accounts/:id', (req, res) => {
  db.prepare('DELETE FROM bank_transactions WHERE account_id = ?').run(req.params.id);
  db.prepare('DELETE FROM bank_accounts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Import ---------------------------------------------------------------------
function txHash(accountId, t) {
  return crypto.createHash('sha1')
    .update([accountId, t.date, t.amount.toFixed(3), t.counterparty_iban, t.communication, t.bank_ref || ''].join('|'))
    .digest('hex');
}

function importTransactions(accountId, transactions, batch) {
  const ins = db.prepare(`INSERT OR IGNORE INTO bank_transactions
    (account_id, tx_date, amount, counterparty_name, counterparty_iban, communication, import_batch, dedupe_hash)
    VALUES (?,?,?,?,?,?,?,?)`);
  let imported = 0;
  const tx = db.transaction(() => {
    for (const t of transactions) {
      if (!t.date) continue;
      const info = ins.run(accountId, t.date, t.amount, t.counterparty_name || '', t.counterparty_iban || '',
        t.communication || '', batch, txHash(accountId, t));
      imported += info.changes;
    }
  });
  tx();
  return imported;
}

router.post('/bank/import', upload.single('file'), (req, res) => {
  const accountId = Number(req.body.account_id);
  if (!accountId) return res.status(400).json({ error: 'Compte bancaire requis.' });
  if (!req.file) return res.status(400).json({ error: 'Fichier requis.' });
  const content = req.file.buffer.toString('latin1');
  const isCoda = /^0{1}0000\d/.test(content) || content.startsWith('0000');
  let parsed;
  try {
    parsed = isCoda ? parseCoda(content) : parseBankCsv(req.file.buffer.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'Fichier illisible : ' + e.message });
  }
  const batch = todayISO() + '-' + req.file.originalname;
  const imported = importTransactions(accountId, parsed.transactions, batch);
  res.json({ imported, total_in_file: parsed.transactions.length, duplicates: parsed.transactions.length - imported, format: isCoda ? 'CODA' : 'CSV' });
});

// ---- Transactions & rapprochement --------------------------------------------------
router.get('/bank/transactions', (req, res) => {
  const { account_id, status } = req.query;
  let sql = 'SELECT * FROM bank_transactions WHERE 1=1';
  const params = [];
  if (account_id) { sql += ' AND account_id = ?'; params.push(account_id); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY tx_date DESC, id DESC LIMIT 500';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map((t) => ({ ...t, suggestion: t.status === 'new' ? suggestMatch(t) : null })));
});

/** Suggère automatiquement une facture ou une dépense correspondant à la transaction. */
function suggestMatch(t) {
  if (t.amount > 0) {
    // Crédit : facture impayée avec même communication structurée ou même montant.
    const byComm = t.communication && db.prepare(`SELECT id, number, total_incl FROM documents
      WHERE doc_type = 'invoice' AND status IN ('sent','overdue') AND structured_comm != ''
      AND replace(structured_comm, '+', '') != '' AND ? LIKE '%' || replace(replace(structured_comm,'+',''),'/','') || '%'
      LIMIT 1`).get(t.communication.replace(/[+/]/g, ''));
    if (byComm) return { type: 'invoice', id: byComm.id, label: `Facture ${byComm.number}`, reason: 'communication structurée' };
    const byAmount = db.prepare(`SELECT id, number, total_incl FROM documents
      WHERE doc_type = 'invoice' AND status IN ('sent','overdue') AND ABS(total_incl - ?) < 0.01
      ORDER BY issue_date DESC LIMIT 1`).get(t.amount);
    if (byAmount) return { type: 'invoice', id: byAmount.id, label: `Facture ${byAmount.number}`, reason: 'montant identique' };
  } else {
    const byAmount = db.prepare(`SELECT id, supplier, description FROM expenses
      WHERE ABS(amount_incl - ?) < 0.01 AND expense_date >= date(?, '-60 days') AND expense_date <= date(?, '+10 days')
      LIMIT 1`).get(-t.amount, t.tx_date, t.tx_date);
    if (byAmount) return { type: 'expense', id: byAmount.id, label: byAmount.supplier || byAmount.description, reason: 'montant identique' };
  }
  return null;
}

router.post('/bank/transactions/:id/match', (req, res) => {
  const t = db.prepare('SELECT * FROM bank_transactions WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction introuvable.' });
  const { type, id, create_expense } = req.body;

  if (create_expense) {
    // Crée une dépense directement depuis la transaction (montant TVAC, TVA à préciser).
    const info = db.prepare(`INSERT INTO expenses (supplier, description, expense_date, amount_excl, vat_amount, amount_incl, category_id, payment_method)
      VALUES (?,?,?,?,?,?,?, 'bank')`)
      .run(t.counterparty_name || 'Fournisseur', t.communication || '', t.tx_date,
        Math.abs(t.amount), 0, Math.abs(t.amount), req.body.category_id || null);
    db.prepare("UPDATE bank_transactions SET status = 'matched', matched_type = 'expense', matched_id = ? WHERE id = ?")
      .run(info.lastInsertRowid, t.id);
    return res.json({ ok: true, expense_id: info.lastInsertRowid });
  }

  if (!['invoice', 'expense'].includes(type) || !id) return res.status(400).json({ error: 'Cible de rapprochement invalide.' });
  db.prepare("UPDATE bank_transactions SET status = 'matched', matched_type = ?, matched_id = ? WHERE id = ?")
    .run(type, id, t.id);
  if (type === 'invoice' && t.amount > 0) {
    db.prepare("UPDATE documents SET status = 'paid', payment_date = ? WHERE id = ? AND status IN ('sent','overdue')")
      .run(t.tx_date, id);
  }
  res.json({ ok: true });
});

router.post('/bank/transactions/:id/ignore', (req, res) => {
  db.prepare("UPDATE bank_transactions SET status = 'ignored' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.post('/bank/transactions/:id/reset', (req, res) => {
  db.prepare("UPDATE bank_transactions SET status = 'new', matched_type = NULL, matched_id = NULL WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
