/* Tests de cohérence du moteur fiscal v2 — exécuter avec : node tests/engine.test.js */
'use strict';
const E = require('../js/tax-engine.js');

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log('  ✓ ' + label);
  else { failures++; console.error('  ✗ ' + label + (extra != null ? ' — ' + extra : '')); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.5 : tol); }

// ---------------------------------------------------------------------------
console.log('Barème 2025');
check('0 € en dessous de 13 230 €', E.tarifBase(13230) === 0);
check('première tranche : 8 % sur 15 435 − 13 230', approx(E.tarifBase(15435), 2205 * 0.08));
const t54090 = E.tarifBase(54090);
const attendu54090 = 2205 * (0.08 + 0.09 + 0.10 + 0.11 + 0.12) +
  2295 * (0.14 + 0.16 + 0.18 + 0.20 + 0.22 + 0.24 + 0.26 + 0.28 + 0.30 + 0.32 + 0.34 + 0.36 + 0.38);
check('cumul à 54 090 €', approx(t54090, attendu54090, 1), t54090 + ' vs ' + attendu54090);
check('taux marginal 42 % au-delà de 234 870 €', approx(E.tarifBase(234970) - E.tarifBase(234870), 42));

console.log('Classes d\'impôt');
check('classe 2 = splitting', approx(E.impotSelonClasse(80000, '2'), 2 * E.tarifBase(40000)));
check('classe 1a exonérée jusqu\'à 26 460 €', E.impotSelonClasse(26460, '1a') === 0);
check('classe 1a < classe 1 sous 52 920 €', E.impotSelonClasse(40000, '1a') < E.impotSelonClasse(40000, '1'));
check('classe 1a = classe 1 dès 52 920 €', E.impotSelonClasse(60000, '1a') === E.impotSelonClasse(60000, '1'));

console.log('Détermination de classe');
check('célibataire → 1', E.classeImpot({ statut: 'celibataire' }) === '1');
check('célibataire + enfant → 1a', E.classeImpot({ statut: 'celibataire', enfants: 1 }) === '1a');
check('65 ans → 1a', E.classeImpot({ statut: 'celibataire', age: 66 }) === '1a');
check('marié → 2', E.classeImpot({ statut: 'marie' }) === '2');
check('divorcé < 3 ans → 2', E.classeImpot({ statut: 'divorce', transitionMoins3Ans: true }) === '2');

// ---------------------------------------------------------------------------
console.log('Calcul complet — célibataire 60 000 € (2025)');
const d1 = E.defaultInput();
d1.revenus.salaireBrut1 = 60000;
const r1 = E.compute(d1);
check('classe 1', r1.classe === '1');
check('cotisations ≈ 11,05 %', approx(r1.revenus.cotisations, 6630));
check('forfait FO 540 €', r1.revenus.fo1 === 540);
check('CIS : 600 − 20 000 × 0,015 = 300', approx(r1.credits.cis, 300));
check('CI-CO2 : 168 − 20 000 × 0,0042 = 84', approx(r1.credits.co2, 84));
check('fonds pour l\'emploi 7 %', approx(r1.majorationFE, r1.impotBareme * 0.07, 0.01));
check('impôt positif', r1.impotDu > 0);
console.log('    → revenu imposable', r1.revenuImposable, '| impôt dû', r1.impotDu);

console.log('Année 2026 — nouveaux plafonds');
const d26 = JSON.parse(JSON.stringify(d1));
d26.annee = 2026;
d26.deductions.prevoyance1 = 5000;
d26.deductions.assurances = 1200;
d26.deductions.epargneLogement = 1200;
d26.situation.age = 35;
const r26 = E.compute(d26);
check('prévoyance plafonnée à 4 500 €', r26.ds.prevoyance1 === 4500);
check('assurances plafonnées à 900 €', r26.ds.assurances === 900);
check('épargne-logement 18-40 ans plafonnée à 1 500 €', r26.ds.epargneLogement === 1200 || r26.ds.epargneLogement === 1200);
check('plafond EL 2026 = 1 500 €', r26.ds.plafondEL === 1500);
const d26b = JSON.parse(JSON.stringify(d26));
d26b.deductions.epargneLogement = 2000;
check('épargne-logement écrêtée à 1 500 €', E.compute(d26b).ds.epargneLogement === 1500);

console.log('Plafonds 2025');
const d2 = E.defaultInput();
d2.revenus.salaireBrut1 = 60000;
d2.deductions.prevoyance1 = 5000;
d2.deductions.assurances = 2000;
d2.deductions.epargneLogement = 2000;
const r2c = E.compute(d2);
check('prévoyance plafonnée à 3 200 €', r2c.ds.prevoyance1 === 3200);
check('assurances plafonnées à 672 €', r2c.ds.assurances === 672);
check('épargne-logement plafonnée à 672 €', r2c.ds.epargneLogement === 672);

console.log('Plafond cotisable CCSS');
const dCap = E.defaultInput();
dCap.revenus.salaireBrut1 = 300000;
const rCap = E.compute(dCap);
check('cotisations plafonnées à l\'assiette max', approx(rCap.revenus.cotisations, 158267 * 0.1105, 1), rCap.revenus.cotisations);

// ---------------------------------------------------------------------------
console.log('Couple marié — splitting, abattement, modes art. 3ter');
const d3 = E.defaultInput();
d3.situation.statut = 'marie';
d3.revenus.salaireBrut1 = 50000;
d3.revenus.salaireBrut2 = 30000;
const r3 = E.compute(d3);
check('classe 2', r3.classe === '2');
check('abattement extra-professionnel 4 500 €', r3.abattementExtraPro === 4500);
check('plafond assurances ménage ×2', r3.ds.plafondAssurances === 1344);
const cmp = E.comparerModes(d3);
check('trois modes calculés', cmp && cmp.collective > 0 && cmp.individuelle > 0 && cmp.reallocation > 0);
check('collective ≤ individuelle pure (revenus déséquilibrés)', cmp.collective <= cmp.individuelle + 0.5);
check('réallocation ≈ collective à crédits près', Math.abs(cmp.reallocation - cmp.collective) < 500, cmp.reallocation + ' vs ' + cmp.collective);
console.log('    → collective', cmp.collective, '| individuelle', cmp.individuelle, '| réallocation', cmp.reallocation);

console.log('Abattement extra-pro avec bénéfice indépendant');
const d3b = JSON.parse(JSON.stringify(d3));
d3b.revenus.salaireBrut2 = 0;
d3b.revenus.beneficeIndependant2 = 25000;
const r3b = E.compute(d3b);
check('deux revenus professionnels (salaire + indépendant) → abattement', r3b.abattementExtraPro === 4500);
check('CII accordé sur le bénéfice', r3b.credits.cii > 0);

// ---------------------------------------------------------------------------
console.log('Non-résident — assimilation et réserve de progressivité');
const dFr = E.defaultInput();
dFr.situation.resident = false;
dFr.situation.paysResidence = 'FR';
dFr.revenus.salaireBrut1 = 50000;
dFr.revenus.revenusEtrangers1 = 2000; // < 13 000 → assimilé
const rFr = E.compute(dFr);
check('assimilé (étranger < 13 000 €)', rFr.assimile === true);
const dFr2 = JSON.parse(JSON.stringify(dFr));
dFr2.revenus.revenusEtrangers1 = 30000; // 62,5 % LU → non assimilé
const rFr2 = E.compute(dFr2);
check('non assimilé (< 90 % au Luxembourg)', rFr2.assimilation.assimile === false);
check('règle belge des 50 % pour un résident BE', (() => {
  const dBe = JSON.parse(JSON.stringify(dFr2));
  dBe.situation.paysResidence = 'BE';
  return E.compute(dBe).assimilation.assimile === true;
})());
// Réserve de progressivité : impôt = T(R+F) × R/(R+F)
const rSans = E.compute((() => { const x = JSON.parse(JSON.stringify(dFr)); x.revenus.revenusEtrangers1 = 0; return x; })());
check('la réserve de progressivité augmente l\'impôt', rFr.impotDu > rSans.impotDu, rFr.impotDu + ' vs ' + rSans.impotDu);
check('… sans imposer le revenu étranger (impôt < barème sur le total)', (() => {
  const Rtot = rFr.revenuImposable + 2000;
  const brut = E.impotSelonClasse(Rtot, '1');
  return rFr.impotBareme < brut;
})());

console.log('Résident avec revenus exonérés par convention');
const dConv = E.defaultInput();
dConv.revenus.salaireBrut1 = 40000;
dConv.revenus.revenusEtrangers1 = 20000;
const rConv = E.compute(dConv);
check('réserve appliquée aussi aux résidents', rConv.impotDu > E.compute((() => { const x = JSON.parse(JSON.stringify(dConv)); x.revenus.revenusEtrangers1 = 0; return x; })()).impotDu);

// ---------------------------------------------------------------------------
console.log('Revenus locatifs — amortissement');
const dLoc = E.defaultInput();
dLoc.revenus.salaireBrut1 = 60000;
dLoc.revenus.location = { loyersBruts: 12000, fraisEntretien: 1000, chargesAssurances: 500, interetsEmprunt: 4000, valeurConstruction: 300000, anneeAchevement: 2023 };
const rLoc = E.compute(dLoc);
check('amortissement accéléré 4 % (achevé < 5 ans)', approx(rLoc.revenus.location.amortissement, 12000));
check('revenu locatif net = 12 000 − 1 000 − 500 − 4 000 − 12 000 = −5 500', approx(rLoc.revenus.location.net, -5500));
check('le déficit locatif réduit l\'impôt', rLoc.impotDu < r1.impotDu);
const dLoc2 = JSON.parse(JSON.stringify(dLoc));
dLoc2.revenus.location.anneeAchevement = 2000;
check('amortissement normal 2 % (bâtiment ancien)', approx(E.compute(dLoc2).revenus.location.amortissement, 6000));

console.log('Plus-values');
const dPv = E.defaultInput();
dPv.revenus.salaireBrut1 = 60000;
dPv.revenus.pvLongTerme = 80000;
const rPv = E.compute(dPv);
check('abattement décennal 50 000 € appliqué', approx(rPv.pv.abattement, 50000));
check('plus-value nette 30 000 €', approx(rPv.pv.net, 30000));
check('demi-taux < taux moyen barème', rPv.pv.tauxApplique < 0.21);
check('impôt PV = net × demi-taux', approx(rPv.pv.impot, rPv.pv.net * rPv.pv.tauxApplique, 1));
const dPv2 = JSON.parse(JSON.stringify(dPv));
dPv2.situation.statut = 'marie';
check('abattement doublé pour un couple (100 000 €)', approx(E.compute(dPv2).pv.abattement, 80000)); // plafonné à la PV elle-même
const dPv3 = JSON.parse(JSON.stringify(dPv));
dPv3.revenus.pvSpeculation = 10000;
check('spéculation imposée au plein tarif (impôt supérieur)', E.compute(dPv3).impotDu > rPv.impotDu);

// ---------------------------------------------------------------------------
console.log('Monoparental — CIM');
const d4 = E.defaultInput();
d4.situation.enfants = 1;
d4.revenus.salaireBrut1 = 45000;
const r4 = E.compute(d4);
check('classe 1a', r4.classe === '1a');
check('CIM = 3 504 € (revenu < 60 000)', r4.credits.cim === 3504);

console.log('Optimiseur');
const opt = E.optimize(d1);
check('suggestions présentes', opt.suggestions.length >= 3);
const prev = opt.suggestions.find((s) => s.id === 'prevoyance1');
check('prévoyance : effort 3 200 €', prev && prev.effort === 3200);
check('gain simulé exact > 1 000 €', prev && prev.gain > 1000, prev && prev.gain);
check('suggestions marquées « avant le 31/12 »', opt.suggestions.some((s) => s.avant3112));

console.log('Intérêts hypothécaires');
const d5 = E.defaultInput();
d5.revenus.salaireBrut1 = 60000;
d5.deductions.interetsHypotheque = 6000;
d5.deductions.hypoDisponibilite = 'de2019a2022';
check('plafond 4 000 € × 1 personne', E.compute(d5).revenus.interetsHypo === 4000);
d5.deductions.hypoDisponibilite = 'apres2022';
check('déduction intégrale après 2022', E.compute(d5).revenus.interetsHypo === 6000);

console.log('Charge normale (art. 127)');
check('60 k€, 0 enfant → 9 %', E.chargeNormalePct(60000, 0) === 0.09);
check('60 k€, 2 enfants → 6 %', E.chargeNormalePct(60000, 2) === 0.06);
check('70 k€, 0 enfant → 10 %', E.chargeNormalePct(70000, 0) === 0.10);

console.log('Guide modèle 100');
const g = E.guideModele100(dLoc, rLoc);
check('rubrique salaires présente', g.lignes.some((l) => l.rubrique.includes('occupation salariée')));
check('rubrique location présente', g.lignes.some((l) => l.rubrique.includes('location')));
check('pièces justificatives listées', g.pieces.length >= 2);

// ---------------------------------------------------------------------------
console.log('Cas de référence (goldens, vérifiés à la main sur le barème 2025)');
// Classe 1, revenu imposable ajusté exactement 30 000 € (autres revenus, pas de crédits)
const dg1 = E.defaultInput();
dg1.revenus.autresRevenusNets = 30480; // − 480 DS minimum = 30 000
const rg1 = E.compute(dg1);
check('revenu imposable = 30 000 €', rg1.revenuImposable === 30000, rg1.revenuImposable);
// T(30 000) = 2 205×(0,08+0,09+0,10+0,11+0,12) + 2 295×(0,14+0,16) + (30 000−28 845)×0,18
//           = 1 102,50 + 688,50 + 207,90 = 1 998,90
check('impôt barème = 1 998,90 €', approx(rg1.impotBareme, 1998.90, 0.01), rg1.impotBareme);
check('impôt total = 1 998,90 × 1,07 = 2 138,82 €', approx(rg1.impotDu, 2138.82, 0.05), rg1.impotDu);
// Classe 2, revenu 60 000 → 2 × T(30 000) = 3 997,80 ; ×1,07 = 4 277,65
const dg2 = E.defaultInput();
dg2.situation.statut = 'marie';
dg2.revenus.autresRevenusNets = 60480;
const rg2 = E.compute(dg2);
check('classe 2 : impôt = 4 277,65 €', approx(rg2.impotDu, 4277.65, 0.05), rg2.impotDu);
// Classe 1a à 40 000 : T(1,5×40 000 − 26 460 = 33 540)
// = 1 102,50 + 2 295×(0,14+0,16+0,18) + 2 295×0,20 + (33 540−33 435)×0,22
// = 1 102,50 + 1 101,60 + 459,00 + 23,10 = 2 686,20
const dg3 = E.defaultInput();
dg3.situation.age = 66;
dg3.revenus.autresRevenusNets = 40480;
const rg3 = E.compute(dg3);
check('classe 1a : barème(1,5R − V/2) = 2 686,20 €', approx(rg3.impotBareme, 2686.20, 0.01), rg3.impotBareme);

if (failures) { console.error('\n' + failures + ' échec(s)'); process.exit(1); }
console.log('\nTous les tests passent ✓');
