import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CRM Familial",
    template: "%s · CRM Familial",
  },
  description:
    "Le tableau de bord de la famille : échéances, factures, courses, calendrier, documents.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e3a5f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr-BE">
      <body className="antialiased">{children}</body>
    </html>
  );
}
