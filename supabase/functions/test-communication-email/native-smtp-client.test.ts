import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createNativeSmtpClient,
  NativeSmtpAdapterFailure,
  type NativeSmtpDeps,
} from "../_shared/comunicacao/native-smtp-client.ts";
import type { ProbeConnection } from "../_shared/comunicacao/smtp-provider-probe.ts";

class ScriptedConnection implements ProbeConnection {
  readonly writes: string[] = [];
  closed = false;
  constructor(private readonly responses: Array<string | Error>) {}
  async read(buffer: Uint8Array): Promise<number | null> {
    const next = this.responses.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) return null;
    const bytes = new TextEncoder().encode(next);
    buffer.set(bytes);
    return bytes.length;
  }
  async write(buffer: Uint8Array): Promise<number> {
    this.writes.push(new TextDecoder().decode(buffer));
    return buffer.length;
  }
  close() { this.closed = true; }
}

function deps(connection: ProbeConnection, observed: { tls: number; plain: number }): NativeSmtpDeps {
  return {
    connect: async () => { observed.plain += 1; return connection; },
    connectTls: async () => { observed.tls += 1; return connection; },
    startTls: async () => connection,
  };
}

const config = { hostname: "smtp.example.test", port: 465, tls: true, auth: { username: "user", password: "secret" } };
const message = { from: "from@example.test", to: "to@example.test", subject: "Olá safra", content: ".linha\ntexto", html: "<p>Olá</p>" };

Deno.test("cliente nativo 465 usa TLS, AUTH PLAIN e envelope completo", async () => {
  const connection = new ScriptedConnection([
    "220 ready\r\n", "250-server\r\n250 AUTH PLAIN LOGIN\r\n", "235 ok\r\n",
    "250 sender ok\r\n", "251 forward\r\n", "354 continue\r\n", "250 accepted\r\n", "221 bye\r\n",
  ]);
  const observed = { tls: 0, plain: 0 };
  const client = await createNativeSmtpClient(config, deps(connection, observed));
  await client.send(message);
  await client.close();
  assertEquals(observed, { tls: 1, plain: 0 });
  const transcript = connection.writes.join("");
  assertStringIncludes(transcript, "EHLO cultivofarm.local\r\n");
  assertStringIncludes(transcript, "AUTH PLAIN ");
  assertStringIncludes(transcript, "MAIL FROM:<from@example.test>\r\nRCPT TO:<to@example.test>\r\nDATA\r\n");
  assertStringIncludes(transcript, "Subject: =?UTF-8?B?");
  assertStringIncludes(transcript, "Content-Type: multipart/alternative;");
  assertStringIncludes(transcript, "\r\n..linha\r\ntexto\r\n");
  assertStringIncludes(transcript, "Content-Transfer-Encoding: quoted-printable");
  assertStringIncludes(transcript, "\r\n.\r\n");
  assertEquals(connection.closed, true);
});

Deno.test("cliente nativo usa fallback AUTH LOGIN", async () => {
  const connection = new ScriptedConnection([
    "220 ready\r\n", "250-server\r\n250 AUTH LOGIN\r\n", "334 user\r\n", "334 password\r\n", "235 ok\r\n", "221 bye\r\n",
  ]);
  const observed = { tls: 0, plain: 0 };
  const client = await createNativeSmtpClient(config, deps(connection, observed));
  await client.close();
  assertStringIncludes(connection.writes.join(""), "AUTH LOGIN\r\n");
});

Deno.test("comandos SMTP 4xx e 5xx são definitivos antes do corpo", async () => {
  for (const [response, code, outcome] of [
    ["451 later\r\n", "email_smtp_4xx", "transient_error"],
    ["550 denied\r\n", "email_smtp_5xx", "permanent_error"],
  ] as const) {
    const connection = new ScriptedConnection(["220 ready\r\n", "250 AUTH PLAIN\r\n", "235 ok\r\n", response]);
    const client = await createNativeSmtpClient(config, deps(connection, { tls: 0, plain: 0 }));
    try { await client.send(message); throw new Error("expected failure"); }
    catch (error) {
      assertEquals(error instanceof NativeSmtpAdapterFailure, true);
      if (error instanceof NativeSmtpAdapterFailure) {
        assertEquals(error.code, code);
        assertEquals(error.outcome, outcome);
        assertEquals(error.certainty, "definitive");
      }
    } finally { await client.close(); }
    assertEquals(connection.closed, true);
  }
});

Deno.test("falha após início do corpo DATA é ambígua e socket fecha", async () => {
  const connection = new ScriptedConnection([
    "220 ready\r\n", "250 AUTH PLAIN\r\n", "235 ok\r\n", "250 sender\r\n", "250 recipient\r\n", "354 continue\r\n", new Error("connection reset PRIVATE"),
  ]);
  const client = await createNativeSmtpClient(config, deps(connection, { tls: 0, plain: 0 }));
  try { await client.send(message); throw new Error("expected failure"); }
  catch (error) {
    assertEquals(error instanceof NativeSmtpAdapterFailure, true);
    if (error instanceof NativeSmtpAdapterFailure) {
      assertEquals(error.code, "email_send_ambiguous");
      assertEquals(error.certainty, "ambiguous");
    }
  } finally { await client.close(); }
  assertEquals(connection.closed, true);
});

Deno.test("DATA exige 354 e resposta final 250", async () => {
  const connection = new ScriptedConnection([
    "220 ready\r\n", "250 AUTH PLAIN\r\n", "235 ok\r\n", "250 sender\r\n", "250 recipient\r\n", "550 no data\r\n", "221 bye\r\n",
  ]);
  const client = await createNativeSmtpClient(config, deps(connection, { tls: 0, plain: 0 }));
  try { await client.send(message); throw new Error("expected failure"); }
  catch (error) {
    assertEquals(error instanceof NativeSmtpAdapterFailure && error.code, "email_smtp_5xx");
  } finally { await client.close(); }
  assertEquals(connection.writes.some((value) => value.includes("Content-Type: multipart/alternative")), false);
});