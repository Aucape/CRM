'use strict';
// Tableau de bord : chiffres clés, "à mettre de côté", graphique revenus/dépenses.

async function viewDashboard(main) {
  const year = new Date().getFullYear();
  const d = await api('/dashboard?year=' + year);
  const cal = await api('/calendar?year=' + year);
  const upcoming = cal.filter((e) => !e.passed).slice(0, 4);

  main.innerHTML = `
    <div class="page-header">
      <div><h1>Tableau de bord ${year}</h1>
        <div class="sub">Votre activité en un coup d'œil — tout est calculé en temps réel.</div></div>
      <div class="header-actions">
        <a class="btn primary" href="#/invoices?new=1">+ Nouvelle facture</a>
        <a class="btn" href="#/expenses?new=1">+ Dépense</a>
      </div>
    </div>

    <div class="grid grid-4">
      <div class="stat accent"><div class="label">Revenus ${year} (HTVA)</div>
        <div class="value">${fmt.eur(d.revenue_total)}</div>
        <div class="detail">Bénéfice brut : ${fmt.eur(d.profit)}</div></div>
      <div class="stat"><div class="label">Dépenses ${year} (HTVA, part pro)</div>
        <div class="value">${fmt.eur(d.expenses_total)}</div></div>
      <div class="stat warn"><div class="label">💰 À mettre de côté (impôts + cotisations)</div>
        <div class="value">${fmt.eur(d.tax_to_set_aside)}</div>
        <div class="detail">≈ ${fmt.pct(d.effective_rate_pct)} de vos revenus</div></div>
      <div class="stat ${d.net_in_pocket >= 0 ? 'good' : 'bad'}"><div class="label">Net estimé en poche</div>
        <div class="value">${fmt.eur(d.net_in_pocket)}</div>
        <div class="detail">Après frais, cotisations et impôts</div></div>
    </div>

    <div class="grid grid-4" style="margin-top:14px">
      <div class="stat"><div class="label">Factures en attente</div>
        <div class="value">${fmt.eur(d.outstanding.total)}</div>
        <div class="detail">${d.outstanding.n} facture(s) envoyée(s)</div></div>
      <div class="stat ${d.overdue.n ? 'bad' : ''}"><div class="label">En retard de paiement</div>
        <div class="value">${fmt.eur(d.overdue.total)}</div>
        <div class="detail">${d.overdue.n} facture(s) — <a href="#/invoices?status=overdue">envoyer un rappel</a></div></div>
      <div class="stat ${d.vat_period.credit ? 'good' : ''}"><div class="label">TVA ${d.vat_period.period} ${d.vat_period.year} ${d.vat_period.credit ? '(crédit)' : 'à payer'}</div>
        <div class="value">${fmt.eur(d.vat_period.credit || d.vat_period.due)}</div>
        <div class="detail"><a href="#/vat">Voir la déclaration</a></div></div>
      <div class="stat ${d.bank_to_review ? 'warn' : ''}"><div class="label">Transactions à vérifier</div>
        <div class="value">${d.bank_to_review}</div>
        <div class="detail"><a href="#/bank">Rapprochement bancaire</a></div></div>
    </div>

    <div class="grid grid-2" style="margin-top:16px; align-items:start">
      <div class="card"><h2>Revenus vs dépenses par mois</h2><div id="chart"></div>
        <div class="hint" style="margin-top:8px">Survolez un mois pour les montants exacts. Détail chiffré dans <a href="#/reports">Rapports</a>.</div></div>
      <div class="card"><h2>📅 Prochaines échéances</h2>
        ${upcoming.length ? `<table><tbody>${upcoming.map((e) => `
          <tr><td class="mono">${fmt.date(e.date)}</td><td>${esc(e.label)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucune échéance à venir.</div>'}
        <div style="margin-top:10px"><a class="btn small" href="#/calendar">Calendrier complet</a></div>
        ${d.draft_count ? `<div class="coach" style="margin-top:14px"><span class="icon">📝</span><span>Vous avez <b>${d.draft_count} brouillon(s)</b> non finalisé(s). Pensez à les valider pour qu'ils comptent dans votre comptabilité.</span></div>` : ''}
      </div>
    </div>`;

  barChart(document.getElementById('chart'), d.months);
}
