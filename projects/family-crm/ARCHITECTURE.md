# CRM Familial — Proposition d'architecture (à valider)

> Contexte : famille en Belgique · locale **fr-BE** · dates **JJ/MM/AAAA** · montants en **€** · fuseau **Europe/Brussels**.

## 1. Stack technique (validée, avec 3 ajustements)

La stack demandée (Next.js App Router + TypeScript, SQLite + Prisma, Tailwind, auth simple) est bien adaptée : auto-hébergeable, zéro service externe, un seul fichier de base de données à sauvegarder. Trois ajustements pratiques :

1. **Pas d'enums Prisma** : Prisma ne supporte pas les enums avec SQLite. Les champs à valeurs fermées (statuts, types de documents, récurrences…) sont des `String` validés par **Zod**, avec des constantes TypeScript partagées (`src/lib/constantes.ts`) — même sécurité de typage côté code.
2. **Auth par cookie de session signé** (bibliothèque `iron-session`) plutôt qu'un framework d'auth complet : comptes créés par un parent, mot de passe hashé (`bcryptjs`), rôles `PARENT` / `ENFANT`. Pas d'e-mails de confirmation ni d'OAuth — tout reste local.
3. **Dates** : `date-fns` + `@date-fns/tz` (formatage fr-BE, calculs de récurrence en Europe/Brussels). Les événements sont stockés en UTC, affichés et saisis en heure de Bruxelles.

Montants stockés en **centimes** (`Int`) pour éviter les erreurs de flottants.

## 2. Principe central : la table `Echeance`

C'est la colonne vertébrale. Chaque module écrit ses échéances dans une table unique, matérialisée, via un service central (`src/lib/echeances.ts`) :

- `module` + `sourceId` relient l'échéance à son objet d'origine (une facture, un document, un événement…). Quand la source change ou est supprimée, ses échéances sont resynchronisées.
- Le **dashboard** et les **alertes** ne lisent que cette table : « Cette semaine / Ce mois » = une seule requête, triée par date, filtrable par membre.
- `alerteJoursAvant` est configurable par échéance (défaut par type de source : 60 j pour un passeport, 14 j pour une facture…).
- Le statut `EN_RETARD` est calculé à la lecture (date passée + non fait), jamais stocké — pas de tâche cron nécessaire.
- Les échéances **manuelles** (module `MANUEL`) sont possibles dès la Phase 1 ; les modules des Phases 2–3 (santé, véhicules…) s'y brancheront sans toucher au dashboard.

## 3. Schéma de données Prisma (Phase 1)

```prisma
// =====================================================================
// CRM Familial — SQLite + Prisma
// Convention : noms de modèles/champs en français.
// SQLite ne supportant pas les enums Prisma, les valeurs fermées sont
// des String validées par Zod (voir src/lib/constantes.ts).
// =====================================================================

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ------------------------------------------------------------------
// Authentification & membres du foyer
// ------------------------------------------------------------------

// Compte de connexion (tous les membres n'en ont pas forcément un :
// un bébé est un Membre sans Utilisateur).
model Utilisateur {
  id             String   @id @default(cuid())
  email          String   @unique
  motDePasseHash String
  role           String   @default("PARENT") // PARENT | ENFANT
  membre         Membre   @relation(fields: [membreId], references: [id])
  membreId       String   @unique
  creeLe         DateTime @default(now())
}

// Personne du foyer : porte le profil pratique (tailles, allergies…)
model Membre {
  id              String    @id @default(cuid())
  prenom          String
  nom             String?
  dateNaissance   DateTime?
  couleur         String    // hex, code couleur du membre dans le calendrier
  tailleVetements String?   // ex. « 128 / 8 ans »
  pointure        String?
  allergies       String?
  groupeSanguin   String?   // ex. « O+ »
  notes           String?
  archive         Boolean   @default(false)
  creeLe          DateTime  @default(now())

  utilisateur Utilisateur?
  evenements  EvenementMembre[]
  documents   Document[]
  factures    Facture[]         // factures dont il est le payeur
  echeances   Echeance[]
  fluxIcs     FluxCalendrier[]
}

// ------------------------------------------------------------------
// Colonne vertébrale : échéances transverses
// ------------------------------------------------------------------

// Toute date à ne pas rater, quel que soit le module d'origine.
// Le dashboard et les alertes ne lisent QUE cette table.
model Echeance {
  id               String    @id @default(cuid())
  titre            String
  dateEcheance     DateTime
  statut           String    @default("A_VENIR") // A_VENIR | FAIT
                                                 // (EN_RETARD = calculé à la lecture)
  module           String    // MANUEL | FACTURE | DOCUMENT | EVENEMENT
                             // (Phase 2+ : SANTE | VEHICULE | SCOLARITE…)
  sourceId         String?   // id de l'objet source dans son module
  alerteJoursAvant Int       @default(14)
  notes            String?
  faitLe           DateTime?
  membre           Membre?   @relation(fields: [membreId], references: [id])
  membreId         String?
  creeLe           DateTime  @default(now())

  @@index([dateEcheance, statut])
  @@index([module, sourceId])
}

// ------------------------------------------------------------------
// Factures & abonnements
// ------------------------------------------------------------------

// Modèle de facture ou d'abonnement (la définition récurrente).
model Facture {
  id           String   @id @default(cuid())
  libelle      String   // ex. « Électricité Engie »
  categorie    String   // LOGEMENT | ENERGIE | TELECOM | ASSURANCES | SANTE
                        // | TRANSPORT | ABONNEMENTS | ECOLE | IMPOTS | AUTRE
  montantCents Int      // montant par défaut d'une occurrence, en centimes
  recurrence   String   // UNIQUE | MENSUELLE | BIMESTRIELLE | TRIMESTRIELLE
                        // | SEMESTRIELLE | ANNUELLE
  prochaineEcheance DateTime
  active       Boolean  @default(true)
  notes        String?
  payeur       Membre?  @relation(fields: [payeurId], references: [id])
  payeurId     String?
  creeLe       DateTime @default(now())

  paiements Paiement[]
}

// Occurrence concrète d'une facture (ce qu'on paie ce mois-ci).
// Générée automatiquement depuis la récurrence ; crée son Echeance.
model Paiement {
  id           String    @id @default(cuid())
  facture      Facture   @relation(fields: [factureId], references: [id], onDelete: Cascade)
  factureId    String
  dateEcheance DateTime
  montantCents Int       // modifiable (montant réel de la période)
  statut       String    @default("A_PAYER") // A_PAYER | PAYE
  payeLe       DateTime?

  @@index([dateEcheance, statut])
}

// ------------------------------------------------------------------
// Liste de courses
// ------------------------------------------------------------------

model ArticleCourse {
  id        String    @id @default(cuid())
  nom       String
  rayon     String    @default("AUTRE") // FRUITS_LEGUMES | BOUCHERIE_POISSON
                                        // | CREMERIE | EPICERIE | SURGELES
                                        // | BOISSONS | BOULANGERIE | HYGIENE
                                        // | ENTRETIEN | BEBE | ANIMAUX | AUTRE
  quantite  String?   // libre : « 2 », « 500 g »…
  coche     Boolean   @default(false)
  recurrent Boolean   @default(false)   // ré-ajoutable en un clic
  ajouteLe  DateTime  @default(now())
  cocheLe   DateTime?

  @@index([coche, rayon])
}

// ------------------------------------------------------------------
// Calendrier partagé (compatible Apple Calendar via flux ICS)
// ------------------------------------------------------------------

model Evenement {
  id             String   @id @default(cuid())
  uid            String   @unique @default(cuid()) // UID iCal stable pour la sync
  titre          String
  description    String?
  lieu           String?
  debut          DateTime // UTC ; affiché en Europe/Brussels
  fin            DateTime
  journeeEntiere Boolean  @default(false)
  rrule          String?  // récurrence au format RRULE iCal (ex. FREQ=WEEKLY)
  creeLe         DateTime @default(now())
  modifieLe      DateTime @updatedAt // alimente DTSTAMP/SEQUENCE du flux ICS

  membres EvenementMembre[]
}

// Un événement peut concerner plusieurs membres (ou aucun = toute la famille).
model EvenementMembre {
  evenement   Evenement @relation(fields: [evenementId], references: [id], onDelete: Cascade)
  evenementId String
  membre      Membre    @relation(fields: [membreId], references: [id], onDelete: Cascade)
  membreId    String

  @@id([evenementId, membreId])
}

// Flux ICS par abonnement : URL secrète /api/ics/[jeton].ics
// membreId null = flux « toute la famille ». Jeton révocable (régénérable).
model FluxCalendrier {
  id       String   @id @default(cuid())
  jeton    String   @unique
  membre   Membre?  @relation(fields: [membreId], references: [id], onDelete: Cascade)
  membreId String?  @unique
  creeLe   DateTime @default(now())
}

// ------------------------------------------------------------------
// Contacts utiles
// ------------------------------------------------------------------

model Contact {
  id        String   @id @default(cuid())
  nom       String   // ex. « Dr Peeters — pédiatre »
  categorie String   @default("AUTRE") // SANTE | ECOLE | GARDE | ARTISANS
                                       // | ADMINISTRATION | FAMILLE | AUTRE
  telephone String?
  email     String?
  adresse   String?
  tags      String   @default("") // libres, séparés par des virgules
  notes     String?
  creeLe    DateTime @default(now())
}

// ------------------------------------------------------------------
// Documents & échéances administratives belges
// ------------------------------------------------------------------

model Document {
  id               String    @id @default(cuid())
  titre            String    // ex. « Kids-ID Émile »
  type             String    // PASSEPORT | CARTE_EID | KIDS_ID | PERMIS_CONDUIRE
                             // | ASSURANCE_RC_FAMILIALE | ASSURANCE_HABITATION
                             // | ASSURANCE_HOSPITALISATION | ASSURANCE_AUTO
                             // | DECLARATION_TAX_ON_WEB | TAXE_CIRCULATION
                             // | PRECOMPTE_IMMOBILIER | ALLOCATIONS_FAMILIALES
                             // | ABONNEMENT_TRANSPORT | AUTRE
  membre           Membre?   @relation(fields: [membreId], references: [id])
  membreId         String?   // null = document du foyer (ex. assurance habitation)
  numeroReference  String?
  dateEmission     DateTime?
  dateExpiration   DateTime? // crée l'Echeance associée
  alerteJoursAvant Int       @default(60) // défaut adapté par type (Kids-ID : 90 j)
  notes            String?
  creeLe           DateTime  @default(now())

  @@index([dateExpiration])
}

// ------------------------------------------------------------------
// Paramètres (clé/valeur) : défauts d'alerte, préférences d'affichage…
// ------------------------------------------------------------------

model Parametre {
  cle    String @id
  valeur String
}
```

Points d'attention intégrés au contexte belge : type **KIDS_ID** distinct (validité 3 ans, alerte par défaut à 90 jours), **Tax-on-web**, **taxe de circulation**, **précompte immobilier**, **allocations familiales** (Famiris/Infino/…), assurances RC familiale / habitation / hospitalisation.

## 4. Arborescence du projet

Le projet vit dans `projects/family-crm/` (cohérent avec la structure existante du dépôt).

```
projects/family-crm/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts                    # données de démo (famille fictive belge)
│   └── dev.db                     # SQLite (gitignoré)
├── public/
├── src/
│   ├── app/
│   │   ├── layout.tsx             # html lang="fr-BE", polices, métadonnées
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   │   └── connexion/page.tsx
│   │   ├── (app)/                 # zone protégée (middleware de session)
│   │   │   ├── layout.tsx         # barre d'onglets mobile + nav latérale desktop
│   │   │   ├── page.tsx           # 7. Dashboard « Cette semaine / Ce mois »
│   │   │   ├── membres/           # 1. Membres
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── factures/          # 2. Factures & abonnements (+ vue budget)
│   │   │   ├── courses/           # 3. Liste de courses
│   │   │   ├── calendrier/        # 4. Vues semaine / mois, gestion des flux ICS
│   │   │   ├── contacts/          # 5. Contacts utiles
│   │   │   ├── documents/         # 6. Documents & échéances administratives
│   │   │   ├── echeances/         # liste complète + échéances manuelles
│   │   │   └── recherche/         # recherche globale transverse
│   │   └── api/
│   │       ├── ics/[jeton]/route.ts   # flux ICS (URL secrète, sans session)
│   │       └── export/route.ts        # export JSON complet
│   ├── components/
│   │   ├── ui/                    # boutons, champs, modales, badges, listes…
│   │   ├── dashboard/
│   │   ├── calendrier/
│   │   └── …                      # un dossier par module
│   ├── lib/
│   │   ├── db.ts                  # client Prisma singleton
│   │   ├── auth.ts                # session iron-session, garde par rôle
│   │   ├── constantes.ts          # valeurs fermées + libellés fr-BE + schémas Zod
│   │   ├── echeances.ts           # service central de synchronisation des échéances
│   │   ├── recurrence.ts          # calcul des occurrences (factures, RRULE)
│   │   ├── ics.ts                 # génération du flux iCalendar
│   │   └── dates.ts               # formatage fr-BE, helpers Europe/Brussels
│   ├── server/
│   │   └── actions/               # Server Actions par module (membres.ts, factures.ts…)
│   └── middleware.ts              # protection des routes (session requise)
├── .env.example
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── package.json
└── README.md                      # installation, tests par module, backup
```

## 5. Ordre de construction (Phase 1)

Chaque étape = commits atomiques + instructions de test, avec votre accord avant la suivante :

0. Socle : projet Next.js, Prisma + schéma complet, auth, layout mobile-first, seed initial
1. Membres → 2. Factures & abonnements → 3. Liste de courses → 4. Calendrier + flux ICS → 5. Contacts → 6. Documents & échéances belges → 7. Dashboard + recherche globale + export JSON

Le service `Echeance` est posé dès le socle (étape 0) puisque tout s'y branche.
