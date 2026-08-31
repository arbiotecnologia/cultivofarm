/**
 * Fase Fiscal 3.9 — Entrypoint server-side de pré-checagem fiscal.
 *
 * INVARIANTES (não mudar sem migração formal para nova fase):
 *  - Operação única suportada: `PREFLIGHT`.
 *  - Resposta máxima possível: `status="PRECHECK_ONLY"` com `canTransmit=false`,
 *    `provider="NONE"`, `production=false`. Nenhum caminho promove emissão.
 *  - Sem provedor externo: nenhum `fetch` HTTP, SDK ou URL de SEFAZ/homologador
 *    é referenciada aqui.
 *  - Sem `SUPABASE_SERVICE_ROLE_KEY` / service_role — leituras usam a chave
 *    publishable (anon) + `Authorization` do usuário, preservando RLS.
 *  - Sem writes: nenhum insert/update/delete/upsert/rpc/functions.invoke.
 *  - Gates "externos" (RLS runtime, types oficial, backfill, máscara SQL,
 *    provedor, certificado, secrets, homologação) permanecem `false`/`unknown`
 *    — o cliente NÃO pode promovê-los.
 *  - CORS: allowlist via `FISCAL_ALLOWED_ORIGINS`; default vazio = rejeita
 *    origens de browser. Chamadas sem `Origin` (server-to-server) só passam
 *    autenticadas por JWT válido.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fiscalAllowedOrigins, isFiscalOriginAllowed, FISCAL_RELEASE_ID } from "../_shared/fiscal/corsAllowlist.ts";
import {
  evaluatePreflight,
  isRoleAllowedForPreflight,
  maskRecursive,
  PREFLIGHT_ALLOWED_ROLES,
  type PreflightInput,
} from "../_shared/fiscal/preflight.ts";

/* ────────────────────────── Contrato do endpoint ────────────────────────── */

const CONTRACT_VERSION = "fiscal-preflight/1.0.0";
const READINESS_VIEWS = [
  "v_fiscal_company_readiness",
  "v_product_fiscal_readiness",
  "v_service_fiscal_readiness",
  "v_customer_fiscal_readiness",
  "v_fiscal_document_reconciliation_pending",
] as const;
type ReadinessView = (typeof READINESS_VIEWS)[number];

const VIEW_TIMEOUT_MS = 3000;
const MAX_BODY_BYTES = 4 * 1024; // 4 KiB — só aceitamos {version?: string}

/* ────────────────────────────────── CORS ─────────────────────────────────── */

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

// H7b: allowlist canônica compartilhada (FISCAL_CORS_ALLOWLIST /
// FISCAL_ALLOWED_ORIGINS + default versionado). Nunca "*".
function parseAllowlist(): string[] {
  return fiscalAllowedOrigins();
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const base: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
    "X-AR-Bio-Function-Version": FISCAL_RELEASE_ID,
  };
  // Sem Origin (server-to-server): não incluímos ACAO. A autorização depende do JWT.
  if (!origin) return base;
  // Com Origin: só reflete se allowlisted. Default vazio = nega.
  if (isFiscalOriginAllowed(origin)) {
    base["Access-Control-Allow-Origin"] = new URL(origin).origin;
  }
  return base;
}

function isBrowserOriginAllowed(req: Request): boolean {
  const origin = req.headers.get("Origin");
  if (!origin) return true; // server-to-server: aceito, mas exige JWT depois
  return isFiscalOriginAllowed(origin);
}

/* ───────────────────────────────── Utils ─────────────────────────────────── */

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(maskRecursive(body)), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function correlationId(): string {
  // Não sensível — apenas rastreio de log.
  return `pf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout:${label}`)), ms),
    ),
  ]);
}

/* ─────────────────────────────── Handler ─────────────────────────────────── */

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req);
  const cid = correlationId();

  // Preflight CORS — nunca revela dados.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed", correlation_id: cid }, cors);
  }

  // Se houver Origin e não estiver allowlisted, corta antes de qualquer leitura.
  if (!isBrowserOriginAllowed(req)) {
    return json(403, { error: "origin_not_allowed", correlation_id: cid }, cors);
  }

  // Limita payload — só aceitamos {version?: string} nesta fase.
  try {
    const cl = Number(req.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(cl) && cl > MAX_BODY_BYTES) {
      return json(413, { error: "payload_too_large", correlation_id: cid }, cors);
    }
    if (cl > 0) {
      const raw = await req.text();
      if (raw.length > MAX_BODY_BYTES) {
        return json(413, { error: "payload_too_large", correlation_id: cid }, cors);
      }
      if (raw.trim().length > 0) {
        const parsed = JSON.parse(raw) as { version?: unknown };
        if (parsed && typeof parsed.version === "string" && parsed.version !== CONTRACT_VERSION) {
          return json(400, { error: "unsupported_contract_version", correlation_id: cid }, cors);
        }
      }
    }
  } catch {
    return json(400, { error: "invalid_body", correlation_id: cid }, cors);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json(401, { error: "unauthorized", correlation_id: cid }, cors);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // Não expõe nomes/valores. Fail-closed.
    return json(500, { error: "server_misconfigured", correlation_id: cid }, cors);
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Autenticação
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { error: "unauthorized", correlation_id: cid }, cors);
  }
  const userId = userData.user.id;

  // Autorização — SOMENTE via has_role no servidor. Nunca via role do body.
  let authorized = false;
  for (const role of PREFLIGHT_ALLOWED_ROLES) {
    try {
      const { data, error } = await withTimeout(
        client.rpc("has_role", { _user_id: userId, _role: role }),
        VIEW_TIMEOUT_MS,
        `role:${role}`,
      );
      if (!error && data === true) {
        authorized = true;
        break;
      }
    } catch {
      // fail-closed — segue tentando
    }
  }
  if (!authorized) {
    return json(403, { error: "forbidden", correlation_id: cid }, cors);
  }

  // Coleta de evidências via 5 views de prontidão. Falha por view = unknown.
  async function checkView(view: ReadinessView): Promise<{ ok: boolean; unknown: boolean }> {
    try {
      const q = client
        .from(view)
        .select("*", { count: "exact", head: true });
      const { count, error } = await withTimeout(q, VIEW_TIMEOUT_MS, `view:${view}`);
      if (error) return { ok: false, unknown: true };
      // Convenção: view de reconciliação lista PENDÊNCIAS — pronto = 0 linhas.
      // Views de readiness listam entidades prontas — pronto = pelo menos 1 linha.
      if (view === "v_fiscal_document_reconciliation_pending") {
        return { ok: (count ?? 0) === 0, unknown: false };
      }
      return { ok: (count ?? 0) > 0, unknown: false };
    } catch {
      return { ok: false, unknown: true };
    }
  }

  const [company, products, services, customers, reconciliation] = await Promise.all([
    checkView("v_fiscal_company_readiness"),
    checkView("v_product_fiscal_readiness"),
    checkView("v_service_fiscal_readiness"),
    checkView("v_customer_fiscal_readiness"),
    checkView("v_fiscal_document_reconciliation_pending"),
  ]);

  // Entrada obrigatória do avaliador puro. Gates externos são sempre `false`.
  const input: PreflightInput = {
    operation: "PREFLIGHT",
    // Flags de emissão/runtime permanecem desativadas nesta fase — server-side,
    // não são configuráveis pelo cliente.
    emissionEnabled: false,
    runtimeMode: "DISABLED",
    provider: "NONE",
    requestedProduction: false,
    evidences: {
      // Externos — jamais promovidos pelo cliente.
      rlsRuntimeCertified: false,
      typesCertified: false,
      backfillCertified: false,
      sqlMaskCertified: false,
      // Derivados das views (respeitando RLS do chamador).
      companyReady: company.ok,
      productsReady: products.ok,
      servicesReady: services.ok,
      customersReady: customers.ok,
      reconciliationReady: reconciliation.ok,
    },
    metadata: {
      correlation_id: cid,
      contract_version: CONTRACT_VERSION,
      view_unknowns: {
        company: company.unknown,
        products: products.unknown,
        services: services.unknown,
        customers: customers.unknown,
        reconciliation: reconciliation.unknown,
      },
    },
  };

  const result = evaluatePreflight(input);

  // Nunca gravamos fiscal_events/audit/idempotência nesta fase.
  return json(
    200,
    {
      contract_version: CONTRACT_VERSION,
      correlation_id: cid,
      timestamp: new Date().toISOString(),
      status: result.status,
      canTransmit: false as const,
      operation: "PREFLIGHT" as const,
      provider: "NONE" as const,
      production: false as const,
      runtimeMode: result.runtimeMode,
      gates: result.gates,
      audit: result.audit,
      metadata: result.metadata,
    },
    cors,
  );
});
