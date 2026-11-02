import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Money — tus finanzas personales", template: "%s · Money" },
  description: "Ingresos, egresos, ahorros, deudas y proyectos en un solo lugar.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Money", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#059669" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="es-CO"><body className="min-h-dvh antialiased">{children}</body></html>);
}
