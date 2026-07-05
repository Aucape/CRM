'use strict';
// TVA, impôts & cotisations, calendrier fiscal, rapports.

const GRID_LABELS = {
  '00': 'Opérations à 0 % / régimes particuliers', '01': 'Base à 6 %', '02': 'Base à 12 %', '03': 'Base à 21 %',
  44: 'Services intracom (B2B UE)', 45: 'Cocontractant', 46: 'Livraisons intracom exemptées',
  47: 'Exportations hors UE', 48: 'NC émises (intracom)', 49: 'NC émises (autres)',
  54: 'TVA due sur 01/02/03', 55: 'TVA due — acquisitions intracom (86/88)', 56: 'TVA due — cocontractant (87)',
  57: 'TVA due — importations', 59: 'TVA déductible', 61: 'Régularisations dues', 62: 'Régularisations à récupérer',
  63: 'TVA à reverser (NC reçues)', 64: 'TVA à récupérer (NC émises)',
  71: '✅ TVA à payer à l’État', 72: '💶 Crédit de TVA en votre faveur',
  81: 'Achats marchandises', 82: 'Achats services & biens divers', 83: 'Achats biens d’investissement',
  86: 'Acquisitions intracom — biens', 87: 'Autres opérations avec report', 88: 'Acquisitions intracom — services',
};

async function viewVat(main, params) {
  const now = new Date();
  const settings = await api('/settings');
  const isMonthly = settings.fiscal.vat_periodicity === 'monthly';
  const defPeriod = isMonthly ? 'M' + String(now.getMonth() + 1).padStart(2, '0') : 'Q' + (Math.floor(now.getMonth() / 3) + 1);
  const year = Number(params.get('year')) || now.getFullYear();
  const period = params.get('period') || defPeriod;

  if (settings.fiscal.vat_regime !== 'assujetti') {
    const franchise = await api('/vat/franchise-status?year=' + year);
    main.innerHTML = `
      <div class="page-header"><div><h1>TVA — régime ${settings.fiscal.vat_regime === 'franchise' ? 'de franchise' : 'exempté'}</h1>
        <div class="sub">Pas de déclaration périodique à déposer dans votre régime.</div></div></div>
      <div class="card">
        <h2>Suivi du plafond de franchise (${fmt.eur(franchise.threshold)} de CA/an)</h2>
        <div class="progress" style="margin:10px 0"><div class="${franchise.pct_used > 100 ? 'over' : franchise.pct_used > 80 ? 'warn' : ''}" style="width:${Math.min(franchise.pct_used, 100)}%"></div></div>
        <p>CA ${year} : <b>${fmt.eur(franchise.revenue)}</b> — ${fmt.pct(franchise.pct_used)} du plafond.</p>
        ${franchise.exceeded ? '<div class="coach"><span class="icon">⚠️</span><span><b>Plafond dépassé !</b> Vous devez passer au régime TVA normal : contactez votre bureau de TVA. Modifiez votre régime dans Paramètres.</span></div>'
        : franchise.pct_used > 80 ? '<div class="coach"><span class="icon">⚠️</span><span>Vous approchez du plafond de franchise. Anticipez le passage au régime normal.</span></div>' : ''}
      </div>`;
    return;
  }

  const d = await api(`/vat/declaration?year=${year}&period=${period}`);
  const periods = isMonthly
    ? Array.from({ length: 12 }, (_, i) => 'M' + String(i + 1).padStart(2, '0'))
    : ['Q1', 'Q2', 'Q3', 'Q4'];

  main.innerHTML = `
    <div class="page-header">
      <div><h1>Déclaration TVA</h1>
        <div class="sub">Calculée en temps réel depuis vos factures et dépenses — grilles officielles, XML prêt pour Intervat.</div></div>
      <div class="header-actions">
        <select id="sel-year" style="width:auto"></select>
        <select id="sel-period" style="width:auto">${periods.map((p) => `<option ${p === period ? 'selected' : ''}>${p}</option>`).join('')}</select>
        <a class="btn" href="/api/vat/declaration/intervat.xml?year=${year}&period=${period}">⬇️ XML Intervat</a>
        ${d.saved_status !== 'filed' ? `<button class="btn primary" id="mark-filed">✅ Marquer déposée</button>` : ''}
      </div>
    </div>
    <div class="grid grid-3">
      <div class="stat ${d.grids['71'] ? 'warn' : ''}"><div class="label">TVA à payer (grille 71)</div>
        <div class="value">${fmt.eur(d.grids['71'] || 0)}</div>
        <div class="detail">Période du ${fmt.date(d.from)} au ${fmt.date(d.to)}</div></div>
      <div class="stat ${d.grids['72'] ? 'good' : ''}"><div class="label">Crédit TVA (grille 72)</div>
        <div class="value">${fmt.eur(d.grids['72'] || 0)}</div></div>
      <div class="stat"><div class="label">Statut</div>
        <div class="value" style="font-size:16px">${d.saved_status === 'filed' ? badge('filed') + ' le ' + fmt.date(d.filed_at) : badge('pending')}</div>
        <div class="detail">Déposez sur <a href="https://finances.belgium.be/fr/E-services/Intervat" target="_blank">Intervat</a> avant le ${isMonthly ? 20 : 25} du mois suivant.</div></div>
    </div>
    <div class="grid grid-2" style="margin-top:14px; align-items:start">
      <div class="card"><h2>Grilles de la déclaration</h2>
        ${Object.keys(d.grids).length ? `<table><thead><tr><th>Grille</th><th>Libellé</th><th class="num">Montant</th></tr></thead>
        <tbody>${Object.entries(d.grids).map(([g, v]) => `<tr ${g === '71' || g === '72' ? 'style="font-weight:700"' : ''}>
          <td class="mono">${g}</td><td>${GRID_LABELS[g] || ''}</td><td class="num">${fmt.eur(v)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Aucune opération sur cette période.</div>'}
      </div>
      <div>
        <div class="card"><h2>📄 Listing clients annuel</h2>
          <p class="hint">Clients belges assujettis avec plus de 250 € de CA — à déposer avant le 31 mars.</p>
          <div style="display:flex; gap:8px">
            <button class="btn" id="show-listing">Voir ${year - 1}</button>
            <a class="btn" href="/api/vat/client-listing.xml?year=${year - 1}">⬇️ XML Intervat</a>
          </div>
          <div id="listing-result" style="margin-top:10px"></div>
        </div>
        <div class="card"><h2>🇪🇺 Relevé intracommunautaire</h2>
          <p class="hint">À déposer si vous avez facturé des clients UE en autoliquidation (grilles 44/46).</p>
          <div style="display:flex; gap:8px">
            <button class="btn" id="show-intracom">Voir ${period}</button>
            <a class="btn" href="/api/vat/intracom.xml?year=${year}&period=${period}">⬇️ XML Intervat</a>
          </div>
          <div id="intracom-result" style="margin-top:10px"></div>
        </div>
      </div>
    </div>`;

  const selYear = document.getElementById('sel-year');
  selYear.replaceWith(yearSelector(year, (y) => { location.hash = `#/vat?year=${y}&period=${period}`; }));
  document.getElementById('sel-period').addEventListener('change', (e) => {
    location.hash = `#/vat?year=${year}&period=${e.target.value}`;
  });
  document.getElementById('mark-filed')?.addEventListener('click', async () => {
    await api('/vat/declaration/file', { method: 'POST', body: { year, period } });
    toast('Déclaration marquée comme déposée.'); viewVat(main, params);
  });
  document.getElementById('show-listing').addEventListener('click', async () => {
    const r = await api('/vat/client-listing?year=' + (year - 1));
    document.getElementById('listing-result').innerHTML = r.clients.length
      ? `<table><thead><tr><th>Client</th><th>TVA</th><th class="num">CA</th><th class="num">TVA</th></tr></thead>
        <tbody>${r.clients.map((c) => `<tr><td>${esc(c.name)}</td><td class="mono">${esc(c.vat_number)}</td>
        <td class="num">${fmt.eur(c.turnover)}</td><td class="num">${fmt.eur(c.vat)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="hint">Aucun client à reprendre (listing néant à indiquer dans la dernière déclaration).</div>';
  });
  document.getElementById('show-intracom').addEventListener('click', async () => {
    const r = await api(`/vat/intracom?year=${year}&period=${period}`);
    document.getElementById('intracom-result').innerHTML = r.rows.length
      ? `<table><thead><tr><th>Client</th><th>TVA</th><th>Code</th><th class="num">Montant</th></tr></thead>
        <tbody>${r.rows.map((c) => `<tr><td>${esc(c.name)}</td><td class="mono">${esc(c.vat_number)}</td>
        <td>${c.code === 'L' ? 'L (biens)' : 'S (services)'}</td><td class="num">${fmt.eur(c.amount)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="hint">Aucune opération intracommunautaire sur la période.</div>';
  });
}

// ---------- Impôts & cotisations ----------
async function viewTaxes(main, params) {
  const year = Number(params.get('year')) || new Date().getFullYear();
  const t = await api('/tax/estimate?year=' + year);

  main.innerHTML = `
    <div class="page-header">
      <div><h1>Impôts &amp; cotisations sociales</h1>
        <div class="sub">Estimation en temps réel (personne physique) — barèmes « ${esc(t.params_label)} », modifiables dans Paramètres.</div></div>
      <div class="header-actions"><span id="year-slot"></span></div>
    </div>
    <div class="grid grid-4">
      <div class="stat warn"><div class="label">💰 Total à mettre de côté</div>
        <div class="value">${fmt.eur(t.total_to_set_aside)}</div>
        <div class="detail">≈ ${fmt.pct(t.effective_rate_pct)} de votre CA</div></div>
      <div class="stat"><div class="label">Impôt estimé (IPP + communaux)</div>
        <div class="value">${fmt.eur(t.total_tax)}</div>
        <div class="detail">État : ${fmt.eur(t.state_tax)} + commune : ${fmt.eur(t.communal_tax)}</div></div>
      <div class="stat"><div class="label">Cotisations sociales estimées</div>
        <div class="value">${fmt.eur(t.social_estimated.total)}</div>
        <div class="detail">≈ ${fmt.eur(t.quarterly_social)} / trimestre</div></div>
      <div class="stat ${t.net_in_pocket >= 0 ? 'good' : 'bad'}"><div class="label">Net estimé en poche</div>
        <div class="value">${fmt.eur(t.net_in_pocket)}</div></div>
    </div>

    <div class="grid grid-2" style="margin-top:14px; align-items:start">
      <div class="card">
        <h2>Détail du calcul</h2>
        <table><tbody>
          <tr><td>Chiffre d'affaires ${year} (HTVA)</td><td class="num">${fmt.eur(t.revenue)}</td></tr>
          <tr><td>Frais professionnels ${t.used_method === 'forfait' ? '(forfait ' + fmt.eur(t.forfait_expenses) + ' > réels ' + fmt.eur(t.real_expenses) + ')' : 'réels'}
            ${t.depreciation ? `<div class="muted" style="font-size:12px">dont amortissements : ${fmt.eur(t.depreciation)}</div>` : ''}</td>
            <td class="num">− ${fmt.eur(t.deducted_expenses)}</td></tr>
          <tr><td>Revenu net avant cotisations</td><td class="num"><b>${fmt.eur(t.net_before_social)}</b></td></tr>
          <tr><td>Cotisations sociales ${t.social_paid_encoded ? '(déjà encodées en dépenses : ' + fmt.eur(t.social_paid_encoded) + ')' : 'estimées'}</td>
            <td class="num">− ${fmt.eur(t.social_paid_encoded ? 0 : t.social_estimated.total)}</td></tr>
          <tr><td>Revenu imposable</td><td class="num"><b>${fmt.eur(t.taxable)}</b></td></tr>
          <tr><td>Impôt État (barème progressif, quotité exemptée déduite)</td><td class="num">${fmt.eur(t.state_tax)}</td></tr>
          <tr><td>Additionnels communaux</td><td class="num">${fmt.eur(t.communal_tax)}</td></tr>
          <tr style="font-weight:700"><td>Impôt total estimé</td><td class="num">${fmt.eur(t.total_tax)}</td></tr>
        </tbody></table>
      </div>
      <div>
        <div class="card">
          <h2>🧠 Coach fiscal</h2>
          ${t.used_method === 'forfait' ? `
            <div class="coach"><span class="icon">💡</span><span>Vos frais réels (${fmt.eur(t.real_expenses)}) sont inférieurs au forfait légal (${fmt.eur(t.forfait_expenses)}). Le forfait est appliqué automatiquement — mais encodez quand même toutes vos dépenses : la TVA reste récupérable !</span></div>` : `
            <div class="coach"><span class="icon">✅</span><span>Vos frais réels dépassent le forfait : chaque dépense encodée réduit directement votre impôt.</span></div>`}
          <div class="coach"><span class="icon">📅</span><span>Pensez aux <b>versements anticipés</b> (≈ ${fmt.eur(t.prepayment_suggestion)} par trimestre) pour éviter la majoration d'impôt — sauf si vous êtes dans vos 3 premières années d'activité en personne physique.</span></div>
          <div class="coach"><span class="icon">🛡️</span><span>Une <b>P.L.C.I.</b> (pension libre complémentaire) est déductible à 100 % et réduit aussi vos cotisations sociales — jusqu'à ±8,17 % de votre revenu net.</span></div>
        </div>
        <div class="card">
          <h2>Cotisations sociales — détail</h2>
          <table><tbody>
            <tr><td>Cotisations (20,5 % / 14,16 % par tranche)</td><td class="num">${fmt.eur(t.social_estimated.contributions)}</td></tr>
            <tr><td>Frais de gestion de la caisse</td><td class="num">${fmt.eur(t.social_estimated.admin_fees)}</td></tr>
            <tr style="font-weight:700"><td>Total annuel</td><td class="num">${fmt.eur(t.social_estimated.total)}</td></tr>
            <tr><td>Par trimestre</td><td class="num">${fmt.eur(t.quarterly_social)}</td></tr>
          </tbody></table>
          <p class="hint">Ce sont des provisions : la régularisation définitive arrive ~2 ans plus tard, calculée sur le revenu réel de l'année.</p>
        </div>
      </div>
    </div>`;

  document.getElementById('year-slot').appendChild(yearSelector(year, (y) => {
    location.hash = '#/taxes?year=' + y;
  }));
}

// ---------- Calendrier fiscal ----------
async function viewCalendar(main, params) {
  const year = Number(params.get('year')) || new Date().getFullYear();
  const events = await api('/calendar?year=' + year);
  const TYPE_ICONS = { tva: '🇧🇪', social: '🏛️', impot: '💰' };

  main.innerHTML = `
    <div class="page-header">
      <div><h1>Calendrier fiscal ${year}</h1>
        <div class="sub">Toutes vos échéances belges : TVA, cotisations sociales, versements anticipés, IPP.</div></div>
      <div class="header-actions"><span id="year-slot"></span></div>
    </div>
    <div class="card">
      <table><thead><tr><th>Date</th><th></th><th>Échéance</th><th>Détail</th></tr></thead>
      <tbody>${events.map((e) => `
        <tr style="${e.passed ? 'opacity:.45' : ''}">
          <td class="mono"><b>${fmt.date(e.date)}</b></td>
          <td>${TYPE_ICONS[e.type] || ''}</td>
          <td><b>${esc(e.label)}</b></td>
          <td class="muted" style="font-size:12.5px">${esc(e.detail || '')}</td>
        </tr>`).join('')}</tbody></table>
    </div>`;

  document.getElementById('year-slot').appendChild(yearSelector(year, (y) => {
    location.hash = '#/calendar?year=' + y;
  }));
}

// ---------- Rapports ----------
async function viewReports(main, params) {
  const year = Number(params.get('year')) || new Date().getFullYear();
  const r = await api('/reports/pnl?year=' + year);

  main.innerHTML = `
    <div class="page-header">
      <div><h1>Rapports</h1><div class="sub">Compte de résultats et exports pour votre comptable.</div></div>
      <div class="header-actions">
        <span id="year-slot"></span>
        <a class="btn" href="/api/reports/export.csv?year=${year}">⬇️ Export comptable (CSV)</a>
        <a class="btn" href="/api/backup">💾 Sauvegarde complète (JSON)</a>
      </div>
    </div>
    <div class="grid grid-3">
      <div class="stat accent"><div class="label">Revenus (HTVA)</div><div class="value">${fmt.eur(r.revenue)}</div></div>
      <div class="stat"><div class="label">Charges (part pro + amortissements)</div><div class="value">${fmt.eur(r.total_expenses)}</div></div>
      <div class="stat ${r.profit >= 0 ? 'good' : 'bad'}"><div class="label">Résultat</div><div class="value">${fmt.eur(r.profit)}</div></div>
    </div>
    <div class="card" style="margin-top:14px">
      <h2>Charges par catégorie</h2>
      ${r.expenses_by_category.length || r.depreciation ? `<table>
        <thead><tr><th>Catégorie</th><th class="num">Montant HTVA (pro)</th><th class="num">Déductible impôt</th></tr></thead>
        <tbody>
          ${r.expenses_by_category.map((c) => `<tr><td>${esc(c.category)}</td>
            <td class="num">${fmt.eur(c.total)}</td><td class="num">${fmt.eur(c.deductible)}</td></tr>`).join('')}
          ${r.depreciation ? `<tr><td><i>Amortissements de l'année</i></td>
            <td class="num">${fmt.eur(r.depreciation)}</td><td class="num">${fmt.eur(r.depreciation)}</td></tr>` : ''}
        </tbody></table>` : '<div class="empty">Aucune charge sur ' + year + '.</div>'}
    </div>`;

  document.getElementById('year-slot').appendChild(yearSelector(year, (y) => {
    location.hash = '#/reports?year=' + y;
  }));
}
