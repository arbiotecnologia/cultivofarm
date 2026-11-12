/**
 * Fase Fiscal 3.16.2-A / H7d — Edge Function `fiscal-certificate-upload`.
 *
 * Admin-only. Fluxo:
 *   1. CORS fail-closed (origem ausente/desconhecida => 403).
 *   2. JWT + verificação has_role(administrador) via cliente authed.
 *   3. Parsing FormData com limites explícitos de tamanho/nome/senha.
 *   4. Verificação de UUID e existência de company_settings.
 *   5. Extração PKCS#12 (node-forge): exige cert X.509 + private key +
 *      correspondência criptográfica chave↔certificado.
 *   6. Verificação notBefore/notAfter + identidade do titular (CNPJ).
 *   7. H7d: a SENHA DO PFX é usada SOMENTE aqui, em memória, para abrir o
 *      PKCS#12. Do material aberto extrai-se um BUNDLE DE ASSINATURA
 *      (cert PEM + cadeia PEM + chave privada PKCS#8 PEM sem senha), que é
 *      cifrado com AES-256-GCM pela chave mestra server-side. A senha (e
 *      qualquer derivado dela) NUNCA é persistida em tabela, Storage,
 *      Secrets, logs ou repositório.
 *   8. Upload do ciphertext ao bucket privado `fiscal-certificates`.
 *   9. Registro atômico via RPC service-role `rpc_fiscal_certificate_register_a1`
 *      (sem parâmetros de senha).
 *  10. Em falha da RPC: remover objeto do storage antes de responder.
 *
 * Única fonte de material: upload admin autenticado (multipart/form-data).
 * Não existe mais ingestão por secret permanente (`FISCAL_CERT_PFX_B64` /
 * `FISCAL_CERT_PASSWORD` foram removidos do runtime).
 *
 * Não retorna e não loga: senha, IV, ciphertext, object_path, material,
 * mensagens internas do banco, JWT, service_role.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { isCanonicalSupabaseUrl } from "../_shared/fiscal/canonicalProject.ts";
import { fiscalCorsHeaders } from "../_shared/fiscal/corsAllowlist.ts";
import forge from "npm:node-forge@1";
import { isPlausibleAsn1Sequence } from "./asn1Screen.ts";
import { resolveCertificateHolderCnpj } from "../_shared/fiscal/certHolderCnpj.ts";
import { validateCnpjAlpha } from "../_shared/fiscal/cnpj.ts";
import { selectCertificateLeafForPrivateKey } from "./certificateLeaf.ts";
import {
  serializeSigningBundle,
  SIGNING_BUNDLE_ALGORITHM,
  SIGNING_BUNDLE_FORMAT,
} from "../_shared/fiscal/certificateVault.ts";
import { decodeMasterKey } from "../_shared/fiscal/masterKey.ts";


const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PASSWORD = 256;
const MAX_DISPLAY_NAME = 200;
const ALLOWED_EXT = [".pfx", ".p12"];
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

/**
 * Deriva a chave AES-256 do segredo FISCAL_CERTIFICATE_MASTER_KEY.
 * Aceita base64 de exatamente 32 bytes (formato canonico) ou, para segredos
 * gerados como texto aleatorio de alta entropia (>= 32 chars), deriva 32 bytes
 * deterministicamente via SHA-256. Nunca loga nem retorna o segredo.
 */
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

function wipeBytes(bytes: Uint8Array | null): void {
  if (bytes) bytes.fill(0);
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
  if (!isCanonicalSupabaseUrl(supabaseUrl)) return json({ error: "canonical_project_required" }, 503, headers);
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

  const masterKey = await decodeMasterKey();
  if (!masterKey) {
    return json({ error: "Cofre nao configurado", code: "CERTIFICATE_VAULT_NOT_CONFIGURED" }, 503, headers);
  }

  let bytes: Uint8Array | null = null;
  let bundleBytes: Uint8Array | null = null;
  let encMaterial: { iv: Uint8Array; cipher: Uint8Array } | null = null;
  let password = "";
  let bundleJson = "";

  try {
    // H7d — FONTE ÚNICA: upload admin autenticado (multipart/form-data).
    // A ingestão por secret permanente foi removida: nenhuma senha ou PFX pode
    // residir em Supabase Secrets. A senha só existe nesta requisição.
    const contentType = req.headers.get("content-type") ?? "";
    let companySettingsId: string;
    let displayName: string;

    if (!contentType.includes("multipart/form-data")) {
      return json(
        {
          error: "Importacao permitida somente por upload admin autenticado",
          code: "CERTIFICATE_UPLOAD_SOURCE_REQUIRED",
        },
        415,
        headers,
      );
    }
    {
      let form: FormData;
      try {
        form = await req.formData();

      } catch {
        return json({ error: "invalid_body" }, 400, headers);
      }

      const file = form.get("file");
      password = String(form.get("password") ?? "");
      companySettingsId = String(form.get("company_settings_id") ?? "");
      displayName = String(form.get("display_name") ?? "Certificado A1");

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

      bytes = new Uint8Array(await file.arrayBuffer());
    }

    // Confere existência real do company_settings antes de qualquer trabalho pesado.
    // H7e: o CNPJ do emitente NUNCA vem do cliente — sempre lido server-side aqui.
    const companyExists = await authed.from("company_fiscal_settings")
      .select("id, cnpj").eq("id", companySettingsId).eq("is_active", true).maybeSingle();
    if (companyExists.error || !companyExists.data) {
      return json({ error: "company_settings_not_found" }, 404, headers);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const companyAllowed = await admin.rpc("h15_service_actor_company_access", {
      p_actor: userId,
      p_company: companySettingsId,
    });
    if (companyAllowed.error || companyAllowed.data !== true) {
      return json({ error: "permission_denied" }, 403, headers);
    }

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
      const allCertBags = certBags[forge.pki.oids.certBag] ?? [];

      // H7D.1 — não confiar na ordem do PKCS#12. O leaf é o único certificado
      // cuja publicKey verifica uma assinatura criada pela private key extraída.
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

      const leafSelection = selectCertificateLeafForPrivateKey({
        certBags: allCertBags,
        privateKey: privateKey as unknown as { sign: (m: { update(input: string): void; digest(): { bytes(): string } }) => string },
        createSha256Digest: () => forge.md.sha256.create(),
        createNonce: () => forge.util.bytesToHex(forge.random.getBytesSync(32)),
      });
      if (leafSelection.status === "missing") {
        return json({ error: "pkcs12_missing_certificate" }, 400, headers);
      }
      if (leafSelection.status === "ambiguous") {
        return json({ error: "pkcs12_leaf_ambiguous" }, 400, headers);
      }
      if (!leafSelection.leaf) {
        return json({ error: "private_key_does_not_match_certificate" }, 400, headers);
      }
      const cert = leafSelection.leaf;
      const chainCerts = leafSelection.chain;

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

    // ---- H7e: identidade do titular (fail-closed) ----------------------------
    // Nunca ecoa o CNPJ do certificado nem do emitente: apenas códigos estáveis.
      const sanExt = cert.getExtension("subjectAltName") as { value?: string } | undefined;
      let sanBytes: Uint8Array | null = null;
      if (sanExt?.value) {
        const raw = sanExt.value;
        sanBytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) sanBytes[i] = raw.charCodeAt(i) & 0xff;
      }
      const cnField = cert.subject.getField("CN") as { value?: string } | null;
      const snField = (cert.subject.getField("serialNumber")
        ?? cert.subject.getField({ type: "2.5.4.5" })) as { value?: string } | null;

      const holder = resolveCertificateHolderCnpj({
        sanBytes,
        subjectCn: cnField?.value ?? null,
        subjectSerialNumber: snField?.value ?? null,
      });
      if (!holder.ok) {
        return json(
          {
            error: holder.code === "CERT_HOLDER_IS_INDIVIDUAL"
              ? "Certificado de pessoa fisica (e-CPF) nao e valido para emissao da pessoa juridica"
              : "Nao foi possivel confirmar o CNPJ do titular do certificado",
            code: holder.code === "CERT_CNPJ_INVALID" ? "CERT_CNPJ_NOT_FOUND" : holder.code,
          },
          400,
          headers,
        );
      }
      const issuerCnpj = String(companyExists.data.cnpj ?? "").replace(/\D/g, "");
      if (issuerCnpj.length !== 14 || !validateCnpjAlpha(issuerCnpj)) {
        return json({ error: "CNPJ do emitente invalido ou nao configurado", code: "ISSUER_CNPJ_INVALID" }, 409, headers);
      }
      if (issuerCnpj !== holder.cnpj) {
        return json(
          { error: "O certificado nao pertence ao CNPJ do emitente configurado", code: "CERT_CNPJ_MISMATCH" },
          409,
          headers,
        );
      }
      // -------------------------------------------------------------------------

      const ku = cert.getExtension("keyUsage") as Record<string, unknown> | undefined;
      if (ku && typeof ku === "object") {
        for (const flag of ["digitalSignature","nonRepudiation","keyEncipherment","dataEncipherment","keyAgreement","keyCertSign","cRLSign"]) {
          if (ku[flag]) keyUsages.push(flag);
        }
      }

      // ---- H7d: bundle de assinatura (sem senha) --------------------------------
      // Chave privada exportada em PKCS#8 PEM NÃO cifrado por senha: quem protege
      // o material é exclusivamente a chave mestra AES-256-GCM do cofre.
      const keyPem = forge.pki.privateKeyInfoToPem(
        forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(privateKey)),
      );
      bundleJson = serializeSigningBundle({
        certPem: forge.pki.certificateToPem(cert),
        keyPem,
        chainPem: chainCerts.map((c) => forge.pki.certificateToPem(c)),
      });
      // -------------------------------------------------------------------------
    } catch (err) {
      const msg = err instanceof Error ? err.message : "pkcs12_error";
      if (/mac/i.test(msg) || /password/i.test(msg)) {
        return json({ error: "invalid_password" }, 400, headers);
      }
      return json({ error: "pkcs12_invalid" }, 400, headers);
    }

    if (!bundleJson) {
      return json({ error: "certificate_material_unavailable" }, 400, headers);
    }

    // H7d — cifra APENAS o bundle de assinatura. A senha do PFX morre aqui:
    // não é cifrada, não é hasheada e não é enviada a nenhum destino persistente.
    bundleBytes = new TextEncoder().encode(bundleJson);
    encMaterial = await aesGcmEncrypt(masterKey, bundleBytes);
    wipeBytes(bundleBytes);
    bundleBytes = null;
    wipeBytes(bytes);
    bytes = null;
    password = "";
    bundleJson = "";

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
      p_material_iv_b64: toB64(encMaterial.iv),
      p_key_version: 1,
      p_material_format: SIGNING_BUNDLE_FORMAT,
      p_material_algorithm: SIGNING_BUNDLE_ALGORITHM,
    });

    if (regErr || !regId) {
      // Rollback do objeto — mensagem interna do banco NÃO é ecoada ao cliente.
      await admin.storage.from("fiscal-certificates").remove([objectPath]);
      return json({ error: "certificate_register_failed" }, 500, headers);
    }

    return json({ certificate_id: regId, fingerprint_sha256: fingerprintHex }, 200, headers);
  } catch {
    return json({ error: "certificate_upload_failed" }, 500, headers);
  } finally {
    wipeBytes(masterKey);
    wipeBytes(bytes);
    wipeBytes(bundleBytes);
    wipeBytes(encMaterial?.iv ?? null);
    wipeBytes(encMaterial?.cipher ?? null);
    password = "";
    bundleJson = "";
  }
});

