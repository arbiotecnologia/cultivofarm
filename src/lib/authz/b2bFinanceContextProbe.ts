import type { AuthzFingerprintResult } from "./authzEpochMonitor";
import { parseFinanceCapability } from "@/lib/comercial/b2bFinanceRole";

/**
 * Sonda do monitor de sessão para o Financeiro B2B exclusivo: valida a resposta da capacidade
 * canônica (`b2b_finance_capability_v1`, ator/parceiro derivados no servidor). Nunca autoriza localmente;
 * negação ⇒ inelegível, resposta inválida ⇒ erro (monitor falha fechado). A tupla não é revisão monotônica.
 */
export function b2bFinanceContextProbe(raw: unknown): AuthzFingerprintResult {
  const cap = parseFinanceCapability(raw);
  if (cap.allowed !== true) return { eligible: false, fingerprint: null };
  return { eligible: true, fingerprint: JSON.stringify(["B2B_FINANCE_ROLE_V1", cap.partner_id, cap.obligations_read, cap.export, cap.credit_read]) };
}
