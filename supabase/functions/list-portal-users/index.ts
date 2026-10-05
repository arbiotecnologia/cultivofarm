import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return handlePreflight(req);
  if (origin && !isTrustedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), { status: 403 });
  }
  const corsHeaders = corsHeadersFor(origin);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub;

    const { data: actorOrg, error: actorOrgError } = await anonClient.rpc(
      "h15_actor_organization",
    );
    if (actorOrgError || !actorOrg) {
      return new Response(JSON.stringify({ error: "tenant_context_required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const roles = ["administrador", "gestor", "administrativo"];
    let allowed = false;
    for (const r of roles) {
      const { data } = await admin.rpc("has_role", { _user_id: callerId, _role: r });
      if (data) { allowed = true; break; }
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { cliente_id } = await req.json();
    if (!cliente_id) {
      return new Response(JSON.stringify({ error: "cliente_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cliente, error: clienteError } = await admin
      .from("clientes")
      .select("id")
      .eq("id", cliente_id)
      .eq("organization_id", actorOrg)
      .maybeSingle();
    if (clienteError) throw clienteError;
    if (!cliente) {
      return new Response(JSON.stringify({ error: "cliente_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca vínculos somente após validar o cliente no tenant do ator.
    const { data: vinculos, error: vErr } = await admin
      .from("user_clientes")
      .select("user_id, principal")
      .eq("cliente_id", cliente_id);
    if (vErr) throw vErr;

    const userIds = (vinculos ?? []).map((v: any) => v.user_id);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ users: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const principalMap = new Map<string, boolean>(
      (vinculos ?? []).map((v: any) => [v.user_id, !!v.principal])
    );

    const [{ data: profiles }, { data: rolesRows }] = await Promise.all([
      admin.from("profiles").select("id, user_id, nome, email, telefone, ativo, created_at").eq("organization_id", actorOrg).in("user_id", userIds),
      admin.from("user_roles").select("user_id, role").in("user_id", userIds),
    ]);

    const rolesByUser = new Map<string, string[]>();
    for (const r of rolesRows ?? []) {
      const arr = rolesByUser.get((r as any).user_id) ?? [];
      arr.push((r as any).role);
      rolesByUser.set((r as any).user_id, arr);
    }

    const enriched = await Promise.all((profiles ?? []).map(async (p: any) => {
      let last_sign_in_at: string | null = null;
      try {
        const { data: u } = await admin.auth.admin.getUserById(p.user_id);
        last_sign_in_at = u?.user?.last_sign_in_at ?? null;
      } catch { /* ignore */ }
      return {
        ...p,
        principal: principalMap.get(p.user_id) ?? false,
        roles: rolesByUser.get(p.user_id) ?? [],
        last_sign_in_at,
      };
    }));

    // Principal primeiro
    enriched.sort((a, b) => (a.principal === b.principal ? 0 : a.principal ? -1 : 1));

    return new Response(JSON.stringify({ users: enriched }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("list_portal_users_failed", err instanceof Error ? err.name : "unknown");
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
