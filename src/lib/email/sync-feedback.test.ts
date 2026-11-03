import { describe, expect, it } from "vitest";
import { syncFeedback, syncText } from "./sync-feedback";

const stats = { listed: 0, alreadyLogged: 0, ignored: 0, processed: 0, created: 0, duplicates: 0, errors: 0, quotaExhausted: false, incomplete: false, authError: false };

describe("mensajes de «Sincronizar ahora»", () => {
  it("sin clave de IA o con credencial revocada, avisa en vez de no hacer nada", () => {
    expect(syncFeedback({ skipped: "IA no configurada" }).code).toBe("ia");
    expect(syncFeedback({ skipped: "credencial revocada" }).code).toBe("reconectar");
    expect(syncFeedback({ skipped: "inactiva" }).code).toBe("reconectar");
  });
  it("distingue éxito, sin novedades, parcial, cuota y error", () => {
    expect(syncFeedback({ ...stats, created: 2, processed: 2, ignored: 5 })).toEqual({ code: "ok", n: 2, i: 5 });
    expect(syncFeedback(stats).code).toBe("empty");
    expect(syncFeedback({ ...stats, incomplete: true, created: 1 }).code).toBe("parcial");
    expect(syncFeedback({ ...stats, quotaExhausted: true }).code).toBe("cuota");
    expect(syncFeedback({ ...stats, authError: true }).code).toBe("reconectar");
    expect(syncFeedback(new Error("x")).code).toBe("error");
  });
  it("el texto sale del código (singular/plural) y un código desconocido no muestra nada", () => {
    expect(syncText("ok", 1, 1)?.text).toBe("Listo: 1 movimiento nuevo para revisar y 1 correo descartado.");
    expect(syncText("ok", 3, 0)?.text).toMatch(/3 movimientos nuevos.*0 correos descartados/);
    expect(syncText("ia")?.tone).toBe("error");
    expect(syncText("<script>")).toBeNull();
  });
});
