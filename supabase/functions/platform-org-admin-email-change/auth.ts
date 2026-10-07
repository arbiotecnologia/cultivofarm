// Autorização do ator — mesmo padrão comprovado em communication-provider-settings:
// Bearer -> admin.auth.getUser(token) (service_role, server-side) -> is_platform_superadmin.
// Fail-closed; nenhuma operação privilegiada ocorre antes de retornar ok.

export interface AuthClient {
  auth: { getUser(token: string): Promise<{ data: { user: { id: string } | null } | null; error: unknown }> };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export type AuthResult =
  | { ok: true; actorId: string }
  | { ok: false; status: 401 | 403 | 500; code: string; error: string };

export function extractBearer(header: string | null): string | null {
  if (!header || !header.startsWith("Bearer ")) return null;
  const t = header.slice(7).trim();
  return t.length > 0 ? t : null;
}

export async function authorizeSuperadmin(header: string | null, admin: AuthClient): Promise<AuthResult> {
  const token = extractBearer(header);
  if (!token) return { ok: false, status: 401, code: "unauthorized", error: "Não autorizado." };
  let actorId: string | null = null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    actorId = !error && data?.user?.id ? String(data.user.id) : null;
  } catch { actorId = null; }
  if (!actorId) return { ok: false, status: 401, code: "invalid_token", error: "Sessão inválida." };
  try {
    const { data, error } = await admin.rpc("is_platform_superadmin", { _user_id: actorId });
    if (error) return { ok: false, status: 500, code: "authorization_check_failed", error: "Não foi possível validar sua permissão." };
    if (data !== true) return { ok: false, status: 403, code: "forbidden", error: "Apenas o superadmin de plataforma pode alterar e-mails." };
  } catch {
    return { ok: false, status: 500, code: "authorization_check_failed", error: "Não foi possível validar sua permissão." };
  }
  return { ok: true, actorId };
}
