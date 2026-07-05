import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { supprimerEvenement } from "@/server/actions/evenements";
import { formaterDate, formaterDateLongue, formaterHeure } from "@/lib/dates";
import {
  AvatarMembre,
  Badge,
  Bouton,
  Carte,
  EnTetePage,
  LienBouton,
} from "@/components/ui/base";
import { IconeCrayon } from "@/components/ui/icones";

export const metadata: Metadata = { title: "Événement" };

const LIBELLES_RRULE: Record<string, string> = {
  "FREQ=DAILY": "Tous les jours",
  "FREQ=WEEKLY": "Toutes les semaines",
  "FREQ=WEEKLY;INTERVAL=2": "Toutes les 2 semaines",
  "FREQ=MONTHLY": "Tous les mois",
  "FREQ=YEARLY": "Tous les ans",
};

export default async function PageEvenement({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerUtilisateur();
  const { id } = await params;
  const evenement = await db.evenement.findUnique({
    where: { id },
    include: { membres: { include: { membre: true } } },
  });
  if (!evenement) notFound();

  // DTEND exclusif → dernier jour inclus pour l'affichage.
  const finAffichee = evenement.journeeEntiere
    ? new Date(evenement.fin.getTime() - 86_400_000)
    : evenement.fin;
  const plusieursJours =
    evenement.journeeEntiere &&
    formaterDate(evenement.debut) !== formaterDate(finAffichee);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage
        titre={evenement.titre}
        action={
          <LienBouton href={`/calendrier/${evenement.id}/modifier`} variante="secondaire">
            <IconeCrayon className="h-4.5 w-4.5" />
            Modifier
          </LienBouton>
        }
      />

      <Carte>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Quand</dt>
            <dd className="mt-0.5 font-medium text-slate-900 first-letter:uppercase">
              {evenement.journeeEntiere ? (
                plusieursJours ? (
                  `Du ${formaterDate(evenement.debut)} au ${formaterDate(finAffichee)}`
                ) : (
                  <>{formaterDateLongue(evenement.debut)} · journée entière</>
                )
              ) : (
                <>
                  {formaterDateLongue(evenement.debut)} ·{" "}
                  {formaterHeure(evenement.debut)} – {formaterHeure(evenement.fin)}
                </>
              )}
            </dd>
          </div>
          {evenement.rrule && (
            <div>
              <dt className="text-slate-500">Répétition</dt>
              <dd className="mt-0.5">
                <Badge teinte="bleu">
                  {LIBELLES_RRULE[evenement.rrule] ?? evenement.rrule}
                </Badge>
              </dd>
            </div>
          )}
          {evenement.lieu && (
            <div>
              <dt className="text-slate-500">Lieu</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{evenement.lieu}</dd>
            </div>
          )}
          <div>
            <dt className="text-slate-500">Qui</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              {evenement.membres.length === 0 ? (
                <Badge>Toute la famille</Badge>
              ) : (
                evenement.membres.map(({ membre }) => (
                  <span key={membre.id} className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <AvatarMembre prenom={membre.prenom} couleur={membre.couleur} taille="sm" />
                    {membre.prenom}
                  </span>
                ))
              )}
            </dd>
          </div>
          {evenement.description && (
            <div>
              <dt className="text-slate-500">Description</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-slate-700">
                {evenement.description}
              </dd>
            </div>
          )}
        </dl>
      </Carte>

      <form action={supprimerEvenement}>
        <input type="hidden" name="id" value={evenement.id} />
        <Bouton type="submit" variante="danger" className="w-full">
          Supprimer cet événement
        </Bouton>
      </form>
    </div>
  );
}
