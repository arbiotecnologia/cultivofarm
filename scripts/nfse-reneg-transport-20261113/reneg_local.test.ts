/**
 * Teste local (sem rede externa): openssl s_server sintético faz renegociação iniciada pelo
 * servidor APÓS a requisição (como o IIS da Sefin) pedindo certificado do cliente.
 * Usa o build `nfsetest` (única diferença: CA sintética acrescentada). Certificados em /tmp, efêmeros.
 * Rodar: deno test -A scripts/nfse-reneg-transport-20261113/reneg_local.test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { renegGet, parseHttp1 } from "../../supabase/functions/_shared/nfse/tlsreneg/renegTransport.ts";

const D = "/tmp/rn";
const wasm = Deno.readFileSync("/tmp/reneg_test.wasm");
const rd = (f: string) => Deno.readTextFileSync(`${D}/${f}`);
const DPS = "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/dps/DPS" + "1".repeat(42);
let port = 18440;

async function server(o: { cert?: string; key?: string; reneg?: boolean; extra?: string[]; response: string; noRenegSupport?: boolean }) {
  const p = ++port;
  const args = ["s_server", "-accept", String(p), "-cert", `${D}/${o.cert ?? "srv.pem"}`, "-key", `${D}/${o.key ?? "srv.key"}`, "-CAfile", `${D}/ca.pem`,
    "-tls1_2", "-msg", "-naccept", "1", ...(o.extra ?? [])];
  const cmd = new Deno.Command("openssl", { args, stdin: "piped", stdout: "piped", stderr: "piped" }).spawn();
  const w = cmd.stdin.getWriter(); const out: string[] = [];
  const dec = new TextDecoder(); let sawGet: () => void; const got = new Promise<void>((r) => sawGet = r);
  (async () => { for await (const c of cmd.stdout) { const s = dec.decode(c); out.push(s); if (out.join("").includes("GET /")) sawGet!(); } })();
  (async () => { for await (const _ of cmd.stderr) { /* drain */ } })();
  await new Promise((r) => setTimeout(r, 400));
  const drive = (async () => {
    await got;
    const enc = new TextEncoder();
    if (o.reneg !== false) { await w.write(enc.encode("R\n")); await new Promise((r) => setTimeout(r, 700)); }
    await w.write(enc.encode(o.response)); await new Promise((r) => setTimeout(r, 300));
    await w.write(enc.encode("Q\n"));
    try { await w.close(); } catch { /* noop */ }
  })();
  return { dial: () => Deno.connect({ hostname: "127.0.0.1", port: p }), done: async () => { await Promise.race([drive, new Promise((r) => setTimeout(r, 4000))]); try { cmd.kill(); } catch { /* */ } await cmd.status; return out.join(""); } };
}
const t = (dial: () => Promise<Deno.TcpConn>) => ({ dial, wasm, testCaPem: rd("ca.pem") });
const A1 = () => ({ certPem: rd("cli.pem"), keyPem: rd("cli.key") });
const JSON200 = 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 13\r\n\r\n{"x":"ok-01"}';

Deno.test("renegociação pós-requisição: A1 enviado só quando o servidor pede, cadeia/host válidos", async () => {
  const s = await server({ response: JSON200 });
  const r = await renegGet(DPS, A1(), 10_000, t(s.dial));
  const log = await s.done();
  assert(r.ok, JSON.stringify(r)); if (!r.ok) return;
  assertEquals(r.status, 200); assertEquals(r.body, '{"x":"ok-01"}');
  assertEquals(r.tls.version, "TLS1.2"); assert(r.tls.chainVerified); assert(r.tls.certRequested); assert(r.tls.clientCertSent);
  assert(r.tls.secureRenegotiation, "RFC 5746 ecoado no inicial"); assert(r.tls.certRequestedOnRenegotiation, "pedido de certificado veio na renegociação");
  assertEquals((log.match(/ClientHello/g) ?? []).length, 2);
  assert(/<<< TLS 1\.2, Handshake \[length [0-9a-f]+\], Certificate/.test(log), "servidor recebeu o certificado do cliente");
});
Deno.test("sem A1: certificado pedido, nenhum enviado (sem forjar)", async () => {
  const s = await server({ response: JSON200 });
  const r = await renegGet(DPS, null, 10_000, t(s.dial)); await s.done();
  assert(r.tls?.certRequested); assertEquals(r.tls?.clientCertSent, false);
});
Deno.test("hostname divergente é rejeitado", async () => {
  const s = await server({ cert: "bad.pem", key: "bad.key", reneg: false, response: JSON200 });
  const r = await renegGet(DPS, A1(), 10_000, t(s.dial)); await s.done();
  assertEquals(r.ok, false); if (!r.ok) assertEquals(r.code, "tls_hostname_mismatch");
});
Deno.test("CA desconhecida é rejeitada (build de produção, raízes Mozilla)", async () => {
  const s = await server({ reneg: false, response: JSON200 });
  const r = await renegGet(DPS, A1(), 10_000, { dial: s.dial, wasm: Deno.readFileSync("/tmp/reneg.wasm"), testCaPem: rd("ca.pem") }); await s.done();
  assertEquals(r.ok, false); if (!r.ok) assertEquals(r.code, "tls_unknown_issuer");
});
Deno.test("servidor com renegociação desabilitada não produz renegociação", async () => {
  // OpenSSL 3 sempre ecoa RFC 5746; a recusa por ausência da extensão é coberta pelos testes Go do sniffer (sniff_test.go).
  const s = await server({ extra: ["-no_renegotiation"], response: JSON200 });
  const r = await renegGet(DPS, A1(), 10_000, t(s.dial)); await s.done();
  assert(!r.ok || !r.tls.certRequestedOnRenegotiation, "servidor sem renegociação não pode ter pedido na renegociação");
});
Deno.test("URL fora do host/caminho oficial e POST-like são bloqueados antes de qualquer socket", async () => {
  let dialed = false; const dial = () => { dialed = true; return Deno.connect({ hostname: "127.0.0.1", port: 1 }); };
  for (const u of ["https://evil.example/API/SefinNacional/docs/index", "https://sefin.producaorestrita.nfse.gov.br:8443/API/SefinNacional/docs/index",
    "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse", "https://sefin.nfse.gov.br/SefinNacional/dps/DPS" + "1".repeat(42),
    "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/dps/../x", DPS + "?a=1"]) {
    const r = await renegGet(u, A1(), 1000, t(dial)); assertEquals(r.ok, false); if (!r.ok) assertEquals(r.code, "url_blocked");
  }
  assertEquals(dialed, false);
});
Deno.test("parser HTTP/1.1 estrito", () => {
  const e = new TextEncoder();
  const ok = parseHttp1(e.encode("HTTP/1.1 404 Not Found\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n0\r\n\r\n")); assert(!("error" in ok)); if (!("error" in ok)) { assertEquals(ok.status, 404); assertEquals(new TextDecoder().decode(ok.body), "abc"); }
  assertEquals(parseHttp1(e.encode("HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nabc")), { error: "http_incomplete" });
  assertEquals(parseHttp1(e.encode("HTTP/1.1 200 OK\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\na")), { error: "http_malformed" });
  assertEquals(parseHttp1(e.encode("<html>")), { error: "http_malformed" });
  assertEquals(parseHttp1(e.encode("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nab")), { error: "http_incomplete" });
});
