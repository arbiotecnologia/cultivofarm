import { describe, expect, test } from "vitest";
import { parseOwnedFiscalReceipt } from "@/lib/fiscal/ownedProductFiscal";

/**
 * Revisão independente 80c64c3: o parser original aceitava status arbitrário,
 * data civil inexistente e timestamps sem fuso. O recibo do servidor só pode
 * conter DRAFT/BLOCKED e updated_at timestamptz ISO com fuso e até 6 frações.
 */
const P = "d0000000-0000-0000-0000-00000000000a";
const K = "90000000-0000-0000-0000-000000000002";
const exp = { productId: P, idempotencyKey: K };
const ack = {
  success: true, product_id: P, profile_id: "f0000000-0000-0000-0000-000000000001",
  organization_id: "a0000000-0000-0000-0000-00000000000a", profile_status: "DRAFT",
  updated_at: "2026-11-01T13:00:00.123456+00:00", idempotency_key: K, idempotent: false,
};

describe("recibo fiscal próprio estrito", () => {
  test.each([
    ["DRAFT com micros e offset", { ...ack }],
    ["BLOCKED com Z", { ...ack, profile_status: "BLOCKED", updated_at: "2026-11-01T13:00:00Z" }],
    ["formato PostgreSQL com espaço e +00", { ...ack, updated_at: "2026-11-01 13:00:00.5+00" }],
    ["29/02 em ano bissexto", { ...ack, updated_at: "2028-02-29T00:00:00-03:00" }],
  ])("aceita %s", (_n, data) => {
    expect(parseOwnedFiscalReceipt(data, exp).profile_status).toMatch(/^(DRAFT|BLOCKED)$/);
  });

  test.each([
    ["status arbitrário", { ...ack, profile_status: "ARBITRARY" }],
    ["PENDING_ACCOUNTING (não emitido pelo writer)", { ...ack, profile_status: "PENDING_ACCOUNTING" }],
    ["VALIDATED", { ...ack, profile_status: "VALIDATED" }],
    ["31/02 inexistente", { ...ack, updated_at: "2026-02-31T10:00:00Z" }],
    ["29/02 não bissexto", { ...ack, updated_at: "2026-02-29T10:00:00Z" }],
    ["somente data", { ...ack, updated_at: "2026-11-01" }],
    ["data/hora sem fuso", { ...ack, updated_at: "2026-11-01T13:00:00" }],
    ["sete frações", { ...ack, updated_at: "2026-11-01T13:00:00.1234567Z" }],
    ["hora 24", { ...ack, updated_at: "2026-11-01T24:00:00Z" }],
    ["offset inválido", { ...ack, updated_at: "2026-11-01T13:00:00+25:00" }],
    ["texto livre parseável", { ...ack, updated_at: "Nov 1, 2026 13:00 GMT" }],
  ])("recusa %s como incerto", (_n, data) => {
    expect(() => parseOwnedFiscalReceipt(data, exp)).toThrow(/não confirmada/);
  });
});
