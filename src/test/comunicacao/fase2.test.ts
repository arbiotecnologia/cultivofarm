/**
 * Testes de comportamento — Fase 2 Comunicação (adapters e trigger de OS).
 * NENHUM teste realiza rede. Adapters são chamados com `fetch` injetado e
 * clientes Supabase são mocks locais.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sendWhatsapp } from "../../../supabase/functions/_shared/comunicacao/whatsapp-adapter.ts";
import { sendEmail } from "../../../supabase/functions/_shared/comunicacao/email-adapter.ts";
import { sendInApp } from "../../../supabase/functions/_shared/comunicacao/inapp-adapter.ts";
import type {
  AdapterSnapshot,
  ResolvedAddress,
  WorkerEnv,
} from "../../../supabase/functions/_shared/comunicacao/adapters-types.ts";

const ROOT = process.cwd();
const migrationSql = readFileSync(
  join(ROOT, "restoration/comunicacao-fase2/migration.sql"),
  "utf8",
);
const workerSrc = readFileSync(
  join(ROOT, "supabase/functions/process-communication-outbox/index.ts"),
  "utf8",
);
const healthSrc = readFileSync(
  join(ROOT, "supabase/functions/communication-health/index.ts"),
  "utf8",
);

// ----------------------------- Migration -----------------------------

describe("fase2 migration: trigger e RPCs", () => {
  it("triggers de OS disparam APENAS quando status muda para pronto_entrega", () => {
    expect(migrationSql).toMatch(/trg_comunicacao_os_pronto_retirada/);
    expect(migrationSql).toMatch(/trg_comunicacao_os_onfarm_pronto_retirada/);
    expect(migrationSql).toMatch(
      /NEW\.status IS DISTINCT FROM OLD\.status[\s\S]{0,100}pronto_entrega/,
    );
    expect(migrationSql).toMatch(/WHEN \(NEW\.status IS DISTINCT FROM OLD\.status\)/);
  });

  it("publish system NÃO é executável por authenticated", () => {
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\._comunicacao_publish_system_event[^;]*FROM PUBLIC, anon, authenticated/,
    );
  });

  it("expand event NÃO é executável por authenticated", () => {
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\._comunicacao_expand_event[^;]*FROM PUBLIC, anon, authenticated/,
    );
  });

  it("resolve_outbox_address é service_role-only", () => {
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.rpc_resolve_outbox_address[^;]*FROM PUBLIC, anon, authenticated/,
    );
    expect(migrationSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.rpc_resolve_outbox_address[^;]*TO service_role/,
    );
  });

  it("skip/cancel são service_role-only", () => {
    for (const fn of [
      "rpc_skip_communication_delivery",
      "rpc_cancel_communication_delivery",
    ]) {
      const re = new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${fn}[^;]*FROM PUBLIC, anon, authenticated`,
      );
      expect(migrationSql).toMatch(re);
    }
  });

  it("preview de broadcast exige administrador ou gestor", () => {
    expect(migrationSql).toMatch(/apenas administrador ou gestor/);
    expect(migrationSql).toMatch(/rpc_preview_administrative_broadcast_count/);
  });

  it("RPCs in_app secure são service_role-only (sem insert direto do worker)", () => {
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.rpc_create_portal_notification_secure[^;]*FROM PUBLIC, anon, authenticated/,
    );
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.rpc_create_operational_notification_secure[^;]*FROM PUBLIC, anon, authenticated/,
    );
  });

  it("metadados WhatsApp validados por CHECK", () => {
    expect(migrationSql).toMatch(/comunicacao_templates_whatsapp_meta_chk/);
    expect(migrationSql).toMatch(/comunicacao_templates_email_assunto_chk/);
    expect(migrationSql).toMatch(/comunicacao_templates_non_whatsapp_meta_chk/);
  });

  it("nenhum trigger para produto_pronto_aplicacao (permanece manual)", () => {
    expect(migrationSql).not.toMatch(/trg_comunicacao_os_pronto_aplicacao/);
    expect(migrationSql).not.toMatch(/produto_pronto_aplicacao[\s\S]{0,300}CREATE TRIGGER/);
  });
});

// ----------------------------- Worker -----------------------------

describe("fase2 worker: contratos e ausência de rede direta", () => {
  it("dry_run permanece quando DELIVERY_ENABLED=false", () => {
    expect(workerSrc).toMatch(/dry_run: true/);
    expect(workerSrc).toMatch(/env\.DELIVERY_ENABLED/);
    expect(workerSrc).toMatch(/if \(!env\.DELIVERY_ENABLED\)/);
  });

  it("worker não faz fetch direto — adapters cuidam disso", () => {
    // O arquivo worker não deve ter fetch() literal. Rede real só nos adapters.
    expect(workerSrc).not.toMatch(/\bfetch\s*\(/);
  });

  it("worker chama resolve_outbox_address antes de disparar adapter", () => {
    expect(workerSrc).toMatch(/rpc_resolve_outbox_address/);
    const idxResolve = workerSrc.indexOf("rpc_resolve_outbox_address");
    const idxDispatch = workerSrc.indexOf("await sendEmail(");
    expect(idxResolve).toBeGreaterThan(-1);
    expect(idxDispatch).toBeGreaterThan(idxResolve);
  });

  it("worker terminaliza com sent/skipped/cancelled/fail", () => {
    expect(workerSrc).toMatch(/rpc_complete_communication_delivery/);
    expect(workerSrc).toMatch(/rpc_skip_communication_delivery/);
    expect(workerSrc).toMatch(/rpc_cancel_communication_delivery/);
    expect(workerSrc).toMatch(/rpc_fail_communication_delivery/);
    expect(workerSrc).toMatch(/p_is_permanent/);
  });

  it("autorização por Bearer JWT (service role) ou secret exato, sem substring", () => {
    expect(workerSrc).not.toMatch(/\.includes\(/);
    expect(workerSrc).toMatch(/secret === INTERNAL_SECRET/);
    expect(workerSrc).toMatch(/token === SERVICE_KEY/);
  });
});

describe("fase2 health: apenas booleans, sem segredos", () => {
  it("edge function communication-health não expõe segredos", () => {
    expect(healthSrc).toMatch(/healthBooleans/);
    for (const s of ["SMTP_PASSWORD","WHATSAPP_ACCESS_TOKEN","INTERNAL_FUNCTION_SECRET","SUPABASE_SERVICE_ROLE_KEY"]) {
      // Referência para env é permitida; ecoar valor no response não.
      const re = new RegExp(`${s}[^\\n]*JSON`); // heurística grosseira
      expect(healthSrc).not.toMatch(re);
    }
    expect(healthSrc).toMatch(/administrador/);
  });
});

// ----------------------------- Adapters -----------------------------

const baseEnv = (over: Partial<WorkerEnv> = {}): WorkerEnv => ({
  DELIVERY_ENABLED: true,
  EMAIL_ENABLED: true,
  WHATSAPP_ENABLED: true,
  INAPP_ENABLED: true,
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USER: "u",
  SMTP_PASSWORD: "p",
  SMTP_FROM: "no-reply@example.com",
  WHATSAPP_ACCESS_TOKEN: "TEST_TOKEN",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_API_VERSION: "v20.0",
  ...over,
});

const waSnap: AdapterSnapshot = {
  canal: "whatsapp",
  assunto: null,
  corpo: "Olá {{nome}}, pedido {{codigo}} pronto",
  variaveis: ["nome","codigo"],
  provider_template_name: "produto_pronto_v1",
  language_code: "pt_BR",
  provider_template_status: "approved",
  parameter_mapping: [
    { index: 1, variavel: "nome", tipo: "text" },
    { index: 2, variavel: "codigo", tipo: "text" },
  ],
};

const resolvedWA = (address = "+5511998877665"): ResolvedAddress => ({
  ok: true, canal: "whatsapp", address, address_hash: "h", redacted: "+5511***65",
  user_id: null, cliente_id: null,
});

describe("whatsapp-adapter: envs OFF/faltantes", () => {
  it("provider_not_configured quando flag global OFF", async () => {
    const r = await sendWhatsapp(
      baseEnv({ DELIVERY_ENABLED: false }), resolvedWA(), waSnap, { corpo: "x" }, {},
    );
    expect(r.outcome).toBe("provider_not_configured");
    expect(r.code).toBe("whatsapp_disabled");
  });

  it("config inválida quando token ausente (deferred/provider_not_configured)", async () => {
    const r = await sendWhatsapp(
      baseEnv({ WHATSAPP_ACCESS_TOKEN: undefined }), resolvedWA(), waSnap, { corpo: "x" }, {},
    );
    // v2: config inválida pode ser deferred ou provider_not_configured; o código sinaliza a causa.
    expect(["deferred","provider_not_configured"]).toContain(r.outcome);
    expect(r.code).toMatch(/whatsapp_(missing_env|config_invalid)/);
  });
});

describe("whatsapp-adapter: envio simulado (fetch mock)", () => {
  it("envia com parâmetros ordenados por index e retorna provider_message_id", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};
    const fakeFetch: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ messages: [{ id: "wamid.XYZ" }] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    };
    const r = await sendWhatsapp(
      baseEnv(), resolvedWA("+5511998877665"), waSnap,
      { corpo: "x" }, { nome: "Ana", codigo: "OS-0001" },
      { fetch: fakeFetch, timeoutMs: 500 },
    );
    expect(r.outcome).toBe("sent");
    expect(r.provider_message_id).toBe("wamid.XYZ");
    expect(capturedUrl).toContain("/v20.0/1234567890/messages");
    // "to" sem "+"
    expect((capturedBody as { to: string }).to).toBe("5511998877665");
    const params = ((capturedBody as {
      template: { components: Array<{ parameters: Array<{ text: string }> }> };
    }).template.components[0].parameters);
    expect(params.map((p) => p.text)).toEqual(["Ana", "OS-0001"]);
  });

  it("HTTP 429 → transient_error (rate_limited)", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { code: 613, type: "rate" } }), { status: 429 });
    const r = await sendWhatsapp(
      baseEnv(), resolvedWA(), waSnap, { corpo: "x" }, { nome: "a", codigo: "b" },
      { fetch: fakeFetch },
    );
    expect(r.outcome).toBe("transient_error");
    expect(r.code).toBe("whatsapp_rate_limited");
  });

  it("HTTP 401 → permanent_error e não vaza token", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { code: 190, type: "OAuthException", message: "Token expired" } }), { status: 401 });
    const r = await sendWhatsapp(
      baseEnv(), resolvedWA(), waSnap, { corpo: "x" }, { nome: "a", codigo: "b" },
      { fetch: fakeFetch },
    );
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("whatsapp_401");
    expect(r.message).not.toContain("TEST_TOKEN");
  });

  it("HTTP 5xx → transient_error", async () => {
    const fakeFetch: typeof fetch = async () => new Response("", { status: 502 });
    const r = await sendWhatsapp(baseEnv(), resolvedWA(), waSnap, { corpo: "x" }, { nome: "a", codigo: "b" }, { fetch: fakeFetch });
    expect(r.outcome).toBe("transient_error");
    expect(r.code).toBe("whatsapp_5xx");
  });

  it("template sem metadados → permanent_error", async () => {
    const snap = { ...waSnap, provider_template_name: null };
    const r = await sendWhatsapp(baseEnv(), resolvedWA(), snap, { corpo: "x" }, {}, {});
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("wa_template_meta_missing");
  });

  it("endereço não-E.164 → invalid_recipient", async () => {
    const bad: ResolvedAddress = { ok: true, canal: "whatsapp", address: "011998877665" };
    const r = await sendWhatsapp(baseEnv(), bad, waSnap, { corpo: "x" }, {}, {});
    expect(r.outcome).toBe("invalid_recipient");
    expect(r.code).toBe("invalid_e164");
  });

  it("timeout de fetch → transient_error (whatsapp_timeout)", async () => {
    const fakeFetch: typeof fetch = (_url, init) =>
      new Promise<Response>((_res, rej) => {
        (init as RequestInit).signal!.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          rej(err);
        });
      });
    const r = await sendWhatsapp(
      baseEnv(), resolvedWA(), waSnap, { corpo: "x" }, { nome: "a", codigo: "b" },
      { fetch: fakeFetch, timeoutMs: 5 },
    );
    expect(r.outcome).toBe("transient_error");
    expect(r.code).toBe("whatsapp_timeout");
  });
});

describe("email-adapter: gates", () => {
  const emailSnap: AdapterSnapshot = {
    canal: "email", assunto: "Assunto", corpo: "Corpo", variaveis: [],
  };
  const resolvedEmail: ResolvedAddress = {
    ok: true, canal: "email", address: "user@example.com",
  };

  it("provider_not_configured quando flag OFF", async () => {
    const r = await sendEmail(
      baseEnv({ EMAIL_ENABLED: false }), resolvedEmail, emailSnap, { assunto: "S", corpo: "x" },
    );
    expect(r.outcome).toBe("provider_not_configured");
  });

  it("config inválida quando SMTP_HOST ausente (deferred/provider_not_configured)", async () => {
    const r = await sendEmail(
      baseEnv({ SMTP_HOST: undefined }), resolvedEmail, emailSnap, { assunto: "S", corpo: "x" },
    );
    expect(["deferred","provider_not_configured"]).toContain(r.outcome);
    expect(r.code).toMatch(/email_(missing_env|config_invalid)/);
  });

  it("email sem assunto → permanent_error", async () => {
    const snap = { ...emailSnap, assunto: null };
    const r = await sendEmail(baseEnv(), resolvedEmail, snap, { corpo: "x" });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("email_missing_subject");
  });

  it("endereço ausente → invalid_recipient", async () => {
    const r = await sendEmail(
      baseEnv(), { ok: true, canal: "email", address: undefined },
      emailSnap, { assunto: "S", corpo: "x" },
    );
    expect(r.outcome).toBe("invalid_recipient");
  });
});

describe("inapp-adapter", () => {
  it("provider_not_configured quando flag OFF", async () => {
    const r = await sendInApp(
      baseEnv({ INAPP_ENABLED: false }),
      { ok: true, canal: "in_app", cliente_id: "c1" },
      { corpo: "hi" },
      { rpc: async () => ({ data: null, error: null }) },
    );
    expect(r.outcome).toBe("provider_not_configured");
  });

  it("cliente_id → rpc_dispatch_inapp_notification (idempotente por outbox)", async () => {
    let name = ""; let args: Record<string, unknown> = {};
    const r = await sendInApp(
      baseEnv(),
      { ok: true, canal: "in_app", cliente_id: "cli-1" },
      { assunto: "Pronto para retirada", corpo: "Corpo" },
      { rpc: async (n, a) => { name = n; args = a; return { data: { notification_id: "n-1" }, error: null }; } },
      "00000000-0000-0000-0000-0000000000aa",
    );
    expect(name).toBe("rpc_dispatch_inapp_notification");
    expect((args as { p_cliente_id?: string }).p_cliente_id).toBe("cli-1");
    expect(r.outcome).toBe("sent");
    expect(r.provider_message_id).toBe("n-1");
  });

  it("user_id → rpc_dispatch_inapp_notification (operacional)", async () => {
    let name = ""; let args: Record<string, unknown> = {};
    const r = await sendInApp(
      baseEnv(),
      { ok: true, canal: "in_app", user_id: "u-1" },
      { corpo: "Corpo" },
      { rpc: async (n, a) => { name = n; args = a; return { data: { notification_id: "op-1" }, error: null }; } },
      "00000000-0000-0000-0000-0000000000bb",
    );
    expect(name).toBe("rpc_dispatch_inapp_notification");
    expect((args as { p_user_id?: string }).p_user_id).toBe("u-1");
    expect(r.outcome).toBe("sent");
  });

  it("erro de privilege → permanent_error", async () => {
    const r = await sendInApp(
      baseEnv(),
      { ok: true, canal: "in_app", user_id: "u-1" },
      { corpo: "x" },
      { rpc: async () => ({ data: null, error: { message: "insufficient_privilege" } }) },
    );
    expect(r.outcome).toBe("permanent_error");
  });
});

// ----------------------------- Flags e UI --------------------------------

describe("fase2 flags", () => {
  it("comunicacaoBroadcastTab default é false", async () => {
    const mod = await import("@/features/comunicacao/flags");
    expect(mod.isComunicacaoBroadcastTabEnabled()).toBe(false);
  });
});
