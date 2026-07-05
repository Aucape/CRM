"use client";

// Sélecteur de catégorie en ligne : changement appliqué immédiatement,
// avec option « mémoriser en règle » pour catégoriser automatiquement
// les prochaines transactions du même commerçant. La liste mêle
// catégories intégrées et catégories personnalisées de la famille.
import { useTransition } from "react";
import { changerCategorie } from "@/server/actions/finances";

export interface OptionCategorie {
  cle: string;
  libelle: string;
}

export function CategorieTransaction({
  id,
  categorie,
  contrepartie,
  categories,
}: {
  id: string;
  categorie: string;
  contrepartie: string | null;
  categories: OptionCategorie[];
}) {
  const [enCours, demarrer] = useTransition();

  const appliquer = (nouvelle: string, creerRegle: boolean) =>
    demarrer(async () => {
      let motCle = "";
      if (creerRegle) {
        motCle =
          window.prompt(
            "Mot-clé de la règle (les transactions dont la contrepartie ou la communication contiennent ce texte prendront cette catégorie) :",
            contrepartie ?? "",
          ) ?? "";
        if (!motCle.trim()) return;
      }
      const fd = new FormData();
      fd.set("id", id);
      fd.set("categorie", nouvelle);
      if (motCle.trim()) fd.set("creerRegle", motCle.trim());
      await changerCategorie(fd);
    });

  return (
    <span className="flex items-center gap-1">
      <select
        value={categorie}
        disabled={enCours}
        onChange={(e) => appliquer(e.target.value, false)}
        className={`max-w-32 truncate rounded-lg px-1.5 py-1 text-xs font-medium ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-600 focus:outline-none ${
          categorie === "A_TRIER" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-700"
        }`}
        aria-label="Catégorie"
      >
        {categories.map((c) => (
          <option key={c.cle} value={c.cle}>
            {c.libelle}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={(e) => {
          const select = (e.currentTarget.previousSibling as HTMLSelectElement).value;
          appliquer(select, true);
        }}
        className="rounded-lg px-1.5 py-1 text-xs text-slate-300 hover:text-blue-700"
        title="Mémoriser en règle automatique"
      >
        ★
      </button>
    </span>
  );
}
