import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

describe("safeNext (redirección abierta)", () => {
  it("acepta rutas internas, con query y hash", () => {
    for (const ok of ["/inicio", "/cuenta/clave", "/movimientos?mes=2026-11&tipo=pending", "/admin#x", "/a/b/c"]) expect(safeNext(ok), ok).toBe(ok);
  });
  it.each([
    "https://evil.com", "http://evil.com/inicio", "//evil.com", "///evil.com", "/\\evil.com", "\\\\evil.com", "/\\/evil.com",
    "javascript:alert(1)", "data:text/html,x", "evil.com", "inicio", "", " /inicio", "/ok\nSet-Cookie: a=b", "/ok\r\nX: y", "/a\u0000b", "/a\\b", "//\t/evil.com",
  ])("rechaza %j", (bad) => expect(safeNext(bad)).toBe("/inicio"));
  it("rechaza lo que no es texto o es larguísimo, y usa el valor por defecto indicado", () => {
    for (const bad of [null, undefined, 5, {}, ["/ok"]]) expect(safeNext(bad as never)).toBe("/inicio");
    expect(safeNext("/" + "a".repeat(600))).toBe("/inicio");
    expect(safeNext("//evil.com", "/login")).toBe("/login");
  });
});
