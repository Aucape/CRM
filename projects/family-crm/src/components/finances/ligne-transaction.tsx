// Ligne de transaction (composant serveur) : date, libellés, catégorie
// éditable, montant coloré, badge de rapprochement facture.
import type { Transaction } from "@prisma/client";
import { formaterDate, formaterEuros } from "@/lib/dates";
import { Badge } from "@/components/ui/base";
import {
  CategorieTransaction,
  type OptionCategorie,
} from "@/components/finances/categorie-transaction";

export function LigneTransaction({
  transaction: t,
  nomCompte,
  categories,
}: {
  transaction: Transaction;
  nomCompte?: string;
  categories: OptionCategorie[];
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      <div className="min-w-0 flex-1 basis-52">
        <p className="truncate font-medium text-slate-900">
          {t.contrepartie ?? t.communication ?? "Transaction"}
        </p>
        <p className="truncate text-xs text-slate-400">
          {formaterDate(t.date)}
          {nomCompte && ` · ${nomCompte}`}
          {t.contrepartie && t.communication && ` · ${t.communication}`}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {t.paiementId && <Badge teinte="vert">Facture ✓</Badge>}
        <CategorieTransaction
          id={t.id}
          categorie={t.categorie}
          contrepartie={t.contrepartie}
          categories={categories}
        />
        <span
          className={`w-24 text-right font-semibold tabular-nums ${
            t.montantCents < 0 ? "text-slate-900" : "text-green-700"
          }`}
        >
          {t.montantCents > 0 && "+"}
          {formaterEuros(t.montantCents)}
        </span>
      </div>
    </li>
  );
}
