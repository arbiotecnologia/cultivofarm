/**
 * FASE H7g — Edge Function `fiscal-event-sign`.
 *
 * H7G-002: prepara e assina, **exclusivamente server-side**, os eventos SEFAZ
 * suportados (cancelamento 110111 e CC-e 110110) de uma NF-e autorizada em
 * HOMOLOGAÇÃO. O cliente informa apenas invoice, tipo, motivo e idempotência —
 * nunca XML. O documento assinado é gravado no bucket privado `fiscal-xml` e
 * referenciado no próprio `fiscal_events` (append-only).
 *
 * Invariantes: tpAmb=2; perfil fiscal interno; cofre A1 apenas em memória;
 * nenhuma resposta expõe XML, chave privada ou material do certificado.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { fiscalCorsHeaders } from "../_shared/fiscal/corsAllowlist.ts";
import { isSupportedVaultFormat, parseSigningBundle } from "../_shared/fiscal/certificateVault.ts";
import { buildEventoXml, FiscalEventXmlError } from "../_shared/fiscal/nfe/buildEventoXml.ts";
import { signEventoXml } from "../_shared/fiscal/nfe/signEventoXml.ts";
import { runSigningSelfTest } from "../_shared/fiscal/nfe/signSelfTest.ts";


const TPAMB = "2";
const C_ORGAO = "31"; // MG
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

// deno-lint-ignore no-explicit-any
async function loadSigningMaterial(admin: any, certificateId: string): Promise<{ certPem: string; keyPem: string }> {
  if (!certificateId) throw new FiscalEventXmlError("CERTIFICATE_REQUIRED");

  const masterKey = decodeMasterKey();
  if (!masterKey) throw new FiscalEventXmlError("CERTIFICATE_REQUIRED");

  const material = await admin
    .from("fiscal_certificate_material")
    .select("object_path, material_iv, material_format")
    .eq("certificate_id", certificateId).maybeSingle();
  if (material.error || !material.data) throw new FiscalEventXmlError("CERTIFICATE_REQUIRED");
  if (!isSupportedVaultFormat(material.data.material_format as string | null)) {
    throw new FiscalEventXmlError("CERTIFICATE_REQUIRED");
  }

  let plain: Uint8Array | null = null;
  try {
    const dl = await admin.storage.from("fiscal-certificates").download(material.data.object_path);
    if (dl.error || !dl.data) throw new Error("download");
    const cryptoKey = await crypto.subtle.importKey("raw", masterKey, "AES-GCM", false, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBinaryColumn(material.data.material_iv as string) },
      cryptoKey,
      new Uint8Array(await dl.data.arrayBuffer()),
    );
    plain = new Uint8Array(decrypted);
    const bundle = parseSigningBundle(new TextDecoder().decode(plain));
    return { certPem: bundle.certPem, keyPem: bundle.keyPem };
  } catch (err) {
    if (err instanceof FiscalEventXmlError) throw err;
    throw new FiscalEventXmlError("CERTIFICATE_DECRYPT_FAILED");
  } finally {
    plain?.fill(0);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const { headers, allowed } = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (!allowed) return json({ error: "origin_not_allowed" }, 403, headers);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, headers);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "server_misconfigured" }, 500, headers);

  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const claims = await authed.auth.getClaims(authHeader.replace("Bearer ", ""));
  const actor = claims.data?.claims?.sub as string | undefined;
  if (!actor) return json({ error: "unauthorized" }, 401, headers);

  const canOperate = await authed.rpc("fn_fiscal_can_operate", { _uid: actor });
  if (canOperate.error || canOperate.data !== true) {
    return json({ error: "permission_denied" }, 403, headers);
  }
  const actorOrganization = await authed.rpc("h15_actor_organization");
  const organizationId = String(actorOrganization.data ?? "");
  if (actorOrganization.error || !UUID_RE.test(organizationId)) {
    return json({ error: "tenant_context_required" }, 403, headers);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400, headers);
  }

  // H7G-002: XML de evento fornecido pelo cliente é recusado explicitamente.
  if (body.event_xml !== undefined || body.signed_event_xml !== undefined) {
    return json({ error: "event_xml_not_accepted", code: "SEFAZ_EVENT_XML_NOT_ACCEPTED" }, 400, headers);
  }


  // H7 (continuação): autoteste criptográfico INERTE do cofre A1.
  // Não gera XML fiscal, não reserva numeração, não persiste e não transmite.
  if (String(body.action ?? "") === "self_test") {
    const adminSelfTest = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    let selfTestMaterial: { certPem: string; keyPem: string } | null = null;
    try {
      const company = await authed.from("company_fiscal_settings")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .maybeSingle();
      if (company.error || !company.data?.id) throw new FiscalEventXmlError("CERTIFICATE_REQUIRED");
      const certificates = await adminSelfTest.from("fiscal_certificates")
        .select("id")
        .eq("company_settings_id", company.data.id)
        .eq("environment", "HOMOLOGATION")
        .eq("status", "AVAILABLE")
        .eq("is_active", true)
        .is("revoked_at", null)
        .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
        .limit(2);
      if (certificates.error || certificates.data?.length !== 1) {
        throw new FiscalEventXmlError(certificates.data?.length ? "FISCAL_CERTIFICATE_AMBIGUOUS" : "CERTIFICATE_REQUIRED");
      }
      selfTestMaterial = await loadSigningMaterial(adminSelfTest, certificates.data[0].id);
      const report = runSigningSelfTest(selfTestMaterial);
      return json({
        action: "self_test",
        environmentCode: TPAMB,
        persisted: false,
        transmitted: false,
        ...report,
      }, 200, headers);
    } catch (err) {
      const code = err instanceof FiscalEventXmlError ? err.code : "FISCAL_SELF_TEST_FAILED";
      return json({ action: "self_test", error: "self_test_failed", code }, 412, headers);
    } finally {
      if (selfTestMaterial) {
        selfTestMaterial.certPem = "";
        selfTestMaterial.keyPem = "";
      }
    }
  }

  const invoiceId = String(body.invoice_id ?? "");

  const eventKind = String(body.event_kind ?? "");
  const reason = String(body.reason ?? "");
  const idempotencyKey = String(body.idempotency_key ?? "").trim();
  if (!UUID_RE.test(invoiceId)) return json({ error: "invoice_id_invalid" }, 400, headers);
  if (!["CANCELLATION", "CORRECTION"].includes(eventKind)) {
    return json({ error: "event_kind_invalid", code: "FISCAL_EVENT_TYPE_UNSUPPORTED" }, 400, headers);
  }
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return json({ error: "idempotency_key_invalid" }, 400, headers);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1. Preparo canônico server-side (autorização, motivo, sequência, replay).
  const prepared = await admin.rpc("rpc_fiscal_event_sefaz_prepare_v1", {
    _invoice_id: invoiceId,
    _event_kind: eventKind,
    _reason: reason,
    _idempotency_key: idempotencyKey,
    _actor: actor,
  });
  if (prepared.error) {
    const code = String(prepared.error.message ?? "").split(":")[0].trim() ||
      "FISCAL_EVENT_PREPARE_FAILED";
    return json({ error: "event_prepare_blocked", code },
      code.includes("PRODUCTION") || code === "FISCAL_FORBIDDEN" ? 403 : 409, headers);
  }
  const ev = prepared.data as Record<string, unknown>;
  const eventId = String(ev.eventId);
  const companySettingsId = String(ev.companySettingsId ?? "");
  if (!UUID_RE.test(companySettingsId)) {
    return json({ error: "event_prepare_blocked", code: "FISCAL_COMPANY_BINDING_REQUIRED" }, 409, headers);
  }

  // Já assinado? Não reassina (idempotência estável).
  const current = await admin
    .from("v_fiscal_sefaz_event_state")
    .select("state, signed_xml_path, signed_xml_sha256")
    .eq("event_id", eventId).maybeSingle();
  if (current.data?.state && current.data.state !== "PREPARED") {
    return json({
      eventId, state: current.data.state, environmentCode: TPAMB,
      eventCode: ev.eventCode, seqEvento: ev.seqEvento, replayed: true,
    }, 200, headers);
  }

  // 2. Dados do emitente (CNPJ) — homologação obrigatória.
  const settings = await admin
    .from("company_fiscal_settings")
    .select("cnpj, nfe_environment_code")
    .eq("id", companySettingsId)
    .eq("organization_id", organizationId)
    .eq("is_active", true).maybeSingle();
  if (settings.error || !settings.data) {
    return json({ error: "company_settings_not_found" }, 404, headers);
  }
  const cnpj = String(settings.data?.cnpj ?? "").replace(/\D/g, "");
  if (String(settings.data?.nfe_environment_code ?? "") !== TPAMB) {
    return json({ error: "environment_blocked", code: "FISCAL_PRODUCTION_ENDPOINT_BLOCKED" }, 403, headers);
  }

  let material: { certPem: string; keyPem: string } | null = null;
  try {
    const built = buildEventoXml({
      tpAmb: TPAMB,
      cOrgao: C_ORGAO,
      cnpj,
      accessKey: String(ev.accessKey ?? ""),
      eventCode: String(ev.eventCode ?? ""),
      seqEvento: Number(ev.seqEvento ?? 0),
      reason: String(ev.reason ?? ""),
      protocol: ev.protocol ? String(ev.protocol) : null,
      dhEvento: new Date().toISOString().replace(/\.\d{3}Z$/, "-03:00"),
    });

    const certificates = await admin.from("fiscal_certificates")
      .select("id")
      .eq("company_settings_id", companySettingsId)
      .eq("environment", "HOMOLOGATION")
      .eq("status", "AVAILABLE")
      .eq("is_active", true)
      .is("revoked_at", null)
      .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
      .limit(2);
    if (certificates.error || certificates.data?.length !== 1) {
      throw new FiscalEventXmlError(certificates.data?.length ? "FISCAL_CERTIFICATE_AMBIGUOUS" : "CERTIFICATE_REQUIRED");
    }
    material = await loadSigningMaterial(admin, certificates.data[0].id);
    const signedXml = signEventoXml({
      xml: built.xml, infEventoId: built.infEventoId, material,
    });
    const digest = await sha256Hex(signedXml);
    const path = `eventos/${invoiceId}/${eventId}.xml`;

    const up = await admin.storage.from("fiscal-xml").upload(path, new Blob([signedXml], {
      type: "application/xml",
    }), { upsert: true, contentType: "application/xml" });
    if (up.error) return json({ error: "signed_event_upload_failed" }, 500, headers);

    const marked = await admin.rpc("rpc_fiscal_event_sefaz_mark_signed_v1", {
      _event_id: eventId, _signed_path: path, _signed_sha256: digest, _actor: actor,
    });
    if (marked.error) {
      const code = String(marked.error.message ?? "").split(":")[0].trim() ||
        "FISCAL_EVENT_SIGN_RECORD_FAILED";
      return json({ error: "event_sign_blocked", code }, 409, headers);
    }

    return json({
      eventId,
      state: "SIGNED",
      eventCode: ev.eventCode,
      seqEvento: ev.seqEvento,
      accessKey: ev.accessKey,
      signedSha256: digest,
      environmentCode: TPAMB,
    }, 200, headers);
  } catch (err) {
    const code = err instanceof FiscalEventXmlError ? err.code : "FISCAL_EVENT_SIGN_FAILED";
    return json({ eventId, error: "event_sign_failed", code },
      code === "CERTIFICATE_REQUIRED" ? 412 : 422, headers);
  } finally {
    if (material) {
      material.certPem = "";
      material.keyPem = "";
    }
  }
});
