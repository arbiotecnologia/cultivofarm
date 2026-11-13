/**
 * Emissão NFS-e pelo Emissor Público Nacional (SefinNacional) para a própria
 * empresa do ator. Fail-closed em cada etapa:
 *  - `NFSE_TRANSMISSION_ENABLED` ≠ "true" → nenhum ledger/POST (transmission_disabled),
 *    EXCETO (organização, emitente) na allowlist privada de homologação verificada
 *    server-side por rpc_nfse_homolog_send_allowed_v1: aí só HOMOLOGATION, produção
 *    forçada desligada, host exato sefin.producaorestrita.nfse.gov.br e sem redirects;
 *  - produção exige `NFSE_PRODUCTION_ENABLED` = "true" E liberação server-side;
 *  - sem configuração/credencial → integration_not_configured;
 *  - sem ledger instalado (RPC ausente) → ledger_not_installed, sem POST.
 * DPS v1.01 assinada com o A1 do emitente, gzip+base64, mTLS com o mesmo A1.
 * Autorização só após verificar o XML da NFS-e devolvido. Ambiguidade após o
 * POST exige reconciliação (action "reconcile"), nunca reenvio automático.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fiscalCorsHeaders } from "../_shared/fiscal/corsAllowlist.ts";
import { isCanonicalSupabaseUrl } from "../_shared/fiscal/canonicalProject.ts";
import { isSupportedVaultFormat, parseSigningBundle } from "../_shared/fiscal/certificateVault.ts";
import { decodeMasterKey } from "../_shared/fiscal/masterKey.ts";
import { signDpsXml, verifyDpsSignature } from "../_shared/nfse/signDps.ts";
import { emitNfse, reconcileNfse, type EmitDeps, type LedgerRow } from "../_shared/nfse/emitFlow.ts";
import { mapInvoiceToDps } from "../_shared/nfse/dpsFromInvoice.ts";
import { assertSefinUrl, type NfseEnvironment } from "../_shared/nfse/sefinContract.ts";
import { assertAllowlistUrl, decideTransmissionGate, rejectRedirect } from "../_shared/nfse/homologAllowlist.ts";
import { classifyHttpError, classifyStatus, finalizeDiagnostic, runtimeCapabilities, stageFromUrl, type NfseHttpDiagnostic } from "../_shared/nfse/reconcileDiagnostic.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9_.:-]{16,128}$/;
const TIMEOUT_MS = 30_000;

async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function fromBinaryColumn(value: string): Uint8Array {
  const v = String(value ?? "").trim();
  if (v.startsWith("\\x") || v.startsWith("0x")) { const h = v.slice(2); return Uint8Array.from({ length: h.length / 2 }, (_, i) => parseInt(h.substr(i * 2, 2), 16)); }
  return Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
}
function rowFrom(d: Record<string, unknown>): LedgerRow {
  return { transmissionId: String(d.id), state: d.state as LedgerRow["state"], outcome: d.outcome as LedgerRow["outcome"], dpsNumber: Number(d.dps_number),
    dpsSeries: String(d.dps_series), dpsId: (d.dps_id as string) ?? null, environment: d.environment as NfseEnvironment, accessKey: (d.access_key as string) ?? null,
    idempotentReplay: d.idempotent_replay === true };
}

/** Cadeia + chave do A1 vinculado à nota; só em memória durante a requisição. */
async function loadA1(admin: SupabaseClient, invoiceId: string): Promise<{ certPem: string; chainPem: string; keyPem: string }> {
  const bound = await admin.rpc("rpc_fiscal_certificate_for_invoice_v1", { _invoice_id: invoiceId });
  const certificateId = (bound.data as Record<string, unknown> | null)?.certificateId as string | undefined;
  if (bound.error || !certificateId) throw Object.assign(new Error("cert"), { code: "CERTIFICATE_REQUIRED" });
  const master = await decodeMasterKey();
  if (!master) throw Object.assign(new Error("cert"), { code: "CERTIFICATE_REQUIRED" });
  const m = await admin.from("fiscal_certificate_material").select("object_path, material_iv, material_format").eq("certificate_id", certificateId).maybeSingle();
  if (m.error || !m.data || !isSupportedVaultFormat(m.data.material_format as string | null)) throw Object.assign(new Error("cert"), { code: "CERTIFICATE_REQUIRED" });
  let plain: Uint8Array | null = null;
  try {
    const dl = await admin.storage.from("fiscal-certificates").download(m.data.object_path as string);
    if (dl.error || !dl.data) throw new Error("download");
    const key = await crypto.subtle.importKey("raw", master as BufferSource, "AES-GCM", false, ["decrypt"]);
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBinaryColumn(m.data.material_iv as string) as BufferSource }, key, await dl.data.arrayBuffer()));
    const b = parseSigningBundle(new TextDecoder().decode(plain));
    return { certPem: b.certPem, chainPem: [b.certPem, ...b.chainPem].join("\n"), keyPem: b.keyPem };
  } catch { throw Object.assign(new Error("cert"), { code: "CERTIFICATE_DECRYPT_FAILED" }); } finally { plain?.fill(0); }
}

Deno.serve(async (req) => {
  const cors = fiscalCorsHeaders(req.headers.get("Origin"));
  const headers = { ...cors.headers, "Content-Type": "application/json" };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return cors.allowed ? new Response("ok", { headers: cors.headers }) : reply(403, { code: "origin_forbidden" });
  if (!cors.allowed) return reply(403, { code: "origin_forbidden" });
  if (req.method !== "POST") return reply(405, { code: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!isCanonicalSupabaseUrl(url) || !anon) return reply(503, { code: "environment_not_canonical" });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return reply(401, { code: "unauthenticated" });

  let body: { invoice_id?: unknown; idempotency_key?: unknown; action?: unknown; transmission_id?: unknown };
  try { body = await req.json(); } catch { return reply(400, { code: "invalid_body" }); }
  if (typeof body.invoice_id !== "string" || !UUID.test(body.invoice_id)) return reply(400, { code: "invoice_id_invalid" });
  const action = body.action === "reconcile" ? "reconcile" : "emit";
  if (action === "emit" && (typeof body.idempotency_key !== "string" || !KEY.test(body.idempotency_key))) return reply(400, { code: "idempotency_key_invalid" });
  if (action === "reconcile" && (typeof body.transmission_id !== "string" || !UUID.test(body.transmission_id))) return reply(400, { code: "transmission_id_invalid" });
  const invoiceId = body.invoice_id;

  const db = createClient(url!, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: claims, error: authErr } = await db.auth.getClaims(auth.slice(7));
  const actor = claims?.claims?.sub as string | undefined;
  if (authErr || !actor) return reply(401, { code: "unauthenticated" });

  // Leitura com o JWT do ator (RLS) e prontidão canônica da própria empresa.
  const { data: inv, error: invErr } = await db.from("fiscal_invoices").select("id, invoice_type, normalized_status, organization_id").eq("id", invoiceId).maybeSingle();
  if (invErr || !inv) return reply(404, { code: "invoice_not_found" });
  if (inv.invoice_type !== "NFSE") return reply(422, { code: "invoice_not_nfse" });
  if (action === "emit" && inv.normalized_status !== "DRAFT") return reply(409, { code: "invoice_not_draft" });
  const { data: readiness, error: rErr } = await db.rpc("rpc_service_nfse_readiness_v1");
  if (rErr) return reply(rErr.code === "42501" ? 403 : 500, { code: rErr.code === "42501" ? "forbidden" : "readiness_unavailable" });
  if (!readiness?.ready) return reply(409, { code: "integration_not_configured", missing: readiness?.missing ?? [] });
  if (readiness.provider !== "NFSE_NACIONAL") return reply(409, { code: "provider_not_supported" });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return reply(500, { code: "server_misconfigured" });
  const admin = createClient(url!, serviceKey, { auth: { persistSession: false } });
  const access = await admin.rpc("h15_service_actor_invoice_access", { p_actor: actor, p_invoice: invoiceId });
  if (access.error || access.data !== true) return reply(403, { code: "forbidden" });

  const globalEnabled = Deno.env.get("NFSE_TRANSMISSION_ENABLED") === "true";
  let allow: { allowed: boolean; reason?: string | null } | null = null;
  if (!globalEnabled) {
    const a = await admin.rpc("rpc_nfse_homolog_send_allowed_v1", { _actor: actor, _invoice_id: invoiceId });
    allow = a.error ? { allowed: false, reason: a.error.code === "PGRST202" || a.error.code === "42883" ? "allowlist_not_installed" : "transmission_disabled" }
      : { allowed: (a.data as { allowed?: unknown } | null)?.allowed === true, reason: ((a.data as { reason?: unknown } | null)?.reason as string) ?? null };
  }
  const gate = decideTransmissionGate({ globalEnabled, productionFlag: Deno.env.get("NFSE_PRODUCTION_ENABLED") === "true", allowlist: allow });
  if (!gate.enabled) return reply(409, { code: "transmission_disabled", reason: gate.reason, message: "Envio NFS-e desligado neste ambiente; a nota permanece em rascunho." });
  const transmissionEnabled = true;

  let a1: { certPem: string; chainPem: string; keyPem: string } | null = null;
  // Diagnóstico seguro da última chamada HTTP (sem URL com id, corpo, XML ou mensagens brutas).
  let lastDiag: NfseHttpDiagnostic | null = null;
  const deps: EmitDeps = {
    flags: { transmissionEnabled, productionEnabled: gate.productionEnabled },
    sha256Hex,
    ledger: {
      async begin(a) {
        const r = await admin.rpc("rpc_nfse_transmit_begin_v1", { _actor: actor, _invoice_id: a.invoiceId, _idempotency_key: a.idempotencyKey, _fingerprint: a.fingerprint, _environment: a.environment, _endpoint_host: a.endpointHost });
        if (r.error) throw Object.assign(new Error("begin"), { code: r.error.code === "PGRST202" || r.error.code === "42883" ? "ledger_not_installed" : r.error.message.split(":")[0].slice(0, 60), status: r.error.code === "42501" ? 403 : 409 });
        return rowFrom(r.data as Record<string, unknown>);
      },
      async record(id, state, outcome, patch) {
        const r = await admin.rpc("rpc_nfse_transmit_record_v1", { _transmission_id: id, _state: state, _outcome: outcome, _patch: patch });
        if (r.error) throw Object.assign(new Error("record"), { code: "reconciliation_required", status: 503 });
        return rowFrom(r.data as Record<string, unknown>);
      },
      async get(id) {
        const r = await admin.from("nfse_transmissions").select("*").eq("id", id).eq("fiscal_invoice_id", invoiceId).eq("organization_id", inv.organization_id).maybeSingle();
        return r.data ? rowFrom(r.data as Record<string, unknown>) : null;
      },
      async storeNfseXml(id, xml, sha) {
        const path = `${inv.organization_id}/nfse/${id}.xml`;
        const up = await admin.storage.from("fiscal-xml").upload(path, new Blob([xml], { type: "application/xml" }), { upsert: false, contentType: "application/xml" });
        if (up.error) return false;
        const r = await admin.rpc("rpc_nfse_transmit_record_v1", { _transmission_id: id, _state: "SUCCEEDED", _outcome: "RECONCILIATION_REQUIRED", _patch: { nfseXmlSha256: sha, nfseXmlPath: path } });
        return !r.error;
      },
    },
    async loadDps() {
      const [i, items] = await Promise.all([
        admin.from("fiscal_invoices").select("id, environment, issue_date, draft_version, total_amount, company_settings_id, customer_id, organization_id, fiscal_profile_snapshot").eq("id", invoiceId).single(),
        admin.from("fiscal_invoice_items").select("description, net_value, fiscal_profile_snapshot, tax_snapshot, item_sequence").eq("fiscal_invoice_id", invoiceId).order("item_sequence"),
      ]);
      if (i.error || items.error || i.data.organization_id !== inv.organization_id) throw Object.assign(new Error("load"), { code: "invoice_not_found", status: 404 });
      const [c, cli, cfp] = await Promise.all([
        admin.from("company_fiscal_settings").select("cnpj, municipality_ibge_code, municipal_registration, crt, fiscal_environment, phone, fiscal_email, organization_id").eq("id", i.data.company_settings_id).single(),
        admin.from("clientes").select("cpf_cnpj, nome, razao_social, email, organization_id").eq("id", i.data.customer_id).single(),
        admin.from("customer_fiscal_profiles").select("cpf_cnpj, legal_name, fiscal_email, fiscal_phone, municipal_registration").eq("customer_id", i.data.customer_id).maybeSingle(),
      ]);
      if (c.error || cli.error || c.data.organization_id !== inv.organization_id || cli.data.organization_id !== inv.organization_id) throw Object.assign(new Error("load"), { code: "tenant_mismatch", status: 403 });
      const m = mapInvoiceToDps({ ...i.data, items: items.data ?? [] }, c.data, {
        cpf_cnpj: cfp.data?.cpf_cnpj ?? cli.data.cpf_cnpj, name: cfp.data?.legal_name ?? cli.data.razao_social ?? cli.data.nome, email: cfp.data?.fiscal_email ?? cli.data.email,
        municipal_registration: cfp.data?.municipal_registration ?? null, phone: cfp.data?.fiscal_phone ?? null,
      }, new Date());
      if (!m.ok) throw Object.assign(new Error("dps"), { code: "dps_incomplete", status: 422, missing: m.missing });
      if (gate.homologOnlyHost && m.input.environment !== "HOMOLOGATION") throw Object.assign(new Error("env"), { code: "production_blocked", status: 403 });
      return { input: m.input, fingerprint: await sha256Hex(m.fingerprintSource) };
    },
    async sign(xml, dpsId, cnpj) {
      a1 ??= await loadA1(admin, invoiceId);
      const s = signDpsXml({ xml, dpsId, emitterCnpj: cnpj, material: { certPem: a1.certPem, keyPem: a1.keyPem } });
      return { signedXml: s.signedXml, verified: verifyDpsSignature(s.signedXml).valid };
    },
    async http(r) {
      const env: NfseEnvironment = new URL(r.url).host === "sefin.nfse.gov.br" ? "PRODUCTION" : "HOMOLOGATION";
      assertSefinUrl(r.url, env);
      if (gate.homologOnlyHost) assertAllowlistUrl(r.url);
      const stage = stageFromUrl(r.url);
      const runtime = runtimeCapabilities();
      lastDiag = { stage, result: "certificate_unavailable", httpStatus: null, runtime };
      a1 ??= await loadA1(admin, invoiceId);
      lastDiag = { stage, result: "network_error", httpStatus: null, runtime };
      // API Deno estável (>=1.41/2.x): mTLS por `cert`/`key` PEM em memória; verificação do servidor nunca desligada.
      // HTTP/1.1 forçado (http2:false): o IIS da Sefin responde HTTP_1_1_REQUIRED a pedidos h2 com certificado.
      const create = (Deno as unknown as { createHttpClient?: (o: { cert: string; key: string; http1?: boolean; http2?: boolean }) => { close?: () => void } }).createHttpClient;
      if (typeof create !== "function") { lastDiag = { ...lastDiag, result: "mtls_unavailable", causes: ["unsupported_option"] }; throw Object.assign(new Error("mtls"), { code: "NFSE_MTLS_UNAVAILABLE" }); }
      let client: { close?: () => void };
      try { client = create({ cert: a1.chainPem, key: a1.keyPem, http1: true, http2: false }); runtime.http1Forced = true; }
      catch (e) {
        try { client = create({ cert: a1.chainPem, key: a1.keyPem }); runtime.http1Forced = false; }
        catch (e2) { lastDiag = { ...lastDiag, result: "mtls_client_rejected", causes: [...new Set([...errorCauses(e), ...errorCauses(e2)])] }; throw Object.assign(new Error("mtls"), { code: "NFSE_MTLS_CLIENT_REJECTED" }); }
      }
      const one = async (url: string, method: "GET" | "POST", payload?: string) => {
        const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
          const res = await fetch(url, { method, signal: ctrl.signal, body: payload, redirect: "manual",
            // @ts-expect-error opção do runtime Deno
            client, headers: { Accept: "application/json", ...(payload ? { "Content-Type": "application/json; charset=utf-8" } : {}) } });
          const text = (await res.text()).slice(0, 6 * 1024 * 1024);
          const kind = contentKind(res.headers.get("content-type"), text);
          return { status: res.status, text, kind, error: null as unknown, aborted: false };
        } catch (e) { return { status: null as number | null, text: "", kind: null, error: e, aborted: ctrl.signal.aborted }; }
        finally { clearTimeout(timer); }
      };
      const probeClass = (p: Awaited<ReturnType<typeof one>>): NfseHttpFailure =>
        p.status === null ? (p.aborted ? "timeout" : classifyHttpError(p.error)) : classifyStatus(p.status, p.kind ?? "other");
      try {
        // Sonda de rota (somente GET da documentação, sem identificador de DPS) nas duas bases, em consultas.
        let routeProbe: NfseHttpDiagnostic["routeProbe"] | undefined;
        if (r.method === "GET" && stage === "dps_lookup") {
          const doc = await one(`${SEFIN_NACIONAL_BASE.HOMOLOGATION}/docs/index`, "GET");
          const leg = await one(`${SEFIN_NACIONAL_LEGACY_HOMOLOG_BASE}/docs/index`, "GET");
          routeProbe = { documentedBase: probeClass(doc), legacyBase: probeClass(leg) };
        }
        const res = await one(r.url, r.method, r.body);
        if (res.status === null) {
          lastDiag = { ...lastDiag, result: res.aborted ? "timeout" : classifyHttpError(res.error), causes: res.aborted ? ["aborted"] : errorCauses(res.error), routeProbe };
          console.log(diagnosticLogLine(lastDiag));
          throw res.error ?? new Error("transport");
        }
        lastDiag = { ...lastDiag, result: classifyStatus(res.status, res.kind ?? "other"), httpStatus: res.status, contentKind: res.kind,
          officialErrorCodes: res.kind === "json" ? officialErrorCodes(res.text) : [], routeProbe,
          causes: res.status === 403 && res.kind === "html_access_denied" ? ["tls_renegotiation_unsupported"] : [] };
        console.log(diagnosticLogLine(lastDiag));
        rejectRedirect(res.status);
        return { status: res.status, body: res.text };
      } finally { try { client.close?.(); } catch { /* noop */ } }
    },
  };

  try {
    const result = action === "emit"
      ? await emitNfse(deps, { invoiceId, idempotencyKey: body.idempotency_key as string })
      : await reconcileNfse(deps, { transmissionId: body.transmission_id as string });
    const { httpStatus, ...rest } = result;
    if (action === "reconcile") return reply(httpStatus, { ...rest, diagnostic: finalizeDiagnostic(lastDiag, rest.code) ?? { stage: "before_http", result: null, httpStatus: null, runtime: runtimeCapabilities() } });
    return reply(httpStatus, rest);
  } catch (e) {
    const err = e as { code?: string; status?: number; missing?: string[] };
    return reply(err.status ?? 500, { code: err.code ?? "nfse_internal_error", missing: err.missing, authorized: false, retrySafe: false,
      ...(action === "reconcile" ? { diagnostic: lastDiag ?? { stage: "before_http", result: null, httpStatus: null, runtime: runtimeCapabilities() } } : {}) });
  } finally {
    const held = a1 as { keyPem: string } | null;
    if (held) held.keyPem = "";
    a1 = null;
  }
});
