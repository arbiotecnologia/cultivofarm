import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// HML rev.1: verificação de administrador/tenant no contexto do CHAMADOR (JWT), não do service_role.
export const handler = async (req: Request, mk: typeof createClient = createClient): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = mk(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub;

    const adminClient = mk(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // has_role/h15 dependem de auth.uid()/JWT do chamador; sob service_role perdem o contexto (403 falso no HML).
    const { data: isAdmin, error: isAdminError } = await anonClient.rpc("has_role", {
      _user_id: callerId,
      _role: "administrador",
    });

    if (isAdminError || isAdmin !== true) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: actorProfile, error: actorProfileError } = await adminClient
      .from("profiles")
      .select("organization_id, ativo")
      .eq("user_id", callerId)
      .maybeSingle();
    if (actorProfileError || actorProfile?.ativo !== true || !actorProfile?.organization_id) {
      return new Response(JSON.stringify({ error: "tenant_scope_required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerOrg, error: callerOrgError } = await anonClient.rpc("h15_actor_organization");
    if (callerOrgError || !callerOrg || callerOrg !== actorProfile.organization_id) {
      return new Response(JSON.stringify({ error: "tenant_scope_required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const actorOrganizationId = actorProfile.organization_id;

    const body = await req.json();
    const {
      email, password, nome, role,
      roles: rolesInput,
      partner_id, partner_papel,
      telefone, cargo, cpf_cnpj, crea, especialidade,
      cliente_id,
      cliente_ids,
      principal_cliente_id,
    } = body;

    // Normaliza lista de papéis (compatível com fluxo legado que envia `role`)
    const rolesArr: string[] = Array.isArray(rolesInput) && rolesInput.length > 0
      ? Array.from(new Set(rolesInput.filter(Boolean)))
      : (role ? [role] : []);

    if (
      typeof email !== "string" || !email.trim() ||
      typeof password !== "string" || !password ||
      typeof nome !== "string" || !nome.trim() ||
      rolesArr.length === 0
    ) {
      return new Response(JSON.stringify({ error: "email, password, nome e ao menos um perfil são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Papel de plataforma SaaS: reservado ao mecanismo interno. Esta função usa
    // service_role (ignora RLS), portanto o bloqueio precisa ser explícito aqui.
    if (rolesArr.includes("superadmin") || role === "superadmin") {
      return new Response(JSON.stringify({ error: "superadmin_role_reserved" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const TENANT_USER_ROLES = new Set([
      "administrador", "gestor", "consultor_tecnico", "aplicador", "operador_onfarm",
      "tecnico_agronomo", "producao", "administrativo", "financeiro", "gestor_comercial",
    ]);
    if (rolesArr.some((candidate) => !TENANT_USER_ROLES.has(candidate))) {
      return new Response(JSON.stringify({ error: "tenant_role_unavailable" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "A senha deve ter no mínimo 6 caracteres." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PARTNER_ROLES = ["parceiro_b2b", "parceiro_b2b_tecnico"];
    const isPartner = rolesArr.some((r) => PARTNER_ROLES.includes(r));
    const finalPartnerPapel: "gestor" | "tecnico" =
      partner_papel === "tecnico" || rolesArr.includes("parceiro_b2b_tecnico") ? "tecnico" : "gestor";

    if (isPartner && !partner_id) {
      return new Response(JSON.stringify({ error: "Para perfil B2B é obrigatório informar partner_id." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normaliza lista de clientes vinculados
    const finalClienteIds: string[] = Array.isArray(cliente_ids) && cliente_ids.length > 0
      ? cliente_ids
      : (cliente_id ? [cliente_id] : []);

    if (rolesArr.includes("cliente_produtor") && finalClienteIds.length === 0) {
      return new Response(JSON.stringify({ error: "Para perfil Produtor é obrigatório vincular pelo menos um cliente." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Vínculos legados de cliente/parceiro ainda não possuem ownership de organização
    // determinístico. O fluxo tenant falha fechado até a modelagem desses vínculos.
    if (finalClienteIds.length > 0 || isPartner || partner_id) {
      return new Response(JSON.stringify({ error: "tenant_link_scope_unavailable" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, created_by_admin: true },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    const rollbackCreatedUser = async () => {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) console.error("create_user_compensation_failed", { code: error.code });
    };

    const principal = principal_cliente_id && finalClienteIds.includes(principal_cliente_id)
      ? principal_cliente_id
      : finalClienteIds[0];

    const { data: updatedProfiles, error: profileError } = await adminClient
      .from("profiles")
      .update({
        telefone, cargo, cpf_cnpj, crea, especialidade,
        cliente_id: principal ?? null,
        organization_id: actorOrganizationId,
      })
      .eq("user_id", userId)
      .select("user_id");
    if (profileError || updatedProfiles?.length !== 1) {
      await rollbackCreatedUser();
      return new Response(JSON.stringify({ error: "user_profile_provision_failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roleRows = rolesArr.map((r) => ({ user_id: userId, role: r }));
    const { error: roleErr } = await adminClient.from("user_roles").insert(roleRows);
    if (roleErr) {
      await rollbackCreatedUser();
      return new Response(JSON.stringify({ error: "user_role_provision_failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

if (import.meta.main) Deno.serve((req) => handler(req));
