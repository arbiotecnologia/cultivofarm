// Adapter de e-mail (SMTP via denomailer). Desligado por padrão.
// - Config inválida (porta fora de faixa, envs faltando) → deferred, não cancel.
// - Timeout real via Promise.race + client.close() no finally.
// - HTML é escapado; ausência de HTML explícito envia texto puro.

import type {
  AdapterDeps,
  AdapterResult,
  AdapterSnapshot,
  RenderedContent,
  ResolvedAddress,
  SmtpLikeClient,
  WorkerEnv,
} from "./adapters-types.ts";
import {
  classifyEmailError,
  escapeHtml,
  hasHeaderInjection,
  isRecipientAllowedInTestMode,
  isSmtpConfigValid,
  MAX_EMAIL_ADDRESS_LEN,
  MAX_EMAIL_BODY_BYTES,
  MAX_EMAIL_SUBJECT_LEN,
  utf8ByteLength,
} from "./adapters-types.ts";

const SEND_TIMEOUT_DEFAULT_MS = 20_000;

async function defaultSmtpClientFactory(cfg: {
  hostname: string; port: number; tls: boolean;
  auth: { username: string; password: string };
}): Promise<SmtpLikeClient> {
  // Especificador dinâmico via variável — evita resolução estática por
  // ferramentas Node (URL válido apenas em runtime Deno).
  const denomailerSpec = "https://deno.land/x/denomailer@1.6.0/mod.ts";
  // @ts-ignore -- resolvido em runtime Deno
  const mod = await import(denomailerSpec);
  const client = new mod.SMTPClient({ connection: cfg });
  return client as SmtpLikeClient;
}

export async function sendEmail(
  env: WorkerEnv,
  resolved: ResolvedAddress,
  snapshot: AdapterSnapshot,
  rendered: RenderedContent,
  deps: AdapterDeps = {},
): Promise<AdapterResult> {
  if (!env.DELIVERY_ENABLED || !env.EMAIL_ENABLED) {
    return { outcome: "provider_not_configured", code: "email_disabled", message: "Entrega indisponível.", certainty: "definitive", stage: "preflight" };
  }
  if (!isSmtpConfigValid(env)) {
    // Config inválida (porta fora de faixa, envs faltando) → defer.
    // Não perdemos mensagens só porque o operador esqueceu de configurar.
    return { outcome: "deferred", code: "email_config_invalid", message: "Configuração de e-mail inválida.", certainty: "definitive", stage: "config" };
  }
  if (!resolved.ok || resolved.canal !== "email" || !resolved.address) {
    return { outcome: "invalid_recipient", code: "invalid_address", message: "sem endereço" };
  }
  // Homologação — test mode gate ANTES de qualquer chamada externa.
  const gate = isRecipientAllowedInTestMode(env, "email", resolved.address);
  if (!gate.allowed) {
    return { outcome: "deferred", code: gate.reason, message: "test mode block" };
  }
  const subject = (rendered.assunto ?? snapshot.assunto ?? "").trim();
  if (!subject) {
    return { outcome: "permanent_error", code: "email_missing_subject", message: "assunto obrigatório" };
  }
  if (subject.length > MAX_EMAIL_SUBJECT_LEN) {
    return { outcome: "permanent_error", code: "email_subject_too_long", message: `>${MAX_EMAIL_SUBJECT_LEN}` };
  }
  // Header injection: CR/LF/NUL em assunto, from ou to → bloqueio imediato.
  if (hasHeaderInjection(subject)) {
    return { outcome: "permanent_error", code: "email_header_injection_subject", message: "CR/LF em assunto" };
  }
  if (hasHeaderInjection(env.SMTP_FROM ?? "")) {
    return { outcome: "permanent_error", code: "email_header_injection_from", message: "CR/LF em from" };
  }
  if (hasHeaderInjection(resolved.address)) {
    return { outcome: "invalid_recipient", code: "email_header_injection_to", message: "CR/LF em to" };
  }
  if ((resolved.address ?? "").length > MAX_EMAIL_ADDRESS_LEN) {
    return { outcome: "invalid_recipient", code: "email_address_too_long", message: `>${MAX_EMAIL_ADDRESS_LEN}` };
  }
  if (utf8ByteLength(rendered.corpo) > MAX_EMAIL_BODY_BYTES) {
    return { outcome: "permanent_error", code: "email_body_too_large", message: `>${MAX_EMAIL_BODY_BYTES}` };
  }

  const timeoutMs = deps.timeoutMs ?? SEND_TIMEOUT_DEFAULT_MS;
  const factory = deps.smtpClientFactory ?? defaultSmtpClientFactory;
  const port = Number(env.SMTP_PORT ?? 587);

  let client: SmtpLikeClient | null = null;
  let stage: "connect" | "send" = "connect";
  try {
    client = await factory({
      hostname: env.SMTP_HOST!,
      port,
      tls: port === 465,
      auth: { username: env.SMTP_USER!, password: env.SMTP_PASSWORD! },
    });

    stage = "send";
    const htmlBody = `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(rendered.corpo)}</pre>`;

    // Timeout real: race entre send() e um timer que rejeita explicitamente.
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("email_send_timeout")), timeoutMs);
    });
    try {
      await Promise.race([
        client.send({
          from: env.SMTP_FROM!,
          to: resolved.address,
          subject,
          content: rendered.corpo,
          html: htmlBody,
        }),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }

    return { outcome: "sent", code: "sent", message: "Aceito pelo transporte SMTP.", certainty: "definitive", stage: "response", provider_message_id: null };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    const cls = classifyEmailError(msg, stage);
    return { ...cls, message: "Falha no transporte de e-mail." };
  } finally {
    if (client) {
      try { await client.close(); } catch { /* ignore */ }
    }
  }
}
