import type { Metadata } from "next";
import { exigerUtilisateur } from "@/lib/auth";
import { creerCompte } from "@/server/actions/finances";
import { Carte, EnTetePage } from "@/components/ui/base";
import { FormulaireCompte } from "@/components/finances/formulaire-compte";

export const metadata: Metadata = { title: "Nouveau compte" };

export default async function PageNouveauCompte() {
  await exigerUtilisateur();
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage
        titre="Nouveau compte bancaire"
        sousTitre="Créez le compte puis importez ses extraits CSV"
      />
      <Carte>
        <FormulaireCompte action={creerCompte} />
      </Carte>
    </div>
  );
}
