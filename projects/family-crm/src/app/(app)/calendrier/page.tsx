import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { toutesOccurrences, type Occurrence } from "@/lib/calendrier";
import {
  ajouterJours,
  ajouterMois,
  composantsBruxelles,
  dateBruxelles,
  debutJourBruxelles,
  debutMoisBruxelles,
  debutSemaineBruxelles,
  formaterDateLongue,
  formaterHeure,
  versInputDate,
} from "@/lib/dates";
import { AvatarMembre, Carte, EnTetePage, EtatVide, LienBouton } from "@/components/ui/base";
import {
  IconeChevronDroite,
  IconeChevronGauche,
  IconeLien,
  IconePlus,
} from "@/components/ui/icones";

export const metadata: Metadata = { title: "Calendrier" };

type EvenementCharge = Awaited<ReturnType<typeof chargerEvenements>>[number];

function chargerEvenements(debutPlage: Date, finPlage: Date) {
  return db.evenement.findMany({
    where: {
      OR: [
        { rrule: null, debut: { lt: finPlage }, fin: { gt: debutPlage } },
        { rrule: { not: null }, debut: { lt: finPlage } },
      ],
    },
    include: { membres: { include: { membre: true } } },
  });
}

function couleurEvenement(e: EvenementCharge): string {
  return e.membres[0]?.membre.couleur ?? "#64748b";
}

const FMT_MOIS = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  month: "long",
  year: "numeric",
});

export default async function PageCalendrier({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; date?: string; membre?: string }>;
}) {
  await exigerUtilisateur();
  const params = await searchParams;
  const vue = params.vue === "mois" ? "mois" : "semaine";
  const filtreMembre = params.membre ?? null;

  let ancre = new Date();
  if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    const [a, m, j] = params.date.split("-").map(Number);
    ancre = dateBruxelles(a, m, j, 12);
  }

  // Plage affichée : la semaine, ou la grille du mois (semaines complètes).
  const debutSemaine = debutSemaineBruxelles(ancre);
  const debutMois = debutMoisBruxelles(ancre);
  const debutGrille = vue === "semaine" ? debutSemaine : debutSemaineBruxelles(debutMois);
  const finMois = ajouterMois(debutMois, 1);
  const finGrille =
    vue === "semaine"
      ? ajouterJours(debutSemaine, 7)
      : ajouterJours(debutSemaineBruxelles(new Date(finMois.getTime() - 1)), 7);

  const evenements = await chargerEvenements(debutGrille, finGrille);
  const membres = await db.membre.findMany({
    where: { archive: false },
    orderBy: { dateNaissance: "asc" },
  });

  let occurrences = toutesOccurrences(evenements, debutGrille, finGrille);
  if (filtreMembre) {
    occurrences = occurrences.filter(
      (o) =>
        o.evenement.membres.length === 0 || // famille entière
        o.evenement.membres.some((m) => m.membreId === filtreMembre),
    );
  }

  // Occurrences par jour de la plage.
  const nbJours = Math.round((finGrille.getTime() - debutGrille.getTime()) / 86_400_000);
  const jours: { date: Date; occs: Occurrence<EvenementCharge>[] }[] = [];
  for (let i = 0; i < nbJours; i++) {
    const debutJour = ajouterJours(debutGrille, i);
    const finJour = ajouterJours(debutGrille, i + 1);
    jours.push({
      date: debutJour,
      occs: occurrences.filter((o) => o.debut < finJour && o.fin > debutJour),
    });
  }

  const aujourdHui = debutJourBruxelles(new Date()).getTime();
  const lien = (modifs: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const etat: Record<string, string | null> = {
      vue,
      date: versInputDate(ancre),
      membre: filtreMembre,
      ...modifs,
    };
    for (const [cle, valeur] of Object.entries(etat)) {
      if (valeur) q.set(cle, valeur);
    }
    return `/calendrier?${q}`;
  };
  const pas = (sens: 1 | -1) =>
    versInputDate(vue === "semaine" ? ajouterJours(ancre, 7 * sens) : ajouterMois(debutMois, sens));

  const titrePeriode =
    vue === "semaine"
      ? `Semaine du ${formaterDateLongue(debutSemaine)}`
      : FMT_MOIS.format(debutMois);

  return (
    <div className="space-y-4">
      <EnTetePage
        titre="Calendrier"
        action={
          <div className="flex gap-2">
            <LienBouton href="/calendrier/abonnements" variante="secondaire" className="!px-3">
              <IconeLien className="h-5 w-5" />
              <span className="hidden sm:inline">Apple Calendar</span>
            </LienBouton>
            <LienBouton href="/calendrier/nouveau">
              <IconePlus className="h-5 w-5" />
              <span className="hidden sm:inline">Événement</span>
            </LienBouton>
          </div>
        }
      />

      {/* Contrôles : vue, navigation, filtre par membre */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-slate-200/70 p-1 text-sm font-medium">
          <Link
            href={lien({ vue: "semaine" })}
            className={`rounded-lg px-3.5 py-1.5 ${vue === "semaine" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            Semaine
          </Link>
          <Link
            href={lien({ vue: "mois" })}
            className={`rounded-lg px-3.5 py-1.5 ${vue === "mois" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            Mois
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Link href={lien({ date: pas(-1) })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Période précédente">
            <IconeChevronGauche className="h-5 w-5" />
          </Link>
          <Link href={lien({ date: null })} className="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50">
            Aujourd&apos;hui
          </Link>
          <Link href={lien({ date: pas(1) })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Période suivante">
            <IconeChevronDroite className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={lien({ membre: null })}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${!filtreMembre ? "bg-slate-800 text-white ring-slate-800" : "text-slate-600 ring-slate-300"}`}
        >
          Tous
        </Link>
        {membres.map((m) => (
          <Link
            key={m.id}
            href={lien({ membre: filtreMembre === m.id ? null : m.id })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${filtreMembre === m.id ? "text-white ring-0" : "text-slate-600 ring-slate-300"}`}
            style={filtreMembre === m.id ? { backgroundColor: m.couleur } : undefined}
          >
            {m.prenom}
          </Link>
        ))}
      </div>

      <p className="text-sm font-semibold text-slate-700 first-letter:uppercase">{titrePeriode}</p>

      {vue === "semaine" ? (
        <div className="space-y-3">
          {jours.map(({ date, occs }) => {
            const estAujourdHui = date.getTime() === aujourdHui;
            return (
              <Carte key={date.toISOString()} className={estAujourdHui ? "ring-2 ring-blue-500" : ""}>
                <p className={`text-sm font-semibold first-letter:uppercase ${estAujourdHui ? "text-blue-700" : "text-slate-700"}`}>
                  {formaterDateLongue(date)}
                  {estAujourdHui && " · aujourd'hui"}
                </p>
                {occs.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-400">—</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {occs.map((o, i) => (
                      <li key={`${o.evenement.id}-${i}`}>
                        <Link
                          href={`/calendrier/${o.evenement.id}`}
                          className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50"
                        >
                          <span
                            className="h-9 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: couleurEvenement(o.evenement) }}
                          />
                          <span className="w-24 shrink-0 text-sm text-slate-500">
                            {o.evenement.journeeEntiere
                              ? "Journée"
                              : `${formaterHeure(o.debut)} – ${formaterHeure(o.fin)}`}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-slate-900">
                              {o.evenement.titre}
                            </span>
                            {o.evenement.lieu && (
                              <span className="block truncate text-xs text-slate-400">
                                {o.evenement.lieu}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 -space-x-1.5">
                            {o.evenement.membres.map(({ membre }) => (
                              <AvatarMembre
                                key={membre.id}
                                prenom={membre.prenom}
                                couleur={membre.couleur}
                                taille="sm"
                              />
                            ))}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Carte>
            );
          })}
        </div>
      ) : (
        <Carte className="!p-2">
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400 uppercase">
            {["lu", "ma", "me", "je", "ve", "sa", "di"].map((j) => (
              <span key={j} className="py-1">
                {j}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-slate-100">
            {jours.map(({ date, occs }) => {
              const c = composantsBruxelles(date);
              const horsMois = date < debutMois || date >= finMois;
              const estAujourdHui = date.getTime() === aujourdHui;
              return (
                <Link
                  key={date.toISOString()}
                  href={`/calendrier?vue=semaine&date=${versInputDate(date)}${filtreMembre ? `&membre=${filtreMembre}` : ""}`}
                  className={`min-h-20 bg-white p-1 hover:bg-blue-50 ${horsMois ? "opacity-40" : ""}`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      estAujourdHui ? "bg-blue-700 text-white" : "text-slate-700"
                    }`}
                  >
                    {c.jour}
                  </span>
                  <span className="mt-0.5 block space-y-0.5">
                    {occs.slice(0, 3).map((o, i) => (
                      <span
                        key={`${o.evenement.id}-${i}`}
                        className="block truncate rounded px-1 text-[10px] leading-4 font-medium text-white"
                        style={{ backgroundColor: couleurEvenement(o.evenement) }}
                      >
                        {o.evenement.titre}
                      </span>
                    ))}
                    {occs.length > 3 && (
                      <span className="block px-1 text-[10px] text-slate-400">
                        +{occs.length - 3}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </Carte>
      )}

      {occurrences.length === 0 && (
        <Carte>
          <EtatVide message="Aucun événement sur cette période.">
            <LienBouton href="/calendrier/nouveau">Créer un événement</LienBouton>
          </EtatVide>
        </Carte>
      )}
    </div>
  );
}
