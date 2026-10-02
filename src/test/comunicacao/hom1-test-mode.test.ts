/**
 * Homologação H2 — test mode + allowlists (fail-closed).
 * Nenhum teste faz rede; adapters recebem `fetch` mock que jamais é chamado
 * quando o gate bloqueia — validando ausência de vazamento de PII e chamadas.
 */
import { describe, it, expect } from "vitest";
import {
  isRecipientAllowedInTestMode,
  isTestModeEnabled,
  normalizeEmail,
  normalizePhoneE164,
  parseAllowlist,
  healthBooleans,
  type WorkerEnv,
} from "../../../supabase/functions/_shared/comunicacao/adapters-types.ts";
import { sendEmail } from "../../../supabase/functions/_shared/comunicacao/email-adapter.ts";
import { sendWhatsapp } from "../../../supabase/functions/_shared/comunicacao/whatsapp-adapter.ts";

const baseEnv: WorkerEnv = {
  DELIVERY_ENABLED: true,
  EMAIL_ENABLED: true,
  WHATSAPP_ENABLED: true,
  INAPP_ENABLED: false,
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "465",
  SMTP_USER: "user",
  SMTP_PASSWORD: "pw",
  SMTP_FROM: "no-reply@example.com",
  WHATSAPP_ACCESS_TOKEN: "TOKEN",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_API_VERSION: "v25.0",
};

describe("H2 · normalização", () => {
  it("normalizeEmail: lowercase + trim", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("normalizePhoneE164: só dígitos, prefixo +", () => {
    expect(normalizePhoneE164("+55 (11) 91234-5678")).toBe("+5511912345678");
    expect(normalizePhoneE164("5511912345678")).toBe("+5511912345678");
    expect(normalizePhoneE164("")).toBe("");
  });

  it("parseAllowlist: split multi-separador, dedup, normaliza", () => {
    expect(parseAllowlist("A@B.com, a@b.com; C@D.com", "email")).toEqual(["a@b.com", "c@d.com"]);
    expect(parseAllowlist("+5511912345678, 5511999998888", "phone"))
      .toEqual(["+5511912345678", "+5511999998888"]);
    expect(parseAllowlist(undefined, "email")).toEqual([]);
  });
});

describe("H2 · isTestModeEnabled", () => {
  it("desligado se undefined (WorkerEnv construído sem o campo)", () => {
    expect(isTestModeEnabled({ ...baseEnv, TEST_MODE_ENABLED: undefined })).toBe(false);
  });
  it("liga só com true explícito", () => {
    expect(isTestModeEnabled({ ...baseEnv, TEST_MODE_ENABLED: false })).toBe(false);
    expect(isTestModeEnabled({ ...baseEnv, TEST_MODE_ENABLED: true })).toBe(true);
  });
});

describe("H2 · gate isRecipientAllowedInTestMode", () => {
  it("test mode + lista vazia ⇒ bloqueia sempre", () => {
    const env = { ...baseEnv, TEST_MODE_ENABLED: true, TEST_ALLOWED_EMAILS: [] };
    const r = isRecipientAllowedInTestMode(env, "email", "anyone@x.com");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("test_mode_allowlist_empty");
  });

  it("test mode + endereço não permitido ⇒ bloqueia", () => {
    const env = { ...baseEnv, TEST_MODE_ENABLED: true, TEST_ALLOWED_EMAILS: ["ok@x.com"] };
    const r = isRecipientAllowedInTestMode(env, "email", "other@x.com");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("test_mode_not_allowlisted");
  });

  it("test mode + endereço permitido (case-insensitive) ⇒ libera", () => {
    const env = { ...baseEnv, TEST_MODE_ENABLED: true, TEST_ALLOWED_EMAILS: ["ok@x.com"] };
    expect(isRecipientAllowedInTestMode(env, "email", "OK@X.com").allowed).toBe(true);
  });

  it("test mode OFF ⇒ libera qualquer endereço", () => {
    const env = { ...baseEnv, TEST_MODE_ENABLED: false, TEST_ALLOWED_EMAILS: [] };
    expect(isRecipientAllowedInTestMode(env, "email", "anyone@x.com").allowed).toBe(true);
  });

  it("whatsapp: normaliza telefone antes do match", () => {
    const env = { ...baseEnv, TEST_MODE_ENABLED: true, TEST_ALLOWED_PHONES: ["+5511912345678"] };
    expect(isRecipientAllowedInTestMode(env, "whatsapp", "+55 (11) 91234-5678").allowed).toBe(true);
    expect(isRecipientAllowedInTestMode(env, "whatsapp", "+5511999998888").allowed).toBe(false);
  });
});

describe("H2 · adapters — gate bloqueia ANTES de rede/SMTP", () => {
  const snapshotEmail = {
    canal: "email" as const,
    assunto: "Assunto",
    corpo: "corpo",
    variaveis: [],
  };
  const rendered = { corpo: "corpo", assunto: "Assunto" };

  it("email: allowlist vazia ⇒ deferred, factory SMTP NUNCA chamada", async () => {
    let factoryCalled = false;
    const env: WorkerEnv = { ...baseEnv, TEST_MODE_ENABLED: true, TEST_ALLOWED_EMAILS: [] };
    const res = await sendEmail(
      env,
      { ok: true, canal: "email", address: "user@ext.com" },
      snapshotEmail,
      rendered,
      {
        smtpClientFactory: async () => {
          factoryCalled = true;
          return { send: async () => {}, close: async () => {} };
        },
      },
    );
    expect(factoryCalled).toBe(false);
    expect(res.outcome).toBe("deferred");
    expect(res.code).toBe("test_mode_allowlist_empty");
    expect(res.message).not.toContain("user@ext.com");
  });

  it("email: endereço fora da allowlist ⇒ deferred, sem PII no code/message", async () => {
    let factoryCalled = false;
    const env: WorkerEnv = {
      ...baseEnv,
      TEST_MODE_ENABLED: true,
      TEST_ALLOWED_EMAILS: ["ok@ok.com"],
    };
    const res = await sendEmail(
      env,
      { ok: true, canal: "email", address: "leaked@evil.com" },
      snapshotEmail,
      rendered,
      {
        smtpClientFactory: async () => {
          factoryCalled = true;
          return { send: async () => {}, close: async () => {} };
        },
      },
    );
    expect(factoryCalled).toBe(false);
    expect(res.outcome).toBe("deferred");
    expect(res.code).toBe("test_mode_not_allowlisted");
    expect(res.message).not.toContain("leaked@evil.com");
    expect(res.code).not.toContain("@");
  });

  it("whatsapp: allowlist vazia ⇒ deferred, fetch NUNCA chamado", async () => {
    let fetchCalled = false;
    const env: WorkerEnv = { ...baseEnv, TEST_MODE_ENABLED: true, TEST_ALLOWED_PHONES: [] };
    const res = await sendWhatsapp(
      env,
      { ok: true, canal: "whatsapp", address: "+5511912345678" },
      {
        canal: "whatsapp",
        corpo: "x",
        variaveis: [],
        provider_template_name: "tpl",
        language_code: "pt_BR",
        parameter_mapping: [],
        provider_template_status: "approved",
      },
      rendered,
      {},
      { fetch: (async () => { fetchCalled = true; return new Response("{}"); }) as typeof fetch },
    );
    expect(fetchCalled).toBe(false);
    expect(res.outcome).toBe("deferred");
    expect(res.code).toBe("test_mode_allowlist_empty");
    expect(res.message).not.toMatch(/\+?\d{8,}/);
  });

  it("delivery flag OFF ⇒ provider_not_configured antes até do gate", async () => {
    const env: WorkerEnv = { ...baseEnv, DELIVERY_ENABLED: false, TEST_MODE_ENABLED: true, TEST_ALLOWED_EMAILS: [] };
    const res = await sendEmail(
      env,
      { ok: true, canal: "email", address: "any@x.com" },
      snapshotEmail,
      rendered,
    );
    expect(res.outcome).toBe("provider_not_configured");
  });
});

describe("H2 · healthBooleans expõe test_mode sem valores", () => {
  it("inclui enabled + contagens, jamais endereços", () => {
    const env: WorkerEnv = {
      ...baseEnv,
      TEST_MODE_ENABLED: true,
      TEST_ALLOWED_EMAILS: ["a@b.com", "c@d.com"],
      TEST_ALLOWED_PHONES: ["+5511912345678"],
    };
    const h = healthBooleans(env);
    expect(h.test_mode).toEqual({
      enabled: true,
      allowlist_emails_count: 2,
      allowlist_phones_count: 1,
    });
    const serialized = JSON.stringify(h);
    expect(serialized).not.toContain("a@b.com");
    expect(serialized).not.toContain("5511912345678");
  });
});
