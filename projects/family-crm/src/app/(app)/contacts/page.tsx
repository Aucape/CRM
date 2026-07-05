import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import {
  CATEGORIES_CONTACT,
  LIBELLES_CATEGORIE_CONTACT,
  type CategorieContact,
} from "@/lib/constantes";
import {
  Badge,
  Carte,
  EnTetePage,
  EtatVide,
  LienBouton,
} from "@/components/ui/base";
import { IconeCrayon, IconePlus } from "@/components/ui/icones";

export const metadata: Metadata = { title: "Contacts" };

export default async function PageContacts({
  searchParams,
}: {
  searchParams: Promise<{ categorie?: string; q?: string }>;
}) {
  await exigerUtilisateur();
  const params = await searchParams;
  const filtreCategorie = CATEGORIES_CONTACT.includes(
    params.categorie as CategorieContact,
  )
    ? (params.categorie as CategorieContact)
    : null;
  const q = (params.q ?? "").trim().toLowerCase();

  let contacts = await db.contact.findMany({ orderBy: { nom: "asc" } });
  if (filtreCategorie) contacts = contacts.filter((c) => c.categorie === filtreCategorie);
  if (q) {
    contacts = contacts.filter((c) =>
      [c.nom, c.tags, c.notes, c.adresse, c.telephone, c.email]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }

  // Regroupe par catégorie, dans l'ordre des constantes.
  const groupes = CATEGORIES_CONTACT.map((categorie) => ({
    categorie,
    items: contacts.filter((c) => c.categorie === categorie),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <EnTetePage
        titre="Contacts"
        sousTitre="Les numéros utiles de la famille"
        action={
          <LienBouton href="/contacts/nouveau">
            <IconePlus className="h-5 w-5" />
            Ajouter
          </LienBouton>
        }
      />

      <form className="flex gap-2" action="/contacts">
        {filtreCategorie && <input type="hidden" name="categorie" value={filtreCategorie} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Rechercher un contact, un tag…"
          className="min-h-11 w-full flex-1 rounded-xl bg-white px-3.5 text-base ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600 focus:outline-none"
        />
      </form>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href="/contacts"
          className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${!filtreCategorie ? "bg-slate-800 text-white ring-slate-800" : "text-slate-600 ring-slate-300"}`}
        >
          Tous
        </Link>
        {CATEGORIES_CONTACT.map((c) => (
          <Link
            key={c}
            href={filtreCategorie === c ? "/contacts" : `/contacts?categorie=${c}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${filtreCategorie === c ? "bg-slate-800 text-white ring-slate-800" : "text-slate-600 ring-slate-300"}`}
          >
            {LIBELLES_CATEGORIE_CONTACT[c]}
          </Link>
        ))}
      </div>

      {groupes.length === 0 ? (
        <Carte>
          <EtatVide message="Aucun contact trouvé.">
            <LienBouton href="/contacts/nouveau">Ajouter un contact</LienBouton>
          </EtatVide>
        </Carte>
      ) : (
        groupes.map(({ categorie, items }) => (
          <Carte key={categorie} titre={LIBELLES_CATEGORIE_CONTACT[categorie]}>
            <ul className="divide-y divide-slate-100">
              {items.map((c) => (
                <li key={c.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{c.nom}</p>
                    <p className="mt-0.5 space-x-3 text-sm">
                      {c.telephone && (
                        <a href={`tel:${c.telephone.replace(/\s/g, "")}`} className="font-medium text-blue-700">
                          {c.telephone}
                        </a>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="text-blue-700">
                          {c.email}
                        </a>
                      )}
                    </p>
                    {c.adresse && <p className="mt-0.5 text-sm text-slate-500">{c.adresse}</p>}
                    {c.notes && <p className="mt-0.5 text-sm text-slate-500">{c.notes}</p>}
                    {c.tags && (
                      <p className="mt-1.5 flex flex-wrap gap-1">
                        {c.tags.split(",").map((tag) => (
                          <Badge key={tag} teinte="bleu">
                            {tag}
                          </Badge>
                        ))}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/contacts/${c.id}/modifier`}
                    className="rounded-lg p-2 text-slate-300 hover:text-blue-700"
                    title="Modifier"
                  >
                    <IconeCrayon className="h-4.5 w-4.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </Carte>
        ))
      )}
    </div>
  );
}
