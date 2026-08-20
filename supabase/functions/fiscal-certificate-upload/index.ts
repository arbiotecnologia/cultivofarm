/**
 * Fase Fiscal 3.16.2-A — Edge Function `fiscal-certificate-upload`.
 *
 * Admin-only. Fluxo:
 *   1. CORS fail-closed (origem ausente/desconhecida => 403).
 *   2. JWT + verificação has_role(administrador) via cliente authed.
 *   3. Parsing FormData com limites explícitos de tamanho/nome/senha.
 *   4. Verificação de UUID e existência de company_settings.
 *   5. Extração PKCS#12 (node-forge): exige cert X.509 + private key +
 *      correspondência criptográfica chave↔certificado.
 *   6. Verificação notBefore/notAfter.
 *   7. AES-256-GCM: cifrar material (bytes originais do PFX) + senha, com
 *      IVs aleatórios independentes.
 *   8. Upload ciphertext ao bucket privado `fiscal-certificates`.
 *   9. Registro atômico via RPC service-role `rpc_fiscal_certificate_register_a1`
 *      recebendo strings base64 (nunca Uint8Array direto ao PostgREST).
 *  10. Em falha da RPC: remover objeto do storage antes de responder.
 *
 * Não retorna e não loga: senha, IV, ciphertext, object_path, material,
 * mensagens internas do banco, JWT, service_role.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import forge from "npm:node-forge@1";
import { isPlausibleAsn1Sequence } from "./asn1Screen.ts";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PASSWORD = 256;
const MAX_DISPLAY_NAME = 200;
const ALLOWED_EXT = [".pfx", ".p12"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(origin: string | null): { headers: Record<string, string>; allowed: boolean } {
  const allow = (Deno.env.get("FISCAL_CORS_ALLOWLIST") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = !!origin && allow.includes(origin);
  return {
    allowed,
    headers: {
      // fail-closed: sem origem/allowlist, nunca ecoa a origem
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

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  const headers = cors.headers;

  if (req.method === "OPTIONS") {
    // Preflight: fail-closed também no OPTIONS
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

  const { data: isAdmin, error: roleErr } = await authed.rpc("has_role", {
    _user_id: userId, _role: "administrador",
  });
  if (roleErr || !isAdmin) return json({ error: "permission_denied" }, 403, headers);

  const masterKey = decodeMasterKey();
  if (!masterKey) {
    return json({ error: "Cofre nao configurado", code: "CERTIFICATE_VAULT_NOT_CONFIGURED" }, 503, headers);
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
  if (!UUID_RE.test(companySettingsId)) return json({ error: "company_settings_id_invalid" }, 400, headers);
  // H7-005.8 — gate canonico: sem senha real do PFX nao ha validacao criptografica.
  if (!password.trim()) {
    return json(
      { error: "Senha do certificado A1 nao fornecida", code: "CERT_PASSWORD_REQUIRED" },
      400,
      headers,
    );
  }
  if (password.length > MAX_PASSWORD) return json({ error: "password_too_long" }, 400, headers);
  if (displayName.length > MAX_DISPLAY_NAME) return json({ error: "display_name_too_long" }, 400, headers);
  if (file.name.length > 255) return json({ error: "file_name_too_long" }, 400, headers);

  const lower = file.name.toLowerCase();
  if (!ALLOWED_EXT.some((e) => lower.endsWith(e))) {
    return json({ error: "invalid_extension" }, 400, headers);
  }
  if (file.size > MAX_BYTES) return json({ error: "file_too_large" }, 413, headers);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Confere existência real do company_settings antes de qualquer trabalho pesado.
  const companyExists = await admin.from("company_fiscal_settings")
    .select("id").eq("id", companySettingsId).maybeSingle();
  if (companyExists.error || !companyExists.data) {
    return json({ error: "company_settings_not_found" }, 404, headers);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // H7c: triagem ASN.1 mínima (BER/DER, incluindo comprimento indefinido `30 80`).
  // A autoridade real de formato é o forge (fromDer + pkcs12FromAsn1) logo abaixo.
  if (!isPlausibleAsn1Sequence(bytes)) {
    return json({ error: "not_pkcs12" }, 400, headers);
  }


  // Extrai + valida PKCS#12: cert X.509 + private key + match crypto
  let subject = "";
  let issuer = "";
  let serial = "";
  let validFrom = "";
  let validUntil = "";
  let fingerprintHex = "";
  const keyUsages: string[] = [];
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(bytes));
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    if (!certBag?.cert) {
      return json({ error: "pkcs12_missing_certificate" }, 400, headers);
    }
    const cert = certBag.cert;

    // Private key: aceita pkcs8ShroudedKeyBag OU keyBag
    const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const plain    = p12.getBags({ bagType: forge.pki.oids.keyBag });
    const keyBag =
      shrouded[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
      plain[forge.pki.oids.keyBag]?.[0];
    if (!keyBag?.key) {
      return json({ error: "pkcs12_missing_private_key" }, 400, headers);
    }
    const privateKey = keyBag.key;

    // Verificação criptográfica chave↔certificado: assinar/verificar payload aleatório
    try {
      const md = forge.md.sha256.create();
      const nonce = forge.util.bytesToHex(forge.random.getBytesSync(32));
      md.update(nonce);
      const signature = (privateKey as unknown as { sign: (m: unknown) => string }).sign(md);
      const md2 = forge.md.sha256.create();
      md2.update(nonce);
      const ok = (cert.publicKey as unknown as { verify: (d: string, s: string) => boolean })
        .verify(md2.digest().bytes(), signature);
      if (!ok) return json({ error: "private_key_does_not_match_certificate" }, 400, headers);
    } catch {
      return json({ error: "private_key_does_not_match_certificate" }, 400, headers);
    }

    const now = Date.now();
    const nb = new Date(cert.validity.notBefore).getTime();
    const na = new Date(cert.validity.notAfter).getTime();
    if (isNaN(nb) || isNaN(na)) return json({ error: "certificate_dates_invalid" }, 400, headers);
    if (nb > now) return json({ error: "certificate_not_yet_valid" }, 400, headers);
    if (na < now) return json({ error: "certificate_expired" }, 400, headers);

    subject   = cert.subject.attributes.map((a) => `${a.shortName ?? a.name}=${a.value}`).join(", ");
    issuer    = cert.issuer.attributes.map((a) => `${a.shortName ?? a.name}=${a.value}`).join(", ");
    serial    = cert.serialNumber.toLowerCase();
    validFrom = new Date(cert.validity.notBefore).toISOString();
    validUntil = new Date(cert.validity.notAfter).toISOString();

    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const md3 = forge.md.sha256.create();
    md3.update(der);
    fingerprintHex = md3.digest().toHex();

    const ku = cert.getExtension("keyUsage") as Record<string, unknown> | undefined;
    if (ku && typeof ku === "object") {
      for (const flag of ["digitalSignature","nonRepudiation","keyEncipherment","dataEncipherment","keyAgreement","keyCertSign","cRLSign"]) {
        if (ku[flag]) keyUsages.push(flag);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "pkcs12_error";
    if (/mac/i.test(msg) || /password/i.test(msg)) {
      return json({ error: "invalid_password" }, 400, headers);
    }
    return json({ error: "pkcs12_invalid" }, 400, headers);
  }

  // Cifra material + senha com IVs independentes.
  const encMaterial = await aesGcmEncrypt(masterKey, bytes);
  const encPassword = await aesGcmEncrypt(masterKey, new TextEncoder().encode(password));

  const objectPath = `${companySettingsId}/${crypto.randomUUID()}.enc`;

  const upload = await admin.storage.from("fiscal-certificates")
    .upload(objectPath, encMaterial.cipher, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  if (upload.error) {
    return json({ error: "storage_upload_failed" }, 500, headers);
  }

  // Registro atômico via RPC service-role (bytea recebe base64 e decodifica no banco).
  const { data: regId, error: regErr } = await admin.rpc("rpc_fiscal_certificate_register_a1", {
    p_company_settings_id: companySettingsId,
    p_created_by: userId,
    p_display_name: displayName,
    p_subject_name: subject,
    p_issuer_name: issuer,
    p_serial_number: serial,
    p_valid_from: validFrom,
    p_valid_until: validUntil,
    p_fingerprint_sha256: fingerprintHex,
    p_key_usage: keyUsages.length ? keyUsages : null,
    p_object_path: objectPath,
    p_encrypted_password_b64: toB64(encPassword.cipher),
    p_password_iv_b64: toB64(encPassword.iv),
    p_material_iv_b64: toB64(encMaterial.iv),
    p_key_version: 1,
  });

  if (regErr || !regId) {
    // Rollback do objeto — mensagem interna do banco NÃO é ecoada ao cliente.
    await admin.storage.from("fiscal-certificates").remove([objectPath]);
    return json({ error: "certificate_register_failed" }, 500, headers);
  }

  return json({ certificate_id: regId, fingerprint_sha256: fingerprintHex }, 200, headers);
});
