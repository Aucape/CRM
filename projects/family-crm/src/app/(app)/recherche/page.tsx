import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { formaterDate, formaterEuros } from "@/lib/dates";
import { Carte, EnTetePage, EtatVide } from "@/components/ui/base";

export const metadata: Metadata = { title: "Recherche" };

interface Resultat {
  href: string;
  titre: string;
  detail: string;
}

/** Recherche insensible à la casse ET aux accents. */
function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function correspond(q: string, ...champs: (string | null)[]): boolean {
  return champs.some((c) => c && normaliser(c).includes(q));
}

export default async function PageRecherche({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await exigerUtilisateur();
  const { q: brut } = await searchParams;
  const q = normaliser((brut ?? "").trim());

  const sections: { titre: string; resultats: Resultat[] }[] = [];

  if (q.length >= 2) {
    // Volumes familiaux : on charge tout et on filtre en mémoire, ce qui
    // permet une recherche insensible aux accents (impossible en LIKE SQLite).
    const [membres, factures, articles, evenements, contacts, documents, echeances, transactions] =
      await Promise.all([
        db.membre.findMany(),
        db.facture.findMany(),
        db.articleCourse.findMany(),
        db.evenement.findMany(),
        db.contact.findMany(),
        db.document.findMany({ include: { membre: true } }),
        db.echeance.findMany(),
        db.transaction.findMany({ orderBy: { date: "desc" }, take: 2000 }),
      ]);

    sections.push(
      {
        titre: "Membres",
        resultats: membres
          .filter((m) => correspond(q, m.prenom, m.nom, m.allergies, m.notes))
          .map((m) => ({
            href: `/membres/${m.id}`,
            titre: `${m.prenom} ${m.nom ?? ""}`,
            detail: m.allergies ? `Allergies : ${m.allergies}` : "Profil membre",
          })),
      },
      {
        titre: "Factures & abonnements",
        resultats: factures
          .filter((f) => correspond(q, f.libelle, f.notes, f.categorie))
          .map((f) => ({
            href: `/factures/${f.id}/modifier`,
            titre: f.libelle,
            detail: `${formaterEuros(f.montantCents)} · prochaine échéance ${formaterDate(f.prochaineEcheance)}`,
          })),
      },
      {
        titre: "Liste de courses",
        resultats: articles
          .filter((a) => correspond(q, a.nom, a.quantite))
          .map((a) => ({
            href: "/courses",
            titre: a.nom,
            detail: a.coche ? "Déjà coché" : "Sur la liste",
          })),
      },
      {
        titre: "Calendrier",
        resultats: evenements
          .filter((e) => correspond(q, e.titre, e.lieu, e.description))
          .map((e) => ({
            href: `/calendrier/${e.id}`,
            titre: e.titre,
            detail: `${formaterDate(e.debut)}${e.lieu ? ` · ${e.lieu}` : ""}`,
          })),
      },
      {
        titre: "Contacts",
        resultats: contacts
          .filter((c) => correspond(q, c.nom, c.tags, c.notes, c.adresse, c.telephone, c.email))
          .map((c) => ({
            href: `/contacts/${c.id}/modifier`,
            titre: c.nom,
            detail: c.telephone ?? c.email ?? "Contact",
          })),
      },
      {
        titre: "Documents",
        resultats: documents
          .filter((d) => correspond(q, d.titre, d.numeroReference, d.notes, d.type))
          .map((d) => ({
            href: `/documents/${d.id}/modifier`,
            titre: d.titre,
            detail: d.dateExpiration
              ? `Expire le ${formaterDate(d.dateExpiration)}`
              : (d.membre?.prenom ?? "Document du foyer"),
          })),
      },
      {
        titre: "Échéances",
        resultats: echeances
          .filter((e) => correspond(q, e.titre, e.notes))
          .map((e) => ({
            href: "/echeances",
            titre: e.titre,
            detail: `${formaterDate(e.dateEcheance)} · ${e.statut === "FAIT" ? "fait" : "à venir"}`,
          })),
      },
      {
        titre: "Transactions bancaires",
        resultats: transactions
          .filter((t) => correspond(q, t.contrepartie, t.communication))
          .map((t) => ({
            href: "/finances/transactions",
            titre: t.contrepartie ?? t.communication ?? "Transaction",
            detail: `${formaterDate(t.date)} · ${formaterEuros(t.montantCents)}`,
          })),
      },
    );
  }

  const totalResultats = sections.reduce((n, s) => n + s.resultats.length, 0);

  return (
    <div className="space-y-4">
      <EnTetePage titre="Recherche" sousTitre="Dans tous les modules à la fois" />

      <form action="/recherche">
        <input
          type="search"
          name="q"
          defaultValue={brut ?? ""}
          placeholder="Nom, facture, document, contact…"
          autoFocus
          className="min-h-12 w-full rounded-xl bg-white px-4 text-base ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600 focus:outline-none"
        />
      </form>

      {q.length >= 2 && totalResultats === 0 && (
        <Carte>
          <EtatVide message={`Aucun résultat pour « ${brut} ».`} />
        </Carte>
      )}

      {sections
        .filter((s) => s.resultats.length > 0)
        .map((s) => (
          <Carte key={s.titre} titre={`${s.titre} (${s.resultats.length})`}>
            <ul className="divide-y divide-slate-100">
              {s.resultats.slice(0, 20).map((r, i) => (
                <li key={`${r.href}-${i}`}>
                  <Link href={r.href} className="block py-2.5 hover:bg-slate-50">
                    <p className="font-medium text-slate-900">{r.titre}</p>
                    <p className="text-sm text-slate-500">{r.detail}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Carte>
        ))}
    </div>
  );
}
