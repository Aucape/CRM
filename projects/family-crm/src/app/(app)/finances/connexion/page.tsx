import Image from "next/image";
import type { Metadata } from "next";
import { exigerParent } from "@/lib/auth";
import { connecterBanque } from "@/server/actions/finances";
import { gocardlessConfigure, listerBanquesBelges, type Institution } from "@/lib/gocardless";
import { Bouton, Carte, EnTetePage } from "@/components/ui/base";

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

      <Carte>
        <p className="text-sm text-slate-600">
          La connexion passe par <strong>GoCardless Bank Account Data</strong>,
          agrégateur open banking agréé PSD2 et gratuit, qui couvre les banques
          belges (Belfius, KBC, BNP Paribas Fortis, ING, Argenta…). Vous vous
          authentifiez <strong>chez votre banque</strong> (itsme/carte) — l&apos;app ne
          voit jamais vos codes. Le consentement est en lecture seule et à
          renouveler tous les ~90 jours. L&apos;alternative 100 % locale reste
          l&apos;import CSV.
        </p>
      </Carte>

      {!configure ? (
        <Carte titre="Configuration requise" className="ring-amber-200">
          <ol className="list-inside list-decimal space-y-1.5 text-sm text-slate-600">
            <li>
              Créez un compte gratuit sur{" "}
              <a
                href="https://bankaccountdata.gocardless.com"
                className="font-medium text-blue-700 underline"
                target="_blank"
                rel="noreferrer"
              >
                bankaccountdata.gocardless.com
              </a>{" "}
              puis générez des « User secrets » (portail développeur).
            </li>
            <li>
              Ajoutez dans votre fichier <code className="rounded bg-slate-100 px-1">.env</code> :
              <pre className="mt-1 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
                {"GOCARDLESS_SECRET_ID=…\nGOCARDLESS_SECRET_KEY=…"}
              </pre>
            </li>
            <li>Redémarrez l&apos;application : la liste des banques apparaîtra ici.</li>
          </ol>
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
