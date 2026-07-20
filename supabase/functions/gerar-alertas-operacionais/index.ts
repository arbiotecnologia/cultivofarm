// Edge Function: gerar-alertas-operacionais
// Executa o motor de geracao de alertas operacionais via service role.
// Protegida por segredo (ALERTAS_CRON_SECRET) — destinada a cron/agendadores.
//
// Aceita header `x-cron-secret` OU `Authorization: Bearer <ALERTAS_CRON_SECRET>`.
// Nao expoe stack trace na resposta publica.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, message: "Metodo nao permitido." });
  }

  const expected = Deno.env.get("ALERTAS_CRON_SECRET");
  if (!expected) {
    console.error("[gerar-alertas-operacionais] ALERTAS_CRON_SECRET nao configurado");
    return jsonResponse(500, {
      success: false,
      message: "Servico indisponivel.",
    });
  }

  const headerSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const provided = headerSecret || bearer;

  if (!provided || provided !== expected) {
    return jsonResponse(401, { success: false, message: "Nao autorizado." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[gerar-alertas-operacionais] Variaveis de ambiente ausentes");
    return jsonResponse(500, {
      success: false,
      message: "Servico indisponivel.",
    });
  }

  let body: { tipo_execucao?: string; origem?: string } = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    body = {};
  }

  const tipo = typeof body.tipo_execucao === "string" ? body.tipo_execucao : "edge_function";
  const origem = typeof body.origem === "string" ? body.origem : "cron";

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase.rpc("rpc_executar_motor_alertas", {
      p_tipo_execucao: tipo,
      p_origem: origem,
    });

    if (error) {
      console.error("[gerar-alertas-operacionais] erro RPC:", error.message);
      return jsonResponse(500, {
        success: false,
        message: "Nao foi possivel executar o motor de alertas.",
      });
    }

    return jsonResponse(200, {
      success: true,
      executado_em: new Date().toISOString(),
      resultado: data ?? {},
    });
  } catch (err) {
    console.error("[gerar-alertas-operacionais] excecao:", err);
    return jsonResponse(500, {
      success: false,
      message: "Nao foi possivel executar o motor de alertas.",
    });
  }
});
