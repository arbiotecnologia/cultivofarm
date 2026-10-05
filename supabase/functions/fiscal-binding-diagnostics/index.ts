/**
 * H7b — Diagnóstico de binding fiscal (não sensível).
 *
 * Objetivo: provar, em runtime, que a chamada fiscal atingiu o projeto
 * correto (staging) e que o ambiente fiscal está em homologação, SEM expor
 * segredo, service_role, PFX, senha, DSN ou allowlist em texto claro.
 *
 * Contrato:
 *   GET/POST -> exige JWT de administrador da empresa ativa. POST adiciona
 *           presença booleana de segredos
 *           e contagem de origens permitidas (nunca os valores).
 *
 * Nunca retorna: valores de secrets, chaves, senhas, caminhos de storage.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { fiscalAllowedOrigins, fiscalCorsHeaders } from "../_shared/fiscal/corsAllowlist.ts";

const EXPECTED_PROJECT_REF = "swzpzcwiasxmjutrmvkm";
const FORBIDDEN_PRODUCTION_REF = "navfzbwgwzruipouyfnk";

function corsFor(origin: string | null): { allowed: boolean; headers: Record<string, string> } {
  const c = fiscalCorsHeaders(origin, "GET, POST, OPTIONS");
  return { allowed: c.allowed, headers: c.headers };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

/** Extrai o project ref do host do SUPABASE_URL. Não expõe a URL completa. */
function runtimeProjectRef(): string | null {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsFor(origin);
  const headers = cors.headers;

  if (req.method === "OPTIONS") {
    if (!cors.allowed) return new Response("cors_denied", { status: 403, headers });
    return new Response("ok", { headers });
  }
  // Origem de browser desconhecida é rejeitada. Chamadas server-to-server
  // (sem Origin) são aceitas apenas para o diagnóstico mínimo (GET).
  if (origin && !cors.allowed) return json({ error: "cors_origin_not_allowed" }, 403, headers);
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, headers);
  }

  const projectRef = runtimeProjectRef();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  let environment: string | null = null;
  let productionAllowed: boolean | null = null;
  let markerRef: string | null = null;
  if (supabaseUrl && serviceKey) {
    const admin = createClient(supabaseUrl, serviceKey);
    const { data } = await admin
      .from("fiscal_environment_marker")
      .select("project_ref, environment_label, production_emission_allowed")
      .limit(1)
      .maybeSingle();
    if (data) {
      markerRef = data.project_ref ?? null;
      environment = data.environment_label ?? null;
      productionAllowed = data.production_emission_allowed ?? null;
    }
  }

  const bindingOk =
    projectRef === EXPECTED_PROJECT_REF &&
    projectRef !== FORBIDDEN_PRODUCTION_REF &&
    (markerRef === null || markerRef === EXPECTED_PROJECT_REF) &&
    productionAllowed !== true;

  const base = {
    contract: "fiscal-binding-diagnostics/1.0.0",
    project_ref: projectRef,
    expected_project_ref: EXPECTED_PROJECT_REF,
    marker_project_ref: markerRef,
    environment,
    production_emission_allowed: productionAllowed,
    binding_ok: bindingOk,
  };

  // Diagnóstico de binding e detalhes: somente administrador tenant ativo.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, headers);
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "server_misconfigured" }, 500, headers);
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const claims = await authed.auth.getClaims(authHeader.replace("Bearer ", ""));
  const userId = claims.data?.claims?.sub;
  if (!userId) return json({ error: "unauthorized" }, 401, headers);
  const { data: isAdmin, error: roleErr } = await authed.rpc("has_role", {
    _user_id: userId,
    _role: "administrador",
  });
  if (roleErr || !isAdmin) return json({ error: "permission_denied" }, 403, headers);
  const { data: actorOrg, error: orgErr } = await authed.rpc("h15_actor_organization");
  if (orgErr || !actorOrg) return json({ error: "permission_denied" }, 403, headers);

  if (req.method === "GET") return json(base, bindingOk ? 200 : 409, headers);

  return json(
    {
      ...base,
      // Apenas presença/contagem — jamais os valores.
      secrets: {
        fiscal_certificate_master_key_present: !!Deno.env.get("FISCAL_CERTIFICATE_MASTER_KEY"),
        service_role_present: !!serviceKey,
      },
      cors: {
        allowed_origins_count: fiscalAllowedOrigins().length,
        wildcard_used: fiscalAllowedOrigins().includes("*"),
      },
    },
    bindingOk ? 200 : 409,
    headers,
  );
});
