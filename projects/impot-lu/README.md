# Simulateur de déclaration d'impôt — Luxembourg

Webapp statique (aucune dépendance, aucun build) qui simule l'impôt sur le revenu
luxembourgeois — **années d'imposition 2025 et 2026** — pour les **résidents et les
frontaliers**, et propose des **optimisations fiscales chiffrées**.

## Lancer l'application

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```bash
cd projects/impot-lu
python3 -m http.server 8080
# → http://localhost:8080
```

Servie en HTTPS/localhost, l'application est installable (PWA) et fonctionne hors ligne.

## Fonctionnalités

**Calcul de l'impôt**
- Barème progressif (art. 118 LIR) + fonds pour l'emploi (7 %/9 %), classes 1, 1a
  (formule art. 120bis) et 2 (splitting) déterminées automatiquement
- **Multi-années** : 2025 (définitif) et 2026 (provisoire : prévoyance 4 500 €,
  assurances 900 €, épargne-logement 1 500/900 €)
- **Non-résidents / frontaliers** : vérification de l'assimilation fiscale
  (art. 157ter — seuils 90 % / 13 000 €, règle belge des 50 %) et **réserve de
  progressivité** (art. 134) sur les revenus étrangers exonérés
- **Couples (art. 3ter)** : comparaison chiffrée imposition collective /
  individuelle pure / individuelle avec réallocation 50/50
- **Revenus locatifs** : loyers, frais, intérêts d'emprunt et **amortissement**
  (2 %, ou 4 % accéléré si achèvement < 5 ans)
- **Plus-values** : spéculation (plein tarif) et cessions long terme au
  **demi-taux global** (art. 131) avec abattement décennal (art. 130)
- Salaires, pensions, **bénéfices d'indépendant** (avec CII), capitaux mobiliers
  (exemption 50 % dividendes, abattement 1 500/3 000 €)
- Frais de déplacement, frais d'obtention, dépenses spéciales (assurances,
  prévoyance-vieillesse, épargne-logement, dons, pension alimentaire),
  cotisations sociales (assiette plafonnée CCSS), intérêts hypothécaires de
  l'habitation principale, charges extraordinaires avec charge normale (art. 127),
  abattement extra-professionnel
- Crédits d'impôt CIS/CIP/CII, CI-CO2, CIM monoparental — solde à payer /
  remboursement d'après les retenues saisies

**Optimisation**
- Chaque levier inutilisé est **re-simulé dans le moteur complet** : gain exact,
  effort à mobiliser, rendement fiscal, total potentiel
- Carte « **À faire avant le 31 décembre** » (compte à rebours + montants) et
  **export .ics** de rappels calendrier (versements, préparation, date limite)
- Conseils hors déclaration (chèques-repas, prime participative, impatriés, RELIBI…)

**Aide à la déclaration**
- **Guide de recopie modèle 100** : rubriques et pages du formulaire d'après vos
  saisies + **checklist des pièces justificatives**
- **Pré-remplissage** depuis le texte collé d'un certificat de rémunération
  (salaire brut, impôt retenu, cotisations)
- **Scénarios** : enregistrez et comparez plusieurs stratégies (écarts d'impôt)
- **Export / import JSON** de l'ensemble du dossier
- Bannière d'échéance, impression du récapitulatif

**Technique**
- Mode sombre (bascule + préférence système), focus visibles, `aria-live`
- PWA : `manifest.json` + service worker (cache hors ligne)
- Les données restent dans le navigateur (localStorage) — aucun serveur

## Structure

```
impot-lu/
├── index.html          Interface (formulaire + résultats en direct)
├── css/styles.css      Thèmes clair/sombre
├── js/tax-engine.js    Moteur de calcul pur (utilisable aussi sous Node)
├── js/app.js           Logique d'interface
├── sw.js, manifest.json, icons/   PWA
└── tests/engine.test.js
```

## Tests

```bash
node tests/engine.test.js
```

74 assertions : barème (valeurs de référence vérifiées à la main), classes,
plafonds 2025/2026, CCSS, assimilation frontaliers, réserve de progressivité,
modes art. 3ter, amortissement locatif, demi-taux des plus-values, CIM,
optimiseur, guide modèle 100.

## Limites connues

- Paramètres 2026 provisoires (barème non indexé à ce jour)
- L'imposition individuelle répartit les éléments communs par moitié
  (la loi permet une autre répartition sur demande conjointe)
- Charge normale, forfaits CE et numéros de pages du modèle 100 à vérifier
  sur le millésime officiel de l'année

## Avertissement

Outil purement indicatif, fondé sur les paramètres publiés par l'Administration
des contributions directes. Il ne remplace ni le bulletin d'imposition officiel,
ni le conseil d'un professionnel.
