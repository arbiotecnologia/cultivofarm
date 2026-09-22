/**
 * Regras puras da tela Contas a Pagar.
 *
 * Alinhado ao servidor (banco canônico):
 *   saldo = original_amount + interest_amount + penalty_amount
 *           - discount_amount - paid_amount   (nunca negativo)
 *
 * Datas de negócio são dias civis em America/Sao_Paulo:
 * - Atraso: SOMENTE due_date < hoje (vencer hoje nunca é atraso).
 * - "Vencendo em 7 dias": hoje <= due_date <= hoje+7 (inclusivos).
 * - "Pago no mês": soma dos eventos payable_payments.amount_paid por
 *   payment_date em [1º dia do mês, 1º dia do mês seguinte), incluindo
 *   parciais e estornos (linhas negativas). Nunca usa paid_at da parcela.
 */

import {
  classificarParcela,
  inicioDoMes,
  inicioDoProximoMes,
  toDataCivil,
} from "@/lib/financeiro/contasReceber";

export { classificarParcela, inicioDoMes, inicioDoProximoMes };

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const cent = (v: number) => Math.round(v * 100) / 100;

export interface ParcelaPagarKpi {
  original_amount?: unknown;
  paid_amount?: unknown;
  interest_amount?: unknown;
  penalty_amount?: unknown;
  discount_amount?: unknown;
  due_date?: unknown;
  status?: unknown;
}

export interface PagamentoPagarKpi {
  amount_paid?: unknown;
  payment_date?: unknown;
}

/** Saldo em aberto de uma parcela a pagar (nunca negativo). */
export function saldoParcelaPagar(p: ParcelaPagarKpi): number {
  return Math.max(
    0,
    cent(
      num(p.original_amount) + num(p.interest_amount) + num(p.penalty_amount) -
        num(p.discount_amount) - num(p.paid_amount),
    ),
  );
}

export interface ResumoSaldoPagar {
  original: number;
  pago: number;
  juros: number;
  multa: number;
  desconto: number;
  saldo: number;
}

/**
 * Resumo consolidado da conta a pagar. Parcelas canceladas são ignoradas.
 * O saldo usa exatamente a mesma fórmula dos KPIs (saldoParcelaPagar).
 */
export function resumoSaldoPagar(parcelas: ParcelaPagarKpi[]): ResumoSaldoPagar {
  const r = { original: 0, pago: 0, juros: 0, multa: 0, desconto: 0, saldo: 0 };
  for (const p of parcelas) {
    if (String(p.status ?? "") === "CANCELED") continue;
    r.original += num(p.original_amount);
    r.pago += num(p.paid_amount);
    r.juros += num(p.interest_amount);
    r.multa += num(p.penalty_amount);
    r.desconto += num(p.discount_amount);
    r.saldo += saldoParcelaPagar(p);
  }
  return {
    original: cent(r.original),
    pago: cent(r.pago),
    juros: cent(r.juros),
    multa: cent(r.multa),
    desconto: cent(r.desconto),
    saldo: cent(r.saldo),
  };
}

export interface KpisPagar {
  aberto: number;
  vencido: number;
  vence7: number;
  pagoMes: number;
}

/**
 * KPIs derivados. `parcelas` alimenta aberto/vencido/vence7 (PAID e CANCELED
 * ficam fora); `pagamentos` alimenta pagoMes por evento de caixa.
 */
export function calcularKpisPagar(
  parcelas: ParcelaPagarKpi[],
  pagamentos: PagamentoPagarKpi[],
  hoje: string,
): KpisPagar {
  let aberto = 0;
  let vencido = 0;
  let vence7 = 0;

  for (const p of parcelas) {
    const status = String(p.status ?? "");
    if (status === "CANCELED" || status === "PAID") continue;
    const saldo = saldoParcelaPagar(p);
    aberto += saldo;
    const classe = classificarParcela(p.due_date, hoje);
    if (classe === "vencida") vencido += saldo;
    else if (classe === "vence_hoje" || classe === "vence_em_7_dias") vence7 += saldo;
  }

  const de = inicioDoMes(hoje);
  const ate = inicioDoProximoMes(hoje);
  let pagoMes = 0;
  for (const ev of pagamentos) {
    const data = toDataCivil(ev.payment_date);
    if (!data || data < de || data >= ate) continue;
    pagoMes += num(ev.amount_paid);
  }

  return { aberto: cent(aberto), vencido: cent(vencido), vence7: cent(vence7), pagoMes: cent(pagoMes) };
}

/** Chaves de consulta REAIS afetadas por cancelamento/baixa nesta tela. */
export const CHAVES_INVALIDACAO_PAGAR = [
  "ap-list",
  "ap-kpi-installments",
  "ap-kpi-payments",
  "ap-docs-count",
  "fin-conta",
  "fin-inst",
  "fin-payments",
  "fin-history",
  "fin-dashboard-summary",
  "fin-rankings",
  "fin-alerts",
  "financeiro-dashboard",
  "fluxo-caixa",
  "drill-pagar",
  "drill-pagamentos",
  "dre",
  "dre-detail",
] as const;

/* ------------------------------------------------------------------ *
 * Registro de pagamento (baixa payable) — regras puras.
 *
 * Saldo válido da parcela:
 *   original + juros acum. + multa acum. - desconto acum. - pago
 *   + novos juros + nova multa - novo desconto
 * ------------------------------------------------------------------ */

import { dataCivilValida, maisDeDuasCasas, TOLERANCIA } from "@/lib/financeiro/baixaRecebimento";

export { dataCivilValida, maisDeDuasCasas };

export interface AjustesBaixaPagar {
  interest_amount?: unknown;
  penalty_amount?: unknown;
  discount_amount?: unknown;
}

export interface AcumuladosPagar {
  original: number;
  pago: number;
  juros: number;
  multa: number;
  desconto: number;
}

export function acumuladosParcelaPagar(p: ParcelaPagarKpi | null | undefined): AcumuladosPagar {
  return {
    original: num(p?.original_amount),
    pago: num(p?.paid_amount),
    juros: num(p?.interest_amount),
    multa: num(p?.penalty_amount),
    desconto: num(p?.discount_amount),
  };
}

/** Saldo devido considerando acumulados da parcela e ajustes desta baixa. */
export function calcularSaldoPagavel(
  p: ParcelaPagarKpi | null | undefined,
  ajustes: AjustesBaixaPagar = {},
): number {
  const a = acumuladosParcelaPagar(p);
  return cent(
    a.original + a.juros + a.multa - a.desconto - a.pago +
      num(ajustes.interest_amount) + num(ajustes.penalty_amount) - num(ajustes.discount_amount),
  );
}

/** Erro originado de validação local (mensagem já segura para exibição). */
export class ErroBaixaPagarLocal extends Error {
  readonly origem = "local" as const;
}

export const MSG_PAGAMENTO_GENERICA = "Não foi possível concluir a operação. Tente novamente.";
export const MSG_PAGAMENTO_NAO_CONFIRMADO =
  "Não foi possível confirmar se o pagamento foi registrado. Confira a conta antes de tentar de novo.";
export const MSG_PAGAMENTO_COMPROVANTE_PENDENTE =
  "Pagamento registrado, comprovante pendente. Reenvie o comprovante — o pagamento não será lançado de novo.";

/** Estado incerto: timeout, rede, resposta inválida ou erro desconhecido após o envio. */
export class ErroBaixaIncerta extends Error {
  readonly origem = "incerto" as const;
  readonly exigeConferencia = true;
  constructor() {
    super(MSG_PAGAMENTO_NAO_CONFIRMADO);
    this.name = "ErroBaixaIncerta";
  }
}

const MENSAGENS_PAGAMENTO_REMOTO: Record<string, string> = {
  FIN_INVALID_AMOUNT: "Valor inválido para esta baixa. Confira valor, juros, multa e desconto.",
  FIN_IDEMPOTENCY_CONFLICT: "Este pagamento já foi registrado. Recarregue a lista antes de tentar de novo.",
  "23505": "Este pagamento já foi registrado. Recarregue a lista antes de tentar de novo.",
  "42501": "Você não tem permissão para registrar este pagamento.",
  "40001": "A parcela foi alterada por outra pessoa. Recarregue a lista e tente novamente.",
  P0002: "Parcela não encontrada. Recarregue a lista.",
  "23514": "A parcela não está em um estado que permita este pagamento.",
  "23503": "Existem vínculos que impedem registrar este pagamento.",
};

function textoErroPagar(erro: unknown): string {
  const partes: string[] = [];
  if (typeof erro === "string") partes.push(erro);
  else if (erro && typeof erro === "object") {
    const e = erro as Record<string, unknown>;
    for (const k of ["message", "details", "hint", "code", "error_code"]) {
      if (typeof e[k] === "string") partes.push(e[k] as string);
    }
  }
  return partes.join(" ");
}

/** Token da allowlist: FIN_* tem prioridade sobre SQLSTATE genérico. */
function tokenPagarConhecido(erro: unknown): string | null {
  const texto = textoErroPagar(erro);
  const fin = texto.match(/FIN_[A-Z_]+/)?.[0] ?? texto.match(/fin_[a-z_]+/)?.[0]?.toUpperCase();
  if (fin && MENSAGENS_PAGAMENTO_REMOTO[fin]) return fin;
  const e = (erro ?? {}) as { code?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  if (code && MENSAGENS_PAGAMENTO_REMOTO[code]) return code;
  const sqlstate = texto.match(/\b(23505|42501|40001|23514|23503|P0002)\b/)?.[0];
  return sqlstate && MENSAGENS_PAGAMENTO_REMOTO[sqlstate] ? sqlstate : null;
}

/** Mensagem segura: local mantém o texto tipado; remoto usa allowlist, nunca texto cru. */
export function mapearErroBaixaPagar(erro: unknown): string {
  if (erro instanceof ErroBaixaPagarLocal) return erro.message;
  if (erro instanceof ErroBaixaIncerta) return MSG_PAGAMENTO_NAO_CONFIRMADO;
  const token = tokenPagarConhecido(erro);
  return token ? MENSAGENS_PAGAMENTO_REMOTO[token] : MSG_PAGAMENTO_GENERICA;
}

export interface ClassificacaoBaixaPagar {
  mensagem: string;
  exigeConferencia: boolean;
}

/**
 * Classificação única: guarda local e erro de servidor conhecido são recusas
 * comprovadas (preservam edição); o resto é incerto e exige conferência.
 */
export function classificarErroBaixaPagar(erro: unknown): ClassificacaoBaixaPagar {
  if (erro instanceof ErroBaixaPagarLocal) return { mensagem: erro.message, exigeConferencia: false };
  if (erro instanceof ErroBaixaIncerta) {
    return { mensagem: MSG_PAGAMENTO_NAO_CONFIRMADO, exigeConferencia: true };
  }
  const token = tokenPagarConhecido(erro);
  if (token) return { mensagem: MENSAGENS_PAGAMENTO_REMOTO[token], exigeConferencia: false };
  return { mensagem: MSG_PAGAMENTO_NAO_CONFIRMADO, exigeConferencia: true };
}

export interface EntradaValidacaoBaixaPagar {
  parcela: ParcelaPagarKpi | null | undefined;
  form: {
    payment_date?: unknown;
    amount?: unknown;
    payment_method_id?: unknown;
    interest_amount?: unknown;
    penalty_amount?: unknown;
    discount_amount?: unknown;
  };
  metodosAtivos: string[];
  settingsCarregadas: boolean;
  exigeComprovante: boolean;
  temArquivo: boolean;
  temSessao: boolean;
}

export function validarBaixaPagar(e: EntradaValidacaoBaixaPagar): string | null {
  if (!e.temSessao) return "Sessão expirada. Entre novamente para registrar o pagamento.";
  if (!e.parcela) return "Parcela não selecionada.";
  if (!e.settingsCarregadas) return "Não foi possível carregar as configurações financeiras. Tente novamente.";
  if (!dataCivilValida(e.form.payment_date)) return "Informe uma data de pagamento válida.";

  const metodo = typeof e.form.payment_method_id === "string" ? e.form.payment_method_id : "";
  if (!metodo) return "Selecione a forma de pagamento.";
  if (!e.metodosAtivos.includes(metodo)) return "Forma de pagamento indisponível. Selecione outra.";

  for (const [campo, rotulo] of [
    ["interest_amount", "Juros"],
    ["penalty_amount", "Multa"],
    ["discount_amount", "Desconto"],
  ] as const) {
    const bruto = (e.form as Record<string, unknown>)[campo];
    const v = Number(bruto ?? 0);
    if (!Number.isFinite(v)) return `${rotulo}: informe um valor numérico válido.`;
    if (v < 0) return `${rotulo} não pode ser negativo.`;
    if (maisDeDuasCasas(bruto)) return `${rotulo}: use no máximo duas casas decimais.`;
  }

  const valor = Number(e.form.amount ?? 0);
  if (!Number.isFinite(valor)) return "Informe um valor numérico válido.";
  if (valor <= 0) return "O valor do pagamento deve ser maior que zero.";
  if (maisDeDuasCasas(e.form.amount)) return "O valor deve ter no máximo duas casas decimais.";

  const saldo = calcularSaldoPagavel(e.parcela, e.form);
  if (saldo <= 0) return "Esta parcela não possui saldo a pagar.";
  if (valor - saldo > TOLERANCIA) return "Valor excede o saldo da parcela.";

  if (e.exigeComprovante && !e.temArquivo) return "O anexo do comprovante é obrigatório para esta operação.";
  return null;
}

/** Prazo máximo da baixa (cobre pré-fetch/auth + RPC). */
export const DEADLINE_BAIXA_MS = 20_000;

export interface DeadlineBaixaOpcoes {
  timeoutMs?: number;
  agendar?: (cb: () => void, ms: number) => unknown;
  cancelar?: (handle: unknown) => void;
}

/**
 * Executa a baixa com prazo rígido cobrindo toda a promise. Aborta via AbortSignal
 * quando o executor souber usá-lo e rejeita com ErroBaixaIncerta. Resolução ou
 * rejeição tardias são descartadas: não viram sucesso nem unhandled rejection.
 */
export function executarComDeadlineBaixaPagar<T>(
  executor: (signal: AbortSignal | undefined) => Promise<T>,
  opcoes: DeadlineBaixaOpcoes = {},
): Promise<T> {
  const ms = opcoes.timeoutMs ?? DEADLINE_BAIXA_MS;
  const agendar = opcoes.agendar ?? ((cb, t) => setTimeout(cb, t));
  const cancelar = opcoes.cancelar ?? ((h) => clearTimeout(h as any));
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;

  return new Promise<T>((resolve, reject) => {
    let liquidado = false;
    let handle: unknown;

    const finalizar = (fn: () => void) => {
      if (liquidado) return;
      liquidado = true;
      if (handle !== undefined) cancelar(handle);
      fn();
    };

    handle = agendar(() => {
      finalizar(() => {
        try {
          controller?.abort();
        } catch {
          /* abort best-effort */
        }
        reject(new ErroBaixaIncerta());
      });
    }, ms);

    let promessa: Promise<T>;
    try {
      promessa = Promise.resolve(executor(controller?.signal));
    } catch (e) {
      finalizar(() => reject(e));
      return;
    }
    promessa.then(
      (v) => finalizar(() => resolve(v)),
      (e) => finalizar(() => reject(e)),
    );
  });
}
