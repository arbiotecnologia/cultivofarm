/**
 * Regras puras da tela de Monitoramento (/monitoramento-alertas).
 *
 * Datas de vencimento são datas civis (coluna `date` ou timestamp) e devem ser
 * comparadas no fuso operacional America/Sao_Paulo, nunca no fuso do navegador.
 * Comparar `new Date()` local com `parseISO("YYYY-MM-DD")` produz erro de um dia
 * para usuários fora de UTC-3, marcando itens como vencidos antes da hora.
 */

export const TIMEZONE_OPERACIONAL = "America/Sao_Paulo";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Data civil de "hoje" no fuso operacional, no formato YYYY-MM-DD. */
export function hojeSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_OPERACIONAL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Converte o valor armazenado em data civil YYYY-MM-DD.
 * - `YYYY-MM-DD` é preservado literalmente (não reinterpretado por fuso).
 * - Timestamps são convertidos para o dia correspondente em São Paulo.
 */
export function toDataCivil(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const v = value.trim();
  if (DATE_ONLY.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return hojeSaoPaulo(d);
}

/** Soma dias a uma data civil sem envolver fuso horário. */
export function somarDiasCivis(data: string, dias: number): string {
  const [y, m, d] = data.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

export type ClassificacaoVencimento =
  | "sem_data"
  | "vencido"
  | "hoje"
  | "amanha"
  | "em_dia";

export function classificarVencimento(
  dataVencimento: unknown,
  hoje: string,
): ClassificacaoVencimento {
  const data = toDataCivil(dataVencimento);
  if (!data) return "sem_data";
  if (data < hoje) return "vencido";
  if (data === hoje) return "hoje";
  if (data === somarDiasCivis(hoje, 1)) return "amanha";
  return "em_dia";
}

export const ROTULO_VENCIMENTO: Record<ClassificacaoVencimento, string> = {
  sem_data: "Sem data",
  vencido: "Vencido",
  hoje: "Vence hoje",
  amanha: "Vence amanhã",
  em_dia: "Em dia",
};

export type FiltroAlerta = "all" | "overdue" | "expiring";

/** Busca tolerante a caixa, acentuação de espaços e campos ausentes. */
export function matchTextoAlerta(campos: unknown[], termo: string): boolean {
  const t = (termo ?? "").trim().toLowerCase();
  if (t === "") return true;
  return campos.some(
    (c) => typeof c === "string" && c.toLowerCase().includes(t),
  );
}

export function textoOuTraco(v: unknown): string {
  if (typeof v === "string" && v.trim() !== "") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "—";
}

export interface AlertaBase {
  data_vencimento?: unknown;
  descricao?: unknown;
  [k: string]: unknown;
}

export function camposBuscaveis(alerta: any): unknown[] {
  return [
    alerta?.talhoes?.fazendas?.clientes?.nome,
    alerta?.fazendas?.nome,
    alerta?.talhoes?.nome,
    alerta?.descricao,
    alerta?.tipo_alerta,
  ];
}

export function correspondeFiltro(
  dataVencimento: unknown,
  filtro: FiltroAlerta,
  hoje: string,
): boolean {
  if (filtro === "all") return true;
  const c = classificarVencimento(dataVencimento, hoje);
  if (filtro === "overdue") return c === "vencido";
  return c === "hoje" || c === "amanha";
}

export function filtrarAlertas<T extends AlertaBase>(
  alertas: T[],
  opcoes: { busca: string; filtro: FiltroAlerta; hoje: string },
): T[] {
  return alertas.filter(
    (a) =>
      matchTextoAlerta(camposBuscaveis(a), opcoes.busca) &&
      correspondeFiltro(a.data_vencimento, opcoes.filtro, opcoes.hoje),
  );
}

export interface IndicadoresMonitoramento {
  vencidos: number;
  vencendo: number;
  total: number;
}

/**
 * Indicadores calculados sobre a MESMA coleção exibida na lista, garantindo
 * coerência entre cartões, busca e filtro ativo.
 */
export function calcularIndicadores<T extends AlertaBase>(
  alertas: T[],
  hoje: string,
): IndicadoresMonitoramento {
  let vencidos = 0;
  let vencendo = 0;
  for (const a of alertas) {
    const c = classificarVencimento(a.data_vencimento, hoje);
    if (c === "vencido") vencidos += 1;
    else if (c === "hoje" || c === "amanha") vencendo += 1;
  }
  return { vencidos, vencendo, total: alertas.length };
}

/** Só itens ainda em monitoramento podem ser reprogramados. */
export const STATUS_ABERTO_MONITORAMENTO = "monitoramento";

export function podeReprogramar(status: unknown): boolean {
  return status === STATUS_ABERTO_MONITORAMENTO;
}

export interface ResultadoValidacaoData {
  ok: boolean;
  erro?: string;
}

export function validarNovaData(
  novaData: unknown,
  hoje: string,
  dataAtual?: unknown,
): ResultadoValidacaoData {
  if (typeof novaData !== "string" || novaData.trim() === "") {
    return { ok: false, erro: "Selecione a nova data de reavaliação." };
  }
  const data = novaData.trim();
  if (!DATE_ONLY.test(data)) {
    return { ok: false, erro: "Data inválida. Use o seletor de data." };
  }
  const [y, m, d] = data.split("-").map(Number);
  const valida =
    m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100;
  if (!valida) return { ok: false, erro: "Data inválida. Use o seletor de data." };
  if (data < hoje) {
    return { ok: false, erro: "A nova data não pode ser anterior a hoje." };
  }
  const atual = toDataCivil(dataAtual);
  if (atual && atual === data) {
    return { ok: false, erro: "A nova data é igual à data atual do monitoramento." };
  }
  return { ok: true };
}
