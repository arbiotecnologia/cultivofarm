/**
 * Regras puras do registro de recebimento (kind = "receivable").
 *
 * Saldo válido da parcela:
 *   original
 *   + juros acumulados + multa acumulada - desconto acumulado
 *   - recebido
 *   + novos juros + nova multa - novo desconto
 *
 * A semântica de contas a pagar NÃO é tratada aqui.
 */

export interface ParcelaReceber {
  original_amount?: unknown;
  received_amount?: unknown;
  interest_amount?: unknown;
  penalty_amount?: unknown;
  discount_amount?: unknown;
}

export interface AjustesBaixa {
  interest_amount?: unknown;
  penalty_amount?: unknown;
  discount_amount?: unknown;
}

export const TOLERANCIA = 0.005;

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v ?? 0);
  return Number.isFinite(n) ? n : NaN;
};
const cent = (v: number) => Math.round(v * 100) / 100;

export interface AcumuladosParcela {
  original: number;
  recebido: number;
  juros: number;
  multa: number;
  desconto: number;
}

export function acumuladosParcela(p: ParcelaReceber | null | undefined): AcumuladosParcela {
  const g = (v: unknown) => {
    const n = num(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    original: g(p?.original_amount),
    recebido: g(p?.received_amount),
    juros: g(p?.interest_amount),
    multa: g(p?.penalty_amount),
    desconto: g(p?.discount_amount),
  };
}

/** Saldo devido considerando acumulados da parcela e ajustes desta baixa. */
export function calcularSaldoRecebivel(p: ParcelaReceber | null | undefined, ajustes: AjustesBaixa = {}): number {
  const a = acumuladosParcela(p);
  const g = (v: unknown) => {
    const n = num(v);
    return Number.isFinite(n) ? n : 0;
  };
  return cent(
    a.original + a.juros + a.multa - a.desconto - a.recebido +
      g(ajustes.interest_amount) + g(ajustes.penalty_amount) - g(ajustes.discount_amount),
  );
}

/** Data civil YYYY-MM-DD real (rejeita 2026-02-30). */
export function dataCivilValida(valor: unknown): boolean {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [y, m, d] = valor.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dias;
}

export interface EntradaValidacaoBaixa {
  parcela: ParcelaReceber | null | undefined;
  form: {
    payment_date?: unknown;
    amount?: unknown;
    payment_method_id?: unknown;
    interest_amount?: unknown;
    penalty_amount?: unknown;
    discount_amount?: unknown;
  };
  /** Ids de formas de pagamento ativas carregadas. */
  metodosAtivos: string[];
  /** Configurações financeiras carregadas com sucesso? */
  settingsCarregadas: boolean;
  exigeComprovante: boolean;
  temArquivo: boolean;
  temSessao: boolean;
}

export const MSG_COMPROVANTE_PENDENTE =
  "Recebimento registrado, comprovante pendente. Reenvie o comprovante — o recebimento não será lançado de novo.";

/** Erro originado de validação local (mensagem já segura para exibição). */
export class ErroBaixaLocal extends Error {
  readonly origem = "local" as const;
}

export const MSG_BAIXA_GENERICA = "Não foi possível concluir a operação. Tente novamente.";

const MENSAGENS_BAIXA_REMOTA: Record<string, string> = {
  FIN_INVALID_AMOUNT: "Valor inválido para esta baixa. Confira valor, juros, multa e desconto.",
  fin_invalid_amount: "Valor inválido para esta baixa. Confira valor, juros, multa e desconto.",
  FIN_IDEMPOTENCY_CONFLICT: "Este recebimento já foi registrado. Recarregue a lista antes de tentar de novo.",
  fin_idempotency_conflict: "Este recebimento já foi registrado. Recarregue a lista antes de tentar de novo.",
  "23505": "Este recebimento já foi registrado. Recarregue a lista antes de tentar de novo.",
  "42501": "Você não tem permissão para registrar este recebimento.",
  "40001": "A parcela foi alterada por outra pessoa. Recarregue a lista e tente novamente.",
  P0002: "Parcela não encontrada. Recarregue a lista.",
  "23514": "A parcela não está em um estado que permita este recebimento.",
  "23503": "Existem vínculos que impedem registrar este recebimento.",
};

/** Mensagem segura: local mantém o texto tipado; remoto usa allowlist, nunca texto cru. */
export function mapearErroBaixaRecebimento(erro: unknown): string {
  if (erro instanceof ErroBaixaLocal) return erro.message;
  const e = (erro ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  if (code && MENSAGENS_BAIXA_REMOTA[code]) return MENSAGENS_BAIXA_REMOTA[code];
  const msg = typeof e.message === "string" ? e.message : "";
  const token = msg.match(/(FIN_[A-Z_]+|fin_[a-z_]+)/)?.[0];
  if (token && MENSAGENS_BAIXA_REMOTA[token]) return MENSAGENS_BAIXA_REMOTA[token];
  return MSG_BAIXA_GENERICA;
}

/** Mais de 2 casas decimais? */
export function maisDeDuasCasas(v: unknown): boolean {
  const n = num(v);
  if (!Number.isFinite(n)) return false;
  return Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;
}

export function validarBaixaRecebimento(e: EntradaValidacaoBaixa): string | null {
  if (!e.temSessao) return "Sessão expirada. Entre novamente para registrar o recebimento.";
  if (!e.parcela) return "Parcela não selecionada.";
  if (!e.settingsCarregadas) return "Não foi possível carregar as configurações financeiras. Tente novamente.";
  if (!dataCivilValida(e.form.payment_date)) return "Informe uma data de recebimento válida.";

  const metodo = typeof e.form.payment_method_id === "string" ? e.form.payment_method_id : "";
  if (!metodo) return "Selecione a forma de pagamento.";
  if (!e.metodosAtivos.includes(metodo)) return "Forma de pagamento indisponível. Selecione outra.";

  for (const [campo, rotulo] of [
    ["interest_amount", "Juros"],
    ["penalty_amount", "Multa"],
    ["discount_amount", "Desconto"],
  ] as const) {
    const v = num((e.form as any)[campo]);
    if (!Number.isFinite(v)) return `${rotulo}: informe um valor numérico válido.`;
    if (v < 0) return `${rotulo} não pode ser negativo.`;
    if (maisDeDuasCasas((e.form as any)[campo])) return `${rotulo}: use no máximo duas casas decimais.`;
  }

  const valor = num(e.form.amount);
  if (!Number.isFinite(valor)) return "Informe um valor numérico válido.";
  if (valor <= 0) return "O valor do recebimento deve ser maior que zero.";
  if (maisDeDuasCasas(e.form.amount)) return "O valor deve ter no máximo duas casas decimais.";

  const saldo = calcularSaldoRecebivel(e.parcela, e.form);
  if (saldo <= 0) return "Esta parcela não possui saldo a receber.";
  if (valor - saldo > TOLERANCIA) return "Valor excede o saldo da parcela.";

  if (e.exigeComprovante && !e.temArquivo) return "O anexo do comprovante é obrigatório para esta operação.";
  return null;
}
