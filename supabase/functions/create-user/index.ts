import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  let compensate: (() => Promise<void>) | undefined;
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

    const anonClient = createClient(
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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Preserve caller JWT/iat for the canonical credential fence.
    const { data: isAdmin, error: authorizationError } = await anonClient.rpc("has_role", {
      _user_id: callerId,
      _role: "administrador",
    });

    if (authorizationError || !isAdmin) {
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

    // Existing entrypoint, actor-scoped preflight. Never authorize this branch
    // with the elevated SDK or turn a partner role into a cumulative staff role.
    if (rolesArr.some((r) => r === "parceiro_b2b" || r === "parceiro_b2b_tecnico")) {
      const dedicatedRole = rolesArr[0];
      const expectedPapel = dedicatedRole === "parceiro_b2b_tecnico" ? "tecnico" : "gestor";
      if (rolesArr.length !== 1 || (Array.isArray(rolesInput) && rolesInput.length !== 1) ||
        (role && role !== dedicatedRole) || typeof partner_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partner_id) ||
        (partner_papel != null && partner_papel !== expectedPapel) ||
        cliente_id || principal_cliente_id || (Array.isArray(cliente_ids) && cliente_ids.length > 0)) {
        return new Response(JSON.stringify({ error: "b2b_provisioning_forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: preflight, error: preflightError } = await anonClient.rpc("b2b_provisioning_preflight", {
        p_partner: partner_id, p_role: dedicatedRole, p_papel: expectedPapel,
      });
      if (preflightError || preflight?.organization_id !== actorOrganizationId ||
        preflight?.partner_id !== partner_id || preflight?.role !== dedicatedRole || preflight?.papel !== expectedPapel) {
        return new Response(JSON.stringify({ error: "b2b_provisioning_forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // This reviewed slice has no create/claim/finish capability. A remote flag
      // cannot open Auth; same-tenant general-channel containment is mandatory.
      return new Response(JSON.stringify({ error: "b2b_same_tenant_channels_unverified" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Mesmo contrato de usuariosValidation.senhaValida: não normalizar a senha.
    if (password.length < 8 || password.length > 128 ||
      !/[A-Za-zÀ-ÿ]/.test(password) || !/[0-9]/.test(password)) {
      return new Response(JSON.stringify({ error: "A senha deve ter de 8 a 128 caracteres, com ao menos uma letra e um número." }), {
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
      // Only structured, allowlisted codes may leave the provider boundary.
      const emailExists = createError.code === "email_exists" ||
        createError.code === "user_already_exists";
      console.error(emailExists ? "create_user_email_exists" : "create_user_auth_failed");
      return new Response(JSON.stringify({ error: emailExists ? "email_exists" : "user_creation_failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    const rollbackCreatedUser = async () => {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) console.error("create_user_compensation_failed");
      else compensate = undefined;
    };

    compensate = rollbackCreatedUser;

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

    compensate = undefined;
    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    if (compensate) {
      try { await compensate(); } catch { console.error("create_user_compensation_failed"); }
    }
    return new Response(JSON.stringify({ error: "user_creation_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
