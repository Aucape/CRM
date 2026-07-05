// Export / backup complet des données en JSON (téléchargement).
// Réservé aux parents connectés. Les hash de mots de passe sont inclus
// pour permettre une restauration complète — le fichier est à garder
// en lieu sûr.
import { db } from "@/lib/db";
import { utilisateurConnecte } from "@/lib/auth";

export async function GET() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur || utilisateur.role !== "PARENT") {
    return new Response("Réservé aux parents connectés.", { status: 403 });
  }

  const [
    membres,
    utilisateurs,
    echeances,
    factures,
    paiements,
    articlesCourses,
    evenements,
    evenementsMembres,
    fluxCalendrier,
    contacts,
    documents,
    parametres,
  ] = await Promise.all([
    db.membre.findMany(),
    db.utilisateur.findMany(),
    db.echeance.findMany(),
    db.facture.findMany(),
    db.paiement.findMany(),
    db.articleCourse.findMany(),
    db.evenement.findMany(),
    db.evenementMembre.findMany(),
    db.fluxCalendrier.findMany(),
    db.contact.findMany(),
    db.document.findMany(),
    db.parametre.findMany(),
  ]);

  const exportComplet = {
    application: "crm-familial",
    versionSchema: 1,
    exporteLe: new Date().toISOString(),
    donnees: {
      membres,
      utilisateurs,
      echeances,
      factures,
      paiements,
      articlesCourses,
      evenements,
      evenementsMembres,
      fluxCalendrier,
      contacts,
      documents,
      parametres,
    },
  };

  const horodatage = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(exportComplet, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="crm-familial-backup-${horodatage}.json"`,
    },
  });
}
