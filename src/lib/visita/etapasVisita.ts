/**
 * Máquina de etapas da Visita Técnica.
 *
 * Fonte única e pura (sem React, sem rede) da ordem em que os requisitos
 * bloqueiam o fluxo. A regra é simples e sempre na mesma ordem:
 *
 *   1. identificação (cliente → fazenda → talhão → data válida)
 *   2. visita persistida (existe registro no servidor)
 *   3. check-in
 *   4. diagnóstico (problema + descrição + % da área válida)
 *   5. desfecho (próximo passo e seus campos obrigatórios)
 *
 * Etapas dependentes (check-in, evidências, PDF, envio, finalização) só ficam
 * acionáveis quando a visita existe e os requisitos anteriores estão válidos.
 * A mensagem exibida é sempre a do PRIMEIRO requisito bloqueante, nunca a de
 * uma etapa posterior.
 */

export type EtapaVisita =
  | "identificacao"
  | "checkin"
  | "diagnostico"
  | "evidencias"
  | "encerramento";

export interface RequisitoVisita {
  codigo: string;
  mensagem: string;
  /** Aba/seção para onde levar o usuário. */
  etapa: EtapaVisita;
}

export interface DiagnosticoEtapa {
  problema?: string | null;
  descricao?: string | null;
  incidencia?: string | number | null;
}

export interface EncerramentoEtapa {
  proximoPasso?: string | null;
  dataProximaVisita?: string | null;
  monitoramentoItens?: unknown[] | null;
  osItens?: Array<{
    tipo?: string;
    produtoId?: string | null;
    microrganismoId?: string | null;
    doseMlHa?: string | number | null;
    areaHa?: string | number | null;
  }> | null;
  osDataAplicacao?: string | null;
}

export interface EstadoVisita {
  /** Visita ainda não persistida (rota /visita-tecnica/nova). */
  isNew: boolean;
  clienteId?: string | null;
  fazendaId?: string | null;
  talhaoId?: string | null;
  /** Data da visita em DD/MM/YYYY. */
  dataVisita?: string | null;
  temCheckin: boolean;
  diagnosticos: DiagnosticoEtapa[];
  encerramento: EncerramentoEtapa;
  /** Visita já finalizada (status diferente de rascunho). */
  isFinalized?: boolean;
}

export const PERCENTUAL_MIN = 0;
export const PERCENTUAL_MAX = 100;

/** A % da área afetada é opcional, mas quando informada precisa estar em 0–100. */
export function isPercentualAreaValido(valor: string | number | null | undefined): boolean {
  if (valor === null || valor === undefined || valor === "") return true;
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  if (!Number.isFinite(n)) return false;
  return n >= PERCENTUAL_MIN && n <= PERCENTUAL_MAX;
}

/** Limita a % da área afetada à faixa 0–100 preservando campo vazio. */
export function clampPercentualArea(valor: string): string {
  if (valor === "") return "";
  const n = Number(valor.replace(",", "."));
  if (!Number.isFinite(n)) return "";
  if (n < PERCENTUAL_MIN) return String(PERCENTUAL_MIN);
  if (n > PERCENTUAL_MAX) return String(PERCENTUAL_MAX);
  return valor;
}

/** Data DD/MM/YYYY existente e real. */
export function isDataVisitaValida(dataBR: string | null | undefined): boolean {
  if (!dataBR || !/^\d{2}\/\d{2}\/\d{4}$/.test(dataBR)) return false;
  const [d, m, y] = dataBR.split("/").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

const naoVazio = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/** Requisitos da identificação, na ordem do cascateamento. */
function requisitosIdentificacao(e: EstadoVisita): RequisitoVisita[] {
  const r: RequisitoVisita[] = [];
  if (!naoVazio(e.clienteId)) {
    r.push({ codigo: "CLIENTE_OBRIGATORIO", mensagem: "Selecione o cliente da visita.", etapa: "identificacao" });
    return r;
  }
  if (!naoVazio(e.fazendaId)) {
    r.push({ codigo: "FAZENDA_OBRIGATORIA", mensagem: "Selecione a fazenda do cliente.", etapa: "identificacao" });
    return r;
  }
  if (!naoVazio(e.talhaoId)) {
    r.push({ codigo: "TALHAO_OBRIGATORIO", mensagem: "Selecione o talhão da fazenda.", etapa: "identificacao" });
    return r;
  }
  if (!isDataVisitaValida(e.dataVisita)) {
    r.push({ codigo: "DATA_INVALIDA", mensagem: "Informe a data da visita no formato DD/MM/AAAA.", etapa: "identificacao" });
  }
  return r;
}

function requisitosDiagnostico(e: EstadoVisita): RequisitoVisita[] {
  const r: RequisitoVisita[] = [];
  const temProblema = e.diagnosticos.some((d) => naoVazio(d.problema));
  if (!temProblema) {
    r.push({ codigo: "DIAGNOSTICO_OBRIGATORIO", mensagem: "Informe pelo menos um diagnóstico antes de finalizar.", etapa: "diagnostico" });
    return r;
  }
  if (!naoVazio(e.diagnosticos[0]?.descricao)) {
    r.push({ codigo: "DESCRICAO_OBRIGATORIA", mensagem: "Preencha a descrição técnica antes de finalizar.", etapa: "diagnostico" });
    return r;
  }
  if (e.diagnosticos.some((d) => !isPercentualAreaValido(d.incidencia))) {
    r.push({
      codigo: "PERCENTUAL_AREA_INVALIDO",
      mensagem: "A % da área afetada deve ficar entre 0 e 100.",
      etapa: "diagnostico",
    });
  }
  return r;
}

function requisitosEncerramento(e: EstadoVisita): RequisitoVisita[] {
  const enc = e.encerramento || {};
  const r: RequisitoVisita[] = [];
  if (!naoVazio(enc.proximoPasso)) {
    r.push({ codigo: "PROXIMO_PASSO_OBRIGATORIO", mensagem: "Escolha o desfecho da visita antes de finalizar.", etapa: "encerramento" });
    return r;
  }
  if (enc.proximoPasso === "monitorar_area") {
    if (!enc.monitoramentoItens || enc.monitoramentoItens.length === 0) {
      r.push({ codigo: "MONITORAMENTO_SEM_ITENS", mensagem: "Selecione pelo menos um item para monitorar.", etapa: "encerramento" });
      return r;
    }
    if (!naoVazio(enc.dataProximaVisita)) {
      r.push({ codigo: "MONITORAMENTO_SEM_DATA", mensagem: "Informe a data da próxima avaliação.", etapa: "encerramento" });
    }
    return r;
  }
  if (enc.proximoPasso === "gerar_os") {
    if (!enc.osItens || enc.osItens.length === 0) {
      r.push({ codigo: "OS_SEM_ITENS", mensagem: "Adicione pelo menos um item (produto ou microrganismo) para gerar OS.", etapa: "encerramento" });
      return r;
    }
    const incompleto = enc.osItens.some((i) => {
      const semSelecao = i.tipo === "microrganismo" ? !i.microrganismoId : !i.produtoId;
      return semSelecao || !i.doseMlHa || !i.areaHa;
    });
    if (incompleto) {
      r.push({ codigo: "OS_ITEM_INCOMPLETO", mensagem: "Preencha todos os campos obrigatórios dos itens da OS.", etapa: "encerramento" });
      return r;
    }
    if (!naoVazio(enc.osDataAplicacao)) {
      r.push({ codigo: "OS_SEM_DATA", mensagem: "Informe a data desejada para aplicação.", etapa: "encerramento" });
    }
    return r;
  }
  if (enc.proximoPasso === "programar_nova_visita" && !naoVazio(enc.dataProximaVisita)) {
    r.push({ codigo: "RETORNO_SEM_DATA", mensagem: "Informe a data do retorno técnico.", etapa: "encerramento" });
  }
  return r;
}

/** Lista ordenada de tudo que ainda bloqueia a finalização. */
export function requisitosFinalizacao(e: EstadoVisita): RequisitoVisita[] {
  const ident = requisitosIdentificacao(e);
  if (ident.length) return ident;

  if (e.isNew) {
    return [{
      codigo: "VISITA_NAO_PERSISTIDA",
      mensagem: "Salve a visita antes de continuar.",
      etapa: "identificacao",
    }];
  }

  if (!e.temCheckin) {
    return [{
      codigo: "CHECKIN_OBRIGATORIO",
      mensagem: "Faça o check-in (ou justifique sem GPS) antes de finalizar.",
      etapa: "checkin",
    }];
  }

  const diag = requisitosDiagnostico(e);
  if (diag.length) return diag;

  return requisitosEncerramento(e);
}

/** Primeiro requisito realmente bloqueante — o que a mensagem deve apontar. */
export function primeiroBloqueio(e: EstadoVisita): RequisitoVisita | null {
  return requisitosFinalizacao(e)[0] ?? null;
}

export interface EtapasAcionaveis {
  /** Identificação mínima preenchida e data válida. */
  identificacaoOk: boolean;
  /** A visita existe no servidor. */
  visitaPersistida: boolean;
  podeCheckin: boolean;
  podeAnexarEvidencias: boolean;
  podeGerarPdf: boolean;
  podeEnviar: boolean;
  /**
   * O botão Finalizar pode ser clicado: a visita existe e ainda não está
   * finalizada. Requisitos pendentes NÃO desabilitam o botão — o clique
   * precisa devolver a mensagem do primeiro requisito bloqueante.
   */
  finalizarAcionavel: boolean;
  /** Todos os requisitos cumpridos: a finalização pode de fato ocorrer. */
  podeFinalizar: boolean;
  bloqueio: RequisitoVisita | null;
}

/**
 * O que pode ser acionado agora. PDF e envio exigem visita finalizada;
 * check-in e evidências exigem visita persistida; finalizar exige tudo.
 */
export function resolveEtapasAcionaveis(e: EstadoVisita): EtapasAcionaveis {
  const identificacaoOk = requisitosIdentificacao(e).length === 0;
  const visitaPersistida = !e.isNew;
  const bloqueio = primeiroBloqueio(e);
  const finalizada = !!e.isFinalized;

  return {
    identificacaoOk,
    visitaPersistida,
    podeCheckin: visitaPersistida && identificacaoOk,
    podeAnexarEvidencias: visitaPersistida,
    podeGerarPdf: visitaPersistida && finalizada,
    podeEnviar: visitaPersistida && finalizada,
    finalizarAcionavel: visitaPersistida && !finalizada,
    podeFinalizar: visitaPersistida && !finalizada && bloqueio === null,
    bloqueio,
  };
}
