import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
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

    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: callerId,
      _role: "administrador",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const principal = principal_cliente_id && finalClienteIds.includes(principal_cliente_id)
      ? principal_cliente_id
      : finalClienteIds[0];

    // Insere vínculos N:N antes de atribuir role (trigger enforce_cliente_id_for_produtor exige)
    if (finalClienteIds.length > 0) {
      const rows = finalClienteIds.map((cid) => ({
        user_id: userId,
        cliente_id: cid,
        principal: cid === principal,
      }));
      const { error: vincErr } = await adminClient.from("user_clientes").insert(rows);
      if (vincErr) {
        return new Response(JSON.stringify({ error: "Falha ao vincular clientes: " + vincErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    await adminClient
      .from("profiles")
      .update({
        telefone, cargo, cpf_cnpj, crea, especialidade,
        cliente_id: principal ?? null,
      })
      .eq("user_id", userId);

    await adminClient.from("user_roles").delete().eq("user_id", userId);
    const roleRows = rolesArr.map((r) => ({ user_id: userId, role: r }));
    const { error: roleErr } = await adminClient.from("user_roles").insert(roleRows);
    if (roleErr) {
      return new Response(JSON.stringify({ error: roleErr.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Vincula ao parceiro B2B quando aplicável
    if (isPartner) {
      const { error: puErr } = await adminClient
        .from("partner_users")
        .insert({ user_id: userId, partner_id, papel: finalPartnerPapel });
      if (puErr) {
        return new Response(JSON.stringify({ error: "Falha ao vincular ao parceiro B2B: " + puErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
});
