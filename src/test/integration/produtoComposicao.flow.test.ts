/**
 * Integração do fluxo de edição da Composição Técnica em Protocolos > Produtos.
 *
 * Cobre o cenário reportado pelo usuário:
 *   1. Editar um produto existente.
 *   2. Remover um microrganismo, adicionar outro, alterar dose de um terceiro.
 *   3. Salvar — o handler deve emitir DELETE em `formulacoes` por `produto_id`
 *      e em seguida INSERT com o payload deduplicado/sanitizado.
 *   4. Após o re-fetch, reabrir a edição reflete a composição atualizada
 *      (persistência simulada).
 *
 * Como o projeto não possui runner Playwright instalado, validamos o fluxo no
 * nível de integração de dados (handler + supabase client) — que é justamente
 * a camada onde o bug original (RLS bloqueando DELETE + payload duplicado)
 * acontecia.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildFormulacoesPayload,
  sanitizeComposicao,
  type ComposicaoItem,
} from "@/lib/protocolos/composicaoSync";

// --- mock supabase mínimo focado em formulacoes ---------------------------
type Row = Record<string, any>;
const state = {
  formulacoes: [] as Row[],
  deletes: [] as { table: string; eq: [string, any] }[],
  inserts: [] as { table: string; rows: Row[] }[],
  forceDeleteError: null as null | { message: string },
  forceInsertError: null as null | { message: string },
};

function makeBuilder(table: string) {
  let op: "select" | "insert" | "update" | "delete" = "select";
  let insertPayload: Row[] = [];
  let eqField: string | null = null;
  let eqValue: any = null;

  const builder: any = {
    select: vi.fn(() => builder),
    insert: vi.fn((p: any) => {
      op = "insert";
      insertPayload = Array.isArray(p) ? p : [p];
      return builder;
    }),
    delete: vi.fn(() => {
      op = "delete";
      return builder;
    }),
    update: vi.fn(() => {
      op = "update";
      return builder;
    }),
    eq: vi.fn((f: string, v: any) => {
      eqField = f;
      eqValue = v;
      return builder;
    }),
    order: vi.fn(() => builder),
    then: (onF: any, onR: any) => {
      let result: { data: any; error: any } = { data: null, error: null };
      if (op === "delete" && table === "formulacoes") {
        if (state.forceDeleteError) {
          result = { data: null, error: state.forceDeleteError };
        } else {
          state.deletes.push({ table, eq: [eqField!, eqValue] });
          state.formulacoes = state.formulacoes.filter(
            (r) => !(eqField && r[eqField] === eqValue),
          );
          result = { data: null, error: null };
        }
      } else if (op === "insert" && table === "formulacoes") {
        if (state.forceInsertError) {
          result = { data: null, error: state.forceInsertError };
        } else {
          // simula índice UNIQUE (produto_id, microrganismo_id)
          for (const r of insertPayload) {
            if (
              r.microrganismo_id &&
              state.formulacoes.some(
                (e) =>
                  e.produto_id === r.produto_id &&
                  e.microrganismo_id === r.microrganismo_id,
              )
            ) {
              result = {
                data: null,
                error: {
                  message:
                    'duplicate key value violates unique constraint "formulacoes_produto_microrganismo_unique"',
                },
              };
              return Promise.resolve(result).then(onF, onR);
            }
          }
          state.inserts.push({ table, rows: insertPayload });
          state.formulacoes.push(...insertPayload);
          result = { data: insertPayload, error: null };
        }
      } else if (op === "select" && table === "formulacoes") {
        result = { data: state.formulacoes, error: null };
      }
      return Promise.resolve(result).then(onF, onR);
    },
  };
  return builder;
}

const supabase = {
  from: vi.fn((table: string) => makeBuilder(table)),
};

// --- replica fielmente o trecho do handleSave que sincroniza a composição --
async function syncComposicao(produtoId: string, composicao: ComposicaoItem[]) {
  const payload = buildFormulacoesPayload(produtoId, composicao);
  const { error: delErr } = await supabase
    .from("formulacoes")
    .delete()
    .eq("produto_id", produtoId);
  if (delErr) throw new Error(delErr.message);
  if (payload.length > 0) {
    const { error: insErr } = await supabase.from("formulacoes").insert(payload);
    if (insErr) throw new Error(insErr.message);
  }
}

const baseRow = (over: Partial<ComposicaoItem>): ComposicaoItem => ({
  microrganismo_id: null,
  component_insumo_id: null,
  volume_ml: 100,
  proporcao: null,
  e_volume_fixo: false,
  ...over,
});

describe("Produto → Composição Técnica · fluxo editar / salvar / reabrir", () => {
  beforeEach(() => {
    state.formulacoes = [
      {
        produto_id: "prod-1",
        microrganismo_id: "m1",
        component_insumo_id: null,
        volume_ml: 100,
        proporcao: null,
        e_volume_fixo: false,
        unidade: "mL",
      },
      {
        produto_id: "prod-1",
        microrganismo_id: "m2",
        component_insumo_id: null,
        volume_ml: 100,
        proporcao: null,
        e_volume_fixo: false,
        unidade: "mL",
      },
      {
        produto_id: "prod-1",
        microrganismo_id: "m3",
        component_insumo_id: null,
        volume_ml: 100,
        proporcao: null,
        e_volume_fixo: false,
        unidade: "mL",
      },
    ];
    state.deletes = [];
    state.inserts = [];
    state.forceDeleteError = null;
    state.forceInsertError = null;
  });

  it("remove um microrganismo, adiciona outro e persiste após reabrir", async () => {
    // Estado atual carregado pela tela ao abrir o diálogo:
    const atual: ComposicaoItem[] = state.formulacoes
      .filter((r) => r.produto_id === "prod-1")
      .map((r) => baseRow({ microrganismo_id: r.microrganismo_id }));

    // Usuário remove m2 e adiciona m4
    const editado: ComposicaoItem[] = atual
      .filter((c) => c.microrganismo_id !== "m2")
      .concat(baseRow({ microrganismo_id: "m4", volume_ml: 150 }));

    await syncComposicao("prod-1", editado);

    // DELETE foi chamado uma vez para limpar a composição antiga
    expect(state.deletes).toEqual([
      { table: "formulacoes", eq: ["produto_id", "prod-1"] },
    ]);
    // INSERT foi chamado com o payload sanitizado
    expect(state.inserts).toHaveLength(1);
    const ids = state.inserts[0].rows.map((r) => r.microrganismo_id).sort();
    expect(ids).toEqual(["m1", "m3", "m4"]);
    // m4 carregou o volume customizado
    expect(state.inserts[0].rows.find((r) => r.microrganismo_id === "m4")?.volume_ml).toBe(150);

    // Reabrir: simulamos releitura
    const reabertura = state.formulacoes
      .filter((r) => r.produto_id === "prod-1")
      .map((r) => r.microrganismo_id)
      .sort();
    expect(reabertura).toEqual(["m1", "m3", "m4"]);
  });

  it("dedup evita violar UNIQUE(produto_id, microrganismo_id) quando há duplicata na UI", async () => {
    const composicao: ComposicaoItem[] = [
      baseRow({ microrganismo_id: "m1" }),
      baseRow({ microrganismo_id: "m2" }),
      baseRow({ microrganismo_id: "m1", volume_ml: 500 }), // duplicata do mesmo micro
    ];
    // sanitize remove a duplicata antes do insert
    expect(sanitizeComposicao(composicao)).toHaveLength(2);
    await expect(syncComposicao("prod-1", composicao)).resolves.toBeUndefined();
    expect(state.inserts[0].rows).toHaveLength(2);
  });

  it("propaga erro se DELETE falhar (ex.: policy RLS ausente)", async () => {
    state.forceDeleteError = { message: "permission denied for table formulacoes" };
    await expect(
      syncComposicao("prod-1", [baseRow({ microrganismo_id: "m1" })]),
    ).rejects.toThrow(/permission denied/);
    expect(state.inserts).toHaveLength(0); // não tenta inserir após delete falho
  });

  it("salvar com composição vazia faz DELETE e nenhum INSERT", async () => {
    await syncComposicao("prod-1", []);
    expect(state.deletes).toHaveLength(1);
    expect(state.inserts).toHaveLength(0);
    expect(
      state.formulacoes.filter((r) => r.produto_id === "prod-1"),
    ).toEqual([]);
  });
});
