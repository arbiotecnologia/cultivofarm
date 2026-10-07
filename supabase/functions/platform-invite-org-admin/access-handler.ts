import { createClient } from "npm:@supabase/supabase-js@2.110.8";
import { parseAccess, temporaryPassword } from "./access-policy.ts";
import { getPlatformInviteRedirectUrl } from "./redirect-policy.ts";
import { loadRuntimeConfig } from "../_shared/comunicacao/runtime-config.ts";
import { readWorkerEnv } from "../_shared/comunicacao/adapters.ts";
import { sendEmail } from "../_shared/comunicacao/email-adapter.ts";
import { getSmtpConfigError, isRecipientAllowedInTestMode } from "../_shared/comunicacao/adapters-types.ts";

export async function handleAccess(admin: ReturnType<typeof createClient>, actorId: string, body: Record<string, unknown>, respond: (body: unknown, status?: number, noStore?: boolean) => Response) {
  const input = parseAccess(body);
  if (!input) return respond({ error: "Confirme uma operação válida.", code: "invalid_access_request" }, 400, true);
  const { data: state, error: stateError } = await admin.rpc("platform_org_admin_access_state", { p_actor_id: actorId, p_invite_id: input.inviteId });
  if (stateError || !state) return respond({ error: "Acesso indisponível para esta operação.", code: "target_denied" }, 403, true);
  const { data: auth, error: authError } = await admin.auth.admin.getUserById(String(state.user_id));
  if (authError || !auth.user) return respond({ error: "Não foi possível validar o acesso.", code: "auth_lookup_failed" }, 503, true);
  const suspended = !state.active || (auth.user.banned_until && Date.parse(auth.user.banned_until) > Date.now());
  const expired = state.provisional_expires_at && Date.parse(state.provisional_expires_at) <= Date.now();
  if (input.action === "state") return respond({
    status: suspended ? "suspended" : expired ? "expired" : auth.user.new_email ? "email_confirmation" : state.pending_password ? "temporary_password" : state.status === "pendente" ? "invited" : "active",
    last_sent_at: state.last_sent_at, next_attempt_at: state.next_attempt_at, expires_at: state.provisional_expires_at,
  }, 200, true);
  if (suspended) return respond({ error: "Acesso suspenso. Nenhuma credencial foi alterada.", code: "access_suspended" }, 409, true);
  const env = await loadRuntimeConfig(admin, readWorkerEnv);
  if (input.action === "password_link" && (!env.DELIVERY_ENABLED || !env.EMAIL_ENABLED || getSmtpConfigError(env) || !isRecipientAllowedInTestMode(env, "email", auth.user.email ?? "").allowed)) {
    return respond({ error: "Entrega segura indisponível para este destinatário.", code: "delivery_not_ready" }, 503, true);
  }
  const { data: claim, error } = await admin.rpc("platform_claim_admin_access", { p_actor_id: actorId, p_invite_id: input.inviteId, p_operation_id: input.operationId, p_kind: input.action });
  if (error || !claim) return respond({ error: "Operação indisponível. Aguarde e atualize o estado.", code: "access_busy_or_denied" }, 409, true);
  if (claim.idempotent) return respond({ status: claim.status, idempotent: true, senha_temporaria: null }, 200, true);
  const finish = async (outcome: string) => {
    const result = await admin.rpc("platform_finish_admin_access", { p_actor_id: actorId, p_invite_id: input.inviteId, p_operation_id: input.operationId, p_lease_token: claim.lease_token, p_outcome: outcome });
    return !result.error;
  };
  if (input.action === "temporary_password") {
    let password: string | null = temporaryPassword();
    const { error: updateError } = await admin.auth.admin.updateUserById(String(claim.user_id), { password });
    if (updateError) { password = null; await finish("failed"); return respond({ error: "Não foi possível concluir. O acesso permanece bloqueado.", code: "password_update_failed" }, 502, true); }
    if (!await finish("completed")) { password = null; return respond({ error: "Acesso bloqueado até reconciliação. A senha não será revelada.", code: "access_reconciliation_required" }, 503, true); }
    return respond({ status: "completed", senha_temporaria: password, expires_at: new Date(Date.now() + 86400000).toISOString() }, 200, true);
  }
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "recovery", email: String(claim.email), options: { redirectTo: getPlatformInviteRedirectUrl() } });
  if (linkError || !link?.properties?.action_link) { await finish("failed"); return respond({ error: "Não foi possível preparar o envio.", code: "link_failed" }, 502, true); }
  let outcome = "ambiguous";
  try {
    const sent = await sendEmail(env, { ok: true, canal: "email", address: String(claim.email) }, { canal: "email", assunto: "Defina seu acesso ao Cultivo Farm", corpo: "Link de acesso", variaveis: [] }, { assunto: "Defina seu acesso ao Cultivo Farm", corpo: `Use o link seguro para definir sua senha pessoal:\n${link.properties.action_link}\n\nSe você não solicitou, ignore.` });
    outcome = sent.outcome === "sent" ? "completed" : sent.certainty === "ambiguous" ? "ambiguous" : "failed";
  } catch { outcome = "ambiguous"; }
  if (!await finish(outcome)) outcome = "ambiguous";
  return respond(outcome === "completed" ? { status: "completed", email_status: "accepted" } : { error: "Entrega não confirmada. Verifique antes de tentar novamente.", code: "delivery_unconfirmed" }, outcome === "completed" ? 200 : 409, true);
}