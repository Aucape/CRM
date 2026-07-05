import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { creerEvenement } from "@/server/actions/evenements";
import { versInputDate } from "@/lib/dates";
import { Carte, EnTetePage } from "@/components/ui/base";
import { FormulaireEvenement } from "@/components/calendrier/formulaire-evenement";

export const metadata: Metadata = { title: "Nouvel événement" };

export default async function PageNouvelEvenement({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await exigerUtilisateur();
  const { date } = await searchParams;
  const membres = await db.membre.findMany({
    where: { archive: false },
    orderBy: { dateNaissance: "asc" },
  });

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <EnTetePage titre="Nouvel événement" />
      <Carte>
        <FormulaireEvenement
          membres={membres}
          action={creerEvenement}
          dateInitiale={
            date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : versInputDate(new Date())
          }
        />
      </Carte>
    </div>
  );
}
