# 🏠 CRM Familial

Le tableau de bord centralisé de la famille : échéances, factures, courses,
calendrier partagé (compatible Apple Calendar), contacts et documents
administratifs — pensé pour une famille en **Belgique** 🇧🇪 (fr-BE, dates
JJ/MM/AAAA, euros, fuseau Europe/Brussels).

Tout fonctionne **en local, sans aucun service externe** : Next.js + SQLite,
un seul fichier de base de données à sauvegarder.

## Installation

```bash
npm install
cp .env.example .env        # puis remplacez SESSION_SECRET (openssl rand -base64 32)
npx prisma db push          # crée prisma/dev.db
npx prisma db seed          # données de démonstration
npm run dev                 # http://localhost:3000
```

Comptes de démonstration (mot de passe : `demo1234`) :

| Compte | Rôle |
| --- | --- |
| `marie@famille.be` | parent |
| `thomas@famille.be` | parent |
| `emma@famille.be` | enfant |

## Architecture

Voir [ARCHITECTURE.md](./ARCHITECTURE.md). L'idée centrale : chaque module
matérialise ses dates importantes dans la table transverse `Echeance`
(via `src/lib/echeances.ts`) ; le dashboard et les alertes ne lisent que
cette table. Le statut « en retard » est calculé à la lecture — aucun cron.

## Tester module par module

**Dashboard (`/`)** — la carte ambre « À ne pas rater » liste les échéances en
retard ou entrées en fenêtre d'alerte (le seed en contient) ; suivent les
compteurs factures/courses, les événements des 7 prochains jours, puis
« Cette semaine » et « Ce mois ». Cochez une échéance : elle disparaît partout.

**Membres (`/membres`)** — profils avec âge, tailles, groupe sanguin,
allergies mises en évidence en rouge. Créez un membre (choix de couleur pour
le calendrier), modifiez-le, archivez-le (parents uniquement, l'historique
est conservé).

**Factures (`/factures`)** — la section « À payer » a une facture en retard
(seed). Marquez-la payée : l'occurrence suivante est générée selon la
récurrence et l'échéance passe à « fait ». « Payées récemment » permet
d'annuler. La carte budget lisse les montants par mois et par catégorie
(une facture annuelle pèse 1/12 par mois).

**Courses (`/courses`)** — ajoutez un article avec son rayon, cochez-le en
un geste (optimiste, instantané). « Terminer les courses » vide le caddie
mais garde les articles récurrents ↻, ré-ajoutables en un clic.

**Calendrier (`/calendrier`)** — vues semaine/mois, filtre par membre,
récurrences hebdomadaires du seed visibles. Créez un événement « journée
entière » ou horaire, multi-membres.
*Apple Calendar* : ouvrez `/calendrier/abonnements`, copiez une URL de flux,
puis sur iPhone : Réglages → Apps → Calendrier → Comptes → Autre →
**Ajouter un cal. avec abonnement**. Les événements de l'app apparaissent
dans Calendrier ; « Régénérer » révoque l'URL.

**Contacts (`/contacts`)** — répertoire groupé par catégorie, recherche,
tags ; téléphone/e-mail cliquables sur mobile.

**Documents (`/documents`)** — le seed contient une Kids-ID qui expire
bientôt et la déclaration Tax-on-web : elles apparaissent dans « À
renouveler bientôt » et sur le dashboard. Le délai d'alerte se pré-remplit
selon le type (Kids-ID : 90 j).

**Échéances (`/echeances`)** — vue exhaustive (en retard / bientôt / plus
tard / faites) + création d'échéances manuelles libres.

**Finances (`/finances`)** — le seed contient un compte Belfius avec un mois
de transactions catégorisées. La vue mensuelle montre dépenses/revenus, la
répartition par catégorie et la comparaison au budget récurrent des factures.
*Import bancaire* : exportez un CSV depuis votre banque (Belfius, KBC, ING,
BNP Fortis…), ouvrez `/finances/import`, vérifiez le mapping de colonnes
deviné automatiquement, importez : doublons ignorés (ré-import sans risque),
catégorisation par vos règles (★ sur une transaction), et **rapprochement
automatique** — une dépense qui correspond à une facture « à payer » (même
montant, échéance à ±7 jours) marque la facture payée et clôt son échéance.
*Connexion bancaire (PSD2, optionnelle — professionnels uniquement)* :
l'accès aux comptes par API est réglementé et les agrégateurs (GoCardless
Bank Account Data, Tink…) ne s'ouvrent qu'aux entreprises/indépendants ;
il n'existe pas d'API bancaire pour particuliers en Belgique. Si un membre
du foyer a un numéro d'entreprise, ajoutez des clés GoCardless dans `.env`
(voir `/finances/connexion`) pour synchroniser transactions + soldes.
Sinon, l'import CSV est la voie prévue — 2 minutes par mois, tout en local.

**Recherche (`/recherche`)** — un mot (min. 2 lettres) cherche dans tous les
modules, insensible aux accents : essayez « emma » ou « engie ».

**Export (`/api/export`, aussi via Plus → Export JSON)** — télécharge un
backup JSON complet (réservé aux parents).

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | développement |
| `npm run build && npm start` | production |
| `npm run db:push` | applique le schéma Prisma |
| `npm run db:seed` | (re)charge les données de démo |

## Sauvegarde

Deux options complémentaires : copier `prisma/dev.db` (fichier SQLite
complet) ou télécharger l'export JSON depuis l'app.
