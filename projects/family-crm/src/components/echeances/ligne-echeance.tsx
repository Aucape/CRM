// Ligne d'échéance partagée entre le dashboard et la page Échéances.
// Composant serveur : le basculement passe par une action de formulaire.
import Link from "next/link";
import type { Echeance, Membre } from "@prisma/client";
import { basculerEcheance } from "@/server/actions/echeances";
import { statutAffiche } from "@/lib/echeances";
import { LIBELLES_MODULE, type ModuleEcheance } from "@/lib/constantes";
import { formaterDate, libelleRelatif } from "@/lib/dates";
import { AvatarMembre, Badge } from "@/components/ui/base";

export type EcheanceAvecMembre = Echeance & { membre: Membre | null };

/** Lien vers l'objet source de l'échéance, selon son module. */
function lienSource(e: Echeance): string | null {
  switch (e.module) {
    case "FACTURE":
      return "/factures";
    case "DOCUMENT":
      return e.sourceId ? `/documents/${e.sourceId}/modifier` : "/documents";
    default:
      return null;
  }
}

export function LigneEcheance({ echeance }: { echeance: EcheanceAvecMembre }) {
  const statut = statutAffiche(echeance);
  const faite = statut === "FAIT";
  const href = lienSource(echeance);

  const titre = (
    <span className={`font-medium ${faite ? "text-slate-400 line-through" : "text-slate-900"}`}>
      {echeance.titre}
    </span>
  );

  return (
    <li className="flex items-center gap-3 py-2.5">
      <form action={basculerEcheance} className="flex items-center">
        <input type="hidden" name="id" value={echeance.id} />
        <input type="hidden" name="faite" value={String(!faite)} />
        <button
          type="submit"
          aria-label={faite ? "Rouvrir" : "Marquer fait"}
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
            faite
              ? "border-green-500 bg-green-500 text-white"
              : "border-slate-300 text-transparent hover:border-green-500 hover:text-green-500"
          }`}
        >
          ✓
        </button>
      </form>

      <div className="min-w-0 flex-1">
        {href ? (
          <Link href={href} className="hover:underline">
            {titre}
          </Link>
        ) : (
          titre
        )}
        <p className="text-sm text-slate-500">
          {formaterDate(echeance.dateEcheance)} ({libelleRelatif(echeance.dateEcheance)})
          <span className="ml-2 text-xs text-slate-400">
            {LIBELLES_MODULE[echeance.module as ModuleEcheance] ?? echeance.module}
          </span>
        </p>
      </div>

      {statut === "EN_RETARD" && <Badge teinte="rouge">En retard</Badge>}
      {statut === "EN_ALERTE" && <Badge teinte="orange">Bientôt</Badge>}

      {echeance.membre && (
        <AvatarMembre
          prenom={echeance.membre.prenom}
          couleur={echeance.membre.couleur}
          taille="sm"
        />
      )}
    </li>
  );
}
