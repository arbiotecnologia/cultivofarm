// Consulta de CNPJ (BrasilAPI) para o onboarding da empresa.
// - JWT do próprio usuário validado com getClaims.
// - Autorização: RPC org_onboarding_state executada COM o JWT do usuário
//   (organização derivada no servidor; nenhum organization_id do cliente).
// - Consulta ok no modo empresa: grava evidência server-side (svc_onboarding_record_cnpj_evidence,
//   EXECUTE só service_role) vinculada à organização derivada no servidor e ao ator do JWT.
//   A chave service_role fica só nesta função; o cliente nunca a recebe. Logs só com código.
import { createClient } from "npm:@supabase/supabase-js@2";
import { consultar, criarLimitador, STATUS_HTTP } from "./core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const limiteUsuario = criarLimitador(10, 60_000);
const limiteOrg = criarLimitador(20, 60_000);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ codigo: "method" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ codigo: "auth_header" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) return json({ codigo: "config" }, 500);
    const token = auth.slice(7).trim();
    const sb = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claims, error: ce } = await sb.auth.getClaims(token);
    const uid = claims?.claims?.sub;
    if (ce || !uid) return json({ codigo: "bad_jwt" }, 401);

    let orgId: string | null = null;
    let body: unknown;
    try { body = await req.json(); } catch { return json({ codigo: "invalid_cnpj" }, 400); }
    const modo = (body as { modo?: unknown })?.modo;

    if (modo === "plataforma") {
      // Superadmin de Plataforma: papel verificado no servidor com o JWT do
      // próprio usuário (nunca user_metadata nem dado do cliente).
      const { data: ok, error: pe } = await sb.rpc("is_platform_superadmin", { _user_id: uid });
      if (pe || ok !== true) return json({ codigo: "forbidden" }, 403);
      if (!limiteUsuario(uid) || !limiteOrg("plataforma")) return json({ codigo: "rate_limited_local" }, 429);
    } else {
      const { data: st, error: se } = await sb.rpc("org_onboarding_state");
      if (se) return json({ codigo: "estado" }, 403);
      const s = (st ?? {}) as { required?: boolean; is_admin?: boolean; organization_id?: string; status?: string };
      if (!s.required || !s.is_admin || !s.organization_id || !["aguardando_ativacao", "onboarding", "rascunho"].includes(s.status ?? "")) {
        return json({ codigo: "forbidden" }, 403);
      }
      if (s.status === "rascunho") return json({ codigo: "forbidden" }, 403);
      if (!limiteUsuario(uid) || !limiteOrg(s.organization_id)) return json({ codigo: "rate_limited_local" }, 429);
      orgId = s.organization_id;
    }

    const r = await consultar((body as { cnpj?: unknown })?.cnpj);
    const fonte = "Receita Federal via BrasilAPI";
    let evidencia_registrada = false;
    if (r.codigo === "ok" && orgId) {
      // Falha ao registrar não bloqueia a consulta: sem evidência, a conclusão vai para revisão (fail-closed).
      try {
        const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (service) {
          const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
          const bytes = new TextEncoder().encode(JSON.stringify(r.dados));
          const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
            .map((b) => b.toString(16).padStart(2, "0")).join("");
          const { error: ee } = await admin.rpc("svc_onboarding_record_cnpj_evidence", {
            _org: orgId, _actor: uid, _dados: r.dados, _fonte: fonte, _payload_sha256: sha,
          });
          evidencia_registrada = !ee;
        }
      } catch { evidencia_registrada = false; }
    }
    console.log(JSON.stringify({ fn: "onboarding-cnpj-lookup", codigo: r.codigo, evidencia: evidencia_registrada }));
    return json({ ...r, fonte, consultado_em: new Date().toISOString(), evidencia_registrada }, STATUS_HTTP[r.codigo]);
  } catch {
    console.error(JSON.stringify({ fn: "onboarding-cnpj-lookup", codigo: "inesperado" }));
    return json({ codigo: "inesperado" }, 500);
  }
});
