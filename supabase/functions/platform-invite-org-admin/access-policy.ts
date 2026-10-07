export const CANONICAL_URL = "https://swzpzcwiasxmjutrmvkm.supabase.co";
export function temporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("") + "Aa#7";
}
export function parseAccess(body: Record<string, unknown>) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const action = body.access_action;
  if (!["state", "temporary_password", "password_link"].includes(String(action))) return null;
  if (!uuid.test(String(body.invite_id))) return null;
  if (action !== "state" && (body.confirm !== true || !uuid.test(String(body.operation_id)))) return null;
  if (body.user_id !== undefined || body.organization_id !== undefined || body.password !== undefined) return null;
  return { action: action as "state" | "temporary_password" | "password_link", inviteId: String(body.invite_id), operationId: String(body.operation_id ?? "") };
}