# Simulateur de déclaration d'impôt — Luxembourg 2025

Webapp statique (aucune dépendance, aucun build) qui simule l'impôt sur le revenu
luxembourgeois pour l'**année d'imposition 2025** (déclaration modèle 100 à remettre en 2026)
et propose des **optimisations fiscales chiffrées**.

## Lancer l'application

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```bash
cd projects/impot-lu
python3 -m http.server 8080
# → http://localhost:8080
```

## Fonctionnalités

**Calcul de l'impôt**
- Barème progressif 2025 (0 % → 42 %, art. 118 LIR) et fonds pour l'emploi (7 % / 9 %)
- Classes d'impôt 1, 1a (formule art. 120bis) et 2 (splitting), détermination automatique
- Frais de déplacement (forfait kilométrique), frais d'obtention (forfait 540 € / frais réels)
- Dépenses spéciales : cotisations sociales, assurances & intérêts débiteurs (672 €/pers.),
  prévoyance-vieillesse (3 200 €/souscripteur), épargne-logement (672 € ou 1 344 €/pers.),
  dons (≥ 120 €), pension alimentaire (≤ 24 000 €)
- Intérêts hypothécaires de l'habitation principale (plafonds selon la date de mise à disposition)
- Charges extraordinaires : garde d'enfants / domesticité (5 400 €), enfants hors ménage,
  charge normale (art. 127 LIR)
- Abattement extra-professionnel (4 500 €)
- Crédits d'impôt : CIS/CIP, CI-CO2, CIM monoparental (barèmes 2025)
- Solde à payer / remboursement d'après les retenues à la source saisies

**Optimisation**
- Chaque levier inutilisé (prévoyance, assurances, épargne-logement, garde d'enfants, dons…)
  est **re-simulé dans le moteur complet** : le gain affiché est le delta d'impôt exact,
  pas une approximation au taux marginal
- Comparaison imposition collective (classe 2) vs imposition individuelle pure pour les couples
- Conseils hors déclaration (plafond prévoyance 4 500 € dès 2026, chèques-repas,
  prime participative, régime impatriés, RELIBI…)

## Structure

```
impot-lu/
├── index.html          Interface (formulaire + résultats en direct)
├── css/styles.css
├── js/tax-engine.js    Moteur de calcul pur (utilisable aussi sous Node)
├── js/app.js           Logique d'interface (rendu, localStorage)
└── tests/engine.test.js
```

## Tests

```bash
node tests/engine.test.js
```

## Avertissement

Outil purement indicatif, fondé sur les paramètres publiés par l'Administration des
contributions directes pour 2025. Il ne remplace ni le bulletin d'imposition officiel,
ni le conseil d'un professionnel. Les données saisies restent dans le navigateur
(localStorage) et ne sont transmises à aucun serveur.
