import { z } from "zod";
/**
 * Financeiro B2B externo (parceiro_b2b_financeiro). Somente leitura; autoridade real vem de
 * `b2b_finance_capability_v1` + `rpc_portal_partner_financial` no servidor (pacote
 * scripts/b2b-financeiro-role-20261117). Gate OFF até 02b instalado e postflight real.
 */
export const B2B_FINANCE_ROLE_INSTALLED = false;
export const B2B_FINANCE_ROLE = "parceiro_b2b_financeiro" as const;
export const B2B_FINANCE_HOME = "/portal-financeiro-b2b";

/** Papel financeiro externo é exclusivo: qualquer outro papel nega (sem herdar gestor/técnico). */
export function isExclusiveFinanceRoles(roles: readonly string[] | null | undefined): boolean {
  return !!roles && roles.length === 1 && roles[0] === B2B_FINANCE_ROLE;
}

const uuid = z.string().uuid();
const allowed = z.object({
  contract: z.literal("B2B_FINANCE_ROLE_V1"), allowed: z.literal(true), partner_id: uuid,
  partner_name: z.string().max(300).nullable(), obligations_read: z.literal(true), export: z.boolean(),
  credit_read: z.boolean(), credit_reason: z.string().max(80).optional(), writes: z.literal(false),
}).strict();
const denied = z.object({ contract: z.literal("B2B_FINANCE_ROLE_V1"), allowed: z.literal(false), reason: z.string().max(80) }).strict();
export type FinanceCapability = z.infer<typeof allowed> | z.infer<typeof denied>;
export function parseFinanceCapability(raw: unknown): FinanceCapability {
  const ok = allowed.safeParse(raw);
  if (ok.success) return ok.data;
  const no = denied.safeParse(raw);
  if (no.success) return no.data;
  throw new Error("finance_capability_invalid");
}

export interface ObligationInstallment { id: string; numero: number; vencimento: string | null; valor: number; recebido: number; status: string }
export interface ObligationTitle { id: string; order_id: string; numero: string; created_at: string; total: number; status: string; installments: ObligationInstallment[] }

const cents = (v: number) => Math.round(v * 100);
const isClosed = (s: string) => ["PAID", "RECEIVED", "CANCELED", "CANCELLED", "recebido", "cancelado"].includes(s);
export const installmentBalance = (i: ObligationInstallment) => isClosed(i.status) ? 0 : Math.max(cents(i.valor) - cents(i.recebido), 0) / 100;
/** Data civil local (AAAA-MM-DD) — vencida só depois do dia de vencimento. */
export function isOverdue(i: ObligationInstallment, today: string): boolean {
  return installmentBalance(i) > 0 && !!i.vencimento && i.vencimento.slice(0, 10) < today;
}
export function titleOpen(t: ObligationTitle): boolean {
  return !isClosed(t.status) && t.installments.some((i) => installmentBalance(i) > 0);
}
/** Resumo somente sobre as obrigações projetadas pelo servidor; nunca saldo interno do fornecedor. */
export function summarizeObligations(rows: readonly ObligationTitle[], today: string) {
  let open = 0, overdue = 0, overdueCount = 0, nextDue: string | null = null;
  for (const t of rows) for (const i of t.installments) {
    const b = cents(installmentBalance(i));
    if (b <= 0) continue;
    open += b;
    if (isOverdue(i, today)) { overdue += b; overdueCount++; }
    else if (i.vencimento && (!nextDue || i.vencimento < nextDue)) nextDue = i.vencimento.slice(0, 10);
  }
  return { open: open / 100, overdue: overdue / 100, overdueCount, nextDue, openTitles: rows.filter(titleOpen).length };
}
/** Linhas de exportação: apenas campos financeiros já autorizados (sem IDs internos). */
export function obligationExportRows(rows: readonly ObligationTitle[]) {
  return rows.flatMap((t) => t.installments.map((i) => ({
    pedido: t.numero, titulo_status: t.status, parcela: String(i.numero), vencimento: i.vencimento ?? "",
    valor: i.valor.toFixed(2), pago: i.recebido.toFixed(2), saldo: installmentBalance(i).toFixed(2), parcela_status: i.status,
  })));
}
export const OBLIGATION_EXPORT_HEADERS = { pedido: "Pedido", titulo_status: "Status do título", parcela: "Parcela", vencimento: "Vencimento",
  valor: "Valor", pago: "Pago", saldo: "Saldo", parcela_status: "Status da parcela" };
