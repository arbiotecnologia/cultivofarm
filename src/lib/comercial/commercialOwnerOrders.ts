import { z } from "zod";

/**
 * Leitura administrativa SOMENTE LEITURA dos pedidos externos da carteira da
 * própria empresa (commercial owner). Contrato:
 * `public.c2_commercial_owner_orders_projection` (pacote INATIVO
 * `scripts/owner-orders-20261023/commercial-owner-admin-read-20261026/`).
 * Enquanto não instalado, o leitor devolve bloqueio estruturado
 * `contract_not_installed`. A organização é derivada no servidor; resposta com
 * organization_id divergente do perfil do ator é rejeitada (fail-closed).
 */
export const COMMERCIAL_OWNER_ORDERS_CONTRACT = "C2_COMMERCIAL_OWNER_ORDERS_V1";
export const COMMERCIAL_OWNER_ORDERS_RPC = "c2_commercial_owner_orders_projection";

export const COMMERCIAL_OWNER_ORDERS_BLOCK_REASONS = [
  "contract_not_installed", "actor_not_allowed", "unavailable", "invalid_response",
] as const;
export type CommercialOwnerOrdersBlockReason = typeof COMMERCIAL_OWNER_ORDERS_BLOCK_REASONS[number];

const rowSchema = z.object({
  id: z.string().uuid(),
  numero: z.string(),
  status: z.string(),
  total: z.number(),
  created_at: z.string(),
  requested_delivery_date: z.string().nullable(),
  estimated_delivery_date: z.string().nullable(),
  partner_id: z.string().uuid(),
  partner_razao_social: z.string(),
  c2_external_origin_snapshot: z.unknown().optional(),
}).strict();

const envelopeSchema = z.object({
  contract: z.literal(COMMERCIAL_OWNER_ORDERS_CONTRACT),
  organization_id: z.string().uuid(),
  orders: z.array(rowSchema).max(200),
}).strict();

export interface CommercialOwnerOrder extends z.infer<typeof rowSchema> {}
/** Presentation only, after the scoped server envelope has been authorized. */
export function commercialOwnerOrdersDisplay(orders: readonly CommercialOwnerOrder[], excludeIds: readonly string[]) {
  const excluded = new Set(excludeIds);
  const visible = orders.filter((order) => !excluded.has(order.id));
  return {
    visible,
    state: orders.length === 0 ? "empty_filter" as const
      : visible.length === 0 ? "already_listed" as const : "rows" as const,
  };
}
export type CommercialOwnerOrdersState =
  | { state: "allowed"; organizationId: string; orders: readonly CommercialOwnerOrder[] }
  | { state: "blocked"; reason: CommercialOwnerOrdersBlockReason };

const blocked = (reason: CommercialOwnerOrdersBlockReason): CommercialOwnerOrdersState => ({ state: "blocked", reason });

/** Fail-closed: qualquer divergência do contrato vira `invalid_response`. */
export function readCommercialOwnerOrders(raw: unknown, actorOrganizationId: unknown): CommercialOwnerOrdersState {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) return blocked("invalid_response");
  if (typeof actorOrganizationId !== "string" || parsed.data.organization_id !== actorOrganizationId) {
    return blocked("invalid_response");
  }
  return { state: "allowed", organizationId: parsed.data.organization_id, orders: parsed.data.orders };
}

export const COMMERCIAL_OWNER_ORDERS_REASON_TEXT: Record<CommercialOwnerOrdersBlockReason, string> = {
  contract_not_installed: "A leitura da carteira ainda não foi instalada no servidor.",
  actor_not_allowed: "Seu acesso não é de administrador ou gestor comercial desta empresa.",
  unavailable: "Não foi possível confirmar a leitura da carteira agora.",
  invalid_response: "Resposta do servidor fora do contrato esperado; leitura mantida fechada.",
};
