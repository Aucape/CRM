"use client";

// Navigation de la zone connectée : barre d'onglets en bas sur mobile,
// barre latérale sur écran large.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconeAccueil,
  IconeCalendrier,
  IconeCourses,
  IconeFacture,
  IconeMenu,
  IconeMembres,
  IconeContacts,
  IconeDocument,
  IconeEcheance,
  IconeFinances,
  IconeRecherche,
} from "@/components/ui/icones";

const ONGLETS_MOBILE = [
  { href: "/", libelle: "Accueil", Icone: IconeAccueil },
  { href: "/calendrier", libelle: "Calendrier", Icone: IconeCalendrier },
  { href: "/courses", libelle: "Courses", Icone: IconeCourses },
  { href: "/factures", libelle: "Factures", Icone: IconeFacture },
  { href: "/plus", libelle: "Plus", Icone: IconeMenu },
];

const LIENS_DESKTOP = [
  { href: "/", libelle: "Accueil", Icone: IconeAccueil },
  { href: "/calendrier", libelle: "Calendrier", Icone: IconeCalendrier },
  { href: "/courses", libelle: "Courses", Icone: IconeCourses },
  { href: "/factures", libelle: "Factures", Icone: IconeFacture },
  { href: "/finances", libelle: "Finances", Icone: IconeFinances },
  { href: "/echeances", libelle: "Échéances", Icone: IconeEcheance },
  { href: "/documents", libelle: "Documents", Icone: IconeDocument },
  { href: "/membres", libelle: "Membres", Icone: IconeMembres },
  { href: "/contacts", libelle: "Contacts", Icone: IconeContacts },
  { href: "/recherche", libelle: "Recherche", Icone: IconeRecherche },
];

function estActif(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function BarreOnglets() {
  const pathname = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
      <ul className="flex">
        {ONGLETS_MOBILE.map(({ href, libelle, Icone }) => {
          const actif = estActif(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  actif ? "text-blue-700" : "text-slate-500"
                }`}
              >
                <Icone className="h-6 w-6" />
                {libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BarreLaterale() {
  const pathname = usePathname();
  return (
    <nav className="hidden w-56 shrink-0 flex-col gap-1 py-6 pr-4 md:flex">
      {LIENS_DESKTOP.map(({ href, libelle, Icone }) => {
        const actif = estActif(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
              actif
                ? "bg-blue-50 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icone className="h-5 w-5" />
            {libelle}
          </Link>
        );
      })}
    </nav>
  );
}
