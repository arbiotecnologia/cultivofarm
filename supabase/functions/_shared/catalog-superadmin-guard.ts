// Autorização canônica para Edges do catálogo técnico GLOBAL.
// Exige, com o JWT do próprio usuário (cliente anon + Authorization):
//   1) public.has_role(uid,'superadmin') — delega a platform_private.has_role,
//      que exige profiles.ativo e platform_actor_access_ready;
//   2) public.is_platform_superadmin(uid).
// Nunca usa user_metadata/app_metadata nem service_role para decidir acesso.
// Falha fechada: qualquer erro/valor não-true nega.

export interface RpcCapableClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

export type CatalogGuardResult =
  | { ok: true }
  | { ok: false; status: 403 | 500; error: "forbidden" | "role_check_failed" };

export async function requireActiveCatalogSuperadmin(
  userClient: RpcCapableClient,
  userId: string,
): Promise<CatalogGuardResult> {
  if (typeof userId !== "string" || userId.length === 0) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  try {
    const active = await userClient.rpc("has_role", { _user_id: userId, _role: "superadmin" });
    if (active.error) return { ok: false, status: 500, error: "role_check_failed" };
    if (active.data !== true) return { ok: false, status: 403, error: "forbidden" };
    const platform = await userClient.rpc("is_platform_superadmin", { _user_id: userId });
    if (platform.error) return { ok: false, status: 500, error: "role_check_failed" };
    if (platform.data !== true) return { ok: false, status: 403, error: "forbidden" };
    return { ok: true };
  } catch {
    return { ok: false, status: 500, error: "role_check_failed" };
  }
}
