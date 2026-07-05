'use strict';
// Dépenses professionnelles et immobilisations.

async function viewExpenses(main, params) {
  const year = Number(params.get('year')) || new Date().getFullYear();
  const [expenses, categories] = await Promise.all([
    api('/expenses?year=' + year),
    api('/expense-categories'),
  ]);
  const totalExcl = expenses.reduce((s, e) => s + e.amount_excl, 0);
  const totalDeduct = expenses.reduce((s, e) =>
    s + (e.amount_excl + e.vat_amount * (1 - e.vat_deduct_pct / 100)) * e.professional_pct / 100 * e.income_deduct_pct / 100, 0);

  main.innerHTML = `
    <div class="page-header">
      <div><h1>Dépenses</h1>
        <div class="sub">Déductibilité belge appliquée automatiquement par catégorie (restaurant 69 %, réception 50 %, voiture…).</div></div>
      <div class="header-actions">
        <span id="year-slot"></span>
        <button class="btn primary" id="new-expense">+ Nouvelle dépense</button></div>
    </div>
    <div class="grid grid-3">
      <div class="stat"><div class="label">Total HTVA ${year}</div><div class="value">${fmt.eur(totalExcl)}</div></div>
      <div class="stat good"><div class="label">Déductible à l'impôt</div><div class="value">${fmt.eur(totalDeduct)}</div></div>
      <div class="stat"><div class="label">Nombre de dépenses</div><div class="value">${expenses.length}</div></div>
    </div>
    <div class="card" style="margin-top:14px">
      ${expenses.length ? `<table>
        <thead><tr><th>Date</th><th>Fournisseur</th><th>Catégorie</th><th class="num">HTVA</th><th class="num">TVA</th><th class="num">TVAC</th><th class="num">% pro</th><th></th></tr></thead>
        <tbody>${expenses.map((e) => `<tr>
          <td class="mono">${fmt.date(e.expense_date)}</td>
          <td><b>${esc(e.supplier || '—')}</b>${e.description ? `<div class="muted" style="font-size:12px">${esc(e.description)}</div>` : ''}</td>
          <td>${esc(e.category_name || '—')}${e.is_asset ? ' <span class="badge accepted">immobilisé</span>' : ''}</td>
          <td class="num">${fmt.eur(e.amount_excl)}</td><td class="num">${fmt.eur(e.vat_amount)}</td>
          <td class="num">${fmt.eur(e.amount_incl)}</td><td class="num">${e.professional_pct}%</td>
          <td class="right" style="white-space:nowrap">
            ${e.receipt_path ? `<a class="btn small" href="/api/expenses/${e.id}/receipt" target="_blank" title="Justificatif">📎</a>` : ''}
            ${!e.is_asset && e.amount_excl >= 250 ? `<button class="btn small" data-asset="${e.id}" title="Amortir">🏗️</button>` : ''}
            <button class="btn small" data-edit="${e.id}">✏️</button>
            <button class="btn small danger" data-del="${e.id}">✕</button></td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">Aucune dépense encodée pour ' + year + '. Chaque dépense encodée = moins d’impôts !</div>'}
    </div>`;

  document.getElementById('year-slot').appendChild(yearSelector(year, (y) => {
    location.hash = '#/expenses?year=' + y;
  }));
  document.getElementById('new-expense').onclick = () => openExpenseEditor(null, categories, () => viewExpenses(main, params));
  main.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () =>
    openExpenseEditor(expenses.find((e) => e.id === Number(b.dataset.edit)), categories, () => viewExpenses(main, params))));
  main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () =>
    confirmModal('Supprimer cette dépense ?', async () => {
      await api('/expenses/' + b.dataset.del, { method: 'DELETE' });
      viewExpenses(main, params);
    })));
  main.querySelectorAll('[data-asset]').forEach((b) => b.addEventListener('click', () => {
    openModal(`
      <h2>Convertir en immobilisation</h2>
      <p class="hint">Le montant sera amorti (déduit progressivement) sur plusieurs années au lieu d'être déduit en une fois.</p>
      <form>
        <label>Durée d'amortissement (années)</label>
        <select name="duration_years">
          <option value="3">3 ans (matériel informatique)</option>
          <option value="5" selected>5 ans (mobilier, machines, voiture)</option>
          <option value="10">10 ans (aménagements)</option>
          <option value="33">33 ans (bâtiment)</option>
        </select>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Annuler</button>
          <button type="submit" class="btn primary">Immobiliser</button>
        </div>
      </form>
    `, {
      onSubmit: async (form, close) => {
        await api(`/expenses/${b.dataset.asset}/to-asset`, { method: 'POST', body: { duration_years: Number(formValues(form).duration_years) } });
        close(); toast('Immobilisation créée — voir l’onglet Immobilisations.');
        viewExpenses(main, params);
      },
    });
  }));
  if (params.get('new')) { params.delete('new'); document.getElementById('new-expense').click(); }
}

function openExpenseEditor(existing, categories, refresh) {
  const e = existing || {};
  const modal = openModal(`
    <h2>${existing ? 'Modifier la dépense' : 'Nouvelle dépense'}</h2>
    <form>
      <div class="form-row">
        <div><label>Fournisseur</label><input name="supplier" value="${esc(e.supplier || '')}" placeholder="Ex. : Proximus"></div>
        <div><label>Date *</label><input type="date" name="expense_date" required value="${e.expense_date || todayISO()}"></div>
      </div>
      <label>Description</label><input name="description" value="${esc(e.description || '')}">
      <div class="form-row">
        <div><label>Catégorie</label><select name="category_id" id="cat-select">
          <option value="">— Choisir —</option>
          ${categories.map((c) => `<option value="${c.id}" ${e.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></div>
        <div><label>Régime TVA</label><select name="vat_regime">
          <option value="domestic" ${!e.vat_regime || e.vat_regime === 'domestic' ? 'selected' : ''}>Achat belge (TVA payée)</option>
          <option value="intracom_services" ${e.vat_regime === 'intracom_services' ? 'selected' : ''}>Service UE (autoliquidation)</option>
          <option value="intracom_goods" ${e.vat_regime === 'intracom_goods' ? 'selected' : ''}>Bien UE (acquisition intracom)</option>
          <option value="import" ${e.vat_regime === 'import' ? 'selected' : ''}>Importation hors UE</option>
          <option value="cocontractant" ${e.vat_regime === 'cocontractant' ? 'selected' : ''}>Cocontractant reçu</option>
          <option value="none" ${e.vat_regime === 'none' ? 'selected' : ''}>Sans TVA</option>
        </select></div>
      </div>
      <div class="form-row">
        <div><label>Montant HTVA *</label><input name="amount_excl" id="amt-excl" type="number" step="0.01" required value="${e.amount_excl ?? ''}"></div>
        <div><label>TVA</label><input name="vat_amount" id="amt-vat" type="number" step="0.01" value="${e.vat_amount ?? 0}"></div>
        <div><label>TVAC</label><input name="amount_incl" id="amt-incl" type="number" step="0.01" value="${e.amount_incl ?? ''}"></div>
        <div><label>Calcul rapide</label><select id="quick-vat">
          <option value="">TVA…</option><option value="21">depuis TVAC à 21%</option>
          <option value="6">depuis TVAC à 6%</option><option value="12">depuis TVAC à 12%</option>
        </select></div>
      </div>
      <div class="form-row">
        <div><label>% usage professionnel</label><input name="professional_pct" id="pct-pro" type="number" min="0" max="100" value="${e.professional_pct ?? 100}"></div>
        <div><label>% déductible impôt</label><input name="income_deduct_pct" id="pct-income" type="number" min="0" max="200" value="${e.income_deduct_pct ?? 100}"></div>
        <div><label>% TVA récupérable</label><input name="vat_deduct_pct" id="pct-vat" type="number" min="0" max="100" value="${e.vat_deduct_pct ?? 100}"></div>
      </div>
      <label>Justificatif (photo / PDF)</label>
      <input type="file" name="receipt" accept="image/*,.pdf">
      ${e.receipt_path ? `<div class="hint">Justificatif déjà joint — en choisir un nouveau le remplace.</div>` : ''}
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Annuler</button>
        <button type="submit" class="btn primary">Enregistrer</button>
      </div>
    </form>
  `, {
    onSubmit: async (form, close) => {
      const fd = new FormData(form);
      if (!fd.get('receipt') || !fd.get('receipt').size) fd.delete('receipt');
      const opts = { method: existing ? 'PUT' : 'POST', body: fd };
      await api(existing ? '/expenses/' + existing.id : '/expenses', opts);
      close(); toast('Dépense enregistrée.'); refresh();
    },
  });

  const el = modal.el;
  // La catégorie préremplit les % de déductibilité belges.
  el.querySelector('#cat-select').addEventListener('change', (ev) => {
    const cat = categories.find((c) => c.id === Number(ev.target.value));
    if (!cat) return;
    el.querySelector('#pct-income').value = cat.income_deduct_pct;
    el.querySelector('#pct-vat').value = cat.vat_deduct_pct;
    el.querySelector('#pct-pro').value = cat.professional_pct;
  });
  // Complétion automatique des montants.
  const excl = el.querySelector('#amt-excl'), vat = el.querySelector('#amt-vat'), incl = el.querySelector('#amt-incl');
  const sync = () => { incl.value = ((Number(excl.value) || 0) + (Number(vat.value) || 0)).toFixed(2); };
  excl.addEventListener('input', sync);
  vat.addEventListener('input', sync);
  el.querySelector('#quick-vat').addEventListener('change', (ev) => {
    const rate = Number(ev.target.value);
    if (!rate || !Number(incl.value)) return;
    const ttc = Number(incl.value);
    excl.value = (ttc / (1 + rate / 100)).toFixed(2);
    vat.value = (ttc - Number(excl.value)).toFixed(2);
    ev.target.value = '';
  });
}

// ---------- Immobilisations ----------
async function viewAssets(main) {
  const assets = await api('/assets');
  main.innerHTML = `
    <div class="page-header">
      <div><h1>Immobilisations &amp; amortissements</h1>
        <div class="sub">Matériel, véhicules, aménagements… déduits progressivement chaque année (amortissement linéaire).</div></div>
      <div class="header-actions"><button class="btn primary" id="new-asset">+ Nouvelle immobilisation</button></div>
    </div>
    <div class="card">
      ${assets.length ? `<table>
        <thead><tr><th>Nom</th><th>Achat</th><th class="num">Valeur HTVA</th><th class="num">Durée</th><th class="num">Annuité</th><th class="num">Valeur comptable</th><th></th></tr></thead>
        <tbody>${assets.map((a) => `<tr>
          <td><b>${esc(a.name)}</b></td>
          <td class="mono">${fmt.date(a.purchase_date)}</td>
          <td class="num">${fmt.eur(a.amount_excl)}</td>
          <td class="num">${a.duration_years} ans</td>
          <td class="num">${fmt.eur(a.annuity)}</td>
          <td class="num">${fmt.eur(Math.max(a.book_value, 0))}</td>
          <td class="right"><button class="btn small" data-schedule="${a.id}">📅 Plan</button>
            <button class="btn small danger" data-del="${a.id}">✕</button></td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">Aucune immobilisation. Convertissez une dépense importante (🏗️) ou créez-en une ici.</div>'}
    </div>`;

  document.getElementById('new-asset').onclick = () => openModal(`
    <h2>Nouvelle immobilisation</h2>
    <form>
      <label>Nom *</label><input name="name" required placeholder="Ex. : MacBook Pro">
      <div class="form-row">
        <div><label>Date d'achat *</label><input type="date" name="purchase_date" required value="${todayISO()}"></div>
        <div><label>Montant HTVA *</label><input type="number" step="0.01" name="amount_excl" required></div>
      </div>
      <div class="form-row">
        <div><label>Durée (années)</label><input type="number" name="duration_years" value="5"></div>
        <div><label>% déductible</label><input type="number" name="income_deduct_pct" value="100"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Annuler</button>
        <button type="submit" class="btn primary">Créer</button>
      </div>
    </form>
  `, {
    onSubmit: async (form, close) => {
      const v = formValues(form);
      await api('/assets', { method: 'POST', body: { ...v, amount_excl: Number(v.amount_excl), duration_years: Number(v.duration_years), income_deduct_pct: Number(v.income_deduct_pct) } });
      close(); toast('Immobilisation créée.'); viewAssets(main);
    },
  });

  main.querySelectorAll('[data-schedule]').forEach((b) => b.addEventListener('click', () => {
    const a = assets.find((x) => x.id === Number(b.dataset.schedule));
    openModal(`
      <h2>Plan d'amortissement — ${esc(a.name)}</h2>
      <table><thead><tr><th>Année</th><th class="num">Annuité</th><th class="num">Valeur résiduelle</th></tr></thead>
      <tbody>${a.schedule.map((s) => `<tr>
        <td>${s.year}</td><td class="num">${fmt.eur(s.annuity)}</td><td class="num">${fmt.eur(Math.max(s.remaining, 0))}</td></tr>`).join('')}
      </tbody></table>
      <div class="modal-actions"><button class="btn" data-close>Fermer</button></div>`);
  }));
  main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () =>
    confirmModal('Supprimer cette immobilisation ?', async () => {
      await api('/assets/' + b.dataset.del, { method: 'DELETE' });
      viewAssets(main);
    })));
}
