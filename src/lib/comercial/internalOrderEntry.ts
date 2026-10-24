/**
 * Início de pedido pelo comercial interno (venda para parceiro/cliente da empresa).
 *
 * Estado LIVE capturado (24/10/2026): NÃO há leitura server-side que autorize
 * esta entrada. `create_partner_order_secure`/`simulate_b2b_payment_plan_secure`
 * passam por `assert_b2b_partner_scope`, que exige que o parceiro alvo seja o
 * parceiro da PRÓPRIA organização do ator (`org_partner`), e o trigger de origem
 * interna exige emissor VALIDATED (A está DRAFT). Logo o leitor abaixo fica
 * fechado até o contrato inativo de `scripts/commercial-order-entry-20261024/`
 * ser revisado e instalado externamente. Nunca deriva escopo de URL, papel ou menu.
 */
export const INTERNAL_ORDER_ENTRY_CONTRACT = "C2_INTERNAL_ORDER_ENTRY_V1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InternalOrderEntryCapability {
  organizationId: string;
  partnerIds: ReadonlySet<string>;
}

/** Fail-closed: qualquer forma diferente do contrato exato devolve null. */
export function readInternalOrderEntryCapability(raw: unknown, actorOrganizationId: unknown): InternalOrderEntryCapability | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (v.contract !== INTERNAL_ORDER_ENTRY_CONTRACT || v.order_create !== true) return null;
  if (typeof actorOrganizationId !== "string" || !UUID.test(actorOrganizationId) || v.organization_id !== actorOrganizationId) return null;
  if (!Array.isArray(v.partners) || v.partners.length === 0 || v.partners.length > 500) return null;
  const ids = new Set<string>();
  for (const p of v.partners) {
    if (!p || typeof p !== "object") return null;
    const r = p as Record<string, unknown>;
    if (typeof r.partner_id !== "string" || !UUID.test(r.partner_id) ||
        r.commercial_owner_organization_id !== actorOrganizationId) return null;
    ids.add(r.partner_id);
  }
  return { organizationId: actorOrganizationId, partnerIds: ids };
}

/** O ID vindo da URL só seleciona; autoriza apenas se estiver na lista do servidor. */
export function internalOrderTargetAllowed(cap: InternalOrderEntryCapability | null, requestedPartnerId: unknown): boolean {
  return !!cap && typeof requestedPartnerId === "string" && cap.partnerIds.has(requestedPartnerId);
}

/**
 * Chave do rascunho volátil (carrinho, preço, plano, hash, chave de idempotência).
 * Qualquer mudança de ator/empresa/perfis/parceiro/época descarta tudo.
 */
export function internalOrderDraftScope(input: { actorId?: string | null; organizationId?: string | null; roles: readonly string[]; partnerId?: string | null; authzEpoch: number; ready: boolean }): string | null {
  if (!input.ready || !input.actorId || !input.organizationId || !input.partnerId) return null;
  return JSON.stringify([input.actorId, input.organizationId, [...input.roles].sort(), input.partnerId, input.authzEpoch]);
}
