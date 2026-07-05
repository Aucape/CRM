'use strict';
// Routes : factures, devis, notes de crédit, factures récurrentes.

const express = require('express');
const { db, getSetting, setSetting } = require('../db');
const { computeTotals, REGIME_MENTIONS } = require('../services/vat');
const { structuredCommunication, todayISO, addDays } = require('../services/belgium');
const { buildUbl } = require('../services/ubl');
const { documentPdf } = require('../services/pdf');

const router = express.Router();

const getDoc = db.prepare('SELECT * FROM documents WHERE id = ?');
const getLines = db.prepare('SELECT * FROM document_lines WHERE document_id = ? ORDER BY position, id');
const getClient = db.prepare('SELECT * FROM clients WHERE id = ?');

function refreshOverdue() {
  db.prepare(`UPDATE documents SET status = 'overdue'
    WHERE doc_type = 'invoice' AND status = 'sent' AND due_date < ?`).run(todayISO());
}

function withDetails(doc) {
  const lines = getLines.all(doc.id);
  const client = doc.client_id ? getClient.get(doc.client_id) : null;
  return { ...doc, lines, client, mention: REGIME_MENTIONS[doc.vat_regime] || '' };
}

function saveLines(docId, lines) {
  db.prepare('DELETE FROM document_lines WHERE document_id = ?').run(docId);
  const ins = db.prepare(`INSERT INTO document_lines
    (document_id, position, description, quantity, unit, unit_price, discount_pct, vat_rate)
    VALUES (?,?,?,?,?,?,?,?)`);
  (lines || []).forEach((l, i) => {
    if (!l.description) return;
    ins.run(docId, i, l.description, Number(l.quantity) || 1, l.unit || '', Number(l.unit_price) || 0,
      Number(l.discount_pct) || 0, Number(l.vat_rate ?? 21));
  });
}

function recomputeTotals(docId) {
  const doc = getDoc.get(docId);
  const totals = computeTotals(getLines.all(docId), doc.vat_regime);
  db.prepare('UPDATE documents SET total_excl = ?, total_vat = ?, total_incl = ? WHERE id = ?')
    .run(totals.total_excl, totals.total_vat, totals.total_incl, docId);
}

/** Attribue le prochain numéro séquentiel au document (par type, remis à zéro chaque année). */
function assignNumber(doc) {
  const fiscal = getSetting('fiscal');
  const year = new Date().getFullYear();
  if (fiscal.seq_year !== year) {
    fiscal.seq_year = year;
    fiscal.next_invoice_seq = 1;
    fiscal.next_quote_seq = 1;
    fiscal.next_credit_note_seq = 1;
  }
  const seqKey = { invoice: 'next_invoice_seq', quote: 'next_quote_seq', credit_note: 'next_credit_note_seq' }[doc.doc_type];
  const prefixKey = { invoice: 'invoice_prefix', quote: 'quote_prefix', credit_note: 'credit_note_prefix' }[doc.doc_type];
  const seq = fiscal[seqKey];
  const number = String(fiscal[prefixKey] || '').replace('{YYYY}', String(year)) + String(seq).padStart(4, '0');
  fiscal[seqKey] = seq + 1;
  setSetting('fiscal', fiscal);
  return number;
}

// ---- Liste & CRUD -----------------------------------------------------------
router.get('/documents', (req, res) => {
  refreshOverdue();
  const { type, status, year, client_id, q } = req.query;
  let sql = `SELECT d.*, c.name AS client_name FROM documents d
    LEFT JOIN clients c ON c.id = d.client_id WHERE 1=1`;
  const params = [];
  if (type) { sql += ' AND d.doc_type = ?'; params.push(type); }
  if (status) { sql += ' AND d.status = ?'; params.push(status); }
  if (year) { sql += " AND strftime('%Y', d.issue_date) = ?"; params.push(String(year)); }
  if (client_id) { sql += ' AND d.client_id = ?'; params.push(client_id); }
  if (q) { sql += ' AND (d.number LIKE ? OR c.name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY d.issue_date DESC, d.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/documents/:id', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable.' });
  res.json(withDetails(doc));
});

router.post('/documents', (req, res) => {
  const b = req.body;
  if (!['invoice', 'quote', 'credit_note'].includes(b.doc_type)) {
    return res.status(400).json({ error: 'Type de document invalide.' });
  }
  const client = b.client_id ? getClient.get(b.client_id) : null;
  const issue = b.issue_date || todayISO();
  const due = b.due_date || addDays(issue, client?.payment_days ?? getSetting('fiscal').default_payment_days);
  const info = db.prepare(`INSERT INTO documents
    (doc_type, client_id, issue_date, due_date, vat_regime, notes, related_doc_id)
    VALUES (?,?,?,?,?,?,?)`)
    .run(b.doc_type, b.client_id || null, issue, due, b.vat_regime || 'standard', b.notes || '', b.related_doc_id || null);
  saveLines(info.lastInsertRowid, b.lines);
  recomputeTotals(info.lastInsertRowid);
  res.json(withDetails(getDoc.get(info.lastInsertRowid)));
});

router.put('/documents/:id', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable.' });
  const b = req.body;
  const fields = ['client_id', 'issue_date', 'due_date', 'vat_regime', 'notes'].filter((f) => f in b);
  if (fields.length) {
    db.prepare(`UPDATE documents SET ${fields.map((f) => f + ' = ?').join(', ')} WHERE id = ?`)
      .run(...fields.map((f) => b[f]), doc.id);
  }
  if (b.lines) saveLines(doc.id, b.lines);
  recomputeTotals(doc.id);
  res.json(withDetails(getDoc.get(doc.id)));
});

router.delete('/documents/:id', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable.' });
  if (doc.status !== 'draft') {
    // Un document numéroté ne se supprime pas : on l'annule (piste d'audit).
    db.prepare("UPDATE documents SET status = 'cancelled' WHERE id = ?").run(doc.id);
    return res.json({ ok: true, cancelled: true });
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
  res.json({ ok: true });
});

// ---- Actions ------------------------------------------------------------------
router.post('/documents/:id/finalize', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable.' });
  if (doc.status !== 'draft') return res.status(400).json({ error: 'Déjà finalisé.' });
  const number = assignNumber(doc);
  const comm = doc.doc_type === 'invoice' ? structuredCommunication(doc.id * 97 + Number(number.replace(/\D/g, '').slice(-6) || 0)) : '';
  db.prepare("UPDATE documents SET number = ?, structured_comm = ?, status = 'sent', sent_at = datetime('now') WHERE id = ?")
    .run(number, comm, doc.id);
  res.json(withDetails(getDoc.get(doc.id)));
});

router.post('/documents/:id/status', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable.' });
  const { status } = req.body;
  const allowed = ['sent', 'paid', 'accepted', 'rejected', 'expired', 'cancelled', 'overdue'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
  db.prepare('UPDATE documents SET status = ?, payment_date = ? WHERE id = ?')
    .run(status, status === 'paid' ? (req.body.payment_date || todayISO()) : doc.payment_date, doc.id);
  res.json(withDetails(getDoc.get(doc.id)));
});

router.post('/documents/:id/duplicate', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable.' });
  const info = db.prepare(`INSERT INTO documents (doc_type, client_id, issue_date, due_date, vat_regime, notes)
    VALUES (?,?,?,?,?,?)`)
    .run(doc.doc_type, doc.client_id, todayISO(), addDays(todayISO(), 30), doc.vat_regime, doc.notes);
  const lines = getLines.all(doc.id);
  saveLines(info.lastInsertRowid, lines);
  recomputeTotals(info.lastInsertRowid);
  res.json(withDetails(getDoc.get(info.lastInsertRowid)));
});

/** Devis accepté -> facture brouillon. */
router.post('/documents/:id/convert', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc || doc.doc_type !== 'quote') return res.status(400).json({ error: 'Seul un devis peut être converti.' });
  const client = doc.client_id ? getClient.get(doc.client_id) : null;
  const info = db.prepare(`INSERT INTO documents (doc_type, client_id, issue_date, due_date, vat_regime, notes, related_doc_id)
    VALUES ('invoice',?,?,?,?,?,?)`)
    .run(doc.client_id, todayISO(), addDays(todayISO(), client?.payment_days ?? 30), doc.vat_regime, doc.notes, doc.id);
  saveLines(info.lastInsertRowid, getLines.all(doc.id));
  recomputeTotals(info.lastInsertRowid);
  db.prepare("UPDATE documents SET status = 'accepted' WHERE id = ?").run(doc.id);
  res.json(withDetails(getDoc.get(info.lastInsertRowid)));
});

/** Facture -> note de crédit (brouillon, mêmes lignes). */
router.post('/documents/:id/credit-note', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc || doc.doc_type !== 'invoice') return res.status(400).json({ error: 'Seule une facture peut être créditée.' });
  const info = db.prepare(`INSERT INTO documents (doc_type, client_id, issue_date, vat_regime, notes, related_doc_id)
    VALUES ('credit_note',?,?,?,?,?)`)
    .run(doc.client_id, todayISO(), doc.vat_regime, `Note de crédit sur facture ${doc.number}`, doc.id);
  saveLines(info.lastInsertRowid, getLines.all(doc.id));
  recomputeTotals(info.lastInsertRowid);
  res.json(withDetails(getDoc.get(info.lastInsertRowid)));
});

router.get('/documents/:id/pdf', async (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable.' });
  const client = doc.client_id ? getClient.get(doc.client_id) : null;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(doc.number || 'brouillon').replace(/[^\w-]/g, '_')}.pdf"`);
  await documentPdf(doc, getLines.all(doc.id), client, res);
});

router.get('/documents/:id/reminder-pdf', async (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc || doc.doc_type !== 'invoice') return res.status(400).json({ error: 'Rappel possible uniquement pour une facture.' });
  const count = doc.reminder_count + 1;
  db.prepare("UPDATE documents SET reminder_count = ?, last_reminder_at = datetime('now') WHERE id = ?").run(count, doc.id);
  const client = doc.client_id ? getClient.get(doc.client_id) : null;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="rappel-${count}-${(doc.number || '').replace(/[^\w-]/g, '_')}.pdf"`);
  await documentPdf(doc, getLines.all(doc.id), client, res, { reminder: { count } });
});

router.get('/documents/:id/ubl', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable.' });
  const client = doc.client_id ? getClient.get(doc.client_id) : null;
  const xml = buildUbl(doc, getLines.all(doc.id), client);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${(doc.number || 'brouillon').replace(/[^\w-]/g, '_')}-ubl.xml"`);
  res.send(xml);
});

// ---- Factures récurrentes -------------------------------------------------------
router.get('/recurring', (req, res) => {
  res.json(db.prepare(`SELECT r.*, c.name AS client_name FROM recurring_invoices r
    JOIN clients c ON c.id = r.client_id ORDER BY r.active DESC, r.next_date`).all());
});

router.post('/recurring', (req, res) => {
  const b = req.body;
  if (!b.client_id || !b.label || !b.next_date) return res.status(400).json({ error: 'Client, libellé et prochaine date obligatoires.' });
  const info = db.prepare(`INSERT INTO recurring_invoices (client_id, label, frequency, next_date, end_date, vat_regime, lines_json, notes)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(b.client_id, b.label, b.frequency || 'monthly', b.next_date, b.end_date || null,
      b.vat_regime || 'standard', JSON.stringify(b.lines || []), b.notes || '');
  res.json(db.prepare('SELECT * FROM recurring_invoices WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/recurring/:id', (req, res) => {
  const b = req.body;
  const fields = ['client_id', 'label', 'frequency', 'next_date', 'end_date', 'vat_regime', 'notes', 'active'].filter((f) => f in b);
  const sets = fields.map((f) => f + ' = ?');
  const vals = fields.map((f) => b[f]);
  if (b.lines) { sets.push('lines_json = ?'); vals.push(JSON.stringify(b.lines)); }
  if (sets.length) db.prepare(`UPDATE recurring_invoices SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
  res.json(db.prepare('SELECT * FROM recurring_invoices WHERE id = ?').get(req.params.id));
});

router.delete('/recurring/:id', (req, res) => {
  db.prepare('DELETE FROM recurring_invoices WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function nextDate(iso, frequency) {
  const d = new Date(iso + 'T00:00:00Z');
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3);
  else if (frequency === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/** Génère les factures (brouillons) des récurrences arrivées à échéance. */
function runRecurring() {
  const due = db.prepare(`SELECT * FROM recurring_invoices WHERE active = 1 AND next_date <= ?
    AND (end_date IS NULL OR end_date >= next_date)`).all(todayISO());
  let created = 0;
  for (const r of due) {
    const client = getClient.get(r.client_id);
    let cursor = r.next_date;
    // Rattrape toutes les échéances passées (ex. serveur éteint un mois).
    while (cursor <= todayISO() && (!r.end_date || cursor <= r.end_date)) {
      const info = db.prepare(`INSERT INTO documents (doc_type, client_id, issue_date, due_date, vat_regime, notes, recurring_id)
        VALUES ('invoice',?,?,?,?,?,?)`)
        .run(r.client_id, cursor, addDays(cursor, client?.payment_days ?? 30), r.vat_regime,
          r.notes || '', r.id);
      saveLines(info.lastInsertRowid, JSON.parse(r.lines_json));
      recomputeTotals(info.lastInsertRowid);
      created++;
      cursor = nextDate(cursor, r.frequency);
    }
    db.prepare('UPDATE recurring_invoices SET next_date = ?, last_generated = ? WHERE id = ?')
      .run(cursor, todayISO(), r.id);
  }
  return created;
}

router.post('/recurring/run', (req, res) => {
  res.json({ created: runRecurring() });
});

module.exports = { router, runRecurring, refreshOverdue };
