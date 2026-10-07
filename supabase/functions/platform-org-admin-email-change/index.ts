// Alteração confirmada pelo titular; nenhum bypass de confirmação Auth.
import { createClient } from "npm:@supabase/supabase-js@2.110.8";
import { authorizeSuperadmin } from "./auth.ts";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";
import { readWorkerEnv } from "../_shared/comunicacao/adapters.ts";
import { sendEmail } from "../_shared/comunicacao/email-adapter.ts";
import { loadRuntimeConfig } from "../_shared/comunicacao/runtime-config.ts";
import { getSmtpConfigError, isRecipientAllowedInTestMode } from "../_shared/comunicacao/adapters-types.ts";
import { classifyBeginError, parseEmailChangeBody } from "./policy.ts";
import { getPlatformInviteRedirectUrl } from "../platform-invite-org-admin/redirect-policy.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handlePreflight(req);
  const origin = req.headers.get("Origin");
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeadersFor(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  if (origin && !isTrustedOrigin(origin)) return respond({ error: "Origem não autorizada.", code: "origin_forbidden" }, 403);
  if (req.method !== "POST") return respond({ error: "Método não permitido.", code: "method_not_allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url !== "https://swzpzcwiasxmjutrmvkm.supabase.co" || !serviceKey) return respond({ error: "Serviço indisponível.", code: "server_misconfigured" }, 500);
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const authz = await authorizeSuperadmin(req.headers.get("Authorization"), admin);
    if (!authz.ok) return respond({ error: authz.error, code: authz.code }, authz.status);
    const actorId = authz.actorId;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return respond({ error: "Dados inválidos.", code: "invalid_body" }, 400);
    const action = body.action ?? "request";
    if (!["request", "resend", "reconcile", "cancel"].includes(action)) return respond({ error: "Operação inválida.", code: "invalid_action" }, 400);
    if (body.user_id !== undefined || body.organization_id !== undefined) return respond({ error: "Operação não permitida.", code: "target_denied" }, 403);
    if (action === "cancel") return respond({ error: "O Auth não oferece cancelamento administrativo seguro dos links já emitidos. Nenhuma alteração foi feita.", code: "cancel_not_supported" }, 409);
    const parsed = parseEmailChangeBody(body);
    if (!parsed.ok) return respond({ error: parsed.message, code: parsed.code }, 400);
    const input = parsed.value;
    const { data: begun, error: beginError } = await admin.rpc("platform_begin_org_admin_email_change", {
      p_actor_id: actorId, p_invite_id: input.inviteId, p_new_email: input.newEmail,
      p_reason: input.reason, p_idempotency_key: input.idempotencyKey,
    });
    if (beginError || !begun) {
      const e = classifyBeginError(beginError?.message ?? "");
      return respond({ error: e.message, code: e.code }, e.status);
    }
    if (begun.status === "completed") return respond({ status: "completed", idempotent: true });
    if (!begun.user_id || begun.user_id === actorId) return respond({ error: "Acesso indisponível para esta operação.", code: "target_denied" }, 403);
    const { data: current, error: getErr } = await admin.auth.admin.getUserById(String(begun.user_id));
    if (getErr || !current.user) return respond({ error: "Não foi possível validar o acesso.", code: "auth_lookup_failed" }, 502);
    if (current.user.email?.toLowerCase() === input.newEmail && !current.user.new_email) {
      const { data: done, error } = await admin.rpc("platform_complete_org_admin_email_change", { p_actor_id: actorId, p_op_id: begun.op_id });
      return error ? respond({ error: "Confirmação ainda não conciliada.", code: "reconciliation_pending" }, 409) : respond(done);
    }
    if (action === "reconcile") return respond({ status: "pending", confirmed: false });
    if (action === "request" && begun.idempotent) return respond({ status: "pending", idempotent: true });
    // No settings are changed; require both addresses to be deliverable. The
    // current-address API refuses safely when secure-email-change is disabled.
    const env = await loadRuntimeConfig(admin, readWorkerEnv);
    if (!env.DELIVERY_ENABLED || !env.EMAIL_ENABLED || getSmtpConfigError(env) ||
        ![String(begun.old_email), input.newEmail].every(email => isRecipientAllowedInTestMode(env, "email", email).allowed)) {
      return respond({ error: "Entrega segura indisponível. O e-mail atual permanece válido.", code: "delivery_not_ready", status: "pending" }, 503);
    }
    const { data: lease, error: leaseError } = await admin.rpc("platform_claim_email_confirmation", { p_actor_id: actorId, p_op_id: begun.op_id, p_confirm_ambiguous: body.confirm_ambiguous_email_retry === true });
    if (leaseError || !lease) return respond({ error: "Aguarde o prazo de reenvio ou verifique a entrega anterior.", code: "confirmation_busy" }, 409);
    let outcome = "failed";
    try {
      const oldLink = await admin.auth.admin.generateLink({ type: "email_change_current", email: String(begun.old_email), newEmail: input.newEmail, options: { redirectTo: getPlatformInviteRedirectUrl() } });
      // Only the specific disabled-secure-change error permits single-address mode.
      const secureDisabled = oldLink.error?.message === "Enable secure email change to generate link for current email";
      if (oldLink.error && !secureDisabled) throw new Error("link_generation_failed");
      const newLink = await admin.auth.admin.generateLink({ type: "email_change_new", email: String(begun.old_email), newEmail: input.newEmail, options: { redirectTo: getPlatformInviteRedirectUrl() } });
      if (newLink.error || !newLink.data?.properties?.action_link) throw new Error("link_generation_failed");
      const deliveries = [{ email: input.newEmail, link: newLink.data.properties.action_link }];
      if (!secureDisabled) {
        if (!oldLink.data?.properties?.action_link) throw new Error("link_generation_failed");
        deliveries.unshift({ email: String(begun.old_email), link: oldLink.data.properties.action_link });
      }
      for (const delivery of deliveries) {
        outcome = "ambiguous";
        const text = `Confirme a alteração do seu e-mail de acesso ao Cultivo Farm:\n${delivery.link}\nSe não reconhece a solicitação, não confirme.`;
        const result = await sendEmail(env, { ok: true, canal: "email", address: delivery.email }, { canal: "email", assunto: "Confirme seu e-mail", corpo: "Confirmação segura", variaveis: [] }, { assunto: "Confirme seu e-mail", corpo: text });
        if (result.outcome !== "sent") break;
        outcome = "sent";
      }
    } catch { /* No raw error, credential, token or link is returned or logged. */ }
    const finished = await admin.rpc("platform_finish_email_confirmation", { p_actor_id: actorId, p_op_id: begun.op_id, p_lease: lease, p_outcome: outcome });
    if (finished.error || outcome !== "sent") return respond({ error: "Entrega não confirmada. Não reenvie sem verificar a caixa de entrada.", code: "delivery_unconfirmed", status: "pending" }, 409);
    return respond({ status: "pending", confirmation_sent: true });
  } catch {
    return respond({ error: "Falha inesperada ao alterar o e-mail.", code: "unexpected" }, 500);
  }
});
