import type { Metadata } from "next";
import "@fontsource/nunito-sans/latin-400.css";
import "@fontsource/nunito-sans/latin-600.css";
import "@fontsource/nunito-sans/latin-700.css";
import "@fontsource/nunito-sans/latin-800.css";
import "./globals.css";
import "./personality.css";
export const metadata: Metadata = {
  title: {
    default: "Shopeo — Votre quotidien connecté",
    template: "%s · Shopeo",
  },
  description:
    "Les accessoires de votre quotidien connecté. Boutique de démonstration Shopeo.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
