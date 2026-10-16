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
export const DEFAULT_SMTP_STEP_TIMEOUT_MS = 5_000;
const DEFAULT_ABSOLUTE_TIMEOUT_MS = 20_000;
const encoder = new TextEncoder();

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

/** Writes one entire buffer under one deadline; never resumes after timeout. */
export async function writeSmtpBytes(connection: ProbeConnection, bytes: Uint8Array, timeoutMs: number, stage: SmtpProbeStage): Promise<number> {
  let expired=false;
  const work=async()=>{
    let offset=0;
    while(offset<bytes.length){
      if(expired)throw createSmtpProbeFailure("smtp_protocol_error",stage);
      const count=await connection.write(bytes.subarray(offset));
      if(!Number.isInteger(count) || count<=0 || count>bytes.length-offset)throw createSmtpProbeFailure("smtp_protocol_error",stage);
      offset+=count;
    }
    return offset;
  };
  try{return await withTimeout(work(),timeoutMs,stage,()=>{expired=true;connection.close();});}
  catch(error){expired=true;try{connection.close();}catch{/* best effort */}throw classifyError(error,stage);}
}
export async function writeSmtpCommand(connection: ProbeConnection, command: string, timeoutMs: number, stage: SmtpProbeStage) {
  await writeSmtpBytes(connection,encoder.encode(`${command}\r\n`),timeoutMs,stage);
}

const responseRemainders=new WeakMap<ProbeConnection,string>();
export async function readSmtpResponse(connection: ProbeConnection, timeoutMs: number, stage: SmtpProbeStage): Promise<{status:number;lines:string[]}> {
  let expired=false;
  const work=async()=>{
    let raw=responseRemainders.get(connection) ?? "";
    responseRemainders.delete(connection);
    const lines:string[]=[];
    let status:number|undefined;
    let total=0;
    const decode=new TextDecoder("utf-8",{fatal:true});
    while(!expired){
      let end:number;
      while((end=raw.indexOf("\r\n"))>=0){
        const line=raw.slice(0,end);raw=raw.slice(end+2);
        total+=encoder.encode(line).byteLength+2;
        const match=/^([2-5]\d{2})([- ])[^\r\n]*$/.exec(line);
        if(!match || total>MAX_RESPONSE_BYTES || lines.length>=MAX_RESPONSE_LINES)throw createSmtpProbeFailure("smtp_protocol_error",stage);
        const next=Number(match[1]);
        if(status!==undefined && next!==status)throw createSmtpProbeFailure("smtp_protocol_error",stage);
        status=next;lines.push(line);
        if(match[2]===" "){
          if(raw.length)responseRemainders.set(connection,raw);
          return {status,lines};
        }
      }
      if(total+encoder.encode(raw).byteLength>MAX_RESPONSE_BYTES || /(?<!\r)\n/.test(raw))throw createSmtpProbeFailure("smtp_protocol_error",stage);
      const chunk=new Uint8Array(1024);
      const count=await connection.read(chunk);
      if(expired)throw createSmtpProbeFailure("smtp_protocol_error",stage);
      if(count===null || !Number.isInteger(count) || count<=0 || count>chunk.length)throw createSmtpProbeFailure("smtp_protocol_error",stage);
      raw+=decode.decode(chunk.subarray(0,count),{stream:true});
    }
    throw createSmtpProbeFailure("smtp_protocol_error",stage);
  };
  try{return await withTimeout(work(),timeoutMs,stage,()=>{expired=true;responseRemainders.delete(connection);connection.close();});}
  catch(error){expired=true;responseRemainders.delete(connection);try{connection.close();}catch{/* best effort */}throw classifyError(error,stage);}
}

/** A timed-out connection/upgrade owns and closes any eventual returned socket. */
async function openBounded(promise:Promise<ProbeConnection>,timeoutMs:number,stage:SmtpProbeStage,prior?:ProbeConnection):Promise<ProbeConnection>{
  let expired=false;
  const guarded=promise.then(socket=>{if(expired){try{socket.close();}catch{/* best effort */}throw createSmtpProbeFailure("smtp_connect_timeout",stage);}return socket;});
  try{return await withTimeout(guarded,timeoutMs,stage,()=>{expired=true;prior?.close();});}
  catch(error){expired=true;try{prior?.close();}catch{/* best effort */}throw error;}
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

export async function authenticateSmtpSession(
  connection: ProbeConnection,
  mechanisms: Set<string>,
  user: string,
  password: string,
  timeoutMs: number,
) {
  if (mechanisms.has("PLAIN")) {
    await writeSmtpCommand(connection, `AUTH PLAIN ${base64(`\0${user}\0${password}`)}`, timeoutMs, "auth");
    const response = await readSmtpResponse(connection, timeoutMs, "auth");
    if (response.status !== 235) throw createSmtpProbeFailure("smtp_auth_failed", "auth");
    return;
  }
  if (mechanisms.has("LOGIN")) {
    await writeSmtpCommand(connection, "AUTH LOGIN", timeoutMs, "auth");
    if ((await readSmtpResponse(connection, timeoutMs, "auth")).status !== 334) throw createSmtpProbeFailure("smtp_auth_failed", "auth");
    await writeSmtpCommand(connection, base64(user), timeoutMs, "auth");
    if ((await readSmtpResponse(connection, timeoutMs, "auth")).status !== 334) throw createSmtpProbeFailure("smtp_auth_failed", "auth");
    await writeSmtpCommand(connection, base64(password), timeoutMs, "auth");
    if ((await readSmtpResponse(connection, timeoutMs, "auth")).status !== 235) throw createSmtpProbeFailure("smtp_auth_failed", "auth");
    return;
  }
  throw createSmtpProbeFailure("smtp_auth_unsupported", "auth");
}

export interface AuthenticatedSmtpSession {
  connection: ProbeConnection;
  tls: boolean;
}

export async function openAuthenticatedSmtpSession(
  env: WorkerEnv,
  deps: SmtpProbeDeps,
  onStage?: (stage: SmtpProbeStage) => void,
  onConnection?: (connection: ProbeConnection) => void,
): Promise<AuthenticatedSmtpSession> {
  const configError = getSmtpConfigError(env);
  if (configError) throw createSmtpProbeFailure(configError === "email_config_invalid" ? "smtp_config_invalid" : configError, "connect");
  const hostname = env.SMTP_HOST ?? "";
  const port = Number(env.SMTP_PORT);
  const timeoutMs = deps.stepTimeoutMs ?? DEFAULT_SMTP_STEP_TIMEOUT_MS;
  let connection: ProbeConnection;
  let tls = port === 465;
  onStage?.("connect");
  connection = tls
    ? await openBounded(deps.connectTls(hostname, port), timeoutMs, "connect")
    : await openBounded(deps.connect(hostname, port), timeoutMs, "connect");
  try {
    onConnection?.(connection);
    onStage?.("greeting");
    if ((await readSmtpResponse(connection, timeoutMs, "greeting")).status !== 220) throw createSmtpProbeFailure("smtp_greeting_failed", "greeting");
    onStage?.("ehlo");
    await writeSmtpCommand(connection, "EHLO cultivofarm.local", timeoutMs, "ehlo");
    let ehlo = await readSmtpResponse(connection, timeoutMs, "ehlo");
    if (ehlo.status !== 250) throw createSmtpProbeFailure("smtp_ehlo_failed", "ehlo");
    let caps = capabilities(ehlo.lines);
    if (!tls) {
      onStage?.("starttls");
      if (!hasCapability(caps, "STARTTLS")) throw createSmtpProbeFailure("smtp_starttls_unavailable", "starttls");
      await writeSmtpCommand(connection, "STARTTLS", timeoutMs, "starttls");
      if ((await readSmtpResponse(connection, timeoutMs, "starttls")).status !== 220) throw createSmtpProbeFailure("smtp_starttls_failed", "starttls");
      connection = await openBounded(deps.startTls(connection, hostname), timeoutMs, "starttls",connection);
      onConnection?.(connection);
      tls = true;
      onStage?.("ehlo");
      await writeSmtpCommand(connection, "EHLO cultivofarm.local", timeoutMs, "ehlo");
      ehlo = await readSmtpResponse(connection, timeoutMs, "ehlo");
      if (ehlo.status !== 250) throw createSmtpProbeFailure("smtp_ehlo_failed", "ehlo");
      caps = capabilities(ehlo.lines);
    }
    onStage?.("auth");
    await authenticateSmtpSession(connection, authMechanisms(caps), env.SMTP_USER ?? "", env.SMTP_PASSWORD ?? "", timeoutMs);
    return { connection, tls };
  } catch (error) {
    try { connection.close(); } catch { /* fechamento best-effort */ }
    throw error;
  }
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
  const stepTimeout = deps.stepTimeoutMs ?? DEFAULT_SMTP_STEP_TIMEOUT_MS;
  const absoluteTimeout = deps.absoluteTimeoutMs ?? DEFAULT_ABSOLUTE_TIMEOUT_MS;
  let connection: ProbeConnection | null = null;
  let tls = port === 465;
  let stage: SmtpProbeStage = "connect";
  let expired=false;

  const run = async (): Promise<SmtpProbeResult> => {
    try {
      try {
        const session = await openAuthenticatedSmtpSession(
          env,
          deps,
          (nextStage) => { stage = nextStage; },
          (openedConnection) => { connection = openedConnection;if(expired){openedConnection.close();throw createSmtpProbeFailure("smtp_connect_timeout",stage);} },
        );
        connection = session.connection;
        tls = session.tls;
      } catch (error) {
        throw classifyError(error, "connect");
      }

      stage = "quit";
      await writeSmtpCommand(connection, "QUIT", stepTimeout, stage);
      await readSmtpResponse(connection, stepTimeout, stage).catch(() => ({ status: 0, lines: [] }));
      return { ok: true, code: "smtp_connection_ok", stage, tls, authenticated: true, latency_ms: safeLatency(startedAt, now) };
    } catch (error) {
      const failure = classifyError(error, stage);
      return { ok: false, code: failure.code, stage: failure.stage, tls, authenticated: false, latency_ms: safeLatency(startedAt, now) };
    } finally {
      try { connection?.close(); } catch { /* fechamento best-effort */ }
    }
  };

  try {
    return await withTimeout(run(), absoluteTimeout, () => stage, () => {expired=true;connection?.close();});
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
