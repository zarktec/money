import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Money", short_name: "Money", description: "Finanzas personales", start_url: "/inicio", display: "standalone",
    background_color: "#f6f7f9", theme_color: "#059669", lang: "es-CO",
    icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
