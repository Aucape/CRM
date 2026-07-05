import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import {
  creerCategorieDepense,
  supprimerCategorieDepense,
} from "@/server/actions/finances";
import {
  CATEGORIES_TRANSACTION,
  LIBELLES_CATEGORIE_TRANSACTION,
} from "@/lib/constantes";
import { Badge, Carte, EnTetePage } from "@/components/ui/base";
import { IconeCorbeille } from "@/components/ui/icones";
import { FormulaireCategorie } from "@/components/finances/formulaire-categorie";

export const metadata: Metadata = { title: "Catégories de dépenses" };

export default async function PageCategories() {
  await exigerUtilisateur();
  const [persos, compteParCategorie] = await Promise.all([
    db.categorieDepense.findMany({ orderBy: { libelle: "asc" } }),
    db.transaction.groupBy({ by: ["categorie"], _count: { _all: true } }),
  ]);
  const nbTransactions = new Map(
    compteParCategorie.map((g) => [g.categorie, g._count._all]),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <EnTetePage
        titre="Catégories de dépenses"
        sousTitre="Vos catégories s'ajoutent aux catégories intégrées, partout dans Finances"
      />

      <Carte titre="Ajouter une catégorie">
        <FormulaireCategorie action={creerCategorieDepense} />
      </Carte>

      <Carte titre={`Vos catégories (${persos.length})`}>
        {persos.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">
            Aucune catégorie personnalisée pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {persos.map((cat) => {
              const nb = nbTransactions.get(cat.cle) ?? 0;
              return (
                <li key={cat.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 font-medium text-slate-900">
                    {cat.libelle}
                  </span>
                  <span className="text-xs text-slate-400">
                    {nb} transaction{nb > 1 ? "s" : ""}
                  </span>
                  <form action={supprimerCategorieDepense}>
                    <input type="hidden" name="id" value={cat.id} />
                    <button
                      type="submit"
                      className="rounded-lg p-2 text-slate-300 hover:text-red-600"
                      title={
                        nb > 0
                          ? `Supprimer (les ${nb} transactions repasseront « À trier »)`
                          : "Supprimer"
                      }
                    >
                      <IconeCorbeille className="h-4.5 w-4.5" />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        {persos.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            Supprimer une catégorie remet ses transactions « À trier » et
            retire ses règles automatiques.
          </p>
        )}
      </Carte>

      <Carte titre="Catégories intégrées">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES_TRANSACTION.map((cat) => (
            <Badge key={cat} teinte={cat === "A_TRIER" ? "orange" : "neutre"}>
              {LIBELLES_CATEGORIE_TRANSACTION[cat]}
            </Badge>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Les catégories intégrées ne se suppriment pas : elles servent au
          rapprochement automatique avec les factures et au budget.
        </p>
      </Carte>
    </div>
  );
}
