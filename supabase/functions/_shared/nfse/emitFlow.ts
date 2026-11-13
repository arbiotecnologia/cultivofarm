/**
 * Orquestração da emissão NFS-e Nacional com dependências injetáveis
 * (ledger server-side, cofre A1, transporte mTLS). Sem Supabase nem rede aqui:
 * a Edge fornece as implementações reais; os testes offline, falsas.
 *
 * Invariantes:
 *  - Sem flag explícita de transmissão → nenhum begin, nenhum POST.
 *  - Produção só com flag própria E permissão do ledger server-side.
 *  - Um POST por transmissão. Falha/ambiguidade após o POST mantém SENT e
 *    exige reconciliação (GET /dps/{id}); nunca reenvio automático.
 *  - AUTHORIZED só após verifyAuthorizedNfse sobre o XML devolvido.
 */
import { buildDpsXml, dpsId as computeDpsId, type DpsInput, validateDps } from "./dps.ts";
import { buildEmitBody, gunzipBase64, parseDpsLookup, parseEmitResponse, sefinUrl, verifyAuthorizedNfse, type NfseEnvironment, type SefinMessage } from "./sefinContract.ts";

export type LedgerState = "PENDING" | "SENT" | "SUCCEEDED" | "FAILED" | "BLOCKED";
export type LedgerOutcome = "PENDING" | "AUTHORIZED" | "REJECTED" | "RECONCILIATION_REQUIRED" | "NOT_FOUND" | "TRANSPORT_ERROR";
export interface LedgerRow {
  transmissionId: string; state: LedgerState; outcome: LedgerOutcome; dpsNumber: number; dpsSeries: string;
  dpsId: string | null; environment: NfseEnvironment; accessKey: string | null; idempotentReplay?: boolean;
}
export interface LedgerPatch {
  dpsId?: string; dpsXmlSha256?: string; httpStatus?: number | null; accessKey?: string | null; nfseNumber?: string | null;
  processedAt?: string | null; nfseXmlSha256?: string | null; errors?: SefinMessage[]; errorCode?: string | null; verification?: string[];
}
export interface EmitDeps {
  flags: { transmissionEnabled: boolean; productionEnabled: boolean };
  ledger: {
    begin(a: { invoiceId: string; idempotencyKey: string; fingerprint: string; environment: NfseEnvironment; endpointHost: string }): Promise<LedgerRow>;
    record(transmissionId: string, state: LedgerState, outcome: LedgerOutcome, patch: LedgerPatch): Promise<LedgerRow>;
    get(transmissionId: string): Promise<LedgerRow | null>;
    storeNfseXml(transmissionId: string, xml: string, sha256: string): Promise<boolean>;
  };
  loadDps(): Promise<{ input: Omit<DpsInput, "number" | "series">; fingerprint: string }>;
  sign(xml: string, dpsId: string, emitterCnpj: string): Promise<{ signedXml: string; verified: boolean }>;
  http(req: { method: "POST" | "GET"; url: string; body?: string }): Promise<{ status: number; body: string }>;
  sha256Hex(s: string): Promise<string>;
}
export interface EmitResult {
  httpStatus: number; code: string; transmissionId?: string; outcome?: LedgerOutcome; authorized: boolean;
  accessKey?: string | null; nfseNumber?: string | null; errors?: SefinMessage[]; missing?: string[]; reconciliationRequired?: boolean; retrySafe: boolean;
}

const fail = (httpStatus: number, code: string, extra: Partial<EmitResult> = {}): EmitResult => ({ httpStatus, code, authorized: false, retrySafe: false, ...extra });
const tpAmb = (e: NfseEnvironment) => (e === "PRODUCTION" ? "1" : "2") as "1" | "2";

async function finishWithNfse(deps: EmitDeps, row: LedgerRow, dps: DpsInput, id: string, chave: string, gz: string, httpStatus: number | null): Promise<EmitResult> {
  let xml: string;
  try { xml = await gunzipBase64(gz); } catch {
    await deps.ledger.record(row.transmissionId, "SUCCEEDED", "RECONCILIATION_REQUIRED", { httpStatus, accessKey: chave, errorCode: "NFSE_RESPONSE_GZIP_INVALID" });
    return fail(502, "reconciliation_required", { transmissionId: row.transmissionId, outcome: "RECONCILIATION_REQUIRED", reconciliationRequired: true, accessKey: chave });
  }
  const check = verifyAuthorizedNfse({ nfseXml: xml, chaveAcesso: chave, expectedDpsId: id, expectedTpAmb: tpAmb(dps.environment),
    expectedCnpj: dps.emitter.cnpj.replace(/\D/g, ""), expectedServiceAmount: (Math.round(dps.values.serviceAmount * 100) / 100).toFixed(2) });
  const sha = await deps.sha256Hex(xml);
  if (!check.ok) {
    await deps.ledger.record(row.transmissionId, "SUCCEEDED", "RECONCILIATION_REQUIRED", { httpStatus, accessKey: chave, nfseXmlSha256: sha, errorCode: "NFSE_AUTHORIZATION_UNVERIFIED", verification: check.reasons });
    return fail(502, "authorization_unverified", { transmissionId: row.transmissionId, outcome: "RECONCILIATION_REQUIRED", reconciliationRequired: true, accessKey: chave });
  }
  const stored = await deps.ledger.storeNfseXml(row.transmissionId, xml, sha);
  const rec = await deps.ledger.record(row.transmissionId, "SUCCEEDED", "AUTHORIZED", { httpStatus, accessKey: chave, nfseNumber: check.nfseNumber, processedAt: check.dhProc, nfseXmlSha256: sha, errorCode: stored ? null : "NFSE_XML_STORE_PENDING" });
  if (rec.outcome !== "AUTHORIZED") return fail(503, "reconciliation_required", { transmissionId: row.transmissionId, reconciliationRequired: true, accessKey: chave });
  return { httpStatus: 200, code: "authorized", transmissionId: row.transmissionId, outcome: "AUTHORIZED", authorized: true, accessKey: chave, nfseNumber: check.nfseNumber, retrySafe: false, reconciliationRequired: !stored };
}

async function prepare(deps: EmitDeps) {
  const loaded = await deps.loadDps();
  return loaded;
}

export async function emitNfse(deps: EmitDeps, req: { invoiceId: string; idempotencyKey: string }): Promise<EmitResult> {
  if (!deps.flags.transmissionEnabled) return fail(409, "transmission_disabled");
  const { input, fingerprint } = await prepare(deps);
  const probe = validateDps({ ...input, series: "1", number: 1 });
  if (probe.length) return fail(422, "dps_incomplete", { missing: probe });
  if (input.environment === "PRODUCTION" && !deps.flags.productionEnabled) return fail(403, "production_blocked");
  const endpoint = sefinUrl(input.environment, { kind: "emit" });

  const row = await deps.ledger.begin({ invoiceId: req.invoiceId, idempotencyKey: req.idempotencyKey, fingerprint, environment: input.environment, endpointHost: new URL(endpoint).host });
  if (row.idempotentReplay || row.state !== "PENDING") {
    const pendingRecon = row.state === "SENT" || row.outcome === "RECONCILIATION_REQUIRED";
    return { httpStatus: 200, code: "replayed", transmissionId: row.transmissionId, outcome: row.outcome, authorized: row.outcome === "AUTHORIZED",
      accessKey: row.accessKey, retrySafe: false, reconciliationRequired: pendingRecon };
  }
  const dps: DpsInput = { ...input, series: row.dpsSeries, number: row.dpsNumber };
  const id = computeDpsId(dps);
  let signed: string;
  try {
    const xml = buildDpsXml(dps);
    const s = await deps.sign(xml, id, dps.emitter.cnpj);
    if (!s.verified) throw Object.assign(new Error("verify"), { code: "DPS_SIGNATURE_SELF_CHECK_FAILED" });
    signed = s.signedXml;
  } catch (e) {
    const code = (e as { code?: string }).code ?? "DPS_SIGN_FAILED";
    await deps.ledger.record(row.transmissionId, "BLOCKED", "PENDING", { errorCode: code });
    return fail(422, "signing_failed", { transmissionId: row.transmissionId, errors: [{ code, description: "" }] });
  }
  const body = await buildEmitBody(signed);
  const sent = await deps.ledger.record(row.transmissionId, "SENT", "PENDING", { dpsId: id, dpsXmlSha256: await deps.sha256Hex(signed) });
  if (sent.state !== "SENT") return fail(503, "sent_persistence_failed", { transmissionId: row.transmissionId });

  let res: { status: number; body: string };
  try { res = await deps.http({ method: "POST", url: endpoint, body }); } catch {
    return fail(503, "reconciliation_required", { transmissionId: row.transmissionId, outcome: "PENDING", reconciliationRequired: true });
  }
  const parsed = parseEmitResponse(res.status, res.body);
  if (parsed.kind === "NFSE_RETURNED") {
    if (parsed.idDps && parsed.idDps !== id) {
      await deps.ledger.record(row.transmissionId, "SUCCEEDED", "RECONCILIATION_REQUIRED", { httpStatus: res.status, accessKey: parsed.chaveAcesso, errorCode: "NFSE_DPS_ID_MISMATCH" });
      return fail(502, "authorization_unverified", { transmissionId: row.transmissionId, reconciliationRequired: true });
    }
    return finishWithNfse(deps, row, dps, id, parsed.chaveAcesso, parsed.nfseXmlGZipB64, res.status);
  }
  if (parsed.kind === "REJECTED" && !parsed.duplicate) {
    await deps.ledger.record(row.transmissionId, "FAILED", "REJECTED", { httpStatus: res.status, errors: parsed.errors, errorCode: "NFSE_REJECTED" });
    return fail(422, "rejected", { transmissionId: row.transmissionId, outcome: "REJECTED", errors: parsed.errors });
  }
  await deps.ledger.record(row.transmissionId, "SENT", "RECONCILIATION_REQUIRED", { httpStatus: res.status, errors: parsed.kind === "REJECTED" ? parsed.errors : [], errorCode: parsed.kind === "REJECTED" ? "NFSE_DPS_DUPLICATE" : "NFSE_RESPONSE_UNKNOWN" });
  return fail(503, "reconciliation_required", { transmissionId: row.transmissionId, outcome: "RECONCILIATION_REQUIRED", reconciliationRequired: true });
}

/** Reconciliação: consulta a DPS e, se gerada, baixa e verifica a NFS-e. */
export async function reconcileNfse(deps: EmitDeps, req: { transmissionId: string }): Promise<EmitResult> {
  if (!deps.flags.transmissionEnabled) return fail(409, "transmission_disabled");
  const row = await deps.ledger.get(req.transmissionId);
  if (!row) return fail(404, "transmission_not_found");
  if (row.outcome === "AUTHORIZED") return { httpStatus: 200, code: "already_authorized", transmissionId: row.transmissionId, outcome: "AUTHORIZED", authorized: true, accessKey: row.accessKey, retrySafe: false };
  if (!(row.state === "SENT" || row.outcome === "RECONCILIATION_REQUIRED") || !row.dpsId) return fail(409, "not_reconcilable", { transmissionId: row.transmissionId, outcome: row.outcome });
  if (row.environment === "PRODUCTION" && !deps.flags.productionEnabled) return fail(403, "production_blocked");
  const { input } = await prepare(deps);
  const dps: DpsInput = { ...input, series: row.dpsSeries, number: row.dpsNumber };
  if (computeDpsId(dps) !== row.dpsId || input.environment !== row.environment) return fail(409, "reconciliation_context_changed", { transmissionId: row.transmissionId });

  let look: { status: number; body: string };
  try { look = await deps.http({ method: "GET", url: sefinUrl(row.environment, { kind: "dps", id: row.dpsId }) }); } catch { return fail(503, "reconciliation_unavailable", { transmissionId: row.transmissionId, reconciliationRequired: true }); }
  const found = parseDpsLookup(look.status, look.body);
  if (!found.found || !found.chaveAcesso) {
    if (look.status === 404) {
      await deps.ledger.record(row.transmissionId, "FAILED", "NOT_FOUND", { httpStatus: 404, errorCode: "NFSE_DPS_NOT_PROCESSED" });
      return fail(200, "not_processed", { transmissionId: row.transmissionId, outcome: "NOT_FOUND" });
    }
    return fail(503, "reconciliation_unavailable", { transmissionId: row.transmissionId, reconciliationRequired: true });
  }
  let doc: { status: number; body: string };
  try { doc = await deps.http({ method: "GET", url: sefinUrl(row.environment, { kind: "nfse", chave: found.chaveAcesso }) }); } catch { return fail(503, "reconciliation_unavailable", { transmissionId: row.transmissionId, reconciliationRequired: true }); }
  const parsed = parseEmitResponse(doc.status, doc.body);
  if (parsed.kind !== "NFSE_RETURNED" || parsed.chaveAcesso !== found.chaveAcesso) return fail(503, "reconciliation_unavailable", { transmissionId: row.transmissionId, reconciliationRequired: true });
  return finishWithNfse(deps, row, dps, row.dpsId, parsed.chaveAcesso, parsed.nfseXmlGZipB64, doc.status);
}
