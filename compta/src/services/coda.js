'use strict';
// Parseur de fichiers CODA (extraits de compte bancaires belges, version 2.x).
// Extrait les mouvements : date, montant signé, contrepartie, communication.

function codaDate(s) {
  // DDMMYY -> YYYY-MM-DD
  if (!/^\d{6}$/.test(s)) return null;
  const dd = s.slice(0, 2), mm = s.slice(2, 4), yy = s.slice(4, 6);
  const year = Number(yy) > 69 ? '19' + yy : '20' + yy;
  return `${year}-${mm}-${dd}`;
}

function codaAmount(sign, digits) {
  // 15 chiffres, 3 décimales ; sign '0' = crédit, '1' = débit.
  const value = Number(digits) / 1000;
  return sign === '1' ? -value : value;
}

/** Parse le contenu texte d'un fichier CODA. Retourne { account, transactions[] }. */
function parseCoda(content) {
  const lines = String(content).split(/\r?\n/).filter((l) => l.length > 0);
  const transactions = [];
  let account = '';
  let current = null;

  const push = () => { if (current) { transactions.push(current); current = null; } };

  for (const line of lines) {
    const type = line[0];
    if (type === '1') {
      // Ancien solde — numéro de compte en positions 6-42 (structure variable).
      account = line.slice(5, 42).trim().split(/\s+/)[0] || account;
    } else if (type === '2') {
      const article = line[1];
      if (article === '1') {
        push();
        const sign = line[31];
        const amountDigits = line.slice(32, 47);
        const valueDate = codaDate(line.slice(47, 53));
        const commType = line[61];
        const communication = line.slice(62, 115).trim();
        const entryDate = codaDate(line.slice(115, 121));
        current = {
          date: entryDate || valueDate,
          value_date: valueDate,
          amount: codaAmount(sign, amountDigits),
          communication: commType === '1' ? formatStructured(communication) : communication,
          counterparty_name: '',
          counterparty_iban: '',
          bank_ref: line.slice(10, 31).trim(),
        };
      } else if (article === '2' && current) {
        const extra = line.slice(10, 63).trim();
        if (extra) current.communication = (current.communication + ' ' + extra).trim();
      } else if (article === '3' && current) {
        current.counterparty_iban = line.slice(10, 47).trim().split(/\s+/)[0] || '';
        current.counterparty_name = line.slice(47, 82).trim();
      }
    } else if (type === '3' && current) {
      // Informations complémentaires (3.1) — complète la communication.
      if (line[1] === '1') {
        const info = line.slice(39, 113).trim();
        if (info && !current.communication.includes(info)) {
          current.communication = (current.communication + ' ' + info).trim();
        }
      }
    } else if (type === '8' || type === '9') {
      push();
    }
  }
  push();
  return { account, transactions };
}

function formatStructured(comm) {
  // Communication structurée : 3 premiers chiffres = type, puis 12 chiffres OGM.
  const digits = comm.replace(/\D/g, '');
  if (digits.length >= 15) {
    const ogm = digits.slice(3, 15);
    return `+++${ogm.slice(0, 3)}/${ogm.slice(3, 7)}/${ogm.slice(7)}+++`;
  }
  if (digits.length >= 12) {
    return `+++${digits.slice(0, 3)}/${digits.slice(3, 7)}/${digits.slice(7, 12)}+++`;
  }
  return comm;
}

/** Parse un CSV bancaire générique : colonnes date, montant, contrepartie, communication. */
function parseBankCsv(content) {
  const lines = String(content).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { transactions: [] };
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const header = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase().trim());
  const idx = (names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = idx(['date', 'datum']);
  const iAmount = idx(['montant', 'amount', 'bedrag']);
  const iName = idx(['contrepartie', 'counterparty', 'nom', 'tegenpartij', 'name']);
  const iIban = idx(['iban', 'compte', 'rekening', 'account']);
  const iComm = idx(['communication', 'mededeling', 'libell', 'description', 'detail']);
  if (iDate < 0 || iAmount < 0) throw new Error('CSV non reconnu : colonnes date/montant introuvables.');

  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], sep);
    const rawDate = (cols[iDate] || '').trim();
    let date = rawDate;
    const dm = rawDate.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dm) date = `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
    const amount = Number((cols[iAmount] || '0').replace(/\./g, sep === ';' ? '' : '.').replace(/\s/g, '').replace(',', '.'));
    if (!date || Number.isNaN(amount)) continue;
    transactions.push({
      date,
      amount,
      counterparty_name: iName >= 0 ? (cols[iName] || '').trim() : '',
      counterparty_iban: iIban >= 0 ? (cols[iIban] || '').trim() : '',
      communication: iComm >= 0 ? (cols[iComm] || '').trim() : '',
    });
  }
  return { transactions };
}

function splitCsvLine(line, sep) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === sep && !inQuotes) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

module.exports = { parseCoda, parseBankCsv };
