/** Catálogo de integraciones administrables desde el panel. Puro (sin servidor): lo usan la pantalla, las acciones y los tests. */
export type ProviderId = "wompi" | "google" | "microsoft";

export interface FieldDef {
  key: string;
  label: string;
  /** Se guarda cifrado y nunca se vuelve a mostrar completo. */
  secret: boolean;
  /** Variable de entorno de respaldo. */
  env: string;
  help?: string;
  placeholder?: string;
  /** Valor si no hay ni panel ni variable (solo datos públicos). */
  default?: string;
  validate?: (v: string) => string | null;
}
export interface ProviderDef { id: ProviderId; name: string; description: string; fields: FieldDef[]; required: string[] }

const noSpaces = (label: string, min = 8) => (v: string) => (/\s/.test(v) ? `${label} no debe tener espacios.` : v.length < min ? `${label} parece incompleto.` : null);
const wompiKey = (prefix: "pub" | "prv", label: string) => (v: string) => (new RegExp(`^${prefix}_(test|prod)_[A-Za-z0-9]+$`).test(v) ? null : `${label} debe empezar por ${prefix}_test_ o ${prefix}_prod_.`);
const httpsUrl = (v: string) => { try { const u = new URL(v); return u.protocol === "https:" ? null : "La URL debe ser https."; } catch { return "URL no válida."; } };

export const INTEGRATIONS: ProviderDef[] = [
  {
    id: "wompi", name: "Wompi", description: "Cobro de las suscripciones (Web Checkout y webhook de eventos).",
    required: ["public_key", "integrity_secret", "events_secret"],
    fields: [
      { key: "public_key", label: "Llave pública", secret: false, env: "NEXT_PUBLIC_WOMPI_PUBLIC_KEY", placeholder: "pub_test_…", validate: wompiKey("pub", "La llave pública") },
      { key: "private_key", label: "Llave privada", secret: true, env: "WOMPI_PRIVATE_KEY", placeholder: "prv_test_…", help: "Opcional por ahora: se usará para el cobro automático de renovaciones.", validate: wompiKey("prv", "La llave privada") },
      { key: "integrity_secret", label: "Secreto de integridad", secret: true, env: "WOMPI_INTEGRITY_SECRET", help: "Firma el checkout para que nadie pueda cambiar el monto.", validate: noSpaces("El secreto de integridad") },
      { key: "events_secret", label: "Secreto de eventos", secret: true, env: "WOMPI_EVENTS_SECRET", help: "Verifica que el webhook venga de Wompi.", validate: noSpaces("El secreto de eventos") },
      { key: "api_url", label: "URL de la API", secret: false, env: "WOMPI_API_URL", default: "https://sandbox.wompi.co/v1", help: "Pruebas: https://sandbox.wompi.co/v1 · Producción: https://production.wompi.co/v1", validate: httpsUrl },
    ],
  },
  {
    id: "google", name: "Google (Gmail)", description: "Conectar cuentas de Gmail para leer notificaciones (alcance de solo lectura).",
    required: ["client_id", "client_secret"],
    fields: [
      { key: "client_id", label: "ID de cliente OAuth", secret: false, env: "GOOGLE_CLIENT_ID", placeholder: "….apps.googleusercontent.com", validate: (v) => (v.endsWith(".apps.googleusercontent.com") && !/\s/.test(v) ? null : "El ID de cliente de Google termina en .apps.googleusercontent.com.") },
      { key: "client_secret", label: "Secreto de cliente", secret: true, env: "GOOGLE_CLIENT_SECRET", validate: noSpaces("El secreto de cliente") },
    ],
  },
  {
    id: "microsoft", name: "Microsoft (Outlook)", description: "Conectar cuentas de Outlook y Microsoft 365 para leer notificaciones.",
    required: ["client_id", "client_secret"],
    fields: [
      { key: "client_id", label: "ID de aplicación (cliente)", secret: false, env: "MICROSOFT_CLIENT_ID", placeholder: "00000000-0000-0000-0000-000000000000", validate: (v) => (/^[0-9a-fA-F-]{36}$/.test(v) ? null : "El ID de aplicación de Microsoft es un GUID (36 caracteres).") },
      { key: "client_secret", label: "Secreto de cliente (valor)", secret: true, env: "MICROSOFT_CLIENT_SECRET", help: "Copia el «Valor» del secreto, no su «ID».", validate: noSpaces("El secreto de cliente") },
    ],
  },
];

export const providerDef = (id: string): ProviderDef | undefined => INTEGRATIONS.find((p) => p.id === id);
/** Ata el secreto cifrado a su proveedor y campo: copiar el blob a otra fila no permite descifrarlo. */
export const integrationAad = (provider: string, key: string) => `integration:${provider}:${key}`;
/** Vista previa que nunca revela un secreto completo. */
export const maskSecret = (v: string) => (v.length >= 12 ? `••••••••${v.slice(-4)}` : "••••••••");
