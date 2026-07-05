import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth";
import { AvatarMembre } from "@/components/ui/base";
import { BarreLaterale, BarreOnglets } from "@/components/navigation";

export default async function LayoutApp({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const utilisateur = await exigerUtilisateur();

  return (
    <div className="mx-auto max-w-5xl px-4">
      <header className="flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🏠</span>
          <span className="text-lg font-bold text-slate-900">CRM Familial</span>
        </Link>
        <Link href="/plus" title="Mon compte">
          <AvatarMembre
            prenom={utilisateur.membre.prenom}
            couleur={utilisateur.membre.couleur}
          />
        </Link>
      </header>

      <div className="flex">
        <BarreLaterale />
        {/* pb-24 : laisse la place à la barre d'onglets mobile */}
        <main className="min-w-0 flex-1 pb-24 md:pb-10">{children}</main>
      </div>

      <BarreOnglets />
    </div>
  );
}
