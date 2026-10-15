import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Code-reviewed activation, never request/env authority; server guards still apply.
const B2B_PROVISIONING_CHANNELS_REVIEWED = true;

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
    if (rolesArr.some((r) => ["parceiro_b2b", "parceiro_b2b_tecnico", "cliente_produtor"].includes(r))) {
      if (Deno.env.get("SUPABASE_URL") !== "https://swzpzcwiasxmjutrmvkm.supabase.co" ||
        typeof callerId !== "string" || !callerId || claimsData.claims.role !== "authenticated" ||
        !Number.isSafeInteger(claimsData.claims.iat)) {
        return new Response(JSON.stringify({ error: "b2b_provisioning_forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const dedicatedRole = rolesArr[0];
      const expectedPapel = dedicatedRole === "parceiro_b2b_tecnico" ? "tecnico" : "gestor";
      const isProducer = dedicatedRole === "cliente_produtor";
      const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      const clients = Array.isArray(cliente_ids) ? cliente_ids : cliente_id ? [cliente_id] : [];
      const primary = principal_cliente_id ?? clients[0] ?? null;
      const forgedScope = ["organization_id", "org_id", "tenant_id", "tenant", "organization", "owner_organization_id"].some(field => Object.prototype.hasOwnProperty.call(body, field));
      const conflictingClients = (cliente_ids != null && !Array.isArray(cliente_ids)) ||
        (cliente_id != null && (!uuid(cliente_id) || (Array.isArray(cliente_ids) &&
          (cliente_ids.length !== 1 || cliente_ids[0] !== cliente_id))));
      if (forgedScope || conflictingClients || (!["parceiro_b2b", "cliente_produtor"].includes(dedicatedRole)) || rolesArr.length !== 1 || (Array.isArray(rolesInput) && rolesInput.length !== 1) ||
        (role && role !== dedicatedRole) || (!isProducer && (!uuid(partner_id) || clients.length || primary ||
        (partner_papel != null && partner_papel !== expectedPapel))) ||
        (isProducer && (partner_id != null || partner_papel != null || clients.length < 1 || clients.length > 100 ||
        !clients.every(uuid) || new Set(clients).size !== clients.length || !clients.includes(primary)))) {
        return new Response(JSON.stringify({ error: "b2b_provisioning_forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isProducer) {
        const { data: preflight, error: preflightError } = await anonClient.rpc("b2b_provisioning_preflight", {
          p_partner: partner_id, p_role: dedicatedRole, p_papel: expectedPapel,
        });
        if (preflightError || preflight?.organization_id !== actorOrganizationId ||
          preflight?.partner_id !== partner_id || preflight?.role !== dedicatedRole || preflight?.papel !== expectedPapel) {
          return new Response(JSON.stringify({ error: "b2b_provisioning_forbidden" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      const reply = (value: unknown, status: number) => new Response(JSON.stringify(value), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
      if (!B2B_PROVISIONING_CHANNELS_REVIEWED) {
        return reply({ error: "b2b_same_tenant_channels_unverified" }, 503);
      }
      // Operator never supplies/receives a password, link or token. Auth sends
      // nothing via createUser; the holder's existing recovery flow is separate.
      const key = body.idempotency_key;
      if (password != null || typeof email !== "string" || email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof nome !== "string" ||
        !nome.trim() || nome.trim().length > 200 || typeof key !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
        return reply({ error: "b2b_provisioning_invalid" }, 400);
      }
      const { data: claim, error: claimError } = await anonClient.rpc("b2b_claim_provisioning", {
        p_partner: isProducer ? null : partner_id, p_key: key, p_email: email.trim().toLowerCase(), p_nome: nome.trim(),
        p_role: dedicatedRole, p_clients: clients, p_primary: primary,
      });
      if (claimError || !claim?.claim_id || !claim?.fence || !claim?.user_id ||
        claim.organization_id !== actorOrganizationId) return reply({ error: "b2b_provisioning_conflict" }, 409);
      const receiptArgs = { p_claim: claim.claim_id, p_fence: claim.fence, p_user: claim.user_id };
      const reconcileOrCompensate = async () => {
        const { data: state, error } = await adminClient.rpc("b2b_prepare_provisioning_compensation", receiptArgs);
        if (error || !["completed", "compensating", "aborted"].includes(state)) {
          return reply({ error: "b2b_provisioning_reconciliation_required" }, 503);
        }
        if (state === "completed") return reply({ success: true, user_id: claim.user_id, replay: true }, 200);
        if (state === "aborted") return reply({ error: "b2b_provisioning_aborted" }, 409);
        try {
        const { data: owned, error: ownedError } = await adminClient.auth.admin.getUserById(claim.user_id);
        if (!owned?.user && ownedError?.status === 404) {
          // Only complete under SQL receipt+absence checks; no delete on uncertain lookup.
          const { data: done, error: doneError } = await adminClient.rpc("b2b_complete_provisioning_compensation", receiptArgs);
          return !doneError && done === true ? reply({ error: "b2b_provisioning_aborted" }, 409)
            : reply({ error: "b2b_provisioning_compensation_pending" }, 503);
        }
        if (ownedError || owned?.user?.id !== claim.user_id ||
          owned.user.email?.toLowerCase() !== email.trim().toLowerCase() ||
          owned.user.app_metadata?.b2b_provisioning_receipt !== claim.claim_id) {
          return reply({ error: "b2b_provisioning_reconciliation_required" }, 503);
        }
        const { error: deletionError } = await adminClient.auth.admin.deleteUser(claim.user_id);
        if (deletionError) return reply({ error: "b2b_provisioning_compensation_pending" }, 503);
        const { data: done, error: doneError } = await adminClient.rpc("b2b_complete_provisioning_compensation", receiptArgs);
        return !doneError && done === true ? reply({ error: "b2b_provisioning_aborted" }, 409)
          : reply({ error: "b2b_provisioning_compensation_pending" }, 503);
        } catch {
          return reply({ error: "b2b_provisioning_compensation_pending" }, 503);
        }
      };
      if (claim.status === "completed") {
        const { data, error } = await adminClient.rpc("b2b_finish_provisioning", receiptArgs);
        return !error && data?.success === true ? reply({ success: true, user_id: claim.user_id, replay: true }, 200)
          : reply({ error: "b2b_provisioning_reconciliation_required" }, 409);
      }
      if (claim.status === "compensating") return await reconcileOrCompensate();
      if (claim.status === "aborted") return reply({ error: "b2b_provisioning_aborted" }, 409);
      if (claim.status === "claimed" && claim.acquired !== true) {
        // Only reconcile the already reserved UUID. No Auth create/delete on retry.
        const pending = () => reply({ error: "b2b_provisioning_auth_pending", status: "pending",
          recovery_required: true, retry_same_request: true,
          message: "Cadastro pendente de verificação. Preserve a mesma solicitação e o mesmo email; a recuperação controlada não cria outra identidade." }, 409);
        let lookup;
        try { lookup = await adminClient.auth.admin.getUserById(claim.user_id); }
        catch { return pending(); }
        const { data: owned, error: ownedError } = lookup;
        // Absence (even 404) is not proof the first worker cannot still create.
        // No reset, reacquire, lease authority, delete, second UUID or new email.
        if (ownedError || !owned?.user) return pending();
        if (owned.user.id !== claim.user_id ||
          owned.user.email?.toLowerCase() !== email.trim().toLowerCase() ||
          owned.user.app_metadata?.b2b_provisioning_receipt !== claim.claim_id) {
          return reply({ error: "b2b_provisioning_reconciliation_required" }, 409);
        }
        const { data, error } = await adminClient.rpc("b2b_finish_provisioning", receiptArgs);
        return !error && data?.success === true ? reply({ success: true, user_id: claim.user_id, replay: true }, 200)
          : reply({ error: "b2b_provisioning_reconciliation_required" }, 409);
      }
      if (claim.status !== "claimed" || claim.lease_valid !== true || claim.acquired !== true) {
        return reply({ error: "b2b_provisioning_reconciliation_required" }, 409);
      }
      try {
        // Reserved ID makes concurrent/retried creates converge, never email-based
        // adoption of an existing user. Metadata is provenance, not authorization.
        const { data: created, error: authError } = await adminClient.auth.admin.createUser({
          id: claim.user_id, email: email.trim().toLowerCase(), email_confirm: false,
          user_metadata: { nome: nome.trim() },
          app_metadata: { b2b_provisioning_receipt: claim.claim_id },
        });
        if (authError || created?.user?.id !== claim.user_id) {
          const { data: existing, error: lookupError } = await adminClient.auth.admin.getUserById(claim.user_id);
          if (lookupError || existing?.user?.id !== claim.user_id ||
            existing.user.email?.toLowerCase() !== email.trim().toLowerCase() ||
            existing.user.app_metadata?.b2b_provisioning_receipt !== claim.claim_id) {
            // Never delete/adopt an unrelated identity; receipt stays fenced.
            return reply({ error: "b2b_provisioning_reconciliation_required" }, 409);
          }
        }
        const { data: finished, error: finishError } = await adminClient.rpc("b2b_finish_provisioning", receiptArgs);
        if (finishError || finished?.success !== true) return await reconcileOrCompensate();
        return reply({ success: true, user_id: claim.user_id, first_access_pending: true }, 200);
      } catch {
        try { return await reconcileOrCompensate(); }
        catch { return reply({ error: "b2b_provisioning_reconciliation_required" }, 503); }
      }
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
