/**
 * Fase F4 — Edge Function `fiscal-xml-engine`.
 *
 * Ações (POST, admin/perfil fiscal interno):
 *   0. `xsd-selftest` — diagnóstico somente leitura do bundle XSD: valida um
 *                      XML mínimo deliberadamente inválido para provar que os
 *                      5 XSDs oficiais foram empacotados e que o validador
 *                      executa no runtime. Não acessa banco, Storage,
 *                      certificado, assinatura nem transporte, e só responde
 *                      metadados não sensíveis. Disponível após CORS, método,
 *                      Bearer, gate de projeto canônico e parse do body, mas
 *                      antes das exigências de claims/perfil fiscal.
 *   1. `generate`  — prepara (RPC), constrói o XML, aplica o precheck de
 *                    gramática, armazena o não assinado, assina com o A1,
 *                    valida o documento ASSINADO contra o XSD 1.0 OFICIAL
 *                    (bundle PL_010g_v1.03 compilado em ./xsdBundle.ts, via
 *                    Apache Xerces-C++ WASM em processo),
 *                    verifica a XMLDSig e só então registra
 *                    XSD_VALIDATED → SIGNED. Teto: SIGNED.
 *                    Ausência de certificado devolve 412 CERTIFICATE_REQUIRED
 *                    preservando a execução em GENERATED (recuperável).
 *   2. `download`  — entrega autenticada dos bytes de um artefato (sem URL).
 *
 * Invariantes:
 *   - Só homologação (tpAmb=2). Nenhuma transmissão à SEFAZ.
 *   - Progressão de estado exclusivamente por `rpc_fiscal_xml_record_v1`
 *     (service_role). A função nunca faz UPDATE direto na tabela.
 *   - Falha em qualquer etapa registra FAILED com código sanitizado.
 *   - Nunca loga nem retorna: senha do PFX, material do certificado, chave
 *     privada, JWT, service_role ou o próprio XML por canal não autenticado.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fiscalCorsHeaders } from "../_shared/fiscal/corsAllowlist.ts";
import {
  CANONICAL_SUPABASE_URL,
  isCanonicalSupabaseUrl,
} from "../_shared/fiscal/canonicalProject.ts";
import { buildNfeXml, NFE_NAMESPACE, type NfePayload } from "../_shared/fiscal/nfe/buildNfeXml.ts";
import { validateNfeXml } from "../_shared/fiscal/nfe/validateNfeXml.ts";
import { signNfeXml, verifyNfeSignature } from "../_shared/fiscal/nfe/signNfeXml.ts";
import { isSupportedVaultFormat, parseSigningBundle } from "../_shared/fiscal/certificateVault.ts";
import {
  isAlreadyExistingObject,
  verifyExistingObject,
} from "../_shared/fiscal/nfe/protocoledStorage.ts";

import {
  inspectOfficialXsdBundle,
  validateAgainstOfficialXsd,
  XSD_FILE_COUNT,
  XSD_PACKAGE,
  XSD_VALIDATOR,
} from "./xsdValidate.ts";

const BUCKET = "fiscal-xml";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDEMPOTENCY = 200;

// xsd-selftest: XML mínimo deliberadamente inválido — raiz inexistente no
// leiaute NF-e, o que obriga o Xerces-C++ (WASM, em processo) a compilar a
// cadeia completa de XSDs (xmldsig → tipos → leiaute → nfe) para reportar a
// violação. Conteúdo fixo, sem nenhum dado fiscal.

const XSD_SELFTEST_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<xsdSelfTestProbe xmlns="http://www.portalfiscal.inf.br/nfe">invalid-root</xsdSelfTestProbe>';
const XSD_SELFTEST_EXPECTED_FILES = XSD_FILE_COUNT;

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

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Bounded buffering: never call Blob/Response.arrayBuffer() on untrusted input.
// Cancellation is immediate and never awaits a possibly stalled transport.
class ReadLimitError extends Error {}
class ReadDeadlineError extends Error {}
async function readBounded(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  signal: AbortSignal,
  deadline: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    chunks.length = 0;
    void reader.cancel().catch(() => undefined);
  };
  let rejectAbort: ((error: Error) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => { cancel(); rejectAbort?.(new ReadDeadlineError()); };
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(onAbort, Math.max(0, deadline - performance.now()));
  try {
    if (signal.aborted || performance.now() >= deadline) throw new ReadDeadlineError();
    while (true) {
      const result = await Promise.race([reader.read(), aborted]);
      if (signal.aborted || performance.now() >= deadline) throw new ReadDeadlineError();
      if (result.done) break;
      const chunk = result.value;
      if (!ArrayBuffer.isView(chunk) || Object.prototype.toString.call(chunk) !== "[object Uint8Array]") throw new Error("invalid_chunk");
      if (chunk.byteLength > maxBytes - total) throw new ReadLimitError();
      chunks.push(chunk);
      total += chunk.byteLength;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    chunks.length = 0;
    // A pending reader that ignores cancellation must not hold the response.
    try { reader.releaseLock(); } catch { /* pending underlying read */ }
  }
}

// Única chave mestra aceita: derivação compartilhada com o upload
// (Deno.env.get("FISCAL_CERTIFICATE_MASTER_KEY") em ../_shared/fiscal/masterKey.ts).

/**
 * Integridade de artefato imutável no Storage: colisão de path só é aceita
 * quando o objeto já armazenado é byte-idêntico ao conteúdo determinístico.
 * Divergência => XML_STORAGE_CONFLICT (nunca sobrescreve).
 * Falha de verificação => XML_STORAGE_VERIFY_FAILED.
 */
async function ensureStoredArtifact(
  admin: SupabaseClient,
  path: string,
  bytes: Uint8Array,
  expectedSha: string,
): Promise<string | null> {
  const up = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/xml",
    upsert: false,
  });
  if (!up.error) return null;
  if (!isAlreadyExistingObject(up.error)) return "XML_STORAGE_FAILED";
  const verdict = await verifyExistingObject(
    () => admin.storage.from(BUCKET).download(path) as unknown as Promise<
      { data: { arrayBuffer(): Promise<ArrayBuffer> } | null; error: unknown }
    >,
    expectedSha,
    bytes.byteLength,
  );
  if (!verdict) return null;
  return verdict.endsWith("VERIFY_FAILED") ? "XML_STORAGE_VERIFY_FAILED" : "XML_STORAGE_CONFLICT";
}


/**
 * F4.2 — decodifica coluna `bytea` devolvida pelo PostgREST, que serializa
 * como hexadecimal `\x...`. Base64 continua aceito para compatibilidade.
 */
function fromBinaryColumn(value: string): Uint8Array {
  const v = String(value ?? "").trim();
  if (v.startsWith("\\x") || v.startsWith("0x")) {
    const hex = v.slice(2);
    if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
      throw new Error("bytea_hex_invalid");
    }
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  const bin = atob(v);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, cipher: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", new Uint8Array(key).buffer, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv).buffer }, cryptoKey, new Uint8Array(cipher).buffer);
  return new Uint8Array(plain);
}

Deno.serve(async (req) => {
  const enteredAt = performance.now();
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  const headers = cors.headers;

  if (req.method === "OPTIONS") {
    if (!cors.allowed) return new Response("cors_denied", { status: 403, headers });
    return new Response("ok", { headers });
  }
  if (!cors.allowed) return json({ error: "cors_origin_not_allowed" }, 403, headers);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, headers);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "server_misconfigured" }, 500, headers);
  if (!isCanonicalSupabaseUrl(supabaseUrl)) {
    return json({ error: "FISCAL_CANONICAL_PROJECT_REQUIRED", expected: CANONICAL_SUPABASE_URL }, 503, headers);
  }

  // All three actions accept identifier-only JSON. Bound ingress (16 KiB / 5 s
  // from entry) without changing generate's fiscal execution or default action.
  let body: Record<string, unknown>;
  try {
    if (req.signal.aborted) throw new ReadDeadlineError();
    const declaredLength = req.headers.get("Content-Length");
    if (declaredLength !== null && /^\d+$/.test(declaredLength) && Number(declaredLength) > 16 * 1024) {
      void req.body?.cancel().catch(() => undefined);
      throw new ReadLimitError();
    }
    if (!req.body) throw new Error("invalid_body");
    const bytes = await readBounded(req.body, 16 * 1024, req.signal, enteredAt + 5_000);
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_body");
    body = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ReadLimitError) return json({ error: "body_too_large" }, 413, headers);
    if (error instanceof ReadDeadlineError) return json({ error: "request_unavailable" }, 504, headers);
    return json({ error: "invalid_body" }, 400, headers);
  }

  const action = String(body.action ?? "generate");

  // ------------------------------------------------------------------
  // xsd-selftest: prova que os 5 XSDs oficiais foram empacotados e que o
  // validador executa no runtime. Não toca banco, Storage, certificado,
  // assinatura nem transporte, e não devolve conteúdo sensível.
  // ------------------------------------------------------------------
  if (action === "xsd-selftest") {
    // Etapa 1: inspeção somente leitura do bundle (sem validador, sem conteúdo).
    let inspection: { ok: boolean; fileCount: number; schema: string };
    try {
      inspection = await inspectOfficialXsdBundle();
    } catch {
      return json(
        { ok: false, error: "XSD_BUNDLE_UNAVAILABLE", diagnostic: "XSD_BUNDLE_CHECK_FAILED" },
        500,
        headers,
      );
    }
    if (!inspection.ok || inspection.fileCount !== XSD_SELFTEST_EXPECTED_FILES) {
      return json(
        { ok: false, error: "XSD_BUNDLE_UNAVAILABLE", diagnostic: "XSD_BUNDLE_CHECK_FAILED" },
        500,
        headers,
      );
    }
    // Etapa 2: execução real do validador (Xerces/WASM em processo). Qualquer
    // falha aqui é um diagnóstico de execução genérico — enum fixo, nunca
    // mensagem, valor, path ou stack crus.

    try {
      const probe = await validateAgainstOfficialXsd(XSD_SELFTEST_XML);
      const executed = probe.valid === false && (probe.issues?.length ?? 0) > 0;
      if (!executed) {
        return json(
          {
            ok: false,
            error: "XSD_BUNDLE_UNAVAILABLE",
            diagnostic: "XSD_VALIDATOR_MEMORY_OR_WASM_FAILED",
          },
          500,
          headers,
        );
      }
      return json({
        ok: true,
        validator: probe.validator,
        package: probe.package,
        schema: probe.schema,
        loadedFiles: XSD_SELFTEST_EXPECTED_FILES,
      }, 200, headers);
    } catch {
      return json(
        {
          ok: false,
          error: "XSD_BUNDLE_UNAVAILABLE",
          diagnostic: "XSD_VALIDATOR_MEMORY_OR_WASM_FAILED",
        },
        500,
        headers,
      );
    }
  }

  // ------------------------------------------------------------------
  // download: entrega autenticada dos bytes de um artefato já produzido.
  // Nenhuma URL (assinada/pública) é emitida. Autorização provada antes e
  // revalidada depois da leitura; bytes conferidos com o SHA-256 da execução.
  // ------------------------------------------------------------------
  if (action === "download") {
    const runId = String(body.run_id ?? "");
    const artifact = String(body.artifact ?? "signed");
    if (!UUID_RE.test(runId)) return json({ error: "run_id_invalid" }, 400, headers);
    if (artifact !== "signed" && artifact !== "unsigned") {
      return json({ error: "artifact_invalid" }, 400, headers);
    }
    const noStore = { ...headers, "Cache-Control": "private, no-store" };
    const deny = (status: number, error: string) => json({ error }, status, noStore);
    const MAX_XML_BYTES = 10 * 1024 * 1024; // limite do bucket fiscal-xml
    // Prazo ABSOLUTO de 15 s cercando provas + leitura + hash + prova fresca.
    // Pedido já abortado antes do handler: addEventListener não retroage.
    if (req.signal.aborted) return deny(504, "download_unavailable");
    const deadline = enteredAt + 15_000;
    if (performance.now() >= deadline) return deny(504, "download_unavailable");
    const controller = new AbortController();
    const signal = controller.signal;
    const onAbort = () => controller.abort();
    req.signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), Math.max(0, deadline - performance.now()));
    const ABORTED = Symbol("aborted");
    const abortedP = new Promise<typeof ABORTED>((resolve) => {
      if (signal.aborted) resolve(ABORTED);
      else signal.addEventListener("abort", () => resolve(ABORTED), { once: true });
    });
    // Propaga o sinal quando o SDK suporta (.abortSignal) e corre contra o prazo;
    // sem retry. Uma etapa pendurada nunca prende a resposta além do prazo.
    // deno-lint-ignore no-explicit-any
    const bound = (q: any) => (q && typeof q.abortSignal === "function" ? q.abortSignal(signal) : q);
    const step = async <T,>(p: PromiseLike<T> | T): Promise<T> => {
      if (signal.aborted || performance.now() >= deadline) { controller.abort(); throw ABORTED; }
      const r = await Promise.race([Promise.resolve(p), abortedP]);
      if (r === ABORTED || signal.aborted || performance.now() >= deadline) { controller.abort(); throw ABORTED; }
      return r as T;
    };
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    let actor: string | undefined;
    // Prova completa do ator/recurso; repetida após o I/O (sem snapshot antigo).
    const authorize = async (): Promise<{ path: string; sha: string | null; bytes: number | null } | null> => {
      const operate = await step(bound(authed.rpc("fn_fiscal_can_operate", { _uid: actor })));
      if (operate.error || operate.data !== true) return null;
      const visible = await step(bound(authed.from("fiscal_xml_runs")
        .select("id, unsigned_path, signed_path, storage_bucket, unsigned_sha256, signed_sha256, unsigned_bytes, signed_bytes")
        .eq("id", runId)).maybeSingle());
      if (visible.error || !visible.data) return null;
      const ownership = await step(bound(admin.rpc("h15_service_actor_run_access", { p_actor: actor, p_run: runId })));
      if (ownership.error || ownership.data !== true) return null;
      const row = visible.data as Record<string, unknown>;
      if (row.storage_bucket !== BUCKET) return null;
      const path = (artifact === "signed" ? row.signed_path : row.unsigned_path) as string | null;
      if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("..") || path.includes("://")) return null;
      return {
        path,
        sha: (artifact === "signed" ? row.signed_sha256 : row.unsigned_sha256) as string | null,
        bytes: (artifact === "signed" ? row.signed_bytes : row.unsigned_bytes) as number | null,
      };
    };
    try {
      const claims = await step(authed.auth.getClaims(authHeader.replace("Bearer ", "")));
      actor = claims.data?.claims?.sub as string | undefined;
      if (!actor) return deny(401, "unauthorized");
      const initial = await step(bound(authed.rpc("fn_fiscal_can_operate", { _uid: actor })));
      if (initial.error || initial.data !== true) return deny(403, "permission_denied");
      const first = await authorize();
      if (!first) return deny(403, "permission_denied");
      // The run metadata is checked BEFORE object I/O when present, but is not
      // trusted as a substitute for counting every chunk from the network.
      if (first.bytes !== null && (!Number.isSafeInteger(first.bytes) || first.bytes < 0)) return deny(409, "artifact_integrity_failed");
      if (first.bytes !== null && first.bytes > MAX_XML_BYTES) return deny(413, "artifact_too_large");
      // Bucket privado sem policy de leitura do usuário: a leitura usa o cliente
      // de serviço SOMENTE após a prova acima, para o path registrado na execução.
      // SDK stream mode returns Response.body, NOT a materialized Blob. No extra
      // metadata/HEAD request or retries; Content-Length alone never grants access.
      const pendingDownload = admin.storage.from(BUCKET).download(first.path, {}, { signal, cache: "no-store" }).asStream();
      const dl = await step(Promise.resolve(pendingDownload).then(result => {
        // A transport ignoring AbortSignal may settle after deadline. Discard
        // and cancel its stream without awaiting it, even if step already exited.
        if ((signal.aborted || performance.now() >= deadline) && result.data) {
          void result.data.cancel().catch(() => undefined);
        }
        return result;
      }));
      if (dl.error || !dl.data) return deny(404, "artifact_not_available");
      const bytes = await readBounded(dl.data, MAX_XML_BYTES, signal, deadline);
      const digest = await step(sha256Hex(bytes));
      if (!first.sha || digest !== first.sha ||
          (first.bytes !== null && first.bytes !== bytes.byteLength)) {
        return deny(409, "artifact_integrity_failed");
      }
      const fresh = await authorize();
      if (!fresh || fresh.path !== first.path || fresh.sha !== first.sha || fresh.bytes !== first.bytes) return deny(403, "permission_denied");
      if (signal.aborted || performance.now() >= deadline) return deny(504, "download_unavailable");
      return new Response(bytes, {
        status: 200,
        headers: {
          ...noStore,
          "Content-Type": "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": `attachment; filename="nfe-${artifact}.xml"`,
        },
      });
    } catch (error) {
      if (error instanceof ReadLimitError) { controller.abort(); return deny(413, "artifact_too_large"); }
      return deny(signal.aborted || error instanceof ReadDeadlineError ? 504 : 500, "download_unavailable");
    } finally {
      clearTimeout(timer);
      req.signal.removeEventListener("abort", onAbort);
    }
  }

  // Cliente do usuário: toda autorização de negócio ocorre nas RPCs
  // SECURITY DEFINER, que validam o perfil fiscal (fail-closed).
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const claims = await authed.auth.getClaims(authHeader.replace("Bearer ", ""));
  const actor = claims.data?.claims?.sub as string | undefined;
  if (!actor) return json({ error: "unauthorized" }, 401, headers);

  // Defesa em profundidade: o perfil fiscal interno é exigido já no edge, além
  // da validação fail-closed das RPCs SECURITY DEFINER chamadas adiante.
  const canOperate = await authed.rpc("fn_fiscal_can_operate", { _uid: actor });
  if (canOperate.error || canOperate.data !== true) {
    return json({ error: "permission_denied" }, 403, headers);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });


  if (action !== "generate") return json({ error: "action_invalid" }, 400, headers);

  const invoiceId = String(body.invoice_id ?? "");
  const idempotencyKey = String(body.idempotency_key ?? "").trim();
  if (!UUID_RE.test(invoiceId)) return json({ error: "invoice_id_invalid" }, 400, headers);
  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY) {
    return json({ error: "idempotency_key_invalid" }, 400, headers);
  }
  const invoiceAllowed = await admin.rpc("h15_service_actor_invoice_access", {
    p_actor: actor,
    p_invoice: invoiceId,
  });
  if (invoiceAllowed.error || invoiceAllowed.data !== true) {
    return json({ error: "permission_denied" }, 403, headers);
  }

  // 1. Preparo: congela o payload e cria/recupera a execução.
  const prepared = await authed.rpc("rpc_fiscal_xml_prepare_v1", {
    p_invoice_id: invoiceId,
    p_idempotency_key: idempotencyKey,
  });
  if (prepared.error) {
    const msg = prepared.error.message ?? "";
    const code = msg.split(":")[0]?.trim() || "FISCAL_XML_PREPARE_FAILED";
    return json({ error: "prepare_failed", code }, 400, headers);
  }
  const run = prepared.data as {
    runId: string; state: string; runVersion: number;
    schemaVersion: string; accessKey: string; payloadSha256: string;
    payload: NfePayload; idempotentReplay: boolean;
  };

  if (run.state === "SIGNED" || run.state === "FAILED") {
    return json({
      runId: run.runId, state: run.state, runVersion: run.runVersion,
      idempotentReplay: true,
    }, 200, headers);
  }

  const fail = async (code: string, detail: string, status: number) => {
    await admin.rpc("rpc_fiscal_xml_record_v1", {
      p_run_id: run.runId, p_state: "FAILED",
      p_patch: { errorCode: code, errorDetail: detail.slice(0, 500) },
    });
    return json({ runId: run.runId, state: "FAILED", code }, status, headers);
  };

  // 2. Construção determinística do XML.
  let built: { xml: string; infNFeId: string; accessKey: string };
  try {
    built = buildNfeXml(run.payload);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return await fail(e.code ?? "NFE_BUILD_FAILED", e.message ?? "falha ao montar o XML", 422);
  }
  if (built.accessKey !== run.accessKey) {
    return await fail("NFE_ACCESS_KEY_MISMATCH", "chave do XML difere da reserva", 409);
  }

  const encoder = new TextEncoder();
  const unsignedBytes = encoder.encode(built.xml);
  const unsignedSha = await sha256Hex(unsignedBytes);
  const basePath = `${invoiceId}/${run.runVersion}`;
  const unsignedPath = `${basePath}/nfe-${built.accessKey}-unsigned.xml`;

  // Reentrada: em retomada de GENERATED/XSD_VALIDATED o objeto já existe.
  // Só é aceito quando byte-idêntico ao conteúdo determinístico esperado.
  const unsignedStore = await ensureStoredArtifact(admin, unsignedPath, unsignedBytes, unsignedSha);
  if (unsignedStore === "XML_STORAGE_CONFLICT") {
    return await fail("XML_STORAGE_CONFLICT", "artefato não assinado divergente no mesmo caminho", 409);
  }
  if (unsignedStore === "XML_STORAGE_VERIFY_FAILED") {
    return await fail("XML_STORAGE_VERIFY_FAILED", "não foi possível verificar o artefato existente", 500);
  }
  if (unsignedStore) {
    return await fail("XML_STORAGE_FAILED", "falha ao armazenar o XML não assinado", 500);
  }

  const recGenerated = await admin.rpc("rpc_fiscal_xml_record_v1", {
    p_run_id: run.runId, p_state: "GENERATED",
    p_patch: {
      unsignedSha256: unsignedSha,
      unsignedBytes: String(unsignedBytes.byteLength),
      unsignedPath,
    },
  });
  if (recGenerated.error) {
    return await fail("XML_RECORD_FAILED", "falha ao registrar geração", 500);
  }

  // 3. Precheck de gramática (NÃO autoriza XSD_VALIDATED).
  //    A validação normativa é feita pelo XSD 1.0 oficial, no documento
  //    ASSINADO (o schema exige `Signature` em `NFe`), na etapa 5.
  const report = validateNfeXml(built.xml, run.schemaVersion);
  if (!report.valid) {
    await admin.rpc("rpc_fiscal_xml_record_v1", {
      p_run_id: run.runId, p_state: "FAILED",
      p_patch: {
        errorCode: "NFE_PRECHECK_FAILED",
        errorDetail: `${report.issues.length} inconsistência(s) no precheck`,
        validation: { precheck: { ...report, issues: report.issues.slice(0, 50) } },
      },
    });
    return json({
      runId: run.runId, state: "FAILED", code: "NFE_PRECHECK_FAILED",
      issues: report.issues.slice(0, 50),
    }, 422, headers);
  }

  // 4. Assinatura com o certificado A1 do EMITENTE da invoice.
  //    Autoridade canônica: rpc_fiscal_certificate_for_invoice_v1 (fail-closed
  //    para zero/múltiplos certificados). Nenhum fallback "mais recente".
  const certResolved = await admin.rpc("rpc_fiscal_certificate_for_invoice_v1", {
    _invoice_id: invoiceId,
  });
  const certPayload = (Array.isArray(certResolved.data) ? certResolved.data[0] : certResolved.data) as
    | Record<string, unknown>
    | null;
  const certificateId = (certPayload?.certificateId ?? certPayload?.certificate_id) as string | undefined;
  if (certResolved.error || !certificateId) {
    return json({ runId: run.runId, state: "GENERATED", code: "CERTIFICATE_REQUIRED",
      detail: "certificado A1 do emitente indisponível ou ambíguo" }, 412, headers);
  }
  // Compatibilidade de UI: apenas o certificado devolvido pela RPC é consultado.
  const certRow = await admin
    .from("v_fiscal_certificate_readiness")
    .select("certificate_id, display_name, status, environment")
    .eq("certificate_id", certificateId).maybeSingle();
  if (
    certRow.error || !certRow.data ||
    certRow.data.status !== "AVAILABLE" || certRow.data.environment !== "HOMOLOGATION"
  ) {
    return json({ runId: run.runId, state: "GENERATED", code: "CERTIFICATE_REQUIRED",
      detail: "certificado do emitente não está disponível em homologação" }, 412, headers);
  }

  const masterKey = await decodeMasterKey();
  if (!masterKey) {
    // Recuperável: o XML gerado permanece íntegro em GENERATED.
    return json({ runId: run.runId, state: "GENERATED", code: "CERTIFICATE_REQUIRED",
      detail: "cofre de certificados indisponível" }, 412, headers);
  }

  const material = await admin
    .from("fiscal_certificate_material")
    .select("object_path, material_iv, key_version, material_format")
    .eq("certificate_id", certificateId).maybeSingle();
  if (material.error || !material.data) {
    return json({ runId: run.runId, state: "GENERATED", code: "CERTIFICATE_REQUIRED",
      detail: "material do certificado indisponível" }, 412, headers);
  }
  // H7d — fail-closed: só o bundle de assinatura versionado é assinável.
  if (!isSupportedVaultFormat(material.data.material_format as string | null)) {
    return json({ runId: run.runId, state: "GENERATED", code: "CERTIFICATE_REQUIRED",
      detail: "formato do cofre incompatível: reimporte o certificado A1" }, 412, headers);
  }

  // H7d — a senha original do PFX NÃO participa daqui: o cofre guarda apenas o
  // bundle (cert + cadeia + chave PKCS#8) cifrado pela chave mestra.
  let signingMaterial: { certPem: string; keyPem: string };
  try {
    const dl = await admin.storage.from("fiscal-certificates").download(material.data.object_path as string);
    if (dl.error || !dl.data) throw new Error("download");
    const cipher = new Uint8Array(await dl.data.arrayBuffer());
    const plain = await aesGcmDecrypt(
      masterKey,
      fromBinaryColumn(material.data.material_iv as string),
      cipher,
    );
    const bundle = parseSigningBundle(new TextDecoder().decode(plain));
    plain.fill(0);
    signingMaterial = { certPem: bundle.certPem, keyPem: bundle.keyPem };
  } catch {
    return await fail("CERTIFICATE_DECRYPT_FAILED", "não foi possível abrir o certificado", 500);
  }

  let signedXml: string;
  let signatureMetadata: Record<string, unknown>;
  try {
    const result = signNfeXml({
      xml: built.xml,
      infNFeId: built.infNFeId,
      namespace: NFE_NAMESPACE,
      material: signingMaterial,
    });
    signedXml = result.signedXml;
    signatureMetadata = result.metadata as unknown as Record<string, unknown>;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return await fail(e.code ?? "NFE_SIGN_FAILED", e.message ?? "falha ao assinar", 422);
  } finally {
    signingMaterial = { certPem: "", keyPem: "" };
  }


  // 5. Validação XSD 1.0 REAL (bundle oficial) sobre o documento assinado.
  const xsd = await validateAgainstOfficialXsd(signedXml);
  if (!xsd.valid) {
    await admin.rpc("rpc_fiscal_xml_record_v1", {
      p_run_id: run.runId, p_state: "FAILED",
      p_patch: {
        errorCode: "XSD_VALIDATION_FAILED",
        errorDetail: `${xsd.issues.length} inconsistência(s) XSD`,
        validation: { xsd: { ...xsd, issues: xsd.issues.slice(0, 50) } },
      },
    });
    return json({
      runId: run.runId, state: "FAILED", code: "XSD_VALIDATION_FAILED",
      issues: xsd.issues.slice(0, 50),
    }, 422, headers);
  }

  // 6. Verificação independente da assinatura (digest + RSA sobre SignedInfo).
  const verified = verifyNfeSignature(signedXml, NFE_NAMESPACE);
  if (!verified.valid) {
    return await fail(verified.code ?? "SIGNATURE_VERIFICATION_FAILED",
      "assinatura não verificou contra o documento", 422);
  }

  const recValidated = await admin.rpc("rpc_fiscal_xml_record_v1", {
    p_run_id: run.runId, p_state: "XSD_VALIDATED",
    p_patch: {
      validation: {
        valid: true,
        validator: XSD_VALIDATOR,
        xsdPackage: XSD_PACKAGE,
        schema: xsd.schema,
        target: "SIGNED_DOCUMENT",
        precheckElementCount: report.elementCount,
        issues: [],
      },
    },
  });
  if (recValidated.error) {
    return await fail("XML_RECORD_FAILED", "falha ao registrar validação", 500);
  }

  const signedBytes = encoder.encode(signedXml);
  const signedSha = await sha256Hex(signedBytes);
  const signedPath = `${basePath}/nfe-${built.accessKey}-signed.xml`;
  const signedStore = await ensureStoredArtifact(admin, signedPath, signedBytes, signedSha);
  if (signedStore === "XML_STORAGE_CONFLICT") {
    return await fail("XML_STORAGE_CONFLICT", "artefato assinado divergente no mesmo caminho", 409);
  }
  if (signedStore === "XML_STORAGE_VERIFY_FAILED") {
    return await fail("XML_STORAGE_VERIFY_FAILED", "não foi possível verificar o artefato assinado existente", 500);
  }
  if (signedStore) {
    return await fail("XML_STORAGE_FAILED", "falha ao armazenar o XML assinado", 500);
  }

  const recSigned = await admin.rpc("rpc_fiscal_xml_record_v1", {
    p_run_id: run.runId, p_state: "SIGNED",
    p_patch: {
      signedSha256: signedSha,
      signedBytes: String(signedBytes.byteLength),
      signedPath,
      certificateId,
      signature: signatureMetadata,
    },
  });
  if (recSigned.error) {
    return await fail("XML_RECORD_FAILED", "falha ao registrar assinatura", 500);
  }

  return json({
    runId: run.runId,
    state: "SIGNED",
    ceiling: "SIGNED",
    runVersion: run.runVersion,
    accessKey: built.accessKey,
    schemaVersion: run.schemaVersion,
    payloadSha256: run.payloadSha256,
    unsignedSha256: unsignedSha,
    signedSha256: signedSha,
    validation: { valid: true, validator: XSD_VALIDATOR, xsdPackage: XSD_PACKAGE, target: "SIGNED_DOCUMENT" },
    signatureVerified: true,
    transmitted: false,
  }, 200, headers);
});
