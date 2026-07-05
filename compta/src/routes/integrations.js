'use strict';
// Routes : scan IA de justificatifs, import de factures UBL reçues (Peppol),
// envoi de factures via un point d'accès Peppol.

const express = require('express');
const multer = require('multer');
const { db } = require('../db');
const { scanReceipt } = require('../services/ai');
const { parseInboundUbl, sendUbl } = require('../services/peppol');
const { buildUbl } = require('../services/ubl');
const { round2 } = require('../services/belgium');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ---- Scan IA d'un justificatif ------------------------------------------------
router.post('/ai/scan-receipt', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier requis.' });
    const mime = req.file.mimetype;
    if (!mime.startsWith('image/') && mime !== 'application/pdf') {
      return res.status(400).json({ error: 'Formats acceptés : photo (JPEG/PNG/WebP) ou PDF.' });
    }
    const categories = db.prepare('SELECT id, name FROM expense_categories ORDER BY name').all();
    const result = await scanReceipt(req.file.buffer, mime, categories.map((c) => c.name));
    const matched = categories.find((c) => c.name === result.category)
      || categories.find((c) => c.name.toLowerCase().includes(String(result.category || '').toLowerCase()));
    res.json({ ...result, category_id: matched?.id || null });
  } catch (e) { next(e); }
});

// ---- Peppol : import d'une facture UBL reçue -----------------------------------
router.post('/peppol/import-ubl', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis.' });
  let parsed;
  try {
    parsed = parseInboundUbl(req.file.buffer.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  // Détection de doublon : même fournisseur, même montant, même date.
  const dup = db.prepare(`SELECT id FROM expenses
    WHERE supplier = ? AND ABS(amount_incl - ?) < 0.01 AND expense_date = ?`)
    .get(parsed.supplier, parsed.amount_incl, parsed.issue_date);
  if (dup) return res.status(409).json({ error: `Cette facture semble déjà encodée (dépense n°${dup.id}).`, expense_id: dup.id });

  const info = db.prepare(`INSERT INTO expenses
    (supplier, supplier_vat, description, expense_date, amount_excl, vat_amount, amount_incl,
     professional_pct, income_deduct_pct, vat_deduct_pct, vat_regime, payment_method, notes)
    VALUES (?,?,?,?,?,?,?,100,100,100,'domestic','bank',?)`)
    .run(parsed.supplier || 'Fournisseur Peppol',
      parsed.supplier_vat || '',
      `Facture ${parsed.number}${parsed.doc_type === 'credit_note' ? ' (note de crédit)' : ''}`,
      parsed.issue_date || new Date().toISOString().slice(0, 10),
      round2(parsed.amount_excl), round2(parsed.vat_amount), round2(parsed.amount_incl),
      parsed.payment_ref ? 'Communication : ' + parsed.payment_ref : '');
  res.json({
    ok: true, parsed,
    expense: db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid),
    hint: 'Vérifiez la catégorie et les % de déductibilité dans Dépenses.',
  });
});

// ---- Peppol : envoi d'une facture via le point d'accès ---------------------------
router.post('/documents/:id/peppol-send', async (req, res, next) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document introuvable.' });
    if (doc.status === 'draft') return res.status(400).json({ error: 'Finalisez la facture avant de l\'envoyer sur Peppol.' });
    const lines = db.prepare('SELECT * FROM document_lines WHERE document_id = ? ORDER BY position, id').all(doc.id);
    const client = doc.client_id ? db.prepare('SELECT * FROM clients WHERE id = ?').get(doc.client_id) : null;
    const xml = buildUbl(doc, lines, client);
    const result = await sendUbl(xml, { clientPeppolId: client?.peppol_id, clientVat: client?.vat_number });
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

module.exports = router;
