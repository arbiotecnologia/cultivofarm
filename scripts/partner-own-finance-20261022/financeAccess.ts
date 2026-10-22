/** Candidate ONLY; additive projection contract, never derived from catalogue200. */
export function ownFinanceActorAllowed(roles: readonly string[], capability: boolean) {
  const external = ["parceiro_b2b", "parceiro_b2b_tecnico", "cliente_produtor"];
  return capability && roles.includes("parceiro_b2b") &&
    roles.length <= external.length && new Set(roles).size === roles.length &&
    roles.every(role => external.includes(role));
}
export function readOwnFinanceCapability(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  return value.contract === "C2_OWN_OBLIGATIONS_V1" && value.obligations_read === true;
}
export function ownFinanceRoute(path: string, allowed: boolean, features: ReadonlySet<string>) {
  return path === "/portal-parceiro/financeiro" && allowed &&
    features.has("pedidos_b2b") && features.has("contas_receber");
}