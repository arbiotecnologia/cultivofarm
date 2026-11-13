/**
 * Testes OFFLINE do adaptador NFS-e Nacional: contrato, assinatura com A1
 * sintético efêmero, XSD oficial v1.01 e verificação independente
 * (libxml2 + OpenSSL). `fetch` global é substituído por uma trava: qualquer
 * tentativa de rede real falha o teste. Nenhum POST real, nenhum banco.
 */
import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { buildDpsXml, dpsId, type DpsInput, regimeFromCrt } from "../../supabase/functions/_shared/nfse/dps.ts";
import { DpsSignError, signDpsXml, verifyDpsSignature } from "../../supabase/functions/_shared/nfse/signDps.ts";
import { assertSefinUrl, buildEmitBody, gunzipBase64, gzipBase64, parseEmitResponse, sefinUrl, verifyAuthorizedNfse } from "../../supabase/functions/_shared/nfse/sefinContract.ts";
import { emitNfse, reconcileNfse, type EmitDeps, type LedgerRow, type LedgerState, type LedgerOutcome } from "../../supabase/functions/_shared/nfse/emitFlow.ts";
import { mapInvoiceToDps } from "../../supabase/functions/_shared/nfse/dpsFromInvoice.ts";

const HERE = new URL(".", import.meta.url).pathname;
const TMP = await Deno.makeTempDir({ prefix: "nfse-a1-" });
let networkAttempts = 0;
globalThis.fetch = (() => { networkAttempts++; throw new Error("REDE BLOQUEADA NO TESTE OFFLINE"); }) as typeof fetch;

async function sh(cmd: string, args: string[]) {
  const r = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" }).output();
  if (!r.success) throw new Error(new TextDecoder().decode(r.stderr));
  return new TextDecoder().decode(r.stdout);
}
const CNPJ = "11222333000181";
async function cert(name: string, cnpj: string, days = 30) {
  await sh("bash", [`${HERE}gen_cert.sh`, `${TMP}/${name}`, cnpj, String(days)]);
  return { certPem: await Deno.readTextFile(`${TMP}/${name}/cert.pem`), keyPem: await Deno.readTextFile(`${TMP}/${name}/key.pem`) };
}
const good = await cert("good", CNPJ);
const other = await cert("other", "99888777000155");

const base: DpsInput = {
  environment: "HOMOLOGATION", issueDateTime: "2026-11-13T10:00:00-03:00", competence: "2026-11-13", series: "1", number: 7,
  emitter: { cnpj: CNPJ, municipalityIbge: "3147006", municipalRegistration: "12345", regime: regimeFromCrt("3") },
  taker: { cnpjCpf: "11144477735", name: "Tomador Sintético & Cia", email: "qa@example.invalid" },
  service: { nationalTaxCode: "170101", municipalTaxCode: null, description: "Consultoria agronômica (sintética)", locationIbge: "3147006", incidenceMunicipalityIbge: "3147006" },
  values: { serviceAmount: 1500, issRate: 2.5, issWithheld: false, totTrib: { mode: "IND" } },
};
const NOW = new Date();

async function independent(xml: string, name: string) {
  const p = `${TMP}/${name}.xml`; await Deno.writeTextFile(p, xml);
  return JSON.parse(await sh("python3", [`${HERE}independent_verify.py`, p, `${HERE}official/xsd-1.01`]));
}

for (const crt of ["1", "3", "4"]) {
  Deno.test(`DPS assinada (CRT ${crt}) é válida no XSD oficial 1.01 e na verificação independente`, async () => {
    const i = { ...base, emitter: { ...base.emitter, regime: regimeFromCrt(crt) } };
    const s = signDpsXml({ xml: buildDpsXml(i), dpsId: dpsId(i), emitterCnpj: CNPJ, material: good, now: NOW });
    assert(verifyDpsSignature(s.signedXml).valid);
    const r = await independent(s.signedXml, `crt${crt}`);
    assertEquals(r.xsd_errors, []); assert(r.xsd_valid);
    // Defeito conhecido do XSD oficial: só o padrão ancorado de <serie> falha.
    assertEquals(r.xsd_official_valid, false);
    assertEquals(r.xsd_official_errors.length, 1); assert(r.xsd_official_errors[0].includes("serie")); assert(r.reference_matches_id); assert(r.digest_ok); assert(r.openssl_signature_ok);
    assertEquals(r.algorithms, ["http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", "http://www.w3.org/2001/04/xmlenc#sha256"]);
    await Deno.writeTextFile(`${HERE}evidence/dps-sintetica-crt${crt}.xml`, s.signedXml);
  });
}
Deno.test("adulteração do valor quebra digest (motor e verificação independente)", async () => {
  const s = signDpsXml({ xml: buildDpsXml(base), dpsId: dpsId(base), emitterCnpj: CNPJ, material: good, now: NOW });
  const t = s.signedXml.replace("<vServ>1500.00</vServ>", "<vServ>1.00</vServ>");
  assertEquals(verifyDpsSignature(t).code, "SIGNATURE_DIGEST_MISMATCH");
  const r = await independent(t, "tampered"); assertEquals(r.digest_ok, false);
});
Deno.test("A1 de outro CNPJ é recusado (E0718) e A1 expirado é recusado", async () => {
  const e = assertThrows(() => signDpsXml({ xml: buildDpsXml(base), dpsId: dpsId(base), emitterCnpj: CNPJ, material: other, now: NOW }), DpsSignError);
  assertEquals(e.code, "CERTIFICATE_HOLDER_MISMATCH");
  const e2 = assertThrows(() => signDpsXml({ xml: buildDpsXml(base), dpsId: dpsId(base), emitterCnpj: CNPJ, material: good, now: new Date(NOW.getTime() + 60 * 86400_000) }), DpsSignError);
  assertEquals(e2.code, "CERTIFICATE_EXPIRED");
  const e3 = assertThrows(() => signDpsXml({ xml: buildDpsXml(base), dpsId: dpsId(base), emitterCnpj: CNPJ, material: { certPem: good.certPem, keyPem: other.keyPem }, now: NOW }), DpsSignError);
  assertEquals(e3.code, "CERTIFICATE_KEY_MISMATCH");
});
Deno.test("XSD oficial rejeita DPS sem regTrib válido (negativo independente)", async () => {
  const s = signDpsXml({ xml: buildDpsXml(base), dpsId: dpsId(base), emitterCnpj: CNPJ, material: good, now: NOW });
  const r = await independent(s.signedXml.replace("<opSimpNac>1</opSimpNac>", "<opSimpNac>7</opSimpNac>"), "xsdneg");
  assertEquals(r.xsd_valid, false);
});
Deno.test("gzip+base64 ida e volta e corpo JSON oficial", async () => {
  const s = signDpsXml({ xml: buildDpsXml(base), dpsId: dpsId(base), emitterCnpj: CNPJ, material: good, now: NOW });
  const b = JSON.parse(await buildEmitBody(s.signedXml));
  assertEquals(Object.keys(b), ["dpsXmlGZipB64"]);
  assertEquals(await gunzipBase64(b.dpsXmlGZipB64), s.signedXml);
  await assertRejects(() => buildEmitBody(buildDpsXml(base)));
  await assertRejects(() => gunzipBase64(btoa("nao-gzip")));
});
Deno.test("endpoints: só hosts oficiais por ambiente", () => {
  assertEquals(sefinUrl("HOMOLOGATION", { kind: "emit" }), "https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse");
  assertEquals(sefinUrl("PRODUCTION", { kind: "emit" }), "https://sefin.nfse.gov.br/SefinNacional/nfse");
  assertThrows(() => assertSefinUrl("https://sefin.nfse.gov.br/SefinNacional/nfse", "HOMOLOGATION"));
  assertThrows(() => assertSefinUrl("http://sefin.producaorestrita.nfse.gov.br/x", "HOMOLOGATION"));
  assertThrows(() => sefinUrl("HOMOLOGATION", { kind: "dps", id: "../x" }));
});

// --------- NFS-e sintética devolvida pelo "Sistema Nacional" (fixture) ----------
const KEY50 = "3147006" + "2" + CNPJ + "0".repeat(28);
async function nfseFixture(signed: string, opts: { key?: string; amount?: string; noSig?: boolean } = {}) {
  const dps = signed.replace(/^<\?xml[^>]*\?>/, "").replace(' xmlns="http://www.sped.fazenda.gov.br/nfse"', "").replace("<vServ>1500.00</vServ>", `<vServ>${opts.amount ?? "1500.00"}</vServ>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${opts.key ?? KEY50}"><nNFSe>17</nNFSe><dhProc>2026-11-13T10:00:05-03:00</dhProc>${dps}</infNFSe>${opts.noSig ? "" : '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo/></Signature>'}</NFSe>`;
  return gzipBase64(xml);
}

class FakeLedger {
  rows = new Map<string, LedgerRow>(); byKey = new Map<string, string>(); calls: string[] = []; next = 1; failRecord = false;
  async begin(a: { idempotencyKey: string; fingerprint: string; environment: "HOMOLOGATION" | "PRODUCTION" }) {
    this.calls.push("begin");
    const ex = this.byKey.get(a.idempotencyKey);
    if (ex) return { ...this.rows.get(ex)!, idempotentReplay: true };
    const r: LedgerRow = { transmissionId: crypto.randomUUID(), state: "PENDING", outcome: "PENDING", dpsNumber: this.next++, dpsSeries: "1", dpsId: null, environment: a.environment, accessKey: null };
    this.rows.set(r.transmissionId, r); this.byKey.set(a.idempotencyKey, r.transmissionId); return r;
  }
  async record(id: string, state: LedgerState, outcome: LedgerOutcome, p: { dpsId?: string; accessKey?: string | null }) {
    this.calls.push(`${state}/${outcome}`);
    if (this.failRecord && state !== "SENT") throw Object.assign(new Error("x"), { code: "reconciliation_required", status: 503 });
    const r = this.rows.get(id)!; if (r.outcome === "AUTHORIZED") throw new Error("terminal");
    Object.assign(r, { state, outcome, dpsId: r.dpsId ?? p.dpsId ?? null, accessKey: r.accessKey ?? p.accessKey ?? null }); return { ...r };
  }
  async get(id: string) { return this.rows.get(id) ?? null; }
  async storeNfseXml() { this.calls.push("store"); return true; }
}
function makeDeps(ledger: FakeLedger, http: EmitDeps["http"], over: Partial<EmitDeps["flags"]> = {}, env: "HOMOLOGATION" | "PRODUCTION" = "HOMOLOGATION"): EmitDeps & { posts: number } {
  const d = {
    posts: 0,
    flags: { transmissionEnabled: true, productionEnabled: false, ...over },
    ledger: ledger as unknown as EmitDeps["ledger"],
    loadDps: async () => ({ input: { ...base, environment: env }, fingerprint: "f".repeat(64) }),
    sign: async (xml: string, id: string, cnpj: string) => { const s = signDpsXml({ xml, dpsId: id, emitterCnpj: cnpj, material: good, now: NOW }); return { signedXml: s.signedXml, verified: verifyDpsSignature(s.signedXml).valid }; },
    http: async (r: { method: "POST" | "GET"; url: string; body?: string }) => { if (r.method === "POST") d.posts++; return http(r); },
    sha256Hex: async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join(""),
  };
  return d;
}
const REQ = { invoiceId: crypto.randomUUID(), idempotencyKey: "qa-nfse-key-000001" };

Deno.test("flag de transmissão desligada: nenhum ledger, nenhum POST", async () => {
  const l = new FakeLedger(); const d = makeDeps(l, async () => { throw new Error("nao deveria"); }, { transmissionEnabled: false });
  const r = await emitNfse(d, REQ); assertEquals(r.code, "transmission_disabled"); assertEquals(l.calls, []); assertEquals(d.posts, 0);
});
Deno.test("produção bloqueada sem flag própria", async () => {
  const l = new FakeLedger(); const d = makeDeps(l, async () => { throw new Error("x"); }, {}, "PRODUCTION");
  const r = await emitNfse(d, REQ); assertEquals(r.code, "production_blocked"); assertEquals(l.calls, []);
});
Deno.test("caminho autorizado: POST único, NFS-e verificada, AUTHORIZED", async () => {
  const l = new FakeLedger(); let sentBody = "";
  const d = makeDeps(l, async (r) => { sentBody = r.body!; const dps = await gunzipBase64(JSON.parse(r.body!).dpsXmlGZipB64);
    return { status: 201, body: JSON.stringify({ tipoAmbiente: 2, idDps: dpsId({ ...base, number: 1 }), chaveAcesso: KEY50, nfseXmlGZipB64: await nfseFixture(dps) }) }; });
  const r = await emitNfse(d, REQ);
  assertEquals([r.code, r.authorized, r.accessKey, r.nfseNumber], ["authorized", true, KEY50, "17"]);
  assertEquals(d.posts, 1); assertEquals(l.calls, ["begin", "SENT/PENDING", "store", "SUCCEEDED/AUTHORIZED"]);
  assert(sentBody.startsWith('{"dpsXmlGZipB64":"H4sI'));
  const replay = await emitNfse(d, REQ); assertEquals([replay.code, replay.authorized], ["replayed", true]); assertEquals(d.posts, 1);
});
Deno.test("NFS-e devolvida divergente (valor/assinatura) nunca vira AUTHORIZED", async () => {
  for (const o of [{ amount: "1.00" }, { noSig: true }]) {
    const l = new FakeLedger();
    const d = makeDeps(l, async (r) => ({ status: 201, body: JSON.stringify({ chaveAcesso: KEY50, nfseXmlGZipB64: await nfseFixture(await gunzipBase64(JSON.parse(r.body!).dpsXmlGZipB64), o) }) }));
    const r = await emitNfse(d, REQ); assertEquals([r.code, r.authorized, r.reconciliationRequired], ["authorization_unverified", false, true]);
    assertEquals(l.calls.at(-1), "SUCCEEDED/RECONCILIATION_REQUIRED");
  }
});
Deno.test("rejeição oficial: REJECTED, sem reenvio", async () => {
  const l = new FakeLedger(); const d = makeDeps(l, async () => ({ status: 400, body: JSON.stringify({ erros: [{ Codigo: "E0312", Descricao: "Código de tributação nacional inexistente" }] }) }));
  const r = await emitNfse(d, REQ); assertEquals([r.code, r.outcome, r.errors?.[0].code], ["rejected", "REJECTED", "E0312"]); assertEquals(d.posts, 1);
});
Deno.test("DPS duplicada / 5xx / queda de rede após POST: reconciliação, nunca reenvio", async () => {
  const cases: EmitDeps["http"][] = [
    async () => ({ status: 400, body: JSON.stringify({ erros: [{ Codigo: "E0014", Descricao: "DPS já existente" }] }) }),
    async () => ({ status: 502, body: "<html>bad gateway</html>" }),
    async () => { throw new Error("ECONNRESET"); },
  ];
  for (const h of cases) {
    const l = new FakeLedger(); const d = makeDeps(l, h);
    const r = await emitNfse(d, REQ); assertEquals([r.code, r.authorized, r.reconciliationRequired, r.retrySafe], ["reconciliation_required", false, true, false]);
    const again = await emitNfse(d, REQ); assertEquals(again.code, "replayed"); assertEquals(d.posts, 1);
  }
});
Deno.test("reconciliação: GET /dps → GET /nfse → AUTHORIZED verificado", async () => {
  const l = new FakeLedger(); let signedDps = "";
  const d = makeDeps(l, async (r) => {
    if (r.method === "POST") { signedDps = await gunzipBase64(JSON.parse(r.body!).dpsXmlGZipB64); throw new Error("timeout"); }
    if (r.url.includes("/dps/")) return { status: 200, body: JSON.stringify({ chaveAcesso: KEY50 }) };
    assert(r.url.endsWith(`/nfse/${KEY50}`)); return { status: 200, body: JSON.stringify({ chaveAcesso: KEY50, nfseXmlGZipB64: await nfseFixture(signedDps) }) };
  });
  const first = await emitNfse(d, REQ); assertEquals(first.code, "reconciliation_required");
  const rec = await reconcileNfse(d, { transmissionId: first.transmissionId! });
  assertEquals([rec.code, rec.authorized, rec.accessKey], ["authorized", true, KEY50]); assertEquals(d.posts, 1);
});
Deno.test("reconciliação: DPS não processada (404) → NOT_FOUND, sem POST", async () => {
  const l = new FakeLedger();
  const d = makeDeps(l, async (r) => { if (r.method === "POST") throw new Error("timeout"); return { status: 404, body: "" }; });
  const first = await emitNfse(d, REQ);
  const rec = await reconcileNfse(d, { transmissionId: first.transmissionId! });
  assertEquals([rec.code, rec.outcome], ["not_processed", "NOT_FOUND"]); assertEquals(d.posts, 1);
});
Deno.test("rascunho canônico → DPS: pendências sem inventar dados", () => {
  const inv = { id: "i", environment: "HOMOLOGATION", issue_date: "2026-11-13", draft_version: 1, total_amount: "450.00",
    fiscal_profile_snapshot: { nfse_dps: { v: 1, service_location_ibge_code: "3147006", tot_trib: { mode: "IND" } } },
    items: [{ description: "QA Consultoria", net_value: "300.00", fiscal_profile_snapshot: { national_tax_code: "170101", municipality_ibge_code: "3147006" }, tax_snapshot: { iss_rate: 2.5 } },
            { description: "QA Consultoria", net_value: "150.00", fiscal_profile_snapshot: { national_tax_code: "170101", municipality_ibge_code: "3147006" }, tax_snapshot: { iss_rate: 2.5 } }] };
  const company = { cnpj: CNPJ, municipality_ibge_code: "3147006", municipal_registration: null, crt: "3", fiscal_environment: "HOMOLOGATION" };
  const ok = mapInvoiceToDps(inv, company, { cpf_cnpj: "11144477735", name: "Tomador", email: null }, NOW);
  assert(ok.ok); if (ok.ok) { assertEquals(ok.input.values.serviceAmount, 450); assertEquals(ok.input.emitter.regime?.opSimpNac, "1"); }
  const bad = mapInvoiceToDps({ ...inv, environment: "NOT_CONFIGURED" }, { ...company, crt: null }, { cpf_cnpj: null, name: null, email: null }, NOW);
  assert(!bad.ok); if (!bad.ok) assertEquals(bad.missing.sort(), ["ambiente_rascunho", "crt"]);
  const mixed = mapInvoiceToDps({ ...inv, items: [inv.items[0], { ...inv.items[1], fiscal_profile_snapshot: { national_tax_code: "010101", municipality_ibge_code: "3147006" } }] }, company, { cpf_cnpj: "1", name: "x", email: null }, NOW);
  assert(!mixed.ok);
});
Deno.test("parse de resposta: sucesso exige chave 50 dígitos + XML", () => {
  assertEquals(parseEmitResponse(201, JSON.stringify({ chaveAcesso: "123", nfseXmlGZipB64: "x" })).kind, "UNKNOWN");
  assertEquals(parseEmitResponse(200, "{}").kind, "UNKNOWN");
  assertEquals(verifyAuthorizedNfse({ nfseXml: "<x/>", chaveAcesso: KEY50, expectedDpsId: "DPS", expectedTpAmb: "2", expectedCnpj: CNPJ, expectedServiceAmount: "1.00" }).ok, false);
});
Deno.test("nenhuma tentativa de rede real", () => { assertEquals(networkAttempts, 0); });
