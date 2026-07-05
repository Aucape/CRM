/* Simulateur d'impôt Luxembourg — logique de l'interface (v2) */
(function () {
  'use strict';

  const E = window.TaxEngine;
  const form = document.getElementById('form');
  const STORAGE_KEY = 'impot-lu-v2';
  const SCENARIO_KEY = 'impot-lu-scenarios';
  const THEME_KEY = 'impot-lu-theme';

  const fmtEUR = new Intl.NumberFormat('fr-LU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const fmtEUR2 = new Intl.NumberFormat('fr-LU', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (v) => (v * 100).toLocaleString('fr-LU', { maximumFractionDigits: 1 }) + ' %';
  const eur = (v) => fmtEUR.format(Math.round(v));
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Thème clair / sombre
  // ---------------------------------------------------------------------------
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('btn-theme').textContent = theme === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
  }
  function initTheme() {
    let theme;
    try { theme = localStorage.getItem(THEME_KEY); } catch (e) { theme = null; }
    if (!theme) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(theme);
  }
  $('btn-theme').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

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

    d.annee = parseInt(val('annee'), 10) || 2025;
    d.situation.statut = val('statut');
    d.situation.pacsDeclarationCommune = val('pacsDeclarationCommune');
    d.situation.transitionMoins3Ans = val('transitionMoins3Ans');
    d.situation.age = val('age');
    d.situation.ageConjoint = val('ageConjoint');
    d.situation.enfants = val('enfants');
    d.situation.enfantsHorsMenage = val('enfantsHorsMenage');
    d.situation.resident = val('resident') !== 'non';
    d.situation.paysResidence = val('paysResidence');

    ['salaireBrut1', 'salaireBrut2', 'pensionBrut1', 'pensionBrut2',
      'beneficeIndependant1', 'beneficeIndependant2', 'cotisationsIndependant',
      'autresRevenusNets', 'dividendes', 'interetsRecus',
      'pvSpeculation', 'pvLongTerme',
      'revenusEtrangers1', 'revenusEtrangers2'].forEach((k) => { d.revenus[k] = val(k); });

    const pvAb = form.elements.pvAbattementRestant.value;
    d.revenus.pvAbattementRestant = pvAb === '' ? '' : parseFloat(pvAb);
    const cot = form.elements.cotisationsOverride.value;
    d.revenus.cotisationsOverride = cot === '' ? null : parseFloat(cot);

    ['loyersBruts', 'fraisEntretien', 'chargesAssurances', 'interetsEmprunt',
      'valeurConstruction', 'anneeAchevement'].forEach((k) => { d.revenus.location[k] = val('location_' + k); });

    ['kmUnites1', 'kmUnites2', 'fraisReels1', 'fraisReels2', 'prevoyance1', 'prevoyance2',
      'assurances', 'interetsDebiteurs', 'epargneLogement', 'dons', 'pensionAlimentaire',
      'interetsHypotheque', 'fraisGardeDomesticite', 'entretienEnfantsHorsMenage',
      'autresChargesExtraordinaires', 'allocationsEnfant', 'impotsRetenus'].forEach((k) => { d.deductions[k] = val(k); });
    d.deductions.hypoDisponibilite = val('hypoDisponibilite');
    return d;
  }

  // ---------------------------------------------------------------------------
  // Affichage conditionnel
  // ---------------------------------------------------------------------------
  function updateVisibility(d) {
    const statut = d.situation.statut;
    const couple = statut === 'marie' || statut === 'pacs';
    const classe = E.classeImpot(d.situation);
    const collective = classe === '2' && couple;
    const nonResident = !d.situation.resident;

    $('row-pacs').hidden = statut !== 'pacs';
    $('row-transition').hidden = !(statut === 'divorce' || statut === 'veuf');
    $('row-age-conjoint').hidden = !couple;
    document.querySelectorAll('.conjoint-only').forEach((el) => { el.hidden = !collective; });
    $('row-allocations').hidden = !(classe === '1a' && d.situation.enfants > 0);
    $('row-pays').hidden = !nonResident;
    $('row-etranger1').hidden = !nonResident;
    $('row-etranger2').hidden = !(nonResident && collective);
    $('hint-residence').hidden = !nonResident;
    $('row-cotis-indep').hidden = !(d.revenus.beneficeIndependant1 || d.revenus.beneficeIndependant2);
    $('row-pv-abattement').hidden = !(d.revenus.pvLongTerme > 0);

    const p = E.YEARS[d.annee] || E.YEARS[2025];
    const menage = 1 + (collective ? 1 : 0) + (d.situation.enfants || 0);
    $('cap-prev1').textContent = `(max ${p.plafondPrevoyance.toLocaleString('fr-LU')} €)`;
    $('cap-ass').textContent = `(max ${(p.plafondAssurancesParPersonne * menage).toLocaleString('fr-LU')} €)`;
    const elPlaf = (d.situation.age >= 18 && d.situation.age <= 40 ? p.plafondEpargneLogementJeune : p.plafondEpargneLogement) * menage;
    $('cap-el').textContent = `(max ${elPlaf.toLocaleString('fr-LU')} €)`;
    $('cap-pv').textContent = `(max ${(p.pvAbattementDecennal * (collective ? 2 : 1)).toLocaleString('fr-LU')} €)`;

    const nomClasse = { '1': 'classe 1', '1a': 'classe 1a', '2': 'classe 2 (imposition collective)' }[classe];
    $('classe-hint').textContent = `→ Vous relevez de la ${nomClasse}.`;

    // Amortissement locatif
    const loc = d.revenus.location;
    if (loc.valeurConstruction > 0) {
      const age = loc.anneeAchevement ? d.annee - loc.anneeAchevement : 99;
      const taux = age >= 0 && age < p.amortissementAccelereAnnees ? p.amortissementAccelere : p.amortissementNormal;
      $('hint-amortissement').textContent =
        `Amortissement appliqué : ${(taux * 100).toLocaleString('fr-LU')} % × ${eur(loc.valeurConstruction)} = ${eur(loc.valeurConstruction * taux)} / an.`;
    } else {
      $('hint-amortissement').textContent = 'Renseignez la valeur de la construction pour déduire l\'amortissement (2 %/an, ou 4 %/an si achevée depuis moins de 5 ans).';
    }

    $('brand-sub').textContent = `Année d'imposition ${d.annee} · déclaration modèle 100` + (p.provisoire ? ' · paramètres provisoires' : '');
    $('out-impot-label').textContent = `Impôt dû ${d.annee}`;
  }

  // ---------------------------------------------------------------------------
  // Résultat principal
  // ---------------------------------------------------------------------------
  function renderResult(res) {
    $('out-impot').textContent = eur(res.impotDu);
    $('out-classe').textContent = 'Classe ' + res.classe;
    $('out-taux-moyen').textContent = fmtPct(res.tauxMoyen);
    $('out-taux-marginal').textContent = fmtPct(res.tauxMarginal);
    $('out-rimp').textContent = eur(res.revenuImposable);

    const soldeRow = $('out-solde-row');
    if (res.retenues > 0) {
      soldeRow.hidden = false;
      const refund = res.solde < 0;
      soldeRow.className = 'result-solde ' + (refund ? 'refund' : 'pay');
      $('out-solde-label').textContent = refund ? 'Remboursement estimé' : 'Solde restant à payer';
      $('out-solde').textContent = fmtEUR2.format(Math.abs(res.solde));
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
    line('Bénéfice indépendant / libéral', r.benefice1 + r.benefice2);
    line('Autres revenus nets', r.autresNets);
    line('Revenus de capitaux imposables', r.capitauxImposables);
    if (r.location.actif) line(`Location de biens (dont amortissement ${fmtEUR2.format(r.location.amortissement)})`, r.location.net, r.location.net < 0 ? 'minus' : '');
    line('Bénéfice de spéculation', r.pvSpeculation);
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
    if (r.etranger > 0) {
      rows.push(`<tr><td>Revenus étrangers exonérés (réserve de progressivité)</td><td>${fmtEUR2.format(r.etranger)}</td></tr>`);
    }
    rows.push(`<tr><td>Impôt suivant barème (classe ${res.classe})</td><td>${fmtEUR2.format(res.impotBareme - res.pv.impot)}</td></tr>`);
    if (res.pv.net > 0) {
      rows.push(`<tr><td>Plus-value long terme : ${fmtEUR2.format(res.pv.net)} au demi-taux ${fmtPct(res.pv.tauxApplique)} (abattement ${fmtEUR2.format(res.pv.abattement)})</td><td>${fmtEUR2.format(res.pv.impot)}</td></tr>`);
    }
    line('Fonds pour l\'emploi', res.majorationFE);
    if (res.credits.cis) line('Crédit d\'impôt salarié (CIS)', -res.credits.cis, 'minus');
    if (res.credits.cip) line('Crédit d\'impôt pensionné (CIP)', -res.credits.cip, 'minus');
    if (res.credits.cii) line('Crédit d\'impôt indépendant (CII)', -res.credits.cii, 'minus');
    if (res.credits.co2) line('Crédit d\'impôt CO2', -res.credits.co2, 'minus');
    if (res.credits.cim) line('Crédit d\'impôt monoparental (CIM)', -res.credits.cim, 'minus');
    rows.push(`<tr class="total"><td>Impôt dû</td><td>${fmtEUR2.format(res.impotDu)}</td></tr>`);

    $('out-detail-table').innerHTML = rows.join('');
  }

  // ---------------------------------------------------------------------------
  // Assimilation des non-résidents
  // ---------------------------------------------------------------------------
  function renderAssimilation(res) {
    const card = $('card-assimilation');
    if (res.resident || !res.assimilation) { card.hidden = true; return; }
    card.hidden = false;
    const a = res.assimilation;
    if (a.assimile) {
      card.className = 'card warn-card ok';
      card.innerHTML = `<h2>✅ Assimilation fiscale (art. 157ter)</h2>
        <p>Vous pouvez être <strong>assimilé à un résident</strong> : accès à la classe d'impôt du résident,
        aux dépenses spéciales, charges extraordinaires et abattements${a.regleBelge ? ' (règle belge des 50 % de revenus professionnels du ménage)' : ''}.
        Part luxembourgeoise de vos revenus : <strong>${a.pct1.toLocaleString('fr-LU')} %</strong>${res.couple ? ` — conjoint : <strong>${a.pct2.toLocaleString('fr-LU')} %</strong>` : ''}.
        Cochez la demande d'assimilation (page 3 du modèle 100).</p>`;
    } else {
      card.className = 'card warn-card';
      card.innerHTML = `<h2>⚠️ Assimilation non remplie</h2>
        <p>Moins de 90 % de vos revenus sont imposables au Luxembourg (part actuelle :
        <strong>${a.pct1.toLocaleString('fr-LU')} %</strong>${res.couple ? `, conjoint ${a.pct2.toLocaleString('fr-LU')} %` : ''},
        et vos revenus étrangers dépassent 13 000 €). Sans assimilation, <strong>les déductions
        (dépenses spéciales, charges extraordinaires) et la classe 2 ne sont pas accessibles</strong> :
        la retenue à la source est en principe définitive. Le calcul affiché suppose l'assimilation —
        rapprochez-vous d'un conseiller pour votre cas précis.</p>`;
    }
  }

  // ---------------------------------------------------------------------------
  // Optimisation + comparaison des modes d'imposition
  // ---------------------------------------------------------------------------
  function renderOptimization(d, res) {
    const list = $('opt-list');
    const totalEl = $('opt-total');
    const coupleEl = $('opt-couple');

    if (res.revenus.totalRevenusNets <= 1000) {
      list.innerHTML = '<p class="muted">Renseignez vos revenus pour voir vos gains potentiels.</p>';
      totalEl.hidden = true; coupleEl.hidden = true;
      renderAvant3112(d, []);
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
      totalEl.hidden = totalGain <= 0;
      if (totalGain > 0) {
        totalEl.innerHTML = `Gain fiscal potentiel : <strong>${eur(totalGain)}</strong> d'impôt en moins` +
          (totalEffort ? ` (en mobilisant ${eur(totalEffort)} de versements déductibles)` : '');
      }
    }

    // Modes d'imposition du couple (art. 3ter)
    const cmp = E.comparerModes(d);
    if (cmp) {
      coupleEl.hidden = false;
      coupleEl.className = 'opt-couple-box';
      const row = (mode, label, montant) =>
        `<tr class="${cmp.meilleur === mode ? 'best' : ''}"><td>${label}</td><td>${eur(montant)}</td></tr>`;
      const conclusion = {
        collective: 'L\'imposition collective (classe 2) est la plus avantageuse — c\'est le régime par défaut.',
        individuelle: `L'imposition individuelle pure ferait économiser ${eur(cmp.collective - cmp.individuelle)} — cas rare, à valider avec un conseiller (option à cocher ensemble avant le 31/12).`,
        reallocation: 'L\'imposition individuelle avec réallocation serait légèrement plus avantageuse (crédits d\'impôt individualisés).',
      }[cmp.meilleur];
      coupleEl.innerHTML = `<strong>Modes d'imposition du couple (art. 3ter)</strong>
        <table>
          <tr><th>Mode</th><th>Impôt total</th></tr>
          ${row('collective', 'Collective (classe 2, splitting)', cmp.collective)}
          ${row('individuelle', `Individuelle pure (${eur(cmp.individuelleDetail.conjoint1)} + ${eur(cmp.individuelleDetail.conjoint2)})`, cmp.individuelle)}
          ${row('reallocation', 'Individuelle avec réallocation 50/50', cmp.reallocation)}
        </table>
        <p style="margin:8px 0 0">${conclusion} La réallocation donne le même total que le splitting mais
        individualise la retenue mensuelle — utile pour lisser la trésorerie ou pour certains non-résidents.</p>`;
    } else {
      coupleEl.hidden = true;
    }

    renderAvant3112(d, suggestions);
  }

  // « À faire avant le 31/12 » + rappels calendrier
  let lastDeadlineInfo = null;
  function renderAvant3112(d, suggestions) {
    const card = $('card-avant3112');
    const now = new Date();
    const actionable = suggestions.filter((s) => s.avant3112 && s.gain > 0);
    const tropTard = d.annee < now.getFullYear();
    lastDeadlineInfo = { annee: d.annee, actionable };

    if (!actionable.length || tropTard) {
      if (tropTard && actionable.length) {
        card.hidden = false;
        $('avant3112-text').innerHTML =
          `L'année ${d.annee} est close : les versements déductibles ne sont plus possibles.
           Basculez sur l'année ${now.getFullYear()} (sélecteur en haut) pour optimiser l'année en cours —
           les mêmes leviers représentent <strong>${eur(actionable.reduce((a, s) => a + s.gain, 0))}</strong> de gain potentiel.`;
      } else {
        card.hidden = true;
      }
      return;
    }
    card.hidden = false;
    const total = actionable.reduce((a, s) => a + s.gain, 0);
    const effort = actionable.reduce((a, s) => a + s.effort, 0);
    const jours = Math.max(0, Math.ceil((new Date(d.annee, 11, 31) - now) / 86400000));
    $('avant3112-text').innerHTML =
      `Il reste <strong>${jours} jours</strong> pour effectuer vos versements déductibles ${d.annee}
       (prévoyance, assurances, épargne-logement…) : <strong>${eur(effort)}</strong> à verser
       pour <strong>${eur(total)}</strong> d'impôt en moins.`;
  }

  function genererICS() {
    const info = lastDeadlineInfo || { annee: 2025, actionable: [] };
    const annee = info.annee;
    const desc = info.actionable.length
      ? 'Versements deductibles restants : ' + info.actionable.map((s) => `${s.titre} (${Math.round(s.effort)} EUR)`).join(' ; ')
      : 'Verifiez vos plafonds de deduction (prevoyance, assurances, epargne-logement).';
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = (() => { const t = new Date(); return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00Z`; })();
    const event = (uid, date, titre, description) => [
      'BEGIN:VEVENT', `UID:${uid}@impot-lu`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${date}`, `SUMMARY:${titre}`, `DESCRIPTION:${description}`,
      'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', `DESCRIPTION:${titre}`, 'END:VALARM',
      'END:VEVENT',
    ].join('\r\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//impot-lu//simulateur//FR',
      event(`versements-${annee}`, `${annee}1215`, `Impots ${annee} : derniers versements deductibles avant le 31/12`, desc),
      event(`declaration-${annee}`, `${annee + 1}1130`, `Preparer la declaration d'impot ${annee}`, `Rassembler certificats et justificatifs. Date limite : 31/12/${annee + 1} via MyGuichet.lu`),
      event(`deadline-${annee}`, `${annee + 1}1231`, `Date limite : declaration d'impot ${annee}`, 'Remise du modele 100 via MyGuichet.lu'),
      'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rappels-impot-${annee}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  $('btn-ics').addEventListener('click', genererICS);

  // ---------------------------------------------------------------------------
  // Bannière d'échéance
  // ---------------------------------------------------------------------------
  function renderDeadlineBanner(d) {
    const now = new Date();
    const deadline = new Date(d.annee + 1, 11, 31);
    const jours = Math.ceil((deadline - now) / 86400000);
    const banner = $('deadline-banner');
    if (jours < 0) {
      banner.textContent = `⚠️ La date limite de remise de la déclaration ${d.annee} (31/12/${d.annee + 1}) est dépassée.`;
    } else {
      banner.textContent = `📅 Déclaration ${d.annee} : à remettre pour le 31 décembre ${d.annee + 1} via MyGuichet.lu — dans ${jours} jours.`;
    }
  }

  // ---------------------------------------------------------------------------
  // Guide modèle 100 + pièces
  // ---------------------------------------------------------------------------
  function renderM100(d, res) {
    const guide = E.guideModele100(d, res);
    $('m100-table').innerHTML = guide.lignes.map((l) =>
      `<tr><td>${l.rubrique}<span class="page">${l.page}</span></td><td>${l.montant != null ? fmtEUR2.format(l.montant) : '—'}</td></tr>`
    ).join('');
    $('m100-pieces').innerHTML = [...new Set(guide.pieces)].map((p) => `<li>${p}</li>`).join('') ||
      '<li>Aucune pièce particulière d\'après vos saisies.</li>';
  }

  // ---------------------------------------------------------------------------
  // Scénarios
  // ---------------------------------------------------------------------------
  function loadScenarios() {
    try { return JSON.parse(localStorage.getItem(SCENARIO_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveScenarios(list) {
    try { localStorage.setItem(SCENARIO_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  function renderScenarios(currentRes) {
    const list = loadScenarios();
    const table = $('scenario-table');
    $('scenario-empty').hidden = list.length > 0;
    table.hidden = list.length === 0;
    if (!list.length) return;
    table.innerHTML =
      '<tr><th>Scénario</th><th>Impôt</th><th>Écart</th><th></th></tr>' +
      list.map((s, i) => {
        const delta = s.impot - currentRes.impotDu;
        const deltaTxt = Math.abs(delta) < 0.5 ? '=' :
          `<span class="${delta > 0 ? 'delta-pos' : 'delta-neg'}">${delta > 0 ? '+' : '−'}${eur(Math.abs(delta))}</span>`;
        return `<tr>
          <td>${s.nom}<br><small class="muted">${s.annee} · classe ${s.classe}</small></td>
          <td>${eur(s.impot)}</td><td>${deltaTxt}</td>
          <td><button type="button" data-load="${i}">charger</button>
              <button type="button" class="del" data-del="${i}" aria-label="Supprimer ${s.nom}">✕</button></td>
        </tr>`;
      }).join('');
  }

  $('btn-scenario-save').addEventListener('click', () => {
    const d = readForm();
    const res = E.compute(d);
    const nom = $('scenario-name').value.trim() || `Scénario ${loadScenarios().length + 1}`;
    const list = loadScenarios();
    list.push({ nom, annee: d.annee, classe: res.classe, impot: res.impotDu, data: serializeForm() });
    saveScenarios(list.slice(-12)); // garde les 12 derniers
    $('scenario-name').value = '';
    recalc();
  });

  $('scenario-table').addEventListener('click', (e) => {
    const load = e.target.getAttribute('data-load');
    const del = e.target.getAttribute('data-del');
    if (load != null) {
      const s = loadScenarios()[+load];
      if (s) { applySerialized(s.data); recalc(); }
    } else if (del != null) {
      const list = loadScenarios();
      list.splice(+del, 1);
      saveScenarios(list);
      recalc();
    }
  });

  // ---------------------------------------------------------------------------
  // Import / export JSON
  // ---------------------------------------------------------------------------
  function serializeForm() {
    const out = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }
  function applySerialized(saved) {
    if (!saved) return;
    Object.entries(saved).forEach(([name, value]) => {
      const el = form.elements[name];
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!value;
      else el.value = value;
    });
  }

  $('btn-export').addEventListener('click', () => {
    const payload = { app: 'impot-lu', version: 2, exporte: new Date().toISOString(), donnees: serializeForm(), scenarios: loadScenarios() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'declaration-impot-lu.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      applySerialized(payload.donnees || payload);
      if (Array.isArray(payload.scenarios)) saveScenarios(payload.scenarios);
      recalc();
    } catch (err) {
      alert('Fichier illisible : ' + err.message);
    }
    e.target.value = '';
  });

  // ---------------------------------------------------------------------------
  // Analyse d'un certificat de rémunération collé
  // ---------------------------------------------------------------------------
  const dlg = $('dlg-certificat');
  $('btn-certificat').addEventListener('click', () => {
    $('row-certificat-cible').hidden = document.querySelector('.conjoint-only[hidden]') !== null;
    $('certificat-result').textContent = '';
    dlg.showModal();
  });
  $('btn-certificat-annuler').addEventListener('click', () => dlg.close());

  function parseMontant(str) {
    // "12 345,67", "12.345,67" ou "12345.67" → nombre
    let s = str.replace(/[\s ']/g, '');
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function analyserCertificat(text) {
    // Le montant doit commencer par un chiffre (sinon la capture s'arrête sur les espaces avant « : »)
    const M = '(\\d[\\d.,\\s\\u00a0\']*)';
    const patterns = [
      { champ: 'salaireBrut', re: new RegExp('(?:r[ée]mun[ée]ration\\s+brute|salaire\\s+brut|brut[t]?o?lohn|total\\s+brut)\\D{0,40}?' + M, 'i') },
      { champ: 'impotsRetenus', re: new RegExp('(?:imp[oô]t\\s+retenu|retenue\\s+d\'?imp[oô]t|lohnsteuer)\\D{0,40}?' + M, 'i') },
      { champ: 'cotisations', re: new RegExp('(?:cotisations\\s+sociales?|charges\\s+sociales|sozialversicherung)\\D{0,40}?' + M, 'i') },
      { champ: 'creditsVerses', re: new RegExp('(?:cr[ée]dits?\\s+d\'?imp[oô]t\\s+(?:vers[ée]s?|boniﬁ[ée]s?|bonifi[ée]s?))\\D{0,40}?' + M, 'i') },
    ];
    const found = {};
    for (const { champ, re } of patterns) {
      const m = text.match(re);
      if (m) {
        const val = parseMontant(m[1]);
        if (val != null && val > 0) found[champ] = val;
      }
    }
    return found;
  }

  $('btn-certificat-analyser').addEventListener('click', () => {
    const text = $('certificat-text').value;
    const out = $('certificat-result');
    if (!text.trim()) { out.textContent = 'Collez d\'abord le texte du certificat.'; out.className = 'cert-result err'; return; }
    const found = analyserCertificat(text);
    if (!Object.keys(found).length) {
      out.textContent = 'Aucun montant reconnu — vérifiez que le texte contient « rémunération brute », « impôt retenu »…';
      out.className = 'cert-result err';
      return;
    }
    const conjoint = $('certificat-conjoint').checked && !$('row-certificat-cible').hidden;
    const applique = [];
    if (found.salaireBrut) {
      form.elements[conjoint ? 'salaireBrut2' : 'salaireBrut1'].value = Math.round(found.salaireBrut);
      applique.push(`salaire brut ${eur(found.salaireBrut)}`);
    }
    if (found.impotsRetenus) {
      const cur = parseFloat(form.elements.impotsRetenus.value) || 0;
      form.elements.impotsRetenus.value = Math.round(cur + found.impotsRetenus);
      applique.push(`impôt retenu ${eur(found.impotsRetenus)}`);
    }
    if (found.cotisations) {
      const cur = parseFloat(form.elements.cotisationsOverride.value) || 0;
      form.elements.cotisationsOverride.value = Math.round(cur + found.cotisations);
      applique.push(`cotisations ${eur(found.cotisations)}`);
    }
    out.textContent = '✓ Reporté : ' + applique.join(', ') + '.';
    out.className = 'cert-result';
    recalc();
  });

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
      renderResult(res);
      renderAssimilation(res);
      renderOptimization(d, res);
      renderM100(d, res);
      renderScenarios(res);
      renderDeadlineBanner(d);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeForm())); } catch (e) { /* ignore */ }
    });
  }

  form.addEventListener('input', recalc);
  form.addEventListener('change', recalc);
  // Le sélecteur d'année vit dans la barre supérieure, hors du <form> : ses
  // événements ne remontent pas jusqu'au formulaire.
  $('sel-annee').addEventListener('change', recalc);
  form.addEventListener('submit', (e) => e.preventDefault());

  $('btn-reset').addEventListener('click', () => {
    if (!confirm('Effacer toutes les données saisies ? (les scénarios sont conservés)')) return;
    form.reset();
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    recalc();
  });

  $('btn-print').addEventListener('click', () => {
    $('out-detail').open = true;
    $('m100-details').open = true;
    window.print();
  });

  // PWA : service worker (hors ligne)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible */ });
  }

  // Restauration
  initTheme();
  (function restore() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { saved = null; }
    applySerialized(saved);
  })();
  recalc();
})();
