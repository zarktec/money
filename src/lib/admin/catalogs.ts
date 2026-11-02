/** Catálogos administrables por el super admin. La whitelist evita escribir en tablas arbitrarias. */
export interface CatalogDef { table: string; label: string; fields: { name: string; label: string; type?: "text" | "bool" | "number" | "array" }[] }

export const CATALOGS: Record<string, CatalogDef> = {
  bancos: { table: "banks", label: "Bancos y billeteras", fields: [
    { name: "name", label: "Nombre" }, { name: "code", label: "Código" },
    { name: "sender_domains", label: "Dominios de correo (coma)", type: "array" }, { name: "active", label: "Activo", type: "bool" }] },
  "tipos-ingreso": { table: "income_types", label: "Tipos de ingreso", fields: [
    { name: "name", label: "Nombre" }, { name: "icon", label: "Ícono" },
    { name: "recurring_default", label: "Recurrente por defecto", type: "bool" }, { name: "active", label: "Activo", type: "bool" }] },
  "categorias-egreso": { table: "expense_categories", label: "Categorías de egreso", fields: [
    { name: "name", label: "Nombre" }, { name: "icon", label: "Ícono" }, { name: "color", label: "Color" },
    { name: "essential", label: "Esencial", type: "bool" }, { name: "active", label: "Activo", type: "bool" }] },
  plataformas: { table: "subscription_platforms", label: "Plataformas de suscripción", fields: [
    { name: "name", label: "Nombre" }, { name: "logo_url", label: "Logo (URL)" },
    { name: "sender_domains", label: "Dominios de correo (coma)", type: "array" }, { name: "active", label: "Activo", type: "bool" }] },
};
