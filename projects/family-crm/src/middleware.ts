// Garde d'accès : sans cookie de session, tout renvoie vers /connexion.
// La validité réelle de la session est vérifiée côté serveur (lib/auth) ;
// ici on ne teste que la présence du cookie, le middleware Edge ne
// pouvant pas interroger la base.
import { NextRequest, NextResponse } from "next/server";
import { NOM_COOKIE_SESSION } from "@/lib/auth";

const PREFIXES_PUBLICS = ["/connexion", "/api/ics"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PREFIXES_PUBLICS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (!request.cookies.has(NOM_COOKIE_SESSION)) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Tout sauf les ressources statiques.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
