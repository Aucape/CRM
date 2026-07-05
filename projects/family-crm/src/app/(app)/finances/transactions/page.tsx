import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { listerCategories } from "@/lib/categories";
import { ajouterMois, composantsBruxelles, dateBruxelles, formaterEuros } from "@/lib/dates";
import { Carte, EnTetePage, EtatVide } from "@/components/ui/base";
import { IconeChevronDroite, IconeChevronGauche } from "@/components/ui/icones";
import { LigneTransaction } from "@/components/finances/ligne-transaction";

export const metadata: Metadata = { title: "Transactions" };

const FMT_MOIS = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  month: "long",
  year: "numeric",
});

export default async function PageTransactions({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string; categorie?: string; compte?: string }>;
}) {
  await exigerUtilisateur();
  const params = await searchParams;

  const c = composantsBruxelles(new Date());
  let debutMois = dateBruxelles(c.annee, c.mois, 1);
  if (params.mois && /^\d{4}-\d{2}$/.test(params.mois)) {
    const [a, m] = params.mois.split("-").map(Number);
    debutMois = dateBruxelles(a, m, 1);
  }
  const finMois = ajouterMois(debutMois, 1);
  const cleMois = (d: Date) => {
    const cc = composantsBruxelles(d);
    return `${cc.annee}-${String(cc.mois).padStart(2, "0")}`;
  };

  const categories = await listerCategories();
  const filtreCategorie = categories.some((cat) => cat.cle === params.categorie)
    ? (params.categorie ?? null)
    : null;

  const where: Prisma.TransactionWhereInput = {
    date: { gte: debutMois, lt: finMois },
    ...(filtreCategorie ? { categorie: filtreCategorie } : {}),
    ...(params.compte ? { compteId: params.compte } : {}),
  };

  const [transactions, comptes] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      take: 500,
      include: { compte: { select: { nom: true } } },
    }),
    db.compteBancaire.findMany({ orderBy: { creeLe: "asc" } }),
  ]);

  const total = transactions.reduce((s, t) => s + t.montantCents, 0);
  const lien = (modifs: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const etat: Record<string, string | null> = {
      mois: cleMois(debutMois),
      categorie: filtreCategorie,
      compte: params.compte ?? null,
      ...modifs,
    };
    for (const [k, v] of Object.entries(etat)) if (v) q.set(k, v);
    return `/finances/transactions?${q}`;
  };

  return (
    <div className="space-y-4">
      <EnTetePage titre="Transactions" />

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700 first-letter:uppercase">
          {FMT_MOIS.format(debutMois)}
        </p>
        <div className="flex items-center gap-1">
          <Link
            href={lien({ mois: cleMois(ajouterMois(debutMois, -1)) })}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Mois précédent"
          >
            <IconeChevronGauche className="h-5 w-5" />
          </Link>
          <Link
            href={lien({ mois: cleMois(ajouterMois(debutMois, 1)) })}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Mois suivant"
          >
            <IconeChevronDroite className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-1.5">
        <Link
          href={lien({ categorie: null })}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${!filtreCategorie ? "bg-slate-800 text-white ring-slate-800" : "text-slate-600 ring-slate-300"}`}
        >
          Toutes
        </Link>
        {categories
          .filter(
            (cat) =>
              cat.cle === "A_TRIER" ||
              transactions.some((t) => t.categorie === cat.cle) ||
              filtreCategorie === cat.cle,
          )
          .map((cat) => (
            <Link
              key={cat.cle}
              href={lien({ categorie: filtreCategorie === cat.cle ? null : cat.cle })}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${filtreCategorie === cat.cle ? "bg-slate-800 text-white ring-slate-800" : "text-slate-600 ring-slate-300"}`}
            >
              {cat.libelle}
            </Link>
          ))}
      </div>
      {comptes.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={lien({ compte: null })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${!params.compte ? "bg-slate-800 text-white ring-slate-800" : "text-slate-600 ring-slate-300"}`}
          >
            Tous les comptes
          </Link>
          {comptes.map((cpt) => (
            <Link
              key={cpt.id}
              href={lien({ compte: params.compte === cpt.id ? null : cpt.id })}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${params.compte === cpt.id ? "bg-slate-800 text-white ring-slate-800" : "text-slate-600 ring-slate-300"}`}
            >
              {cpt.nom}
            </Link>
          ))}
        </div>
      )}

      <Carte
        titre={`${transactions.length} transaction${transactions.length > 1 ? "s" : ""}`}
        action={
          <span className={`text-sm font-semibold tabular-nums ${total < 0 ? "text-slate-900" : "text-green-700"}`}>
            {total > 0 && "+"}
            {formaterEuros(total)}
          </span>
        }
      >
        {transactions.length === 0 ? (
          <EtatVide message="Aucune transaction pour ces filtres." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {transactions.map((t) => (
              <LigneTransaction
                key={t.id}
                transaction={t}
                nomCompte={t.compte.nom}
                categories={categories}
              />
            ))}
          </ul>
        )}
      </Carte>
    </div>
  );
}
