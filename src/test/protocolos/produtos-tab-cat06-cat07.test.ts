import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

import {
  saveProdutoComCompensacao,
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

describe("CAT-06 · integridade na edição de produto", () => {
  it("falha ao inserir novas formulações tenta restaurar produto e composição anterior", async () => {
    const { client, calls } = makeClient((c) => {
      if (c.table === "produtos" && c.op === "select") return { data: ANTERIOR, error: null };
      if (c.table === "formulacoes" && c.op === "select") return { data: FORMULACOES_ANTERIORES, error: null };
      if (c.table === "formulacoes" && c.op === "insert" && c.payload === NOVAS)
        return { data: null, error: { message: "insert falhou" } };
      return successfulMutation(c);
    });

    const out = await saveProdutoComCompensacao({
      client,
      produtoId: "p1",
      payload: PAYLOAD,
      buildFormulacoes: () => NOVAS,
    });

    expect(out.status).toBe("error");
    expect((out as any).message).toMatch(/composição/);
    // restaurou o produto anterior
    expect(calls.some((c) => c.table === "produtos" && c.op === "update" && c.payload === ANTERIOR)).toBe(true);
    // removeu composição parcial e reinseriu o snapshot anterior
    const idxDelete = calls.findIndex(
      (c, i) => c.table === "formulacoes" && c.op === "delete" && i > calls.findIndex((x) => x.op === "insert"),
    );
    expect(idxDelete).toBeGreaterThan(-1);
    expect(calls.some((c) => c.table === "formulacoes" && c.op === "insert" && c.payload === FORMULACOES_ANTERIORES)).toBe(true);
  });

  it("falha do rollback devolve erro crítico", async () => {
    const { client } = makeClient((c) => {
      if (c.table === "produtos" && c.op === "select") return { data: ANTERIOR, error: null };
      if (c.table === "formulacoes" && c.op === "select") return { data: FORMULACOES_ANTERIORES, error: null };
      if (c.table === "formulacoes" && c.op === "insert") return { data: null, error: { message: "insert falhou" } };
      if (c.table === "produtos" && c.op === "update" && c.payload === ANTERIOR)
        return { data: null, error: { message: "rollback falhou" } };
      return successfulMutation(c);
    });

    const out = await saveProdutoComCompensacao({
      client,
      produtoId: "p1",
      payload: PAYLOAD,
      buildFormulacoes: () => NOVAS,
    });

    expect(out.status).toBe("critical");
    expect((out as any).message).toMatch(/contate o suporte/i);
  });

  it("não escreve nada quando o snapshot inicial falha", async () => {
    const { client, calls } = makeClient((c) => {
      if (c.table === "produtos" && c.op === "select") return { data: null, error: { message: "sem leitura" } };
      return successfulMutation(c);
    });
    const out = await saveProdutoComCompensacao({
      client,
      produtoId: "p1",
      payload: PAYLOAD,
      buildFormulacoes: () => NOVAS,
    });
    expect(out.status).toBe("error");
    expect(calls.every((c) => c.op === "select")).toBe(true);
  });

  it("produto novo: falha na composição apaga o produto criado", async () => {
    const { client, calls } = makeClient((c) => {
      if (c.table === "produtos" && c.op === "insert") return { data: [{ id: "novo-1" }], error: null };
      if (c.table === "formulacoes" && c.op === "insert") return { data: null, error: { message: "insert falhou" } };
      return successfulMutation(c);
    });
    const out = await saveProdutoComCompensacao({
      client,
      produtoId: null,
      payload: PAYLOAD,
      buildFormulacoes: id => NOVAS.map(row => ({ ...row, produto_id: id })),
    });
    expect(out.status).toBe("error");
    expect(calls.some((c) => c.table === "produtos" && c.op === "delete")).toBe(true);
  });

  it("produto novo: falha da exclusão compensatória vira erro crítico", async () => {
    const { client } = makeClient((c) => {
      if (c.table === "produtos" && c.op === "insert") return { data: [{ id: "novo-1" }], error: null };
      if (c.table === "formulacoes" && c.op === "insert") return { data: null, error: { message: "insert falhou" } };
      if (c.table === "produtos" && c.op === "delete") return { data: null, error: { message: "delete falhou" } };
      return successfulMutation(c);
    });
    const out = await saveProdutoComCompensacao({
      client,
      produtoId: null,
      payload: PAYLOAD,
      buildFormulacoes: id => NOVAS.map(row => ({ ...row, produto_id: id })),
    });
    expect(out.status).toBe("critical");
  });

  it("caminho feliz devolve ok", async () => {
    const { client } = makeClient((c) => {
      if (c.table === "produtos" && c.op === "select") return { data: ANTERIOR, error: null };
      if (c.table === "formulacoes" && c.op === "select") return { data: FORMULACOES_ANTERIORES, error: null };
      return successfulMutation(c);
    });
    const out = await saveProdutoComCompensacao({
      client,
      produtoId: "p1",
      payload: PAYLOAD,
      buildFormulacoes: () => NOVAS,
    });
    expect(out).toEqual({ status: "ok", produtoId: "p1" });
  });
});

describe("confirmação de linhas e compensação", () => {
  const run = async (handler: (c: Call & { index: number }) => any, novo = false) => {
    const { client, calls } = makeClient(handler);
    const build = vi.fn(id => [{ produto_id: id, volume_ml: 100 }]);
    const out = await saveProdutoComCompensacao({ client, produtoId: novo ? null : "p1", payload: PAYLOAD, buildFormulacoes: build });
    return { out, calls, build };
  };
  const baseline = (c: Call) => {
    if (c.op === "select" && c.table === "produtos") return { data: ANTERIOR, error: null };
    if (c.op === "select") return { data: FORMULACOES_ANTERIORES, error: null };
    return successfulMutation(c);
  };
  it.each([[], [{ id: "outro" }], [{}], [{ id: "p1" }, { id: "p1" }]])("UPDATE sem linha/ID exato interrompe antes da composição: %j", async data => {
    const { out, calls, build } = await run(c => c.op === "update" ? { data, error: null } : baseline(c));
    expect(out.status).toBe("error");
    expect(build).not.toHaveBeenCalled();
    expect(calls.filter(c => c.table === "formulacoes" && c.op !== "select")).toHaveLength(0);
  });
  it.each([[], [{}], [{ id: "" }], [{ id: "a" }, { id: "b" }]])("INSERT sem ID/cardinalidade confiável é crítico: %j", async data => {
    const { out, calls, build } = await run(() => ({ data, error: null }), true);
    expect(out.status).toBe("critical");
    expect(build).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });
  it("compensação UPDATE zero linhas é crítica sem nova exclusão da composição", async () => {
    const { out, calls } = await run(c => {
      if (c.op === "update" && c.payload === ANTERIOR) return { data: [], error: null };
      if (c.op === "insert" && c.table === "formulacoes") return { data: [], error: null };
      return baseline(c);
    });
    expect(out.status).toBe("critical");
    expect(calls.filter(c => c.op === "delete")).toHaveLength(1);
  });
  it("DELETE composição zero quando snapshot tem uma linha não confirma sucesso", async () => {
    const { out } = await run(c => c.op === "delete" ? { data: [], error: null } : baseline(c));
    expect(out.status).toBe("critical");
  });
  it("compensação confiável restaura IDs e devolve erro, nunca ok", async () => {
    const { out, calls } = await run(c => c.op === "insert" && c.payload !== FORMULACOES_ANTERIORES
      ? { data: [], error: null } : baseline(c));
    expect(out.status).toBe("error");
    expect(calls.some(c => c.op === "insert" && c.payload === FORMULACOES_ANTERIORES)).toBe(true);
  });
  it("INSERT composição com produto divergente não confirma sucesso", async () => {
    const { out } = await run(c => c.op === "insert" && c.payload !== FORMULACOES_ANTERIORES
      ? { data: [{ id: "f2", produto_id: "outro" }], error: null } : baseline(c));
    expect(out.status).toBe("error");
  });
  it("DELETE compensatório do novo produto zero linhas é crítico", async () => {
    const { out } = await run(c => {
      if (c.table === "produtos" && c.op === "insert") return { data: [{ id: "novo-1" }], error: null };
      return { data: [], error: null };
    }, true);
    expect(out.status).toBe("critical");
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
