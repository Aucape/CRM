'use strict';
// Utilitaires spécifiques à la Belgique.

/** Valide un numéro de TVA belge (BE0xxxxxxxxx) via le checksum mod 97. */
function checkBelgianVat(raw) {
  const cleaned = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const m = cleaned.match(/^(?:BE)?([01]\d{9})$/);
  if (!m) return { valid: false, reason: 'Format attendu : BE0xxxxxxxxx (10 chiffres).' };
  const digits = m[1];
  const base = parseInt(digits.slice(0, 8), 10);
  const check = parseInt(digits.slice(8), 10);
  const expected = 97 - (base % 97);
  if (check !== expected) return { valid: false, reason: 'Checksum invalide (mod 97).' };
  return { valid: true, formatted: 'BE' + digits };
}

/** Génère une communication structurée belge +++xxx/xxxx/xxxxx+++ à partir d'un nombre. */
function structuredCommunication(seed) {
  const base = Math.abs(Math.trunc(seed)) % 9999999999;
  const baseStr = String(base).padStart(10, '0');
  let mod = parseInt(baseStr, 10) % 97;
  if (mod === 0) mod = 97;
  const full = baseStr + String(mod).padStart(2, '0');
  return `+++${full.slice(0, 3)}/${full.slice(3, 7)}/${full.slice(7)}+++`;
}

/** Payload EPC (QR de virement SEPA) pour paiement de facture. */
function epcQrPayload({ name, iban, bic, amount, communication }) {
  const cleanIban = String(iban || '').replace(/\s+/g, '');
  return [
    'BCD', '002', '1', 'SCT',
    (bic || '').replace(/\s+/g, ''),
    (name || '').slice(0, 70),
    cleanIban,
    'EUR' + Number(amount).toFixed(2),
    '', '',
    (communication || '').slice(0, 140),
  ].join('\n');
}

/** Déductibilité fiscale d'une voiture selon la formule CO2 belge (formule "gramme"). */
function carDeductibility({ co2, fuel = 'diesel' }) {
  const coeff = { diesel: 1, essence: 0.95, gaz: 0.9 }[fuel] ?? 1;
  if (!co2 || co2 <= 0) return { pct: 100, note: 'Véhicule 0 g CO2 : 100 % déductible.' };
  let pct = 120 - 0.5 * coeff * co2;
  pct = Math.min(100, Math.max(50, pct));
  if (co2 >= 200) pct = 40;
  return {
    pct: Math.round(pct * 100) / 100,
    note: 'Formule : 120 % − (0,5 % × coefficient carburant × CO2/km). Min 50 % (40 % si ≥ 200 g), max 100 %. ' +
      'Attention : pour les véhicules thermiques achetés depuis le 1/7/2023, la déductibilité diminue progressivement chaque année (régime de sortie).',
  };
}

/** Arrondi monétaire à 2 décimales. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

module.exports = { checkBelgianVat, structuredCommunication, epcQrPayload, carDeductibility, round2, todayISO, addDays };
