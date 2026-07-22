/**
 * Fase Fiscal 3.16 — Edge Function `fiscal-certificate-upload`.
 *
 * Admin-only. Valida PKCS#12, criptografa com AES-256-GCM e grava
 * ciphertext em bucket privado + metadados em `fiscal_certificate_material`.
 * Nunca loga senha/PFX/JWT/chave/service_role.
 *
 * NÃO IMPLANTAR nesta execução. Requer:
 *   - Bucket privado `fiscal-certificates`
 *   - Secret FISCAL_CERTIFICATE_MASTER_KEY (base64 de 32 bytes)
 *   - Secret FISCAL_CORS_ALLOWLIST (lista separada por vírgula)
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import forge from "npm:node-forge@1";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = [".pfx", ".p12"];
const PKCS12_MAGIC = new Uint8Array([0x30, 0x82]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = (Deno.env.get("FISCAL_CORS_ALLOWLIST") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const ok = origin && allow.includes(origin) ? origin : allow[0] ?? "";
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
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

async function aesGcmEncrypt(key: Uint8Array, data: Uint8Array): Promise<{ iv: Uint8Array; cipher: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, data);
  return { iv, cipher: new Uint8Array(cipherBuf) };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401, headers);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "server_misconfigured" }, 500, headers);
  }
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const claims = await authed.auth.getClaims(token);
  const userId = claims.data?.claims?.sub;
  if (!userId) return json({ error: "unauthorized" }, 401, headers);

  // Admin check via has_role
  const { data: isAdmin, error: roleErr } = await authed.rpc("has_role", {
    _user_id: userId,
    _role: "administrador",
  });
  if (roleErr || !isAdmin) return json({ error: "permission_denied" }, 403, headers);

  const masterKey = decodeMasterKey();
  if (!masterKey) {
    return json({ error: "Cofre não configurado", code: "CERTIFICATE_VAULT_NOT_CONFIGURED" }, 503, headers);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "invalid_body" }, 400, headers);
  }

  const file = form.get("file");
  const password = String(form.get("password") ?? "");
  const companySettingsId = String(form.get("company_settings_id") ?? "");
  const displayName = String(form.get("display_name") ?? "Certificado A1");

  if (!(file instanceof File)) return json({ error: "file_required" }, 400, headers);
  if (!companySettingsId) return json({ error: "company_settings_id_required" }, 400, headers);
  if (!password) return json({ error: "password_required" }, 400, headers);

  const lower = file.name.toLowerCase();
  if (!ALLOWED_EXT.some((e) => lower.endsWith(e))) {
    return json({ error: "invalid_extension" }, 400, headers);
  }
  if (file.size > MAX_BYTES) return json({ error: "file_too_large" }, 413, headers);

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Magic bytes: PKCS#12 é DER começando com 0x30 0x82.
  if (bytes.length < 2 || bytes[0] !== PKCS12_MAGIC[0] || bytes[1] !== PKCS12_MAGIC[1]) {
    return json({ error: "not_pkcs12" }, 400, headers);
  }

  // Valida PKCS#12 + extrai X.509
  let subject = "";
  let issuer = "";
  let serial = "";
  let validFrom = "";
  let validUntil = "";
  let fingerprintHex = "";
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(bytes));
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
    const bagType = forge.pki.oids.certBag;
    const bags = p12.getBags({ bagType });
    const certBag = bags[bagType]?.[0];
    if (!certBag?.cert) throw new Error("no_certificate_in_pkcs12");
    const cert = certBag.cert;
    subject = cert.subject.attributes.map((a) => `${a.shortName ?? a.name}=${a.value}`).join(", ");
    issuer = cert.issuer.attributes.map((a) => `${a.shortName ?? a.name}=${a.value}`).join(", ");
    serial = cert.serialNumber.toLowerCase();
    validFrom = new Date(cert.validity.notBefore).toISOString();
    validUntil = new Date(cert.validity.notAfter).toISOString();
    if (new Date(cert.validity.notAfter).getTime() < Date.now()) {
      return json({ error: "certificate_expired" }, 400, headers);
    }
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const md = forge.md.sha256.create();
    md.update(der);
    fingerprintHex = md.digest().toHex();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "pkcs12_error";
    if (/mac/i.test(msg) || /password/i.test(msg)) {
      return json({ error: "invalid_password" }, 400, headers);
    }
    return json({ error: "pkcs12_invalid" }, 400, headers);
  }

  // Criptografa material + senha
  const encMaterial = await aesGcmEncrypt(masterKey, bytes);
  const encPassword = await aesGcmEncrypt(masterKey, new TextEncoder().encode(password));
  // Combinar cipher + tag: crypto.subtle já retorna cipher||tag; salvamos como está.

  const objectPath = `${companySettingsId}/${crypto.randomUUID()}.enc`;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Upload ciphertext
  const upload = await admin.storage.from("fiscal-certificates")
    .upload(objectPath, encMaterial.cipher, { contentType: "application/octet-stream", upsert: false });
  if (upload.error) {
    return json({ error: "storage_upload_failed" }, 500, headers);
  }

  // Registra metadados via RPC (admin already verified above)
  const { data: certId, error: metaErr } = await admin.from("fiscal_certificates").insert({
    company_settings_id: companySettingsId,
    source_type: "A1_UPLOAD",
    environment: "HOMOLOGATION",
    status: "AVAILABLE",
    display_name: displayName,
    subject_name: subject,
    issuer_name: issuer,
    serial_number: serial,
    valid_from: validFrom,
    valid_until: validUntil,
    fingerprint_sha256: fingerprintHex,
    created_by: userId,
  }).select("id").single();

  if (metaErr || !certId) {
    // Rollback do objeto
    await admin.storage.from("fiscal-certificates").remove([objectPath]);
    return json({ error: "metadata_insert_failed" }, 500, headers);
  }

  const { error: matErr } = await admin.from("fiscal_certificate_material").insert({
    certificate_id: certId.id,
    object_path: objectPath,
    encrypted_password: encPassword.cipher,
    password_iv: encPassword.iv,
    material_iv: encMaterial.iv,
    key_version: 1,
  });
  if (matErr) {
    await admin.storage.from("fiscal-certificates").remove([objectPath]);
    await admin.from("fiscal_certificates").delete().eq("id", certId.id);
    return json({ error: "material_insert_failed" }, 500, headers);
  }

  return json({ certificate_id: certId.id, fingerprint_sha256: fingerprintHex }, 200, headers);
});
