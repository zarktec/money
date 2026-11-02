import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { splitMarks } from "@/lib/legal";

async function render(which: "privacidad" | "terminos", env: Record<string, string> = {}) {
  vi.resetModules();
  for (const k of ["NEXT_PUBLIC_LEGAL_NAME", "NEXT_PUBLIC_LEGAL_NIT", "NEXT_PUBLIC_LEGAL_ADDRESS", "NEXT_PUBLIC_LEGAL_EMAIL", "NEXT_PUBLIC_LEGAL_REVIEWED"]) delete process.env[k];
  Object.assign(process.env, env);
  const mod = which === "privacidad" ? await import("./privacidad/page") : await import("./terminos/page");
  return renderToStaticMarkup(<mod.default />);
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
afterEach(() => { for (const k of ["NEXT_PUBLIC_LEGAL_NAME", "NEXT_PUBLIC_LEGAL_REVIEWED", "NEXT_PUBLIC_LEGAL_EMAIL"]) delete process.env[k]; });

describe("splitMarks", () => {
  it("separa los tramos resaltados", () => {
    expect(splitMarks("a [[b]] c [[d]]")).toEqual([{ text: "a ", marked: false }, { text: "b", marked: true }, { text: " c ", marked: false }, { text: "d", marked: true }]);
    expect(splitMarks("sin marcas")).toEqual([{ text: "sin marcas", marked: false }]);
  });
});

describe("páginas legales", () => {
  it("existen, y mientras no estén revisadas muestran el aviso de BORRADOR y resaltan lo pendiente", async () => {
    for (const p of ["privacidad", "terminos"] as const) {
      const html = await render(p);
      expect(text(html)).toMatch(/BORRADOR sin revisión legal/);
      expect(html).toContain("<mark");
    }
  });
  it("con NEXT_PUBLIC_LEGAL_REVIEWED=true desaparece el aviso; los datos del responsable salen de las variables", async () => {
    const html = await render("privacidad", { NEXT_PUBLIC_LEGAL_REVIEWED: "true", NEXT_PUBLIC_LEGAL_NAME: "Acme SAS", NEXT_PUBLIC_LEGAL_EMAIL: "datos@acme.co" });
    expect(text(html)).not.toMatch(/BORRADOR/);
    expect(text(html)).toContain("Acme SAS"); expect(text(html)).toContain("datos@acme.co");
  });
  it("ningún marcador queda sin cerrar ni se imprime literal", async () => {
    for (const p of ["privacidad", "terminos"] as const) { const t = text(await render(p)); expect(t, p).not.toMatch(/\[\[|\]\]/); }
  });
  it("la política describe lo que la app realmente hace (guarda estas afirmaciones alineadas con el código)", async () => {
    const t = text(await render("privacidad"));
    for (const must of ["Ley 1581 de 2012", "Anthropic", "Wompi", "solo lectura", "no guardamos el contenido del correo", "No guardamos la foto", "Mis datos", "Superintendencia de Industria y Comercio", "10 días hábiles", "15 días hábiles", "sin tu nombre ni correo"]) expect(t, must).toContain(must);
    expect(text(await render("terminos"))).toMatch(/No es una entidad financiera/);
  });
  it("el formulario de registro enlaza a ambos documentos", async () => {
    const { AuthForm } = await import("@/components/auth-form");
    const html = renderToStaticMarkup(<AuthForm mode="registro" />);
    expect(html).toContain('href="/privacidad"'); expect(html).toContain('href="/terminos"');
  });
});
