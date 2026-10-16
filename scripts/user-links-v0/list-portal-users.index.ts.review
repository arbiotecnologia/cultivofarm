import { createClient } from "npm:@supabase/supabase-js@2";
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl !== "https://swzpzcwiasxmjutrmvkm.supabase.co" || !anonKey || !serviceKey) {
      throw new Error("canonical_configuration_required");
    }
    const anonClient = createClient(
      supabaseUrl,
      anonKey,
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
    if (typeof callerId !== "string") {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: actorOrg, error: actorOrgError } = await anonClient.rpc(
      "h15_actor_organization",
    );
    if (actorOrgError || !actorOrg) {
      return new Response(JSON.stringify({ error: "tenant_context_required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roles = ["administrador", "gestor", "administrativo"];
    let allowed = false;
    for (const r of roles) {
      const { data } = await anonClient.rpc("has_role", { _user_id: callerId, _role: r });
      if (data) { allowed = true; break; }
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const clienteId = body?.cliente_id;
    if (typeof clienteId !== "string" || !isUuid(clienteId)) {
      return new Response(JSON.stringify({ error: "cliente_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A consulta autenticada aplica também a policy tenant de clientes.
    // O acesso privilegiado só passa a existir depois desta fronteira.
    const { data: cliente, error: clienteError } = await anonClient
      .from("clientes")
      .select("id")
      .eq("id", clienteId)
      .eq("organization_id", actorOrg)
      .maybeSingle();
    if (clienteError) throw clienteError;
    if (!cliente) {
      return new Response(JSON.stringify({ error: "cliente_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      supabaseUrl,
      serviceKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Busca vínculos somente após validar o cliente no tenant do ator.
    const membershipTime = new Date().toISOString();
    const { data: vinculos, error: vErr } = await admin
      .from("user_clientes")
      .select("user_id, principal")
      .eq("cliente_id", clienteId)
      .eq("is_active", true)
      .is("revoked_at", null)
      .or(`valid_from.is.null,valid_from.lte.${membershipTime}`)
      .or(`valid_until.is.null,valid_until.gte.${membershipTime}`);
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

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, user_id, nome, email, ativo")
      .eq("organization_id", actorOrg)
      .in("user_id", userIds);
    if (profilesError) throw profilesError;

    // Vínculo corrompido para usuário de outro tenant é descartado antes de
    // qualquer leitura de papel ou metadado Auth.
    const validatedUserIds = (profiles ?? []).map((profile: { user_id: string }) => profile.user_id);
    const { data: rolesRows, error: rolesError } = validatedUserIds.length > 0
      ? await admin.from("user_roles").select("user_id, role").in("user_id", validatedUserIds)
      : { data: [], error: null };
    if (rolesError) throw rolesError;

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

    // Revalida ator/tenant/cliente e vínculos após IO privilegiado.
    const { data: finalOrg, error: finalOrgError } = await anonClient.rpc("h15_actor_organization");
    let finalAllowed = false;
    for (const r of roles) {
      const { data, error } = await anonClient.rpc("has_role", { _user_id: callerId, _role: r });
      if (!error && data) { finalAllowed = true; break; }
    }
    if (finalOrgError || finalOrg !== actorOrg || !finalAllowed) {
      return new Response(JSON.stringify({ error: "tenant_context_required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: finalCliente, error: finalClienteError } = await anonClient
      .from("clientes").select("id").eq("id", clienteId)
      .eq("organization_id", actorOrg).maybeSingle();
    if (finalClienteError || !finalCliente) {
      return new Response(JSON.stringify({ error: "cliente_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const finalTime = new Date().toISOString();
    const { data: finalLinks, error: finalLinksError } = await admin
      .from("user_clientes").select("user_id, principal")
      .eq("cliente_id", clienteId).eq("is_active", true).is("revoked_at", null)
      .or(`valid_from.is.null,valid_from.lte.${finalTime}`)
      .or(`valid_until.is.null,valid_until.gte.${finalTime}`);
    if (finalLinksError) throw finalLinksError;
    const finalIds = (finalLinks ?? []).map((link: { user_id: string }) => link.user_id);
    const { data: finalProfiles, error: finalProfilesError } = finalIds.length > 0
      ? await admin.from("profiles").select("user_id").eq("organization_id", actorOrg).in("user_id", finalIds)
      : { data: [], error: null };
    if (finalProfilesError) throw finalProfilesError;
    const finalProfileIds = new Set((finalProfiles ?? []).map((profile: { user_id: string }) => profile.user_id));
    const current = enriched.filter((profile) => finalProfileIds.has(profile.user_id));
    const finalPrincipal = new Map((finalLinks ?? []).map((link: { user_id: string; principal: boolean }) => [link.user_id, link.principal]));
    for (const profile of current) profile.principal = finalPrincipal.get(profile.user_id) ?? false;

    // Principal primeiro
    current.sort((a, b) => (a.principal === b.principal ? 0 : a.principal ? -1 : 1));

    return new Response(JSON.stringify({ users: current }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("list_portal_users_failed", err instanceof Error ? err.name : "unknown");
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
