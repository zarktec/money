import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs usa requires dinámicos que el empaquetador rompe: se carga tal cual desde node_modules en el servidor.
  serverExternalPackages: ["exceljs"],
  poweredByHeader: false,
  async headers() {
    // La CSP (con nonce por petición) la pone el middleware. Estas son las cabeceras fijas, para todas las rutas.
    return [{
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        // El micrófono lo usa el dictado por voz; todo lo demás está cerrado.
        { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self), payment=(), usb=(), browsing-topics=()" },
      ],
    }];
  },
};

export default nextConfig;
