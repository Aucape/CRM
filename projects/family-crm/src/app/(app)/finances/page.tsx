import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { synchroniserBanques } from "@/server/actions/finances";
import { gocardlessConfigure } from "@/lib/gocardless";
import { coutMensuelCents } from "@/lib/recurrence";
import {
  CATEGORIES_NEUTRES,
  LIBELLES_BANQUE,
  type Banque,
  type CategorieTransaction,
  type Recurrence,
} from "@/lib/constantes";
import { libellesParCle, listerCategories } from "@/lib/categories";
import {
  ajouterMois,
  composantsBruxelles,
  dateBruxelles,
  formaterDate,
  formaterEuros,
} from "@/lib/dates";
import { Bouton, Carte, EnTetePage, EtatVide, LienBouton } from "@/components/ui/base";
import {
  IconeBanque,
  IconeChevronDroite,
  IconeChevronGauche,
  IconeExport,
  IconePlus,
  IconeRotation,
} from "@/components/ui/icones";
import { LigneTransaction } from "@/components/finances/ligne-transaction";

export const metadata: Metadata = { title: "Finances" };

const FMT_MOIS = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  month: "long",
  year: "numeric",
});

export default async function PageFinances({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string; banque?: string }>;
}) {
  await exigerUtilisateur();
  const params = await searchParams;

  // Mois affiché (?mois=2026-07), par défaut le mois courant.
  const c = composantsBruxelles(new Date());
  let debutMois = dateBruxelles(c.annee, c.mois, 1);
  if (params.mois && /^\d{4}-\d{2}$/.test(params.mois)) {
    const [a, m] = params.mois.split("-").map(Number);
    debutMois = dateBruxelles(a, m, 1);
  }
  const finMois = ajouterMois(debutMois, 1);
  const cle = (d: Date) => {
    const cc = composantsBruxelles(d);
    return `${cc.annee}-${String(cc.mois).padStart(2, "0")}`;
  };

  const [comptes, transactionsMois, factures, categories] = await Promise.all([
    db.compteBancaire.findMany({
      orderBy: { creeLe: "asc" },
      include: { _count: { select: { transactions: true } } },
    }),
    db.transaction.findMany({
      where: { date: { gte: debutMois, lt: finMois } },
      orderBy: { date: "desc" },
      include: { compte: { select: { nom: true } } },
    }),
    db.facture.findMany({ where: { active: true } }),
    listerCategories(),
  ]);
  const libelles = libellesParCle(categories);

  // Totaux du mois (hors virements internes).
  const utiles = transactionsMois.filter(
    (t) => !CATEGORIES_NEUTRES.includes(t.categorie as CategorieTransaction),
  );
  const depenses = utiles.filter((t) => t.montantCents < 0);
  const totalDepenses = depenses.reduce((s, t) => s - t.montantCents, 0);
  const totalRevenus = utiles
    .filter((t) => t.montantCents > 0)
    .reduce((s, t) => s + t.montantCents, 0);

  const parCategorie = new Map<string, number>();
  for (const t of depenses) {
    parCategorie.set(t.categorie, (parCategorie.get(t.categorie) ?? 0) - t.montantCents);
  }
  const categoriesTriees = [...parCategorie.entries()].sort((a, b) => b[1] - a[1]);
  const maxCategorie = categoriesTriees[0]?.[1] ?? 1;

  const budgetRecurrent = factures.reduce(
    (s, f) => s + coutMensuelCents(f.montantCents, f.recurrence as Recurrence),
    0,
  );

  const soldeTotal = comptes.reduce((s, cpt) => s + (cpt.soldeCents ?? 0), 0);
  const aTrier = transactionsMois.filter((t) => t.categorie === "A_TRIER").length;
  const psd2 = gocardlessConfigure();
  const comptesConnectes = comptes.some((cpt) => cpt.externeId);

  return (
    <div className="space-y-4">
      <EnTetePage
        titre="Finances"
        sousTitre="Comptes, dépenses réelles et budget récurrent"
        action={
          <LienBouton href="/finances/import">
            <IconeExport className="h-5 w-5 rotate-180" />
            Importer
          </LienBouton>
        }
      />

      {params.banque?.startsWith("ok:") && (
        <p className="rounded-xl bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
          Connexion bancaire réussie : {params.banque.slice(3)} compte(s) relié(s).
          Lancez une synchronisation ci-dessous.
        </p>
      )}
      {params.banque?.startsWith("erreur:") && (
        <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          Connexion bancaire : {params.banque.slice(7)}.
        </p>
      )}

      {/* Navigation par mois */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700 first-letter:uppercase">
          {FMT_MOIS.format(debutMois)}
        </p>
        <div className="flex items-center gap-1">
          <Link
            href={`/finances?mois=${cle(ajouterMois(debutMois, -1))}`}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Mois précédent"
          >
            <IconeChevronGauche className="h-5 w-5" />
          </Link>
          <Link
            href="/finances"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Ce mois
          </Link>
          <Link
            href={`/finances?mois=${cle(ajouterMois(debutMois, 1))}`}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Mois suivant"
          >
            <IconeChevronDroite className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {/* Totaux du mois */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">Dépenses</p>
          <p className="mt-0.5 truncate text-base font-bold text-slate-900 sm:text-lg">
            {formaterEuros(totalDepenses)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">Revenus</p>
          <p className="mt-0.5 truncate text-base font-bold text-green-700 sm:text-lg">
            {formaterEuros(totalRevenus)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">Solde</p>
          <p
            className={`mt-0.5 truncate text-base font-bold sm:text-lg ${totalRevenus - totalDepenses >= 0 ? "text-green-700" : "text-red-600"}`}
          >
            {formaterEuros(totalRevenus - totalDepenses)}
          </p>
        </div>
      </div>

      {/* Dépenses par catégorie + comparaison budget récurrent */}
      <Carte
        titre="Dépenses du mois par catégorie"
        action={
          <Link href="/finances/categories" className="text-sm font-medium text-blue-700">
            Gérer
          </Link>
        }
      >
        {categoriesTriees.length === 0 ? (
          <EtatVide message="Aucune dépense sur ce mois. Importez un extrait bancaire pour commencer." />
        ) : (
          <>
            <ul className="space-y-2">
              {categoriesTriees.map(([categorie, montant]) => (
                <li key={categorie} className="flex items-center gap-3 text-sm">
                  <span className="w-36 shrink-0 truncate text-slate-600">
                    {libelles.get(categorie) ?? categorie}
                  </span>
                  <span
                    className={`h-2 rounded-full ${categorie === "A_TRIER" ? "bg-amber-400" : "bg-blue-600"}`}
                    style={{ width: `${Math.max(3, Math.round((montant / maxCategorie) * 100))}%` }}
                  />
                  <span className="ml-auto font-medium tabular-nums text-slate-900">
                    {formaterEuros(montant)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
              Budget récurrent prévu (factures & abonnements) :{" "}
              <strong>{formaterEuros(budgetRecurrent)}/mois</strong> — dépenses
              réelles du mois : <strong>{formaterEuros(totalDepenses)}</strong>
              {aTrier > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <Link href="/finances/transactions?categorie=A_TRIER" className="font-medium text-amber-700 underline">
                    {aTrier} transaction{aTrier > 1 ? "s" : ""} à trier
                  </Link>
                </>
              )}
            </p>
          </>
        )}
      </Carte>

      {/* Comptes */}
      <Carte
        titre="Comptes"
        action={
          <LienBouton href="/finances/comptes/nouveau" variante="discret" className="!min-h-9 !px-2.5 text-sm">
            <IconePlus className="h-4.5 w-4.5" />
            Compte
          </LienBouton>
        }
      >
        {comptes.length === 0 ? (
          <EtatVide message="Créez un compte puis importez ses extraits (CSV) ou connectez votre banque.">
            <LienBouton href="/finances/comptes/nouveau">Créer un compte</LienBouton>
          </EtatVide>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {comptes.map((cpt) => (
                <li key={cpt.id} className="flex items-center gap-3 py-2.5">
                  <IconeBanque className="h-6 w-6 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {cpt.nom}
                      {cpt.externeId && (
                        <span className="ml-1.5 text-xs text-green-700">● connecté</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {LIBELLES_BANQUE[cpt.banque as Banque] ?? cpt.banque}
                      {cpt.iban && ` · ${cpt.iban}`} · {cpt._count.transactions} transactions
                    </p>
                  </div>
                  {cpt.soldeCents !== null && (
                    <div className="text-right">
                      <p className="font-semibold tabular-nums text-slate-900">
                        {formaterEuros(cpt.soldeCents)}
                      </p>
                      {cpt.soldeDate && (
                        <p className="text-[11px] text-slate-400">
                          au {formaterDate(cpt.soldeDate)}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {soldeTotal !== 0 && comptes.filter((x) => x.soldeCents !== null).length > 1 && (
              <p className="mt-1 border-t border-slate-100 pt-2 text-right text-sm text-slate-600">
                Total : <strong>{formaterEuros(soldeTotal)}</strong>
              </p>
            )}
          </>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {psd2 ? (
            <>
              <LienBouton href="/finances/connexion" variante="secondaire" className="!min-h-10 text-sm">
                <IconeBanque className="h-4.5 w-4.5" />
                Connecter une banque
              </LienBouton>
              {comptesConnectes && (
                <form action={synchroniserBanques}>
                  <Bouton type="submit" variante="secondaire" className="!min-h-10 text-sm">
                    <IconeRotation className="h-4.5 w-4.5" />
                    Synchroniser
                  </Bouton>
                </form>
              )}
            </>
          ) : (
            <Link href="/finances/connexion" className="text-xs text-slate-400 underline">
              Connexion bancaire automatique (PSD2, indépendants/sociétés uniquement)
            </Link>
          )}
        </div>
      </Carte>

      {/* Dernières transactions du mois */}
      <Carte
        titre="Transactions du mois"
        action={
          <Link href="/finances/transactions" className="text-sm font-medium text-blue-700">
            Tout voir
          </Link>
        }
      >
        {transactionsMois.length === 0 ? (
          <EtatVide message="Aucune transaction sur ce mois." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {transactionsMois.slice(0, 12).map((t) => (
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
