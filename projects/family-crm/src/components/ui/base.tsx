// Primitives d'interface partagées : boutons, champs, badges, cartes…
// Toutes pensées mobile-first (cibles tactiles ≥ 44 px).
import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

// ------------------------------------------------------------------
// Boutons
// ------------------------------------------------------------------

const STYLES_BOUTON = {
  primaire:
    "bg-blue-700 text-white hover:bg-blue-800 active:bg-blue-900 disabled:bg-blue-300",
  secondaire:
    "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 active:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
  discret: "text-slate-600 hover:bg-slate-100 active:bg-slate-200",
} as const;

const BASE_BOUTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors";

export function Bouton({
  variante = "primaire",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: keyof typeof STYLES_BOUTON;
}) {
  return (
    <button
      className={`${BASE_BOUTON} ${STYLES_BOUTON[variante]} ${className}`}
      {...props}
    />
  );
}

export function LienBouton({
  href,
  variante = "primaire",
  className = "",
  children,
}: {
  href: string;
  variante?: keyof typeof STYLES_BOUTON;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${BASE_BOUTON} ${STYLES_BOUTON[variante]} ${className}`}
    >
      {children}
    </Link>
  );
}

// ------------------------------------------------------------------
// Champs de formulaire
// ------------------------------------------------------------------

const STYLE_SAISIE =
  "w-full min-h-11 rounded-xl bg-white px-3.5 py-2 text-base text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600";

export function Champ({
  label,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const champ = (
    <input className={`${STYLE_SAISIE} ${className}`} {...props} />
  );
  if (!label) return champ;
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {champ}
    </label>
  );
}

export function ChampSelect({
  label,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const champ = (
    <select className={`${STYLE_SAISIE} ${className}`} {...props}>
      {children}
    </select>
  );
  if (!label) return champ;
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {champ}
    </label>
  );
}

export function ChampTexteLong({
  label,
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const champ = (
    <textarea rows={3} className={`${STYLE_SAISIE} ${className}`} {...props} />
  );
  if (!label) return champ;
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {champ}
    </label>
  );
}

// ------------------------------------------------------------------
// Badges de statut
// ------------------------------------------------------------------

const STYLES_BADGE = {
  neutre: "bg-slate-100 text-slate-700",
  bleu: "bg-blue-100 text-blue-800",
  vert: "bg-green-100 text-green-800",
  orange: "bg-amber-100 text-amber-800",
  rouge: "bg-red-100 text-red-800",
} as const;

export function Badge({
  teinte = "neutre",
  children,
}: {
  teinte?: keyof typeof STYLES_BADGE;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES_BADGE[teinte]}`}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------
// Cartes & sections
// ------------------------------------------------------------------

export function Carte({
  titre,
  action,
  children,
  className = "",
}: {
  titre?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}
    >
      {(titre || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {titre && (
            <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
              {titre}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EtatVide({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-slate-500">{message}</p>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------
// Avatar de membre (initiales sur sa couleur de calendrier)
// ------------------------------------------------------------------

export function AvatarMembre({
  prenom,
  couleur,
  taille = "md",
}: {
  prenom: string;
  couleur: string;
  taille?: "sm" | "md" | "lg";
}) {
  const dimensions = { sm: "h-6 w-6 text-[10px]", md: "h-9 w-9 text-sm", lg: "h-14 w-14 text-xl" };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${dimensions[taille]}`}
      style={{ backgroundColor: couleur }}
      title={prenom}
    >
      {prenom.slice(0, 2).toUpperCase()}
    </span>
  );
}

// ------------------------------------------------------------------
// En-tête de page
// ------------------------------------------------------------------

export function EnTetePage({
  titre,
  sousTitre,
  action,
}: {
  titre: string;
  sousTitre?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{titre}</h1>
        {sousTitre && <p className="mt-0.5 text-sm text-slate-500">{sousTitre}</p>}
      </div>
      {action}
    </div>
  );
}
