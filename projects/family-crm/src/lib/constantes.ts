// Valeurs fermées de l'application et leurs libellés fr-BE.
// SQLite ne supporte pas les enums Prisma : ces constantes + Zod jouent
// ce rôle côté application.
import { z } from "zod";

// ------------------------------------------------------------------
// Rôles
// ------------------------------------------------------------------

export const ROLES = ["PARENT", "ENFANT"] as const;
export const zRole = z.enum(ROLES);
export type Role = z.infer<typeof zRole>;

// ------------------------------------------------------------------
// Échéances
// ------------------------------------------------------------------

export const STATUTS_ECHEANCE = ["A_VENIR", "FAIT"] as const;
export const zStatutEcheance = z.enum(STATUTS_ECHEANCE);

export const MODULES_ECHEANCE = ["MANUEL", "FACTURE", "DOCUMENT"] as const;
export const zModuleEcheance = z.enum(MODULES_ECHEANCE);
export type ModuleEcheance = z.infer<typeof zModuleEcheance>;

export const LIBELLES_MODULE: Record<ModuleEcheance, string> = {
  MANUEL: "Échéance",
  FACTURE: "Facture",
  DOCUMENT: "Document",
};

// ------------------------------------------------------------------
// Factures & abonnements
// ------------------------------------------------------------------

export const CATEGORIES_FACTURE = [
  "LOGEMENT",
  "ENERGIE",
  "EAU",
  "TELECOM",
  "ASSURANCES",
  "SANTE",
  "TRANSPORT",
  "ABONNEMENTS",
  "ECOLE",
  "IMPOTS",
  "AUTRE",
] as const;
export const zCategorieFacture = z.enum(CATEGORIES_FACTURE);
export type CategorieFacture = z.infer<typeof zCategorieFacture>;

export const LIBELLES_CATEGORIE_FACTURE: Record<CategorieFacture, string> = {
  LOGEMENT: "Logement",
  ENERGIE: "Énergie",
  EAU: "Eau",
  TELECOM: "Télécom & internet",
  ASSURANCES: "Assurances",
  SANTE: "Santé & mutuelle",
  TRANSPORT: "Transport",
  ABONNEMENTS: "Abonnements",
  ECOLE: "École & activités",
  IMPOTS: "Impôts & taxes",
  AUTRE: "Autre",
};

export const RECURRENCES = [
  "UNIQUE",
  "MENSUELLE",
  "BIMESTRIELLE",
  "TRIMESTRIELLE",
  "SEMESTRIELLE",
  "ANNUELLE",
] as const;
export const zRecurrence = z.enum(RECURRENCES);
export type Recurrence = z.infer<typeof zRecurrence>;

export const LIBELLES_RECURRENCE: Record<Recurrence, string> = {
  UNIQUE: "Unique",
  MENSUELLE: "Mensuelle",
  BIMESTRIELLE: "Bimestrielle",
  TRIMESTRIELLE: "Trimestrielle",
  SEMESTRIELLE: "Semestrielle",
  ANNUELLE: "Annuelle",
};

/** Nombre de mois entre deux occurrences (0 = pas de récurrence). */
export const MOIS_PAR_RECURRENCE: Record<Recurrence, number> = {
  UNIQUE: 0,
  MENSUELLE: 1,
  BIMESTRIELLE: 2,
  TRIMESTRIELLE: 3,
  SEMESTRIELLE: 6,
  ANNUELLE: 12,
};

export const STATUTS_PAIEMENT = ["A_PAYER", "PAYE"] as const;
export const zStatutPaiement = z.enum(STATUTS_PAIEMENT);

// ------------------------------------------------------------------
// Liste de courses — rayons
// ------------------------------------------------------------------

export const RAYONS = [
  "FRUITS_LEGUMES",
  "BOUCHERIE_POISSON",
  "CREMERIE",
  "BOULANGERIE",
  "EPICERIE",
  "SURGELES",
  "BOISSONS",
  "HYGIENE",
  "ENTRETIEN",
  "BEBE",
  "ANIMAUX",
  "AUTRE",
] as const;
export const zRayon = z.enum(RAYONS);
export type Rayon = z.infer<typeof zRayon>;

export const LIBELLES_RAYON: Record<Rayon, string> = {
  FRUITS_LEGUMES: "Fruits & légumes",
  BOUCHERIE_POISSON: "Boucherie & poisson",
  CREMERIE: "Crèmerie & œufs",
  BOULANGERIE: "Boulangerie",
  EPICERIE: "Épicerie",
  SURGELES: "Surgelés",
  BOISSONS: "Boissons",
  HYGIENE: "Hygiène & beauté",
  ENTRETIEN: "Entretien",
  BEBE: "Bébé",
  ANIMAUX: "Animaux",
  AUTRE: "Autre",
};

// ------------------------------------------------------------------
// Contacts — catégories
// ------------------------------------------------------------------

export const CATEGORIES_CONTACT = [
  "SANTE",
  "ECOLE",
  "GARDE",
  "ARTISANS",
  "ADMINISTRATION",
  "FAMILLE",
  "AUTRE",
] as const;
export const zCategorieContact = z.enum(CATEGORIES_CONTACT);
export type CategorieContact = z.infer<typeof zCategorieContact>;

export const LIBELLES_CATEGORIE_CONTACT: Record<CategorieContact, string> = {
  SANTE: "Santé",
  ECOLE: "École",
  GARDE: "Garde d'enfants",
  ARTISANS: "Artisans & dépannage",
  ADMINISTRATION: "Administration",
  FAMILLE: "Famille & amis",
  AUTRE: "Autre",
};

// ------------------------------------------------------------------
// Documents — types administratifs belges
// ------------------------------------------------------------------

export const TYPES_DOCUMENT = [
  "PASSEPORT",
  "CARTE_EID",
  "KIDS_ID",
  "PERMIS_CONDUIRE",
  "ASSURANCE_RC_FAMILIALE",
  "ASSURANCE_HABITATION",
  "ASSURANCE_HOSPITALISATION",
  "ASSURANCE_AUTO",
  "DECLARATION_TAX_ON_WEB",
  "TAXE_CIRCULATION",
  "PRECOMPTE_IMMOBILIER",
  "ALLOCATIONS_FAMILIALES",
  "ABONNEMENT_TRANSPORT",
  "AUTRE",
] as const;
export const zTypeDocument = z.enum(TYPES_DOCUMENT);
export type TypeDocument = z.infer<typeof zTypeDocument>;

export const LIBELLES_TYPE_DOCUMENT: Record<TypeDocument, string> = {
  PASSEPORT: "Passeport",
  CARTE_EID: "Carte eID",
  KIDS_ID: "Kids-ID",
  PERMIS_CONDUIRE: "Permis de conduire",
  ASSURANCE_RC_FAMILIALE: "Assurance RC familiale",
  ASSURANCE_HABITATION: "Assurance habitation",
  ASSURANCE_HOSPITALISATION: "Assurance hospitalisation",
  ASSURANCE_AUTO: "Assurance auto",
  DECLARATION_TAX_ON_WEB: "Déclaration fiscale (Tax-on-web)",
  TAXE_CIRCULATION: "Taxe de circulation",
  PRECOMPTE_IMMOBILIER: "Précompte immobilier",
  ALLOCATIONS_FAMILIALES: "Allocations familiales",
  ABONNEMENT_TRANSPORT: "Abonnement transport (STIB/De Lijn/TEC/SNCB)",
  AUTRE: "Autre",
};

/**
 * Délai d'alerte par défaut (jours avant expiration) selon le type.
 * La Kids-ID n'est valable que 3 ans et le renouvellement demande un
 * passage en commune : on prévient plus tôt.
 */
export const ALERTE_DEFAUT_PAR_TYPE: Record<TypeDocument, number> = {
  PASSEPORT: 90,
  CARTE_EID: 60,
  KIDS_ID: 90,
  PERMIS_CONDUIRE: 60,
  ASSURANCE_RC_FAMILIALE: 30,
  ASSURANCE_HABITATION: 30,
  ASSURANCE_HOSPITALISATION: 30,
  ASSURANCE_AUTO: 30,
  DECLARATION_TAX_ON_WEB: 30,
  TAXE_CIRCULATION: 21,
  PRECOMPTE_IMMOBILIER: 21,
  ALLOCATIONS_FAMILIALES: 14,
  ABONNEMENT_TRANSPORT: 14,
  AUTRE: 30,
};

// ------------------------------------------------------------------
// Finances : banques belges & catégories de transactions
// ------------------------------------------------------------------

export const BANQUES = [
  "BELFIUS",
  "KBC",
  "BNP_FORTIS",
  "ING",
  "ARGENTA",
  "CRELAN",
  "BEOBANK",
  "AUTRE",
] as const;
export const zBanque = z.enum(BANQUES);
export type Banque = z.infer<typeof zBanque>;

export const LIBELLES_BANQUE: Record<Banque, string> = {
  BELFIUS: "Belfius",
  KBC: "KBC / CBC",
  BNP_FORTIS: "BNP Paribas Fortis",
  ING: "ING",
  ARGENTA: "Argenta",
  CRELAN: "Crelan",
  BEOBANK: "Beobank",
  AUTRE: "Autre",
};

// Catégories de transactions : celles des factures + celles du
// quotidien. A_TRIER = pas encore catégorisée.
export const CATEGORIES_TRANSACTION = [
  "A_TRIER",
  ...CATEGORIES_FACTURE.filter((c) => c !== "AUTRE"),
  "COURSES",
  "RESTO_SORTIES",
  "SHOPPING",
  "LOISIRS_VACANCES",
  "ENFANTS",
  "RETRAIT_CASH",
  "VIREMENT_INTERNE",
  "REVENUS",
  "AUTRE",
] as const;
export type CategorieTransaction = (typeof CATEGORIES_TRANSACTION)[number];
export const zCategorieTransaction = z.enum(CATEGORIES_TRANSACTION);

export const LIBELLES_CATEGORIE_TRANSACTION: Record<CategorieTransaction, string> = {
  A_TRIER: "À trier",
  ...LIBELLES_CATEGORIE_FACTURE,
  COURSES: "Courses",
  RESTO_SORTIES: "Restos & sorties",
  SHOPPING: "Shopping",
  LOISIRS_VACANCES: "Loisirs & vacances",
  ENFANTS: "Enfants",
  RETRAIT_CASH: "Retraits cash",
  VIREMENT_INTERNE: "Virements internes",
  REVENUS: "Revenus",
  AUTRE: "Autre",
};

/** Catégories exclues des totaux de dépenses (ni dépense, ni revenu réel). */
export const CATEGORIES_NEUTRES: CategorieTransaction[] = ["VIREMENT_INTERNE"];

// ------------------------------------------------------------------
// Couleurs proposées pour les membres (calendrier)
// ------------------------------------------------------------------

export const COULEURS_MEMBRE = [
  "#2563eb", // bleu
  "#db2777", // rose
  "#16a34a", // vert
  "#ea580c", // orange
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#ca8a04", // moutarde
  "#dc2626", // rouge
] as const;
