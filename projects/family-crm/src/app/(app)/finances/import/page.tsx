import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { Carte, EnTetePage, EtatVide, LienBouton } from "@/components/ui/base";
import { ImportCsv } from "@/components/finances/import-csv";

export const metadata: Metadata = { title: "Import bancaire" };

export default async function PageImport() {
  await exigerUtilisateur();
  const comptes = await db.compteBancaire.findMany({ orderBy: { creeLe: "asc" } });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <EnTetePage
        titre="Importer un extrait bancaire"
        sousTitre="CSV exporté depuis Belfius, KBC, ING, BNP Fortis, Argenta…"
      />
      {comptes.length === 0 ? (
        <Carte>
          <EtatVide message="Créez d'abord le compte bancaire auquel rattacher ces transactions.">
            <LienBouton href="/finances/comptes/nouveau">Créer un compte</LienBouton>
          </EtatVide>
        </Carte>
      ) : (
        <ImportCsv comptes={comptes} />
      )}
    </div>
  );
}
