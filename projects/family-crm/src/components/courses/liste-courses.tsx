"use client";

// Liste de courses interactive : cochage optimiste (réactif en magasin),
// regroupement par rayon, ajout rapide, récurrents ré-ajoutables.
import { useOptimistic, useRef, useTransition } from "react";
import type { ArticleCourse } from "@prisma/client";
import {
  ajouterArticle,
  basculerArticle,
  basculerRecurrent,
  reAjouterArticle,
  supprimerArticle,
  terminerCourses,
} from "@/server/actions/courses";
import { LIBELLES_RAYON, RAYONS, type Rayon } from "@/lib/constantes";
import { Bouton, Carte, ChampSelect, EtatVide } from "@/components/ui/base";
import { IconeCorbeille, IconePlus, IconeRotation } from "@/components/ui/icones";

type ActionOptimiste =
  | { type: "cocher"; id: string; coche: boolean }
  | { type: "reAjouter"; id: string }
  | { type: "supprimer"; id: string };

function reduire(articles: ArticleCourse[], action: ActionOptimiste): ArticleCourse[] {
  switch (action.type) {
    case "cocher":
      return articles.map((a) =>
        a.id === action.id ? { ...a, coche: action.coche } : a,
      );
    case "reAjouter":
      return articles.map((a) =>
        a.id === action.id ? { ...a, coche: false } : a,
      );
    case "supprimer":
      return articles.filter((a) => a.id !== action.id);
  }
}

export function ListeCourses({ articles }: { articles: ArticleCourse[] }) {
  const [optimistes, appliquer] = useOptimistic(articles, reduire);
  const [, demarrer] = useTransition();
  const formulaire = useRef<HTMLFormElement>(null);

  const surListe = optimistes.filter((a) => !a.coche);
  const dansCaddie = optimistes.filter((a) => a.coche && !a.recurrent);
  const recurrentsAchetes = optimistes.filter((a) => a.coche && a.recurrent);

  // Regroupe par rayon, dans l'ordre des rayons du magasin.
  const parRayon = RAYONS.map((rayon) => ({
    rayon,
    items: surListe.filter((a) => a.rayon === rayon),
  })).filter((g) => g.items.length > 0);

  const cocher = (id: string, coche: boolean) =>
    demarrer(async () => {
      appliquer({ type: "cocher", id, coche });
      await basculerArticle(id, coche);
    });

  return (
    <div className="space-y-4">
      {/* Ajout rapide */}
      <Carte>
        <form
          ref={formulaire}
          action={async (fd) => {
            formulaire.current?.reset();
            await ajouterArticle(fd);
          }}
          className="flex gap-2"
        >
          <input
            name="nom"
            required
            placeholder="Ajouter un article…"
            autoComplete="off"
            className="min-h-11 w-full min-w-0 flex-1 rounded-xl bg-white px-3.5 text-base ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
          <ChampSelect name="rayon" className="!w-auto max-w-36" aria-label="Rayon">
            {RAYONS.map((r) => (
              <option key={r} value={r}>
                {LIBELLES_RAYON[r]}
              </option>
            ))}
          </ChampSelect>
          <Bouton type="submit" className="shrink-0 !px-3.5" title="Ajouter">
            <IconePlus className="h-5 w-5" />
          </Bouton>
        </form>
      </Carte>

      {/* Liste par rayon */}
      {parRayon.length === 0 ? (
        <Carte>
          <EtatVide message="La liste est vide. Ajoutez un article ou ré-ajoutez un récurrent ci-dessous." />
        </Carte>
      ) : (
        parRayon.map(({ rayon, items }) => (
          <Carte key={rayon} titre={LIBELLES_RAYON[rayon as Rayon]}>
            <ul className="divide-y divide-slate-100">
              {items.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-1">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => cocher(a.id, true)}
                      className="h-5.5 w-5.5 shrink-0 rounded-md border-slate-300 accent-blue-700"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900">
                        {a.nom}
                        {a.recurrent && (
                          <span className="ml-1.5 text-xs text-blue-600" title="Article récurrent">
                            ↻
                          </span>
                        )}
                      </span>
                      {a.quantite && (
                        <span className="block text-xs text-slate-500">{a.quantite}</span>
                      )}
                    </span>
                  </label>
                  <button
                    onClick={() =>
                      demarrer(async () => {
                        await basculerRecurrent(a.id, !a.recurrent);
                      })
                    }
                    className={`rounded-lg p-2 ${a.recurrent ? "text-blue-600" : "text-slate-300 hover:text-slate-500"}`}
                    title={a.recurrent ? "Ne plus marquer récurrent" : "Marquer récurrent"}
                  >
                    <IconeRotation className="h-4.5 w-4.5" />
                  </button>
                  <button
                    onClick={() =>
                      demarrer(async () => {
                        appliquer({ type: "supprimer", id: a.id });
                        await supprimerArticle(a.id);
                      })
                    }
                    className="rounded-lg p-2 text-slate-300 hover:text-red-600"
                    title="Supprimer"
                  >
                    <IconeCorbeille className="h-4.5 w-4.5" />
                  </button>
                </li>
              ))}
            </ul>
          </Carte>
        ))
      )}

      {/* Dans le caddie */}
      {(dansCaddie.length > 0 || recurrentsAchetes.length > 0) && (
        <Carte
          titre={`Dans le caddie (${dansCaddie.length + recurrentsAchetes.length})`}
          action={
            <form action={terminerCourses}>
              <Bouton type="submit" variante="secondaire" className="!min-h-9 !px-3 text-sm">
                Terminer les courses
              </Bouton>
            </form>
          }
        >
          <ul className="divide-y divide-slate-100">
            {[...dansCaddie, ...recurrentsAchetes].map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-1">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => cocher(a.id, false)}
                    className="h-5.5 w-5.5 shrink-0 accent-blue-700"
                  />
                  <span className="text-slate-400 line-through">{a.nom}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            « Terminer les courses » vide le caddie ; les articles récurrents ↻
            restent disponibles ci-dessous pour la prochaine fois.
          </p>
        </Carte>
      )}

      {/* Récurrents à ré-ajouter */}
      {recurrentsAchetes.length > 0 && (
        <Carte titre="Récurrents — ré-ajouter en un clic">
          <ul className="flex flex-wrap gap-2">
            {recurrentsAchetes.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() =>
                    demarrer(async () => {
                      appliquer({ type: "reAjouter", id: a.id });
                      await reAjouterArticle(a.id);
                    })
                  }
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-blue-50 px-3.5 text-sm font-medium text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100"
                >
                  <IconePlus className="h-4 w-4" />
                  {a.nom}
                </button>
              </li>
            ))}
          </ul>
        </Carte>
      )}
    </div>
  );
}
