import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { probeSmtpProvider, type ProbeConnection } from "../_shared/comunicacao/smtp-provider-probe.ts";
import type { WorkerEnv } from "../_shared/comunicacao/adapters-types.ts";

const env = (port = "465"): WorkerEnv => ({
  DELIVERY_ENABLED: false, EMAIL_ENABLED: false, WHATSAPP_ENABLED: false, INAPP_ENABLED: false,
  SMTP_HOST: "smtp.invalid", SMTP_PORT: port, SMTP_USER: "operator", SMTP_PASSWORD: "secret-value",
  SMTP_FROM: "sender@example.invalid", WHATSAPP_WEBHOOK_ENABLED: false, TEST_MODE_ENABLED: true,
  TEST_ALLOWED_EMAILS: [], TEST_ALLOWED_PHONES: [],
});

class ScriptedConnection implements ProbeConnection {
  readonly writes: string[] = [];
  closed = false;
  constructor(private readonly responses: string[]) {}
  async read(buffer: Uint8Array): Promise<number | null> {
    const next = this.responses.shift();
    if (next === undefined) return null;
    const bytes = new TextEncoder().encode(next); buffer.set(bytes); return bytes.length;
  }
  async write(buffer: Uint8Array): Promise<number> { this.writes.push(new TextDecoder().decode(buffer)); return buffer.length; }
  close() { this.closed = true; }
}

Deno.test("probe 465 autentica com TLS implícito sem envelope nem conteúdo", async () => {
  const connection = new ScriptedConnection(["220 ready\r\n", "250-server\r\n250 AUTH PLAIN LOGIN\r\n", "235 authenticated\r\n", "221 bye\r\n"]);
  let plainOpened = false;
  const result = await probeSmtpProvider(env(), {
    connect: async () => { plainOpened = true; return connection; }, connectTls: async () => connection, startTls: async () => connection,
  });
  assertEquals(result.ok, true); assertEquals(result.tls, true); assertEquals(result.authenticated, true);
  assertEquals(plainOpened, false); assertEquals(connection.closed, true);
  const transcript = connection.writes.join("");
  assertStringIncludes(transcript, "EHLO cultivofarm.local"); assertStringIncludes(transcript, "AUTH PLAIN");
  assertEquals(/MAIL FROM|RCPT TO|DATA/i.test(transcript), false);
});

Deno.test("probe bloqueia portas incompatíveis antes de abrir socket", async () => {
  let sockets = 0; const connection = new ScriptedConnection([]);
  const result = await probeSmtpProvider(env("587"), {
    connect: async () => { sockets += 1; return connection; }, connectTls: async () => { sockets += 1; return connection; }, startTls: async () => connection,
  });
  assertEquals(result.code, "smtp_port_blocked_by_edge_runtime"); assertEquals(sockets, 0);
});

Deno.test("probe fecha socket quando autenticação é recusada", async () => {
  const connection = new ScriptedConnection(["220 ready\r\n", "250-server\r\n250 AUTH LOGIN\r\n", "334 username\r\n", "334 password\r\n", "535 denied\r\n"]);
  const result = await probeSmtpProvider(env(), { connect: async () => connection, connectTls: async () => connection, startTls: async () => connection });
  assertEquals(result.code, "smtp_auth_failed"); assertEquals(connection.closed, true);
  assertEquals(/MAIL FROM|RCPT TO|DATA/i.test(connection.writes.join("")), false);
});

Deno.test("probe exige STARTTLS antes de autenticar em porta permitida não implícita", async () => {
  const plain = new ScriptedConnection(["220 ready\r\n", "250-server\r\n250 STARTTLS\r\n", "220 go tls\r\n"]);
  const secure = new ScriptedConnection(["250-server\r\n250 AUTH PLAIN\r\n", "235 authenticated\r\n", "221 bye\r\n"]);
  let upgraded = false;
  const result = await probeSmtpProvider(env("2525"), {
    connect: async () => plain, connectTls: async () => secure, startTls: async () => { upgraded = true; return secure; },
  });
  assertEquals(result.ok, true); assertEquals(upgraded, true);
  assertEquals(plain.writes.some((value) => value.startsWith("AUTH")), false);
  assertEquals(secure.writes.some((value) => value.startsWith("AUTH")), true); assertEquals(secure.closed, true);
});