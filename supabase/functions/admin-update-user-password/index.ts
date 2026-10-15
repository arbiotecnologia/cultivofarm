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
    const failure = (status: number, code: string) => new Response(JSON.stringify({ code }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return failure(401, "ADMIN_PASSWORD_UNAUTHORIZED");
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return failure(500, "ADMIN_PASSWORD_INTERNAL_ERROR");
    const anonClient = createClient(
      url,
      anonKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return failure(401, "ADMIN_PASSWORD_UNAUTHORIZED");
    }

    const callerId = user.id;

    // Authorize with the validated caller JWT, never service_role.
    const { data: isAdmin, error: roleError } = await anonClient.rpc("has_role", {
      _user_id: callerId,
      _role: "administrador",
    });

    if (roleError) return failure(500, "ADMIN_PASSWORD_AUTHORIZATION_ERROR");
    if (isAdmin !== true) return failure(403, "ADMIN_PASSWORD_FORBIDDEN");

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return failure(400, "ADMIN_PASSWORD_INVALID_INPUT");
    const { user_id, new_password } = body;
    if (typeof user_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id)) return failure(400, "ADMIN_PASSWORD_INVALID_INPUT");
    // Same policy as usuariosValidation.senhaValida; preserve accented letters.
    if (typeof new_password !== "string" || new_password.length < 8 || new_password.length > 128 || !/[A-Za-zÀ-ÿ]/.test(new_password) || !/[0-9]/.test(new_password)) return failure(400, "ADMIN_PASSWORD_INVALID_PASSWORD");

    const { data: canUpdate, error: scopeError } = await anonClient.rpc(
      "admin_can_update_user_password_server",
      { p_actor_id: callerId, p_target_id: user_id },
    );
    if (scopeError) return failure(500, "ADMIN_PASSWORD_AUTHORIZATION_ERROR");
    if (canUpdate !== true) return failure(403, "ADMIN_PASSWORD_FORBIDDEN");

    const adminClient = createClient(url, serviceKey);
    // Password only: no email confirmation, metadata or first-access flag changes.
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, {
      password: new_password,
    });

    if (updateError) {
      return failure(500, "ADMIN_PASSWORD_UPDATE_FAILED");
    }

    // Registrar na auditoria
    const { error: auditError } = await adminClient.from("audit_senha_log").insert({
      executor_id: callerId,
      target_user_id: user_id,
    });

    if (auditError) {
      console.error("admin_password_audit_failed");
      // Não bloqueia a resposta de sucesso se a senha foi alterada, mas loga o erro
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ code: "ADMIN_PASSWORD_INTERNAL_ERROR" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
