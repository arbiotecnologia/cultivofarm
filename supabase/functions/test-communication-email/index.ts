// Edge Function: test-communication-email
// Envia um e-mail de teste SMTP usando as configurações salvas no Vault.
// Não usa a fila de comunicação nem depende das flags de entrega.
// Restrito a administradores autenticados.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { ok: false, error: "not_configured" });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { ok: false, error: "unauthorized" });
  const token = auth.slice(7).trim();

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) return json(401, { ok: false, error: "invalid_token" });
  const uid = userData.user.id;
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", uid);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "administrador");
  if (!isAdmin) return json(403, { ok: false, error: "forbidden" });

  let body: { to?: string; subject?: string; message?: string } = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const to = String(body.to ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json(400, { ok: false, error: "invalid_recipient" });
  }
  const subject = String(body.subject ?? "Teste SMTP AR Bio").slice(0, 200);
  const message = String(body.message ?? "Este é um e-mail de teste enviado pela AR Bio para validar a configuração SMTP.").slice(0, 4000);

  // Carrega configuração SMTP com senha decriptada do Vault.
  const { data: cfgData, error: cfgErr } = await sb.rpc("rpc_service_load_provider_runtime_config");
  if (cfgErr || !cfgData || typeof cfgData !== "object") {
    return json(500, { ok: false, error: "config_load_failed", detail: cfgErr?.message ?? null });
  }
  const cfg = cfgData as Record<string, unknown>;
  const host = String(cfg.smtp_host ?? "");
  const portRaw = cfg.smtp_port;
  const port = typeof portRaw === "number" ? portRaw : Number(portRaw ?? 0);
  const user = String(cfg.smtp_user ?? "");
  const from = String(cfg.smtp_from ?? "");
  const password = String(cfg.smtp_password ?? "");
  if (!host || !port || !user || !from || !password) {
    return json(400, {
      ok: false,
      error: "smtp_incomplete",
      missing: {
        host: !host, port: !port, user: !user, from: !from, password: !password,
      },
    });
  }

  const startedAt = Date.now();
  let client: { send: (m: unknown) => Promise<unknown>; close: () => Promise<void> } | null = null;
  try {
    const denomailerSpec = "https://deno.land/x/denomailer@1.6.0/mod.ts";
    // @ts-ignore runtime import
    const mod = await import(denomailerSpec);
    client = new mod.SMTPClient({
      connection: {
        hostname: host,
        port,
        tls: port === 465,
        auth: { username: user, password },
      },
    });
    const html = `<p style="font-family:system-ui,sans-serif">${message.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string))}</p>`;
    const sendPromise = client!.send({
      from,
      to,
      subject,
      content: message,
      html,
    });
    const timeout = new Promise((_, r) => setTimeout(() => r(new Error("timeout_25s")), 25_000));
    await Promise.race([sendPromise, timeout]);
    return json(200, {
      ok: true,
      sent_to: to,
      from,
      host,
      port,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (e) {
    const err = e as Error & { name?: string; cause?: unknown };
    const rawMsg = String(err?.message ?? err ?? "").slice(0, 800);
    const name = String(err?.name ?? "Error");
    const causeMsg = err?.cause ? String((err.cause as Error)?.message ?? err.cause).slice(0, 400) : "";
    const combined = `${rawMsg} ${causeMsg}`.toLowerCase();

    // Classificação legível dos erros mais comuns de SMTP/TLS/rede.
    let category: string;
    let hint: string;
    let httpStatus = 502;
    if (rawMsg === "timeout_25s" || combined.includes("timeout") || combined.includes("timed out")) {
      category = "timeout";
      hint = `O servidor ${host}:${port} não respondeu em 25s. Verifique se o host/porta estão corretos e se o provedor não bloqueia conexões de IPs de cloud (KingHost, Locaweb e alguns provedores fazem isso).`;
      httpStatus = 504;
    } else if (combined.includes("hostname mismatch") || combined.includes("subject alternative") || combined.includes("certificate is not valid for")) {
      category = "tls_hostname_mismatch";
      hint = `O certificado TLS apresentado por ${host} não cobre esse hostname. Corrija o certificado no servidor ou aponte smtp_host para o hostname que o certificado cobre.`;
    } else if (combined.includes("self-signed") || combined.includes("self signed") || combined.includes("unable to verify") || combined.includes("unable to get local issuer") || combined.includes("cert") && combined.includes("verify")) {
      category = "tls_cert_untrusted";
      hint = `Certificado TLS de ${host} não é confiável (autoassinado ou CA desconhecida). Instale um certificado válido no servidor SMTP.`;
    } else if (combined.includes("tls") || combined.includes("ssl") || combined.includes("handshake") || combined.includes("wrong version number") || combined.includes("bad record mac")) {
      category = "tls_handshake_failed";
      hint = `Falha no handshake TLS com ${host}:${port}. Confirme se a porta usa TLS implícito (465) ou STARTTLS (587/25) e se o servidor aceita TLS 1.2+.`;
    } else if (combined.includes("535") || combined.includes("authentication failed") || combined.includes("auth failed") || combined.includes("invalid credentials") || combined.includes("username and password not accepted")) {
      category = "smtp_auth_failed";
      hint = `Credenciais SMTP rejeitadas pelo servidor (código 535). Verifique usuário/senha; muitos provedores exigem senha de aplicativo (Gmail/Outlook) ou API key específica (SendGrid).`;
      httpStatus = 401;
    } else if (combined.includes("530")) {
      category = "smtp_auth_required";
      hint = `O servidor exigiu autenticação e a rejeitou (código 530). Confirme que o login SMTP está habilitado no provedor.`;
      httpStatus = 401;
    } else if (combined.includes("550") || combined.includes("553") || combined.includes("relay") || combined.includes("sender address rejected") || combined.includes("sender rejected") || combined.includes("not allowed") && combined.includes("from")) {
      category = "smtp_sender_rejected";
      hint = `O servidor rejeitou o remetente "${from}" (código 550/553). O e-mail "from" precisa pertencer ao domínio autenticado e ter SPF/DKIM configurados.`;
    } else if (combined.includes("554") || combined.includes("blocked") || combined.includes("blacklist") || combined.includes("spam")) {
      category = "smtp_message_rejected";
      hint = `O servidor rejeitou a mensagem (código 554). Pode ser filtro de spam, bloqueio de IP ou política antifraude do provedor.`;
    } else if (combined.includes("connection refused") || combined.includes("econnrefused")) {
      category = "connection_refused";
      hint = `Conexão recusada em ${host}:${port}. A porta pode estar fechada, o serviço parado ou o firewall bloqueando.`;
    } else if (combined.includes("connection reset") || combined.includes("econnreset") || combined.includes("broken pipe")) {
      category = "connection_reset";
      hint = `Conexão encerrada abruptamente por ${host}. Comum quando o servidor rejeita antes do handshake (IP bloqueado, greylist, DDoS protection).`;
    } else if (combined.includes("dns") || combined.includes("getaddrinfo") || combined.includes("could not resolve") || combined.includes("name not resolved")) {
      category = "dns_resolution_failed";
      hint = `Não foi possível resolver o hostname "${host}". Verifique se o smtp_host está grafado corretamente.`;
    } else if (combined.includes("network") || combined.includes("unreachable") || combined.includes("ehostunreach") || combined.includes("enetunreach")) {
      category = "network_unreachable";
      hint = `Rota de rede indisponível para ${host}:${port}. Pode ser bloqueio de saída do provedor ou instabilidade de rede.`;
    } else {
      category = "smtp_send_failed";
      hint = "Falha genérica ao enviar via SMTP. Veja a mensagem crua abaixo.";
    }

    return json(httpStatus, {
      ok: false,
      error: category,
      hint,
      detail: rawMsg,
      cause: causeMsg || null,
      exception: name,
      host,
      port,
      elapsed_ms: Date.now() - startedAt,
    });
  } finally {
    if (client) { try { await client.close(); } catch { /* ignore */ } }
  }
});
