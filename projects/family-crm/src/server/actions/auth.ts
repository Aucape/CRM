"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { obtenirSession } from "@/lib/auth";

export interface EtatConnexion {
  erreur?: string;
}

export async function connecter(
  _etat: EtatConnexion,
  formData: FormData,
): Promise<EtatConnexion> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const motDePasse = String(formData.get("motDePasse") ?? "");

  if (!email || !motDePasse) {
    return { erreur: "Indiquez votre e-mail et votre mot de passe." };
  }

  const utilisateur = await db.utilisateur.findUnique({ where: { email } });
  const valide =
    utilisateur &&
    (await bcrypt.compare(motDePasse, utilisateur.motDePasseHash));

  if (!valide) {
    return { erreur: "E-mail ou mot de passe incorrect." };
  }

  const session = await obtenirSession();
  session.utilisateurId = utilisateur.id;
  await session.save();
  redirect("/");
}

export async function deconnecter(): Promise<void> {
  const session = await obtenirSession();
  session.destroy();
  redirect("/connexion");
}
