/**
 * Início de pedido pelo comercial interno para a carteira da PRÓPRIA empresa.
 * Contrato: `public.c2_internal_order_entry_capability_v1()` (pacote INATIVO
 * `scripts/commercial-order-entry-20261024/`). Enquanto não instalado, o leitor
 * devolve bloqueio estruturado `contract_not_installed`. Nunca deriva escopo de
 * URL, papel ou menu; não inventa owner: usa exatamente o campo da linha.
 */
export const INTERNAL_ORDER_ENTRY_CONTRACT = "C2_INTERNAL_ORDER_ENTRY_V1";
export const INTERNAL_ORDER_ENTRY_RPC = "c2_internal_order_entry_capability_v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const INTERNAL_ORDER_BLOCK_REASONS = [
  "auth_required", "actor_not_allowed", "inactive_scope", "feature_disabled", "issuer_ambiguous",
  "issuer_not_validated", "no_partner_in_scope", "catalog_reader_pending",
  // Somente cliente:
  "contract_not_installed", "unavailable", "invalid_response",
] as const;
export type InternalOrderBlockReason = typeof INTERNAL_ORDER_BLOCK_REASONS[number];
const SERVER_REASONS = new Set<string>(INTERNAL_ORDER_BLOCK_REASONS.slice(0, 8));

export interface InternalOrderTarget { partnerId: string; razaoSocial: string }
export type InternalOrderEntryState =
  | { state: "allowed"; organizationId: string; targets: readonly InternalOrderTarget[] }
  | { state: "blocked"; reason: InternalOrderBlockReason };

const blocked = (reason: InternalOrderBlockReason): InternalOrderEntryState => ({ state: "blocked", reason });

/** Fail-closed: qualquer divergência do contrato vira `invalid_response`. */
export function readInternalOrderEntryCapability(raw: unknown, actorOrganizationId: unknown): InternalOrderEntryState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return blocked("invalid_response");
  const v = raw as Record<string, unknown>;
  if (v.contract !== INTERNAL_ORDER_ENTRY_CONTRACT || typeof v.order_create !== "boolean" || typeof v.profile_ok !== "boolean" || !Array.isArray(v.partners)) return blocked("invalid_response");
  if (v.order_create !== true) {
    return typeof v.reason === "string" && SERVER_REASONS.has(v.reason) ? blocked(v.reason as InternalOrderBlockReason) : blocked("invalid_response");
  }
  if (v.reason !== null || v.profile_ok !== true) return blocked("invalid_response");
  if (typeof actorOrganizationId !== "string" || !UUID.test(actorOrganizationId) || v.organization_id !== actorOrganizationId) return blocked("invalid_response");
  if (v.partners.length === 0 || v.partners.length > 500) return blocked("invalid_response");
  const targets: InternalOrderTarget[] = []; const seen = new Set<string>();
  for (const p of v.partners) {
    if (!p || typeof p !== "object") return blocked("invalid_response");
    const r = p as Record<string, unknown>;
    if (typeof r.partner_id !== "string" || !UUID.test(r.partner_id) || seen.has(r.partner_id) ||
        r.commercial_owner_organization_id !== actorOrganizationId || typeof r.razao_social !== "string") return blocked("invalid_response");
    seen.add(r.partner_id); targets.push({ partnerId: r.partner_id, razaoSocial: r.razao_social });
  }
  return { state: "allowed", organizationId: actorOrganizationId, targets };
}

/** ID da URL só seleciona; autoriza apenas se estiver na lista do servidor. */
export function resolveInternalOrderTarget(cap: InternalOrderEntryState | null | undefined, requestedPartnerId: unknown): InternalOrderTarget | null {
  if (!cap || cap.state !== "allowed" || typeof requestedPartnerId !== "string") return null;
  return cap.targets.find(t => t.partnerId === requestedPartnerId) ?? null;
}

/** Chave de remontagem: troca de ator/empresa/perfis/parceiro/época descarta carrinho, preço, plano, hash e chave. */
export function internalOrderDraftScope(input: { actorId?: string | null; organizationId?: string | null; roles: readonly string[]; partnerId?: string | null; authzEpoch: number; ready: boolean }): string | null {
  if (!input.ready || !input.actorId || !input.organizationId || !input.partnerId) return null;
  return JSON.stringify([input.actorId, input.organizationId, [...input.roles].sort(), input.partnerId, input.authzEpoch]);
}

export const INTERNAL_ORDER_REASON_TEXT: Record<InternalOrderBlockReason, string> = {
  auth_required: "Sessão não confirmada pelo servidor.",
  actor_not_allowed: "Seu acesso não é de administrador ou gestor comercial exclusivo desta empresa.",
  inactive_scope: "Perfil ou empresa inativos.",
  feature_disabled: "O plano da empresa não inclui pedidos B2B.",
  issuer_ambiguous: "A empresa não tem uma única configuração fiscal ativa.",
  issuer_not_validated: "A configuração fiscal da empresa ainda não foi validada pela contabilidade.",
  no_partner_in_scope: "Não há parceiros ativos na carteira desta empresa.",
  catalog_reader_pending: "A leitura do catálogo para a carteira ainda não foi liberada no servidor.",
  contract_not_installed: "A liberação deste recurso ainda não foi instalada no servidor.",
  unavailable: "Não foi possível confirmar a liberação agora.",
  invalid_response: "Resposta do servidor fora do contrato esperado; acesso mantido fechado.",
};
