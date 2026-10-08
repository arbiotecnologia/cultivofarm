// Gate 4 · WhatsApp Cloud API — matriz de classificação sem rede.
// Cobre: adapter (403/401/404/400/429/5xx/timeout/rede/opt-out gate/template
// não aprovado/E.164/mapping/variáveis obrigatórias), classifier puro,
// migração admin de consentimento (auditoria estática).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyWhatsappHttpError,
  sendWhatsapp,
} from "../../../supabase/functions/_shared/comunicacao/whatsapp-adapter.ts";
import type {
  AdapterSnapshot,
  ResolvedAddress,
  WorkerEnv,
} from "../../../supabase/functions/_shared/comunicacao/adapters-types.ts";

const ROOT = resolve(__dirname, "../../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

function findMigration(needle: string): string {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files.reverse()) {
    const txt = readFileSync(resolve(MIG_DIR, f), "utf8");
    // Historical creation contract; current NOTIF-3 ACL is tested separately.
    if (txt.includes(`CREATE OR REPLACE FUNCTION public.${needle}(`)) return txt;
  }
  throw new Error(`migration com "${needle}" não encontrada`);
}

function baseEnv(over: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DELIVERY_ENABLED: true,
    EMAIL_ENABLED: false,
    WHATSAPP_ENABLED: true,
    INAPP_ENABLED: false,
    WHATSAPP_ACCESS_TOKEN: "TESTTOKEN",
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_API_VERSION: "v25.0",
    // test-mode OFF para permitir chegar ao mock fetch. Nenhum envio real ocorre.
    COMMUNICATION_TEST_MODE_ENABLED: false as unknown as boolean,
    ...over,
  } as WorkerEnv;
}

const snapshotApproved: AdapterSnapshot = {
  canal: "whatsapp",
  corpo: "hi {{nome}}",
  variaveis: ["nome"],
  provider_template_name: "hello_world",
  language_code: "pt_BR",
  parameter_mapping: [{ index: 1, variavel: "nome" }],
  provider_template_status: "approved",
};

const resolved: ResolvedAddress = { ok: true, canal: "whatsapp", address: "+5511999998888" };

function mockFetch(status: number, body: unknown = {}): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("Gate 4 · classifyWhatsappHttpError (puro, sem rede)", () => {
  it("429 → transient_error/whatsapp_rate_limited", () => {
    const r = classifyWhatsappHttpError(429);
    expect(r.outcome).toBe("transient_error");
    expect(r.code).toBe("whatsapp_rate_limited");
  });
  it("500/502/503/504 → transient_error/whatsapp_5xx", () => {
    for (const s of [500, 502, 503, 504]) {
      const r = classifyWhatsappHttpError(s);
      expect(r.outcome).toBe("transient_error");
      expect(r.code).toBe("whatsapp_5xx");
    }
  });
  it("401/403 → permanent_error/whatsapp_auth (credencial inválida ou conta suspensa)", () => {
    for (const s of [401, 403]) {
      const r = classifyWhatsappHttpError(s, { code: 190, type: "OAuthException" });
      expect(r.outcome).toBe("permanent_error");
      expect(r.code).toBe("whatsapp_auth");
      // Nunca inclui token nem número no message.
      expect(r.message).not.toMatch(/TESTTOKEN|55119/);
    }
  });
  it("404 → permanent_error/whatsapp_not_found (template ou phone_id inexistente)", () => {
    const r = classifyWhatsappHttpError(404, { code: 132001, type: "template" });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("whatsapp_not_found");
  });
  it("400 → permanent_error/whatsapp_bad_request (payload/template/param inválido)", () => {
    const r = classifyWhatsappHttpError(400, { code: 131009, type: "GraphMethodException" });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("whatsapp_bad_request");
  });
  it("outros 4xx → permanent_error/whatsapp_<status>", () => {
    const r = classifyWhatsappHttpError(422, { code: 131000 });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("whatsapp_422");
  });
});

describe("Gate 4 · sendWhatsapp (mock fetch, sem rede real)", () => {
  it("sucesso: 200 + messages[0].id → outcome=sent, provider_message_id preservado", async () => {
    const fetchImpl = mockFetch(200, { messages: [{ id: "wamid.abc" }] });
    const r = await sendWhatsapp(baseEnv(), resolved, snapshotApproved, { corpo: "hi" }, { nome: "Ana" }, { fetch: fetchImpl });
    expect(r.outcome).toBe("sent");
    expect(r.provider_message_id).toBe("wamid.abc");
  });

  it("template não aprovado → permanent_error ANTES de qualquer rede", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
    const snap = { ...snapshotApproved, provider_template_status: "pending" };
    const r = await sendWhatsapp(baseEnv(), resolved, snap, { corpo: "" }, { nome: "Ana" }, { fetch: fetchImpl });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("wa_template_not_approved");
    expect(called).toBe(false);
  });

  it("E.164 inválido → invalid_recipient, sem rede", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
    const r = await sendWhatsapp(baseEnv(), { ok: true, canal: "whatsapp", address: "11999998888" }, snapshotApproved, { corpo: "" }, { nome: "Ana" }, { fetch: fetchImpl });
    expect(r.outcome).toBe("invalid_recipient");
    expect(r.code).toBe("invalid_e164");
    expect(called).toBe(false);
  });

  it("variável obrigatória ausente → permanent_error/wa_variable_missing, sem rede", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
    const r = await sendWhatsapp(baseEnv(), resolved, snapshotApproved, { corpo: "" }, {}, { fetch: fetchImpl });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("wa_variable_missing");
    expect(called).toBe(false);
  });

  it("mapping com índices não sequenciais → permanent_error/wa_mapping_gap", async () => {
    const snap = { ...snapshotApproved, parameter_mapping: [{ index: 2, variavel: "nome" }] };
    const r = await sendWhatsapp(baseEnv(), resolved, snap, { corpo: "" }, { nome: "A" });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("wa_mapping_gap");
  });

  it("HTTP 429 → transient_error/whatsapp_rate_limited (retry via worker)", async () => {
    const r = await sendWhatsapp(baseEnv(), resolved, snapshotApproved, { corpo: "" }, { nome: "A" },
      { fetch: mockFetch(429, { error: { code: 130429 } }) });
    expect(r.outcome).toBe("transient_error");
    expect(r.code).toBe("whatsapp_rate_limited");
  });

  it("HTTP 5xx → transient_error/whatsapp_5xx", async () => {
    const r = await sendWhatsapp(baseEnv(), resolved, snapshotApproved, { corpo: "" }, { nome: "A" },
      { fetch: mockFetch(503, { error: { code: 1 } }) });
    expect(r.outcome).toBe("transient_error");
    expect(r.code).toBe("whatsapp_5xx");
  });

  it("HTTP 401/403 → permanent_error/whatsapp_auth", async () => {
    for (const s of [401, 403]) {
      const r = await sendWhatsapp(baseEnv(), resolved, snapshotApproved, { corpo: "" }, { nome: "A" },
        { fetch: mockFetch(s, { error: { code: 190, type: "OAuthException" } }) });
      expect(r.outcome).toBe("permanent_error");
      expect(r.code).toBe("whatsapp_auth");
    }
  });

  it("HTTP 404 template → permanent_error/whatsapp_not_found", async () => {
    const r = await sendWhatsapp(baseEnv(), resolved, snapshotApproved, { corpo: "" }, { nome: "A" },
      { fetch: mockFetch(404, { error: { code: 132001, type: "template" } }) });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("whatsapp_not_found");
  });

  it("HTTP 400 payload → permanent_error/whatsapp_bad_request", async () => {
    const r = await sendWhatsapp(baseEnv(), resolved, snapshotApproved, { corpo: "" }, { nome: "A" },
      { fetch: mockFetch(400, { error: { code: 131009 } }) });
    expect(r.outcome).toBe("permanent_error");
    expect(r.code).toBe("whatsapp_bad_request");
  });

  it("timeout do adapter → transient_error/whatsapp_timeout, mensagem sanitizada", async () => {
    const fetchImpl = ((_url: string, init: RequestInit) => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      return new Promise((_, reject) => {
        (init.signal as AbortSignal).addEventListener("abort", () => reject(err));
      });
    }) as unknown as typeof fetch;
    const r = await sendWhatsapp(baseEnv(), resolved, snapshotApproved, { corpo: "" }, { nome: "A" },
      { fetch: fetchImpl, timeoutMs: 5 });
    expect(r.outcome).toBe("transient_error");
    expect(r.code).toBe("whatsapp_timeout");
    expect(r.message).not.toMatch(/TESTTOKEN/);
  });

  it("erro de rede → transient_error/whatsapp_network_error", async () => {
    const fetchImpl = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    const r = await sendWhatsapp(baseEnv(), resolved, snapshotApproved, { corpo: "" }, { nome: "A" },
      { fetch: fetchImpl });
    expect(r.outcome).toBe("transient_error");
    expect(r.code).toBe("whatsapp_network_error");
  });

  it("flags OFF (WHATSAPP_ENABLED=false) → provider_not_configured, sem rede", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
    const r = await sendWhatsapp(baseEnv({ WHATSAPP_ENABLED: false }), resolved, snapshotApproved, { corpo: "" }, { nome: "A" }, { fetch: fetchImpl });
    expect(r.outcome).toBe("provider_not_configured");
    expect(called).toBe(false);
  });
});

// ─── Migração admin de consentimento (auditoria estática) ─────────────────
describe("Gate 4 · migração rpc_admin_set_whatsapp_consent", () => {
  const sql = findMigration("rpc_admin_set_whatsapp_consent");

  it("é SECURITY DEFINER com search_path fixo", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.rpc_admin_set_whatsapp_consent/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path\s*=\s*public/);
  });
  it("exige role administrador (has_role)", () => {
    expect(sql).toMatch(/has_role\(v_actor,\s*'administrador'::public\.app_role\)/);
    expect(sql).toMatch(/RAISE EXCEPTION 'not_authorized'/);
  });
  it("valida XOR de cliente/user e ação enumerada", () => {
    expect(sql).toMatch(/exactly_one_of_cliente_or_user_required/);
    expect(sql).toMatch(/p_acao NOT IN \('opt_in','opt_out','verified'\)/);
  });
  it("sempre grava trilha imutável em comunicacao_consent_log", () => {
    expect(sql).toMatch(/INSERT INTO public\.comunicacao_consent_log/);
    expect(sql).toMatch(/actor_id/);
  });
  it("upsert idempotente em comunicacao_preferencias", () => {
    expect(sql).toMatch(/INSERT INTO public\.comunicacao_preferencias/);
    expect(sql).toMatch(/ON CONFLICT/);
    expect(sql).toMatch(/whatsapp_opt_in_at/);
    expect(sql).toMatch(/whatsapp_opt_out_at/);
  });
  it("revoga anon/PUBLIC e concede apenas a authenticated/service_role", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_admin_set_whatsapp_consent[^;]+FROM PUBLIC,\s*anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.rpc_admin_set_whatsapp_consent[^;]+TO authenticated,\s*service_role/);
  });
});

// ─── Política 24h + template-only (adapter contratual) ────────────────────
describe("Gate 4 · política janela 24h / template-only", () => {
  const src = readFileSync(resolve(ROOT, "supabase/functions/_shared/comunicacao/whatsapp-adapter.ts"), "utf8");

  it("adapter monta a MENSAGEM como type=template — nunca free-text/session", () => {
    // Só considera o `type:` no objeto da mensagem (não o `type: "text"` dos parâmetros do template).
    expect(src).toMatch(/type:\s*"template"/);
    // A raiz da mensagem NUNCA pode ser `text` ou `interactive` (fora do template).
    expect(/messaging_product:\s*"whatsapp"[\s\S]{0,200}type:\s*"text"/.test(src)).toBe(false);
    expect(/messaging_product:\s*"whatsapp"[\s\S]{0,200}type:\s*"interactive"/.test(src)).toBe(false);
  });

  it("adapter exige provider_template_status='approved' antes da rede", () => {
    expect(src).toMatch(/provider_template_status !== "approved"/);
  });
  it("adapter jamais loga token ou number", () => {
    expect(/console\.(log|info|debug|warn|error)/.test(src)).toBe(false);
  });
});
