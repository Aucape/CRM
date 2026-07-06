import Image from "next/image";
import type { Metadata } from "next";
import { exigerParent } from "@/lib/auth";
import { connecterBanque } from "@/server/actions/finances";
import { gocardlessConfigure, listerBanquesBelges, type Institution } from "@/lib/gocardless";
import { Bouton, Carte, EnTetePage, LienBouton } from "@/components/ui/base";

export const metadata: Metadata = { title: "Connexion bancaire" };

export default async function PageConnexionBancaire() {
  await exigerParent();
  const configure = gocardlessConfigure();

  let banques: Institution[] = [];
  let erreurApi: string | null = null;
  if (configure) {
    try {
      banques = await listerBanquesBelges();
    } catch (e) {
      erreurApi = e instanceof Error ? e.message : "Erreur inconnue.";
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <EnTetePage
        titre="Connexion bancaire (PSD2)"
        sousTitre="Synchronisation automatique via open banking — optionnelle"
      />

      <Carte titre="⚠️ Réservé aux professionnels" className="ring-amber-200">
        <p className="text-sm text-slate-600">
          L&apos;accès aux comptes bancaires par API (PSD2) est réglementé : les
          agrégateurs comme <strong>GoCardless Bank Account Data</strong>, Tink
          ou Powens ne contractent qu&apos;avec des <strong>entreprises ou
          indépendants</strong> (numéro d&apos;entreprise demandé à l&apos;inscription).
          Il n&apos;existe pas aujourd&apos;hui d&apos;API bancaire ouverte aux particuliers
          en Belgique.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Pour un usage familial, la voie recommandée est l&apos;
          <strong>import CSV</strong> : exportez vos extraits depuis l&apos;app de
          votre banque (2 minutes par mois), les doublons sont ignorés et les
          factures rapprochées automatiquement. Ce connecteur PSD2 reste
          disponible si un membre du foyer dispose d&apos;un numéro d&apos;entreprise
          (indépendant, société de management…).
        </p>
        <div className="mt-3">
          <LienBouton href="/finances/import">Importer un extrait CSV</LienBouton>
        </div>
      </Carte>

      {!configure ? (
        <Carte titre="Configuration (si vous avez un numéro d'entreprise)">
          <ol className="list-inside list-decimal space-y-1.5 text-sm text-slate-600">
            <li>
              Créez un compte sur{" "}
              <a
                href="https://bankaccountdata.gocardless.com"
                className="font-medium text-blue-700 underline"
                target="_blank"
                rel="noreferrer"
              >
                bankaccountdata.gocardless.com
              </a>{" "}
              (gratuit, mais réservé aux professionnels) puis générez des
              « User secrets » dans le portail développeur.
            </li>
            <li>
              Ajoutez dans votre fichier <code className="rounded bg-slate-100 px-1">.env</code> :
              <pre className="mt-1 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
                {"GOCARDLESS_SECRET_ID=…\nGOCARDLESS_SECRET_KEY=…"}
              </pre>
            </li>
            <li>Redémarrez l&apos;application : la liste des banques apparaîtra ici.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-400">
            Vous vous authentifiez alors chez votre banque (itsme) ; consentement
            en lecture seule, à renouveler tous les ~90 jours.
          </p>
        </Carte>
      ) : erreurApi ? (
        <Carte className="ring-red-200">
          <p className="text-sm text-red-700">
            Impossible de joindre GoCardless : {erreurApi}
          </p>
        </Carte>
      ) : (
        <Carte titre={`Choisissez votre banque (${banques.length})`}>
          <ul className="divide-y divide-slate-100">
            {banques.map((b) => (
              <li key={b.id}>
                <form action={connecterBanque} className="flex items-center gap-3 py-2.5">
                  <input type="hidden" name="institutionId" value={b.id} />
                  {b.logo && (
                    <Image
                      src={b.logo}
                      alt=""
                      width={32}
                      height={32}
                      unoptimized
                      className="h-8 w-8 rounded-lg object-contain"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                    {b.name}
                  </span>
                  <Bouton type="submit" variante="secondaire" className="!min-h-9 text-sm">
                    Connecter
                  </Bouton>
                </form>
              </li>
            ))}
          </ul>
        </Carte>
      )}
    </div>
  );
}
