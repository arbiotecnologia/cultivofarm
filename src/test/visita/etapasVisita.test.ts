/**
 * Visita Técnica — data pt-BR, ordem de validação, estados desabilitados,
 * limites 0–100 da área afetada e prevenção de dupla submissão.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatDateDisplay, formatDateTimeDisplay, formatDateToISO } from "@/lib/date-utils";
import {
  resolveEtapasAcionaveis,
  primeiroBloqueio,
  clampPercentualArea,
  isPercentualAreaValido,
  isDataVisitaValida,
  type EstadoVisita,
} from "@/lib/visita/etapasVisita";
import { resolveVisitaAcoes } from "@/lib/visita/acoesPersistencia";

const raiz = resolve(__dirname, "../../..");
const pagina = readFileSync(resolve(raiz, "src/pages/VisitaTecnica.tsx"), "utf8");

const base = (over: Partial<EstadoVisita> = {}): EstadoVisita => ({
  isNew: false,
  clienteId: "c1",
  fazendaId: "f1",
  talhaoId: "t1",
  dataVisita: "12/09/2026",
  temCheckin: true,
  diagnosticos: [{ problema: "Ferrugem", descricao: "Focos no terço médio", incidencia: "30" }],
  encerramento: { proximoPasso: "encerrar_atendimento" },
  ...over,
});

describe("Data pt-BR sem deslocamento de fuso", () => {
  it("não reinterpreta DD/MM/YYYY como mês/dia (12/09 não vira 09/12)", () => {
    expect(formatDateDisplay("12/09/2026")).toBe("12/09/2026");
    expect(formatDateDisplay("01/02/2026")).toBe("01/02/2026");
    expect(formatDateTimeDisplay("12/09/2026")).toBe("12/09/2026");
  });

  it("mantém datas puras ISO sem off-by-one", () => {
    expect(formatDateDisplay("2026-09-12")).toBe("12/09/2026");
    expect(formatDateDisplay("2026-01-01")).toBe("01/01/2026");
  });

  it("ida e volta DD/MM/YYYY ↔ ISO é estável", () => {
    expect(formatDateToISO("12/09/2026")).toBe("2026-09-12");
    expect(formatDateDisplay(formatDateToISO("12/09/2026"))).toBe("12/09/2026");
  });

  it("o cabeçalho usa o mesmo formatador pt-BR da data da visita", () => {
    expect(pagina).toContain("dataVisita ? formatDateDisplay(dataVisita) : null");
  });

  it("valida data brasileira real", () => {
    expect(isDataVisitaValida("12/09/2026")).toBe(true);
    expect(isDataVisitaValida("31/02/2026")).toBe(false);
    expect(isDataVisitaValida("2026-09-12")).toBe(false);
    expect(isDataVisitaValida("")).toBe(false);
  });
});

describe("Limites 0–100 da área afetada", () => {
  it("aceita apenas a faixa 0–100", () => {
    expect(isPercentualAreaValido("0")).toBe(true);
    expect(isPercentualAreaValido("100")).toBe(true);
    expect(isPercentualAreaValido("100.1")).toBe(false);
    expect(isPercentualAreaValido("-1")).toBe(false);
    expect(isPercentualAreaValido("")).toBe(true);
  });

  it("limita o valor digitado sem apagar campo vazio", () => {
    expect(clampPercentualArea("150")).toBe("100");
    expect(clampPercentualArea("-5")).toBe("0");
    expect(clampPercentualArea("42")).toBe("42");
    expect(clampPercentualArea("")).toBe("");
  });

  it("o campo da tela aplica o limite", () => {
    expect(pagina).toContain("clampPercentualArea(e.target.value)");
  });

  it("percentual fora da faixa bloqueia a finalização", () => {
    const b = primeiroBloqueio(base({ diagnosticos: [{ problema: "X", descricao: "Y", incidencia: "120" }] }));
    expect(b?.codigo).toBe("PERCENTUAL_AREA_INVALIDO");
  });
});

describe("Ordem de validação — primeiro requisito bloqueante", () => {
  it("cliente vem antes de fazenda, talhão e data", () => {
    expect(primeiroBloqueio(base({ clienteId: "" }))?.codigo).toBe("CLIENTE_OBRIGATORIO");
    expect(primeiroBloqueio(base({ fazendaId: "" }))?.codigo).toBe("FAZENDA_OBRIGATORIA");
    expect(primeiroBloqueio(base({ talhaoId: "" }))?.codigo).toBe("TALHAO_OBRIGATORIO");
    expect(primeiroBloqueio(base({ dataVisita: "" }))?.codigo).toBe("DATA_INVALIDA");
  });

  it("visita não salva bloqueia antes de check-in e diagnóstico", () => {
    const b = primeiroBloqueio(base({
      isNew: true,
      temCheckin: false,
      diagnosticos: [{ problema: "", descricao: "", incidencia: "" }],
    }));
    expect(b?.codigo).toBe("VISITA_NAO_PERSISTIDA");
  });

  it("check-in é cobrado antes do diagnóstico (defeito reproduzido)", () => {
    const b = primeiroBloqueio(base({
      temCheckin: false,
      diagnosticos: [{ problema: "", descricao: "", incidencia: "" }],
    }));
    expect(b?.codigo).toBe("CHECKIN_OBRIGATORIO");
    expect(b?.etapa).toBe("checkin");
  });

  it("diagnóstico vem antes da descrição técnica e do desfecho", () => {
    expect(primeiroBloqueio(base({
      diagnosticos: [{ problema: "", descricao: "", incidencia: "" }],
      encerramento: {},
    }))?.codigo).toBe("DIAGNOSTICO_OBRIGATORIO");
    expect(primeiroBloqueio(base({
      diagnosticos: [{ problema: "Ferrugem", descricao: "", incidencia: "" }],
      encerramento: {},
    }))?.codigo).toBe("DESCRICAO_OBRIGATORIA");
    expect(primeiroBloqueio(base({ encerramento: {} }))?.codigo).toBe("PROXIMO_PASSO_OBRIGATORIO");
  });

  it("desfechos com campos próprios são cobrados na ordem", () => {
    expect(primeiroBloqueio(base({ encerramento: { proximoPasso: "monitorar_area" } }))?.codigo)
      .toBe("MONITORAMENTO_SEM_ITENS");
    expect(primeiroBloqueio(base({
      encerramento: { proximoPasso: "monitorar_area", monitoramentoItens: ["a"] },
    }))?.codigo).toBe("MONITORAMENTO_SEM_DATA");
    expect(primeiroBloqueio(base({ encerramento: { proximoPasso: "gerar_os" } }))?.codigo)
      .toBe("OS_SEM_ITENS");
    expect(primeiroBloqueio(base({
      encerramento: { proximoPasso: "gerar_os", osItens: [{ tipo: "produto", produtoId: "p", doseMlHa: "1", areaHa: "2" }] },
    }))?.codigo).toBe("OS_SEM_DATA");
  });

  it("visita completa não tem bloqueio", () => {
    expect(primeiroBloqueio(base())).toBeNull();
  });

  it("a tela usa o primeiro bloqueio antes de consultar o servidor", () => {
    const corpo = pagina.slice(pagina.indexOf("const handleFinalize"));
    const iBloqueio = corpo.indexOf("etapas.bloqueio");
    const iConsulta = corpo.indexOf('.from("portal_solicitacoes")');
    expect(iBloqueio).toBeGreaterThan(-1);
    expect(iBloqueio).toBeLessThan(iConsulta);
  });
});

describe("Estados desabilitados das etapas dependentes", () => {
  it("visita nova: nada de check-in, evidências, PDF, envio ou finalização", () => {
    const e = resolveEtapasAcionaveis(base({ isNew: true, temCheckin: false }));
    expect(e.visitaPersistida).toBe(false);
    expect(e.podeCheckin).toBe(false);
    expect(e.podeAnexarEvidencias).toBe(false);
    expect(e.podeGerarPdf).toBe(false);
    expect(e.podeEnviar).toBe(false);
    expect(e.finalizarAcionavel).toBe(false);
    expect(e.podeFinalizar).toBe(false);
  });

  it("visita nova não oferece a ação Finalizar", () => {
    const a = resolveVisitaAcoes({ isNew: true, status: null, uiMode: "editing" });
    expect(a.showSave).toBe(true);
    expect(a.showFinalize).toBe(false);
  });

  it("rascunho salvo libera check-in e evidências, mas não PDF/envio", () => {
    const e = resolveEtapasAcionaveis(base({ temCheckin: false }));
    expect(e.podeCheckin).toBe(true);
    expect(e.podeAnexarEvidencias).toBe(true);
    expect(e.podeGerarPdf).toBe(false);
    expect(e.podeEnviar).toBe(false);
    expect(e.finalizarAcionavel).toBe(true);
    expect(e.podeFinalizar).toBe(false);
  });

  it("check-in exige identificação completa", () => {
    expect(resolveEtapasAcionaveis(base({ talhaoId: "" })).podeCheckin).toBe(false);
  });

  it("PDF e envio só após finalizar", () => {
    const e = resolveEtapasAcionaveis(base({ isFinalized: true }));
    expect(e.podeGerarPdf).toBe(true);
    expect(e.podeEnviar).toBe(true);
    expect(e.finalizarAcionavel).toBe(false);
  });

  it("a tela aplica esses estados aos botões", () => {
    expect(pagina).toContain("disabled={generatingPdf || !etapas.podeGerarPdf}");
    expect(pagina).toContain("disabled={!etapas.podeEnviar}");
    expect(pagina).toContain("disabled={saveMutation.isPending || !etapas.finalizarAcionavel}");
  });
});

describe("Prevenção de dupla submissão e recuperação após falha", () => {
  it("finalização tem trava de clique único e salvamento em andamento", () => {
    expect(pagina).toContain("const finalizandoRef = useRef(false);");
    expect(pagina).toContain("if (finalizandoRef.current || saveMutation.isPending) return;");
    expect(pagina).toContain("finalizandoRef.current = false;");
  });

  it("salvar também ignora cliques repetidos", () => {
    expect(pagina).toContain("if (saveMutation.isPending) return;");
  });

  it("falha na finalização devolve mensagem tratada e libera nova tentativa", () => {
    const corpo = pagina.slice(pagina.indexOf("const handleFinalize"));
    expect(corpo).toContain("catch (e: any)");
    expect(corpo).toContain("translateError(");
    expect(corpo).toContain("} finally {");
  });
});

describe("Cascata cliente → fazenda → talhão", () => {
  it("trocar cliente limpa fazenda e talhão; trocar fazenda limpa talhão", () => {
    expect(pagina).toContain('setClienteId(v); setFazendaId(""); setTalhaoId("");');
    expect(pagina).toContain('setFazendaId(v); setTalhaoId("");');
  });

  it("seletores dependentes ficam desabilitados sem o pai", () => {
    expect(pagina).toContain("disabled={!clienteId}");
    expect(pagina).toContain("disabled={!fazendaId}");
  });
});
