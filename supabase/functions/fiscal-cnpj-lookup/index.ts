/**
 * Fase Fiscal H3-A — Proxy autenticado para consulta cadastral de CNPJ.
 *
 * FONTE
 * - BrasilAPI (`/api/cnpj/v1/{cnpj}` e `/api/ibge/municipios/v1/{UF}`).
 *   Dados públicos originados do CNPJ/RFB, não é canal oficial da RFB em
 *   tempo real. Devem ser revisados pelo usuário antes de salvar.
 *
 * INVARIANTES (não alterar sem migração formal para nova fase):
 *  - Não emite documento, não promove ambiente/produção, não conecta provedor.
 *  - Não usa `SUPABASE_SERVICE_ROLE_KEY`. Todo acesso a Supabase respeita RLS
 *    do chamador (JWT em `Authorization`).
 *  - Autorização por `has_role`, mesmos papéis de `fiscal-preflight`.
 *  - CNPJ é validado (DV) server-side antes de qualquer request externo.
 *  - CNPJ alfanumérico é aceito no formulário, mas a consulta automática
 *    retorna `alpha_unsupported` — provedor externo (BrasilAPI) ainda não
 *    disponibiliza o endpoint para esse formato.
 *  - Timeout curto; resposta whitelisted e limitada em tamanho.
 *  - Nunca loga payload, telefone, endereço, resposta completa ou JWT.
 *  - Este arquivo está versionado e testado, MAS PENDENTE DE DEPLOY.
 *    O frontend só pode chamá-lo após deploy autorizado pela homologação.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  PREFLIGHT_ALLOWED_ROLES,
  maskRecursive,
} from "../_shared/fiscal/preflight.ts";
import {
  unmaskCnpjAlpha,
  validateCnpjAlpha,
  isCnpjNumericOnly,
} from "../_shared/fiscal/cnpj.ts";

const CONTRACT_VERSION = "fiscal-cnpj-lookup/1.0.0";
const MAX_BODY_BYTES = 1024; // {version?, cnpj} cabe folgado
const EXTERNAL_TIMEOUT_MS = 5000;
const ROLE_TIMEOUT_MS = 3000;
const MAX_EXTERNAL_BYTES = 32 * 1024; // 32 KiB — resposta CNPJ típica < 4 KiB
const MAX_IBGE_BYTES = 256 * 1024; // lista de municípios por UF

const BRASILAPI_BASE = "https://brasilapi.com.br/api";

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

function parseAllowlist(): string[] {
  const raw = Deno.env.get("FISCAL_ALLOWED_ORIGINS") ?? "";
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const base: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (!origin) return base;
  if (parseAllowlist().includes(origin)) base["Access-Control-Allow-Origin"] = origin;
  return base;
}
function isBrowserOriginAllowed(req: Request): boolean {
  const origin = req.headers.get("Origin");
  if (!origin) return true;
  return parseAllowlist().includes(origin);
}

function correlationId(): string {
  return `cnpj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(maskRecursive(body)), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/**
 * Executa uma promise com timeout real. Guarda o handle do timer e o limpa
 * em qualquer caminho (sucesso, erro ou expiração), evitando timers órfãos.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => T,
): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      handle = setTimeout(() => {
        try {
          resolve(onTimeout());
        } catch (e) {
          reject(e);
        }
      }, ms);
      promise.then(
        (v) => {
          if (handle !== undefined) clearTimeout(handle);
          handle = undefined;
          resolve(v);
        },
        (e) => {
          if (handle !== undefined) clearTimeout(handle);
          handle = undefined;
          reject(e);
        },
      );
    });
  } finally {
    if (handle !== undefined) clearTimeout(handle);
  }
}

/* ─────────────────────── Fetch externo com timeout ─────────────────────── */
async function fetchExternal(
  url: string,
  maxBytes: number,
): Promise<{ status: number; body: unknown | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    const cl = Number(res.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(cl) && cl > maxBytes) {
      return { status: 413, body: null };
    }
    const text = await res.text();
    if (text.length > maxBytes) return { status: 413, body: null };
    if (!res.ok) return { status: res.status, body: null };
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return { status: 502, body: null };
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return { status: 504, body: null };
    return { status: 502, body: null };
  } finally {
    clearTimeout(t);
  }
}

/* ─────────────────── Whitelist / normalização da resposta ─────────────────── */
interface BrasilApiCnpj {
  razao_social?: unknown;
  nome_fantasia?: unknown;
  cnae_fiscal?: unknown;
  descricao_tipo_de_logradouro?: unknown;
  logradouro?: unknown;
  numero?: unknown;
  complemento?: unknown;
  bairro?: unknown;
  cep?: unknown;
  uf?: unknown;
  municipio?: unknown;
  ddd_telefone_1?: unknown;
  opcao_pelo_simples?: unknown;
  opcao_pelo_mei?: unknown;
}
const MAX_STR = 200;
function s(v: unknown): string | undefined {
  if (v == null) return undefined;
  const out = String(v).trim().slice(0, MAX_STR);
  return out.length > 0 ? out : undefined;
}
function norm(x: string): string {
  return x.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req);
  const cid = correlationId();

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")
    return json(405, { error: "method_not_allowed", correlation_id: cid }, cors);
  if (!isBrowserOriginAllowed(req))
    return json(403, { error: "origin_not_allowed", correlation_id: cid }, cors);

  let cnpjRaw = "";
  try {
    const cl = Number(req.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(cl) && cl > MAX_BODY_BYTES)
      return json(413, { error: "payload_too_large", correlation_id: cid }, cors);
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES)
      return json(413, { error: "payload_too_large", correlation_id: cid }, cors);
    const parsed = raw.trim() ? (JSON.parse(raw) as { version?: unknown; cnpj?: unknown }) : {};
    if (parsed.version !== undefined && parsed.version !== CONTRACT_VERSION)
      return json(400, { error: "unsupported_contract_version", correlation_id: cid }, cors);
    if (typeof parsed.cnpj !== "string")
      return json(400, { error: "invalid_body", correlation_id: cid }, cors);
    cnpjRaw = parsed.cnpj;
  } catch {
    return json(400, { error: "invalid_body", correlation_id: cid }, cors);
  }

  const cnpj = unmaskCnpjAlpha(cnpjRaw);
  if (!validateCnpjAlpha(cnpj))
    return json(400, { error: "invalid_cnpj", correlation_id: cid }, cors);
  if (!isNumericOnly(cnpj))
    return json(422, { error: "alpha_unsupported", correlation_id: cid }, cors);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return json(401, { error: "unauthorized", correlation_id: cid }, cors);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY)
    return json(500, { error: "server_misconfigured", correlation_id: cid }, cors);

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr || !userData?.user)
    return json(401, { error: "unauthorized", correlation_id: cid }, cors);
  const userId = userData.user.id;

  let authorized = false;
  for (const role of PREFLIGHT_ALLOWED_ROLES) {
    try {
      const t = setTimeout(() => {}, 0);
      const p = client.rpc("has_role", { _user_id: userId, _role: role });
      const race = await Promise.race([
        p,
        new Promise<{ data: unknown; error: unknown }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: "timeout" }), ROLE_TIMEOUT_MS),
        ),
      ]);
      clearTimeout(t);
      if (!(race as { error: unknown }).error && (race as { data: unknown }).data === true) {
        authorized = true;
        break;
      }
    } catch {
      /* fail-closed */
    }
  }
  if (!authorized) return json(403, { error: "forbidden", correlation_id: cid }, cors);

  // Consulta BrasilAPI — CNPJ
  const rfb = await fetchExternal(`${BRASILAPI_BASE}/cnpj/v1/${cnpj}`, MAX_EXTERNAL_BYTES);
  if (rfb.status === 404)
    return json(404, { error: "not_found", correlation_id: cid }, cors);
  if (rfb.status === 429)
    return json(429, { error: "rate_limited", correlation_id: cid }, cors);
  if (rfb.status === 504)
    return json(504, { error: "timeout", correlation_id: cid }, cors);
  if (rfb.status === 413 || rfb.status === 502 || rfb.body == null)
    return json(502, { error: "upstream_error", correlation_id: cid }, cors);

  const b = rfb.body as BrasilApiCnpj;
  if (!b || typeof b !== "object")
    return json(502, { error: "upstream_error", correlation_id: cid }, cors);

  const uf = s(b.uf)?.toUpperCase();
  const municipio = s(b.municipio);

  let ibge_code: string | null = null;
  let ibge_unresolved = false;
  if (uf && /^[A-Z]{2}$/.test(uf) && municipio) {
    const ibge = await fetchExternal(
      `${BRASILAPI_BASE}/ibge/municipios/v1/${encodeURIComponent(uf)}`,
      MAX_IBGE_BYTES,
    );
    if (Array.isArray(ibge.body)) {
      const target = norm(municipio);
      const match = (ibge.body as Array<{ nome?: unknown; codigo_ibge?: unknown }>).find(
        (m) => typeof m?.nome === "string" && norm(m.nome as string) === target,
      );
      const code = match?.codigo_ibge;
      if (typeof code === "string" && /^\d{6,8}$/.test(code)) ibge_code = code;
      else ibge_unresolved = true;
    } else {
      ibge_unresolved = true;
    }
  }

  const phone = s(b.ddd_telefone_1)?.replace(/\D/g, "").slice(0, 11);
  const cep = s(b.cep)?.replace(/\D/g, "").slice(0, 8);
  const cnaeDigits = s(b.cnae_fiscal)?.replace(/\D/g, "").slice(0, 7);
  const cnae = cnaeDigits ? cnaeDigits.padStart(7, "0") : undefined;
  const tipo = s(b.descricao_tipo_de_logradouro) ?? "";
  const log = s(b.logradouro) ?? "";
  const street = [tipo, log].filter(Boolean).join(" ").trim() || undefined;

  const taxRegimeHint =
    b.opcao_pelo_mei === true ? "MEI" : b.opcao_pelo_simples === true ? "SIMPLES" : null;

  const values: Record<string, string | undefined> = {
    legal_name: s(b.razao_social),
    trade_name: s(b.nome_fantasia),
    primary_cnae: cnae,
    phone,
    postal_code: cep,
    street,
    number: s(b.numero),
    complement: s(b.complemento),
    neighborhood: s(b.bairro),
    city: municipio,
    state: uf,
    country_code: "BR",
    municipality_ibge_code: ibge_code ?? undefined,
  };
  // Remove chaves undefined da resposta.
  for (const k of Object.keys(values)) if (values[k] === undefined) delete values[k];

  // Log MÍNIMO — nunca payload, telefone, endereço nem resposta completa.
  console.log(
    JSON.stringify({
      evt: "cnpj_lookup_ok",
      cid,
      contract: CONTRACT_VERSION,
      fields: Object.keys(values).length,
      ibge_unresolved,
    }),
  );

  return json(
    200,
    {
      contract_version: CONTRACT_VERSION,
      correlation_id: cid,
      source: "brasilapi",
      values,
      ibge_unresolved,
      tax_regime_hint: taxRegimeHint,
    },
    cors,
  );
});
