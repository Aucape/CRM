import type { Metadata } from "next";
import { exigerParent } from "@/lib/auth";
import { finaliserConnexion } from "@/server/actions/finances";
import { Bouton, Carte, EnTetePage } from "@/components/ui/base";

export const metadata: Metadata = { title: "Retour de la banque" };

// Page de retour après le consentement chez la banque : un clic relie
// les comptes autorisés (mutation via action, pas pendant le rendu).
export default async function PageRetourBanque() {
  await exigerParent();
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage titre="Presque fini !" />
      <Carte>
        <p className="text-sm text-slate-600">
          Si vous avez donné votre accord sur le site de votre banque, il ne
          reste qu&apos;à relier les comptes autorisés.
        </p>
        <form action={finaliserConnexion} className="mt-4">
          <Bouton type="submit" className="w-full">
            Relier mes comptes
          </Bouton>
        </form>
      </Carte>
    </div>
  );
}
