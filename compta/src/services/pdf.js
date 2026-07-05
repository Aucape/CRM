'use strict';
// Génération de PDF : factures, devis, notes de crédit et rappels de paiement.
// Mise en page A4 avec QR de virement SEPA (EPC) pour paiement en un scan.

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const { getSetting } = require('../db');
const { computeTotals } = require('./vat');
const { epcQrPayload } = require('./belgium');

const TYPE_LABELS = { invoice: 'FACTURE', quote: 'DEVIS', credit_note: 'NOTE DE CRÉDIT' };
const GREY = '#6b7280';
const DARK = '#111827';
const ACCENT = '#1d4ed8';

function eur(n) {
  // Formatage manuel : les espaces insécables de toLocaleString ne sont pas
  // encodables en WinAnsi (police Helvetica de pdfkit).
  const neg = Number(n) < 0;
  const [int, dec] = Math.abs(Number(n)).toFixed(2).split('.');
  return (neg ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec + ' €';
}

function frDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Génère le PDF d'un document et écrit dans le stream fourni. */
async function documentPdf(doc, lines, client, res, { reminder = null } = {}) {
  const company = getSetting('company');
  const fiscal = getSetting('fiscal');
  const totals = computeTotals(lines, doc.vat_regime);
  const pdf = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  pdf.pipe(res);

  // --- En-tête ---------------------------------------------------------
  let y = 50;
  if (company.logo_path && fs.existsSync(company.logo_path)) {
    try { pdf.image(company.logo_path, 50, y, { fit: [120, 60] }); } catch { /* logo illisible */ }
  }
  pdf.font('Helvetica-Bold').fontSize(16).fillColor(DARK).text(company.name || 'Mon entreprise', 50, y + (company.logo_path ? 65 : 0));
  pdf.font('Helvetica').fontSize(9).fillColor(GREY);
  const companyInfo = [
    company.address, `${company.zip} ${company.city}`.trim(), company.vat_number ? 'TVA : ' + company.vat_number : '',
    company.email, company.phone, company.iban ? 'IBAN : ' + company.iban : '',
  ].filter(Boolean);
  pdf.text(companyInfo.join('\n'), 50, pdf.y + 4);

  const title = reminder ? `RAPPEL DE PAIEMENT n°${reminder.count}` : (TYPE_LABELS[doc.doc_type] || 'DOCUMENT');
  pdf.font('Helvetica-Bold').fontSize(22).fillColor(reminder ? '#b91c1c' : ACCENT)
    .text(title, 300, 50, { width: 245, align: 'right' });
  pdf.font('Helvetica').fontSize(10).fillColor(DARK)
    .text(`N° ${doc.number || 'Brouillon'}`, 300, pdf.y + 6, { width: 245, align: 'right' })
    .text(`Date : ${frDate(doc.issue_date)}`, 300, pdf.y + 2, { width: 245, align: 'right' });
  if (doc.doc_type !== 'credit_note' && doc.due_date) {
    pdf.text(`Échéance : ${frDate(doc.due_date)}`, 300, pdf.y + 2, { width: 245, align: 'right' });
  }

  // --- Client ----------------------------------------------------------
  y = Math.max(pdf.y, 180);
  pdf.font('Helvetica-Bold').fontSize(9).fillColor(GREY).text(doc.doc_type === 'quote' ? 'DEVIS POUR' : 'FACTURÉ À', 320, y);
  pdf.font('Helvetica-Bold').fontSize(11).fillColor(DARK).text(client?.name || '—', 320, pdf.y + 3);
  pdf.font('Helvetica').fontSize(9).fillColor(GREY);
  const clientInfo = [
    client?.address, `${client?.zip || ''} ${client?.city || ''}`.trim(),
    client?.country && client.country !== 'BE' ? client.country : '',
    client?.vat_number ? 'TVA : ' + client.vat_number : '',
  ].filter(Boolean);
  pdf.text(clientInfo.join('\n'), 320, pdf.y + 2);

  // --- Tableau des lignes ------------------------------------------------
  y = Math.max(pdf.y + 30, 275);
  const cols = { desc: 50, qty: 320, pu: 375, vat: 445, total: 480 };
  pdf.rect(50, y - 6, 495, 20).fill('#eef2ff');
  pdf.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK);
  pdf.text('DESCRIPTION', cols.desc + 6, y);
  pdf.text('QTÉ', cols.qty, y, { width: 45, align: 'right' });
  pdf.text('P.U. HTVA', cols.pu, y, { width: 60, align: 'right' });
  pdf.text('TVA', cols.vat, y, { width: 30, align: 'right' });
  pdf.text('TOTAL HTVA', cols.total, y, { width: 65, align: 'right' });
  y += 22;

  pdf.font('Helvetica').fontSize(9.5);
  const zeroVat = totals.total_vat === 0 && totals.mention;
  for (const l of lines) {
    const excl = Number(l.quantity) * Number(l.unit_price) * (1 - Number(l.discount_pct || 0) / 100);
    const descH = pdf.heightOfString(l.description, { width: 260 });
    if (y + descH > 700) { pdf.addPage(); y = 60; }
    pdf.fillColor(DARK).text(l.description, cols.desc + 6, y, { width: 260 });
    pdf.text(String(Number(l.quantity)) + (l.unit ? ' ' + l.unit : ''), cols.qty, y, { width: 45, align: 'right' });
    pdf.text(eur(l.unit_price), cols.pu, y, { width: 60, align: 'right' });
    pdf.text(zeroVat ? '0%' : Number(l.vat_rate) + '%', cols.vat, y, { width: 30, align: 'right' });
    pdf.text(eur(excl), cols.total, y, { width: 65, align: 'right' });
    if (Number(l.discount_pct)) {
      y += Math.max(descH, 12);
      pdf.fontSize(8).fillColor(GREY).text(`Remise ${l.discount_pct}%`, cols.desc + 6, y);
      pdf.fontSize(9.5);
      y += 12;
    } else {
      y += Math.max(descH, 12) + 4;
    }
    pdf.moveTo(50, y - 2).lineTo(545, y - 2).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
    y += 4;
  }

  // --- Totaux ------------------------------------------------------------
  if (y > 620) { pdf.addPage(); y = 60; }
  y += 6;
  const totX = 360;
  pdf.font('Helvetica').fontSize(10).fillColor(DARK);
  pdf.text('Total HTVA', totX, y); pdf.text(eur(totals.total_excl), 460, y, { width: 85, align: 'right' });
  y += 16;
  for (const [rate, v] of Object.entries(totals.by_rate)) {
    if (Number(rate) === 0) continue;
    pdf.text(`TVA ${rate}%`, totX, y); pdf.text(eur(v.vat), 460, y, { width: 85, align: 'right' });
    y += 16;
  }
  pdf.rect(totX - 8, y - 4, 193, 24).fill('#eef2ff');
  pdf.font('Helvetica-Bold').fontSize(12).fillColor(ACCENT);
  pdf.text(doc.doc_type === 'credit_note' ? 'Total à créditer' : 'Total TVAC', totX, y);
  pdf.text(eur(totals.total_incl), 430, y, { width: 115, align: 'right' });
  y += 34;

  if (totals.mention) {
    pdf.font('Helvetica-Oblique').fontSize(8.5).fillColor(GREY).text(totals.mention, 50, y, { width: 495 });
    y = pdf.y + 8;
  }

  // --- Paiement + QR (factures uniquement) --------------------------------
  if (doc.doc_type === 'invoice' && company.iban) {
    const qrPayload = epcQrPayload({
      name: company.name, iban: company.iban, bic: company.bic,
      amount: totals.total_incl,
      communication: doc.structured_comm || doc.number,
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 0, width: 200 });
    const qrBuf = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    if (y > 640) { pdf.addPage(); y = 60; }
    pdf.rect(50, y, 495, 92).lineWidth(1).strokeColor('#dbeafe').stroke();
    pdf.image(qrBuf, 60, y + 10, { fit: [72, 72] });
    pdf.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text('Paiement par virement', 145, y + 12);
    pdf.font('Helvetica').fontSize(9).fillColor(GREY).text(
      `IBAN : ${company.iban}${company.bic ? '   BIC : ' + company.bic : ''}\n` +
      `Montant : ${eur(totals.total_incl)}\n` +
      `Communication : ${doc.structured_comm || doc.number}\n` +
      'Scannez le QR code avec votre app bancaire pour payer en un instant.',
      145, pdf.y + 3, { width: 380 });
    y += 100;
  }

  if (reminder) {
    if (y > 640) { pdf.addPage(); y = 60; }
    pdf.font('Helvetica-Bold').fontSize(10).fillColor('#b91c1c')
      .text(`Sauf erreur de notre part, la facture ${doc.number} de ${eur(totals.total_incl)} échue le ${frDate(doc.due_date)} reste impayée.`, 50, y, { width: 495 });
    pdf.font('Helvetica').fontSize(9).fillColor(DARK)
      .text('Nous vous prions de bien vouloir régulariser la situation dans les plus brefs délais. Si le paiement a déjà été effectué, veuillez ne pas tenir compte de ce rappel.', 50, pdf.y + 4, { width: 495 });
    y = pdf.y + 10;
  }

  if (doc.notes) {
    pdf.font('Helvetica').fontSize(9).fillColor(GREY).text(doc.notes, 50, y + 6, { width: 495 });
  }

  // --- Pied de page --------------------------------------------------------
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    const footer = [
      fiscal.invoice_footer,
      doc.doc_type === 'quote' ? 'Devis valable 30 jours. Sous réserve d’acceptation.' : '',
      `${company.name || ''} — ${company.vat_number || ''}`,
    ].filter(Boolean).join('\n');
    // margin bottom à 0 pour éviter qu'écrire dans la zone de pied de page
    // déclenche une nouvelle page automatique.
    pdf.page.margins.bottom = 0;
    pdf.font('Helvetica').fontSize(7.5).fillColor(GREY)
      .text(footer, 50, 800, { width: 495, align: 'center', height: 40 });
    pdf.page.margins.bottom = 50;
  }
  pdf.end();
}

module.exports = { documentPdf };
