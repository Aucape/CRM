import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { calculerAge, formaterDate } from "@/lib/dates";
import {
  AvatarMembre,
  Badge,
  Carte,
  EnTetePage,
  EtatVide,
  LienBouton,
} from "@/components/ui/base";
import { IconePlus, IconeChevronDroite } from "@/components/ui/icones";

export const metadata: Metadata = { title: "Membres" };

export default async function PageMembres() {
  await exigerUtilisateur();
  const membres = await db.membre.findMany({
    where: { archive: false },
    orderBy: { dateNaissance: "asc" },
  });

  return (
    <div className="space-y-4">
      <EnTetePage
        titre="Membres"
        sousTitre="Les profils de la famille"
        action={
          <LienBouton href="/membres/nouveau">
            <IconePlus className="h-5 w-5" />
            Ajouter
          </LienBouton>
        }
      />

      {membres.length === 0 ? (
        <Carte>
          <EtatVide message="Aucun membre pour le moment.">
            <LienBouton href="/membres/nouveau">Ajouter un membre</LienBouton>
          </EtatVide>
        </Carte>
      ) : (
        <ul className="space-y-3">
          {membres.map((m) => (
            <li key={m.id}>
              <Link
                href={`/membres/${m.id}`}
                className="flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-blue-300"
              >
                <AvatarMembre prenom={m.prenom} couleur={m.couleur} taille="lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {m.prenom} {m.nom ?? ""}
                  </p>
                  {m.dateNaissance && (
                    <p className="text-sm text-slate-500">
                      {formaterDate(m.dateNaissance)} ·{" "}
                      {calculerAge(m.dateNaissance)} ans
                    </p>
                  )}
                  {m.allergies && (
                    <div className="mt-1">
                      <Badge teinte="rouge">Allergies : {m.allergies}</Badge>
                    </div>
                  )}
                </div>
                <IconeChevronDroite className="h-5 w-5 shrink-0 text-slate-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
