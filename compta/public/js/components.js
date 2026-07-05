'use strict';
// Composants UI : modal, toast, graphique à barres groupées.

function toast(message, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.remove(), isError ? 6000 : 3200);
}

/** Ouvre une modale. Retourne { close }. onSubmit reçoit le <form> si présent. */
function openModal(html, { wide = false, onSubmit = null } = {}) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal${wide ? ' wide' : ''}">${html}</div>`;
  root.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  const form = backdrop.querySelector('form');
  if (form && onSubmit) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        await onSubmit(form, close);
      } catch (err) {
        toast(err.message, true);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }
  return { close, el: backdrop };
}

function confirmModal(message, onConfirm) {
  openModal(`
    <h2>Confirmation</h2>
    <p>${esc(message)}</p>
    <form>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Annuler</button>
        <button type="submit" class="btn danger">Confirmer</button>
      </div>
    </form>
  `, { onSubmit: async (f, close) => { close(); await onConfirm(); } });
}

function formValues(form) {
  const out = {};
  new FormData(form).forEach((v, k) => { out[k] = v; });
  return out;
}

/**
 * Graphique à barres groupées (2 séries) : revenus vs dépenses par mois.
 * Légende + tooltip au survol (les couleurs seules ne portent jamais l'info).
 */
function barChart(container, months, { s1Label = 'Revenus HTVA', s2Label = 'Dépenses HTVA' } = {}) {
  const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const max = Math.max(1, ...months.map((m) => Math.max(m.revenue, m.expenses)));
  container.innerHTML = `
    <div class="chart">
      <div class="chart-legend">
        <span><span class="dot" style="background:var(--series-1)"></span>${esc(s1Label)}</span>
        <span><span class="dot" style="background:var(--series-2)"></span>${esc(s2Label)}</span>
      </div>
      <div class="chart-plot">
        ${months.map((m, i) => `
          <div class="chart-month" data-i="${i}">
            <div class="chart-bar s1" style="height:${Math.round((m.revenue / max) * 100)}%"></div>
            <div class="chart-bar s2" style="height:${Math.round((m.expenses / max) * 100)}%"></div>
          </div>`).join('')}
      </div>
      <div class="chart-labels">${months.map((m, i) => `<span>${MONTH_NAMES[i]}</span>`).join('')}</div>
    </div>`;
  const chart = container.querySelector('.chart');
  let tip = null;
  chart.querySelectorAll('.chart-month').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      const m = months[Number(el.dataset.i)];
      tip = document.createElement('div');
      tip.className = 'chart-tooltip';
      tip.innerHTML = `<b>${MONTH_NAMES[Number(el.dataset.i)]}</b>${esc(s1Label)} : ${fmt.eur(m.revenue)}<br>${esc(s2Label)} : ${fmt.eur(m.expenses)}`;
      chart.appendChild(tip);
      const r = el.getBoundingClientRect();
      const cr = chart.getBoundingClientRect();
      tip.style.left = (r.left - cr.left + r.width / 2) + 'px';
      tip.style.top = (r.top - cr.top) + 'px';
    });
    el.addEventListener('mouseleave', () => { if (tip) { tip.remove(); tip = null; } });
  });
}

/** Sélecteur d'année simple. */
function yearSelector(current, onChange, from = 2020) {
  const now = new Date().getFullYear();
  const opts = [];
  for (let y = now + 1; y >= from; y--) opts.push(`<option value="${y}" ${y === current ? 'selected' : ''}>${y}</option>`);
  const sel = document.createElement('select');
  sel.innerHTML = opts.join('');
  sel.style.width = 'auto';
  sel.addEventListener('change', () => onChange(Number(sel.value)));
  return sel;
}
