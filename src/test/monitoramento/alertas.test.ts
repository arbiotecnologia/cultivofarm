import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  hojeSaoPaulo,
  toDataCivil,
  somarDiasCivis,
  classificarVencimento,
  filtrarAlertas,
  calcularIndicadores,
  matchTextoAlerta,
  textoOuTraco,
  podeReprogramar,
  validarNovaData,
} from "@/lib/monitoramento/alertas";

const HOJE = "2026-09-12";

const alerta = (data: string | null, extras: Record<string, unknown> = {}) => ({
  id: Math.random().toString(36).slice(2),
  data_vencimento: data,
  status: "monitoramento",
  ...extras,
});

describe("monitoramento — datas em America/Sao_Paulo", () => {
  it("usa o dia civil de São Paulo, não o do navegador", () => {
    // 2026-09-13T01:00Z ainda é 12/09 em São Paulo (UTC-3)
    expect(hojeSaoPaulo(new Date("2026-09-13T01:00:00Z"))).toBe("2026-09-12");
    expect(hojeSaoPaulo(new Date("2026-09-13T04:00:00Z"))).toBe("2026-09-13");
  });

  it("preserva datas puras YYYY-MM-DD sem deslocamento", () => {
    expect(toDataCivil("2026-09-12")).toBe("2026-09-12");
    expect(toDataCivil("2026-09-12T23:30:00Z")).toBe("2026-09-12");
    expect(toDataCivil("")).toBeNull();
    expect(toDataCivil(null)).toBeNull();
  });

  it("soma dias sem envolver fuso", () => {
    expect(somarDiasCivis("2026-09-30", 1)).toBe("2026-10-01");
    expect(somarDiasCivis("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("classifica vencido, hoje, amanhã, em dia e sem data", () => {
    expect(classificarVencimento("2026-09-11", HOJE)).toBe("vencido");
    expect(classificarVencimento("2026-09-12", HOJE)).toBe("hoje");
    expect(classificarVencimento("2026-09-13", HOJE)).toBe("amanha");
    expect(classificarVencimento("2026-09-20", HOJE)).toBe("em_dia");
    expect(classificarVencimento(null, HOJE)).toBe("sem_data");
  });
});

describe("monitoramento — filtros e indicadores", () => {
  const lista = [
    alerta("2026-09-10", { descricao: "Mancha alvo", fazendas: { nome: "Boa Vista" } }),
    alerta("2026-09-12", { descricao: "Ferrugem" }),
    alerta("2026-09-13", { descricao: "Lagarta" }),
    alerta("2026-09-30", { descricao: "Rotina" }),
    alerta(null, { descricao: "Sem prazo" }),
  ];

  it("filtro Todos devolve tudo", () => {
    expect(filtrarAlertas(lista, { busca: "", filtro: "all", hoje: HOJE })).toHaveLength(5);
  });

  it("filtro Vencidos devolve apenas datas passadas", () => {
    const r = filtrarAlertas(lista, { busca: "", filtro: "overdue", hoje: HOJE });
    expect(r.map((a) => a.data_vencimento)).toEqual(["2026-09-10"]);
  });

  it("filtro Vencendo devolve hoje e amanhã", () => {
    const r = filtrarAlertas(lista, { busca: "", filtro: "expiring", hoje: HOJE });
    expect(r.map((a) => a.data_vencimento)).toEqual(["2026-09-12", "2026-09-13"]);
  });

  it("itens sem data não entram em Vencidos nem em Vencendo", () => {
    const semData = [alerta(null)];
    expect(filtrarAlertas(semData, { busca: "", filtro: "overdue", hoje: HOJE })).toHaveLength(0);
    expect(filtrarAlertas(semData, { busca: "", filtro: "expiring", hoje: HOJE })).toHaveLength(0);
  });

  it("busca combina com o filtro ativo", () => {
    const r = filtrarAlertas(lista, { busca: "boa vista", filtro: "overdue", hoje: HOJE });
    expect(r).toHaveLength(1);
  });

  it("indicadores são coerentes com a coleção exibida", () => {
    const visiveis = filtrarAlertas(lista, { busca: "", filtro: "expiring", hoje: HOJE });
    expect(calcularIndicadores(visiveis, HOJE)).toEqual({ vencidos: 0, vencendo: 2, total: 2 });
    expect(calcularIndicadores(lista, HOJE)).toEqual({ vencidos: 1, vencendo: 2, total: 5 });
  });

  it("busca tolera caixa, espaços e campos ausentes", () => {
    expect(matchTextoAlerta(["Talhão 3", null], " talhão ")).toBe(true);
    expect(matchTextoAlerta([null, undefined], "")).toBe(true);
    expect(matchTextoAlerta([null], "x")).toBe(false);
  });

  it("exibe traço para campos ausentes", () => {
    expect(textoOuTraco(null)).toBe("—");
    expect(textoOuTraco("   ")).toBe("—");
    expect(textoOuTraco("Fazenda")).toBe("Fazenda");
  });
});

describe("monitoramento — guardas da reprogramação", () => {
  it("só permite reprogramar item ainda em monitoramento", () => {
    expect(podeReprogramar("monitoramento")).toBe(true);
    expect(podeReprogramar("resolvido")).toBe(false);
    expect(podeReprogramar(undefined)).toBe(false);
  });

  it("recusa data vazia, inválida ou anterior a hoje", () => {
    expect(validarNovaData("", HOJE).ok).toBe(false);
    expect(validarNovaData("12/09/2026", HOJE).ok).toBe(false);
    expect(validarNovaData("2026-09-11", HOJE).erro).toMatch(/anterior a hoje/i);
  });

  it("aceita hoje e datas futuras", () => {
    expect(validarNovaData("2026-09-12", HOJE).ok).toBe(true);
    expect(validarNovaData("2026-10-01", HOJE).ok).toBe(true);
  });

  it("recusa nova data igual à data atual do monitoramento", () => {
    expect(validarNovaData("2026-09-20", HOJE, "2026-09-20").ok).toBe(false);
    expect(validarNovaData("2026-09-21", HOJE, "2026-09-20").ok).toBe(true);
  });
});

describe("monitoramento — integração na página", () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "src/pages/MonitoramentoAlertas.tsx"),
    "utf8",
  );

  it("exibe estado de erro com retry", () => {
    expect(src).toContain("Tentar novamente");
    expect(src).toContain("isError");
  });

  it("usa os helpers de fuso operacional em vez de data local", () => {
    expect(src).toContain("hojeSaoPaulo");
    expect(src).not.toContain("setHours(0,0,0,0)");
    expect(src).not.toContain("parseISO");
  });

  it("condiciona a reprogramação ao status (corrida entre usuários)", () => {
    expect(src).toContain('.eq("status", "monitoramento")');
    expect(src).toContain("já foi concluído ou alterado por outro usuário");
  });

  it("bloqueia duplo clique e data inválida no diálogo", () => {
    expect(src).toContain("if (rescheduleMutation.isPending) return;");
    expect(src).toContain("!validacaoData.ok");
  });

  it("não navega para roteiro sem visita de origem", () => {
    expect(src).toContain("disabled={!a.registro_origem_id}");
  });
});
