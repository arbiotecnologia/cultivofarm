import { assert, assertEquals } from "jsr:@std/assert@1";
import { classifyHttpError, classifyStatus, contentKind, diagnosticLogLine, errorCauses, finalizeDiagnostic, NFSE_CAUSES, officialErrorCodes, stageFromUrl } from "./reconcileDiagnostic.ts";
import { DPS_NOT_FOUND_OFFICIAL_CODES, parseDpsLookup, sefinUrl } from "./sefinContract.ts";
const R = { createHttpClient: true, denoVersion: "2" };
const B = "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional";
Deno.test("POST homologação na base anterior; candidata /API só no GET de reconciliação", () => {
  assertEquals(sefinUrl("HOMOLOGATION", { kind: "emit" }), "https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse");
  assertEquals(sefinUrl("HOMOLOGATION", { kind: "dps", id: "DPS" + "1".repeat(42) }), `${B}/dps/DPS${"1".repeat(42)}`);
  assertEquals(sefinUrl("HOMOLOGATION", { kind: "nfse", chave: "2".repeat(50) }), `${B}/nfse/${"2".repeat(50)}`);
  assertEquals(sefinUrl("PRODUCTION", { kind: "dps", id: "DPS" + "1".repeat(42) }), `https://sefin.nfse.gov.br/SefinNacional/dps/DPS${"1".repeat(42)}`);
  assertEquals(sefinUrl("PRODUCTION", { kind: "emit" }), "https://sefin.nfse.gov.br/SefinNacional/nfse");
});
Deno.test("etapa vem do caminho sem guardar id", () => {
  assertEquals(stageFromUrl(`${B}/dps/ABC123`), "dps_lookup"); assertEquals(stageFromUrl(`${B}/nfse/CHAVE`), "nfse_download");
  assertEquals(stageFromUrl(`${B}/nfse`), "emit"); assertEquals(stageFromUrl(`${B}/docs/index`), "route_probe");
});
const err = (msg: string, cause?: unknown) => Object.assign(new TypeError(msg), cause ? { cause } : {});
Deno.test("cadeia de causas → enums allowlisted (DNS, TCP, TLS, ALPN, timeout, recurso)", () => {
  const cases: Array<[unknown, string, string]> = [
    [err("error sending request", err("client error (Connect)", err("dns error: failed to lookup address information"))), "dns_lookup_failed", "dns_error"],
    [err("error sending request", err("Connection refused (os error 111)")), "tcp_connection_refused", "tcp_error"],
    [err("error sending request", err("connection reset by peer")), "tcp_connection_reset", "tcp_error"],
    [err("invalid peer certificate: UnknownIssuer"), "tls_unknown_issuer", "tls_error"],
    [err("invalid peer certificate: NotValidForName"), "tls_name_mismatch", "tls_error"],
    [err("received fatal alert: HandshakeFailure"), "tls_handshake_failure", "tls_error"],
    [err("received fatal alert: CertificateRequired"), "tls_alert_certificate_required", "tls_error"],
    [err("received fatal alert: ProtocolVersion"), "tls_protocol_version", "tls_error"],
    [err("peer is incompatible: NoCipherSuitesInCommon"), "tls_cipher_mismatch", "tls_error"],
    [err("http2 error: stream error received: HTTP_1_1_REQUIRED"), "alpn_http11_required", "http2_error"],
    [err("operation timed out"), "timed_out", "timeout"],
    [Object.assign(new Error("x"), { name: "AbortError" }), "aborted", "timeout"],
    [err("option not supported"), "unsupported_option", "unsupported_feature"],
  ];
  for (const [e, cause, cls] of cases) { assert(errorCauses(e).includes(cause as never), cause); assertEquals(classifyHttpError(e), cls, cause); }
  assertEquals(errorCauses(new Error("??")), ["unclassified"]);
  for (const c of errorCauses(cases[0][0])) assert((NFSE_CAUSES as readonly string[]).includes(c));
});
Deno.test("404 de rota/HTML não é 'DPS não localizada'; 403 IIS sem certificado separado", () => {
  assertEquals(classifyStatus(404, contentKind("text/html", "<html><title>404 - File or directory not found.</title>")), "route_not_found");
  assertEquals(classifyStatus(404, "empty"), "route_not_found");
  assertEquals(classifyStatus(403, contentKind("text/html", "<html>403 - Forbidden: Access is denied.</html>")), "client_certificate_not_presented");
  assertEquals(classifyStatus(200), "ok"); assertEquals(classifyStatus(302), "redirect_blocked"); assertEquals(classifyStatus(503), "server_error");
  assertEquals(DPS_NOT_FOUND_OFFICIAL_CODES.size, 0);
  for (const b of ["", "<html>404</html>", JSON.stringify({ erros: [{ Codigo: "E0001" }] })]) assertEquals(parseDpsLookup(404, b).notFoundConfirmed, false);
  assertEquals(officialErrorCodes(JSON.stringify({ erros: [{ Codigo: "E0001", Descricao: "CPF 123" }, { Codigo: "<script>" }] })), ["E0001"]);
});
Deno.test("log e diagnóstico só com enums; sem URL, corpo ou mensagem", () => {
  const d = finalizeDiagnostic({ stage: "dps_lookup", result: "ok", httpStatus: 200, runtime: R }, "reconciliation_unavailable")!;
  assertEquals(d.result, "unexpected_format");
  const line = diagnosticLogLine({ ...d, causes: errorCauses(err("dns error: failed to lookup address sefin.x DPS3106")), routeProbe: { documentedBase: "client_certificate_not_presented", legacyBase: "route_not_found" } });
  assert(!/https?:\/\/|sefin|DPS\d|lookup address/i.test(line), line);
});

Deno.test("consulta com idDps divergente não é aceita (permanece pendente)", () => {
  const id = "DPS" + "1".repeat(42); const c = "3".repeat(50);
  assertEquals(parseDpsLookup(200, JSON.stringify({ idDps: id, chaveAcesso: c }), id).found, true);
  const r = parseDpsLookup(200, JSON.stringify({ idDps: "DPS" + "9".repeat(42), chaveAcesso: c }), id);
  assertEquals(r.found, false); assertEquals(r.notFoundConfirmed, false);
});
Deno.test("diagnóstico TLS só aceita tokens fixos e booleanos", async () => {
  const { sanitizeTls, renegFailureClass } = await import("./reconcileDiagnostic.ts");
  const t = sanitizeTls({ version: "TLS1.2", cipher: "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384", alpn: "http/1.1", chainVerified: true, certRequested: true, clientCertSent: true, certRequestedOnRenegotiation: true, secureRenegotiation: true, extra: "x" });
  assertEquals(t?.cipher, "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"); assert(!("extra" in (t ?? {})));
  assertEquals(sanitizeTls({ version: "<script>a b</script>" })?.version, null);
  assertEquals(renegFailureClass("tls_insecure_renegotiation_refused"), "tls_error"); assertEquals(renegFailureClass("tcp_read_failed"), "tcp_error");
  assertEquals(renegFailureClass("url_blocked"), "redirect_blocked");
  const line = diagnosticLogLine({ stage: "dps_lookup", result: "ok", httpStatus: 200, runtime: R, transport: "go_wasm_reneg", tls: t, renegCode: null });
  assert(line.includes('"transport":"go_wasm_reneg"')); assert(!/DPS\d|BEGIN|PRIVATE/.test(line));
});
