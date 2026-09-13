import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  PAGINA_ENVASE,
  faixaDaPagina,
  totalDePaginas,
  validarPeriodo,
  ultimoCQ,
  ultimoCQAprovado,
  podeComplementar,
  volumeEnvasadoMl,
  saldoMl,
  quantidadeInteiraPositiva,
  validadeFutura,
  hojeLocalISO,
  carregarTudo,
  PAGINA_TECNICA,
} from "@/lib/envase/consulta";
import { defaultValidade, addMesesLocal, toISODateLocal } from "@/lib/envaseFormat";

describe("paginação server-side", () => {
  it("usa páginas de 50 registros", () => {
    expect(PAGINA_ENVASE).toBe(50);
    expect(faixaDaPagina(1)).toEqual({ from: 0, to: 49 });
    expect(faixaDaPagina(3)).toEqual({ from: 100, to: 149 });
    expect(faixaDaPagina(0)).toEqual({ from: 0, to: 49 });
  });

  it("calcula o total de páginas a partir da contagem exata", () => {
    expect(totalDePaginas(0)).toBe(1);
    expect(totalDePaginas(50)).toBe(1);
    expect(totalDePaginas(51)).toBe(2);
    expect(totalDePaginas(230)).toBe(5);
  });
});

describe("validação de período", () => {
  it("rejeita data inicial posterior à final", () => {
    const r = validarPeriodo("2026-09-10", "2026-09-01");
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/posterior/i);
  });
  it("aceita período vazio, parcial e ordenado", () => {
    expect(validarPeriodo("", "").valido).toBe(true);
    expect(validarPeriodo("2026-09-01", "").valido).toBe(true);
    expect(validarPeriodo("2026-09-01", "2026-09-01").valido).toBe(true);
  });
  it("rejeita datas malformadas", () => {
    expect(validarPeriodo("01/09/2026", "").valido).toBe(false);
  });
});

describe("último CQ determinístico", () => {
  const cqs = [
    { id: "a", created_at: "2026-01-01T10:00:00Z", resultado: "aprovado" },
    { id: "b", created_at: "2026-05-01T10:00:00Z", resultado: "reprovado" },
  ];

  it("escolhe o mais recente por created_at", () => {
    expect(ultimoCQ(cqs)?.id).toBe("b");
    expect(ultimoCQAprovado(cqs)).toBe(false);
  });

  it("usa seq DESC como desempate primário (coluna existe em produção)", () => {
    const empate = [
      { id: "x", created_at: "2026-05-01T10:00:00Z", seq: 1, resultado: "aprovado" },
      { id: "y", created_at: "2026-05-01T10:00:00Z", seq: 2, resultado: "reprovado" },
    ];
    expect(ultimoCQ(empate)?.id).toBe("y");
  });

  it("seq vence data_analise quando created_at empata", () => {
    const empate = [
      { id: "x", created_at: "2026-05-01T10:00:00Z", seq: 5, data_analise: "2026-01-01", resultado: "reprovado" },
      { id: "y", created_at: "2026-05-01T10:00:00Z", seq: 1, data_analise: "2026-04-01", resultado: "aprovado" },
    ];
    expect(ultimoCQ(empate)?.id).toBe("x");
  });

  it("fallback defensivo por id quando não há seq nem diferença de data", () => {
    const empate = [
      { id: "a", created_at: "2026-05-01T10:00:00Z", resultado: "aprovado" },
      { id: "z", created_at: "2026-05-01T10:00:00Z", resultado: "reprovado" },
    ];
    expect(ultimoCQ(empate)?.id).toBe("z");
  });

  it("sem CQ não aprova", () => {
    expect(ultimoCQ([])).toBeNull();
    expect(ultimoCQAprovado(null)).toBe(false);
  });
});

describe("elegibilidade a complemento", () => {
  const aprovado = [{ id: "1", created_at: "2026-05-01T10:00:00Z", resultado: "aprovado" }];

  it("não libera com CQ aprovado antigo seguido de reprovação", () => {
    const cqs = [
      ...aprovado,
      { id: "2", created_at: "2026-06-01T10:00:00Z", resultado: "reprovado" },
    ];
    expect(podeComplementar({ status: "aprovado", cqs, saldoMl: 5000, jaIniciado: true })).toBe(false);
  });

  it("exige lote aprovado, envase iniciado e saldo positivo", () => {
    expect(podeComplementar({ status: "em_producao", cqs: aprovado, saldoMl: 5000, jaIniciado: true })).toBe(false);
    expect(podeComplementar({ status: "aprovado", cqs: aprovado, saldoMl: 5000, jaIniciado: false })).toBe(false);
    expect(podeComplementar({ status: "aprovado", cqs: aprovado, saldoMl: 0, jaIniciado: true })).toBe(false);
    expect(podeComplementar({ status: "aprovado", cqs: aprovado, saldoMl: 5000, jaIniciado: true })).toBe(true);
  });
});

describe("carregarTudo (sem teto silencioso)", () => {
  it("usa página técnica e percorre até esgotar", async () => {
    expect(PAGINA_TECNICA).toBe(1000);
    const chamadas: Array<[number, number]> = [];
    const total = 2500;
    const itens = Array.from({ length: total }, (_, i) => ({ id: i }));
    const res = await carregarTudo<{ id: number }>(async (from, to) => {
      chamadas.push([from, to]);
      return itens.slice(from, to + 1);
    }, 1000);
    expect(res).toHaveLength(total);
    expect(chamadas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("encerra quando a última página vem cheia e a seguinte vem vazia", async () => {
    const itens = Array.from({ length: 20 }, (_, i) => i);
    const res = await carregarTudo<number>(async (from, to) => itens.slice(from, to + 1), 10);
    expect(res).toHaveLength(20);
  });

  it("erra explicitamente em vez de omitir registros", async () => {
    await expect(
      carregarTudo<number>(async () => [1, 2], 2, 3),
    ).rejects.toThrow(/nenhum registro foi omitido/i);
  });
});

describe("saldo", () => {
  it("soma volume envasado ignorando valores não finitos", () => {
    expect(volumeEnvasadoMl([
      { volume_por_unidade: 1000, quantidade: 2 },
      { volume_por_unidade: null, quantidade: 3 },
    ])).toBe(2000);
    expect(saldoMl(10000, [{ volume_por_unidade: 5000, quantidade: 1 }])).toBe(5000);
    expect(saldoMl(null, [])).toBe(0);
  });
});

describe("quantidade e validade", () => {
  it("aceita apenas inteiros positivos", () => {
    expect(quantidadeInteiraPositiva("3")).toBe(3);
    expect(quantidadeInteiraPositiva("0")).toBeNull();
    expect(quantidadeInteiraPositiva("-2")).toBeNull();
    expect(quantidadeInteiraPositiva("1.5")).toBeNull();
    expect(quantidadeInteiraPositiva("abc")).toBeNull();
    expect(quantidadeInteiraPositiva(Infinity)).toBeNull();
  });

  it("exige validade estritamente futura", () => {
    expect(validadeFutura("2026-09-14", "2026-09-13")).toBe(true);
    expect(validadeFutura("2026-09-13", "2026-09-13")).toBe(false);
    expect(validadeFutura("2026-09-12", "2026-09-13")).toBe(false);
    expect(validadeFutura("", "2026-09-13")).toBe(false);
  });

  it("hojeLocalISO usa calendário local", () => {
    expect(hojeLocalISO(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("defaultValidade", () => {
  it("não desloca o dia por UTC", () => {
    expect(defaultValidade(new Date(2026, 2, 1, 23, 30))).toBe("2026-09-01");
  });
  it("não faz rollover no fim do mês", () => {
    expect(defaultValidade(new Date(2026, 7, 31))).toBe("2027-02-28");
    expect(addMesesLocal(new Date(2026, 0, 31), 1).getMonth()).toBe(1);
    expect(toISODateLocal(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("contratos do módulo", () => {
  const page = readFileSync("src/pages/EnvasePage.tsx", "utf8");
  const dialog = readFileSync("src/components/cockpit/RegistrarEnvaseDialog.tsx", "utf8");

  it("a página não usa janela de 90 dias nem nenhum limite silencioso", () => {
    expect(page).not.toMatch(/90 \* 24 \* 60 \* 60 \* 1000/);
    expect(page).not.toMatch(/\.limit\(/);
    expect(page).toMatch(/count: "exact"/);
    expect(page).toMatch(/\.range\(from, to\)/);
  });

  it("consultas auxiliares usam carregarTudo e a busca é debounced", () => {
    expect(page).toMatch(/carregarTudo</);
    expect(page).toMatch(/useDebounce\(search\.trim\(\), \d+\)/);
    expect(page).toMatch(/const termo = buscaDebounced;/);
  });

  it("inclui seq no select de controle de qualidade", () => {
    expect(page).toMatch(/controle_qualidade\(id, seq, created_at, data_analise, resultado\)/);
  });

  it("expõe falha das listas auxiliares em vez de exibir ausência de opções", () => {
    expect(page).toMatch(/erroAuxiliares/);
    expect(page).toMatch(/Falha ao carregar lotes com saldo e produtos/);
  });

  it("a página tem estados de carga, erro com retry e rótulos acessíveis", () => {
    expect(page).toMatch(/Carregando envases/);
    expect(page).toMatch(/Tentar novamente/);
    expect(page).toMatch(/htmlFor="envase-busca"/);
    expect(page).toMatch(/htmlFor="envase-produto"/);
    expect(page).toMatch(/htmlFor="envase-de"/);
    expect(page).toMatch(/htmlFor="envase-ate"/);
  });

  it("o diálogo do Cockpit não altera lotes.volume_produzido", () => {
    expect(dialog).not.toMatch(/volume_produzido:/);
    expect(dialog).not.toMatch(/from\("lotes"\)[\s\S]{0,80}\.update/);
    expect(dialog).toMatch(/Cockpit Laboratório/);
  });
});

describe("SQL de hardening do envase", () => {
  const sql = readFileSync("restoration/envase/sql/20260913060000_envase_hardening.sql", "utf8");
  const rollback = readFileSync("restoration/envase/sql/90-rollback.sql", "utf8");

  it("é compatível com o SQL Editor (sem metacomandos psql)", () => {
    expect(sql).not.toMatch(/^\s*\\/m);
    expect(rollback).not.toMatch(/^\s*\\/m);
  });

  it("usa os nomes de constraint exatos aplicados em produção", () => {
    expect(sql).toMatch(/envase_quantidade_positiva/);
    expect(sql).toMatch(/envase_volume_valido/);
    expect(sql).toMatch(/envase_embalagem_volume_coerente/);
    expect(sql).not.toMatch(/envase_volume_unitario_positivo/);
    expect(sql).toMatch(/20000/);
  });

  it("aplica NOT NULL nas duas colunas", () => {
    expect(sql).toMatch(/ALTER COLUMN quantidade SET NOT NULL/);
    expect(sql).toMatch(/ALTER COLUMN volume_por_unidade SET NOT NULL/);
  });

  it("deixa anon sem grant, authenticated só com SELECT e remove o gatilho legado", () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.envase FROM anon/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public\.envase FROM authenticated/);
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_envase_avanca_os ON public\.envase/);
  });

  it("o pós-check comprova os seis pontos, RLS e o EXECUTE da RPC", () => {
    expect(sql).toMatch(/ENVASE_CONSTRAINTS_INCOMPLETAS/);
    expect(sql).toMatch(/ENVASE_NOT_NULL_INCOMPLETO/);
    expect(sql).toMatch(/ENVASE_ANON_COM_GRANT/);
    expect(sql).toMatch(/ENVASE_AUTHENTICATED_COM_ESCRITA/);
    expect(sql).toMatch(/ENVASE_AUTHENTICATED_SEM_SELECT/);
    expect(sql).toMatch(/ENVASE_TRIGGER_LEGADO_PRESENTE/);
    expect(sql).toMatch(/ENVASE_RLS_DESATIVADA/);
    expect(sql).toMatch(/ENVASE_RPC_SEM_EXECUTE_AUTHENTICATED/);
  });

  it("não mexe em RLS nem em policies", () => {
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/i);
    expect(rollback).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(rollback).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/i);
  });

  it("o rollback restaura exatamente o estado anterior, sem trechos comentados", () => {
    expect(rollback).toMatch(/DROP CONSTRAINT IF EXISTS envase_embalagem_volume_coerente/);
    expect(rollback).toMatch(/DROP CONSTRAINT IF EXISTS envase_volume_valido/);
    expect(rollback).toMatch(/DROP CONSTRAINT IF EXISTS envase_quantidade_positiva/);
    expect(rollback).toMatch(/ALTER COLUMN quantidade DROP NOT NULL/);
    expect(rollback).toMatch(/ALTER COLUMN volume_por_unidade DROP NOT NULL/);
    expect(rollback).toMatch(/CREATE TRIGGER trg_envase_avanca_os[\s\S]*public\.fn_envase_avanca_os\(\)/);
    expect(rollback).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public\.envase TO anon;/);
    expect(rollback).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public\.envase TO authenticated;/);
    expect(rollback).toMatch(/REABRE O RISCO/);
    expect(rollback).not.toMatch(/^--\s*GRANT/m);
  });
});
