import { getSmtpConfigError, type WorkerEnv } from "./adapters-types.ts";

export type SmtpProbeStage = "connect" | "greeting" | "ehlo" | "starttls" | "auth" | "quit";
export type SmtpProbeCode =
  | "smtp_connection_ok"
  | "smtp_connect_timeout"
  | "smtp_connect_failed"
  | "smtp_tcp_refused"
  | "smtp_tcp_unreachable"
  | "smtp_dns_failed"
  | "smtp_tls_failed"
  | "smtp_tls_certificate_failed"
  | "smtp_tls_handshake_failed"
  | "smtp_greeting_failed"
  | "smtp_ehlo_failed"
  | "smtp_starttls_unavailable"
  | "smtp_starttls_failed"
  | "smtp_auth_unsupported"
  | "smtp_auth_failed"
  | "smtp_protocol_error"
  | "smtp_port_blocked_by_edge_runtime"
  | "smtp_config_invalid";

export type SmtpProbeResult = {
  ok: boolean;
  code: SmtpProbeCode;
  stage: SmtpProbeStage;
  tls: boolean;
  authenticated: boolean;
  latency_ms: number;
};

export interface ProbeConnection {
  read(buffer: Uint8Array): Promise<number | null>;
  write(buffer: Uint8Array): Promise<number>;
  close(): void;
}

export interface SmtpProbeDeps {
  connect(hostname: string, port: number): Promise<ProbeConnection>;
  connectTls(hostname: string, port: number): Promise<ProbeConnection>;
  startTls(connection: ProbeConnection, hostname: string): Promise<ProbeConnection>;
  now?: () => number;
  stepTimeoutMs?: number;
  absoluteTimeoutMs?: number;
}

const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_RESPONSE_LINES = 64;
const DEFAULT_STEP_TIMEOUT_MS = 5_000;
const DEFAULT_ABSOLUTE_TIMEOUT_MS = 20_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Erro especializado do Probe. Encapsula o código de erro e a etapa da falha.
 * Usa o campo 'cause' nativo do ES2022 para rastreabilidade sem vazar dados em instâncias simples.
 */
export class SmtpProbeFailure extends Error {
  constructor(public readonly code: SmtpProbeCode, public readonly stage: SmtpProbeStage) {
    super(code);
    this.name = "SmtpProbeFailure";
  }
}

export function createSmtpProbeFailure(code: SmtpProbeCode, stage: SmtpProbeStage): SmtpProbeFailure {
  return new SmtpProbeFailure(code, stage);
}

function classifyError(error: unknown, stage: SmtpProbeStage): SmtpProbeFailure {
  if (error instanceof SmtpProbeFailure) return error;
  return createSmtpProbeFailure(stage === "connect" ? "smtp_connect_failed" : "smtp_protocol_error", stage);
}

function safeLatency(startedAt: number, now: () => number): number {
  return Math.max(0, Math.min(300_000, Math.round(now() - startedAt)));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stage: SmtpProbeStage | (() => SmtpProbeStage),
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          try { onTimeout?.(); } catch { /* encerramento best-effort */ }
          const currentStage = typeof stage === "function" ? stage() : stage;
          reject(createSmtpProbeFailure("smtp_connect_timeout", currentStage));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    const currentStage = typeof stage === "function" ? stage() : stage;
    throw classifyError(error, currentStage);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function writeCommand(connection: ProbeConnection, command: string, timeoutMs: number, stage: SmtpProbeStage) {
  try {
    await withTimeout(connection.write(encoder.encode(`${command}\r\n`)), timeoutMs, stage);
  } catch (error) {
    throw classifyError(error, stage);
  }
}

async function readResponse(
  connection: ProbeConnection,
  timeoutMs: number,
  stage: SmtpProbeStage,
): Promise<{ status: number; lines: string[] }> {
  let raw = "";
  try {
    while (encoder.encode(raw).byteLength <= MAX_RESPONSE_BYTES) {
      const chunk = new Uint8Array(1024);
      const count = await withTimeout(connection.read(chunk), timeoutMs, stage);
      if (count === null) throw createSmtpProbeFailure("smtp_protocol_error", stage);
      raw += decoder.decode(chunk.subarray(0, count), { stream: true });
      const lines = raw.split(/\r?\n/).filter(Boolean);
      if (lines.length > MAX_RESPONSE_LINES) throw createSmtpProbeFailure("smtp_protocol_error", stage);
      const first = lines[0]?.match(/^(\d{3})([- ])/);
      if (!first) continue;
      const status = Number(first[1]);
      if (lines.some((line) => line.startsWith(`${first[1]} `))) return { status, lines };
    }
  } catch (error) {
    throw classifyError(error, stage);
  }
  throw createSmtpProbeFailure("smtp_protocol_error", stage);
}

function capabilities(lines: string[]): Set<string> {
  const caps = new Set<string>();
  for (const line of lines) {
    const value = line.replace(/^250[- ]/i, "").trim().toUpperCase();
    if (value) caps.add(value);
  }
  return caps;
}

function hasCapability(caps: Set<string>, capability: string): boolean {
  const target = capability.toUpperCase();
  return [...caps].some((value) => value === target || value.startsWith(`${target} `) || value.startsWith(`${target}=`));
}

function authMechanisms(caps: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const value of caps) {
    const match = value.match(/^AUTH(?:=|\s+)(.*)$/i);
    if (match) for (const mechanism of match[1].split(/\s+/)) result.add(mechanism.toUpperCase());
  }
  return result;
}

function base64(value: string): string {
  const bytes = encoder.encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function authenticate(
  connection: ProbeConnection,
  mechanisms: Set<string>,
  user: string,
  password: string,
  timeoutMs: number,
) {
  if (mechanisms.has("PLAIN")) {
    await writeCommand(connection, `AUTH PLAIN ${base64(`\0${user}\0${password}`)}`, timeoutMs, "auth");
    const response = await readResponse(connection, timeoutMs, "auth");
    if (response.status !== 235) throw createSmtpProbeFailure("smtp_auth_failed", "auth");
    return;
  }
  if (mechanisms.has("LOGIN")) {
    await writeCommand(connection, "AUTH LOGIN", timeoutMs, "auth");
    if ((await readResponse(connection, timeoutMs, "auth")).status !== 334) throw createSmtpProbeFailure("smtp_auth_failed", "auth");
    await writeCommand(connection, base64(user), timeoutMs, "auth");
    if ((await readResponse(connection, timeoutMs, "auth")).status !== 334) throw createSmtpProbeFailure("smtp_auth_failed", "auth");
    await writeCommand(connection, base64(password), timeoutMs, "auth");
    if ((await readResponse(connection, timeoutMs, "auth")).status !== 235) throw createSmtpProbeFailure("smtp_auth_failed", "auth");
    return;
  }
  throw createSmtpProbeFailure("smtp_auth_unsupported", "auth");
}

export async function probeSmtpProvider(env: WorkerEnv, deps: SmtpProbeDeps): Promise<SmtpProbeResult> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const configError = getSmtpConfigError(env);
  if (configError) {
    return {
      ok: false,
      code: configError === "email_config_invalid" ? "smtp_config_invalid" : configError,
      stage: "connect",
      tls: false,
      authenticated: false,
      latency_ms: safeLatency(startedAt, now),
    };
  }

  const hostname = env.SMTP_HOST ?? "";
  const port = Number(env.SMTP_PORT);
  const stepTimeout = deps.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const absoluteTimeout = deps.absoluteTimeoutMs ?? DEFAULT_ABSOLUTE_TIMEOUT_MS;
  let connection: ProbeConnection | null = null;
  let tls = port === 465;
  let stage: SmtpProbeStage = "connect";

  const run = async (): Promise<SmtpProbeResult> => {
    try {
      try {
        connection = tls
          ? await withTimeout(deps.connectTls(hostname, port), stepTimeout, "connect")
          : await withTimeout(deps.connect(hostname, port), stepTimeout, "connect");
      } catch (error) {
        throw classifyError(error, "connect");
      }

      stage = "greeting";
      if ((await readResponse(connection, stepTimeout, stage)).status !== 220) {
        throw createSmtpProbeFailure("smtp_greeting_failed", stage);
      }

      stage = "ehlo";
      await writeCommand(connection, "EHLO cultivofarm.local", stepTimeout, stage);
      let ehlo = await readResponse(connection, stepTimeout, stage);
      if (ehlo.status !== 250) throw createSmtpProbeFailure("smtp_ehlo_failed", stage);
      let caps = capabilities(ehlo.lines);

      if (!tls) {
        stage = "starttls";
        if (!hasCapability(caps, "STARTTLS")) throw createSmtpProbeFailure("smtp_starttls_unavailable", stage);
        await writeCommand(connection, "STARTTLS", stepTimeout, stage);
        if ((await readResponse(connection, stepTimeout, stage)).status !== 220) {
          throw createSmtpProbeFailure("smtp_starttls_failed", stage);
        }
        try {
          connection = await withTimeout(deps.startTls(connection, hostname), stepTimeout, stage);
          tls = true;
        } catch (error) {
          throw classifyError(error, "starttls");
        }
        stage = "ehlo";
        await writeCommand(connection, "EHLO cultivofarm.local", stepTimeout, stage);
        ehlo = await readResponse(connection, stepTimeout, stage);
        if (ehlo.status !== 250) throw createSmtpProbeFailure("smtp_ehlo_failed", stage);
        caps = capabilities(ehlo.lines);
      }

      stage = "auth";
      await authenticate(connection, authMechanisms(caps), env.SMTP_USER ?? "", env.SMTP_PASSWORD ?? "", stepTimeout);
      stage = "quit";
      await writeCommand(connection, "QUIT", stepTimeout, stage);
      await readResponse(connection, stepTimeout, stage).catch(() => ({ status: 0, lines: [] }));
      return { ok: true, code: "smtp_connection_ok", stage, tls, authenticated: true, latency_ms: safeLatency(startedAt, now) };
    } catch (error) {
      const failure = classifyError(error, stage);
      return { ok: false, code: failure.code, stage: failure.stage, tls, authenticated: false, latency_ms: safeLatency(startedAt, now) };
    } finally {
      try { connection?.close(); } catch { /* fechamento best-effort */ }
    }
  };

  try {
    return await withTimeout(run(), absoluteTimeout, () => stage, () => connection?.close());
  } catch (error) {
    const failure = classifyError(error, stage);
    return {
      ok: false,
      code: failure.code,
      stage: failure.stage,
      tls,
      authenticated: false,
      latency_ms: safeLatency(startedAt, now),
    };
  }
}
