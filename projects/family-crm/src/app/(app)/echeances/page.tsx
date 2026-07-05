import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { statutAffiche } from "@/lib/echeances";
import { supprimerEcheanceManuelle } from "@/server/actions/echeances";
import {
  Carte,
  EnTetePage,
  EtatVide,
  LienBouton,
} from "@/components/ui/base";
import { IconeCorbeille, IconePlus } from "@/components/ui/icones";
import {
  LigneEcheance,
  type EcheanceAvecMembre,
} from "@/components/echeances/ligne-echeance";

export const metadata: Metadata = { title: "Échéances" };

function Section({
  titre,
  echeances,
  accent,
}: {
  titre: string;
  echeances: EcheanceAvecMembre[];
  accent?: string;
}) {
  if (echeances.length === 0) return null;
  return (
    <Carte titre={titre} className={accent}>
      <ul className="divide-y divide-slate-100">
        {echeances.map((e) => (
          <div key={e.id} className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <LigneEcheance echeance={e} />
            </div>
            {e.module === "MANUEL" && (
              <form action={supprimerEcheanceManuelle}>
                <input type="hidden" name="id" value={e.id} />
                <button
                  type="submit"
                  className="rounded-lg p-2 text-slate-300 hover:text-red-600"
                  title="Supprimer"
                >
                  <IconeCorbeille className="h-4.5 w-4.5" />
                </button>
              </form>
            )}
          </div>
        ))}
      </ul>
    </Carte>
  );
}

export default async function PageEcheances() {
  await exigerUtilisateur();
  const [aVenir, faites] = await Promise.all([
    db.echeance.findMany({
      where: { statut: "A_VENIR" },
      include: { membre: true },
      orderBy: { dateEcheance: "asc" },
    }),
    db.echeance.findMany({
      where: { statut: "FAIT" },
      include: { membre: true },
      orderBy: { faitLe: "desc" },
      take: 10,
    }),
  ]);

  const enRetard = aVenir.filter((e) => statutAffiche(e) === "EN_RETARD");
  const enAlerte = aVenir.filter((e) => statutAffiche(e) === "EN_ALERTE");
  const plusTard = aVenir.filter((e) => statutAffiche(e) === "A_VENIR");

  return (
    <div className="space-y-4">
      <EnTetePage
        titre="Échéances"
        sousTitre="Tout ce qui a une date, tous modules confondus"
        action={
          <LienBouton href="/echeances/nouvelle">
            <IconePlus className="h-5 w-5" />
            Ajouter
          </LienBouton>
        }
      />

      {aVenir.length === 0 && (
        <Carte>
          <EtatVide message="Aucune échéance à venir — profitez-en 🎉">
            <LienBouton href="/echeances/nouvelle">Créer une échéance</LienBouton>
          </EtatVide>
        </Carte>
      )}

      <Section titre="🔴 En retard" echeances={enRetard} accent="ring-red-200" />
      <Section titre="🟠 À faire bientôt" echeances={enAlerte} accent="ring-amber-200" />
      <Section titre="Plus tard" echeances={plusTard} />
      <Section titre="Faites récemment" echeances={faites} />
    </div>
  );
}
