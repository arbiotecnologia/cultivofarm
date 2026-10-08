// Edge Function: enviar-alertas-notificacoes
// Fase 12.6 — Envio externo de alertas críticos/alta prioridade.
// Protegida por segredo (header x-cron-secret ou Authorization Bearer).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";


const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("ALERTAS_NOTIFICACOES_SECRET") ?? "";
const APP_URL =
  Deno.env.get("APP_URL") ?? Deno.env.get("SITE_URL") ?? "";

const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "587");
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const SMTP_FROM = Deno.env.get("SMTP_FROM") ?? "";
const SMTP_FROM_NAME = Deno.env.get("SMTP_FROM_NAME") ?? "AR Bio";

function validarSegredo(req: Request): boolean {
  if (!SECRET) return false;
  const h = req.headers.get("x-cron-secret");
  if (h && h === SECRET) return true;
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() === SECRET;
  }
  return false;
}

function smtpConfigurado(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

function montarHtml(assunto: string, mensagem: string, alertaId: string): string {
  const link =
    APP_URL && APP_URL.length > 0
      ? `${APP_URL.replace(/\/$/, "")}/alertas-operacionais?alerta=${alertaId}`
      : null;
  const safe = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f7f7f8;padding:24px;color:#111">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
    <h2 style="margin:0 0 12px;font-size:18px">${safe(assunto)}</h2>
    <pre style="white-space:pre-wrap;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.5;margin:0 0 16px">${safe(mensagem)}</pre>
    ${
      link
        ? `<a href="${link}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Acessar Central de Alertas</a>`
        : ""
    }
    <p style="color:#6b7280;font-size:12px;margin-top:24px">AR Bio — notificação automática. Não responda este e-mail.</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { success: false, message: "Method not allowed" });
  if (!validarSegredo(req)) return json(401, { success: false, message: "Unauthorized" });

  // No dispatch contract proves both source and recipient: keep delivery closed.
  return json(503, { success: false, message: "NOTIF_EXTERNAL_DELIVERY_DISABLED" });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let preparadas = 0;
  let enviadas = 0;
  let falhas = 0;

  try {
    // 1) Prepara fila
    const { data: prep, error: prepErr } = await supabase.rpc(
      "rpc_preparar_notificacoes_alertas",
    );
    if (prepErr) throw prepErr;
    preparadas = Number((prep as Record<string, unknown>)?.total_notificacoes_criadas ?? 0);

    // 2) Busca pendentes (apenas email; whatsapp aguarda fase futura)
    const { data: pendentes, error: pendErr } = await supabase
      .from("alertas_notificacoes")
      .select("id, alerta_id, canal, destino, assunto, mensagem")
      .eq("status", "pendente")
      .eq("canal", "email")
      .order("created_at", { ascending: true })
      .limit(50);
    if (pendErr) throw pendErr;

    if (!pendentes || pendentes.length === 0) {
      return json(200, {
        success: true,
        preparadas,
        enviadas: 0,
        falhas: 0,
        executado_em: new Date().toISOString(),
      });
    }

    if (!smtpConfigurado()) {
      // Marca todas como falhou com motivo claro (sem expor segredos)
      for (const n of pendentes) {
        await supabase.rpc("rpc_marcar_notificacao_falhou", {
          p_notificacao_id: n.id,
          p_erro: "smtp_nao_configurado",
        });
        falhas++;
      }
      return json(200, {
        success: true,
        preparadas,
        enviadas,
        falhas,
        executado_em: new Date().toISOString(),
      });
    }

    const client = {
      send: async (_payload: unknown): Promise<never> => { throw new Error("NOTIF_EXTERNAL_DELIVERY_DISABLED"); },
      close: async () => {},
    };

    for (const n of pendentes) {
      try {
        await client.send({
          from: `${SMTP_FROM_NAME} <${SMTP_FROM}>`,
          to: n.destino,
          subject: n.assunto ?? "Alerta AR Bio",
          content: n.mensagem,
          html: montarHtml(n.assunto ?? "Alerta AR Bio", n.mensagem, n.alerta_id),
        });
        await supabase.rpc("rpc_marcar_notificacao_enviada", {
          p_notificacao_id: n.id,
          p_provider: "smtp",
          p_provider_message_id: null,
        });
        enviadas++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "erro_envio";
        console.error("[enviar-alertas-notificacoes] envio falhou", n.id, msg);
        await supabase.rpc("rpc_marcar_notificacao_falhou", {
          p_notificacao_id: n.id,
          p_erro: msg.slice(0, 250),
        });
        falhas++;
      }
    }

    try {
      await client.close();
    } catch {
      /* noop */
    }

    return json(200, {
      success: true,
      preparadas,
      enviadas,
      falhas,
      executado_em: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[enviar-alertas-notificacoes] erro geral", err);
    return json(500, {
      success: false,
      message: "Não foi possível processar notificações de alertas.",
    });
  }
});
