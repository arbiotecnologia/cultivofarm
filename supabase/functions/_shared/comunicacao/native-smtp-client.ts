import type { AdapterCertainty, EmailAdapterStage, SmtpLikeClient, WorkerEnv } from "./adapters-types.ts";
import {
  DEFAULT_SMTP_STEP_TIMEOUT_MS,
  openAuthenticatedSmtpSession,
  readSmtpResponse,
  writeSmtpCommand,
  type ProbeConnection,
  type SmtpProbeDeps,
} from "./smtp-provider-probe.ts";
import { createDenoSmtpDeps } from "./smtp-provider-probe-deno.ts";

const encoder = new TextEncoder();

export class NativeSmtpAdapterFailure extends Error {
  constructor(
    public readonly code: string,
    public readonly certainty: AdapterCertainty,
    public readonly stage: EmailAdapterStage,
    public readonly outcome: "transient_error" | "permanent_error" | "ambiguous",
  ) {
    super(code);
    this.name = "NativeSmtpAdapterFailure";
  }
}

function normalizeCrlf(value: string): string {
  return value.replace(/\r\n|\r|\n/g, "\r\n");
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${btoa(String.fromCharCode(...encoder.encode(value)))}?=`;
}

function dotStuff(value: string): string {
  return normalizeCrlf(value).split("\r\n").map((line) => line.startsWith(".") ? `.${line}` : line).join("\r\n");
}

async function writeWithTimeout(connection: ProbeConnection, value: Uint8Array, timeoutMs: number): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      connection.write(value),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new NativeSmtpAdapterFailure("email_send_ambiguous", "ambiguous", "send", "ambiguous")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function quotedPrintable(value: string): string {
  const bytes = encoder.encode(normalizeCrlf(value));
  let line = "";
  const lines: string[] = [];
  const flush = () => { lines.push(line); line = ""; };
  for (const byte of bytes) {
    if (byte === 13) continue;
    if (byte === 10) { flush(); continue; }
    const token = (byte >= 33 && byte <= 60) || (byte >= 62 && byte <= 126)
      ? String.fromCharCode(byte)
      : `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    if (line.length + token.length > 72) { lines.push(`${line}=`); line = ""; }
    line += token;
  }
  flush();
  return dotStuff(lines.join("\r\n"));
}

export function buildNativeMimeMessage(opts: Parameters<SmtpLikeClient["send"]>[0]): string {
  const boundary = `cultivofarm-${crypto.randomUUID().replace(/-/g, "")}`;
  const plain = quotedPrintable(opts.content);
  const html = quotedPrintable(opts.html ?? `<pre>${opts.content}</pre>`);
  return [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    plain,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    html,
    `--${boundary}--`,
  ].join("\r\n");
}

function statusFailure(status: number): NativeSmtpAdapterFailure {
  if (status >= 500) return new NativeSmtpAdapterFailure("email_smtp_5xx", "definitive", "response", "permanent_error");
  if (status >= 400) return new NativeSmtpAdapterFailure("email_smtp_4xx", "definitive", "response", "transient_error");
  return new NativeSmtpAdapterFailure("email_smtp_protocol", "definitive", "response", "transient_error");
}

async function expectStatus(connection: ProbeConnection, allowed: number[], timeoutMs: number): Promise<void> {
  const response = await readSmtpResponse(connection, timeoutMs, "auth");
  if (!allowed.includes(response.status)) throw statusFailure(response.status);
}

export class NativeSmtpClient implements SmtpLikeClient {
  private bodyStarted = false;

  constructor(private readonly connection: ProbeConnection, private readonly timeoutMs = DEFAULT_SMTP_STEP_TIMEOUT_MS) {}

  async send(opts: Parameters<SmtpLikeClient["send"]>[0]): Promise<void> {
    try {
      await writeSmtpCommand(this.connection, `MAIL FROM:<${opts.from}>`, this.timeoutMs, "auth");
      await expectStatus(this.connection, [250], this.timeoutMs);
      await writeSmtpCommand(this.connection, `RCPT TO:<${opts.to}>`, this.timeoutMs, "auth");
      await expectStatus(this.connection, [250, 251], this.timeoutMs);
      await writeSmtpCommand(this.connection, "DATA", this.timeoutMs, "auth");
      await expectStatus(this.connection, [354], this.timeoutMs);
      this.bodyStarted = true;
      const payload = `${buildNativeMimeMessage(opts)}\r\n.\r\n`;
      await writeWithTimeout(this.connection, encoder.encode(payload), this.timeoutMs);
      await expectStatus(this.connection, [250], this.timeoutMs);
    } catch (error) {
      if (error instanceof NativeSmtpAdapterFailure) throw error;
      if (this.bodyStarted) throw new NativeSmtpAdapterFailure("email_send_ambiguous", "ambiguous", "send", "ambiguous");
      throw new NativeSmtpAdapterFailure("email_connect_network", "definitive", "connect", "transient_error");
    }
  }

  async close(): Promise<void> {
    try {
      await writeSmtpCommand(this.connection, "QUIT", this.timeoutMs, "quit");
      await readSmtpResponse(this.connection, this.timeoutMs, "quit").catch(() => undefined);
    } catch { /* fechamento best-effort */ }
    finally { try { this.connection.close(); } catch { /* fechamento best-effort */ } }
  }
}

export type NativeSmtpDeps = SmtpProbeDeps;

export async function createNativeSmtpClient(
  config: { hostname: string; port: number; tls: boolean; auth: { username: string; password: string } },
  deps?: NativeSmtpDeps,
): Promise<SmtpLikeClient> {
  const nativeDeps: SmtpProbeDeps = deps ?? createDenoSmtpDeps();
  const env: WorkerEnv = {
    DELIVERY_ENABLED: true, EMAIL_ENABLED: true, WHATSAPP_ENABLED: false, INAPP_ENABLED: false,
    SMTP_HOST: config.hostname, SMTP_PORT: String(config.port), SMTP_USER: config.auth.username,
    SMTP_PASSWORD: config.auth.password, SMTP_FROM: "validated-by-adapter",
  };
  try {
    const session = await openAuthenticatedSmtpSession(env, nativeDeps);
    return new NativeSmtpClient(session.connection, nativeDeps.stepTimeoutMs);
  } catch (error) {
    const code = error instanceof Error ? error.message : "smtp_connect_failed";
    throw new NativeSmtpAdapterFailure(
      code === "smtp_connect_timeout" ? "email_connect_timeout" : "email_connect_network",
      "definitive", "connect", "transient_error",
    );
  }
}