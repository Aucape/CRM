import type { Metadata } from "next";
import { exigerParent } from "@/lib/auth";
import { creerMembre } from "@/server/actions/membres";
import { Carte, EnTetePage } from "@/components/ui/base";
import { FormulaireMembre } from "@/components/membres/formulaire-membre";

export const metadata: Metadata = { title: "Nouveau membre" };

export default async function PageNouveauMembre() {
  await exigerParent();
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage titre="Nouveau membre" />
      <Carte>
        <FormulaireMembre action={creerMembre} />
      </Carte>
    </div>
  );
}
