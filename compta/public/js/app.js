'use strict';
// Routeur de l'application (hash routing).

const ROUTES = {
  dashboard: viewDashboard,
  invoices: viewInvoices,
  quotes: viewQuotes,
  recurring: viewRecurring,
  clients: viewClients,
  products: viewProducts,
  expenses: viewExpenses,
  assets: viewAssets,
  bank: viewBank,
  vat: viewVat,
  taxes: viewTaxes,
  calendar: viewCalendar,
  reports: viewReports,
  settings: viewSettings,
};

async function route() {
  const hash = location.hash.slice(2) || 'dashboard';
  const [name, query] = hash.split('?');
  const params = new URLSearchParams(query || '');
  const view = ROUTES[name] || viewDashboard;
  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === name);
  });
  const main = document.getElementById('main');
  try {
    await view(main, params);
  } catch (e) {
    main.innerHTML = `<div class="card"><div class="empty">⚠️ ${esc(e.message)}</div></div>`;
  }
  main.scrollTop = 0;
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
