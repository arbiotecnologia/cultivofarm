import { assertEquals } from "jsr:@std/assert@1";
import { classifyHttpError, classifyStatus, finalizeDiagnostic, stageFromUrl } from "./reconcileDiagnostic.ts";
const R = { createHttpClient: true, denoVersion: "2" };
Deno.test("etapa vem do caminho sem guardar id", () => {
  assertEquals(stageFromUrl("https://sefin.producaorestrita.nfse.gov.br/SefinNacional/dps/ABC123"), "dps_lookup");
  assertEquals(stageFromUrl("https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse/CHAVE"), "nfse_download");
  assertEquals(stageFromUrl("https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse"), "emit");
});
Deno.test("status HTTP classificados", () => {
  assertEquals(classifyStatus(200), "ok"); assertEquals(classifyStatus(302), "redirect_blocked");
  assertEquals(classifyStatus(403), "authorization_denied"); assertEquals(classifyStatus(404), "not_found");
  assertEquals(classifyStatus(503), "server_error"); assertEquals(classifyStatus(418), "unexpected_status");
});
Deno.test("exceções viram categorias sem mensagem bruta", () => {
  assertEquals(classifyHttpError({ code: "NFSE_MTLS_UNAVAILABLE" }), "mtls_unavailable");
  assertEquals(classifyHttpError({ code: "NFSE_REDIRECT_BLOCKED" }), "redirect_blocked");
  assertEquals(classifyHttpError({ name: "AbortError" }), "timeout");
  assertEquals(classifyHttpError(new Error("invalid peer certificate: UnknownIssuer")), "tls_error");
  assertEquals(classifyHttpError(new Error("connection reset")), "network_error");
});
Deno.test("2xx que não resolve vira formato inesperado; diagnóstico não tem campos sensíveis", () => {
  const d = finalizeDiagnostic({ stage: "dps_lookup", result: "ok", httpStatus: 200, runtime: R }, "reconciliation_unavailable")!;
  assertEquals(d.result, "unexpected_format");
  assertEquals(Object.keys(d).sort(), ["httpStatus", "result", "runtime", "stage"]);
});
