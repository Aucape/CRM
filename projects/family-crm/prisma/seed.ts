// Données de démonstration : une famille fictive bruxelloise, avec de
// quoi tester chaque module de la Phase 1.
//
//   npx prisma db seed
//
// Comptes créés :
//   marie@famille.be  / demo1234  (parent)
//   thomas@famille.be / demo1234  (parent)
//   emma@famille.be   / demo1234  (enfant)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

const db = new PrismaClient();

/** Date à minuit heure de Bruxelles (UTC+1 en hiver, UTC+2 en été). */
function dateBxl(annee: number, mois: number, jour: number, heure = 0, minute = 0): Date {
  // Approximation suffisante pour un seed : l'été belge = UTC+2, l'hiver = UTC+1.
  const ete = mois >= 4 && mois <= 10;
  return new Date(Date.UTC(annee, mois - 1, jour, heure - (ete ? 2 : 1), minute));
}

function dansNJours(n: number, heure = 0, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dateBxl(d.getFullYear(), d.getMonth() + 1, d.getDate(), heure, minute);
}

async function main() {
  console.log("Nettoyage de la base…");
  // Ordre inverse des dépendances.
  await db.transaction.deleteMany();
  await db.compteBancaire.deleteMany();
  await db.regleCategorie.deleteMany();
  await db.echeance.deleteMany();
  await db.paiement.deleteMany();
  await db.facture.deleteMany();
  await db.articleCourse.deleteMany();
  await db.evenementMembre.deleteMany();
  await db.evenement.deleteMany();
  await db.fluxCalendrier.deleteMany();
  await db.contact.deleteMany();
  await db.document.deleteMany();
  await db.utilisateur.deleteMany();
  await db.membre.deleteMany();
  await db.parametre.deleteMany();

  console.log("Membres & comptes…");
  const marie = await db.membre.create({
    data: {
      prenom: "Marie",
      nom: "Dubois",
      dateNaissance: dateBxl(1988, 3, 14),
      couleur: "#db2777",
      groupeSanguin: "A+",
      notes: "Médecin traitant : Dr Peeters.",
    },
  });
  const thomas = await db.membre.create({
    data: {
      prenom: "Thomas",
      nom: "Dubois",
      dateNaissance: dateBxl(1986, 11, 2),
      couleur: "#2563eb",
      groupeSanguin: "O+",
      allergies: "Pollen de bouleau",
    },
  });
  const emma = await db.membre.create({
    data: {
      prenom: "Emma",
      nom: "Dubois",
      dateNaissance: dateBxl(2014, 6, 21),
      couleur: "#16a34a",
      tailleVetements: "152 / 12 ans",
      pointure: "37",
      groupeSanguin: "A+",
      allergies: "Arachides (EpiPen dans le cartable)",
      notes: "Académie de musique le mercredi.",
    },
  });
  const louis = await db.membre.create({
    data: {
      prenom: "Louis",
      nom: "Dubois",
      dateNaissance: dateBxl(2019, 9, 8),
      couleur: "#ea580c",
      tailleVetements: "122 / 6 ans",
      pointure: "30",
      groupeSanguin: "O+",
      notes: "Doudou « Lapinou » indispensable pour dormir.",
    },
  });

  const hash = await bcrypt.hash("demo1234", 10);
  await db.utilisateur.createMany({
    data: [
      { email: "marie@famille.be", motDePasseHash: hash, role: "PARENT", membreId: marie.id },
      { email: "thomas@famille.be", motDePasseHash: hash, role: "PARENT", membreId: thomas.id },
      { email: "emma@famille.be", motDePasseHash: hash, role: "ENFANT", membreId: emma.id },
    ],
  });

  console.log("Factures & abonnements…");
  const factures = [
    { libelle: "Loyer appartement", categorie: "LOGEMENT", montantCents: 1250_00, recurrence: "MENSUELLE", payeurId: thomas.id, jours: 3 },
    { libelle: "Électricité & gaz — Engie", categorie: "ENERGIE", montantCents: 210_00, recurrence: "MENSUELLE", payeurId: marie.id, jours: 8 },
    { libelle: "Internet + GSM — Proximus", categorie: "TELECOM", montantCents: 89_99, recurrence: "MENSUELLE", payeurId: thomas.id, jours: 12 },
    { libelle: "Mutuelle — Partenamut", categorie: "SANTE", montantCents: 34_50, recurrence: "TRIMESTRIELLE", payeurId: marie.id, jours: 20 },
    { libelle: "Assurance habitation — Ethias", categorie: "ASSURANCES", montantCents: 312_00, recurrence: "ANNUELLE", payeurId: thomas.id, jours: 45 },
    { libelle: "Abonnement STIB Emma", categorie: "TRANSPORT", montantCents: 12_00, recurrence: "ANNUELLE", payeurId: marie.id, jours: 60 },
    { libelle: "Netflix", categorie: "ABONNEMENTS", montantCents: 13_49, recurrence: "MENSUELLE", payeurId: marie.id, jours: 15 },
    { libelle: "Garderie Louis", categorie: "ECOLE", montantCents: 95_00, recurrence: "MENSUELLE", payeurId: thomas.id, jours: 5 },
  ] as const;

  for (const f of factures) {
    const echeance = dansNJours(f.jours);
    const facture = await db.facture.create({
      data: {
        libelle: f.libelle,
        categorie: f.categorie,
        montantCents: f.montantCents,
        recurrence: f.recurrence,
        prochaineEcheance: echeance,
        payeurId: f.payeurId,
      },
    });
    const paiement = await db.paiement.create({
      data: {
        factureId: facture.id,
        dateEcheance: echeance,
        montantCents: f.montantCents,
      },
    });
    await db.echeance.create({
      data: {
        titre: `Payer : ${f.libelle}`,
        dateEcheance: echeance,
        module: "FACTURE",
        sourceId: paiement.id,
        alerteJoursAvant: 7,
        membreId: f.payeurId,
      },
    });
  }

  // Une facture en retard pour tester l'affichage.
  const factureRetard = await db.facture.create({
    data: {
      libelle: "Taxe communale déchets",
      categorie: "IMPOTS",
      montantCents: 85_00,
      recurrence: "ANNUELLE",
      prochaineEcheance: dansNJours(-6),
      payeurId: thomas.id,
    },
  });
  const paiementRetard = await db.paiement.create({
    data: {
      factureId: factureRetard.id,
      dateEcheance: dansNJours(-6),
      montantCents: 85_00,
    },
  });
  await db.echeance.create({
    data: {
      titre: "Payer : Taxe communale déchets",
      dateEcheance: dansNJours(-6),
      module: "FACTURE",
      sourceId: paiementRetard.id,
      alerteJoursAvant: 7,
      membreId: thomas.id,
    },
  });

  console.log("Liste de courses…");
  await db.articleCourse.createMany({
    data: [
      { nom: "Lait demi-écrémé", rayon: "CREMERIE", quantite: "6 × 1 L", recurrent: true },
      { nom: "Pain gris", rayon: "BOULANGERIE", recurrent: true },
      { nom: "Pommes Jonagold", rayon: "FRUITS_LEGUMES", quantite: "1 kg", recurrent: true },
      { nom: "Poulet fermier", rayon: "BOUCHERIE_POISSON", quantite: "1" },
      { nom: "Spéculoos", rayon: "EPICERIE" },
      { nom: "Frites surgelées", rayon: "SURGELES", quantite: "2 sachets" },
      { nom: "Eau pétillante", rayon: "BOISSONS", quantite: "6 × 1,5 L", recurrent: true },
      { nom: "Dentifrice enfants", rayon: "HYGIENE" },
      { nom: "Tablettes lave-vaisselle", rayon: "ENTRETIEN", recurrent: true },
      { nom: "Café moulu", rayon: "EPICERIE", coche: true, cocheLe: new Date(), recurrent: true },
    ],
  });

  console.log("Calendrier…");
  const evenements = [
    { titre: "Réunion parents-profs Emma", lieu: "École Saint-Michel", jours: 4, heure: 18, duree: 90, membres: [marie.id, emma.id] },
    { titre: "Académie de musique Emma", lieu: "Académie d'Ixelles", jours: 2, heure: 14, duree: 60, membres: [emma.id], rrule: "FREQ=WEEKLY" },
    { titre: "Football Louis", lieu: "RSC Anderlecht — école des jeunes", jours: 5, heure: 10, duree: 90, membres: [louis.id, thomas.id], rrule: "FREQ=WEEKLY" },
    { titre: "Dentiste Louis", lieu: "Cabinet Dr Janssens", jours: 9, heure: 16, duree: 30, membres: [louis.id, marie.id] },
    { titre: "Anniversaire Papy Jean", jours: 16, heure: 12, duree: 240, membres: [] },
    { titre: "Garde alternée chez Mamy", jours: 12, heure: 0, duree: 0, journeeEntiere: true, membres: [emma.id, louis.id] },
  ];
  for (const e of evenements) {
    const debut = dansNJours(e.jours, e.heure);
    const fin = e.journeeEntiere
      ? dansNJours(e.jours + 1)
      : new Date(debut.getTime() + (e.duree ?? 60) * 60_000);
    await db.evenement.create({
      data: {
        titre: e.titre,
        lieu: e.lieu,
        debut,
        fin,
        journeeEntiere: e.journeeEntiere ?? false,
        rrule: e.rrule,
        membres: { create: e.membres.map((membreId) => ({ membreId })) },
      },
    });
  }

  // Flux ICS : un pour la famille, un par membre.
  await db.fluxCalendrier.create({
    data: { jeton: randomBytes(24).toString("base64url") },
  });
  for (const m of [marie, thomas, emma, louis]) {
    await db.fluxCalendrier.create({
      data: { jeton: randomBytes(24).toString("base64url"), membreId: m.id },
    });
  }

  console.log("Contacts…");
  await db.contact.createMany({
    data: [
      { nom: "Dr Peeters — médecin traitant", categorie: "SANTE", telephone: "02 345 67 89", adresse: "Av. Louise 12, 1050 Ixelles", tags: "médecin,famille" },
      { nom: "Dr Janssens — dentiste", categorie: "SANTE", telephone: "02 456 78 90", tags: "dentiste" },
      { nom: "Pharmacie Multipharma Flagey", categorie: "SANTE", telephone: "02 640 11 22", notes: "Ouverte le samedi matin." },
      { nom: "École Saint-Michel — secrétariat", categorie: "ECOLE", telephone: "02 511 22 33", email: "secretariat@saintmichel.be", tags: "emma,louis" },
      { nom: "Léa — baby-sitter", categorie: "GARDE", telephone: "0475 12 34 56", notes: "12 €/h, disponible ven-sam soir.", tags: "baby-sitter" },
      { nom: "Plombier Van Damme", categorie: "ARTISANS", telephone: "0498 76 54 32", notes: "Intervenu en 2025 pour la chaudière." },
      { nom: "Commune d'Ixelles — population", categorie: "ADMINISTRATION", telephone: "02 515 61 11", adresse: "Chaussée d'Ixelles 168", notes: "Sur rendez-vous pour les eID." },
      { nom: "Mamy Jacqueline", categorie: "FAMILLE", telephone: "0470 11 22 33", tags: "urgence,garde" },
    ],
  });

  console.log("Documents administratifs…");
  const documents = [
    { titre: "Kids-ID Emma", type: "KIDS_ID", membreId: emma.id, jours: 75, alerte: 90, ref: "612-0345678-90" },
    { titre: "Kids-ID Louis", type: "KIDS_ID", membreId: louis.id, jours: 320, alerte: 90, ref: "612-0456789-01" },
    { titre: "Carte eID Marie", type: "CARTE_EID", membreId: marie.id, jours: 800, alerte: 60, ref: "591-1234567-89" },
    { titre: "Passeport Thomas", type: "PASSEPORT", membreId: thomas.id, jours: 150, alerte: 90, ref: "EM123456" },
    { titre: "Permis de conduire Thomas", type: "PERMIS_CONDUIRE", membreId: thomas.id, jours: 1200, alerte: 60 },
    { titre: "Assurance RC familiale — Ethias", type: "ASSURANCE_RC_FAMILIALE", jours: 200, alerte: 30, ref: "POL-778899" },
    { titre: "Assurance hospitalisation — DKV", type: "ASSURANCE_HOSPITALISATION", jours: 240, alerte: 30 },
    { titre: "Déclaration fiscale Tax-on-web 2026", type: "DECLARATION_TAX_ON_WEB", jours: 11, alerte: 30, notes: "Deadline Tax-on-web citoyens." },
    { titre: "Taxe de circulation — Polo", type: "TAXE_CIRCULATION", jours: 38, alerte: 21 },
    { titre: "Précompte immobilier 2026", type: "PRECOMPTE_IMMOBILIER", jours: 90, alerte: 21 },
  ] as const;

  for (const d of documents) {
    const expiration = dansNJours(d.jours);
    const doc = await db.document.create({
      data: {
        titre: d.titre,
        type: d.type,
        membreId: "membreId" in d ? d.membreId : null,
        numeroReference: "ref" in d ? d.ref : null,
        dateExpiration: expiration,
        alerteJoursAvant: d.alerte,
        notes: "notes" in d ? d.notes : null,
      },
    });
    await db.echeance.create({
      data: {
        titre: d.titre,
        dateEcheance: expiration,
        module: "DOCUMENT",
        sourceId: doc.id,
        alerteJoursAvant: d.alerte,
        membreId: "membreId" in d ? d.membreId : null,
      },
    });
  }

  console.log("Échéances manuelles…");
  await db.echeance.createMany({
    data: [
      { titre: "Inscrire Louis au stage d'été", dateEcheance: dansNJours(18), module: "MANUEL", alerteJoursAvant: 14, membreId: louis.id },
      { titre: "Rappel vaccin Emma (médecin scolaire)", dateEcheance: dansNJours(25), module: "MANUEL", alerteJoursAvant: 14, membreId: emma.id },
      { titre: "Renouveler abonnement bibliothèque", dateEcheance: dansNJours(40), module: "MANUEL", alerteJoursAvant: 7 },
    ],
  });

  console.log("Finances…");
  const compte = await db.compteBancaire.create({
    data: {
      nom: "Compte commun Belfius",
      iban: "BE68539007547034",
      banque: "BELFIUS",
      soldeCents: 3245_67,
      soldeDate: new Date(),
    },
  });
  await db.regleCategorie.createMany({
    data: [
      { motCle: "colruyt", categorie: "COURSES" },
      { motCle: "delhaize", categorie: "COURSES" },
      { motCle: "total belgium", categorie: "TRANSPORT" },
    ],
  });

  // Même format d'empreinte que src/lib/finances.ts (anti-doublon).
  const normaliser = (t: string) =>
    t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const empreinte = (date: Date, montantCents: number, contrepartie: string, communication: string) =>
    createHash("sha256")
      .update(
        [
          compte.id,
          date.toISOString().slice(0, 10),
          montantCents,
          normaliser(contrepartie),
          normaliser(communication),
        ].join("|"),
      )
      .digest("hex");

  const mouvements = [
    { jours: -2, montant: -132_45, contrepartie: "COLRUYT AUDERGHEM", communication: "Paiement Bancontact", categorie: "COURSES" },
    { jours: -3, montant: -13_49, contrepartie: "NETFLIX INTERNATIONAL", communication: "Abonnement mensuel", categorie: "ABONNEMENTS" },
    { jours: -4, montant: 2850_00, contrepartie: "SPRL HORIZON CONSULTING", communication: "Salaire juin", categorie: "REVENUS" },
    { jours: -5, montant: -87_20, contrepartie: "DELHAIZE IXELLES", communication: "Paiement Bancontact", categorie: "COURSES" },
    { jours: -6, montant: -68_50, contrepartie: "RESTAURANT LE ZINNEKE", communication: "", categorie: "RESTO_SORTIES" },
    { jours: -8, montant: -100_00, contrepartie: "BANCONTACT CASH", communication: "Retrait distributeur", categorie: "RETRAIT_CASH" },
    { jours: -9, montant: -75_30, contrepartie: "TOTAL BELGIUM", communication: "Carburant", categorie: "TRANSPORT" },
    { jours: -11, montant: -210_00, contrepartie: "ENGIE ELECTRABEL", communication: "Domiciliation énergie", categorie: "ENERGIE" },
    { jours: -13, montant: -23_50, contrepartie: "PHARMACIE MULTIPHARMA", communication: "", categorie: "SANTE" },
    { jours: -15, montant: -45_00, contrepartie: "ACADEMIE MUSIQUE IXELLES", communication: "Cotisation Emma", categorie: "ENFANTS" },
    { jours: -17, montant: -250_00, contrepartie: "EPARGNE FAMILLE", communication: "Virement épargne", categorie: "VIREMENT_INTERNE" },
    { jours: -20, montant: -34_99, contrepartie: "ZALANDO", communication: "Commande 784512", categorie: "SHOPPING" },
    { jours: -1, montant: -12_60, contrepartie: "PROXY DELHAIZE FLAGEY", communication: "Paiement Bancontact", categorie: "A_TRIER" },
  ];
  for (const m of mouvements) {
    const date = dansNJours(m.jours, 12);
    await db.transaction.create({
      data: {
        compteId: compte.id,
        date,
        montantCents: m.montant,
        contrepartie: m.contrepartie,
        communication: m.communication || null,
        categorie: m.categorie,
        empreinte: empreinte(date, m.montant, m.contrepartie, m.communication),
      },
    });
  }

  const total = {
    membres: await db.membre.count(),
    factures: await db.facture.count(),
    courses: await db.articleCourse.count(),
    evenements: await db.evenement.count(),
    contacts: await db.contact.count(),
    documents: await db.document.count(),
    echeances: await db.echeance.count(),
    transactions: await db.transaction.count(),
  };
  console.log("Seed terminé :", total);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
