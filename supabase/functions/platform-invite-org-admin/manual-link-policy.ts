export type DeliveryMode = "email" | "manual_link";

export function parseDeliveryMode(value: unknown): DeliveryMode | null {
  if (value === undefined || value === null || value === "") return "email";
  return value === "email" || value === "manual_link" ? value : null;
}

export function manualLinkResponseHeaders(): Record<string, string> {
  return { "Cache-Control": "no-store, private" };
}

export function manualLinkAuditState(
  organizationId: string,
  outcome: "success" | "failure",
  reason = "fallback de entrega",
): Record<string, string> {
  return {
    organization_id: organizationId,
    origin: "platform_admin",
    outcome,
    reason,
  };
}