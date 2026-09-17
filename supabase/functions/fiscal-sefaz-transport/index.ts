/**
 * FASE H7f — Edge Function `fiscal-sefaz-transport`.
 *
 * Transporte SOAP NF-e 4.00 contra a SEFAZ-MG **HOMOLOGAÇÃO**. Não substitui
 * o `fiscal-xml-engine` (que continua com teto SIGNED): esta função consome o
 * XML já assinado e cuida exclusivamente do transporte, do retorno e da
 * persistência append-only em `fiscal_sefaz_transmissions`.
 *
 * Ações (POST, perfil fiscal interno):
 *   - `status`   — NFeStatusServico4
 *   - `authorize`— NFeAutorizacao4 (lote síncrono; invoice DERIVADO do run)
 *   - `receipt`  — NFeRetAutorizacao4 (consulta recibo)
 *   - `consult`  — NFeConsultaProtocolo4
 *   - `event`    — NFeRecepcaoEvento4 (exige `event_id` de evento fiscal
 *                  preparado e assinado server-side; `event_xml` é recusado)
 *
 * Invariantes fail-closed:
 *   - allowlist rígida `https://hnfe.fazenda.mg.gov.br/`; host produtivo =>
 *     `FISCAL_PRODUCTION_ENDPOINT_BLOCKED`;
 *   - tpAmb=2 exigido no marcador, nas settings, no documento e no retorno;
 *   - vínculo canônico: `SEFAZ_INVOICE_RUN_MISMATCH` /
 *     `SEFAZ_EVENT_INVOICE_MISMATCH` bloqueiam antes de qualquer POST;
 *   - `state` = transporte; `outcome` = resultado fiscal (H7G-004);
 *   - mTLS com o A1 aberto SOMENTE em memória; chave privada nunca sai daqui;
 *   - idempotência + fingerprint na RPC; documento autorizado nunca reenviado;
 *   - toda resposta/erro passa por `sanitizeSefazText`.

 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fiscalCorsHeaders } from "../_shared/fiscal/corsAllowlist.ts";
import { CANONICAL_SUPABASE_URL, isCanonicalSupabaseUrl } from "../_shared/fiscal/canonicalProject.ts";
import {
  assertSefazEndpointAllowed,
  resolveSefazEndpoint,
  SefazEndpointError,
  type SefazService,
} from "../_shared/fiscal/sefazEndpoints.ts";
import {
  buildConsReciNFe,
  buildConsSitNFe,
  buildConsStatServ,
  buildEnvEvento,
  buildEnviNFe,
  buildSoapEnvelope,
  isAuthorized,
  isRetryable,
  parseSefazResult,
  sanitizeSefazText,
  SefazSoapError,
  summarizeResponse,
} from "../_shared/fiscal/nfe/sefazSoap.ts";
import { isSupportedVaultFormat, parseSigningBundle } from "../_shared/fiscal/certificateVault.ts";
import {
  buildNfeProc,
  nfeProcStoragePath,
  NfeProcError,
  sha256HexOf,
} from "../_shared/fiscal/nfe/nfeProc.ts";

const TPAMB = "2";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_IDEMPOTENCY = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(origin: string | null): { headers: Record<string, string>; allowed: boolean } {
  // H7e: helper canônico (união default ∪ ambiente, origem normalizada, sem wildcard).
  const c = fiscalCorsHeaders(origin, "POST, OPTIONS");
  return { allowed: c.allowed, headers: c.headers };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeMasterKey(): Uint8Array | null {
  const raw = Deno.env.get("FISCAL_CERTIFICATE_MASTER_KEY");
  if (!raw) return null;
  try {
    const bin = atob(raw.trim());
    if (bin.length !== 32) return null;
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function fromBinaryColumn(value: string): Uint8Array {
  const v = String(value ?? "").trim();
  if (v.startsWith("\\x") || v.startsWith("0x")) {
    const hex = v.slice(2);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  const bin = atob(v);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, cipher: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, cipher);
  return new Uint8Array(plain);
}

/** Material mTLS: existe apenas no escopo da requisição e é zerado no fim. */
interface MtlsMaterial {
  certPem: string;
  keyPem: string;
  certificateId: string;
}

async function loadMtlsMaterial(admin: SupabaseClient, invoiceId: string | null): Promise<MtlsMaterial> {
  // H12: o certificado é SEMPRE o do emitente vinculado à nota — nunca "o mais
  // recente disponível". Sem nota resolvida ou sem vínculo inequívoco: fail-closed.
  if (!invoiceId) throw new SefazSoapError("CERTIFICATE_REQUIRED");
  const bound = await admin.rpc("rpc_fiscal_certificate_for_invoice_v1", { _invoice_id: invoiceId });
  if (bound.error) throw new SefazSoapError("CERTIFICATE_REQUIRED");
  const certificateId = (bound.data as Record<string, unknown> | null)?.certificateId as
    | string
    | undefined;
  if (!certificateId) throw new SefazSoapError("CERTIFICATE_REQUIRED");

  const masterKey = decodeMasterKey();
  if (!masterKey) throw new SefazSoapError("CERTIFICATE_REQUIRED");

  const material = await admin
    .from("fiscal_certificate_material")
    .select("object_path, material_iv, material_format")
    .eq("certificate_id", certificateId).maybeSingle();
  if (material.error || !material.data) throw new SefazSoapError("CERTIFICATE_REQUIRED");
  if (!isSupportedVaultFormat(material.data.material_format as string | null)) {
    throw new SefazSoapError("CERTIFICATE_REQUIRED");
  }

  let plain: Uint8Array | null = null;
  try {
    const dl = await admin.storage.from("fiscal-certificates").download(material.data.object_path);
    if (dl.error || !dl.data) throw new Error("download");
    plain = await aesGcmDecrypt(
      masterKey,
      fromBinaryColumn(material.data.material_iv as string),
      new Uint8Array(await dl.data.arrayBuffer()),
    );
    const bundle = parseSigningBundle(new TextDecoder().decode(plain));
    return { certPem: bundle.certPem, keyPem: bundle.keyPem, certificateId };
  } catch {
    throw new SefazSoapError("CERTIFICATE_DECRYPT_FAILED");
  } finally {
    plain?.fill(0);
  }
}

/** POST SOAP 1.2 com mTLS. A chave privada só existe neste escopo. */
async function postSoap(
  url: string,
  envelope: string,
  material: MtlsMaterial,
): Promise<{ httpStatus: number; body: string }> {
  assertSefazEndpointAllowed(url, TPAMB);

  const createHttpClient = (Deno as unknown as {
    createHttpClient?: (options: { cert: string; key: string }) => unknown;
  }).createHttpClient;
  if (typeof createHttpClient !== "function") {
    throw new SefazSoapError("SEFAZ_MTLS_UNAVAILABLE", "runtime sem suporte a mTLS");
  }
  const client = createHttpClient({ cert: material.certPem, key: material.keyPem });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      // @ts-expect-error opção específica do runtime Deno
      client,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
      body: envelope,
    });
    return { httpStatus: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
    try {
      client.close?.();
    } catch { /* noop */ }
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const { headers, allowed } = corsHeaders(origin);
  // Preflight de origem desconhecida também é recusado (paridade fail-closed
  // com `fiscal-xml-engine`): OPTIONS nunca devolve 200 fora da allowlist.
  if (req.method === "OPTIONS") {
    if (!allowed) return new Response("cors_denied", { status: 403, headers });
    return new Response("ok", { headers });
  }
  if (!allowed) return json({ error: "origin_not_allowed" }, 403, headers);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, headers);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "server_misconfigured" }, 500, headers);
  if (!isCanonicalSupabaseUrl(supabaseUrl)) {
    return json({ error: "canonical_project_required", expected: CANONICAL_SUPABASE_URL }, 503, headers);
  }

  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const claims = await authed.auth.getClaims(authHeader.replace("Bearer ", ""));
  const actor = claims.data?.claims?.sub as string | undefined;
  if (!actor) return json({ error: "unauthorized" }, 401, headers);

  // Autorização de negócio: perfil fiscal interno (fail-closed, server-side).
  const canOperate = await authed.rpc("fn_fiscal_can_operate", { _uid: actor });
  if (canOperate.error || canOperate.data !== true) {
    return json({ error: "permission_denied" }, 403, headers);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "invalid_body" }, 400, headers);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_body" }, 400, headers);
  }

  const action = String(body.action ?? "");
  const idempotencyKey = String(body.idempotency_key ?? "").trim();
  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY) {
    return json({ error: "idempotency_key_invalid" }, 400, headers);
  }

  const invoiceId = body.invoice_id ? String(body.invoice_id) : null;
  const xmlRunId = body.run_id ? String(body.run_id) : null;
  if (invoiceId && !UUID_RE.test(invoiceId)) return json({ error: "invoice_id_invalid" }, 400, headers);
  if (xmlRunId && !UUID_RE.test(xmlRunId)) return json({ error: "run_id_invalid" }, 400, headers);

  // 1. Resolve serviço + endpoint (allowlist dura de homologação MG).
  let service: SefazService;
  switch (action) {
    case "status": service = "NFeStatusServico4"; break;
    case "authorize": service = "NFeAutorizacao4"; break;
    case "receipt": service = "NFeRetAutorizacao4"; break;
    case "consult": service = "NFeConsultaProtocolo4"; break;
    case "event": service = "NFeRecepcaoEvento4"; break;
    default: return json({ error: "action_invalid" }, 400, headers);
  }

  let endpoint: string;
  try {
    endpoint = resolveSefazEndpoint(service, TPAMB);
  } catch (err) {
    const code = err instanceof SefazEndpointError ? err.code : "SEFAZ_ENDPOINT_INVALID";
    return json({ error: "endpoint_blocked", code }, 403, headers);
  }

  // 2. Monta o corpo da mensagem (documento assinado vem do motor de XML).
  //    H7G-001/002: invoice e evento são DERIVADOS server-side; o body nunca é
  //    autoridade sobre o vínculo do documento transmitido.
  let inner: string;
  let canonicalInvoiceId: string | null = invoiceId;
  let canonicalEventId: string | null = null;
  try {
    if (action === "status") {
      inner = buildConsStatServ(TPAMB);
    } else if (action === "consult") {
      inner = buildConsSitNFe(TPAMB, String(body.access_key ?? ""));
    } else if (action === "receipt") {
      inner = buildConsReciNFe(TPAMB, String(body.receipt ?? ""));
    } else if (action === "authorize") {
      if (!xmlRunId) return json({ error: "run_id_required" }, 400, headers);
      const run = await admin
        .from("fiscal_xml_runs")
        .select("id, state, signed_path, storage_bucket, fiscal_invoice_id, access_key, environment_code")
        .eq("id", xmlRunId).maybeSingle();
      if (run.error || !run.data) return json({ error: "run_not_found" }, 404, headers);
      if (run.data.state !== "SIGNED" || !run.data.signed_path) {
        return json({ error: "run_not_signed", code: "SEFAZ_DOCUMENT_NOT_SIGNED" }, 412, headers);
      }
      if (String(run.data.environment_code ?? "") !== TPAMB) {
        return json({ error: "environment_mismatch", code: "FISCAL_PRODUCTION_ENDPOINT_BLOCKED" }, 403, headers);
      }
      if (!/^[0-9]{44}$/.test(String(run.data.access_key ?? ""))) {
        return json({ error: "access_key_invalid", code: "SEFAZ_ACCESS_KEY_INVALID" }, 422, headers);
      }
      if (!run.data.fiscal_invoice_id) {
        return json({ error: "run_invoice_missing", code: "SEFAZ_RUN_INVOICE_MISSING" }, 422, headers);
      }
      // O invoice do body só é aceito se coincidir com o do run.
      if (invoiceId && invoiceId !== run.data.fiscal_invoice_id) {
        return json({ error: "invoice_run_mismatch", code: "SEFAZ_INVOICE_RUN_MISMATCH" }, 409, headers);
      }
      canonicalInvoiceId = run.data.fiscal_invoice_id as string;
      const dl = await admin.storage
        .from(run.data.storage_bucket ?? "fiscal-xml")
        .download(run.data.signed_path);
      if (dl.error || !dl.data) return json({ error: "signed_xml_unavailable" }, 500, headers);
      inner = buildEnviNFe({
        tpAmb: TPAMB,
        idLote: String(body.lote ?? Date.now()).slice(0, 15),
        signedNfeXml: await dl.data.text(),
      });
    } else {
      // H7G-002: evento transporta APENAS o XML assinado server-side, obtido do
      // evento fiscal canônico. XML de evento vindo do cliente é recusado.
      if (body.event_xml !== undefined || body.signed_event_xml !== undefined) {
        return json({ error: "event_xml_not_accepted", code: "SEFAZ_EVENT_XML_NOT_ACCEPTED" }, 400, headers);
      }
      const eventId = body.event_id ? String(body.event_id) : "";
      if (!UUID_RE.test(eventId)) {
        return json({ error: "event_id_required", code: "SEFAZ_EVENT_REQUIRED" }, 400, headers);
      }
      const ev = await admin
        .from("v_fiscal_sefaz_event_state")
        .select("event_id, fiscal_invoice_id, state, signed_xml_path, sefaz_access_key")
        .eq("event_id", eventId).maybeSingle();
      if (ev.error || !ev.data) return json({ error: "event_not_found", code: "SEFAZ_EVENT_NOT_FOUND" }, 404, headers);
      if (ev.data.state !== "SIGNED" || !ev.data.signed_xml_path) {
        return json({ error: "event_not_signed", code: "SEFAZ_EVENT_NOT_SIGNED" }, 412, headers);
      }
      if (invoiceId && invoiceId !== ev.data.fiscal_invoice_id) {
        return json({ error: "event_invoice_mismatch", code: "SEFAZ_EVENT_INVOICE_MISMATCH" }, 409, headers);
      }
      canonicalEventId = eventId;
      canonicalInvoiceId = ev.data.fiscal_invoice_id as string;
      const dl = await admin.storage.from("fiscal-xml").download(ev.data.signed_xml_path);
      if (dl.error || !dl.data) return json({ error: "signed_event_unavailable" }, 500, headers);
      inner = buildEnvEvento({
        tpAmb: TPAMB,
        idLote: String(body.lote ?? Date.now()).slice(0, 15),
        signedEventXml: await dl.data.text(),
      });
    }
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return json({ error: "payload_invalid", code: e.code ?? "SEFAZ_PAYLOAD_INVALID" },
      e.code === "FISCAL_PRODUCTION_ENDPOINT_BLOCKED" ? 403 : 422, headers);
  }

  const envelope = buildSoapEnvelope(service, inner);
  const fingerprint = await sha256Hex(`${service}|${endpoint}|${inner}`);

  // 3. Abre a transmissão (guard de ambiente + idempotência + vínculo canônico).
  const begun = await admin.rpc("rpc_fiscal_sefaz_transmit_begin_v1", {
    _service: service,
    _idempotency_key: idempotencyKey,
    _request_fingerprint: fingerprint,
    _endpoint_url: endpoint,
    _invoice_id: canonicalInvoiceId,
    _xml_run_id: xmlRunId,
    _actor: actor,
    _event_id: canonicalEventId,
  });

  if (begun.error) {
    const code = sanitizeSefazText(begun.error.message, 120).split(":")[0].trim() ||
      "FISCAL_TRANSMISSION_BEGIN_FAILED";
    const status = code.includes("PRODUCTION") ? 403 : 409;
    return json({ error: "transmission_blocked", code }, status, headers);
  }
  const tx = begun.data as Record<string, unknown>;
  if (!tx || typeof tx.transmissionId !== "string" || !UUID_RE.test(tx.transmissionId)) {
    return json({ error: "transmission_begin_invalid", authorized: false, retrySafe: false }, 502, headers);
  }
  const transmissionId = String(tx.transmissionId);

  // Replay: devolve o resultado já persistido, sem novo POST à SEFAZ.
  if (tx.idempotentReplay === true) {
    return json({ ...tx, replayed: true }, 200, headers);
  }

  // 4. Transporte com mTLS.
  let material: MtlsMaterial | null = null;
  let postAttempted = false;
  const started = Date.now();
  try {
    material = await loadMtlsMaterial(admin, canonicalInvoiceId);
    const sent = await admin.rpc("rpc_fiscal_sefaz_transmit_record_v1", {
      _transmission_id: transmissionId, _state: "SENT", _patch: {},
    });
    if (sent.error || sent.data?.state !== "SENT" || sent.data?.transmissionId !== transmissionId) {
      return json({ transmissionId, code: "FISCAL_SENT_PERSISTENCE_FAILED", authorized: false, retrySafe: false }, 503, headers);
    }

    postAttempted = true;
    const res = await postSoap(endpoint, envelope, material);
    const result = parseSefazResult(res.body);
    const durationMs = Date.now() - started;

    if (result.tpAmb && result.tpAmb !== TPAMB) {
      await admin.rpc("rpc_fiscal_sefaz_transmit_record_v1", {
        _transmission_id: transmissionId, _state: "BLOCKED",
        _patch: { errorCode: "FISCAL_PRODUCTION_ENDPOINT_BLOCKED" },
      });
      return json({ error: "environment_mismatch", code: "FISCAL_PRODUCTION_ENDPOINT_BLOCKED" }, 403, headers);
    }

    const ok = res.httpStatus >= 200 && res.httpStatus < 300 && !!result.cStat;
    const recorded = await admin.rpc("rpc_fiscal_sefaz_transmit_record_v1", {
      _transmission_id: transmissionId,
      _state: ok ? "SUCCEEDED" : "FAILED",
      _patch: {
        cStat: result.cStat, protocolCStat: result.protocolCStat,
        xMotivo: sanitizeSefazText(result.xMotivo ?? "", 200),
        chNFe: result.chNFe, nProt: result.nProt, nRec: result.nRec,
        tpAmb: result.tpAmb, dhRecbto: result.dhRecbto,
        errorCode: ok ? null : "SEFAZ_TRANSPORT_FAILED",
        responseSummary: summarizeResponse({ httpStatus: res.httpStatus, result, durationMs }),
      },
    });

    if (recorded.error || recorded.data?.transmissionId !== transmissionId || recorded.data?.state !== (ok ? "SUCCEEDED" : "FAILED")) {
      return json({ transmissionId, code: "FISCAL_RECONCILIATION_REQUIRED", reconciliationRequired: true, authorized: false, retrySafe: false }, 503, headers);
    }

    // H7G-004: `state` descreve apenas o TRANSPORTE. O resultado fiscal é o
    // `outcome` derivado server-side do cStat/protocolo.
    const outcome = (recorded.data as Record<string, unknown> | null)?.outcome ?? null;
    return json({
      transmissionId,
      service,
      state: ok ? "SUCCEEDED" : "FAILED",
      transportState: ok ? "SUCCEEDED" : "FAILED",
      outcome,
      environmentCode: TPAMB,
      cStat: result.cStat,
      xMotivo: sanitizeSefazText(result.xMotivo ?? "", 200),
      chNFe: result.chNFe,
      nProt: result.nProt,
      nRec: result.nRec,
      authorized: isAuthorized(result) && outcome === "AUTHORIZED",
      retrySafe: false,
      reconciliationRequired: isRetryable(result),
    }, ok ? 200 : 502, headers);

  } catch (err) {
    // A network failure after the POST may still have reached SEFAZ. Keep SENT
    // persisted and require consultation; never classify it as safe to resend.
    if (postAttempted) {
      return json({ transmissionId, code: "FISCAL_RECONCILIATION_REQUIRED", reconciliationRequired: true, authorized: false, retrySafe: false }, 503, headers);
    }
    const e = err as { code?: string; message?: string };
    const code = e.code ?? "SEFAZ_TRANSPORT_FAILED";
    await admin.rpc("rpc_fiscal_sefaz_transmit_record_v1", {
      _transmission_id: transmissionId,
      _state: code === "CERTIFICATE_REQUIRED" ? "BLOCKED" : "FAILED",
      _patch: {
        errorCode: code,
        responseSummary: { error: code, detail: sanitizeSefazText(e.message ?? "", 200) },
      },
    });
    return json({ transmissionId, state: "FAILED", code },
      code === "CERTIFICATE_REQUIRED" ? 412 : 502, headers);
  } finally {
    if (material) {
      material.certPem = "";
      material.keyPem = "";
    }
  }
});
