/* Simulateur d'impôt Luxembourg — logique de l'interface */
(function () {
  'use strict';

  const E = window.TaxEngine;
  const form = document.getElementById('form');
  const STORAGE_KEY = 'impot-lu-2025';

  const fmtEUR = new Intl.NumberFormat('fr-LU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const fmtEUR2 = new Intl.NumberFormat('fr-LU', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (v) => (v * 100).toLocaleString('fr-LU', { maximumFractionDigits: 1 }) + ' %';
  const eur = (v) => fmtEUR.format(Math.round(v));

  // ---------------------------------------------------------------------------
  // Lecture du formulaire → modèle du moteur
  // ---------------------------------------------------------------------------
  function readForm() {
    const d = E.defaultInput();
    const val = (name) => {
      const el = form.elements[name];
      if (!el) return 0;
      if (el.type === 'checkbox') return el.checked;
      if (el.tagName === 'SELECT') return el.value;
      const n = parseFloat(el.value);
      return isFinite(n) ? n : 0;
    };

    d.situation.statut = val('statut');
    d.situation.pacsDeclarationCommune = val('pacsDeclarationCommune');
    d.situation.transitionMoins3Ans = val('transitionMoins3Ans');
    d.situation.age = val('age');
    d.situation.ageConjoint = val('ageConjoint');
    d.situation.enfants = val('enfants');
    d.situation.enfantsHorsMenage = val('enfantsHorsMenage');

    ['salaireBrut1', 'salaireBrut2', 'pensionBrut1', 'pensionBrut2',
      'autresRevenusNets', 'dividendes', 'interetsRecus'].forEach((k) => { d.revenus[k] = val(k); });
    const cot = form.elements.cotisationsOverride.value;
    d.revenus.cotisationsOverride = cot === '' ? null : parseFloat(cot);

    ['kmUnites1', 'kmUnites2', 'fraisReels1', 'fraisReels2', 'prevoyance1', 'prevoyance2',
      'assurances', 'interetsDebiteurs', 'epargneLogement', 'dons', 'pensionAlimentaire',
      'interetsHypotheque', 'fraisGardeDomesticite', 'entretienEnfantsHorsMenage',
      'autresChargesExtraordinaires', 'allocationsEnfant', 'impotsRetenus'].forEach((k) => { d.deductions[k] = val(k); });
    d.deductions.hypoDisponibilite = val('hypoDisponibilite');
    return d;
  }

  // ---------------------------------------------------------------------------
  // Affichage conditionnel des champs
  // ---------------------------------------------------------------------------
  function updateVisibility(d) {
    const statut = d.situation.statut;
    const couple = statut === 'marie' || statut === 'pacs';
    const classe = E.classeImpot(d.situation);
    const collective = classe === '2' && couple;

    document.getElementById('row-pacs').hidden = statut !== 'pacs';
    document.getElementById('row-transition').hidden = !(statut === 'divorce' || statut === 'veuf');
    document.getElementById('row-age-conjoint').hidden = !couple;
    document.querySelectorAll('.conjoint-only').forEach((el) => { el.hidden = !collective; });
    document.getElementById('row-allocations').hidden = !(classe === '1a' && d.situation.enfants > 0);

    // Plafonds dynamiques affichés dans les libellés
    const menage = 1 + (collective ? 1 : 0) + (d.situation.enfants || 0);
    const p = E.PARAMS;
    document.getElementById('cap-prev1').textContent = `(max ${p.plafondPrevoyance.toLocaleString('fr-LU')} €)`;
    document.getElementById('cap-ass').textContent = `(max ${(p.plafondAssurancesParPersonne * menage).toLocaleString('fr-LU')} €)`;
    const elPlaf = (d.situation.age >= 18 && d.situation.age <= 40 ? p.plafondEpargneLogementJeune : p.plafondEpargneLogement) * menage;
    document.getElementById('cap-el').textContent = `(max ${elPlaf.toLocaleString('fr-LU')} €)`;

    const nomClasse = { '1': 'classe 1', '1a': 'classe 1a', '2': 'classe 2 (imposition collective)' }[classe];
    document.getElementById('classe-hint').textContent = `→ Vous relevez de la ${nomClasse}.`;
  }

  // ---------------------------------------------------------------------------
  // Rendu des résultats
  // ---------------------------------------------------------------------------
  function renderResult(res, d) {
    document.getElementById('out-impot').textContent = eur(res.impotDu);
    document.getElementById('out-classe').textContent = 'Classe ' + res.classe;
    document.getElementById('out-taux-moyen').textContent = fmtPct(res.tauxMoyen);
    document.getElementById('out-taux-marginal').textContent = fmtPct(res.tauxMarginal);
    document.getElementById('out-rimp').textContent = eur(res.revenuImposable);

    const soldeRow = document.getElementById('out-solde-row');
    if (res.retenues > 0) {
      soldeRow.hidden = false;
      const refund = res.solde < 0;
      soldeRow.className = 'result-solde ' + (refund ? 'refund' : 'pay');
      document.getElementById('out-solde-label').textContent = refund
        ? 'Remboursement estimé (retenues − impôt dû)'
        : 'Solde restant à payer';
      document.getElementById('out-solde').textContent = fmtEUR2.format(Math.abs(res.solde));
    } else {
      soldeRow.hidden = true;
    }

    renderDetail(res);
  }

  function renderDetail(res) {
    const r = res.revenus, ds = res.ds, ce = res.ce;
    const rows = [];
    const line = (label, value, cls) => value !== 0 && rows.push(
      `<tr class="${cls || ''}"><td>${label}</td><td>${(cls || '').includes('minus') ? '−' : ''}${fmtEUR2.format(Math.abs(value))}</td></tr>`
    );
    const section = (label) => rows.push(`<tr class="section"><td colspan="2">${label}</td></tr>`);

    section('Revenus');
    line('Salaires bruts', r.salaire1 + r.salaire2);
    line('Pensions brutes', r.pension1 + r.pension2);
    line('Autres revenus nets', r.autresNets);
    line('Revenus de capitaux imposables', r.capitauxImposables);
    line('Frais de déplacement', -(r.fd1 + r.fd2), 'minus');
    line('Frais d\'obtention', -(r.fo1 + r.fo2), 'minus');
    line('Intérêts hypothécaires (habitation)', -r.interetsHypo, 'minus');
    rows.push(`<tr class="total"><td>Total des revenus nets</td><td>${fmtEUR2.format(r.totalRevenusNets)}</td></tr>`);

    section('Dépenses spéciales');
    line('Cotisations sociales', -ds.cotisations, 'minus');
    line('Assurances & intérêts débiteurs', -ds.assurances, 'minus');
    line('Prévoyance-vieillesse', -(ds.prevoyance1 + ds.prevoyance2), 'minus');
    line('Épargne-logement', -ds.epargneLogement, 'minus');
    line('Dons', -ds.dons, 'minus');
    line('Pension alimentaire', -ds.pensionAlimentaire, 'minus');
    if (ds.minimumApplique) line('Minimum forfaitaire appliqué', -ds.total, 'minus');

    if (ce.total > 0) {
      section('Charges extraordinaires');
      line('Garde d\'enfants / domesticité', -ce.garde, 'minus');
      line('Enfants hors ménage', -ce.enfantsHorsMenage, 'minus');
      line('Autres (au-delà de la charge normale)', -ce.autres, 'minus');
    }
    if (res.abattementExtraPro > 0) {
      section('Abattements');
      line('Abattement extra-professionnel', -res.abattementExtraPro, 'minus');
    }

    section('Impôt');
    rows.push(`<tr><td>Revenu imposable ajusté</td><td>${fmtEUR2.format(res.revenuImposable)}</td></tr>`);
    rows.push(`<tr><td>Impôt suivant barème (classe ${res.classe})</td><td>${fmtEUR2.format(res.impotBareme)}</td></tr>`);
    line('Fonds pour l\'emploi', res.majorationFE);
    if (res.credits.cis) line('Crédit d\'impôt salarié (CIS)', -res.credits.cis, 'minus');
    if (res.credits.cip) line('Crédit d\'impôt pensionné (CIP)', -res.credits.cip, 'minus');
    if (res.credits.co2) line('Crédit d\'impôt CO2', -res.credits.co2, 'minus');
    if (res.credits.cim) line('Crédit d\'impôt monoparental (CIM)', -res.credits.cim, 'minus');
    rows.push(`<tr class="total"><td>Impôt dû</td><td>${fmtEUR2.format(res.impotDu)}</td></tr>`);

    document.getElementById('out-detail-table').innerHTML = rows.join('');
  }

  // ---------------------------------------------------------------------------
  // Rendu de l'optimisation
  // ---------------------------------------------------------------------------
  function renderOptimization(d, res) {
    const list = document.getElementById('opt-list');
    const totalEl = document.getElementById('opt-total');
    const coupleEl = document.getElementById('opt-couple');

    const hasIncome = res.revenus.totalRevenusNets > 1000;
    if (!hasIncome) {
      list.innerHTML = '<p class="muted">Renseignez vos revenus pour voir vos gains potentiels.</p>';
      totalEl.hidden = true;
      coupleEl.hidden = true;
      return;
    }

    const { suggestions } = E.optimize(d);
    if (!suggestions.length) {
      list.innerHTML = '<p class="muted">🎉 Tous les plafonds de déduction sont déjà utilisés — votre situation est optimisée.</p>';
      totalEl.hidden = true;
    } else {
      list.innerHTML = suggestions.map((s) => `
        <div class="opt-item">
          <div class="opt-head">
            <h3>${s.titre}</h3>
            <span class="opt-gain ${s.info ? 'info' : ''}">${s.gain != null ? '+' + eur(s.gain) : 'à renseigner'}</span>
          </div>
          <p>${s.detail}</p>
          ${s.effort ? `<span class="opt-effort">Effort : ${eur(s.effort)} → gain d'impôt ${eur(s.gain)} (rendement fiscal ${Math.round(s.rendement * 100)} %)</span>` : ''}
        </div>`).join('');

      const totalGain = suggestions.reduce((a, s) => a + (s.gain || 0), 0);
      const totalEffort = suggestions.reduce((a, s) => a + (s.effort || 0), 0);
      if (totalGain > 0) {
        totalEl.hidden = false;
        totalEl.innerHTML = `Gain fiscal potentiel : <strong>${eur(totalGain)}</strong> d'impôt en moins` +
          (totalEffort ? ` (en mobilisant ${eur(totalEffort)} de versements déductibles)` : '');
      } else {
        totalEl.hidden = true;
      }
    }

    // Comparaison imposition collective vs individuelle pour les couples
    const cmp = E.compareCollectiveIndividuelle(d);
    if (cmp) {
      coupleEl.hidden = false;
      coupleEl.className = 'opt-couple-box';
      coupleEl.innerHTML = cmp.avantageCollective >= 0
        ? `<strong>Imposition collective recommandée :</strong> elle vous fait économiser
           <strong>${eur(cmp.avantageCollective)}</strong> par rapport à une imposition individuelle pure
           (${eur(cmp.individuelle)} au lieu de ${eur(cmp.collective)}… c'est le splitting qui joue).`
        : `<strong>À étudier :</strong> une imposition individuelle pure serait plus favorable de
           <strong>${eur(-cmp.avantageCollective)}</strong> — cas rare, à valider avec un conseiller.`;
    } else {
      coupleEl.hidden = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Boucle principale
  // ---------------------------------------------------------------------------
  let rafId = null;
  function recalc() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const d = readForm();
      updateVisibility(d);
      const res = E.compute(d);
      renderResult(res, d);
      renderOptimization(d, res);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeForm())); } catch (e) { /* stockage indisponible */ }
    });
  }

  function serializeForm() {
    const out = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }

  function restoreForm() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved) return;
    Object.entries(saved).forEach(([name, value]) => {
      const el = form.elements[name];
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!value;
      else el.value = value;
    });
  }

  form.addEventListener('input', recalc);
  form.addEventListener('change', recalc);
  form.addEventListener('submit', (e) => e.preventDefault());

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Effacer toutes les données saisies ?')) return;
    form.reset();
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    recalc();
  });

  document.getElementById('btn-print').addEventListener('click', () => {
    document.getElementById('out-detail').open = true;
    window.print();
  });

  restoreForm();
  recalc();
})();
