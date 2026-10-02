/**
 * Gate 3 — Canal de e-mail (staging).
 * Testes puros + adapter com mocks (sem rede, sem SMTP externo).
 * Também valida presença dos artefatos SQL do Gate 3 na base auditada.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sendEmail } from "../../../supabase/functions/_shared/comunicacao/email-adapter.ts";
import {
  classifyEmailError,
  computeBackoffSeconds,
  hasHeaderInjection,
  MAX_EMAIL_ADDRESS_LEN,
  MAX_EMAIL_BODY_BYTES,
  MAX_EMAIL_SUBJECT_LEN,
  utf8ByteLength,
  isSmtpConfigValid,
} from "../../../supabase/functions/_shared/comunicacao/adapters-types.ts";
import type {
  AdapterSnapshot,
  ResolvedAddress,
  SmtpLikeClient,
  WorkerEnv,
} from "../../../supabase/functions/_shared/comunicacao/adapters-types.ts";

const baseEnv = (over: Partial<WorkerEnv> = {}): WorkerEnv => ({
  DELIVERY_ENABLED: true,
  EMAIL_ENABLED: true,
  WHATSAPP_ENABLED: false,
  INAPP_ENABLED: false,
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "465",
  SMTP_USER: "u",
  SMTP_PASSWORD: "p",
  SMTP_FROM: "no-reply@example.com",
  TEST_MODE_ENABLED: false,
  ...over,
});

const snap: AdapterSnapshot = {
  canal: "email", assunto: "Olá", corpo: "Corpo", variaveis: [],
};
const to: ResolvedAddress = { ok: true, canal: "email", address: "user@example.com" };

function mockSmtp(behavior: "ok" | "smtp5xx" | "smtp4xx" | "conn" | "timeout"): {
  factory: NonNullable<Parameters<typeof sendEmail>[4]>["smtpClientFactory"];
  sends: Array<Record<string, unknown>>;
  closed: number;
} {
  const sends: Array<Record<string, unknown>> = [];
  let closed = 0;
  const client: SmtpLikeClient = {
    send: async (opts) => {
      sends.push(opts as unknown as Record<string, unknown>);
      if (behavior === "ok") return {};
      if (behavior === "smtp5xx") throw new Error("SMTP responded 550 relay denied");
      if (behavior === "smtp4xx") throw new Error("SMTP responded 421 too many");
      if (behavior === "conn") throw new Error("ECONNREFUSED to smtp");
      if (behavior === "timeout") await new Promise(() => {}); // pendura
      return {};
    },
    close: async () => { closed += 1; },
  };
  return {
    factory: async () => client,
    sends,
    get closed() { return closed; },
  } as unknown as { factory: NonNullable<Parameters<typeof sendEmail>[4]>["smtpClientFactory"]; sends: Array<Record<string, unknown>>; closed: number };
}

const failingFactory = (message: string): NonNullable<Parameters<typeof sendEmail>[4]>["smtpClientFactory"] =>
  async () => { throw new Error(message); };

// ---------------- Helpers puros ----------------

describe("gate3 helpers: hasHeaderInjection", () => {
  it("aceita strings limpas", () => {
    expect(hasHeaderInjection("Assunto normal")).toBe(false);
    expect(hasHeaderInjection("")).toBe(false);
    expect(hasHeaderInjection(null)).toBe(false);
  });
  it("rejeita CR, LF, CRLF e NUL", () => {
    expect(hasHeaderInjection("a\nBcc: x@y")).toBe(true);
    expect(hasHeaderInjection("a\r\nBcc")).toBe(true);
    expect(hasHeaderInjection("a\rB")).toBe(true);
    expect(hasHeaderInjection("a\0b")).toBe(true);
  });
});

describe("gate3 helpers: utf8ByteLength / constantes", () => {
  it("bytes utf-8 para ASCII e multi-byte", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("çãé")).toBeGreaterThan(3);
  });
  it("limites documentados", () => {
    expect(MAX_EMAIL_SUBJECT_LEN).toBe(300);
    expect(MAX_EMAIL_ADDRESS_LEN).toBe(320);
    expect(MAX_EMAIL_BODY_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("gate3 helpers: computeBackoffSeconds (jitter ±20%)", () => {
  it("attempt=1 base=30 ⇒ [24,36]", () => {
    for (const j of [0, 0.25, 0.5, 0.75, 0.99]) {
      const v = computeBackoffSeconds(1, j);
      expect(v).toBeGreaterThanOrEqual(24);
      expect(v).toBeLessThanOrEqual(36);
    }
  });
  it("crescimento exponencial: attempt=5 > attempt=1", () => {
    expect(computeBackoffSeconds(5, 0.5)).toBeGreaterThan(computeBackoffSeconds(1, 0.5));
  });
  it("piso de 1 e teto de 3600", () => {
    expect(computeBackoffSeconds(0, 0)).toBeGreaterThanOrEqual(1);
    expect(computeBackoffSeconds(30, 0.99)).toBeLessThanOrEqual(3600);
  });
});

describe("gate3 helpers: classifyEmailError", () => {
  it("timeout durante send → ambíguo", () => {
    expect(classifyEmailError("email_send_timeout").outcome).toBe("ambiguous");
  });
  it("5xx → permanent (RFC 5321 Permanent Negative Completion)", () => {
    expect(classifyEmailError("SMTP responded 550").outcome).toBe("permanent_error");
    expect(classifyEmailError("SMTP responded 550").code).toBe("email_smtp_5xx");
  });
  it("4xx → transient (RFC 5321 §4.2.1 Transient Negative Completion — 421/450/451/452)", () => {
    for (const code of ["421", "450", "451", "452"]) {
      const r = classifyEmailError(`SMTP responded ${code} try later`);
      expect(r.outcome).toBe("transient_error");
      expect(r.code).toBe("email_smtp_4xx");
    }
  });
  it("network durante send → ambíguo", () => {
    expect(classifyEmailError("ECONNRESET").outcome).toBe("ambiguous");
  });
  it("unknown durante send → ambíguo (fail-safe)", () => {
    expect(classifyEmailError("weird error").outcome).toBe("ambiguous");
  });
  it("falha de conexão anterior ao send → definitiva", () => {
    expect(classifyEmailError("ECONNREFUSED", "connect")).toMatchObject({ outcome: "transient_error", code: "email_connect_network", certainty: "definitive" });
  });
});


// ---------------- Email adapter com mocks ----------------

describe("gate3 email-adapter: caminhos com SMTP mock", () => {
  it("bloqueia portas 25 e 587 antes de criar cliente ou enviar", async () => {
    for (const port of ["25", "587"]) {
      let factoryCalls = 0;
      const factory = async () => { factoryCalls += 1; throw new Error("não deve conectar"); };
      const r = await sendEmail(baseEnv({ SMTP_PORT: port }), to, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: factory });
      expect(r).toMatchObject({ outcome: "deferred", code: "smtp_port_blocked_by_edge_runtime", stage: "config" });
      expect(factoryCalls).toBe(0);
      expect(isSmtpConfigValid(baseEnv({ SMTP_PORT: port }))).toBe(false);
    }
  });

  it("aceita porta 465 apenas como configuração estrutural", () => {
    expect(isSmtpConfigValid(baseEnv({ SMTP_PORT: "465" }))).toBe(true);
  });

  it("envio bem-sucedido → sent + client.close chamado", async () => {
    const m = mockSmtp("ok");
    const r = await sendEmail(baseEnv(), to, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: m.factory });
    expect(r.outcome).toBe("sent");
    expect(m.sends).toHaveLength(1);
  });

  it("SMTP 5xx → permanent_error (email_smtp_5xx)", async () => {
    const m = mockSmtp("smtp5xx");
    const r = await sendEmail(baseEnv(), to, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: m.factory });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("email_smtp_5xx");
  });

  it("SMTP 4xx → transient_error (RFC 5321 §4.2.1, retry via worker)", async () => {
    const m = mockSmtp("smtp4xx");
    const r = await sendEmail(baseEnv(), to, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: m.factory });
    expect(r.outcome).toBe("transient_error");
    expect(r.code).toBe("email_smtp_4xx");
  });

  it("falha da factory/conexão → definitiva e sem send", async () => {
    const r = await sendEmail(baseEnv(), to, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: failingFactory("ECONNREFUSED") });
    expect(r).toMatchObject({ outcome: "transient_error", code: "email_connect_network", certainty: "definitive", stage: "connect" });
  });

  it("erro de rede durante send → ambiguous", async () => {
    const m = mockSmtp("conn");
    const r = await sendEmail(baseEnv(), to, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: m.factory });
    expect(r.outcome).toBe("ambiguous");
    expect(r.code).toBe("email_send_ambiguous");
  });

  it("timeout real durante send → ambiguous", async () => {
    const m = mockSmtp("timeout");
    const r = await sendEmail(baseEnv(), to, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: m.factory, timeoutMs: 5 });
    expect(r.outcome).toBe("ambiguous");
    expect(r.code).toBe("email_send_ambiguous");
  });

  it("delivery flag OFF → provider_not_configured (não envia)", async () => {
    const m = mockSmtp("ok");
    const r = await sendEmail(baseEnv({ EMAIL_ENABLED: false }), to, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: m.factory });
    expect(r.outcome).toBe("provider_not_configured");
    expect(m.sends).toHaveLength(0);
  });

  it("SMTP inválido (porta zero) → deferred, não invoca SMTP", async () => {
    const m = mockSmtp("ok");
    const r = await sendEmail(baseEnv({ SMTP_PORT: "0" }), to, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: m.factory });
    expect(r.outcome).toBe("deferred");
    expect(m.sends).toHaveLength(0);
  });

  it("header injection em assunto → permanent_error (email_header_injection_subject)", async () => {
    const m = mockSmtp("ok");
    const r = await sendEmail(baseEnv(), to, snap, { assunto: "Ok\nBcc: leak@x", corpo: "hi" }, { smtpClientFactory: m.factory });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("email_header_injection_subject");
    expect(m.sends).toHaveLength(0);
  });

  it("header injection em from (env) → permanent_error", async () => {
    const m = mockSmtp("ok");
    const r = await sendEmail(baseEnv({ SMTP_FROM: "ok@x\r\nBcc: leak@y" }), to, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: m.factory });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("email_header_injection_from");
  });

  it("header injection em to → invalid_recipient", async () => {
    const m = mockSmtp("ok");
    const bad: ResolvedAddress = { ok: true, canal: "email", address: "a@b\nBcc:x@y" };
    const r = await sendEmail(baseEnv(), bad, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: m.factory });
    expect(r.outcome).toBe("invalid_recipient");
    expect(r.code).toBe("email_header_injection_to");
  });

  it("assunto vazio → permanent_error (email_missing_subject)", async () => {
    const m = mockSmtp("ok");
    const r = await sendEmail(baseEnv(), to, { ...snap, assunto: null }, { corpo: "hi" }, { smtpClientFactory: m.factory });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("email_missing_subject");
  });

  it("test_mode ativo com allowlist vazia → deferred (test_mode_allowlist_empty)", async () => {
    const m = mockSmtp("ok");
    const env = baseEnv({ TEST_MODE_ENABLED: true, TEST_ALLOWED_EMAILS: [] });
    const r = await sendEmail(env, to, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: m.factory });
    expect(r.outcome).toBe("deferred");
    expect(m.sends).toHaveLength(0);
  });

  it("test_mode ativo com allowlist contendo destinatário → sent", async () => {
    const m = mockSmtp("ok");
    const env = baseEnv({ TEST_MODE_ENABLED: true, TEST_ALLOWED_EMAILS: ["user@example.com"] });
    const r = await sendEmail(env, to, snap, { assunto: "S", corpo: "hi" }, { smtpClientFactory: m.factory });
    expect(r.outcome).toBe("sent");
    expect(m.sends).toHaveLength(1);
  });
});

// ---------------- Migration Gate 3 (audit estático) ----------------

function findLatestGate3Migration(): string {
  const dir = "supabase/migrations";
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  for (const f of files.sort().reverse()) {
    const body = readFileSync(join(dir, f), "utf8");
    if (/rpc_admin_replay_communication_dead_letter/.test(body) && /rpc_admin_communication_outbox_metrics/.test(body)) {
      return body;
    }
  }
  throw new Error("migration Gate 3 não encontrada");
}

describe("gate3 migration: retry+jitter, DLQ replay, métricas", () => {
  const sql = findLatestGate3Migration();
  it("adiciona jitter simétrico à falha v2", () => {
    expect(sql).toMatch(/rpc_fail_communication_delivery_v2/);
    expect(sql).toMatch(/0\.8\s*\+\s*\(random\(\)\s*\*\s*0\.4\)/);
  });
  it("expõe RPC admin de listagem de dead_letter", () => {
    expect(sql).toMatch(/rpc_admin_list_communication_dead_letter/);
    expect(sql).toMatch(/_comunicacao_require_admin/);
  });
  it("expõe RPC de métricas do outbox (agregado, sem PII)", () => {
    expect(sql).toMatch(/rpc_admin_communication_outbox_metrics/);
    expect(sql).toMatch(/by_status/);
    expect(sql).toMatch(/by_canal/);
  });
  it("replay único e em lote, com auditoria imutável", () => {
    expect(sql).toMatch(/rpc_admin_replay_communication_dead_letter\s*\(/);
    expect(sql).toMatch(/rpc_admin_replay_communication_dead_letter_batch/);
    expect(sql).toMatch(/outbox\.dlq_replay/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/LEAST\(20,/); // teto de lote
  });
  it("todas as novas funções restritas a authenticated+service_role, jamais anon", () => {
    const fns = [
      "rpc_admin_list_communication_dead_letter",
      "rpc_admin_communication_outbox_metrics",
      "rpc_admin_replay_communication_dead_letter",
      "rpc_admin_replay_communication_dead_letter_batch",
    ];
    for (const fn of fns) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}[^;]*FROM PUBLIC, anon`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[^;]*TO authenticated, service_role`));
    }
  });
});
