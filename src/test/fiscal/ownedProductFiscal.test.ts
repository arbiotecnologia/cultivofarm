import { describe, expect, test, vi } from "vitest";
import {
  OWNED_PRODUCT_FISCAL_ENABLED, OwnedFiscalError, normalizeOwnedFiscalValues,
  parseOwnedFiscalReceipt, saveOwnedProductFiscal,
} from "@/lib/fiscal/ownedProductFiscal";

const P = "d0000000-0000-0000-0000-00000000000a";
const K = "90000000-0000-0000-0000-000000000002";
const ORG = "a0000000-0000-0000-0000-00000000000a";
const ack = { success: true, product_id: P, profile_id: "f0000000-0000-0000-0000-000000000001", organization_id: ORG,
  profile_status: "DRAFT", updated_at: "2026-11-01T13:00:00.000Z", idempotency_key: K, idempotent: false };
const input = { productId: P, expectedUpdatedAt: null, values: { ncm: "31010000" }, reason: "motivo de teste ok", idempotencyKey: K };

describe("perfil fiscal do catálogo próprio (candidato)", () => {
  test("writer liberado por padrão; com gate explícito desligado nenhuma RPC é chamada", async () => {
    expect(OWNED_PRODUCT_FISCAL_ENABLED).toBe(true);
    const rpc = vi.fn();
    await expect(saveOwnedProductFiscal({ rpc }, input, false)).rejects.toMatchObject({ kind: "disabled" });
    expect(rpc).not.toHaveBeenCalled();
  });
  test("cliente não envia empresa nem status; só campos fiscais", () => {
    expect(() => normalizeOwnedFiscalValues({ organization_id: ORG })).toThrow(OwnedFiscalError);
    expect(() => normalizeOwnedFiscalValues({ profile_status: "VALIDATED" })).toThrow(OwnedFiscalError);
    expect(normalizeOwnedFiscalValues({ ncm: " 31010000 ", cest: "" })).toEqual({ ncm: "31010000", cest: null });
  });
  test.each([["ncm", "123"], ["cest", "12"], ["cfop_in_state", "9101"], ["origin_code", "9"], ["gtin", "abc"]])(
    "formato inválido %s=%s é recusado antes do servidor", async (k, v) => {
      const rpc = vi.fn();
      await expect(saveOwnedProductFiscal({ rpc }, { ...input, values: { [k]: v } }, true)).rejects.toMatchObject({ kind: "invalid" });
      expect(rpc).not.toHaveBeenCalled();
    });
  test("envia exatamente produto/CAS/valores/motivo/chave e aceita ACK exato", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: ack, error: null });
    await expect(saveOwnedProductFiscal({ rpc }, input, true)).resolves.toMatchObject({ profile_status: "DRAFT" });
    expect(rpc).toHaveBeenCalledWith("tenant_owned_product_fiscal_save", {
      p_product_id: P, p_expected_updated_at: null, p_values: { ncm: "31010000" }, p_reason: "motivo de teste ok", p_idempotency_key: K });
  });
  test.each([
    ["outro produto", { ...ack, product_id: "e0000000-0000-0000-0000-00000000000b" }],
    ["outra chave", { ...ack, idempotency_key: "90000000-0000-0000-0000-000000000003" }],
    ["promovido a VALIDATED", { ...ack, profile_status: "VALIDATED" }],
    ["sem success", { ...ack, success: undefined }],
  ])("ACK divergente (%s) é incerto", (_n, data) => {
    expect(() => parseOwnedFiscalReceipt(data, { productId: P, idempotencyKey: K })).toThrow(/não confirmada/);
  });
  test.each([["42501", "forbidden"], ["PT409", "conflict"], ["22023", "invalid"], ["XX000", "uncertain"]])(
    "erro %s vira %s sem nova tentativa", async (code, kind) => {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });
      await expect(saveOwnedProductFiscal({ rpc }, input, true)).rejects.toMatchObject({ kind });
      expect(rpc).toHaveBeenCalledTimes(1);
    });
});
