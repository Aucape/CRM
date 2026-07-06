# ⚽ Président FC — jeu de gestion de club de football

Jeu mobile **solo, 100 % hors ligne**, en français. Vous êtes le **président / directeur
sportif** du club — jamais l'entraîneur. Vous ne choisissez ni la composition ni la
tactique : vous construisez le club (recrutement, staff, infrastructures, sponsors,
finances) et surtout vous **formez les jeunes, des U8 aux U19**. Vos coachs disputent
les matchs, entièrement simulés.

## 1. Choix de stack et justification

**Web app statique : HTML + CSS + JavaScript pur (ES modules), zéro dépendance, zéro build.**

- **Coût nul, sans exception** : aucun framework, aucune bibliothèque, aucun service
  payant. Tout est écrit à la main ; les « assets » sont des formes CSS, des emojis
  système et un SVG codé (aucune ressource protégée par droit d'auteur).
- **Hébergeable partout** : un simple dossier de fichiers statiques — Hostinger
  (mutualisé compris), GitHub Pages, Netlify… Il suffit de copier le dossier.
- **100 % hors ligne** : service worker (cache-first) → après le premier chargement,
  le jeu fonctionne sans réseau ; installable comme PWA (icône sur l'écran d'accueil,
  plein écran portrait).
- **Sauvegarde locale** : auto-save après chaque semaine + 3 slots manuels, stockés
  dans IndexedDB (repli localStorage).
- **Performance** : la simulation d'une semaine complète — 8 matchs pros + 48 matchs
  de jeunes (6 catégories × 8 matchs) + entraînement de ~2 000 joueurs + finances des
  16 clubs — prend **~8 ms** (mesuré sous Node ; largement < 1 s sur mobile de milieu
  de gamme).

### Architecture

```
football-manager/
├── index.html               point d'entrée
├── manifest.webmanifest     PWA (installable, portrait)
├── sw.js                    service worker → hors ligne
├── icon.svg                 icône générée (SVG codé)
├── css/style.css            styles mobile-first (portrait)
└── js/
    ├── config.js            ★ FICHIER D'ÉQUILIBRAGE CENTRALISÉ (commenté)
    ├── storage.js           sauvegardes (IndexedDB + repli localStorage)
    ├── engine/              ★ MOTEUR DE SIMULATION — JS pur, AUCUNE référence au DOM
    │   ├── rng.js           aléatoire déterministe (état sauvegardé)
    │   ├── names.js         générateur de noms fictifs (joueurs, clubs, sponsors)
    │   ├── player.js        joueur : génération, note, valeur, progression, vieillissement
    │   ├── staff.js         coachs, adjoints, préparateurs, médecin, DR, scouts
    │   ├── club.js          club : effectif pro, 6 équipes de jeunes, infra, sponsors
    │   ├── league.js        calendrier round-robin, classements
    │   ├── match.js         moteur de match (sélection du 11 par le coach + simulation)
    │   ├── messages.js      messagerie du président
    │   ├── sponsors.js      offres, négociation, satisfaction, renouvellements
    │   ├── board.js         conseil d'administration : objectifs, confiance
    │   ├── finance.js       flux hebdomadaires, billetterie, alertes trésorerie
    │   ├── market.js        scouting, marché des jeunes et marché pro, négociations
    │   ├── ai.js            comportement des 15 clubs IA (formateur/acheteur/équilibré)
    │   ├── week.js          orchestration « Semaine suivante »
    │   ├── season.js        fin de saison : bilan, intake, montées, vieillissement
    │   └── game.js          FAÇADE : seul module importé par l'UI
    └── ui/                  interface (lit l'état du moteur, appelle ses actions)
        ├── app.js           rendu racine, navigation, délégation d'événements
        ├── state.js         état UI partagé + registre d'actions
        ├── helpers.js       composants d'affichage
        ├── screens-accueil.js   titre, bureau, messagerie, conseil, sauvegardes, game over
        ├── screens-club.js      pros, jeunes U8→U19, staff, infra, fiche joueur
        ├── screens-marche.js    transferts, agents libres, scouting
        └── screens-finligue.js  finances, sponsors, championnat, fiche de match
```

**Le moteur est totalement découplé de l'UI** : `js/engine/` ne touche jamais au DOM et
s'exécute tel quel sous Node.js (c'est ainsi que l'équilibrage a été testé sur des
saisons complètes). L'UI ne fait que lire l'état et appeler les actions de la façade
`game.js`. Une v2 (divisions multiples, coupes, prêts, visualisation 2D, autre front)
peut remplacer ou compléter l'UI sans toucher au moteur.

## 2. Modèle de données (objets sérialisés dans la sauvegarde)

```
game
├── rngState                 état du générateur aléatoire (parties reproductibles)
├── saison, semaine          semaines 1-30 : journées ; 31-32 : mercato d'intersaison
├── phase                    'saison' | 'mercato'
├── clubs[16]                → club
├── ligues
│   ├── pro                  { calendrier[30][8], table{clubId→stats}, resultats[] }
│   └── jeunes.U8…U19        idem (mini-championnat par catégorie)
├── rapports{}               fiches de match détaillées du club joueur (saison courante)
├── messages[]               { type, titre, corps, actions[{label, action, data}], lu, traite }
├── marche                   { transferts[{joueurId, clubId, prix, connu, fourchette}], libres[joueur] }
├── candidatsStaff{}         candidats par rôle (régénérés chaque saison)
└── gameOver                 null | { type: 'faillite'|'revocation', … }

club
├── nom, ville, couleurs, estJoueur, profil ('formateur'|'acheteur'|'equilibre')
├── reputation (0-100), tresorerie, semainesRouge, budgetMercato
├── joueurs[≈22]             effectif pro → joueur
├── jeunes.U8…U19            { joueurs[14-18], invest (0-10), coach, adjoint, prepa }
├── staff                    { coachPrincipal, adjoint, prepa, medecin, directeurRecrutement, scouts[≤3] }
├── infra                    { stade, entrainement, formation, infirmerie } (niveaux 1-5)
├── travaux[]                { batiment, versNiveau, semainesRestantes }
├── sponsors{slot}           { nom, secteur, hebdo, semainesRestantes, bonuses[], satisfaction }
├── confianceConseil (0-100), objectifs[], historique[], saisonStats
└── fluxSemaine, fluxHisto   cash-flow détaillé (écran finances)

joueur
├── prenom, nom, age, poste (G|DEF|MIL|ATT), pied
├── attrs                    { att, tec, def, phy, vit, men, gb } (0-100, visibles)
├── potentiel (0-100, caché) plafond de progression — les scouts en donnent une fourchette
├── talent (0.6-1.4, caché)  vitesse de progression individuelle
├── contrat                  { saisons, salaire } · partirFinContrat
├── moral, fatigue, blessure { semaines, type, longue }, suspension, formeNotes[5]
├── directive                pro ≤19 ans : 'auto' | 'pro' | 'jeunes' (double éligibilité)
├── surclasse                jeune jouant dans la catégorie supérieure
├── formeAuClub              compte pour les objectifs « formation » et bonus sponsors
├── stats                    saison en cours { matchs, buts, passes, notes, minutes }
└── carriere                 { saisons[{saison, matchs, buts, passes, noteMoy}], totaux }

staff  : { role, niveau (1-5), salaire, contratSaisons, attributs selon rôle
           (tactique/gestion/devJeunes/prefTactique, formation, condition, medical,
           reseau, mission de scout {type, ageMin, ageMax, poste}) }
objectif : { cat: sportif|finance|jeunes|secondaire, type, paramètres, atteint }
```

## 3. Boucle de jeu

1. **Dashboard** : messagerie (sponsors, scouts, blessures, transferts, conseil),
   prochain match, alertes, objectifs.
2. **Décisions** (temps libre) : recrutement, contrats, staff, curseurs
   d'investissement jeunes 0-10 (coût non linéaire), travaux, sponsors, directives,
   surclassements, missions de scouting.
3. **« Simuler la semaine »** : tous les matchs (pros + 6 catégories de jeunes + clubs
   IA), progression des jeunes (`base(âge) × f(invest) × g(coach) × h(centre) ×
   talent × bonus temps de jeu`, plafonnée par le potentiel), récupération, flux
   financiers, travaux, scouting, offres.
4. **Résultats** : scores, stats détaillées, classements, événements notables.

Fin de saison (après la J30) : bilan, évaluation des objectifs → jauge de confiance
→ budget mercato, primes et bonus sponsors, renouvellements, vieillissement,
montées de catégories, intake annuel, 2 semaines de mercato, nouveaux objectifs.

**Game over** : faillite (trésorerie négative prolongée : avertissement → vente forcée
→ liquidation) ou révocation (confiance du conseil à 0).

## 4. Fichier d'équilibrage

Toutes les constantes du jeu — progression, vieillissement, coûts, salaires, sponsors,
moteur de match, objectifs du conseil, IA… — sont regroupées et commentées dans
**`js/config.js`** (objet `BALANCE`). Aucun nombre magique dans le moteur.

Équilibrage vérifié par simulation « à blanc » (aucune décision du président) :
- corrélation force des effectifs → classement final : Spearman ≈ 0,55-0,80
  (≈ 10-15 % de résultats surprenants) ;
- ≈ 2,5 buts/match, ≈ 25 % de nuls, ≈ 49 % de victoires à domicile ;
- clubs IA compétitifs et effectifs cohérents sur 6+ saisons ;
- un président passif finit logiquement révoqué vers la saison 5-6.

## Lancer le jeu

Les modules ES exigent un serveur HTTP (pas de `file://`) :

```bash
cd football-manager
python3 -m http.server 8080     # puis http://localhost:8080
```

**Déploiement Hostinger** : copier le contenu du dossier `football-manager/` dans
`public_html/` (ou un sous-dossier). Rien d'autre à configurer. Une fois la page
chargée une fois, le jeu est jouable hors ligne et installable sur l'écran d'accueil.

## Hors périmètre v1 (architecture prête)

Promotion/relégation, coupes, prêts, négociations d'agents avancées, visualisation 2D,
multijoueur, monétisation. Le moteur découplé et le fichier d'équilibrage central sont
prévus pour ces extensions.
