// CANDIDATO NÃO IMPLANTADO. Destino: supabase/functions/_shared/user-admin/verify-actor.ts
// Verificação do JWT do chamador SEM decodificar à mão: getClaims (assinatura via JWKS/Auth) + getUser (sessão/usuário
// vivos no Auth). Identidade nunca vem de corpo, query ou cabeçalhos auxiliares (x-user-id, x-forwarded-*, apikey).
export type Claims = Record<string, unknown>;
export interface AuthPort {
  getClaims(token: string): Promise<{ data: { claims: Claims } | null; error: unknown }>;
  getUser(token: string): Promise<{ data: { user: { id: string; banned_until?: string | null; is_anonymous?: boolean; deleted_at?: string | null } | null }; error: unknown }>;
}
export type Verified = { ok: true; sub: string; iat: number } | { ok: false; status: number; error: string };
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function verifyActor(authHeader: string | null, auth: AuthPort, nowSec = Math.floor(Date.now() / 1000)): Promise<Verified> {
  const deny = { ok: false as const, status: 401, error: "not_authenticated" };
  if (!authHeader || !authHeader.startsWith("Bearer ")) return deny;
  const token = authHeader.slice(7).trim();
  if (!JWT_SHAPE.test(token) || token.length > 8192) return deny;
  let c: Awaited<ReturnType<AuthPort["getClaims"]>>;
  try { c = await auth.getClaims(token); } catch { return deny; }
  const cl = c?.data?.claims;
  if (c?.error || !cl) return deny;
  const sub = cl.sub, iat = cl.iat, exp = cl.exp;
  if (typeof sub !== "string" || !UUID.test(sub)) return deny;
  if (cl.role !== "authenticated" || cl.is_anonymous === true) return deny;           // service_role/anon/anônimo nunca são ator
  if (typeof iat !== "number" || !Number.isInteger(iat) || iat <= 0 || iat > nowSec + 60) return deny;
  if (typeof exp !== "number" || exp <= nowSec) return deny;
  let u: Awaited<ReturnType<AuthPort["getUser"]>>;
  try { u = await auth.getUser(token); } catch { return deny; }
  const user = u?.data?.user;
  if (u?.error || !user || user.id !== sub || user.is_anonymous === true || user.deleted_at) return deny;
  if (user.banned_until && Date.parse(user.banned_until) > nowSec * 1000) return deny;
  return { ok: true, sub, iat };
}
