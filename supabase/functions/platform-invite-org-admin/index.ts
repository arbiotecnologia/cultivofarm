// Provisionamento de Administrador de Empresa pelo Superadmin de Plataforma.
//
// Segurança:
// - JWT obrigatório e validado em código (config.toml: verify_jwt = true).
// - Somente `superadmin` (verificado no servidor via is_platform_superadmin).
// - A intenção é persistida antes do Auth e retomada com lease/fencing.
// - O papel `superadmin` NUNCA é concedido aqui; o usuário criado recebe
//   exclusivamente `administrador` da empresa indicada.
// - Nenhum segredo é devolvido além da senha temporária solicitada pelo
//   próprio superadmin no momento da criação.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readWorkerEnv } from "../_shared/comunicacao/adapters.ts";
import { sendEmail } from "../_shared/comunicacao/email-adapter.ts";
import { deliverInviteEmail, type InviteEmailClaim } from "../_shared/comunicacao/invite-email-delivery.ts";
import { loadRuntimeConfig } from "../_shared/comunicacao/runtime-config.ts";
import { getSmtpConfigError, isRecipientAllowedInTestMode } from "../_shared/comunicacao/adapters-types.ts";
import { classifyFinalizeError, finalizeErrorResponse } from "../_shared/platform-invite-errors.ts";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";
import { getPlatformInviteRedirectUrl } from "./redirect-policy.ts";

const json = (body: unknown, status = 200, origin: string | null = null, noStore = false) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(origin),
      "Content-Type": "application/json",
      ...(noStore ? { "Cache-Control": "no-store, private" } : {}),
    },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AMBIGUOUS_CODES = new Set([
  "email_unknown_error",
  "email_send_ambiguous",
  "email_accept_persistence_failed",
  "email_timeout",
  "email_network_error",
  "email_send_crash",
  "email_delivery_setup_failed",
]);

async function maskedId(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 6).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function senhaTemporaria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  const base = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
  // Garante complexidade mínima (letra, número e símbolo).
  return `${base}#7`;
}

function soDigitos(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handlePreflight(req);
  const requestOrigin = req.headers.get("Origin");
  if (requestOrigin && !isTrustedOrigin(requestOrigin)) {
    return json({ error: "Origem não autorizada." }, 403, requestOrigin);
  }

  const respond = (body: unknown, status = 200, noStore = false) => json(body, status, requestOrigin, noStore);
  const correlationId = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Não autorizado" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return respond({ error: "Sessão inválida" }, 401);
    const callerId = claimsData.claims.sub as string;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: isSuper, error: superErr } = await adminClient.rpc("is_platform_superadmin", {
      _user_id: callerId,
    });
    if (superErr) return respond({ error: "Não foi possível validar sua permissão." }, 500);
    if (isSuper !== true) {
      return respond({ error: "Apenas o superadmin de plataforma pode convidar administradores." }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return respond({ error: "Dados inválidos." }, 400);

    const organizationId = String((body as Record<string, unknown>).organization_id ?? "");
    const nome = String((body as Record<string, unknown>).nome ?? "").trim();
    const email = String((body as Record<string, unknown>).email ?? "").trim().toLowerCase();
    const cpf = soDigitos((body as Record<string, unknown>).cpf);
    const telefone = soDigitos((body as Record<string, unknown>).telefone);
    const modo = String((body as Record<string, unknown>).modo_acesso ?? "link");
    const responsavelPrincipal =
      (body as Record<string, unknown>).responsavel_principal !== false;
    const confirmAmbiguousEmailRetry =
      (body as Record<string, unknown>).confirm_ambiguous_email_retry === true;
    const deliveryMode = String((body as Record<string, unknown>).delivery_mode ?? "email");

    if (!UUID_RE.test(organizationId)) return respond({ error: "Selecione a empresa." }, 400);
    if (nome.length < 3 || nome.length > 200) return respond({ error: "Informe o nome completo." }, 400);
    if (!EMAIL_RE.test(email)) return respond({ error: "Informe um e-mail válido." }, 400);
    if (cpf && cpf.length !== 11) return respond({ error: "CPF deve ter 11 dígitos." }, 400);
    if (telefone && (telefone.length < 10 || telefone.length > 11)) {
      return respond({ error: "Telefone deve ter 10 ou 11 dígitos." }, 400);
    }
    if (modo !== "link" && modo !== "senha_temporaria") {
      return respond({ error: "Modo de acesso inválido." }, 400);
    }
    if (deliveryMode !== "email" && deliveryMode !== "manual_link") {
      return respond({ error: "Forma de entrega inválida." }, 400);
    }
    if (deliveryMode === "manual_link" && modo !== "link") {
      return respond({ error: "O link manual exige acesso por link.", code: "manual_link_requires_link_mode" }, 400);
    }
    const isManualLink = deliveryMode === "manual_link";

    // O Origin continua validado no início da requisição para impedir chamadas
    // indevidas, mas nunca define o destino de um convite operacional.
    const redirectTo = getPlatformInviteRedirectUrl();

    // Fail-closed antes de qualquer claim/mutação: o Supabase Edge Runtime
    // bloqueia saída SMTP nas portas 25 e 587.
    const runtimeEnv = isManualLink ? null : await loadRuntimeConfig(adminClient, readWorkerEnv);
    if (modo === "link" && !isManualLink && runtimeEnv) {
      if (!runtimeEnv.DELIVERY_ENABLED || !runtimeEnv.EMAIL_ENABLED) {
        return respond({ error: "A entrega por e-mail está desativada.", code: "email_disabled" }, 503);
      }
      const smtpConfigError = getSmtpConfigError(runtimeEnv);
      if (smtpConfigError) {
        return respond({ error: "A configuração de e-mail não está pronta para este ambiente.", code: smtpConfigError }, 503);
      }
      const recipientGate = isRecipientAllowedInTestMode(runtimeEnv, "email", email);
      if (!recipientGate.allowed) {
        return respond({ error: "Destinatário não autorizado para o modo de teste.", code: recipientGate.reason ?? "test_mode_not_allowlisted" }, 403);
      }
    }

    const { data: claimed, error: claimError } = await adminClient.rpc(
      "platform_claim_org_admin_provisioning",
      {
        p_actor_id: callerId,
        p_organization_id: organizationId,
        p_email: email,
        p_nome: nome,
        p_cpf_cnpj: cpf,
        p_telefone: telefone,
        p_modo_acesso: modo,
        p_responsavel_principal: responsavelPrincipal,
        p_confirm_ambiguous_email_retry: confirmAmbiguousEmailRetry,
        p_delivery_mode: deliveryMode,
      },
    );
    if (claimError || !claimed) {
      const ambiguousConfirmationRequired = claimError?.message?.includes("email_ambiguous_confirmation_required") === true;
      const code = ambiguousConfirmationRequired
        ? "email_ambiguous_confirmation_required"
        : claimError?.code === "55P03" ? "provisioning_busy" : "claim_failed";
      const message = ambiguousConfirmationRequired
        ? "Não foi possível confirmar a entrega anterior. Verifique a caixa de entrada antes de reenviar."
        : code === "provisioning_busy" ? "Provisionamento já está em andamento." : "Não foi possível reservar o provisionamento.";
      return respond({ error: message, code }, code === "claim_failed" ? 400 : 409);
    }
    const job = claimed as Record<string, unknown>;
    if (job.completed === true) {
      if (isManualLink) {
        return respond({ error: "Este acesso já foi concluído.", code: "manual_link_access_completed" }, 409);
      }
      return respond({ success: true, user_id: String(job.user_id ?? ""), senha_temporaria: null, email_status: "not_required", status: "ativo", idempotent: true });
    }
    const jobId = String(job.job_id ?? "");
    const requestId = String(job.request_id ?? "");
    const leaseToken = String(job.lease_token ?? "");

    let userId: string | null = null;
    let actionLink: string | null = null;
    let senha: string | null = null;
    let criamosUsuario = false;
    const auditManualLink = async (outcome: "success" | "failure", reason?: string) => {
      if (!isManualLink) return;
      await adminClient.from("comunicacao_audit_log").insert({
        acao: "manual_access_link_generated",
        entidade: "platform_org_admin_invites",
        entity_id: jobId,
        actor_id: callerId,
        after_state: {
          organization_id: organizationId,
          origin: "platform_admin",
          outcome,
          reason: reason ?? "fallback de entrega",
        },
      });
    };

    // Retomada Auth↔DB: busca server-only exige o marcador imutável da intenção
    // em app_metadata. E-mail isolado e user_metadata nunca autorizam adoção.
    const { data: resumableId, error: resumeError } = await adminClient.rpc(
      "platform_find_org_admin_provisioning_auth_user",
      { p_job_id: jobId, p_lease_token: leaseToken },
    );
    if (resumeError) {
      await adminClient.rpc("platform_fail_org_admin_provisioning", {
        p_job_id: jobId, p_lease_token: leaseToken, p_error_code: "resume_lookup_failed",
      });
      return respond({ error: "Não foi possível retomar o provisionamento.", code: "resume_lookup_failed" }, 500);
    }
    if (typeof resumableId === "string" && UUID_RE.test(resumableId)) userId = resumableId;

    // Reenvio/retomada nunca cria outra conta: renova somente a credencial
    // da conta cuja origem server-only corresponde à intenção persistida.
    if (userId && modo === "link") {
      const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery", email, options: { redirectTo },
      });
      if (linkError || !link?.properties?.action_link) {
        await adminClient.rpc("platform_fail_org_admin_provisioning", {
          p_job_id: jobId, p_lease_token: leaseToken, p_error_code: "link_failed",
        });
        await auditManualLink("failure", "link_failed");
        return respond({ error: "Não foi possível gerar o convite.", code: "link_failed" }, 500, isManualLink);
      }
      actionLink = link.properties.action_link;
    } else if (userId) {
      senha = senhaTemporaria();
      const { error: resetError } = await adminClient.auth.admin.updateUserById(userId, {
        password: senha,
      });
      if (resetError) {
        senha = null;
        await adminClient.rpc("platform_fail_org_admin_provisioning", {
          p_job_id: jobId, p_lease_token: leaseToken, p_error_code: "temporary_password_failed",
        });
        return respond({ error: "Não foi possível renovar a senha temporária.", code: "temporary_password_failed" }, 500);
      }
    }

    if (!userId && modo === "link") {
      // Cria primeiro com app_metadata server-only; generateLink(recovery) apenas
      // produz o link e não duplica a conta nem envia e-mail.
      const bootstrapPassword = senhaTemporaria();
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: bootstrapPassword,
        email_confirm: true,
        user_metadata: { nome, convidado_por_plataforma: true },
        app_metadata: { provisioning_request_id: requestId },
      });
      if (createError || !created?.user) {
        const jaExiste = (createError?.message ?? "").toLowerCase().includes("already");
        await adminClient.rpc("platform_fail_org_admin_provisioning", {
          p_job_id: jobId, p_lease_token: leaseToken, p_error_code: jaExiste ? "auth_conflict" : "auth_create_failed",
        });
        return respond(
          {
            error: jaExiste
              ? "Já existe um acesso com este e-mail."
              : "Não foi possível gerar o convite.",
          },
          400,
        );
      }
      userId = created.user.id;
      criamosUsuario = true;
      const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery", email, options: { redirectTo },
      });
      if (linkError || !link?.properties?.action_link) {
        await adminClient.auth.admin.deleteUser(userId).catch(() => undefined);
        await adminClient.rpc("platform_fail_org_admin_provisioning", {
          p_job_id: jobId, p_lease_token: leaseToken, p_error_code: "link_failed",
        });
        await auditManualLink("failure", "link_failed");
        return respond({ error: "Não foi possível gerar o convite.", code: "link_failed" }, 500, isManualLink);
      }
      actionLink = link.properties.action_link;
    } else if (!userId) {
      senha = senhaTemporaria();
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome, convidado_por_plataforma: true },
        app_metadata: { provisioning_request_id: requestId },
      });
      if (error || !data?.user) {
        const jaExiste = (error?.message ?? "").toLowerCase().includes("already");
        await adminClient.rpc("platform_fail_org_admin_provisioning", {
          p_job_id: jobId, p_lease_token: leaseToken, p_error_code: jaExiste ? "auth_conflict" : "auth_create_failed",
        });
        return respond(
          {
            error: jaExiste
              ? "Já existe um acesso com este e-mail."
              : "Não foi possível criar o acesso.",
          },
          400,
        );
      }
      userId = data.user.id;
      criamosUsuario = true;
    }

    if (!userId) return respond({ error: "Não foi possível identificar o acesso.", code: "auth_missing" }, 500);

    const { error: rpcError } = await adminClient.rpc("platform_finalize_org_admin_provisioning", {
      p_job_id: jobId,
      p_lease_token: leaseToken,
      p_user_id: userId,
    });

    if (rpcError) {
      // Não deixar conta órfã: desfaz o acesso recém-criado.
      if (criamosUsuario && userId) {
        await adminClient.auth.admin.deleteUser(userId).catch(() => undefined);
      }
      const code = classifyFinalizeError(rpcError);
      await adminClient.rpc("platform_fail_org_admin_provisioning", {
        p_job_id: jobId, p_lease_token: leaseToken, p_error_code: code,
      });
      const response = finalizeErrorResponse(code);
      await auditManualLink("failure", code);
      return respond({ error: response.message, code }, response.status, isManualLink);
    }

    if (modo === "link") {
      if (!actionLink) {
        return respond({ error: "Convite sem link válido.", code: "link_missing" }, 500);
      }
      if (isManualLink) {
        await auditManualLink("success");
        return respond({
          success: true,
          user_id: userId,
          senha_temporaria: null,
          email_status: "not_required",
          status: "pendente",
          idempotent: !criamosUsuario,
          manual_link: actionLink,
        }, 200, true);
      }
      const jobHash = await maskedId(jobId);
      const logDelivery = (event: string, stage: string, safeCode: string, certainty: "definitive" | "ambiguous") => {
        console.info(JSON.stringify({ event, stage, safe_code: safeCode, certainty, job_ref: jobHash, correlation_id: correlationId }));
      };
      if (!runtimeEnv) return respond({ error: "Configuração de e-mail indisponível.", code: "email_config_missing" }, 503);
      const delivery = await deliverInviteEmail(jobId, actionLink, runtimeEnv, {
        claim: async (id) => {
          const { data, error } = await adminClient.rpc("platform_claim_org_admin_email_delivery", {
            p_job_id: id,
            p_actor_id: callerId,
            p_confirm_ambiguous_email_retry: confirmAmbiguousEmailRetry,
            p_cooldown_seconds: 300,
          });
          if (error || !data) throw new Error("email_claim_failed");
          logDelivery("invite_email_claimed", "preflight", "email_claimed", "definitive");
          return data as InviteEmailClaim;
        },
        send: async ({ env: runtime, recipientEmail, recipientName, actionLink: link }) => {
          const result = await sendEmail(
            runtime,
            { ok: true, canal: "email", address: recipientEmail },
            {
              canal: "email",
              assunto: "Defina seu acesso ao Cultivo Farm",
              corpo: "Olá, {{nome}}. Use o link abaixo para definir sua senha: {{link}}",
              variaveis: ["nome", "link"],
            },
            {
              assunto: "Defina seu acesso ao Cultivo Farm",
              corpo: `Olá, ${recipientName}.\n\nUse este link para definir sua senha:\n${link}\n\nSe você não esperava este convite, ignore esta mensagem.`,
            },
          );
          logDelivery("invite_email_transport_result", result.stage ?? "send", result.code, result.certainty ?? "definitive");
          return result;
        },
        accept: async (id, token) => {
          const { error } = await adminClient.rpc("platform_accept_org_admin_email_delivery", {
            p_job_id: id,
            p_lease_token: token,
          });
          if (error) throw new Error("email_accept_persistence_failed");
          logDelivery("invite_email_accepted", "response", "accepted", "definitive");
        },
        fail: async (id, token, code) => {
          const { error } = await adminClient.rpc("platform_fail_org_admin_email_delivery", {
            p_job_id: id,
            p_lease_token: token,
            p_error_code: code,
            p_retry_seconds: 300,
          });
          if (error) throw new Error("email_failure_persistence_failed");
        },
        ambiguous: async (id, token, code) => {
          const safeCode = AMBIGUOUS_CODES.has(code) ? code : "email_send_ambiguous";
          const { error } = await adminClient.rpc("platform_mark_org_admin_email_ambiguous", {
            p_job_id: id,
            p_lease_token: token,
            p_error_code: safeCode,
          });
          if (error) throw new Error("email_ambiguity_persistence_failed");
          logDelivery("invite_email_ambiguous", "response", safeCode, "ambiguous");
        },
      }).catch((error: unknown) => {
        const code = error instanceof Error && error.message === "email_ambiguity_persistence_failed"
          ? "email_accept_persistence_failed"
          : "email_claim_failed";
        return {
          status: code === "email_accept_persistence_failed" ? "ambiguous" as const : "failed" as const,
          code,
        };
      });

      if (delivery.status !== "accepted") {
        const ambiguous = delivery.status === "ambiguous";
        return respond({
          error: ambiguous
            ? "O provedor pode ter aceitado o convite, mas a confirmação local falhou. Aguarde antes de reenviar."
            : "O acesso foi preparado, mas o e-mail não foi enviado. Tente novamente após configurar o SMTP.",
          code: delivery.code,
          email_status: delivery.status,
        }, ambiguous ? 409 : 503);
      }

      return respond({
        success: true,
        user_id: userId,
        senha_temporaria: null,
        email_status: "accepted",
        status: "pendente",
        idempotent: !criamosUsuario,
      });
    }

    return respond({
      success: true,
      user_id: userId,
      senha_temporaria: senha,
      email_status: "not_required",
      status: "pendente",
      idempotent: !criamosUsuario,
    });
  } catch (_err) {
    return respond({ error: "Falha inesperada ao criar o acesso." }, 500);
  }
});

