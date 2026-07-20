/**
 * Toast centralizado para o fluxo B2B.
 *
 * Padroniza mensagens de avanço de etapa e falhas, e evita duplicação
 * usando `id` estável por ação (sonner reaproveita o mesmo toast).
 *
 * Uso típico:
 *   await b2bToast.promise(
 *     mutation.mutateAsync(payload),
 *     {
 *       action: "approve-credit",
 *       orderNumero: "PED-001",
 *       loading: "Liberando para análise comercial…",
 *       success: (r) => `Crédito aprovado → ${partnerOrderStatusLabel(r.status)}`,
 *     },
 *   );
 */
import { toast } from "sonner";

export type B2BAction =
  | "approve-credit"
  | "reject-credit"
  | "approve-order"
  | "reject-order"
  | "generate-op"
  | "advance-os"
  | "deliver"
  | "generic";

const PREFIX = "b2b";

const toastId = (action: B2BAction, key?: string) =>
  key ? `${PREFIX}:${action}:${key}` : `${PREFIX}:${action}`;

const FRIENDLY_ERRORS: Record<string, string> = {
  auth_required: "Sessão expirada. Faça login novamente.",
  forbidden: "Você não tem permissão para esta ação.",
  order_not_found: "Pedido não encontrado.",
  planning_not_found: "Planejamento não encontrado para este pedido.",
  reason_required: "Informe o motivo antes de continuar.",
  already_processed: "Esta etapa já foi concluída por outro usuário.",
  already_released: "O crédito já foi liberado.",
  already_approved: "O pedido já foi aprovado.",
  already_published: "Demanda já publicada no laboratório.",
  credit_pending: "É preciso aprovar o crédito antes desta ação.",
  credit_block: "Pedido bloqueado por crédito. Revise o limite do parceiro.",
  concurrent_update: "O pedido mudou de status em outra aba. Recarregue e tente novamente.",
  invalid_status: "O pedido não está no status esperado para esta ação.",
  invalid_status_transition: "Transição de status não permitida para este pedido.",
  credit_release_failed: "Não foi possível liberar o crédito do pedido.",
  no_items: "Pedido sem itens. Volte ao comercial e adicione produtos antes de publicar.",
  invalid_quantity: "Há itens com quantidade inválida (≤ 0). Corrija no pedido.",
  invalid_dates: "Datas de produção inválidas: início deve ser anterior ao término.",
  order_not_approved: "O pedido B2B precisa estar aprovado e liberado para produção.",
};


/** Extrai um código curto do `RAISE EXCEPTION 'code: detalhe'` do Postgres. */
export function extractB2BErrorCode(err: unknown): { code: string; detail?: string } {
  const raw =
    (err as any)?.message ??
    (err as any)?.error_description ??
    (typeof err === "string" ? err : "") ??
    "";
  const m = String(raw).match(/^([a-z_]+)(?::\s*(.+))?$/i);
  if (m) return { code: m[1], detail: m[2] };
  return { code: "generic", detail: String(raw) };
}

export function formatB2BError(err: unknown, fallback = "Falha na operação"): string {
  const { code, detail } = extractB2BErrorCode(err);
  const base = FRIENDLY_ERRORS[code] ?? fallback;
  return detail && !FRIENDLY_ERRORS[code] ? `${base}: ${detail}` : base;
}

interface PromiseOpts<T> {
  action: B2BAction;
  /** Chave única adicional (ex.: número do pedido) para isolar toasts simultâneos. */
  orderNumero?: string;
  loading: string;
  success: string | ((data: T) => string);
  errorFallback?: string;
}

function b2bPromise<T>(promise: Promise<T>, opts: PromiseOpts<T>) {
  const id = toastId(opts.action, opts.orderNumero);
  toast.promise(promise, {
    id,
    loading: opts.loading,
    success: (data: T) =>
      typeof opts.success === "function" ? opts.success(data) : opts.success,
    error: (e) => formatB2BError(e, opts.errorFallback),
  });
  return promise;
}

function b2bSuccess(action: B2BAction, message: string, orderNumero?: string) {
  toast.success(message, { id: toastId(action, orderNumero) });
}

function b2bError(action: B2BAction, err: unknown, orderNumero?: string, fallback?: string) {
  toast.error(formatB2BError(err, fallback), { id: toastId(action, orderNumero) });
}

function b2bInfo(action: B2BAction, message: string, orderNumero?: string) {
  toast(message, { id: toastId(action, orderNumero) });
}

export const b2bToast = {
  promise: b2bPromise,
  success: b2bSuccess,
  error: b2bError,
  info: b2bInfo,
};
