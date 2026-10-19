// Test-only fake of the server RPC `internal_actor_context_v1()` built from a
// test file's existing fake transport (h15_actor_organization, profiles,
// user_roles, has_role). It models ONE round trip: every inner fake call is
// issued so the per-call fake latency models one PostgREST request (see below). The real SQL (single STABLE statement, own
// auth.uid() only) is tested in scripts/monitor-single-rtt-probe/test-local.py.
// Any inner error => the RPC errors (client fails closed). Not JWT/RLS proof.
type Res = { data?: unknown; error?: unknown } | null | undefined;
type Sb = { from: (t: string) => unknown; rpc: (name: string, args?: unknown) => unknown };
type Chain = { select: (c: string) => Chain; eq: (k: string, v: unknown) => Chain; maybeSingle: () => Promise<Res> } & PromiseLike<Res>;

export const INTERNAL_ACTOR_CONTEXT_RPC_NAME = 'internal_actor_context_v1';

export type SyncHasRole = (uid: string, role: string) => unknown;

/**
 * Default: wave 1 = h15 + profile + roles in parallel, then has_role per role
 * ROW through the file's own fake (keeps its call records). Latency-focused
 * files pass `syncHasRole` so has_role is evaluated in the same wave from the
 * same fake state: exactly one fake round trip, like one PostgREST call.
 */
export async function composeInternalActorContext(sb: Sb, rpc: (name: string, args?: unknown) => unknown, uid: string, syncHasRole?: SyncHasRole): Promise<Res> {
  const q = (t: string) => sb.from(t) as Chain;
  const [org, profile, roles] = await Promise.all([
    rpc('h15_actor_organization') as Promise<Res>,
    q('profiles').select('user_id, organization_id, ativo, senha_provisoria').eq('user_id', uid).maybeSingle(),
    Promise.resolve(q('user_roles').select('role').eq('user_id', uid)) as Promise<Res>,
  ]);
  const fail = { data: null, error: { message: 'fake_rpc_error' } };
  if (!org || !profile || !roles || org.error || profile.error || roles.error) return fail;
  const rows = Array.isArray(roles.data) ? (roles.data as Array<{ role?: unknown } | null>).map(r => r?.role) : [];
  let checks: Res[];
  if (syncHasRole) checks = rows.map(role => ({ data: syncHasRole(uid, String(role)), error: null }));
  else {
    checks = await Promise.all(rows.map(role => rpc('has_role', { _user_id: uid, _role: role }) as Promise<Res>));
    if (checks.some(c => !c || c.error)) return fail;
  }
  const confirmed = rows.length > 0 && checks.every(c => c?.data === true);
  const p = profile.data as Record<string, unknown> | null;
  return { data: {
    v: 1, user_id: uid, organization_id: org.data ?? null,
    profile: p ? { user_id: p.user_id, organization_id: p.organization_id, ativo: p.ativo, senha_provisoria: p.senha_provisoria } : null,
    roles: [...rows].map(String).sort(), roles_confirmed: confirmed,
  }, error: null };
}

/** Wrap the mocked client's rpc in place; other RPC names go to the original fake. */
export function installInternalActorContextAdapter(client: unknown, uid: () => string, syncHasRole?: SyncHasRole) {
  const sb = client as Sb;
  const original = sb.rpc;
  sb.rpc = function (this: unknown, name: string, args?: unknown) {
    if (name === INTERNAL_ACTOR_CONTEXT_RPC_NAME) return composeInternalActorContext(sb, (n, a) => original.call(sb, n, a), uid(), syncHasRole);
    return original.call(sb, name, args);
  };
}
