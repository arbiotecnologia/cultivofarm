import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PRODUCT_UNITS, isProductUnit, parseUnitCapability, parseAdminUnit, supportsVolumeApplication, supportsVolumeComposition } from "@/lib/catalogo/productUnitContract";
import { buildTenantProductPayload } from "@/lib/catalogo/tenantProducts";
import { PackagingAttempt, parsePackagingState, weightKg, cents, type Command } from "@/lib/catalogo/packagingAdminContract";
import { VolumesChips } from "@/components/protocolos/VolumesChips";

const PID = "11111111-1111-4111-8111-111111111111";
const PKG = "22222222-2222-4222-8222-222222222222";

describe("contrato de unidade kg/g/ml/l", () => {
  it.each(["kg","g",null,undefined,""])("%s não autoriza aplicação volumétrica",unit=>{
    expect(supportsVolumeApplication(unit)).toBe(false);
    expect(supportsVolumeComposition(unit,"biologico")).toBe(false);
  });
  it.each(["l","ml"])("%s preserva cálculo líquido e não permite composição biológica em químico",unit=>{
    expect(supportsVolumeApplication(unit)).toBe(true);
    expect(supportsVolumeComposition(unit,"biologico")).toBe(true);
    expect(supportsVolumeComposition(unit,"quimico")).toBe(false);
    expect(supportsVolumeComposition(unit,"fertilizante_adubo")).toBe(false);
  });
  it("aceita somente as quatro unidades", () => {
    expect([...PRODUCT_UNITS]).toEqual(["kg", "g", "ml", "l"]);
    for (const u of ["kg", "g", "ml", "l"]) expect(isProductUnit(u)).toBe(true);
    for (const u of ["KG", "mL", "L", "un", "", null, undefined]) expect(isProductUnit(u)).toBe(false);
  });
  it("capability ausente/incompleta fica fechada", () => {
    expect(() => parseUnitCapability(null)).toThrow("product_unit_capability_unavailable");
    expect(() => parseUnitCapability({ contract: "PRODUCT_UNIT_V2", writer: "tenant_product_save", units: ["kg", "g", "ml"] })).toThrow();
    expect(() => parseUnitCapability({ contract: "PRODUCT_UNIT_V1", writer: "tenant_product_save", units: [...PRODUCT_UNITS] })).toThrow();
    expect(() => parseUnitCapability({ contract: "PRODUCT_UNIT_V2", writer: "outro", units: [...PRODUCT_UNITS] })).toThrow();
    expect(parseUnitCapability({ contract: "PRODUCT_UNIT_V2", writer: "tenant_product_save", units: ["l", "ml", "g", "kg"] })).toBe(true);
  });
  it("leitura de unidade exige o mesmo produto e unidade válida", () => {
    const base = { contract: "SOLID_PACK_ADMIN_V1", product_id: PID, config_version: 0, offers: [] };
    expect(parseAdminUnit({ ...base, unidade_conteudo: "g" }, PID)).toBe("g");
    expect(parseAdminUnit({ ...base, unidade_conteudo: null }, PID)).toBeNull();
    expect(() => parseAdminUnit({ ...base, unidade_conteudo: "un" }, PID)).toThrow();
    expect(() => parseAdminUnit({ ...base, unidade_conteudo: "kg" }, PKG)).toThrow();
  });
  it("criação exige unidade; unidade inventada é recusada, não descartada", () => {
    expect(() => buildTenantProductPayload({ nome: "Solo 1", tipo: "solo" } as never, true)).toThrow("Escolha kg, g, mL ou L.");
    expect(() => buildTenantProductPayload({ nome: "Solo 1", tipo: "solo", unidade_conteudo: "un" } as never, true)).toThrow();
    expect(buildTenantProductPayload({ nome: "Solo 1", tipo: "solo", unidade_conteudo: "kg" } as never, true).unidade_conteudo).toBe("kg");
  });
});

describe("apresentações sólidas", () => {
  it("peso exato em gramas e centavos inteiros", () => {
    expect(weightKg("500", "g")).toBe(0.5);
    expect(weightKg("1,5", "kg")).toBe(1.5);
    expect(() => weightKg("0", "kg")).toThrow();
    expect(() => weightKg("0,0005", "kg")).toThrow();
    expect(cents("100")).toBe(10000);
    expect(cents("1,05")).toBe(105);
    expect(() => cents("-1")).toThrow();
    expect(() => cents("0")).toThrow();
  });
  it("leitura rejeita outro produto e apresentação duplicada", () => {
    const offer = { packaging_id: PKG, codigo: "S25", descricao: null, peso_liquido_kg: 25, version: 1, ativo: true, prices: [] };
    const ok = { contract: "SOLID_PACK_ADMIN_V1", product_id: PID, config_version: 1, unidade_conteudo: "kg", offers: [offer] };
    expect(parsePackagingState(ok, PID).offers).toHaveLength(1);
    expect(() => parsePackagingState(ok, PKG)).toThrow();
    expect(() => parsePackagingState({ ...ok, offers: [offer, offer] }, PID)).toThrow();
  });
  it("sólido não exibe preço legado do volume", () => {
    render(<VolumesChips volumes={[{ id: "v", rotulo: "Saco 25 kg", medida: "embalagem", preco_brl: 999.99 } as never]} />);
    expect(screen.getByText("Saco 25 kg")).toBeTruthy();
    expect(screen.queryByText(/999/)).toBeNull();
  });
});

describe("retomada mesma chave/payload/CAS e troca de escopo", () => {
  const cmd: Command = { rpc: "solid_pack_offer_save_v1", args: { p_product: PID, p_packaging_id: null, p_expected_version: null, p_codigo: "S25", p_peso_liquido_kg: 25 } };
  const ack = { packaging_id: PKG, codigo: "S25", version: 1, previous_packaging_id: null, price_required: true };

  it("resposta perdida retém chave/args exatos e retoma sem nova intenção", async () => {
    const calls: Record<string, unknown>[] = [];
    const rpc = vi.fn()
      .mockImplementationOnce(async (_n: string, a: Record<string, unknown>) => { calls.push(a); throw new Error("network"); })
      .mockImplementationOnce(async (_n: string, a: Record<string, unknown>) => { calls.push(a); return { data: ack, error: null }; });
    const t = new PackagingAttempt();
    await expect(t.send(rpc, "scopeA", () => true, cmd, async () => {})).rejects.toThrow();
    expect(t.pending).toBe(true);
    await expect(t.send(rpc, "scopeA", () => true, { ...cmd, args: { ...cmd.args, p_codigo: "S50" } }, async () => {})).rejects.toThrow("Reconcilie");
    expect(rpc).toHaveBeenCalledTimes(1);
    await t.resume(rpc, "scopeA", () => true, async () => {});
    expect(calls[1]).toEqual(calls[0]);
    expect(typeof calls[0].p_idempotency_key).toBe("string");
    expect(t.pending).toBe(false);
  });
  it("outro escopo não retoma a tentativa retida", async () => {
    const rpc = vi.fn(async () => { throw new Error("network"); });
    const t = new PackagingAttempt();
    await expect(t.send(rpc, "scopeA", () => true, cmd, async () => {})).rejects.toThrow();
    expect(() => t.resume(rpc, "scopeB", () => true, async () => {})).toThrow("Tentativa indisponível");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("contexto alterado durante o envio não adota o ACK", async () => {
    let cur = true;
    const rpc = vi.fn(async () => { cur = false; return { data: ack, error: null }; });
    const t = new PackagingAttempt();
    await expect(t.send(rpc, "scopeA", () => cur, cmd, async () => {})).rejects.toThrow("Contexto alterado");
    expect(t.pending).toBe(true);
  });
  it("recusa definitiva libera; ACK com versão CAS errada é rejeitado", async () => {
    const t = new PackagingAttempt();
    await expect(t.send(async () => ({ data: null, error: { code: "PT409", message: "conflito" } }), "s", () => true, cmd, async () => {})).rejects.toThrow("conflito");
    expect(t.pending).toBe(false);
    const cas: Command = { ...cmd, args: { ...cmd.args, p_packaging_id: PKG, p_expected_version: 3 } };
    await expect(t.send(async () => ({ data: { ...ack, version: 3, previous_packaging_id: PKG }, error: null }), "s", () => true, cas, async () => {})).rejects.toThrow("ACK");
    expect(t.pending).toBe(true);
  });
});
