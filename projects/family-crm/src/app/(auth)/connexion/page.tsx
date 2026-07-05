"use client";

import { useActionState } from "react";
import { connecter, type EtatConnexion } from "@/server/actions/auth";
import { Bouton, Champ } from "@/components/ui/base";

export default function PageConnexion() {
  const [etat, action, enCours] = useActionState<EtatConnexion, FormData>(
    connecter,
    {},
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <span className="text-5xl">🏠</span>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">CRM Familial</h1>
        <p className="mt-1 text-sm text-slate-500">
          Le tableau de bord de la maison
        </p>
      </div>

      <form action={action} className="space-y-4">
        <Champ
          label="Adresse e-mail"
          type="email"
          name="email"
          autoComplete="email"
          required
        />
        <Champ
          label="Mot de passe"
          type="password"
          name="motDePasse"
          autoComplete="current-password"
          required
        />
        {etat.erreur && (
          <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {etat.erreur}
          </p>
        )}
        <Bouton type="submit" disabled={enCours} className="w-full">
          {enCours ? "Connexion…" : "Se connecter"}
        </Bouton>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400">
        Données 100 % privées, hébergées à la maison.
      </p>
    </main>
  );
}
