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

  it("desempata por seq DESC quando created_at empata", () => {
    const empate = [
      { id: "x", created_at: "2026-05-01T10:00:00Z", seq: 1, resultado: "aprovado" },
      { id: "y", created_at: "2026-05-01T10:00:00Z", seq: 2, resultado: "reprovado" },
    ];
    expect(ultimoCQ(empate)?.id).toBe("y");
  });

  it("desempata por id quando não há seq nem diferença de data", () => {
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

  it("a página não usa mais janela de 90 dias nem limite fixo de 200", () => {
    expect(page).not.toMatch(/90 \* 24 \* 60 \* 60 \* 1000/);
    expect(page).not.toMatch(/\.limit\(200\)/);
    expect(page).toMatch(/count: "exact"/);
    expect(page).toMatch(/\.range\(from, to\)/);
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

  it("é compatível com o SQL Editor (sem metacomandos psql)", () => {
    expect(sql).not.toMatch(/^\s*\\/m);
  });

  it("revoga grants diretos e remove o gatilho legado", () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public\.envase FROM anon, authenticated/);
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_envase_avanca_os ON public\.envase/);
  });

  it("cria as três constraints validadas", () => {
    expect(sql).toMatch(/envase_quantidade_positiva/);
    expect(sql).toMatch(/envase_volume_unitario_positivo/);
    expect(sql).toMatch(/envase_embalagem_volume_coerente/);
    expect(sql).toMatch(/20000/);
  });

  it("não mexe em RLS nem em policies", () => {
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/i);
  });
});
