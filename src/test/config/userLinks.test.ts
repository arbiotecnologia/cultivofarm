import { describe, it, expect } from "vitest";
import { tipoAcessoDoUsuario, parseVinculos, estadoVinculo, edicaoBloqueadaPorTipo, ajudaSemElegiveis } from "@/lib/configuracoes/userLinks";

const U = "11111111-1111-4111-8111-111111111111", C = "22222222-2222-4222-8222-222222222222", P = "33333333-3333-4333-8333-333333333333";
const base = { user_id: "11111111-1111-4111-8111-111111111111", clientes: [] as unknown[], parceiro: null as unknown, parceiros_total: 0, fora_do_alcance: 0 };
const resp = (it: Record<string, unknown>) => parseVinculos({ items: [{ user_id: U, clientes: [], parceiro: null, parceiros_total: 0, fora_do_alcance: 0, ...it }] });

describe("tipo de acesso", () => {
  it("classifica Interno, Gestor B2B, Produtor, Técnico B2B e combinado", () => {
    expect(tipoAcessoDoUsuario(["financeiro"])).toBe("internal");
    expect(tipoAcessoDoUsuario(["parceiro_b2b"])).toBe("b2b");
    expect(tipoAcessoDoUsuario(["cliente_produtor"])).toBe("producer");
    expect(tipoAcessoDoUsuario(["parceiro_b2b_tecnico"])).toBe("b2b_tecnico");
    expect(tipoAcessoDoUsuario(["cliente_produtor", "administrador"])).toBe("misto");
  });
  it("fase 1: só Interno pode salvar; externos ficam somente leitura", () => {
    expect(edicaoBloqueadaPorTipo("internal")).toBe(false);
    for (const t of ["b2b", "producer", "b2b_tecnico", "misto"] as const) expect(edicaoBloqueadaPorTipo(t)).toBe(true);
  });
});

describe("estado do vínculo", () => {
  it("carregando e erro nunca viram 'sem vínculo'", () => {
    expect(estadoVinculo("producer", { isLoading: true, isError: false }, U).estado).toBe("carregando");
    expect(estadoVinculo("producer", { isLoading: false, isError: true }, U).estado).toBe("erro");
    expect(estadoVinculo("producer", { isLoading: false, isError: false, data: new Map() }, U).estado).toBe("erro");
  });
  it("produtor sem vínculo e com cliente principal", () => {
    expect(estadoVinculo("producer", { isLoading: false, isError: false, data: resp({}) }, U).estado).toBe("sem_vinculo");
    const e = estadoVinculo("producer", { isLoading: false, isError: false, data: resp({ clientes: [{ cliente_id: C, nome: "AR Bio", principal: true, status_cliente: "ativo", vigente: true }] }) }, U);
    expect(e).toMatchObject({ estado: "com_vinculo", resumo: "AR Bio" });
  });
  it("parceiro B2B e vínculos fora do alcance contados sem expor dados", () => {
    const e = estadoVinculo("b2b", { isLoading: false, isError: false, data: resp({ parceiro: { partner_id: P, razao_social: "Revenda X", papel: "gestor", ativo: true }, parceiros_total: 1, fora_do_alcance: 2 }) }, U);
    expect(e).toMatchObject({ estado: "com_vinculo", resumo: "Revenda X", fora_do_alcance: 2 });
  });
  it("interno sem vínculo: não se aplica", () => {
    expect(estadoVinculo("internal", { isLoading: false, isError: false, data: resp({}) }, U).estado).toBe("nao_aplica");
  });
  it("resposta malformada é erro", () => {
    expect(() => parseVinculos(null)).toThrow();
    expect(() => parseVinculos({ items: [{ user_id: "x", clientes: [] }] })).toThrow();
  });
  const cli = { cliente_id: C, nome: "AR Bio", principal: true, status_cliente: "ativo", vigente: true };
  const par = { partner_id: P, razao_social: "Revenda X", papel: "gestor", ativo: true };
  it.each([
    ["parceiro com UUID inválido", { parceiro: { ...par, partner_id: "nao-uuid" }, parceiros_total: 1 }],
    ["parceiro sem razão social", { parceiro: { ...par, razao_social: undefined }, parceiros_total: 1 }],
    ["parceiro não-objeto", { parceiro: "x", parceiros_total: 1 }],
    ["cliente sem id", { clientes: [{ ...cli, cliente_id: undefined }] }],
    ["cliente com id inválido", { clientes: [{ ...cli, cliente_id: "123" }] }],
    ["cliente sem nome", { clientes: [{ ...cli, nome: null }] }],
    ["cliente com booleano em string", { clientes: [{ ...cli, vigente: "true" }] }],
    ["cliente nulo", { clientes: [null] }],
    ["contagem NaN", { fora_do_alcance: Number.NaN }],
    ["contagem negativa", { fora_do_alcance: -1 }],
    ["contagem fracionária", { parceiros_total: 0.5 }],
    ["contagem em string", { fora_do_alcance: "2" }],
    ["contagem ausente", { fora_do_alcance: undefined }],
    ["total incoerente sem parceiro", { parceiros_total: 2 }],
    ["total zero com parceiro", { parceiro: par, parceiros_total: 0 }],
  ])("rejeita %s", (_n, it) => {
    expect(() => resp(it)).toThrow("Resposta de vínculos inválida.");
  });
  it("rejeita usuário duplicado e items não-array", () => {
    expect(() => parseVinculos({ items: [base, base] })).toThrow();
    expect(() => parseVinculos({ items: {} })).toThrow();
    expect(() => parseVinculos([])).toThrow();
  });
  it("aceita contrato válido completo", () => {
    const m = resp({ clientes: [cli], parceiro: par, parceiros_total: 2, fora_do_alcance: 1 });
    expect(m.get(U)).toEqual({ user_id: U, clientes: [cli], parceiro: par, parceiros_total: 2, fora_do_alcance: 1 });
  });
});

describe("ajuda sem elegíveis", () => {
  it("distingue busca sem resultado de nenhum cadastro elegível", () => {
    expect(ajudaSemElegiveis("b2b", "abc")).toMatch(/busca/);
    expect(ajudaSemElegiveis("b2b", "")).toMatch(/Parceiros B2B/);
    expect(ajudaSemElegiveis("producer", "")).toMatch(/Clientes/);
  });
});
