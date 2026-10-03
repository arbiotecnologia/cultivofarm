import {
  createSmtpProbeFailure,
  probeSmtpProvider,
  type ProbeConnection,
  type SmtpProbeDeps,
  type SmtpProbeCode,
  type SmtpProbeResult,
  type SmtpProbeStage,
} from "./smtp-provider-probe.ts";
import type { WorkerEnv } from "./adapters-types.ts";

type DenoSocket = ProbeConnection;
type NativeOperation = "connect" | "connectTls" | "startTls";

const DNS_NAMES = new Set(["NotFound", "DnsError"]);
const REFUSED_NAMES = new Set(["ConnectionRefused"]);
const UNREACHABLE_NAMES = new Set(["NetworkUnreachable", "HostUnreachable", "AddrNotAvailable"]);
const TIMEOUT_NAMES = new Set(["TimedOut", "TimeoutError"]);

function nativeErrorParts(error: unknown): { name: string; message: string } {
  if (!(error instanceof Error)) return { name: "", message: "" };
  return { name: error.name, message: error.message.toLowerCase().slice(0, 512) };
}

export function classifyNativeSmtpConnectionError(error: unknown, operation: NativeOperation): SmtpProbeCode {
  const { name, message } = nativeErrorParts(error);
  if (REFUSED_NAMES.has(name) || /connection refused|econnrefused/.test(message)) return "smtp_tcp_refused";
  if (UNREACHABLE_NAMES.has(name) || /network is unreachable|host is unreachable|address not available|enetunreach|ehostunreach|eaddrnotavail/.test(message)) return "smtp_tcp_unreachable";
  if (TIMEOUT_NAMES.has(name) || /timed out|timeout|etimedout/.test(message)) return "smtp_connect_timeout";
  if (DNS_NAMES.has(name) || /dns|name or service not known|nodename nor servname|temporary failure in name resolution|enotfound|eai_again/.test(message)) return "smtp_dns_failed";

  const tlsOperation = operation === "connectTls" || operation === "startTls";
  if (tlsOperation && /certificate|unknown issuer|cert(?:ificate)? verify|invalid peer certificate|self[- ]signed/.test(message)) {
    return "smtp_tls_certificate_failed";
  }
  if (tlsOperation && /tls|ssl|handshake|protocol version|unexpected eof|connection reset|econnreset/.test(message)) {
    return "smtp_tls_handshake_failed";
  }
  return operation === "connect" ? "smtp_connect_failed" : "smtp_tls_failed";
}

function normalizeNativeFailure(error: unknown, operation: NativeOperation, stage: SmtpProbeStage): never {
  throw createSmtpProbeFailure(classifyNativeSmtpConnectionError(error, operation), stage);
}

export function probeSmtpProviderInDeno(env: WorkerEnv): Promise<SmtpProbeResult> {
  return probeSmtpProvider(env, createDenoSmtpDeps());
}

export function createDenoSmtpDeps(): SmtpProbeDeps {
  return {
    connect: async (hostname, port) => {
      try { return await Deno.connect({ hostname, port, transport: "tcp" }) as DenoSocket; }
      catch (error) { return normalizeNativeFailure(error, "connect", "connect"); }
    },
    connectTls: async (hostname, port) => {
      try { return await Deno.connectTls({ hostname, port }) as DenoSocket; }
      catch (error) { return normalizeNativeFailure(error, "connectTls", "connect"); }
    },
    startTls: async (connection, hostname) => {
      try { return await Deno.startTls(connection as Deno.TcpConn, { hostname }) as DenoSocket; }
      catch (error) { return normalizeNativeFailure(error, "startTls", "starttls"); }
    },
  };
}
