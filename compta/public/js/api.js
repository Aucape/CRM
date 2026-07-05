'use strict';
// Client API + helpers de formatage.

async function api(path, options = {}) {
  const opts = { headers: {}, ...options };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch('/api' + path, opts);
  if (!res.ok) {
    let msg = 'Erreur ' + res.status;
    try { msg = (await res.json()).error || msg; } catch { /* réponse non JSON */ }
    throw new Error(msg);
  }
  return res.json();
}

const fmt = {
  eur(n) {
    return Number(n || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  },
  date(iso) {
    if (!iso) return '—';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  },
  pct(n) { return Number(n || 0).toLocaleString('fr-BE', { maximumFractionDigits: 2 }) + ' %'; },
};

function esc(s) {
  return String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

const STATUS_LABELS = {
  draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', overdue: 'En retard',
  accepted: 'Accepté', rejected: 'Refusé', expired: 'Expiré', cancelled: 'Annulé',
  new: 'À vérifier', matched: 'Rapproché', ignored: 'Ignoré', filed: 'Déposée',
};

const REGIME_LABELS = {
  standard: 'TVA belge (21/12/6/0 %)',
  cocontractant: 'Cocontractant (autoliquidation)',
  intracom_services: 'Intracom — services (UE, B2B)',
  intracom_goods: 'Intracom — biens (UE, B2B)',
  export: 'Export hors UE',
  franchise: 'Franchise (art. 56bis)',
  exempt: 'Exempté (art. 44)',
};

function badge(status) {
  return `<span class="badge ${esc(status)}">${esc(STATUS_LABELS[status] || status)}</span>`;
}
