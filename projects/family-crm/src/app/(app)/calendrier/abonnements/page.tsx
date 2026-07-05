import { headers } from "next/headers";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { regenererJeton } from "@/server/actions/evenements";
import { AvatarMembre, Bouton, Carte, EnTetePage } from "@/components/ui/base";
import { ChampCopie } from "@/components/calendrier/champ-copie";

export const metadata: Metadata = { title: "Abonnements calendrier" };

export default async function PageAbonnements() {
  await exigerUtilisateur();
  const [membres, flux, entetes] = await Promise.all([
    db.membre.findMany({ where: { archive: false }, orderBy: { dateNaissance: "asc" } }),
    db.fluxCalendrier.findMany(),
    headers(),
  ]);

  const proto = entetes.get("x-forwarded-proto") ?? "http";
  const hote = entetes.get("host") ?? "localhost:3000";
  const urlFlux = (jeton: string) => `${proto}://${hote}/api/ics/${jeton}.ics`;

  const fluxFamille = flux.find((f) => !f.membreId);
  const fluxParMembre = new Map(flux.filter((f) => f.membreId).map((f) => [f.membreId, f]));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <EnTetePage
        titre="Abonnements Apple Calendar"
        sousTitre="Flux ICS en lecture seule, un par membre + un pour toute la famille"
      />

      <Carte>
        <ol className="list-inside list-decimal space-y-1 text-sm text-slate-600">
          <li>Copiez l&apos;URL du flux voulu ci-dessous.</li>
          <li>
            Sur iPhone/iPad : Réglages → Apps → Calendrier → Comptes → Ajouter un
            compte → Autre → <strong>Ajouter un cal. avec abonnement</strong>.
          </li>
          <li>
            Sur Mac : Calendrier → Fichier → <strong>Nouvel abonnement à un calendrier…</strong>
          </li>
          <li>Collez l&apos;URL : les événements de l&apos;app apparaissent automatiquement.</li>
        </ol>
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          Ces URL sont secrètes : quiconque les connaît peut lire le calendrier.
          « Régénérer » révoque l&apos;ancienne URL (à re-configurer sur les appareils).
        </p>
      </Carte>

      <Carte titre="Toute la famille">
        {fluxFamille ? (
          <ChampCopie valeur={urlFlux(fluxFamille.jeton)} />
        ) : (
          <p className="text-sm text-slate-500">Pas encore de flux.</p>
        )}
        <form action={regenererJeton} className="mt-2">
          <Bouton type="submit" variante="secondaire" className="!min-h-9 text-sm">
            {fluxFamille ? "Régénérer l'URL" : "Créer le flux"}
          </Bouton>
        </form>
      </Carte>

      {membres.map((m) => {
        const f = fluxParMembre.get(m.id);
        return (
          <Carte key={m.id}>
            <div className="mb-2 flex items-center gap-2.5">
              <AvatarMembre prenom={m.prenom} couleur={m.couleur} taille="sm" />
              <h2 className="font-semibold text-slate-900">{m.prenom}</h2>
              <span className="text-xs text-slate-400">
                (ses événements + ceux de toute la famille)
              </span>
            </div>
            {f && <ChampCopie valeur={urlFlux(f.jeton)} />}
            <form action={regenererJeton} className="mt-2">
              <input type="hidden" name="membreId" value={m.id} />
              <Bouton type="submit" variante="secondaire" className="!min-h-9 text-sm">
                {f ? "Régénérer l'URL" : "Créer le flux"}
              </Bouton>
            </form>
          </Carte>
        );
      })}
    </div>
  );
}
