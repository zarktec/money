import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { integritySignature, verifyEvent } = await import("./index");

describe("wompi", () => {
  it("firma de integridad", () => {
    process.env.WOMPI_INTEGRITY_SECRET = "sec";
    const expected = createHash("sha256").update("ref12990000COPsec").digest("hex");
    expect(integritySignature("ref1", 2990000, "COP")).toBe(expected);
  });
  it("verifica checksum de evento y rechaza alterados", () => {
    const secret = "evt_secret";
    const base = {
      event: "transaction.updated", environment: "test", timestamp: 1700000000, sent_at: "",
      data: { transaction: { id: "t1", status: "APPROVED", amount_in_cents: 100, reference: "r", currency: "COP" } },
      signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: "" },
    };
    base.signature.checksum = createHash("sha256").update(`t1APPROVED100${1700000000}${secret}`).digest("hex");
    expect(verifyEvent(base, secret)).toBe(true);
    const tampered = { ...base, data: { transaction: { ...base.data.transaction, status: "DECLINED" } } };
    expect(verifyEvent(tampered, secret)).toBe(false);
  });
});
