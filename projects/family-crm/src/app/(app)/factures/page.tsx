import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { basculerPaiement } from "@/server/actions/factures";
import { coutMensuelCents } from "@/lib/recurrence";
import {
  LIBELLES_CATEGORIE_FACTURE,
  LIBELLES_RECURRENCE,
  type CategorieFacture,
  type Recurrence,
} from "@/lib/constantes";
import {
  formaterDate,
  formaterEuros,
  joursRestants,
  libelleRelatif,
} from "@/lib/dates";
import {
  AvatarMembre,
  Badge,
  Bouton,
  Carte,
  EnTetePage,
  EtatVide,
  LienBouton,
} from "@/components/ui/base";
import { IconePlus, IconeCoche, IconeRotation } from "@/components/ui/icones";

export const metadata: Metadata = { title: "Factures" };

export default async function PageFactures() {
  await exigerUtilisateur();

  const [aPayer, payesRecemment, factures] = await Promise.all([
    db.paiement.findMany({
      where: { statut: "A_PAYER" },
      include: { facture: { include: { payeur: true } } },
      orderBy: { dateEcheance: "asc" },
    }),
    db.paiement.findMany({
      where: { statut: "PAYE" },
      include: { facture: true },
      orderBy: { payeLe: "desc" },
      take: 5,
    }),
    db.facture.findMany({
      where: { active: true },
      include: { payeur: true },
      orderBy: { libelle: "asc" },
    }),
  ]);

  // Budget mensuel lissé des dépenses récurrentes, par catégorie.
  const parCategorie = new Map<string, number>();
  let totalMensuel = 0;
  for (const f of factures) {
    const cout = coutMensuelCents(f.montantCents, f.recurrence as Recurrence);
    if (cout === 0) continue;
    totalMensuel += cout;
    parCategorie.set(f.categorie, (parCategorie.get(f.categorie) ?? 0) + cout);
  }
  const categoriesTriees = [...parCategorie.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <EnTetePage
        titre="Factures"
        sousTitre="Factures, abonnements et budget récurrent"
        action={
          <LienBouton href="/factures/nouvelle">
            <IconePlus className="h-5 w-5" />
            Ajouter
          </LienBouton>
        }
      />

      <Carte titre="À payer">
        {aPayer.length === 0 ? (
          <EtatVide message="Rien à payer — tout est en ordre 🎉" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {aPayer.map((p) => {
              const retard = joursRestants(p.dateEcheance) < 0;
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3"
                >
                  {/* basis-52 : sous ~420 px, le groupe montant/payeur/bouton
                      passe sur sa propre ligne au lieu d'écraser le titre */}
                  <div className="min-w-0 flex-1 basis-52">
                    <Link
                      href={`/factures/${p.factureId}/modifier`}
                      className="font-medium text-slate-900 hover:text-blue-700"
                    >
                      {p.facture.libelle}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                      <span>
                        {formaterDate(p.dateEcheance)} ({libelleRelatif(p.dateEcheance)})
                      </span>
                      {retard ? (
                        <Badge teinte="rouge">En retard</Badge>
                      ) : (
                        joursRestants(p.dateEcheance) <= 7 && (
                          <Badge teinte="orange">Bientôt</Badge>
                        )
                      )}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <span className="font-semibold text-slate-900">
                      {formaterEuros(p.montantCents)}
                    </span>
                    {p.facture.payeur && (
                      <AvatarMembre
                        prenom={p.facture.payeur.prenom}
                        couleur={p.facture.payeur.couleur}
                        taille="sm"
                      />
                    )}
                    <form action={basculerPaiement}>
                      <input type="hidden" name="paiementId" value={p.id} />
                      <input type="hidden" name="payer" value="true" />
                      <Bouton
                        type="submit"
                        variante="secondaire"
                        className="!min-h-9 !px-3 text-green-700"
                        title="Marquer payé"
                      >
                        <IconeCoche className="h-4.5 w-4.5" />
                        Payé
                      </Bouton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Carte>

      <Carte titre="Budget mensuel récurrent">
        <p className="text-2xl font-bold text-slate-900">
          {formaterEuros(totalMensuel)}
          <span className="ml-1 text-sm font-normal text-slate-500">/ mois</span>
        </p>
        <ul className="mt-3 space-y-2">
          {categoriesTriees.map(([categorie, cout]) => (
            <li key={categorie} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 truncate text-slate-600">
                {LIBELLES_CATEGORIE_FACTURE[categorie as CategorieFacture] ?? categorie}
              </span>
              <span className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.max(4, Math.round((cout / totalMensuel) * 100))}%` }} />
              <span className="ml-auto font-medium text-slate-900">
                {formaterEuros(cout)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          Montants lissés par mois (une facture annuelle compte pour 1/12 par mois).
        </p>
      </Carte>

      <Carte titre="Toutes les factures & abonnements">
        {factures.length === 0 ? (
          <EtatVide message="Aucune facture enregistrée." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {factures.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/factures/${f.id}/modifier`}
                  className="flex items-center gap-3 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{f.libelle}</p>
                    <p className="text-sm text-slate-500">
                      {LIBELLES_RECURRENCE[f.recurrence as Recurrence]} ·{" "}
                      {LIBELLES_CATEGORIE_FACTURE[f.categorie as CategorieFacture]}
                      {f.payeur && ` · payé par ${f.payeur.prenom}`}
                    </p>
                  </div>
                  <span className="font-semibold text-slate-900">
                    {formaterEuros(f.montantCents)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Carte>

      {payesRecemment.length > 0 && (
        <Carte titre="Payées récemment">
          <ul className="divide-y divide-slate-100">
            {payesRecemment.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700">
                    {p.facture.libelle}
                  </p>
                  <p className="text-xs text-slate-400">
                    échéance du {formaterDate(p.dateEcheance)}
                    {p.payeLe && ` · payée le ${formaterDate(p.payeLe)}`}
                  </p>
                </div>
                <span className="text-sm text-slate-500">
                  {formaterEuros(p.montantCents)}
                </span>
                <form action={basculerPaiement}>
                  <input type="hidden" name="paiementId" value={p.id} />
                  <input type="hidden" name="payer" value="false" />
                  <Bouton
                    type="submit"
                    variante="discret"
                    className="!min-h-9 !px-2.5"
                    title="Remettre à payer"
                  >
                    <IconeRotation className="h-4 w-4" />
                  </Bouton>
                </form>
              </li>
            ))}
          </ul>
        </Carte>
      )}
    </div>
  );
}
