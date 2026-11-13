/**
 * Seleção do CFOP ao preencher item de rascunho a partir do perfil fiscal.
 * Só escolhe quando TODOS os dados existem: UF do emitente e do destinatário,
 * data de emissão, natureza da operação de venda e finalidade normal.
 * Faltando algo, retorna vazio com o motivo — nunca presume operação interna.
 */
import { scenarioFor } from "@/lib/fiscal/preEmissionPendencies";

export interface DraftCfopInput {
  cfopInState?: string | null;
  cfopInterstate?: string | null;
  emitterUf?: string | null;
  destUf?: string | null;
  issueDate?: string | null;
  naturezaOperacao?: string | null;
  finalidade?: string | null;
}

export type DraftCfopReason =
  | "ok" | "missing_emitter_uf" | "missing_dest_uf" | "missing_issue_date"
  | "missing_operation" | "non_sale_operation" | "non_normal_purpose" | "missing_profile_cfop";

const NON_SALE = /(devolu|remessa|transfer|bonifica|amostra|retorno|consigna|comodato|demonstra|conserto|industrializa)/i;

export function selectDraftCfop(i: DraftCfopInput): { cfop: string; reason: DraftCfopReason } {
  const empty = (reason: DraftCfopReason) => ({ cfop: "", reason });
  if (!i.emitterUf?.trim()) return empty("missing_emitter_uf");
  if (!i.destUf?.trim()) return empty("missing_dest_uf");
  if (!i.issueDate?.trim()) return empty("missing_issue_date");
  const nat = i.naturezaOperacao?.trim();
  if (!nat) return empty("missing_operation");
  if (NON_SALE.test(nat)) return empty("non_sale_operation");
  const fin = i.finalidade?.trim().toLowerCase();
  if (fin && fin !== "1" && fin !== "normal") return empty("non_normal_purpose");
  const sc = scenarioFor(i.emitterUf, i.destUf);
  const cfop = (sc === "interna" ? i.cfopInState : i.cfopInterstate)?.trim() ?? "";
  return cfop ? { cfop, reason: "ok" } : empty("missing_profile_cfop");
}

export const DRAFT_CFOP_REASON_LABEL: Record<DraftCfopReason, string> = {
  ok: "",
  missing_emitter_uf: "UF do emitente ausente na Configuração fiscal",
  missing_dest_uf: "UF do destinatário ainda não conhecida",
  missing_issue_date: "data de emissão ausente",
  missing_operation: "natureza da operação não informada",
  non_sale_operation: "natureza da operação não é venda; informe o CFOP manualmente",
  non_normal_purpose: "finalidade não é normal; informe o CFOP manualmente",
  missing_profile_cfop: "perfil sem CFOP para este cenário",
};

/**
 * Reavaliação automática só altera itens cujo CFOP atual é vazio ou um dos
 * CFOPs automáticos do próprio snapshot — escolhas manuais ficam intactas.
 */
export function isAutoCfop(current: string | null | undefined, snap: { cfop_in_state?: string | null; cfop_interstate?: string | null } | null | undefined): boolean {
  const c = (current ?? "").trim();
  if (!c) return true;
  return !!snap && (c === (snap.cfop_in_state ?? "").trim() || c === (snap.cfop_interstate ?? "").trim());
}
