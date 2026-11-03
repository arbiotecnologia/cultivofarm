import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

import {
  saveProdutoTenant,
  carregarCatalogoProdutos,
} from "@/components/protocolos/ProdutosTab";

type Call = { table: string; op: string; payload?: any };

/** Cliente fake encadeável: resolve pelo handler (table, op, seq). */
function makeClient(handler: (c: Call & { index: number }) => any) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const builder: any = {};
    let current: Call = { table, op: "select" };
    const finish = () => {
      const index = calls.length;
      calls.push(current);
      return Promise.resolve(handler({ ...current, index }) ?? { data: [], error: null });
    };
    const setOp = (op: string, payload?: any) => {
      current = { table, op, payload };
      return builder;
    };
    builder.select = (_c?: any) => builder;
    builder.insert = (p: any) => setOp("insert", p);
    builder.update = (p: any) => setOp("update", p);
    builder.delete = () => setOp("delete");
    builder.eq = () => builder;
    builder.order = () => builder;
    builder.maybeSingle = () => finish();
    builder.then = (res: any, rej: any) => finish().then(res, rej);
    return builder;
  };
  return { client: { from }, calls };
}

function successfulMutation(c: Call) {
  if (c.table === "produtos") return { data: [{ id: c.op === "delete" ? "novo-1" : "p1" }], error: null };
  if (c.op === "insert") return { data: c.payload.map((row: any, i: number) => ({ id: row.id ?? `new-${i}`, produto_id: row.produto_id })), error: null };
  return { data: [{ id: "f1", produto_id: "p1" }], error: null };
}

const PAYLOAD = { nome: "Produto X" };
const ANTERIOR = { nome: "Produto Antigo" };
const FORMULACOES_ANTERIORES = [
  { id: "f1", produto_id: "p1", microrganismo_id: "m1", component_insumo_id: null, volume_ml: 100, proporcao: 1, e_volume_fixo: false },
];
const NOVAS = [{ produto_id: "p1", microrganismo_id: "m2", volume_ml: 200 }];

/**
 * CAT-06 (v2.8, catálogo exclusivo por empresa): a compensação no cliente com escrita direta foi substituída
 * pela RPC do produto + substituição atômica da composição no servidor. Os cenários de falha continuam
 * cobertos: nenhum caminho devolve ok sem ACK do servidor e não existe escrita direta em tabela.
 */
function makeRpc(handler: (fn: string, args: any, index: number) => any) {
  const calls: { fn: string; args: any }[] = [];
  const client = {
    rpc: (fn: string, args: any) => { const i = calls.length; calls.push({ fn, args }); return Promise.resolve(handler(fn, args, i)); },
    from: () => { throw new Error("escrita/leitura direta proibida no salvamento"); },
  };
  return { client, calls };
}
const ACK = (id: string) => ({ data: { product_id: id, updated_at: "2026-11-02T10:00:00.000001+00:00", replayed: false }, error: null });
const FORM_ACK = (id: string, n: number) => ({ data: { ok: true, produto_id: id, items: n, updated_at: "2026-11-02T10:00:00.000002+00:00" }, error: null });
const BASE = { nome: "Produto X", tipo: "solo", codigo: null, versao_catalogo: "v1", ativo: true, b2b_enabled: false };
const build = (id: string) => [{ produto_id: id, microrganismo_id: "m2", volume_ml: 200 }];

describe("CAT-06 · salvamento de produto por empresa", () => {
  it("edição sem versão observada não envia nada", async () => {
    const { client, calls } = makeRpc(() => ACK("p1"));
    const out = await saveProdutoTenant({ client, produtoId: "p1", expectedUpdatedAt: null, payload: BASE, buildFormulacoes: build });
    expect(out.status).toBe("error");
    expect(calls).toHaveLength(0);
  });
  it("caminho feliz: produto com CAS e composição com o token devolvido", async () => {
    const { client, calls } = makeRpc((fn, a) => fn === "tenant_product_save" ? ACK("p1") : FORM_ACK("p1", 1));
    const out = await saveProdutoTenant({ client, produtoId: "p1", expectedUpdatedAt: "T0", payload: BASE, buildFormulacoes: build });
    expect(out).toEqual({ status: "ok", produtoId: "p1" });
    expect(calls.map((c) => c.fn)).toEqual(["tenant_product_save", "tenant_catalog_formulacoes_replace"]);
    expect(calls[0].args.p_expected_updated_at).toBe("T0");
    expect(calls[1].args.p_expected_produto_updated_at).toBe("2026-11-02T10:00:00.000001+00:00");
    expect(calls[1].args.p_items).toEqual([{ microrganismo_id: "m2", volume_ml: 200 }]);
  });
  it("payload sem empresa/campos fora do contrato; código vazio deixado ao servidor", async () => {
    const { client, calls } = makeRpc((fn) => fn === "tenant_product_save" ? ACK("novo") : FORM_ACK("novo", 1));
    await saveProdutoTenant({ client, produtoId: null, expectedUpdatedAt: null, payload: { ...BASE, owner_organization_id: "x" }, buildFormulacoes: build });
    const body = calls[0].args.p_payload;
    expect(body).not.toHaveProperty("owner_organization_id");
    expect(body).not.toHaveProperty("versao_catalogo");
    expect(body).not.toHaveProperty("ativo");
    expect(body).not.toHaveProperty("codigo");
    expect(calls[0].args.p_expected_updated_at).toBeNull();
  });
  it("falha do produto: composição não é enviada", async () => {
    const { client, calls } = makeRpc(() => ({ data: null, error: { code: "PT409", message: "tenant_product_version_conflict" } }));
    const out = await saveProdutoTenant({ client, produtoId: "p1", expectedUpdatedAt: "T0", payload: BASE, buildFormulacoes: build });
    expect(out.status).toBe("error");
    expect(calls).toHaveLength(1);
  });
  it("ACK de outro produto não confirma sucesso nem envia composição", async () => {
    const { client, calls } = makeRpc(() => ACK("outro"));
    const out = await saveProdutoTenant({ client, produtoId: "p1", expectedUpdatedAt: "T0", payload: BASE, buildFormulacoes: build });
    expect(out.status).toBe("error");
    expect(calls).toHaveLength(1);
  });
  it("falha da composição depois do produto: parcial honesto, nunca ok, sem compensação", async () => {
    const { client, calls } = makeRpc((fn) => fn === "tenant_product_save" ? ACK("p1") : ({ data: null, error: { code: "42501", message: "tenant_catalog_ref_foreign:microrganismo_id" } }));
    const out = await saveProdutoTenant({ client, produtoId: "p1", expectedUpdatedAt: "T0", payload: BASE, buildFormulacoes: build });
    expect(out.status).toBe("partial");
    expect(calls).toHaveLength(2);
  });
  it("ACK de composição com contagem divergente é parcial", async () => {
    const { client } = makeRpc((fn) => fn === "tenant_product_save" ? ACK("p1") : FORM_ACK("p1", 5));
    const out = await saveProdutoTenant({ client, produtoId: "p1", expectedUpdatedAt: "T0", payload: BASE, buildFormulacoes: build });
    expect(out.status).toBe("partial");
  });
  it("composição apontando para outro produto é parcial e não é enviada", async () => {
    const { client, calls } = makeRpc(() => ACK("p1"));
    const out = await saveProdutoTenant({ client, produtoId: "p1", expectedUpdatedAt: "T0", payload: BASE, buildFormulacoes: () => [{ produto_id: "p9", microrganismo_id: "m" }] });
    expect(out.status).toBe("partial");
    expect(calls).toHaveLength(1);
  });
});

describe("CAT-07 · carregamento agregado", () => {
  const ok = (table: string) => {
    if (table === "produtos") return { data: [{ id: "p1", nome: "P1" }], error: null };
    if (table === "formulacoes") return { data: [{ id: "f1", produto_id: "p1", microrganismo_id: "m1" }], error: null };
    if (table === "microrganismos") return { data: [{ id: "m1", nome: "M1" }], error: null };
    return { data: [{ produto_id: "p1", status_validacao: "aprovado" }], error: null };
  };

  it("erro em product_technical_profiles impede dados/mapa parciais", async () => {
    const { client } = makeClient((c) =>
      c.table === "product_technical_profiles" ? { data: null, error: { message: "rls" } } : ok(c.table),
    );
    const res = await carregarCatalogoProdutos(client);
    expect("error" in res).toBe(true);
    expect(res as any).not.toHaveProperty("profileStatusMap");
  });

  it("sucesso total devolve produtos, microrganismos e mapa de status", async () => {
    const { client, calls } = makeClient((c) => ok(c.table));
    const res = await carregarCatalogoProdutos(client);
    expect("error" in res).toBe(false);
    const okRes = res as any;
    expect(okRes.produtos).toHaveLength(1);
    expect(okRes.microrganismos).toHaveLength(1);
    expect(okRes.profileStatusMap).toEqual({ p1: "aprovado" });
    // CAT-07: consulta de microrganismos não é duplicada
    expect(calls.filter((c) => c.table === "microrganismos")).toHaveLength(1);
  });

  it("erro em produtos também bloqueia o carregamento", async () => {
    const { client } = makeClient((c) =>
      c.table === "produtos" ? { data: null, error: { message: "falhou" } } : ok(c.table),
    );
    const res = await carregarCatalogoProdutos(client);
    expect("error" in res).toBe(true);
  });
});
