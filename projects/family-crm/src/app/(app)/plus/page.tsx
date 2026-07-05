import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth";
import { deconnecter } from "@/server/actions/auth";
import { AvatarMembre, Bouton, Carte, EnTetePage } from "@/components/ui/base";
import {
  IconeContacts,
  IconeDocument,
  IconeEcheance,
  IconeExport,
  IconeMembres,
  IconeRecherche,
} from "@/components/ui/icones";

const LIENS = [
  { href: "/echeances", libelle: "Échéances", detail: "Toutes les dates à ne pas rater", Icone: IconeEcheance },
  { href: "/documents", libelle: "Documents", detail: "eID, Kids-ID, assurances, impôts…", Icone: IconeDocument },
  { href: "/membres", libelle: "Membres", detail: "Profils de la famille", Icone: IconeMembres },
  { href: "/contacts", libelle: "Contacts", detail: "Médecin, école, artisans…", Icone: IconeContacts },
  { href: "/recherche", libelle: "Recherche", detail: "Chercher dans tous les modules", Icone: IconeRecherche },
  { href: "/api/export", libelle: "Export JSON", detail: "Sauvegarde complète des données", Icone: IconeExport },
];

export default async function PagePlus() {
  const utilisateur = await exigerUtilisateur();

  return (
    <div className="space-y-4">
      <EnTetePage titre="Plus" />

      <Carte>
        <div className="flex items-center gap-3">
          <AvatarMembre
            prenom={utilisateur.membre.prenom}
            couleur={utilisateur.membre.couleur}
            taille="lg"
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">
              {utilisateur.membre.prenom} {utilisateur.membre.nom ?? ""}
            </p>
            <p className="truncate text-sm text-slate-500">{utilisateur.email}</p>
            <p className="text-xs text-slate-400">
              {utilisateur.role === "PARENT" ? "Parent" : "Enfant"}
            </p>
          </div>
        </div>
      </Carte>

      <Carte>
        <ul className="divide-y divide-slate-100">
          {LIENS.map(({ href, libelle, detail, Icone }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-3.5 py-3 hover:bg-slate-50"
              >
                <Icone className="h-6 w-6 shrink-0 text-slate-400" />
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">
                    {libelle}
                  </span>
                  <span className="block text-sm text-slate-500">{detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Carte>

      <form action={deconnecter}>
        <Bouton type="submit" variante="secondaire" className="w-full">
          Se déconnecter
        </Bouton>
      </form>
    </div>
  );
}
