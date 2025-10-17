import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ProdAM Resource Hub",
  description: "Gestao inteligente de alocacao de recursos humanos e tecnicos."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
