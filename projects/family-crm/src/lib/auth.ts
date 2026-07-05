// Session par cookie signé (iron-session) : tout reste local, aucun
// service externe. Le middleware vérifie seulement la présence du
// cookie ; la validité est vérifiée ici, côté serveur.
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import type { Role } from "@/lib/constantes";

export const NOM_COOKIE_SESSION = "crm_famille_session";

export interface DonneesSession {
  utilisateurId?: string;
}

const optionsSession: SessionOptions = {
  password:
    process.env.SESSION_SECRET ??
    (() => {
      throw new Error("SESSION_SECRET manquant dans .env");
    })(),
  cookieName: NOM_COOKIE_SESSION,
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 90, // 90 jours
  },
};

export async function obtenirSession() {
  return getIronSession<DonneesSession>(await cookies(), optionsSession);
}

/** Utilisateur connecté (avec son membre), ou null. Mis en cache par requête. */
export const utilisateurConnecte = cache(async () => {
  const session = await obtenirSession();
  if (!session.utilisateurId) return null;
  return db.utilisateur.findUnique({
    where: { id: session.utilisateurId },
    include: { membre: true },
  });
});

/** Exige une session valide, sinon redirige vers la connexion. */
export async function exigerUtilisateur() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) redirect("/connexion");
  return utilisateur;
}

/** Exige le rôle parent (gestion des comptes, suppressions sensibles…). */
export async function exigerParent() {
  const utilisateur = await exigerUtilisateur();
  if ((utilisateur.role as Role) !== "PARENT") redirect("/");
  return utilisateur;
}
