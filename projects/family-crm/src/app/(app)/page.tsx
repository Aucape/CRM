import Link from "next/link";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { statutAffiche } from "@/lib/echeances";
import { toutesOccurrences } from "@/lib/calendrier";
import {
  ajouterJours,
  debutJourBruxelles,
  formaterDateLongue,
  formaterEuros,
  formaterHeure,
  libelleRelatif,
} from "@/lib/dates";
import { AvatarMembre, Carte, EnTetePage, LienBouton } from "@/components/ui/base";
import { IconeAlerte } from "@/components/ui/icones";
import { LigneEcheance } from "@/components/echeances/ligne-echeance";

// Dashboard « Cette semaine / Ce mois » : la vue unique où tout remonte.
export default async function PageAccueil() {
  const utilisateur = await exigerUtilisateur();

  const maintenant = new Date();
  const debutJour = debutJourBruxelles(maintenant);
  const dans7Jours = ajouterJours(debutJour, 7);
  const dans30Jours = ajouterJours(debutJour, 30);

  const [echeances, evenements, aPayer, articlesRestants] = await Promise.all([
    db.echeance.findMany({
      where: { statut: "A_VENIR", dateEcheance: { lt: dans30Jours } },
      include: { membre: true },
      orderBy: { dateEcheance: "asc" },
    }),
    db.evenement.findMany({
      where: {
        OR: [
          { rrule: null, debut: { lt: dans7Jours }, fin: { gt: debutJour } },
          { rrule: { not: null }, debut: { lt: dans7Jours } },
        ],
      },
      include: { membres: { include: { membre: true } } },
    }),
    db.paiement.findMany({
      where: { statut: "A_PAYER", dateEcheance: { lt: dans30Jours } },
      include: { facture: true },
    }),
    db.articleCourse.count({ where: { coche: false } }),
  ]);

  // Alertes : fenêtre d'alerte ouverte ou dépassée.
  const alertes = echeances.filter((e) => statutAffiche(e) !== "A_VENIR");
  const idsAlertes = new Set(alertes.map((e) => e.id));

  const cetteSemaine = echeances.filter(
    (e) => !idsAlertes.has(e.id) && e.dateEcheance < dans7Jours,
  );
  const ceMois = echeances.filter(
    (e) => !idsAlertes.has(e.id) && e.dateEcheance >= dans7Jours,
  );

  const occurrences = toutesOccurrences(evenements, debutJour, dans7Jours);
  const totalAPayer = aPayer.reduce((somme, p) => somme + p.montantCents, 0);

  return (
    <div className="space-y-4">
      <EnTetePage
        titre={`Bonjour ${utilisateur.membre.prenom} 👋`}
        sousTitre={formaterDateLongue(maintenant)}
      />

      {/* Alertes — visibles dès l'ouverture */}
      {alertes.length > 0 && (
        <Carte className="ring-2 ring-amber-300">
          <div className="mb-2 flex items-center gap-2">
            <IconeAlerte className="h-5 w-5 text-amber-600" />
            <h2 className="text-sm font-semibold tracking-wide text-amber-700 uppercase">
              À ne pas rater
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {alertes.map((e) => (
              <LigneEcheance key={e.id} echeance={e} />
            ))}
          </ul>
        </Carte>
      )}

      {/* Résumé chiffré */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/factures" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-blue-300">
          <p className="text-xs font-semibold text-slate-500 uppercase">Factures sous 30 j</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formaterEuros(totalAPayer)}</p>
          <p className="text-xs text-slate-400">{aPayer.length} paiement{aPayer.length > 1 ? "s" : ""}</p>
        </Link>
        <Link href="/courses" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-blue-300">
          <p className="text-xs font-semibold text-slate-500 uppercase">Courses</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{articlesRestants}</p>
          <p className="text-xs text-slate-400">article{articlesRestants > 1 ? "s" : ""} sur la liste</p>
        </Link>
      </div>

      {/* Événements de la semaine */}
      <Carte
        titre="Cette semaine au calendrier"
        action={
          <Link href="/calendrier" className="text-sm font-medium text-blue-700">
            Tout voir
          </Link>
        }
      >
        {occurrences.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">Rien de prévu ces 7 prochains jours.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {occurrences.slice(0, 6).map((o, i) => (
              <li key={`${o.evenement.id}-${i}`}>
                <Link
                  href={`/calendrier/${o.evenement.id}`}
                  className="flex items-center gap-3 py-2.5 hover:bg-slate-50"
                >
                  <span
                    className="h-9 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        o.evenement.membres[0]?.membre.couleur ?? "#64748b",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      {o.evenement.titre}
                    </p>
                    <p className="text-sm text-slate-500 first-letter:uppercase">
                      {libelleRelatif(o.debut)}
                      {!o.evenement.journeeEntiere && ` · ${formaterHeure(o.debut)}`}
                      {o.evenement.lieu && ` · ${o.evenement.lieu}`}
                    </p>
                  </div>
                  <span className="flex shrink-0 -space-x-1.5">
                    {o.evenement.membres.slice(0, 3).map(({ membre }) => (
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

      {/* Échéances de la semaine puis du mois */}
      <Carte
        titre="Cette semaine"
        action={
          <Link href="/echeances" className="text-sm font-medium text-blue-700">
            Tout voir
          </Link>
        }
      >
        {cetteSemaine.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">
            Aucune autre échéance cette semaine.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cetteSemaine.map((e) => (
              <LigneEcheance key={e.id} echeance={e} />
            ))}
          </ul>
        )}
      </Carte>

      <Carte titre="Ce mois">
        {ceMois.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">Rien d&apos;autre sous 30 jours.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {ceMois.slice(0, 8).map((e) => (
              <LigneEcheance key={e.id} echeance={e} />
            ))}
          </ul>
        )}
        {ceMois.length > 8 && (
          <div className="pt-2">
            <LienBouton href="/echeances" variante="discret" className="w-full">
              + {ceMois.length - 8} autres échéances
            </LienBouton>
          </div>
        )}
      </Carte>
    </div>
  );
}
