// Flux iCalendar par abonnement (URL secrète, sans session) :
// à ajouter dans Apple Calendar via « Nouvel abonnement à un calendrier ».
import { db } from "@/lib/db";
import { genererIcs } from "@/lib/ics";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jeton: string }> },
) {
  const { jeton } = await params;
  const flux = await db.fluxCalendrier.findUnique({
    where: { jeton: jeton.replace(/\.ics$/, "") },
    include: { membre: true },
  });
  if (!flux) return new Response("Calendrier introuvable", { status: 404 });

  const evenements = await db.evenement.findMany({
    where: flux.membreId
      ? {
          OR: [
            { membres: { some: { membreId: flux.membreId } } },
            // Les événements sans membre concernent toute la famille.
            { membres: { none: {} } },
          ],
        }
      : {},
    orderBy: { debut: "asc" },
  });

  const nom = flux.membre
    ? `Famille — ${flux.membre.prenom}`
    : "Famille — tous";

  return new Response(genererIcs(nom, evenements), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
