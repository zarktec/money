import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs usa requires dinámicos que el empaquetador rompe: se carga tal cual desde node_modules en el servidor.
  serverExternalPackages: ["exceljs"],
  poweredByHeader: false,
};

export default nextConfig;
