import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { archiverMembre } from "@/server/actions/membres";
import { calculerAge, formaterDate } from "@/lib/dates";
import {
  AvatarMembre,
  Badge,
  Bouton,
  Carte,
  EnTetePage,
  LienBouton,
} from "@/components/ui/base";
import { IconeCrayon } from "@/components/ui/icones";

export const metadata: Metadata = { title: "Fiche membre" };

function Ligne({ libelle, valeur }: { libelle: string; valeur: string | null }) {
  if (!valeur) return null;
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-sm text-slate-500">{libelle}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{valeur}</dd>
    </div>
  );
}

export default async function PageFicheMembre({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { id } = await params;
  const membre = await db.membre.findUnique({
    where: { id },
    include: { utilisateur: { select: { email: true, role: true } } },
  });
  if (!membre) notFound();

  return (
    <div className="space-y-4">
      <EnTetePage
        titre={`${membre.prenom} ${membre.nom ?? ""}`}
        action={
          <LienBouton href={`/membres/${membre.id}/modifier`} variante="secondaire">
            <IconeCrayon className="h-4.5 w-4.5" />
            Modifier
          </LienBouton>
        }
      />

      <Carte>
        <div className="flex items-center gap-4">
          <AvatarMembre prenom={membre.prenom} couleur={membre.couleur} taille="lg" />
          <div>
            {membre.dateNaissance && (
              <p className="text-sm text-slate-600">
                Née le {formaterDate(membre.dateNaissance)} ·{" "}
                <span className="font-medium">{calculerAge(membre.dateNaissance)} ans</span>
              </p>
            )}
            {membre.utilisateur && (
              <p className="mt-0.5 text-xs text-slate-400">
                Compte : {membre.utilisateur.email} (
                {membre.utilisateur.role === "PARENT" ? "parent" : "enfant"})
              </p>
            )}
            {membre.archive && (
              <div className="mt-1">
                <Badge teinte="orange">Archivé</Badge>
              </div>
            )}
          </div>
        </div>
      </Carte>

      {membre.allergies && (
        <Carte className="ring-red-200">
          <p className="text-sm font-semibold text-red-700">⚠️ Allergies</p>
          <p className="mt-1 text-sm text-slate-700">{membre.allergies}</p>
        </Carte>
      )}

      <Carte titre="Infos pratiques">
        <dl className="divide-y divide-slate-100">
          <Ligne libelle="Taille vêtements" valeur={membre.tailleVetements} />
          <Ligne libelle="Pointure" valeur={membre.pointure} />
          <Ligne libelle="Groupe sanguin" valeur={membre.groupeSanguin} />
        </dl>
        {!membre.tailleVetements && !membre.pointure && !membre.groupeSanguin && (
          <p className="py-2 text-sm text-slate-400">
            Rien pour le moment — ajoutez tailles et groupe sanguin via « Modifier ».
          </p>
        )}
      </Carte>

      {membre.notes && (
        <Carte titre="Notes">
          <p className="text-sm whitespace-pre-wrap text-slate-700">{membre.notes}</p>
        </Carte>
      )}

      {utilisateur.role === "PARENT" && (
        <form action={archiverMembre}>
          <input type="hidden" name="id" value={membre.id} />
          <input type="hidden" name="archive" value={String(!membre.archive)} />
          <Bouton type="submit" variante="secondaire" className="w-full">
            {membre.archive ? "Restaurer ce membre" : "Archiver ce membre"}
          </Bouton>
        </form>
      )}
    </div>
  );
}
