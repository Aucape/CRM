/* Tests de cohérence du moteur fiscal — exécuter avec : node tests/engine.test.js */
'use strict';
const E = require('../js/tax-engine.js');

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log('  ✓ ' + label);
  else { failures++; console.error('  ✗ ' + label + (extra != null ? ' — ' + extra : '')); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.5 : tol); }

console.log('Barème 2025');
check('0 € en dessous de 13 230 €', E.tarifBase(13230) === 0);
check('première tranche : 8 % sur 15 435 − 13 230', approx(E.tarifBase(15435), 2205 * 0.08));
// Somme complète jusqu'à 54 090 € puis 39 %
const t54090 = E.tarifBase(54090);
const attendu54090 = 2205 * (0.08 + 0.09 + 0.10 + 0.11 + 0.12) + 2295 * (0.14 + 0.16 + 0.18 + 0.20 + 0.22 + 0.24 + 0.26 + 0.28 + 0.30 + 0.32 + 0.34 + 0.36 + 0.38);
check('cumul à 54 090 €', approx(t54090, attendu54090, 1), t54090 + ' vs ' + attendu54090);
check('taux marginal 42 % au-delà de 234 870 €', approx(E.tarifBase(234970) - E.tarifBase(234870), 42));

console.log('Classes d\'impôt');
check('classe 2 = splitting', approx(E.impotSelonClasse(80000, '2'), 2 * E.tarifBase(40000)));
check('classe 1a exonérée jusqu\'à 26 460 €', E.impotSelonClasse(26460, '1a') === 0);
check('classe 1a < classe 1 sous 52 920 €', E.impotSelonClasse(40000, '1a') < E.impotSelonClasse(40000, '1'));
check('classe 1a = classe 1 à partir de 52 920 €', E.impotSelonClasse(60000, '1a') === E.impotSelonClasse(60000, '1'));

console.log('Détermination de classe');
check('célibataire → 1', E.classeImpot({ statut: 'celibataire' }) === '1');
check('célibataire + enfant → 1a', E.classeImpot({ statut: 'celibataire', enfants: 1 }) === '1a');
check('65 ans → 1a', E.classeImpot({ statut: 'celibataire', age: 66 }) === '1a');
check('marié → 2', E.classeImpot({ statut: 'marie' }) === '2');
check('divorcé < 3 ans → 2', E.classeImpot({ statut: 'divorce', transitionMoins3Ans: true }) === '2');

console.log('Calcul complet — célibataire 60 000 € brut');
const d1 = E.defaultInput();
d1.revenus.salaireBrut1 = 60000;
const r1 = E.compute(d1);
check('classe 1', r1.classe === '1');
check('cotisations ≈ 11,05 %', approx(r1.revenus.cotisations, 6630));
check('forfait FO 540 € appliqué', r1.revenus.fo1 === 540);
check('minimum DS ≥ cotisations (pas de minimum ici)', r1.ds.total >= 6630);
check('CIS nul à 60 000 ? non : 600 − 20000×0,015 = 300', approx(r1.credits.cis, 300));
check('CI-CO2 : 168 − 20000×0,0042 = 84', approx(r1.credits.co2, 84));
check('impôt positif', r1.impotDu > 0);
console.log('    → revenu imposable', r1.revenuImposable, '| impôt dû', r1.impotDu, '| taux moyen', (r1.tauxMoyen * 100).toFixed(1) + '%', '| marginal', (r1.tauxMarginal * 100).toFixed(1) + '%');

console.log('Fonds pour l\'emploi');
check('7 % appliqué', approx(r1.majorationFE, r1.impotBareme * 0.07, 0.01));

console.log('Déductions plafonnées');
const d2 = E.defaultInput();
d2.revenus.salaireBrut1 = 60000;
d2.deductions.prevoyance1 = 5000;      // > 3 200
d2.deductions.assurances = 2000;       // > 672 × 1
d2.deductions.epargneLogement = 2000;  // > 672 × 1 (âge 0 → plafond standard)
const r2c = E.compute(d2);
check('prévoyance plafonnée à 3 200 €', r2c.ds.prevoyance1 === 3200);
check('assurances plafonnées à 672 €', r2c.ds.assurances === 672);
check('épargne-logement plafonnée à 672 €', r2c.ds.epargneLogement === 672);
check('impôt réduit vs sans déductions', r2c.impotDu < r1.impotDu);

console.log('Couple marié — splitting et abattement extra-professionnel');
const d3 = E.defaultInput();
d3.situation.statut = 'marie';
d3.revenus.salaireBrut1 = 50000;
d3.revenus.salaireBrut2 = 30000;
const r3 = E.compute(d3);
check('classe 2', r3.classe === '2');
check('abattement extra-professionnel 4 500 €', r3.abattementExtraPro === 4500);
check('ménage = 2 pour plafonds', r3.ds.plafondAssurances === 1344);
const cmp = E.compareCollectiveIndividuelle(d3);
check('comparaison collective/individuelle disponible', cmp !== null && typeof cmp.avantageCollective === 'number');
console.log('    → collective', cmp.collective, '€ vs individuelle', cmp.individuelle, '€ (avantage', cmp.avantageCollective, '€)');

console.log('Monoparental — CIM');
const d4 = E.defaultInput();
d4.situation.statut = 'celibataire';
d4.situation.enfants = 1;
d4.revenus.salaireBrut1 = 45000;
const r4 = E.compute(d4);
check('classe 1a', r4.classe === '1a');
check('CIM = 3 504 € (revenu < 60 000)', r4.credits.cim === 3504);

console.log('Optimiseur');
const opt = E.optimize(d1);
check('suggestions présentes', opt.suggestions.length >= 3);
const prev = opt.suggestions.find((s) => s.id === 'prevoyance1');
check('suggestion prévoyance : effort 3 200 €', prev && prev.effort === 3200);
check('gain prévoyance > 1 000 € à 60 k€ (marginal ~39-42 %)', prev && prev.gain > 1000, prev && prev.gain);
console.log('    → suggestions :', opt.suggestions.map((s) => s.id + (s.gain != null ? ' (+' + s.gain + '€)' : '')).join(', '));

console.log('Intérêts hypothécaires');
const d5 = E.defaultInput();
d5.revenus.salaireBrut1 = 60000;
d5.deductions.interetsHypotheque = 6000;
d5.deductions.hypoDisponibilite = 'de2019a2022';
const r5 = E.compute(d5);
check('plafond 4 000 € × 1 personne', r5.revenus.interetsHypo === 4000);
d5.deductions.hypoDisponibilite = 'apres2022';
check('déduction intégrale après 2022', E.compute(d5).revenus.interetsHypo === 6000);

console.log('Charges extraordinaires — charge normale');
check('table : 60 k€, 0 enfant → 9 %', E.chargeNormalePct(60000, 0) === 0.09);
check('table : 60 k€, 2 enfants → 6 %', E.chargeNormalePct(60000, 2) === 0.06);
check('table : 70 k€, 0 enfant → 10 %', E.chargeNormalePct(70000, 0) === 0.10);

if (failures) { console.error('\n' + failures + ' échec(s)'); process.exit(1); }
console.log('\nTous les tests passent ✓');
