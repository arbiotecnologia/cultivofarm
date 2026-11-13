/**
 * GET de reconciliação NFS-e (somente HOMOLOGAÇÃO) com TLS 1.2 + renegociação segura RFC 5746.
 * O TLS é Go crypto/tls compilado para WASM (raízes Mozilla, cadeia + hostname verificados,
 * Renegotiation=OnceAsClient — Go exige renegotiation_info). O TCP é Deno.connect ao host fixo.
 * A1 só em memória do processo; nada de material, corpo ou URL é registrado. POST nunca passa aqui.
 */
import "./wasm_exec.js";
import { RENEG_WASM_GZ_B64, RENEG_WASM_SHA256 } from "./renegWasm.generated.ts";

export const RENEG_HOST = "sefin.producaorestrita.nfse.gov.br" as const;
const PATH = /^\/(API\/)?SefinNacional\/(dps\/DPS[0-9]{42}|nfse\/[0-9]{50}|docs\/index)$/;
const MAX_BODY = 6 * 1024 * 1024;

export const RENEG_CODES = new Set([
  "path_blocked", "client_cert_invalid", "config_blocked", "tcp_read_failed", "tcp_write_failed", "tls_unexpected_eof",
  "tls_unknown_issuer", "tls_hostname_mismatch", "tls_cert_expired", "tls_cert_invalid", "tls_alert_handshake_failure",
  "tls_alert_certificate_required", "tls_alert_unknown_ca", "tls_alert_no_renegotiation", "tls_alert_protocol_version",
  "tls_alert_other", "tls_record_invalid", "tls_insecure_renegotiation_refused", "tls_renegotiation_refused",
  "tls_cipher_mismatch", "tls_protocol_version", "tls_error_other", "response_too_large",
  "http_malformed", "http_incomplete", "timeout", "tcp_connect_failed", "wasm_unavailable", "url_blocked",
]);
export type RenegCode = string;
export interface RenegTlsInfo { version?: string; cipher?: string; alpn?: string; chainVerified?: boolean; certRequested: boolean; clientCertSent: boolean; certRequestedOnRenegotiation: boolean; secureRenegotiation: boolean }
export type RenegResult =
  | { ok: true; status: number; contentType: string | null; body: string; tls: RenegTlsInfo }
  | { ok: false; code: RenegCode; stage?: string; tls?: RenegTlsInfo };

type GoFn = (io: unknown, opts: Record<string, unknown>) => Promise<{ ok: boolean; code?: string; stage?: string; raw?: Uint8Array; truncatedEof?: boolean; tls: RenegTlsInfo }>;
let loading: Promise<GoFn> | null = null;

async function sha256(u: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", u as BufferSource))).map((b) => b.toString(16).padStart(2, "0")).join(""); }

/** Carrega o módulo (uma vez por isolate) e confere o SHA-256 do binário embutido. */
export function loadRenegModule(wasm?: Uint8Array): Promise<GoFn> {
  if (loading && !wasm) return loading;
  const p = (async () => {
    let bytes = wasm;
    if (!bytes) {
      const gz = Uint8Array.from(atob(RENEG_WASM_GZ_B64), (c) => c.charCodeAt(0));
      bytes = new Uint8Array(await new Response(new Blob([gz as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
      if (await sha256(bytes) !== RENEG_WASM_SHA256) throw new Error("wasm_integrity");
    }
    const G = (globalThis as unknown as { Go: new () => { importObject: WebAssembly.Imports; run(i: WebAssembly.Instance): Promise<void> } }).Go;
    const go = new G();
    const { instance } = await WebAssembly.instantiate(bytes as BufferSource, go.importObject);
    void go.run(instance);
    const fn = (globalThis as unknown as { __nfseRenegTls?: GoFn }).__nfseRenegTls;
    if (typeof fn !== "function") throw new Error("wasm_entry");
    return fn;
  })();
  if (!wasm) loading = p.catch((e) => { loading = null; throw e; });
  return p;
}

interface Socket { read(b: Uint8Array): Promise<number | null>; write(b: Uint8Array): Promise<number>; close(): void }
export type Dial = () => Promise<Socket>;
const officialDial: Dial = () => Deno.connect({ hostname: RENEG_HOST, port: 443, transport: "tcp" });

/** HTTP/1.1 estrito: status, cabeçalhos, Content-Length ou chunked completos; caso contrário erro. */
export function parseHttp1(raw: Uint8Array): { status: number; contentType: string | null; body: Uint8Array } | { error: "http_malformed" | "http_incomplete" | "response_too_large" } {
  const sep = indexOf(raw, [13, 10, 13, 10]);
  if (sep < 0) return { error: raw.length ? "http_malformed" : "http_incomplete" };
  const head = new TextDecoder("latin1").decode(raw.subarray(0, sep)).split("\r\n");
  const m = /^HTTP\/1\.[01] (\d{3})(?: .*)?$/.exec(head[0] ?? "");
  if (!m) return { error: "http_malformed" };
  const h = new Map<string, string>();
  for (const line of head.slice(1)) { const i = line.indexOf(":"); if (i <= 0) return { error: "http_malformed" }; const k = line.slice(0, i).trim().toLowerCase(); const v = line.slice(i + 1).trim(); if (h.has(k) && (k === "content-length" || k === "transfer-encoding")) return { error: "http_malformed" }; h.set(k, v); }
  const rest = raw.subarray(sep + 4);
  const te = h.get("transfer-encoding"); const cl = h.get("content-length");
  if (te && cl) return { error: "http_malformed" };
  let body: Uint8Array;
  if (te) {
    if (te.toLowerCase() !== "chunked") return { error: "http_malformed" };
    const parts: Uint8Array[] = []; let o = 0; let total = 0;
    for (;;) {
      const e = indexOf(rest, [13, 10], o); if (e < 0) return { error: "http_incomplete" };
      const sz = /^([0-9a-fA-F]{1,8})(;.*)?$/.exec(new TextDecoder("latin1").decode(rest.subarray(o, e))); if (!sz) return { error: "http_malformed" };
      const n = parseInt(sz[1], 16); o = e + 2;
      if (n === 0) break;
      if (rest.length < o + n + 2) return { error: "http_incomplete" };
      if (rest[o + n] !== 13 || rest[o + n + 1] !== 10) return { error: "http_malformed" };
      total += n; if (total > MAX_BODY) return { error: "response_too_large" };
      parts.push(rest.subarray(o, o + n)); o += n + 2;
    }
    body = new Uint8Array(total); let p = 0; for (const c of parts) { body.set(c, p); p += c.length; }
  } else if (cl !== undefined) {
    if (!/^\d{1,9}$/.test(cl)) return { error: "http_malformed" };
    const n = Number(cl); if (n > MAX_BODY) return { error: "response_too_large" };
    if (rest.length < n) return { error: "http_incomplete" };
    body = rest.subarray(0, n);
  } else {
    if (rest.length > MAX_BODY) return { error: "response_too_large" };
    body = rest; // delimitado pelo fechamento (Connection: close)
  }
  return { status: Number(m[1]), contentType: h.get("content-type") ?? null, body };
}
function indexOf(a: Uint8Array, pat: number[], from = 0) { outer: for (let i = from; i <= a.length - pat.length; i++) { for (let j = 0; j < pat.length; j++) if (a[i + j] !== pat[j]) continue outer; return i; } return -1; }

/**
 * GET único em URL oficial fixa de homologação. `testing` só existe para testes locais
 * (dial/módulo/CA sintéticos); o módulo de produção ignora a CA de teste.
 */
export async function renegGet(url: string, a1: { certPem: string; keyPem: string } | null, timeoutMs: number,
  testing?: { dial: Dial; wasm: Uint8Array; testCaPem: string }): Promise<RenegResult> {
  let u: URL; try { u = new URL(url); } catch { return { ok: false, code: "url_blocked" }; }
  if (u.protocol !== "https:" || u.host !== RENEG_HOST || u.port || u.username || u.password || u.search || u.hash || !PATH.test(u.pathname)) return { ok: false, code: "url_blocked" };
  let fn: GoFn; try { fn = await loadRenegModule(testing?.wasm); } catch { return { ok: false, code: "wasm_unavailable" }; }
  let sock: Socket; try { sock = await (testing?.dial ?? officialDial)(); } catch { return { ok: false, code: "tcp_connect_failed" }; }
  let timedOut = false; let closed = false;
  const close = () => { if (!closed) { closed = true; try { sock.close(); } catch { /* noop */ } } };
  const timer = setTimeout(() => { timedOut = true; close(); }, timeoutMs);
  const io = {
    async read() { if (closed) return null; const b = new Uint8Array(16384); try { const n = await sock.read(b); return n === null ? null : b.subarray(0, n); } catch (e) { if (closed) return null; throw e; } },
    async write(b: Uint8Array) { let o = 0; while (o < b.length) o += await sock.write(b.subarray(o)); },
    close,
  };
  try {
    const opts: Record<string, unknown> = { path: u.pathname };
    if (a1) { opts.certPem = a1.certPem; opts.keyPem = a1.keyPem; }
    if (testing) opts.testCaPem = testing.testCaPem;
    const r = await fn(io, opts);
    if (timedOut) return { ok: false, code: "timeout", tls: r.tls };
    if (!r.ok || !r.raw) return { ok: false, code: RENEG_CODES.has(r.code ?? "") ? r.code! : "tls_error_other", stage: r.stage, tls: r.tls };
    const p = parseHttp1(r.raw);
    if ("error" in p) return { ok: false, code: p.error, stage: "response", tls: r.tls };
    let body: string; try { body = new TextDecoder("utf-8", { fatal: true }).decode(p.body); } catch { return { ok: false, code: "http_malformed", stage: "response", tls: r.tls }; }
    return { ok: true, status: p.status, contentType: p.contentType, body, tls: r.tls };
  } finally { clearTimeout(timer); close(); }
}
