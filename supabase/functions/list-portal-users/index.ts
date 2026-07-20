import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    // Busca vínculos via tabela N:N
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
      admin.from("profiles").select("id, user_id, nome, email, telefone, ativo, created_at").in("user_id", userIds),
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
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
