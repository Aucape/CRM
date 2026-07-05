import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import {
  LIBELLES_TYPE_DOCUMENT,
  type TypeDocument,
} from "@/lib/constantes";
import { formaterDate, joursRestants, libelleRelatif } from "@/lib/dates";
import {
  AvatarMembre,
  Badge,
  Carte,
  EnTetePage,
  EtatVide,
  LienBouton,
} from "@/components/ui/base";
import { IconePlus, IconeChevronDroite } from "@/components/ui/icones";

export const metadata: Metadata = { title: "Documents" };

type DocumentCharge = NonNullable<
  Awaited<ReturnType<typeof chargerDocuments>>
>[number];

function chargerDocuments() {
  return db.document.findMany({
    include: { membre: true },
    orderBy: { dateExpiration: "asc" },
  });
}

function LigneDocument({ doc }: { doc: DocumentCharge }) {
  const jours = doc.dateExpiration ? joursRestants(doc.dateExpiration) : null;
  return (
    <li>
      <Link
        href={`/documents/${doc.id}/modifier`}
        className="flex items-center gap-3 py-3 hover:bg-slate-50"
      >
        {doc.membre ? (
          <AvatarMembre prenom={doc.membre.prenom} couleur={doc.membre.couleur} />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm">
            🏠
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{doc.titre}</p>
          <p className="text-sm text-slate-500">
            {LIBELLES_TYPE_DOCUMENT[doc.type as TypeDocument] ?? doc.type}
            {doc.dateExpiration && ` · expire le ${formaterDate(doc.dateExpiration)}`}
          </p>
        </div>
        {jours !== null &&
          (jours < 0 ? (
            <Badge teinte="rouge">Expiré</Badge>
          ) : jours <= doc.alerteJoursAvant ? (
            <Badge teinte="orange">{libelleRelatif(doc.dateExpiration!)}</Badge>
          ) : (
            <Badge teinte="vert">{libelleRelatif(doc.dateExpiration!)}</Badge>
          ))}
        <IconeChevronDroite className="h-5 w-5 shrink-0 text-slate-300" />
      </Link>
    </li>
  );
}

export default async function PageDocuments() {
  await exigerUtilisateur();
  const documents = await chargerDocuments();

  const aRenouveler = documents.filter(
    (d) =>
      d.dateExpiration && joursRestants(d.dateExpiration) <= d.alerteJoursAvant,
  );
  const enOrdre = documents.filter(
    (d) =>
      d.dateExpiration && joursRestants(d.dateExpiration) > d.alerteJoursAvant,
  );
  const sansEcheance = documents.filter((d) => !d.dateExpiration);

  return (
    <div className="space-y-4">
      <EnTetePage
        titre="Documents"
        sousTitre="eID, Kids-ID, passeports, assurances, impôts…"
        action={
          <LienBouton href="/documents/nouveau">
            <IconePlus className="h-5 w-5" />
            Ajouter
          </LienBouton>
        }
      />

      {documents.length === 0 && (
        <Carte>
          <EtatVide message="Aucun document enregistré.">
            <LienBouton href="/documents/nouveau">Ajouter un document</LienBouton>
          </EtatVide>
        </Carte>
      )}

      {aRenouveler.length > 0 && (
        <Carte titre="⚠️ À renouveler bientôt" className="ring-amber-200">
          <ul className="divide-y divide-slate-100">
            {aRenouveler.map((d) => (
              <LigneDocument key={d.id} doc={d} />
            ))}
          </ul>
        </Carte>
      )}

      {enOrdre.length > 0 && (
        <Carte titre="En ordre">
          <ul className="divide-y divide-slate-100">
            {enOrdre.map((d) => (
              <LigneDocument key={d.id} doc={d} />
            ))}
          </ul>
        </Carte>
      )}

      {sansEcheance.length > 0 && (
        <Carte titre="Sans date d'expiration">
          <ul className="divide-y divide-slate-100">
            {sansEcheance.map((d) => (
              <LigneDocument key={d.id} doc={d} />
            ))}
          </ul>
        </Carte>
      )}

      <p className="text-xs text-slate-400">
        💡 Rappels belges : la Kids-ID n&apos;est valable que 3 ans, la
        déclaration Tax-on-web se clôture en juillet, la taxe de circulation et
        le précompte immobilier arrivent chaque année — encodez-les ici pour ne
        plus y penser.
      </p>
    </div>
  );
}
