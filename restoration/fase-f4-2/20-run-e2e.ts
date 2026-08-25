/**
 * FASE F4.2 — Harness remoto E2E do motor XML NF-e (staging ikaauvsflpmamgxmkhoq).
 *
 * Executa o fluxo real contra a Edge Function implantada, até SIGNED, e
 * prova os invariantes de segurança, idempotência, concorrência e
 * contenção. NADA é transmitido à SEFAZ.
 *
 * Segredos: lidos apenas de variáveis de ambiente. Nenhum valor é impresso,
 * logado ou gravado em artefato. O material de assinatura sintético existe
 * somente em memória e em objeto cifrado no Storage, removido pelo cleanup.
 *
 * Uso: ./run.sh   (ver RUNBOOK.md)
 */
import forge from "npm:node-forge@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  verifyNfeSignature,
} from "../../supabase/functions/_shared/fiscal/nfe/signNfeXml.ts";
import { NFE_NAMESPACE } from "../../supabase/functions/_shared/fiscal/nfe/buildNfeXml.ts";
import { validateAgainstOfficialXsd } from "../../supabase/functions/fiscal-xml-engine/xsdValidate.ts";
import {
  serializeSigningBundle,
  SIGNING_BUNDLE_ALGORITHM,
  SIGNING_BUNDLE_FORMAT,
} from "../../supabase/functions/_shared/fiscal/certificateVault.ts";

// ---------------------------------------------------------------------
// Ambiente (fail-closed)
// ---------------------------------------------------------------------
const STAGING_REF = "ikaauvsflpmamgxmkhoq";
const FORBIDDEN_REF = "navfzbwgwzruipouyfnk";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    console.error(`ABORT: variavel ${name} ausente`);
    Deno.exit(2);
  }
  return v;
}

const SUPABASE_URL = env("F42_SUPABASE_URL");
const ANON_KEY = env("F42_ANON_KEY");
const SERVICE_KEY = env("F42_SERVICE_ROLE_KEY");
const TEST_MASTER_KEY_B64 = env("F42_TEST_MASTER_KEY_B64"); // = FISCAL_TEST_CERTIFICATE_MASTER_KEY
const ORIGIN = env("F42_ALLOWED_ORIGIN"); // deve constar de FISCAL_CORS_ALLOWLIST
const TAG = env("F42_TAG");
const INVOICE_ID = env("F42_INVOICE_ID");
const INVOICE_QUOTE_ID = env("F42_INVOICE_QUOTE_ID");
const COMPANY_ID = env("F42_COMPANY_SETTINGS_ID");
const OUT_DIR = Deno.env.get("F42_OUT_DIR") ?? "./artifacts";

if (SUPABASE_URL.includes(FORBIDDEN_REF)) {
  console.error("ABORT: URL aponta para PRODUCAO — execucao proibida");
  Deno.exit(2);
}
if (!SUPABASE_URL.includes(STAGING_REF)) {
  console.error("ABORT: URL nao e o staging autorizado");
  Deno.exit(2);
}
if (!TAG.startsWith("F42-HARNESS-")) {
  console.error("ABORT: F42_TAG deve comecar com F42-HARNESS-");
  Deno.exit(2);
}

const FN_URL = `${SUPABASE_URL}/functions/v1/fiscal-xml-engine`;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------------
// Resultado / gates
// ---------------------------------------------------------------------
type GateStatus = "PASS" | "FAIL" | "SKIP";
interface Gate { id: string; name: string; ok: boolean; status: GateStatus; detail: string }
const gates: Gate[] = [];
function gate(id: string, name: string, ok: boolean, detail = "") {
  gates.push({ id, name, ok, status: ok ? "PASS" : "FAIL", detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed = true;
}
/** Gate nao executado por dependencia nao satisfeita: nunca conta como PASS. */
function skipGate(id: string, name: string, reason: string) {
  gates.push({ id, name, ok: false, status: "SKIP", detail: `BLOCKED_BY_PRECONDITION: ${reason}` });
  console.log(`SKIP  ${id}  ${name} — BLOCKED_BY_PRECONDITION: ${reason}`);
  failed = true;
}
/** Erro de pre-condicao: interrompe a cadeia sem virar TXX. */
class PreconditionBlocked extends Error {}
// Gates que dependem de calculo + reserva do documento principal.
const DEPENDENT_GATES: [string, string][] = [
  ["T08", "tpAmb != 2 -> bloqueio fail-closed"],
  ["T09", "sem certificado A1 -> 412 CERTIFICATE_REQUIRED e estado GENERATED"],
  ["T10", "execucao preservada (nunca FAILED)"],
  ["T11", "registro do A1 sintetico (display_name F42-HARNESS-*)"],
  ["T12", "geracao real -> SIGNED"],
  ["T13", "validator xmllint-wasm@5.3.0"],
  ["T14", "pacote XSD PL_010e_v1.02"],
  ["T15", "signatureVerified = true"],
  ["T16", "transmitted = false (teto SIGNED)"],
  ["T17", "hashes/bytes/paths persistidos"],
  ["T18", "download autorizado devolve URL assinada de 120s"],
  ["T19", "download por usuario sem papel -> 403"],
  ["T20", "download por anon bloqueado"],
  ["T21", "SHA-256 do XML baixado confere com o registrado"],
  ["T22", "XMLDSig verificada FORA da Edge"],
  ["T23", "XSD 1.0 oficial revalidado no XML baixado"],
  ["T24", "adulteracao do documento invalida a assinatura"],
  ["T25", "adulteracao da assinatura falha na verificacao"],
  ["T26", "replay da mesma chave nao cria nova execucao/versao"],
  ["T27", "payload diferente com a mesma chave -> conflito"],
  ["T28", "mesma chave em outro documento -> escopo bloqueado"],
  ["T29", "concorrencia simultanea na mesma chave -> no maximo 1 execucao"],
];
let failed = false;

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(v: string): Uint8Array {
  const bin = atob(v);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function aesGcmEncrypt(key: Uint8Array, plain: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ck = await crypto.subtle.importKey(
    "raw", key as unknown as BufferSource, "AES-GCM", false, ["encrypt"],
  );
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, ck, plain as unknown as BufferSource,
  ));
  return { iv, ct };
}

async function callFn(opts: {
  body: unknown;
  bearer?: string | null;
  origin?: string | null;
}): Promise<{ status: number; json: Record<string, unknown> | null; text: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.origin !== null) headers["Origin"] = opts.origin ?? ORIGIN;
  if (opts.bearer) {
    headers["Authorization"] = `Bearer ${opts.bearer}`;
    headers["apikey"] = ANON_KEY;
  }
  const res = await fetch(FN_URL, { method: "POST", headers, body: JSON.stringify(opts.body) });
  const text = await res.text();
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(text); } catch { /* corpo não-JSON */ }
  return { status: res.status, json: parsed, text };
}

// ---------------------------------------------------------------------
// Certificado A1 de teste — gerado em runtime, NUNCA versionado
// ---------------------------------------------------------------------
function generateTestSigningBundle(): { bundle: Uint8Array; meta: Record<string, string> } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "0" + forge.util.bytesToHex(forge.random.getBytesSync(8));
  cert.validity.notBefore = new Date(Date.now() - 3600_000);
  cert.validity.notAfter = new Date(Date.now() + 7 * 24 * 3600_000); // 7 dias
  const attrs = [
    { name: "commonName", value: `${TAG} EMITENTE LTDA:19131243000197` },
    { name: "countryName", value: "BR" },
    { name: "organizationName", value: "AC TESTE F42 (NAO CONFIAVEL)" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true, keyEncipherment: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const keyPem = forge.pki.privateKeyInfoToPem(
    forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keys.privateKey)),
  );
  const bundleJson = serializeSigningBundle({
    certPem: forge.pki.certificateToPem(cert),
    keyPem,
    chainPem: [],
  });
  const bundle = enc.encode(bundleJson);

  const fp = forge.md.sha256.create();
  fp.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
  return {
    bundle,
    meta: {
      subject: cert.subject.attributes.map((a: { shortName?: string; value?: string }) =>
        `${a.shortName}=${a.value}`).join(","),
      issuer: cert.issuer.attributes.map((a: { shortName?: string; value?: string }) =>
        `${a.shortName}=${a.value}`).join(","),
      serial: cert.serialNumber,
      notBefore: cert.validity.notBefore.toISOString(),
      notAfter: cert.validity.notAfter.toISOString(),
      fingerprint: forge.util.bytesToHex(fp.digest().bytes()),
    },
  };
}

// ---------------------------------------------------------------------
// Usuários temporários
// ---------------------------------------------------------------------
interface TempUser { id: string; email: string; token: string }

async function createTempUser(suffix: string, roles: string[]): Promise<TempUser> {
  const email = `${TAG.toLowerCase()}-${suffix}@harness.invalid`;
  const password = b64(crypto.getRandomValues(new Uint8Array(24)));
  const created = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { f42_harness: TAG },
  });
  if (created.error || !created.data.user) {
    throw new Error(`falha ao criar usuario temporario (${suffix})`);
  }
  const id = created.data.user.id;
  for (const role of roles) {
    const r = await admin.from("user_roles").insert({ user_id: id, role });
    if (r.error) throw new Error(`falha ao atribuir papel ${role}`);
  }
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const signed = await anonClient.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error(`falha ao autenticar (${suffix})`);
  return { id, email, token: signed.data.session.access_token };
}

const createdUsers: string[] = [];
const uploadedObjects: { bucket: string; path: string }[] = [];

// ---------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------
const evidence: Record<string, unknown> = { tag: TAG, startedAt: new Date().toISOString() };

try {
  // ---------- Usuários -------------------------------------------------
  const fiscalUser = await createTempUser("fiscal", ["administrador"]);
  createdUsers.push(fiscalUser.id);
  const plainUser = await createTempUser("norole", []);
  createdUsers.push(plainUser.id);
  gate("T00", "usuarios temporarios criados (fiscal + sem papel)", true);

  // ---------- Contenção de acesso -------------------------------------
  const noJwt = await callFn({ body: { action: "generate", invoice_id: INVOICE_ID, idempotency_key: `${TAG}-X` } });
  gate("T01", "sem JWT -> 401", noJwt.status === 401, `status=${noJwt.status}`);

  const badOrigin = await callFn({
    body: { action: "generate", invoice_id: INVOICE_ID, idempotency_key: `${TAG}-X` },
    bearer: fiscalUser.token, origin: "https://origem-nao-permitida.invalid",
  });
  gate("T02", "origem fora da allowlist -> 403", badOrigin.status === 403, `status=${badOrigin.status}`);

  const anonCall = await callFn({
    body: { action: "generate", invoice_id: INVOICE_ID, idempotency_key: `${TAG}-ANON` },
    bearer: ANON_KEY,
  });
  gate("T03", "anon bloqueado (nao chega a preparar)",
    anonCall.status === 401 || anonCall.status === 400 || anonCall.status === 403,
    `status=${anonCall.status}`);

  const noRole = await callFn({
    body: { action: "generate", invoice_id: INVOICE_ID, idempotency_key: `${TAG}-NOROLE` },
    bearer: plainUser.token,
  });
  gate("T04", "usuario sem papel fiscal -> bloqueado",
    noRole.status === 400 && String(noRole.json?.code ?? "").startsWith("FISCAL_FORBIDDEN"),
    `status=${noRole.status} code=${noRole.json?.code}`);

  // ---------- Pré-condições fiscais (cálculo + reserva) ----------------
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${fiscalUser.token}` } },
    auth: { persistSession: false },
  });

  const calc = await userClient.rpc("rpc_fiscal_calculate_invoice_v1", {
    p_invoice_id: INVOICE_ID, p_idempotency_key: `${TAG}-CALC`,
  });
  gate("T05", "calculo tributario do documento sintetico", !calc.error,
    calc.error ? String(calc.error.message).split(":")[0] : "ok");

  const resv = await userClient.rpc("rpc_fiscal_reserve_nfe_number_v1", {
    p_invoice_id: INVOICE_ID, p_idempotency_key: `${TAG}-RESV`,
  });
  gate("T06", "reserva de numeracao (serie sintetica 899)", !resv.error,
    resv.error ? String(resv.error.message).split(":")[0] : "ok");

  // ---------- Bloqueio de negocio: pedido em cotacao -------------------
  // Ordem real das validacoes (auditada nas migrations F3/F4):
  //   rpc_fiscal_xml_prepare_v1 exige tax_snapshot (FISCAL_CALCULATION_REQUIRED)
  //   e reserva ANTES de avaliar a elegibilidade do pedido. Logo, o gate de
  //   quote_only nao e alcancavel pela Edge: ele vive uma camada antes, em
  //   rpc_fiscal_calculate_invoice_v1, que aplica fn_fiscal_invoice_eligibility
  //   e devolve FISCAL_NOT_ELIGIBLE com a razao FISCAL_QUOTE_ONLY_BLOCKED.
  //   O gate e provado exatamente ali — sem satisfazer pre-condicoes que
  //   permitiriam concluir o documento em cotacao.
  const quoteCalc = await userClient.rpc("rpc_fiscal_calculate_invoice_v1", {
    p_invoice_id: INVOICE_QUOTE_ID, p_idempotency_key: `${TAG}-QUOTE-CALC`,
  });
  const quoteMsg = String(quoteCalc.error?.message ?? "");
  gate("T07", "pedido em cotacao -> FISCAL_NOT_ELIGIBLE/FISCAL_QUOTE_ONLY_BLOCKED",
    !!quoteCalc.error && /FISCAL_NOT_ELIGIBLE/.test(quoteMsg) &&
      /FISCAL_QUOTE_ONLY_BLOCKED/.test(quoteMsg),
    quoteMsg.slice(0, 120) || "sem erro (inesperado)");

  // Prova de ausencia de efeitos colaterais no documento em cotacao.
  const quoteInv = await admin.from("fiscal_invoices")
    .select("status, tax_snapshot").eq("id", INVOICE_QUOTE_ID).maybeSingle();
  const quoteRuns = await admin.from("fiscal_calculation_runs")
    .select("id").eq("fiscal_invoice_id", INVOICE_QUOTE_ID);
  const quoteResv = await admin.from("fiscal_number_reservations")
    .select("id").eq("fiscal_invoice_id", INVOICE_QUOTE_ID);
  const quoteXml = await admin.from("fiscal_xml_runs")
    .select("id").eq("fiscal_invoice_id", INVOICE_QUOTE_ID);
  gate("T07b", "documento em cotacao sem efeitos colaterais",
    quoteInv.data?.status === "DRAFT" && !quoteInv.data?.tax_snapshot &&
    (quoteRuns.data?.length ?? 0) === 0 && (quoteResv.data?.length ?? 0) === 0 &&
    (quoteXml.data?.length ?? 0) === 0,
    `status=${quoteInv.data?.status} runs=${quoteRuns.data?.length} resv=${quoteResv.data?.length} xml=${quoteXml.data?.length}`);

  // Cadeia T08+ depende de calculo/reserva reais do documento principal.
  if (calc.error || resv.error) {
    throw new PreconditionBlocked(
      `T05/T06 falharam (${String(calc.error?.message ?? resv.error?.message).split(":")[0]})`,
    );
  }

  // tpAmb != 2 : altera SOMENTE o emitente sintetico e restaura em seguida.
  await admin.from("company_fiscal_settings").update({ nfe_environment_code: "1" }).eq("id", COMPANY_ID);
  const prod = await callFn({
    body: { action: "generate", invoice_id: INVOICE_ID, idempotency_key: `${TAG}-TPAMB` },
    bearer: fiscalUser.token,
  });
  await admin.from("company_fiscal_settings").update({ nfe_environment_code: "2" }).eq("id", COMPANY_ID);
  gate("T08", "tpAmb != 2 -> bloqueio fail-closed",
    prod.status === 400 && /PRODUCTION_BLOCKED|ENVIRONMENT/.test(String(prod.json?.code ?? "")),
    `status=${prod.status} code=${prod.json?.code}`);

  // ---------- Ausência de certificado ---------------------------------
  const MAIN_KEY = `${TAG}-MAIN`;
  const noCert = await callFn({
    body: { action: "generate", invoice_id: INVOICE_ID, idempotency_key: MAIN_KEY },
    bearer: fiscalUser.token,
  });
  gate("T09", "sem certificado A1 -> 412 CERTIFICATE_REQUIRED e estado GENERATED",
    noCert.status === 412 && noCert.json?.code === "CERTIFICATE_REQUIRED" &&
    noCert.json?.state === "GENERATED",
    `status=${noCert.status} state=${noCert.json?.state}`);

  const afterNoCert = await admin.from("fiscal_xml_runs")
    .select("state").eq("fiscal_invoice_id", INVOICE_ID).eq("idempotency_key", MAIN_KEY).maybeSingle();
  gate("T10", "execucao preservada (nunca FAILED)", afterNoCert.data?.state === "GENERATED",
    `state=${afterNoCert.data?.state}`);

  // ---------- Certificado A1 sintético --------------------------------
  const key = fromB64(TEST_MASTER_KEY_B64);
  if (key.byteLength !== 32) throw new Error("chave de teste nao tem 32 bytes");
  const { bundle, meta } = generateTestSigningBundle();
  const encMaterial = await aesGcmEncrypt(key, bundle);
  bundle.fill(0);
  const objectPath = `f42-harness/${TAG}/a1-teste.signing-bundle-v2.enc`;

  const up = await admin.storage.from("fiscal-certificates")
    .upload(objectPath, encMaterial.ct, { contentType: "application/octet-stream", upsert: true });
  if (up.error) throw new Error("falha ao subir material cifrado");
  uploadedObjects.push({ bucket: "fiscal-certificates", path: objectPath });

  const reg = await admin.rpc("rpc_fiscal_certificate_register_a1", {
    p_company_settings_id: COMPANY_ID,
    p_created_by: fiscalUser.id,
    p_display_name: `${TAG} A1 TESTE`,
    p_subject_name: meta.subject,
    p_issuer_name: meta.issuer,
    p_serial_number: meta.serial,
    p_valid_from: meta.notBefore,
    p_valid_until: meta.notAfter,
    p_fingerprint_sha256: meta.fingerprint,
    p_key_usage: ["digitalSignature", "nonRepudiation"],
    p_object_path: objectPath,
    p_material_iv_b64: b64(encMaterial.iv),
    p_key_version: 1,
    p_material_format: SIGNING_BUNDLE_FORMAT,
    p_material_algorithm: SIGNING_BUNDLE_ALGORITHM,
  });
  gate("T11", "registro do A1 sintetico (display_name F42-HARNESS-*)", !reg.error,
    reg.error ? String(reg.error.message).split(":")[0] : "ok");

  // ---------- Geração real até SIGNED ---------------------------------
  const signedRes = await callFn({
    body: { action: "generate", invoice_id: INVOICE_ID, idempotency_key: MAIN_KEY },
    bearer: fiscalUser.token,
  });
  const sr = signedRes.json ?? {};
  gate("T12", "geracao real -> SIGNED", signedRes.status === 200 && sr.state === "SIGNED",
    `status=${signedRes.status} state=${sr.state} code=${sr.code ?? "-"}`);
  gate("T13", "validator xmllint-wasm@5.3.0",
    String((sr.validation as Record<string, unknown> | undefined)?.validator ?? "")
      .startsWith("xmllint-wasm@5.3.0"),
    String((sr.validation as Record<string, unknown> | undefined)?.validator ?? "-"));
  gate("T14", "pacote XSD PL_010e_v1.02",
    (sr.validation as Record<string, unknown> | undefined)?.xsdPackage === "PL_010e_v1.02");
  gate("T15", "signatureVerified = true", sr.signatureVerified === true);
  gate("T16", "transmitted = false (teto SIGNED)", sr.transmitted === false);

  const runRow = await admin.from("fiscal_xml_runs")
    .select("id, run_version, unsigned_sha256, signed_sha256, unsigned_bytes, signed_bytes, unsigned_path, signed_path, certificate_id")
    .eq("fiscal_invoice_id", INVOICE_ID).eq("idempotency_key", MAIN_KEY).maybeSingle();
  const runId = String(runRow.data?.id ?? "");
  gate("T17", "hashes/bytes/paths persistidos",
    /^[0-9a-f]{64}$/.test(String(runRow.data?.signed_sha256 ?? "")) &&
    Number(runRow.data?.signed_bytes ?? 0) > Number(runRow.data?.unsigned_bytes ?? 0) &&
    String(runRow.data?.signed_path ?? "").startsWith(`${INVOICE_ID}/`),
    `path=${runRow.data?.signed_path}`);
  if (runRow.data?.signed_path) {
    uploadedObjects.push({ bucket: "fiscal-xml", path: String(runRow.data.signed_path) });
  }
  if (runRow.data?.unsigned_path) {
    uploadedObjects.push({ bucket: "fiscal-xml", path: String(runRow.data.unsigned_path) });
  }

  // ---------- Download autorizado + verificação externa ----------------
  const dl = await callFn({
    body: { action: "download", run_id: runId, artifact: "signed" },
    bearer: fiscalUser.token,
  });
  gate("T18", "download autorizado devolve URL assinada de 120s",
    dl.status === 200 && dl.json?.expiresIn === 120 && typeof dl.json?.url === "string",
    `status=${dl.status}`);

  const dlNoRole = await callFn({
    body: { action: "download", run_id: runId, artifact: "signed" },
    bearer: plainUser.token,
  });
  gate("T19", "download por usuario sem papel -> 403",
    dlNoRole.status === 403, `status=${dlNoRole.status}`);

  const dlAnon = await callFn({
    body: { action: "download", run_id: runId, artifact: "signed" },
    bearer: ANON_KEY,
  });
  gate("T20", "download por anon bloqueado",
    dlAnon.status === 401 || dlAnon.status === 403, `status=${dlAnon.status}`);

  const signedUrl = typeof dl.json?.url === "string" ? String(dl.json.url) : "";
  if (!signedUrl) {
    throw new PreconditionBlocked("T18 nao devolveu URL assinada; verificacao externa impossivel");
  }
  const xmlRes = await fetch(signedUrl);
  const signedXml = await xmlRes.text();
  const xmlSha = await sha256Hex(enc.encode(signedXml));
  gate("T21", "SHA-256 do XML baixado confere com o registrado",
    xmlSha === String(runRow.data?.signed_sha256), `sha=${xmlSha.slice(0, 16)}…`);

  const extVerify = verifyNfeSignature(signedXml, NFE_NAMESPACE);
  gate("T22", "XMLDSig verificada FORA da Edge", extVerify.valid === true,
    extVerify.code ?? "ok");

  const extXsd = await validateAgainstOfficialXsd(signedXml);
  gate("T23", "XSD 1.0 oficial revalidado no XML baixado", extXsd.valid === true,
    extXsd.issues.slice(0, 2).map((i) => i.code).join(","));

  // ---------- Adulteração ---------------------------------------------
  const tamperedDoc = signedXml.replace(/<xProd>[^<]*<\/xProd>/, "<xProd>ADULTERADO</xProd>");
  const tv = verifyNfeSignature(tamperedDoc, NFE_NAMESPACE);
  gate("T24", "adulteracao do documento invalida a assinatura", tv.valid === false,
    tv.code ?? "-");

  const tamperedSig = signedXml.replace(
    /<SignatureValue>[^<]*<\/SignatureValue>/,
    "<SignatureValue>QUJD</SignatureValue>",
  );
  const tsv = verifyNfeSignature(tamperedSig, NFE_NAMESPACE);
  gate("T25", "adulteracao da assinatura falha na verificacao", tsv.valid === false,
    tsv.code ?? "-");

  // ---------- Idempotência --------------------------------------------
  const replay = await callFn({
    body: { action: "generate", invoice_id: INVOICE_ID, idempotency_key: MAIN_KEY },
    bearer: fiscalUser.token,
  });
  const afterReplay = await admin.from("fiscal_xml_runs")
    .select("id, run_version").eq("fiscal_invoice_id", INVOICE_ID);
  gate("T26", "replay da mesma chave nao cria nova execucao/versao",
    replay.status === 200 && replay.json?.state === "SIGNED" &&
    (afterReplay.data ?? []).length === 1,
    `runs=${(afterReplay.data ?? []).length}`);

  // Payload diferente com a MESMA chave -> conflito (fingerprint).
  await admin.from("fiscal_invoice_items")
    .update({ description: `${TAG} PRODUTO ALTERADO` })
    .eq("fiscal_invoice_id", INVOICE_ID).eq("item_sequence", 1);
  const conflict = await callFn({
    body: { action: "generate", invoice_id: INVOICE_ID, idempotency_key: MAIN_KEY },
    bearer: fiscalUser.token,
  });
  await admin.from("fiscal_invoice_items")
    .update({ description: `${TAG} PRODUTO SINTETICO` })
    .eq("fiscal_invoice_id", INVOICE_ID).eq("item_sequence", 1);
  gate("T27", "payload diferente com a mesma chave -> conflito",
    conflict.status === 200 && conflict.json?.state === "SIGNED"
      ? false
      : /FINGERPRINT_MISMATCH|IDEMPOTENCY/.test(String(conflict.json?.code ?? "")),
    `status=${conflict.status} code=${conflict.json?.code}`);

  // Mesma chave em OUTRO documento -> escopo violado.
  const scope = await callFn({
    body: { action: "generate", invoice_id: INVOICE_QUOTE_ID, idempotency_key: MAIN_KEY },
    bearer: fiscalUser.token,
  });
  gate("T28", "mesma chave em outro documento -> escopo bloqueado",
    /IDEMPOTENCY_SCOPE_MISMATCH|NOT_ELIGIBLE|QUOTE_ONLY/.test(String(scope.json?.code ?? "")),
    `code=${scope.json?.code}`);

  // ---------- Concorrência real ---------------------------------------
  const CONC_KEY = `${TAG}-CONC`;
  const before = (await admin.from("fiscal_xml_runs").select("id")
    .eq("fiscal_invoice_id", INVOICE_ID)).data?.length ?? 0;
  const conc = await Promise.all([
    callFn({ body: { action: "generate", invoice_id: INVOICE_ID, idempotency_key: CONC_KEY }, bearer: fiscalUser.token }),
    callFn({ body: { action: "generate", invoice_id: INVOICE_ID, idempotency_key: CONC_KEY }, bearer: fiscalUser.token }),
  ]);
  const after = (await admin.from("fiscal_xml_runs").select("id, idempotency_key")
    .eq("fiscal_invoice_id", INVOICE_ID)).data ?? [];
  const concRuns = after.filter((r) => r.idempotency_key === CONC_KEY).length;
  gate("T29", "concorrencia simultanea na mesma chave -> no maximo 1 execucao",
    concRuns <= 1 && after.length <= before + 1,
    `runs_conc=${concRuns} status=${conc.map((c) => c.status).join("/")}`);

  evidence.gates = gates;
  evidence.runId = runId;
  evidence.signedSha256 = runRow.data?.signed_sha256;
  evidence.unsignedSha256 = runRow.data?.unsigned_sha256;
  evidence.signedBytes = runRow.data?.signed_bytes;
  evidence.unsignedBytes = runRow.data?.unsigned_bytes;
  evidence.signedPath = runRow.data?.signed_path;
  evidence.certificateFingerprint = meta.fingerprint;
} catch (err) {
  failed = true;
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof PreconditionBlocked) {
    const done = new Set(gates.map((g) => g.id));
    for (const [id, name] of DEPENDENT_GATES) {
      if (!done.has(id)) skipGate(id, name, msg);
    }
  } else {
    gate("TXX", "excecao nao tratada no harness", false, msg.slice(0, 200));
  }
} finally {
  // Nunca deixar usuários temporários para trás, mesmo em falha.
  for (const id of createdUsers) {
    await admin.from("user_roles").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  evidence.uploadedObjects = uploadedObjects;
  evidence.finishedAt = new Date().toISOString();
  evidence.result = failed ? "FAIL" : "PASS";
  try {
    await Deno.mkdir(OUT_DIR, { recursive: true });
    await Deno.writeTextFile(`${OUT_DIR}/f42-${TAG}.json`, JSON.stringify(evidence, null, 2));
    console.log(`\nEvidencia (sem segredos): ${OUT_DIR}/f42-${TAG}.json`);
  } catch { /* artefato é acessório */ }
}

const passed = gates.filter((g) => g.status === "PASS").length;
const skipped = gates.filter((g) => g.status === "SKIP").length;
const hardFailed = gates.filter((g) => g.status === "FAIL").length;
console.log(
  `\nHARNESS F4.2: ${passed}/${gates.length} GATES PASS` +
    ` (FAIL=${hardFailed}, SKIP/BLOCKED_BY_PRECONDITION=${skipped})` +
    ` ${failed ? "— FAIL" : "— PASS"}`,
);
Deno.exit(failed ? 1 : 0);
