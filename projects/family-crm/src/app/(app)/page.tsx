import { exigerUtilisateur } from "@/lib/auth";
import { Carte, EnTetePage } from "@/components/ui/base";

// Page d'accueil provisoire — remplacée par le vrai dashboard
// « Cette semaine / Ce mois » au module 7.
export default async function PageAccueil() {
  const utilisateur = await exigerUtilisateur();

  return (
    <div className="space-y-4">
      <EnTetePage
        titre={`Bonjour ${utilisateur.membre.prenom} 👋`}
        sousTitre="Bienvenue dans le tableau de bord de la famille."
      />
      <Carte>
        <p className="text-sm text-slate-600">
          Le dashboard « Cette semaine / Ce mois » arrive au fil de la
          construction des modules. Utilisez la barre de navigation pour
          explorer les sections disponibles.
        </p>
      </Carte>
    </div>
  );
}
