// Troca de e-mail de administrador provisionado (Platform Superadmin).
//
// Segurança:
// - JWT validado em código (getClaims) + gateway verify_jwt=true.
// - Somente Platform Superadmin (is_platform_superadmin no servidor).
// - service_role existe apenas aqui; RPCs de estado aceitam somente service_role.
// - Auth é alterado via Admin API (updateUserById aplica a mudança diretamente,
//   sem fluxo de confirmação — documentação oficial). Perfil e provisionamento
//   só são sincronizados DEPOIS de o Auth refletir o novo e-mail.
// - Sessões (refresh tokens) são revogadas na conclusão; access tokens já
//   emitidos seguem válidos até expirar (limitação documentada do Supabase).
// - Falha parcial deixa a operação reconciliável (retry com a mesma chave).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";
import { readWorkerEnv } from "../_shared/comunicacao/adapters.ts";
import { sendEmail } from "../_shared/comunicacao/email-adapter.ts";
import { loadRuntimeConfig } from "../_shared/comunicacao/runtime-config.ts";
import { getSmtpConfigError, isRecipientAllowedInTestMode } from "../_shared/comunicacao/adapters-types.ts";
import { classifyBeginError, parseEmailChangeBody } from "./policy.ts";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Não autorizado.", code: "unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimsError } = await anon.auth.getClaims(authHeader.slice(7));
    if (claimsError || !claims?.claims?.sub) return respond({ error: "Sessão inválida.", code: "invalid_token" }, 401);
    const actorId = String(claims.claims.sub);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: isSuper, error: superErr } = await admin.rpc("is_platform_superadmin", { _user_id: actorId });
    if (superErr) return respond({ error: "Não foi possível validar sua permissão.", code: "authorization_check_failed" }, 500);
    if (isSuper !== true) return respond({ error: "Apenas o superadmin de plataforma pode alterar e-mails.", code: "forbidden" }, 403);

    const parsed = parseEmailChangeBody(await req.json().catch(() => null));
    if (!parsed.ok) return respond({ error: parsed.message, code: parsed.code }, 400);
    const input = parsed.value;

    const { data: begun, error: beginError } = await admin.rpc("platform_begin_org_admin_email_change", {
      p_actor_id: actorId,
      p_invite_id: input.inviteId,
      p_new_email: input.newEmail,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    });
    if (beginError || !begun) {
      const e = classifyBeginError(beginError?.message ?? "");
      return respond({ error: e.message, code: e.code }, e.status);
    }
    const op = begun as Record<string, unknown>;
    const opId = String(op.op_id);
    if (op.status === "completed") {
      return respond({ success: true, status: "completed", idempotent: true, reinvite_required: op.invite_status !== "ativo" });
    }
    const markFailed = (code: string) =>
      admin.rpc("platform_mark_org_admin_email_change", { p_actor_id: actorId, p_op_id: opId, p_status: "failed", p_error_code: code });

    const userId = typeof op.user_id === "string" ? op.user_id : null;
    if (userId) {
      const { data: current, error: getErr } = await admin.auth.admin.getUserById(userId);
      if (getErr || !current?.user) {
        await markFailed("auth_lookup_failed");
        return respond({ error: "Não foi possível consultar o acesso atual.", code: "auth_lookup_failed" }, 502);
      }
      if ((current.user.email ?? "").toLowerCase() !== input.newEmail) {
        const { error: updErr } = await admin.auth.admin.updateUserById(userId, { email: input.newEmail, email_confirm: true });
        if (updErr) {
          const conflict = /already|exists|registered/i.test(updErr.message ?? "");
          await markFailed(conflict ? "auth_email_conflict" : "auth_update_failed");
          return respond({
            error: conflict ? "Este e-mail já está em uso por outro acesso." : "O acesso não foi alterado. Tente novamente.",
            code: conflict ? "auth_email_conflict" : "auth_update_failed",
          }, conflict ? 409 : 502);
        }
      }
      await admin.rpc("platform_mark_org_admin_email_change", { p_actor_id: actorId, p_op_id: opId, p_status: "auth_updated", p_error_code: null });
    }

    const { data: done, error: completeErr } = await admin.rpc("platform_complete_org_admin_email_change", { p_actor_id: actorId, p_op_id: opId });
    if (completeErr || !done) {
      await markFailed("sync_failed");
      return respond({
        error: "O acesso foi alterado, mas o cadastro ainda não foi sincronizado. Repita a operação para concluir.",
        code: "sync_pending",
        status: "pending_reconciliation",
      }, 502);
    }
    const result = done as Record<string, unknown>;
    const wasActive = result.invite_status === "ativo";

    // Aviso ao endereço anterior apenas para acesso ativo e somente se a
    // infraestrutura de e-mail estiver habilitada; caso contrário, "skipped".
    let oldAddressNotice: "sent" | "skipped" | "failed" = "skipped";
    if (wasActive) {
      try {
        const env = await loadRuntimeConfig(admin, readWorkerEnv);
        const oldEmail = String(op.old_email ?? "");
        if (env && env.DELIVERY_ENABLED && env.EMAIL_ENABLED && !getSmtpConfigError(env) &&
            isRecipientAllowedInTestMode(env, "email", oldEmail).allowed) {
          const texto = "O e-mail de acesso da sua conta Cultivo Farm foi alterado pelo administrador da plataforma. Se você não reconhece esta alteração, contate o suporte.";
          const sent = await sendEmail(env, { ok: true, canal: "email", address: oldEmail },
            { canal: "email", assunto: "Seu e-mail de acesso foi alterado", corpo: texto, variaveis: [] },
            { assunto: "Seu e-mail de acesso foi alterado", corpo: texto });
          oldAddressNotice = sent.outcome === "sent" ? "sent" : "failed";
        }
      } catch { oldAddressNotice = "failed"; }
      await admin.from("comunicacao_audit_log").insert({
        acao: "org_admin_email_change_notice",
        entidade: "platform_org_admin_email_changes",
        entity_id: opId,
        actor_id: actorId,
        after_state: { outcome: oldAddressNotice },
      });
    }

    return respond({
      success: true,
      status: "completed",
      idempotent: result.idempotent === true,
      sessions_revoked: Number(result.sessions_revoked ?? 0),
      reinvite_required: !wasActive,
      old_address_notice: oldAddressNotice,
    });
  } catch {
    return respond({ error: "Falha inesperada ao alterar o e-mail.", code: "unexpected" }, 500);
  }
});
