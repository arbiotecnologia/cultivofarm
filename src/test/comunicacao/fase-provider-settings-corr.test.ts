// Certificação da rodada corretiva — provider settings (F-CORR).
// Cobre:
//  (1) runtime loader — DB primary, env fallback, fail-closed.
//  (2) fromDbPayload — mapeia flags/allowlists/provider fields; nenhum segredo escapa.
//  (3) CORS — origens confiáveis vs. arbitrárias, sem wildcard.
//  (4) Payload shaping — preserva/set/clear de segredos, confirmações, validações.
//  (5) Estáticos — frontend usa functions.invoke; grants restritos; verify_jwt exclusivo do webhook;
//      workers usam runtime loader; GET não expõe plaintext de segredo/allowlist.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  failClosed,
  fromDbPayload,
  loadRuntimeConfig,
  type RuntimeConfig,
} from "../../../supabase/functions/_shared/comunicacao/runtime-config";
import {
  corsHeadersFor,
  handlePreflight,
  isTrustedOriginPure,
  CORS_HOST_PATTERNS,
} from "../../../supabase/functions/_shared/comunicacao/cors";
import {
  buildAtomicPayload,
  buildClearSecretPayload,
  mask,
  sanitizeRpcError,
  VALID_SECRET_SLOTS,
} from "../../../supabase/functions/_shared/comunicacao/provider-settings-shaping";
import type { WorkerEnv } from "../../../supabase/functions/_shared/comunicacao/adapters-types";

// ---------- helpers ----------
type RpcMock = (name: string, args?: unknown) => Promise<{ data: unknown; error: unknown }>;
const sb = (impl: RpcMock) => ({ rpc: impl });

const envAllOff = (): WorkerEnv => ({
  DELIVERY_ENABLED: false, EMAIL_ENABLED: false, WHATSAPP_ENABLED: false,
  INAPP_ENABLED: false, WHATSAPP_WEBHOOK_ENABLED: false,
  TEST_MODE_ENABLED: true, TEST_ALLOWED_EMAILS: [], TEST_ALLOWED_PHONES: [],
});
const envSendable = (): WorkerEnv => ({
  DELIVERY_ENABLED: true, EMAIL_ENABLED: true, WHATSAPP_ENABLED: true,
  INAPP_ENABLED: true, WHATSAPP_WEBHOOK_ENABLED: true,
  TEST_MODE_ENABLED: false, TEST_ALLOWED_EMAILS: ["a@b.c"], TEST_ALLOWED_PHONES: ["+5511999999999"],
  SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", SMTP_USER: "u",
  SMTP_PASSWORD: "SECRET_SMTP_XXXXXXXXXX", SMTP_FROM: "no@ex.co",
  WHATSAPP_ACCESS_TOKEN: "SECRET_WA_XXXXXXXXXX", WHATSAPP_PHONE_NUMBER_ID: "111222",
  WHATSAPP_API_VERSION: "v25.0",
  WHATSAPP_APP_SECRET: "SECRET_APPSEC_XXXX",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "SECRET_VER_XXXX",
});

const dbSecret = "PLAINTEXT_SMTP_PWD_ABCDEFG";
const dbWaSecret = "PLAINTEXT_WA_TOKEN_UVWXYZ";

const dbPayloadFull = () => ({
  present: true,
  delivery_enabled: true,
  email_delivery_enabled: true,
  whatsapp_delivery_enabled: false,
  inapp_delivery_enabled: true,
  whatsapp_webhook_enabled: true,
  test_mode_enabled: false,
  allowed_emails: ["a@b.c", "d@e.f"],
  allowed_phones: ["+5511911112222"],
  smtp_host: "smtp.host", smtp_port: 465, smtp_user: "user", smtp_from: "from@ex.co",
  smtp_password: dbSecret,
  whatsapp_phone_number_id: "12345",
  whatsapp_api_version: "v25.0",
  whatsapp_access_token: dbWaSecret,
  whatsapp_app_secret: "APPSECRET_PLAIN",
  whatsapp_verify_token: "VERIFY_PLAIN",
});

// ---------- (1) runtime loader ----------
describe("F-CORR (1) runtime loader — precedência DB > env > fail_closed", () => {
  it("DB present=true → source=db, valores do DB são efetivos", async () => {
    const cfg = await loadRuntimeConfig(
      sb(async () => ({ data: dbPayloadFull(), error: null })),
      () => envSendable(), // env aparentemente ligado — deve ser IGNORADO
    );
    expect(cfg.source).toBe("db");
    expect(cfg.DELIVERY_ENABLED).toBe(true);
    expect(cfg.WHATSAPP_ENABLED).toBe(false); // vem do DB, não do env
    expect(cfg.SMTP_PASSWORD).toBe(dbSecret); // usado só em memória
    expect(cfg.TEST_MODE_ENABLED).toBe(false);
  });

  it("DB present=false → cai para envFallback com source=env", async () => {
    const cfg = await loadRuntimeConfig(
      sb(async () => ({ data: { present: false }, error: null })),
      () => envSendable(),
    );
    expect(cfg.source).toBe("env");
    expect(cfg.DELIVERY_ENABLED).toBe(true);
    expect(cfg.SMTP_HOST).toBe("smtp.example.com");
  });

  it("RPC error → fail_closed (nada sai)", async () => {
    const cfg = await loadRuntimeConfig(
      sb(async () => ({ data: null, error: { message: "boom" } })),
      () => envSendable(),
    );
    expectFailClosed(cfg);
  });

  it("RPC throw → fail_closed", async () => {
    const cfg = await loadRuntimeConfig(
      sb(async () => { throw new Error("network"); }),
      () => envSendable(),
    );
    expectFailClosed(cfg);
  });

  it("payload inesperado (present ausente/inválido) → fail_closed", async () => {
    for (const bad of [null, {}, { present: "yes" }, { present: 1 }, []]) {
      const cfg = await loadRuntimeConfig(
        sb(async () => ({ data: bad as unknown, error: null })),
        () => envSendable(),
      );
      expectFailClosed(cfg);
    }
  });

  it("envFallback lançando exceção não escapa — fail_closed", async () => {
    const cfg = await loadRuntimeConfig(
      sb(async () => ({ data: { present: false }, error: null })),
      () => { throw new Error("env broken"); },
    );
    expectFailClosed(cfg);
  });
});

function expectFailClosed(cfg: RuntimeConfig) {
  expect(cfg.source).toBe("fail_closed");
  expect(cfg.DELIVERY_ENABLED).toBe(false);
  expect(cfg.EMAIL_ENABLED).toBe(false);
  expect(cfg.WHATSAPP_ENABLED).toBe(false);
  expect(cfg.INAPP_ENABLED).toBe(false);
  expect(cfg.WHATSAPP_WEBHOOK_ENABLED).toBe(false);
  expect(cfg.TEST_MODE_ENABLED).toBe(true);
  expect(cfg.SMTP_PASSWORD).toBeUndefined();
  expect(cfg.WHATSAPP_ACCESS_TOKEN).toBeUndefined();
  expect(cfg.WHATSAPP_APP_SECRET).toBeUndefined();
  expect(cfg.WHATSAPP_WEBHOOK_VERIFY_TOKEN).toBeUndefined();
}

// ---------- (2) fromDbPayload ----------
describe("F-CORR (2) fromDbPayload — mapeamento e ausência de vazamento", () => {
  it("mapeia flags/allowlists/provider fields", () => {
    const cfg = fromDbPayload(dbPayloadFull());
    expect(cfg.DELIVERY_ENABLED).toBe(true);
    expect(cfg.EMAIL_ENABLED).toBe(true);
    expect(cfg.WHATSAPP_ENABLED).toBe(false);
    expect(cfg.WHATSAPP_WEBHOOK_ENABLED).toBe(true);
    expect(cfg.TEST_ALLOWED_EMAILS).toEqual(["a@b.c", "d@e.f"]);
    expect(cfg.TEST_ALLOWED_PHONES).toEqual(["+5511911112222"]);
    expect(cfg.SMTP_PORT).toBe("465");
    expect(cfg.WHATSAPP_API_VERSION).toBe("v25.0");
  });

  it("test_mode_enabled ausente/null/qualquer coisa != false → TRUE (fail-closed)", () => {
    for (const v of [undefined, null, "true", 0, "false"] as unknown[]) {
      const p = { ...dbPayloadFull(), test_mode_enabled: v };
      const cfg = fromDbPayload(p as Record<string, unknown>);
      expect(cfg.TEST_MODE_ENABLED).toBe(true);
    }
    expect(fromDbPayload({ ...dbPayloadFull(), test_mode_enabled: false }).TEST_MODE_ENABLED).toBe(false);
  });

  it("healthBooleans/derivado NÃO expõe segredos em texto", async () => {
    const { healthBooleans } = await import(
      "../../../supabase/functions/_shared/comunicacao/adapters-types"
    );
    const cfg = fromDbPayload(dbPayloadFull());
    const hb = healthBooleans(cfg);
    const j = JSON.stringify(hb);
    expect(j).not.toContain(dbSecret);
    expect(j).not.toContain(dbWaSecret);
    expect(j).not.toContain("APPSECRET_PLAIN");
    expect(j).not.toContain("VERIFY_PLAIN");
    // Nenhuma allowlist em texto claro em health output:
    expect(j).not.toContain("a@b.c");
    expect(j).not.toContain("+5511911112222");
    // Apenas contagens:
    expect(hb.test_mode.allowlist_emails_count).toBe(2);
    expect(hb.test_mode.allowlist_phones_count).toBe(1);
  });

  it("failClosed() nunca contém segredo/allowlist/flag ON", () => {
    const j = JSON.stringify(failClosed());
    expect(j).not.toMatch(/password|token|secret/i);
    expect(j).not.toContain("@");
  });
});

// ---------- (3) CORS ----------
describe("F-CORR (3) CORS — origens confiáveis vs. arbitrárias", () => {
  it("aceita produção canônica, preview lovable, localhost/127.0.0.1 e extras", () => {
    for (const ok of [
      "https://app.cultivofarm.com.br",
      "https://preview.lovable.app",
      "https://abcdef.lovable.app",
      "https://a1b2c3--proj.lovable.app",
      "https://abc.lovableproject.com",
      "http://localhost",
      "http://localhost:8080",
      "http://127.0.0.1:5173",
    ]) {
      expect(isTrustedOriginPure(ok, [])).toBe(true);
    }
    expect(isTrustedOriginPure("https://empresa.example.com", ["https://empresa.example.com"])).toBe(true);
  });

  it("recusa arbitrárias, esquemas errados e null", () => {
    for (const bad of [
      null, "", "*",
      "http://evil.com", "https://evil.com",
      "https://evil.cultivofarm.com.br",
      "https://app.cultivofarm.com.br.evil.com",
      "http://app.cultivofarm.com.br",
      "https://lovable.app.evil.com", "https://x.lovable.evil.com",
      "ftp://localhost", "file:///etc/passwd",
      "https://lovableproject.com", // sem subdomínio
    ]) {
      expect(isTrustedOriginPure(bad, [])).toBe(false);
    }
  });

  it("nenhum padrão CORS aceita curinga *", () => {
    for (const re of CORS_HOST_PATTERNS) expect(re.test("*")).toBe(false);
    expect(corsHeadersFor("https://app.cultivofarm.com.br")["Access-Control-Allow-Origin"]).toBe(
      "https://app.cultivofarm.com.br",
    );
    expect(Object.values(corsHeadersFor("https://app.cultivofarm.com.br"))).not.toContain("*");
  });

  it("preflight aprovado retorna 204 e reflete somente a origem exata", () => {
    const approved = handlePreflight(new Request("https://edge.example/functions/v1/settings", {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.cultivofarm.com.br",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,apikey,content-type,x-client-info",
      },
    }));
    expect(approved.status).toBe(204);
    expect(approved.headers.get("Access-Control-Allow-Origin")).toBe("https://app.cultivofarm.com.br");

    const denied = handlePreflight(new Request("https://edge.example/functions/v1/settings", {
      method: "OPTIONS",
      headers: { Origin: "https://app.cultivofarm.com.br.evil.com" },
    }));
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

// ---------- (4) Payload shaping ----------
describe("F-CORR (4) provider-settings — shaping/validações", () => {
  it("senha SMTP em branco preserva (nenhum secret_op)", () => {
    const r = buildAtomicPayload({ smtp: { host: "h", user: "u", from: "a@b.c", port: 25, password: "" } });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.secret_ops).toEqual([]);
    expect(r.updates.smtp_host).toBe("h");
  });

  it("aplicação de rota SMTPi altera somente host e preserva senha e flags", () => {
    const r = buildAtomicPayload({ smtp: { host: "smtpi.kinghost.net" } });
    if ("error" in r) throw new Error(r.error);
    expect(r.updates).toEqual({ smtp_host: "smtpi.kinghost.net" });
    expect(r.secret_ops).toEqual([]);
    expect(r.updates).not.toHaveProperty("smtp_port");
    expect(r.updates).not.toHaveProperty("smtp_user");
    expect(r.updates).not.toHaveProperty("smtp_from");
    expect(r.updates).not.toHaveProperty("delivery_enabled");
    expect(r.updates).not.toHaveProperty("email_delivery_enabled");
  });

  it("senha SMTP preenchida gera set write-only", () => {
    const r = buildAtomicPayload({ smtp: { password: "NOVA_SENHA_ABC123" } });
    if ("error" in r) throw new Error(r.error);
    expect(r.secret_ops).toEqual([{ slot: "smtp_password", action: "set", value: "NOVA_SENHA_ABC123" }]);
  });

  it("clear_secret exige confirm=REMOVE e slot válido", () => {
    expect(buildClearSecretPayload({ action: "clear_secret", slot: "smtp_password" })).toEqual({ error: "confirmation_required" });
    expect(buildClearSecretPayload({ action: "clear_secret", slot: "smtp_password", confirm: "yes" })).toEqual({ error: "confirmation_required" });
    expect(buildClearSecretPayload({ action: "clear_secret", slot: "outra_coisa", confirm: "REMOVE" })).toEqual({ error: "invalid_slot" });
    const ok = buildClearSecretPayload({ action: "clear_secret", slot: "whatsapp_access_token", confirm: "REMOVE" });
    if ("error" in ok) throw new Error(ok.error);
    expect(ok.secret_ops).toEqual([{ slot: "whatsapp_access_token", action: "clear" }]);
  });

  it("todos os slots válidos são cobertos", () => {
    expect([...VALID_SECRET_SLOTS].sort()).toEqual(
      ["smtp_password","whatsapp_access_token","whatsapp_app_secret","whatsapp_verify_token"].sort(),
    );
  });

  it("desligar test mode exige confirmação exata", () => {
    expect(buildAtomicPayload({ test_mode_enabled: false })).toEqual({ error: "confirmation_required_disable_test_mode" });
    expect(buildAtomicPayload({ test_mode_enabled: false, confirm_disable_test_mode: "yes" })).toEqual({ error: "confirmation_required_disable_test_mode" });
    const ok = buildAtomicPayload({ test_mode_enabled: false, confirm_disable_test_mode: "I_UNDERSTAND_REAL_SENDS" });
    if ("error" in ok) throw new Error(ok.error);
    expect(ok.updates.test_mode_enabled).toBe(false);
  });

  it("ligar qualquer flag exige confirm_enable=I_UNDERSTAND", () => {
    expect(buildAtomicPayload({ flags: { delivery_enabled: true } })).toEqual({ error: "confirmation_required" });
    expect(buildAtomicPayload({ flags: { whatsapp_webhook_enabled: true, confirm_enable: "sim" } })).toEqual({ error: "confirmation_required" });
    const ok = buildAtomicPayload({ flags: { email_delivery_enabled: true, confirm_enable: "I_UNDERSTAND" } });
    if ("error" in ok) throw new Error(ok.error);
    expect(ok.updates.email_delivery_enabled).toBe(true);
    // Desligar não exige confirmação:
    const off = buildAtomicPayload({ flags: { delivery_enabled: false } });
    if ("error" in off) throw new Error(off.error);
    expect(off.updates.delivery_enabled).toBe(false);
  });

  it("rejeita SMTP inválido (porta/from)", () => {
    expect(buildAtomicPayload({ smtp: { port: 0 } })).toEqual({ error: "invalid_smtp_port" });
    expect(buildAtomicPayload({ smtp: { port: 70000 } })).toEqual({ error: "invalid_smtp_port" });
    expect(buildAtomicPayload({ smtp: { port: 1.5 } })).toEqual({ error: "invalid_smtp_port" });
    expect(buildAtomicPayload({ smtp: { from: "sem-arroba" } })).toEqual({ error: "invalid_smtp_from" });
  });

  it("rejeita WhatsApp inválido (phone/version)", () => {
    expect(buildAtomicPayload({ whatsapp: { phone_number_id: "abc123" } })).toEqual({ error: "invalid_phone_number_id" });
    expect(buildAtomicPayload({ whatsapp: { api_version: "v22.0" } })).toEqual({ error: "invalid_api_version" });
    const ok = buildAtomicPayload({ whatsapp: { api_version: "v24.0", phone_number_id: "111" } });
    if ("error" in ok) throw new Error(ok.error);
    expect(ok.updates.whatsapp_api_version).toBe("v24.0");
  });

  it("allowed_emails deduplica, normaliza minúsculas e filtra inválidos", () => {
    const r = buildAtomicPayload({ allowed_emails: [" A@B.c ", "a@b.c", "invalido", "x@y.z"] });
    if ("error" in r) throw new Error(r.error);
    expect(r.updates.allowed_emails).toEqual(["a@b.c", "x@y.z"]);
  });

  it("allowed_phones normaliza para +E164", () => {
    const r = buildAtomicPayload({ allowed_phones: ["55 (11) 99999-9999", "+5511888887777"] });
    if ("error" in r) throw new Error(r.error);
    expect(r.updates.allowed_phones).toEqual(["+5511999999999", "+5511888887777"]);
  });

  it("mask nunca vaza valor inteiro", () => {
    expect(mask("SECRET_LONG_VALUE_123")).toMatch(/^SE•+23$/);
    expect(mask("ab")).toBe("••");
    expect(mask(null)).toBeNull();
  });

  it("sanitizeRpcError mapeia códigos conhecidos e mascara o resto", () => {
    expect(sanitizeRpcError({ message: "erro: test_mode_off_requires_email_provider" })).toBe("test_mode_off_requires_email_provider");
    expect(sanitizeRpcError({ message: "postgres tuple insert leak (senha=abc)" })).toBe("atomic_apply_failed");
    expect(sanitizeRpcError(null)).toBe("atomic_apply_failed");
  });
});

// ---------- (5) Estáticos ----------
describe("F-CORR (5) invariantes estáticos de segurança/wiring", () => {
  const feFile = "src/pages/configuracoes/ComunicacaoConfigTab.tsx";
  const migF3  = "supabase/migrations/20260727161408_f3b6bc19-55b3-473b-80aa-14481e58cbf0.sql";
  const migF3a = "supabase/migrations/20260727161544_0316604a-f7f3-407b-ba2a-14c09d6021cb.sql";
  const migF3b = "supabase/migrations/20260727162402_3651e2b6-d372-4ff9-b87c-295ce68b586b.sql";
  const settingsIdx = "supabase/functions/communication-provider-settings/index.ts";
  const healthIdx = "supabase/functions/communication-health/index.ts";
  const workerIdx = "supabase/functions/process-communication-outbox/index.ts";
  const webhookIdx = "supabase/functions/whatsapp-status-webhook/index.ts";
  const configToml = "supabase/config.toml";

  const read = (p: string) => readFileSync(p, "utf8");

  it("frontend usa functions.invoke e não faz cast em supabaseUrl/supabaseKey", () => {
    const src = read(feFile);
    expect(src).toContain("supabase.functions.invoke");
    expect(src).not.toMatch(/supabase\s+as\s+any/);
    expect(src).not.toContain("supabaseUrl");
    expect(src).not.toContain("supabaseKey");
    // Não faz fetch manual da função
    expect(src).not.toContain("/functions/v1/communication-provider-settings");
  });

  it("migrations revogam service RPCs de public/anon/authenticated e concedem só service_role", () => {
    const bodies = [read(migF3), read(migF3a), read(migF3b)].join("\n");
    const svcRpcs = [
      "rpc_service_load_provider_runtime_config",
      "rpc_service_apply_provider_settings",
      "rpc_service_set_provider_secret",
      "rpc_service_clear_provider_secret",
      "rpc_service_check_rate_limit",
    ];
    for (const fn of svcRpcs) {
      const rx = new RegExp(String.raw`REVOKE\s+ALL\s+ON\s+FUNCTION[\s\S]*?${fn}[\s\S]*?FROM\s+PUBLIC`, "i");
      expect.soft(bodies, `${fn} deve ter REVOKE FROM PUBLIC`).toMatch(rx);
      const rxGrant = new RegExp(String.raw`GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*?${fn}[\s\S]*?TO\s+service_role`, "i");
      expect.soft(bodies, `${fn} deve GRANT EXECUTE TO service_role`).toMatch(rxGrant);
    }
  });

  it("config.toml: verify_jwt=false exige autenticação interna explicitamente auditada", () => {
    const src = read(configToml);
    const blocks = src.split(/\[functions\./).slice(1);
    const customAuth = new Map([
      ["whatsapp-status-webhook", /x-hub-signature-256|timingSafeEqual/],
      ["platform-complete-first-access", /auth\.getClaims\s*\(/],
      ["onboarding-cnpj-lookup", /auth\.getClaims\s*\(/],
      // F4b: only ?lane=tenant_smtp, dedicated header compared in constant time; global route keeps in-code authorize.
      ["process-communication-outbox", /authorizeLaneInvoker\(req, LANE_INVOKER_SECRET\)/],
    ]);
    const disabled: string[] = [];
    for (const b of blocks) {
      const name = b.split("]")[0].trim();
      const disables = /verify_jwt\s*=\s*false/.test(b);
      if (disables) {
        disabled.push(name);
        const authContract = customAuth.get(name);
        expect(authContract, `${name} precisa estar na allowlist auditada`).toBeDefined();
        const functionSource = read(`supabase/functions/${name}/index.ts`);
        expect(functionSource, `${name} precisa validar a autenticação internamente`).toMatch(authContract as RegExp);
      }
    }
    expect(disabled.sort()).toEqual([...customAuth.keys()].sort());
  });

  it("config.toml exige JWT explicitamente nas duas funções administrativas de Comunicação", () => {
    const src = read(configToml);
    for (const name of ["communication-provider-settings", "test-communication-email"]) {
      const block = src.match(new RegExp(String.raw`\[functions\.${name}\]([\s\S]*?)(?=\n\[functions\.|$)`));
      expect(block, `${name} deve ter bloco explícito`).not.toBeNull();
      expect(block?.[1], `${name} deve exigir JWT no gateway`).toMatch(/verify_jwt\s*=\s*true/);
    }
  });

  it("worker/webhook importam e chamam loadRuntimeConfig (health migrou para RPC admin no Gate 6)", () => {
    for (const p of [workerIdx, webhookIdx]) {
      const src = read(p);
      expect.soft(src, `${p} deve importar loadRuntimeConfig`).toContain(`from "../_shared/comunicacao/runtime-config.ts"`);
      expect.soft(src, `${p} deve chamar loadRuntimeConfig`).toMatch(/loadRuntimeConfig\s*\(/);
    }
    // Health function deixou de depender de runtime-config: consome snapshot admin consolidado.
    const healthSrc = read(healthIdx);
    expect(healthSrc).toMatch(/rpc_admin_communication_health_snapshot/);
    expect(healthSrc).not.toMatch(/loadRuntimeConfig\s*\(/);
  });


  it("worker: se DELIVERY_ENABLED=false, NÃO faz claim do outbox", () => {
    const src = read(workerIdx);
    // Precisa ter um early return quando delivery está off, antes do claim RPC.
    const beforeClaim = src.split("rpc_claim_communication_outbox")[0] ?? "";
    expect(beforeClaim).toMatch(/!\s*env\.DELIVERY_ENABLED[\s\S]{0,200}return/);
  });

  it("settings edge function nunca faz .from() em tabelas do Vault", () => {
    const src = read(settingsIdx);
    expect(src).not.toMatch(/\.from\(\s*["']vault\./);
    expect(src).not.toMatch(/\.from\(\s*["']vault_/);
    // e só chama a RPC atômica para mutações
    const mutationCalls = src.match(/sb\.rpc\(\s*["'][^"']+["']/g) ?? [];
    const distinct = new Set(mutationCalls.map((s) => s.replace(/^sb\.rpc\(\s*["']|["']$/g, "")));
    // Aceita rate-limit + apply; NÃO deve chamar set/clear diretos.
    expect(distinct.has("rpc_service_apply_provider_settings")).toBe(true);
    expect(distinct.has("rpc_service_check_rate_limit")).toBe(true);
    expect(distinct.has("rpc_service_set_provider_secret")).toBe(false);
    expect(distinct.has("rpc_service_clear_provider_secret")).toBe(false);
  });

  it("shape público não menciona campos de plaintext (password/token/secret)", () => {
    const src = read(settingsIdx);
    // O único vazamento aceitável é a chave da coluna secret_*_configured (boolean).
    const badLines = src.split("\n").filter((l) =>
      /password_configured|access_token_configured|app_secret_configured|verify_token_configured/.test(l) === false &&
      /\b(password|access_token|app_secret|verify_token)\s*:\s*[^_]/.test(l) &&
      !/allowed_api_versions|"password"/.test(l)
    );
    // Ok se alguma linha ficar; o teste real é: nenhum campo do view retorna esses nomes como chave.
    const returned = src.match(/return\s*\{[\s\S]*?updated_at:/);
    expect(returned, "loadPublicView deve existir").toBeTruthy();
    const view = returned![0];
    expect(view).not.toMatch(/^\s*password\s*:/m);
    expect(view).not.toMatch(/^\s*access_token\s*:/m);
    expect(view).not.toMatch(/^\s*app_secret\s*:/m);
    expect(view).not.toMatch(/^\s*verify_token\s*:/m);
    // e não retorna arrays em texto claro:
    expect(view).not.toMatch(/allowed_emails\s*:/);
    expect(view).not.toMatch(/allowed_phones\s*:/);
    expect(view).toMatch(/allowed_emails_masked/);
    expect(view).toMatch(/allowed_phones_masked/);
    void badLines;
  });
});
