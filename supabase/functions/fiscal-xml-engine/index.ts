/**
 * Fase F4 — Edge Function `fiscal-xml-engine`.
 *
 * Ações (POST, admin/perfil fiscal interno):
 *   1. `generate`  — prepara (RPC), constrói XML, valida contra a gramática
 *                    XSD 4.00, armazena o não assinado, assina com o A1 e
 *                    armazena o assinado. Teto: SIGNED.
 *   2. `download`  — devolve URL assinada de curta duração de um artefato.
 *
 * Invariantes:
 *   - Só homologação (tpAmb=2). Nenhuma transmissão à SEFAZ.
 *   - Progressão de estado exclusivamente por `rpc_fiscal_xml_record_v1`
 *     (service_role). A função nunca faz UPDATE direto na tabela.
 *   - Falha em qualquer etapa registra FAILED com código sanitizado.
 *   - Nunca loga nem retorna: senha do PFX, material do certificado, chave
 *     privada, JWT, service_role ou o próprio XML por canal não autenticado.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildNfeXml, NFE_NAMESPACE, type NfePayload } from "../_shared/fiscal/nfe/buildNfeXml.ts";
import { validateNfeXml } from "../_shared/fiscal/nfe/validateNfeXml.ts";
import { signNfeXml, verifyNfeSignature } from "../_shared/fiscal/nfe/signNfeXml.ts";
import { validateAgainstOfficialXsd, XSD_PACKAGE, XSD_VALIDATOR } from "./xsdValidate.ts";

const BUCKET = "fiscal-xml";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDEMPOTENCY = 200;

function corsHeaders(origin: string | null): { headers: Record<string, string>; allowed: boolean } {
  const allow = (Deno.env.get("FISCAL_CORS_ALLOWLIST") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = !!origin && allow.includes(origin);
  return {
    allowed,
    headers: {
      "Access-Control-Allow-Origin": allowed ? origin! : "null",
      "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeMasterKey(): Uint8Array | null {
  const raw = Deno.env.get("FISCAL_CERTIFICATE_MASTER_KEY");
  if (!raw) return null;
  try {
    const bin = atob(raw);
    if (bin.length !== 32) return null;
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function fromB64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, cipher: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, cipher);
  return new Uint8Array(plain);
}

Deno.serve(async (req) => {
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

  // Cliente do usuário: toda autorização de negócio ocorre nas RPCs
  // SECURITY DEFINER, que validam o perfil fiscal (fail-closed).
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const claims = await authed.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (!claims.data?.claims?.sub) return json({ error: "unauthorized" }, 401, headers);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400, headers);
  }

  const action = String(body.action ?? "generate");

  // ------------------------------------------------------------------
  // download: URL assinada curta para um artefato já produzido
  // ------------------------------------------------------------------
  if (action === "download") {
    const runId = String(body.run_id ?? "");
    const artifact = String(body.artifact ?? "signed");
    if (!UUID_RE.test(runId)) return json({ error: "run_id_invalid" }, 400, headers);
    if (artifact !== "signed" && artifact !== "unsigned") {
      return json({ error: "artifact_invalid" }, 400, headers);
    }
    // Autorização: a leitura passa pela RLS do usuário (perfil interno).
    const { data: allowed, error: readErr } = await authed
      .from("fiscal_xml_runs").select("id").eq("id", runId).maybeSingle();
    if (readErr || !allowed) return json({ error: "permission_denied" }, 403, headers);

    const { data: run } = await admin
      .from("fiscal_xml_runs")
      .select("unsigned_path, signed_path, storage_bucket")
      .eq("id", runId).maybeSingle();
    const path = artifact === "signed" ? run?.signed_path : run?.unsigned_path;
    if (!path) return json({ error: "artifact_not_available" }, 404, headers);

    const signed = await admin.storage.from(run?.storage_bucket ?? BUCKET).createSignedUrl(path, 120);
    if (signed.error || !signed.data) return json({ error: "signed_url_failed" }, 500, headers);
    return json({ url: signed.data.signedUrl, expiresIn: 120, artifact }, 200, headers);
  }

  if (action !== "generate") return json({ error: "action_invalid" }, 400, headers);

  const invoiceId = String(body.invoice_id ?? "");
  const idempotencyKey = String(body.idempotency_key ?? "").trim();
  if (!UUID_RE.test(invoiceId)) return json({ error: "invoice_id_invalid" }, 400, headers);
  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY) {
    return json({ error: "idempotency_key_invalid" }, 400, headers);
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

  const upUnsigned = await admin.storage.from(BUCKET).upload(unsignedPath, unsignedBytes, {
    contentType: "application/xml", upsert: false,
  });
  if (upUnsigned.error) {
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

  // 4. Assinatura com o certificado A1 ativo (material cifrado no cofre).
  const masterKey = decodeMasterKey();
  if (!masterKey) {
    // Recuperável: o XML gerado permanece íntegro em GENERATED.
    return json({ runId: run.runId, state: "GENERATED", code: "CERTIFICATE_REQUIRED",
      detail: "cofre de certificados indisponível" }, 412, headers);
  }

  const certRow = await admin
    .from("v_fiscal_certificate_readiness")
    .select("certificate_id, status, environment")
    .eq("status", "AVAILABLE").eq("environment", "HOMOLOGATION")
    .order("valid_until", { ascending: false }).limit(1).maybeSingle();
  const certificateId = certRow.data?.certificate_id as string | undefined;
  if (!certificateId) {
    return json({ runId: run.runId, state: "GENERATED", code: "CERTIFICATE_REQUIRED",
      detail: "nenhum certificado A1 de homologação disponível" }, 412, headers);
  }

  const material = await admin
    .from("fiscal_certificate_material")
    .select("object_path, encrypted_password, password_iv, material_iv")
    .eq("certificate_id", certificateId).maybeSingle();
  if (material.error || !material.data) {
    return json({ runId: run.runId, state: "GENERATED", code: "CERTIFICATE_REQUIRED",
      detail: "material do certificado indisponível" }, 412, headers);
  }

  let pfx: Uint8Array;
  let password: string;
  try {
    const dl = await admin.storage.from("fiscal-certificates").download(material.data.object_path as string);
    if (dl.error || !dl.data) throw new Error("download");
    const cipher = new Uint8Array(await dl.data.arrayBuffer());
    pfx = await aesGcmDecrypt(masterKey, fromB64(material.data.material_iv as string), cipher);
    const pwdPlain = await aesGcmDecrypt(
      masterKey,
      fromB64(material.data.password_iv as string),
      fromB64(material.data.encrypted_password as string),
    );
    password = new TextDecoder().decode(pwdPlain);
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
      pfx,
      password,
    });
    signedXml = result.signedXml;
    signatureMetadata = result.metadata as unknown as Record<string, unknown>;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return await fail(e.code ?? "NFE_SIGN_FAILED", e.message ?? "falha ao assinar", 422);
  } finally {
    pfx.fill(0);
    password = "";
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
  const upSigned = await admin.storage.from(BUCKET).upload(signedPath, signedBytes, {
    contentType: "application/xml", upsert: false,
  });
  if (upSigned.error) {
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
