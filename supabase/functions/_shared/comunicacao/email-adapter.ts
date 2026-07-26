// Adapter de e-mail (SMTP via denomailer). Desligado por padrão.
// Sem I/O quando flags estão OFF ou envs ausentes.

import type {
  AdapterDeps,
  AdapterResult,
  AdapterSnapshot,
  RenderedContent,
  ResolvedAddress,
  WorkerEnv,
} from "./adapters.ts";

const SEND_TIMEOUT_DEFAULT_MS = 20_000;

export async function sendEmail(
  env: WorkerEnv,
  resolved: ResolvedAddress,
  snapshot: AdapterSnapshot,
  rendered: RenderedContent,
  deps: AdapterDeps = {},
): Promise<AdapterResult> {
  if (!env.DELIVERY_ENABLED || !env.EMAIL_ENABLED) {
    return { outcome: "provider_not_configured", code: "email_disabled", message: "flag OFF" };
  }
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM) {
    return { outcome: "provider_not_configured", code: "email_missing_env", message: "SMTP_* ausente" };
  }
  if (!resolved.ok || resolved.canal !== "email" || !resolved.address) {
    return { outcome: "invalid_recipient", code: "invalid_address", message: "sem endereço" };
  }
  const subject = (rendered.assunto ?? snapshot.assunto ?? "").trim();
  if (!subject) {
    return { outcome: "permanent_error", code: "email_missing_subject", message: "assunto obrigatório" };
  }

  const timeoutMs = deps.timeoutMs ?? SEND_TIMEOUT_DEFAULT_MS;
  const controller = new AbortController();
  const to = resolved.address;

  try {
    // Reuso do denomailer (já em uso por enviar-alertas-notificacoes).
    // O import é dinâmico para permitir mock por AdapterDeps.fetch nos testes
    // (o teste do worker faz stub em runAdapter, não neste import).
    const { SMTPClient } = await import(
      "https://deno.land/x/denomailer@1.6.0/mod.ts"
    );

    const client = new SMTPClient({
      connection: {
        hostname: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 587),
        tls: (env.SMTP_PORT ?? "587") === "465",
        auth: { username: env.SMTP_USER!, password: env.SMTP_PASSWORD! },
      },
    });

    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await client.send({
        from: env.SMTP_FROM!,
        to,
        subject,
        content: rendered.corpo,
        html: rendered.corpo,
      });
    } finally {
      clearTimeout(timer);
      try { await client.close(); } catch { /* ignore */ }
    }

    return {
      outcome: "sent",
      code: "sent",
      message: "ok",
      provider_message_id: null,
    };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    const isTimeout = /abort|timeout/i.test(msg);
    if (isTimeout) {
      return { outcome: "transient_error", code: "email_timeout", message: msg };
    }
    // Conexão/DNS/auth: tratar como transitório para permitir retry moderado.
    if (/ECONN|EHOST|dns|network|timeout|reset/i.test(msg)) {
      return { outcome: "transient_error", code: "email_network_error", message: msg };
    }
    // Erros SMTP 5xx são permanentes.
    if (/5\d\d/.test(msg)) {
      return { outcome: "permanent_error", code: "email_smtp_5xx", message: msg };
    }
    return { outcome: "transient_error", code: "email_unknown_error", message: msg };
  }
}
