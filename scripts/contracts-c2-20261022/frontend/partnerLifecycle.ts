export const EXTERNAL_CAPABILITIES = ["parceiro_b2b", "parceiro_b2b_tecnico", "cliente_produtor"] as const;
export type Capability = typeof EXTERNAL_CAPABILITIES[number];
export type LifecycleAction = "assign" | "revoke_roles" | "unlink" | "reactivate";
export type LifecycleInput = {
  partnerId: string; userId: string; roles: Capability[]; action: LifecycleAction;
  expected: string; key: string; reason: string;
};
export type HistoryCursor = { at: string; id: string };
export type AuditState = { roles: Capability[]; link: { partner_id: string; valid_from: string; revoked_at: string | null; version: number } | null };
export type LifecycleState = { version: string; state: { roles: Capability[]; link: { revoked_at: string | null } | null }; history: { id: string; at: string; actor_id: string; reason: string; action: string; before: AuditState; after: AuditState }[]; next_cursor: HistoryCursor | null };
export interface LifecycleClient {
  rpc(name: string, args: Record<string, unknown>): {
    abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
  };
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function buildLifecycleInput(input: LifecycleInput) {
  if (![input.partnerId, input.userId, input.key].every(x => uuid.test(x)) ||
    !/^[a-f0-9]{32}$/.test(input.expected) || input.reason.trim().length < 2 || input.reason.trim().length > 500 ||
    !["assign", "revoke_roles", "unlink", "reactivate"].includes(input.action) ||
    new Set(input.roles).size !== input.roles.length || input.roles.some(r => !EXTERNAL_CAPABILITIES.includes(r)))
    throw new Error("c2_invalid_input");
  return { p_partner_id: input.partnerId, p_user_id: input.userId, p_roles: [...input.roles].sort(),
    p_action: input.action, p_expected: input.expected, p_key: input.key, p_reason: input.reason.trim() };
}
// Request/presentation fencing only; never substitutes the server owner/actor gate.
export async function submitLifecycle(client: LifecycleClient, input: LifecycleInput, signal: AbortSignal, current: () => boolean) {
  if (signal.aborted || !current()) throw new Error("c2_context_changed");
  const { data, error } = await client.rpc("link_partner_user", buildLifecycleInput(input)).abortSignal(signal);
  if (signal.aborted || !current()) throw new Error("c2_context_changed");
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("c2_unconfirmed");
  const row = data as Record<string, unknown>;
  if (row.ok !== true || row.user_id !== input.userId || row.partner_id !== input.partnerId ||
    row.action !== input.action || row.reader_activation !== false || typeof row.version !== "string" || !/^[a-f0-9]{32}$/.test(row.version))
    throw new Error("c2_unconfirmed");
  return row;
}
export const lifecycleQueryKey = (scope: string, partnerId: string, userId: string) => ["partner-user-lifecycle", scope, partnerId, userId] as const;