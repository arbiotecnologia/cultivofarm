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
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    return json(502, {
      ok: false,
      error: "smtp_send_failed",
      detail: msg,
      host,
      port,
      elapsed_ms: Date.now() - startedAt,
    });
  } finally {
    if (client) { try { await client.close(); } catch { /* ignore */ } }
  }
});
