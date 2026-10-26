/**
 * Capacidade server-side de criação de pedido do cliente comercial (commercial_owner).
 * Fail-closed: sem o contrato exato vindo da projeção canônica, o writer permanece
 * fechado. Menu, papel ou rota nunca habilitam o carrinho por si só.
 */
export function readOwnerOrderCapability(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const v = raw as Record<string, unknown>;
  return v.contract === "C2_OWNER_ORDER_V1" && v.order_create === true;
}

export function ownerOrderRoute(path: string, capability: boolean, features: ReadonlySet<string>) {
  return path === "/portal-parceiro/catalogo" && capability === true && features.has("pedidos_b2b");
}

/**
 * Acompanhamento SOMENTE LEITURA dos pedidos próprios do cliente comercial.
 * O conteúdo vem exclusivamente do canal canônico `get_my_commercial_orders_projection`
 * (fail-closed no hook); a rota nunca habilita ações legadas nem escritas.
 */
export function ownerOrdersRoute(path: string) {
  return path === "/portal-parceiro/pedidos";
}
