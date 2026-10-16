// Testes contratuais Fase 4 — correção final: feature flag real, concorrência
// limitada, error_code sem fallback title, FK NOT NULL/RESTRICT em receipts,
// estado failed vs sent por timestamp, rollback F4-first e gate na F2.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isValidChallenge,
  MAX_BODY_BYTES,
  MAX_STATUSES_TOTAL,
  parseMetaWebhookBody,
  readBodyCapped,
  verifyMetaSignature,
} from "../../../supabase/functions/_shared/comunicacao/whatsapp-webhook-parser.ts";
import {
  healthBooleans,
  isWhatsappWebhookConfigValid,
} from "../../../supabase/functions/_shared/comunicacao/adapters-types.ts";
import {
  DEFAULT_WEBHOOK_CONCURRENCY,
  MAX_WEBHOOK_CONCURRENCY,
  runWithConcurrency,
} from "../../../supabase/functions/_shared/comunicacao/concurrency.ts";

const ROOT = resolve(__dirname, "../../..");
const F2  = resolve(ROOT, "restoration/comunicacao-fase2");
const F4  = resolve(ROOT, "restoration/comunicacao-fase4");
const KIT = resolve(ROOT, "restoration/comunicacao-deploy");
const read = (p: string) => readFileSync(p, "utf8");

function expectErr<T extends { ok: boolean }>(r: T): asserts r is T & { ok: false; error: string } {
  if (r.ok) throw new Error("expected error result");
}
function expectOk<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  if (!r.ok) throw new Error("expected ok result");
}

// ─── SQL Fase 4 ────────────────────────────────────────────────────────────

describe("Fase 4 · SQL", () => {
  const migration = read(resolve(F4, "migration.sql"));
  const precheck  = read(resolve(F4, "precheck.sql"));
  const postcheck = read(resolve(F4, "postcheck.sql"));
  const rollback  = read(resolve(F4, "rollback.sql"));
  const harness   = read(resolve(F4, "harness-rls.sql"));

  it("migration aditiva: colunas de recibo, tabela append-only, RPC service_role-only", () => {
    for (const col of [
      "provider_delivery_status","provider_status_at","delivered_at","read_at","provider_failed_at",
    ]) expect(migration).toContain(col);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.comunicacao_provider_receipts/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX[^;]*ux_comunicacao_provider_receipts_idem[^;]*\(provider, provider_message_id, status, provider_timestamp\)/s);
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/CREATE POLICY "admins read receipts"/);
    expect(migration).toMatch(/rpc_record_whatsapp_delivery_status/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.rpc_record_whatsapp_delivery_status[^;]*TO service_role/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_record_whatsapp_delivery_status[^;]*FROM anon/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_record_whatsapp_delivery_status[^;]*FROM authenticated/);
    const block = migration.split("comunicacao_provider_receipts (")[1]?.split(");")[0] ?? "";
    const lower = block.toLowerCase();
    for (const banned of ["telefone","phone","recipient","payload","body","email"]) {
      expect(lower, `coluna proibida em receipts: ${banned}`).not.toContain(banned);
    }
    expect(/\bmessage\b/.test(lower), "coluna 'message' proibida").toBe(false);
    expect(migration).toMatch(/FOR UPDATE/);
    expect(migration).toMatch(/ON CONFLICT[^;]*DO NOTHING/);
    expect(migration).toMatch(/RETURNING id INTO v_inserted_id/);
    expect(migration).toMatch(/length\(provider_message_id\) BETWEEN 1 AND 200/);
    expect(migration).toMatch(/length\(p_provider_message_id\) > 200/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ix_comunicacao_outbox_wa_provider_msgid/);
    expect(migration).toMatch(/WHERE canal = 'whatsapp' AND provider_message_id IS NOT NULL/);
    expect(migration).toMatch(/REVOKE ALL ON public\.comunicacao_provider_receipts FROM service_role/);
    expect(migration).toMatch(/GRANT SELECT ON public\.comunicacao_provider_receipts TO authenticated/);
    expect(/GRANT ALL\s+ON public\.comunicacao_provider_receipts TO service_role/i.test(migration)).toBe(false);
  });

  it("receipts.outbox_id é NOT NULL + FK ON DELETE RESTRICT (append-only/retention)", () => {
    expect(migration).toMatch(/outbox_id\s+uuid\s+NOT NULL\s+REFERENCES\s+public\.comunicacao_outbox\(id\)\s+ON DELETE RESTRICT/);
    // Cascade proibido — contradiz append-only.
    expect(/ON DELETE CASCADE/.test(migration.split("comunicacao_provider_receipts (")[1]?.split(");")[0] ?? "")).toBe(false);
  });

  it("máquina de estado: failed anterior ao sent NÃO substitui; posterior/igual substitui (vetor contratual)", () => {
    // Regras codificadas na função. Extrai o bloco `ELSIF p_status = 'failed'`.
    const idx = migration.indexOf("ELSIF p_status = 'failed'");
    expect(idx, "bloco 'failed' ausente").toBeGreaterThan(0);
    const chunk = migration.slice(idx, idx + 1200);
    // Sentinela: quando estado atual é 'sent', só substitui se ts >= v_current_ts.
    expect(chunk).toMatch(/v_current_state = 'sent'/);
    expect(chunk).toMatch(/p_timestamp\s*>=\s*v_current_ts/);
    // Failed nunca substitui delivered/read/deleted.
    expect(chunk).toMatch(/delivered_at IS NULL AND v_outbox\.read_at IS NULL/);
    expect(chunk).toMatch(/IS DISTINCT FROM 'deleted'/);
    // Já failed → mantém timestamp mais antigo.
    expect(chunk).toMatch(/v_current_state = 'failed'/);
    // Sent nunca rebaixa outros estados.
    const idxSent = migration.indexOf("ELSIF p_status = 'sent'");
    const sentChunk = migration.slice(idxSent, idxSent + 800);
    expect(sentChunk).toMatch(/v_current_state IS NULL/);
  });

  it("migration é TRANSACTION-NEUTRAL: sem BEGIN/COMMIT externos", () => {
    expect(/^BEGIN\s*;/m.test(migration)).toBe(false);
    expect(/^COMMIT\s*;/m.test(migration)).toBe(false);
  });

  it("precheck detecta duplicidade legada e evita drift", () => {
    expect(precheck).toMatch(/duplicados em whatsapp/);
    expect(precheck).toMatch(/rpc_publish_communication_event_v2/);
  });

  it("postcheck valida colunas, RLS, unique idem, trigger, grants, unique correlação, NOT NULL/FK RESTRICT", () => {
    for (const s of [
      "provider_delivery_status","comunicacao_provider_receipts",
      "ux_comunicacao_provider_receipts_idem","trg_comunicacao_provider_receipts_noupd",
      "service_role","anon","authenticated",
      "deve ser UNIQUE","IS NOT NULL","200",
      "outbox_id deve ser NOT NULL",
      "ON DELETE RESTRICT",
    ]) expect(postcheck).toContain(s);
  });

  it("rollback Fase 4 é TRANSACTION-NEUTRAL e só remove objetos Fase 4", () => {
    expect(/^BEGIN\s*;/m.test(rollback)).toBe(false);
    expect(/^COMMIT\s*;/m.test(rollback)).toBe(false);
    expect(rollback).toMatch(/DROP TABLE IF EXISTS public\.comunicacao_provider_receipts/);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.rpc_record_whatsapp_delivery_status/);
    for (const s of ["comunicacao_templates","comunicacao_regras","comunicacao_eventos","rpc_publish_communication_event_v2"]) {
      expect(rollback, `rollback F4 não pode tocar ${s}`).not.toContain(s);
    }
  });

  it("harness usa BEGIN/ROLLBACK e testa authenticated e anon", () => {
    expect(harness).toMatch(/^BEGIN;/m);
    expect(harness).toMatch(/ROLLBACK;\s*$/);
    expect(harness).toMatch(/role.*authenticated/);
    expect(harness).toMatch(/role.*anon/);
  });
});

// ─── SQL Fase 2 (transaction-neutral) ──────────────────────────────────────

describe("Fase 2 · SQL (transaction-neutral)", () => {
  const migration = read(resolve(F2, "migration.sql"));
  it("migration Fase 2 é TRANSACTION-NEUTRAL: sem BEGIN/COMMIT externos", () => {
    expect(/^BEGIN\s*;/m.test(migration)).toBe(false);
    expect(/^COMMIT\s*;/m.test(migration)).toBe(false);
  });
});

// ─── Kit ───────────────────────────────────────────────────────────────────

describe("Fase 4 · Kit", () => {
  const apply    = read(resolve(KIT, "apply-staging.sh"));
  const deploy   = read(resolve(KIT, "deploy-functions-staging.sh"));
  const rollback = read(resolve(KIT, "rollback-staging.sh"));
  const verify   = read(resolve(KIT, "verify-staging.sh"));
  const env      = read(resolve(KIT, "env.example"));
  const smokeF4  = read(resolve(KIT, "smoke-staging-fase4.sql"));

  it("apply-staging aplica Fase 4 atomicamente APÓS harness Fase 2", () => {
    const idxHarness2 = apply.indexOf('fase2/harness');
    const idxAtomic4  = apply.indexOf('fase4/precheck+migration+postcheck');
    const idxHarness4 = apply.indexOf('fase4/harness');
    const idxSeeds    = apply.indexOf('fase2/seeds');
    expect(idxHarness2).toBeGreaterThan(0);
    expect(idxAtomic4).toBeGreaterThan(idxHarness2);
    expect(idxHarness4).toBeGreaterThan(idxAtomic4);
    expect(idxSeeds).toBeGreaterThan(idxHarness4);
  });

  it("deploy-functions lista whatsapp-status-webhook", () => {
    expect(deploy).toContain('"whatsapp-status-webhook"');
  });

  it("rollback: F4 SEMPRE antes de F2; F2 recusada se F4 ainda instalada", () => {
    // Ordem: bloco F4 antes de bloco F2.
    const idxF4Block = rollback.indexOf("ROLLBACK_COMMUNICATION_FASE4");
    const idxF2Guard = rollback.indexOf('"${ROLLBACK_COMMUNICATION:-false}"');
    expect(idxF4Block).toBeGreaterThan(0);
    expect(idxF2Guard).toBeGreaterThan(idxF4Block);
    // Detecta presença F4 no banco (read-only) e recusa F2 se ainda instalada.
    expect(rollback).toMatch(/detect_fase4_installed/);
    expect(rollback).toMatch(/rpc_record_whatsapp_delivery_status/);
    expect(rollback).toMatch(/comunicacao_provider_receipts/);
    expect(rollback).toMatch(/recusado:\s*Fase 4 ainda instalada/);
    // Rollback usa --single-transaction (transaction-neutral no .sql).
    expect(rollback).toMatch(/--single-transaction[^\n]*\n[^\n]*rollback\.sql/);
  });

  it("rollback: detect_fase4_installed é fail-closed e cobre TODOS os artefatos", () => {
    // Sem `|| true` no capture do psql — erros de consulta devem abortar.
    const detectBlock = rollback.slice(
      rollback.indexOf("detect_fase4_installed()"),
      rollback.indexOf("FASE4_INSTALLED=false"),
    );
    expect(detectBlock.length).toBeGreaterThan(0);
    expect(detectBlock, "não pode mascarar erro do psql com || true").not.toMatch(/\|\|\s*true/);
    // Captura rc do psql e chama fail em erro/formato inválido.
    expect(detectBlock).toMatch(/rc=\$\?/);
    expect(detectBlock).toMatch(/consulta psql falhou/);
    expect(detectBlock).toMatch(/formato inválido/);
    // Regex estrita t|f com 4 posições.
    expect(detectBlock).toMatch(/\^\[tf\]\\\|\[tf\]\\\|\[tf\]\\\|\[tf\]\$/);
    // Detecta os 4 artefatos F4.
    expect(detectBlock).toMatch(/rpc_record_whatsapp_delivery_status/);
    expect(detectBlock).toMatch(/comunicacao_provider_receipts/);
    expect(detectBlock).toMatch(/provider_delivery_status/);
    expect(detectBlock).toMatch(/ix_comunicacao_outbox_wa_provider_msgid/);
  });

  it("rollback: após rollback F4, re-executa detect e FAIL se sobrarem artefatos", () => {
    // Bloco entre execução do rollback.sql e o skip/guard F2.
    const idxF4Run = rollback.indexOf('-f "${F4}/rollback.sql"');
    const idxF2Skip = rollback.indexOf('skip: fase2/rollback');
    expect(idxF4Run).toBeGreaterThan(0);
    expect(idxF2Skip).toBeGreaterThan(idxF4Run);
    const postBlock = rollback.slice(idxF4Run, idxF2Skip);
    expect(postBlock).toMatch(/detect_fase4_installed/);
    expect(postBlock).toMatch(/artefatos Fase 4 ainda presentes/);
  });


  it("verify roda postcheck/harness Fase 4 e smoke Fase 4 quando presentes", () => {
    expect(verify).toMatch(/fase4\/postcheck/);
    expect(verify).toMatch(/fase4\/harness/);
    expect(verify).toMatch(/smoke-staging-fase4/);
  });

  it("env.example documenta segredos WhatsApp sem valores e sem URL exfiltrável", () => {
    for (const name of [
      "WHATSAPP_APP_SECRET","WHATSAPP_WEBHOOK_VERIFY_TOKEN","WHATSAPP_WEBHOOK_ENABLED",
      "WHATSAPP_PHONE_NUMBER_ID",
    ]) expect(env).toContain(name);
    expect(env, "WHATSAPP_APP_SECRET não pode ter valor").not.toMatch(/^WHATSAPP_APP_SECRET=\S/m);
    expect(env, "WHATSAPP_WEBHOOK_VERIFY_TOKEN não pode ter valor").not.toMatch(/^WHATSAPP_WEBHOOK_VERIFY_TOKEN=\S/m);
    expect(/STAGING_API_URL/.test(env)).toBe(false);
  });

  it("smoke-staging-fase4 read-only + verifica RPC, RLS, grants, colunas, UNIQUE e trigger", () => {
    expect(smokeF4).toMatch(/BEGIN;/);
    expect(smokeF4).toMatch(/ROLLBACK;\s*$/);
    for (const s of [
      "rpc_record_whatsapp_delivery_status",
      "comunicacao_provider_receipts",
      "provider_delivery_status",
      "trg_comunicacao_provider_receipts_noupd",
      "service_role","anon","authenticated",
      "FOR UPDATE","ON CONFLICT","RETURNING id",
      "UNIQUE","ix_comunicacao_outbox_wa_provider_msgid",
    ]) expect(smokeF4).toContain(s);
    expect(/DISABLE ROW LEVEL SECURITY/i.test(smokeF4)).toBe(false);
  });
});

// ─── Fase 5 · Regressões da certificação RC ────────────────────────────────

describe("Fase 5 (RC) · Regressões", () => {
  it("worker não ecoa claimErr.message do Postgres na resposta HTTP", () => {
    const worker = read(resolve(
      ROOT, "supabase/functions/process-communication-outbox/index.ts",
    ));
    // Não pode reintroduzir vazamento do raw error do Postgres.
    expect(worker, "claimErr.message não pode vazar para o cliente").not.toMatch(
      /detail:\s*claimErr\.message/,
    );
    // Resposta claim_failed continua existindo, mas sem detail.
    expect(worker).toMatch(/error:\s*"claim_failed"/);
  });

  it("CommunicationHealthResult inclui whatsapp_webhook e UI renderiza os booleans", () => {
    const apiSrc = read(resolve(ROOT, "src/features/comunicacao/api.ts"));
    expect(apiSrc).toMatch(/whatsapp_webhook\?:\s*\{\s*enabled:\s*boolean;\s*configured:\s*boolean\s*\}/);
    const uiSrc = read(resolve(ROOT, "src/features/comunicacao/ui/ComunicacaoAdminPage.tsx"));
    expect(uiSrc).toMatch(/whatsapp_webhook\?\.configured/);
    expect(uiSrc).toMatch(/whatsapp_webhook\?\.enabled/);
    expect(uiSrc).toMatch(/Webhook WhatsApp/);
  });

  it("healthBooleans retorna whatsapp_webhook (contrato Edge Function ↔ UI)", () => {
    const hb = healthBooleans({
      DELIVERY_ENABLED: false, EMAIL_ENABLED: false, WHATSAPP_ENABLED: false, INAPP_ENABLED: false,
      WHATSAPP_WEBHOOK_ENABLED: false,
      WHATSAPP_APP_SECRET: "", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "", WHATSAPP_PHONE_NUMBER_ID: "",
    } as unknown as Parameters<typeof healthBooleans>[0]);
    expect(hb).toHaveProperty("whatsapp_webhook");
    expect(hb.whatsapp_webhook).toEqual({ enabled: false, configured: false });
  });

  it("kit deploy: comentário do cabeçalho lista as 3 funções realmente publicadas", () => {
    const deploySrc = read(resolve(KIT, "deploy-functions-staging.sh"));
    // Extrair array FUNCTIONS.
    const m = deploySrc.match(/readonly FUNCTIONS=\(([^)]+)\)/);
    expect(m).not.toBeNull();
    const arr = m![1].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
    expect(arr.sort()).toEqual([
      "communication-health", "process-communication-outbox", "whatsapp-status-webhook",
    ].sort());
    // Comentário deve mencionar todas as 3 (evita drift).
    for (const fn of arr) {
      expect(deploySrc.slice(0, 400), `cabeçalho deve mencionar ${fn}`).toContain(fn);
    }
  });

  it("docs do kit refletem Fases 1/2/4 (sem referência solta a 'Fase 3')", () => {
    const envEx = read(resolve(KIT, "env.example"));
    const checklist = read(resolve(KIT, "checklist-manual.md"));
    expect(envEx.split("\n")[0], "primeira linha do env.example").not.toMatch(/Fase 3\b/);
    expect(checklist.split("\n")[0], "título do checklist").toMatch(/Fases?\s+1\/2\/4/);
  });
});

// ─── Edge Function (parser + HMAC) ─────────────────────────────────────────

const PHONE = "1234567890";
const APP_SECRET = "test-app-secret-fase4";

function buildValidBody(id = "wamid.ABC", status = "sent", ts = 1_781_000_000) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "wa-entry",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: PHONE, display_phone_number: "555" },
          statuses: [{ id, status, timestamp: String(ts) }],
        },
      }],
    }],
  };
}

describe("Fase 4 · whatsapp-webhook-parser", () => {
  it("aceita payload válido e extrai apenas id/status/timestamp/error_code", () => {
    const r = parseMetaWebhookBody(buildValidBody(), PHONE);
    expectOk(r);
    expect(r.statuses).toHaveLength(1);
    expect(r.statuses[0]).toMatchObject({ id: "wamid.ABC", status: "sent" });
    expect(r.statuses[0].timestamp.endsWith("Z")).toBe(true);
    expect(r.statuses[0].error_code).toBeNull();
  });

  it("rejeita object errado", () => {
    const r = parseMetaWebhookBody({ ...buildValidBody(), object: "instagram" }, PHONE);
    expect(r.ok).toBe(false);
  });

  it("phone_number_id mismatch é FAIL-CLOSED (invalid_phone_number_id)", () => {
    const r = parseMetaWebhookBody(buildValidBody(), "999");
    expectErr(r);
    expect(r.error).toBe("invalid_phone_number_id");
  });

  it("ignora payload de mensagem recebida (sem statuses) sem falhar", () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: PHONE },
        messages: [{ from: "+55...", id: "wamid.in", text: { body: "oi" } }],
        contacts: [{ profile: { name: "Fulano" } }],
      }}]}],
    };
    const r = parseMetaWebhookBody(body, PHONE);
    expectOk(r);
    expect(r.statuses).toHaveLength(0);
  });

  it("normaliza error_code SOMENTE por code ou error_code, ignorando title", () => {
    const b = buildValidBody("wamid.err", "failed");
    (b.entry[0].changes[0].value.statuses[0] as unknown as { errors: unknown[] }).errors = [
      { code: 131047, title: "Re-engagement" },
    ];
    const r = parseMetaWebhookBody(b, PHONE);
    expectOk(r);
    expect(r.statuses[0].status).toBe("failed");
    expect(r.statuses[0].error_code).toBe("131047");
  });

  it("sem code e sem error_code → error_code=null (title NÃO é fallback)", () => {
    const b = buildValidBody("wamid.err2", "failed");
    (b.entry[0].changes[0].value.statuses[0] as unknown as { errors: unknown[] }).errors = [
      { title: "Some Human Title" },
    ];
    const r = parseMetaWebhookBody(b, PHONE);
    expectOk(r);
    expect(r.statuses[0].error_code).toBeNull();
  });

  it("aplica cap GLOBAL de statuses por request", () => {
    const many = Array.from({ length: MAX_STATUSES_TOTAL + 5 }, (_, i) => ({
      id: `wamid.${i}`, status: "sent", timestamp: "1781000000",
    }));
    const body = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: PHONE },
        statuses: many.slice(0, 150),
      }}, { field: "messages", value: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: PHONE },
        statuses: many.slice(150),
      }}]}],
    };
    const r = parseMetaWebhookBody(body, PHONE);
    expectErr(r);
    expect(r.error).toBe("statuses_total_too_large");
  });

  it("MAX_BODY_BYTES <= 128 KiB", () => {
    expect(MAX_BODY_BYTES).toBeLessThanOrEqual(128 * 1024);
  });
});

describe("Fase 4 · readBodyCapped (streaming)", () => {
  function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    let i = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i < chunks.length) controller.enqueue(chunks[i++]);
        else controller.close();
      },
    });
  }

  it("aceita corpo abaixo do cap", async () => {
    const buf = new TextEncoder().encode("{}");
    const r = await readBodyCapped(streamOf([buf]), 128);
    expectOk(r);
    expect(new TextDecoder().decode(r.body)).toBe("{}");
  });

  it("cancela e retorna payload_too_large quando excede", async () => {
    const chunks = [new Uint8Array(60), new Uint8Array(60), new Uint8Array(60)];
    const r = await readBodyCapped(streamOf(chunks), 128);
    expectErr(r);
    expect(r.error).toBe("payload_too_large");
  });

  it("retorna no_body quando body é null", async () => {
    const r = await readBodyCapped(null, 128);
    expectErr(r);
    expect(r.error).toBe("no_body");
  });

  it("retorna empty quando stream é vazio", async () => {
    const r = await readBodyCapped(streamOf([]), 128);
    expectErr(r);
    expect(r.error).toBe("empty");
  });
});

describe("Fase 4 · isValidChallenge (GET Meta)", () => {
  it("aceita apenas numérico 1..512 chars", () => {
    expect(isValidChallenge("12345")).toBe(true);
    expect(isValidChallenge("0")).toBe(true);
    expect(isValidChallenge("1".repeat(512))).toBe(true);
  });
  it("rejeita não-numérico, vazio, > 512 chars, null", () => {
    expect(isValidChallenge("hello")).toBe(false);
    expect(isValidChallenge("")).toBe(false);
    expect(isValidChallenge("1".repeat(513))).toBe(false);
    expect(isValidChallenge(null)).toBe(false);
    expect(isValidChallenge("12a")).toBe(false);
    expect(isValidChallenge("<script>")).toBe(false);
  });
});

describe("Fase 4 · verifyMetaSignature (HMAC)", () => {
  async function sign(body: Uint8Array, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const buf = new Uint8Array(await crypto.subtle.sign("HMAC", key, body as BufferSource));
    return "sha256=" + Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  it("aceita assinatura válida", async () => {
    const body = new TextEncoder().encode(JSON.stringify(buildValidBody()));
    const sig = await sign(body, APP_SECRET);
    expect(await verifyMetaSignature(body, sig, APP_SECRET)).toBe(true);
  });
  it("rejeita assinatura inválida", async () => {
    const body = new TextEncoder().encode("{}");
    const sig = await sign(body, "other-secret");
    expect(await verifyMetaSignature(body, sig, APP_SECRET)).toBe(false);
  });
  it("rejeita header ausente ou malformado", async () => {
    const body = new TextEncoder().encode("{}");
    expect(await verifyMetaSignature(body, null, APP_SECRET)).toBe(false);
    expect(await verifyMetaSignature(body, "sha1=deadbeef", APP_SECRET)).toBe(false);
    expect(await verifyMetaSignature(body, "sha256=zz", APP_SECRET)).toBe(false);
  });
});

// ─── Concorrência limitada ────────────────────────────────────────────────

describe("Fase 4 · runWithConcurrency (bounded, deterministic)", () => {
  it("cap <= MAX_WEBHOOK_CONCURRENCY (8)", () => {
    expect(MAX_WEBHOOK_CONCURRENCY).toBeLessThanOrEqual(8);
    expect(DEFAULT_WEBHOOK_CONCURRENCY).toBeLessThanOrEqual(MAX_WEBHOOK_CONCURRENCY);
    expect(DEFAULT_WEBHOOK_CONCURRENCY).toBeGreaterThanOrEqual(1);
  });

  it("nunca ultrapassa o limite de promises simultâneas", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 40 }, (_, i) => i);
    const results = await runWithConcurrency(items, 8, async (i) => {
      inFlight++;
      if (inFlight > peak) peak = inFlight;
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return i * 2;
    });
    expect(peak).toBeLessThanOrEqual(8);
    expect(results).toEqual(items.map((i) => i * 2));
  });

  it("clampa limite ao MAX (8) mesmo com input maior", async () => {
    let peak = 0, inFlight = 0;
    await runWithConcurrency(Array.from({ length: 30 }, (_, i) => i), 999, async () => {
      inFlight++;
      if (inFlight > peak) peak = inFlight;
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(MAX_WEBHOOK_CONCURRENCY);
  });

  it("rejeita com o primeiro erro e não dispara mais trabalho novo", async () => {
    let started = 0;
    const items = Array.from({ length: 30 }, (_, i) => i);
    await expect(
      runWithConcurrency(items, 4, async (i) => {
        started++;
        if (i === 2) throw new Error("boom");
        await new Promise((r) => setTimeout(r, 3));
        return i;
      }),
    ).rejects.toThrow("boom");
    // Não deve ter iniciado todos os 30 itens.
    expect(started).toBeLessThan(items.length);
  });
});

// ─── Webhook index (contratual) ────────────────────────────────────────────

describe("Fase 4 · webhook index (contratos)", () => {
  const src = read(resolve(ROOT, "supabase/functions/whatsapp-status-webhook/index.ts"));

  it("NÃO usa req.arrayBuffer(); usa readBodyCapped(req.body, MAX_BODY_BYTES)", () => {
    expect(/req\.arrayBuffer\s*\(/.test(src)).toBe(false);
    expect(src).toMatch(/readBodyCapped\s*\(\s*req\.body\s*,\s*MAX_BODY_BYTES\s*\)/);
  });

  it("challenge GET valida via isValidChallenge", () => {
    expect(src).toMatch(/isValidChallenge\s*\(\s*challenge\s*\)/);
  });

  it("feature flag WHATSAPP_WEBHOOK_ENABLED: assinatura ok + flag false = 200 disabled sem RPC/parse", () => {
    expect(src).toMatch(/WHATSAPP_WEBHOOK_ENABLED/);
    // Curto-circuito ocorre APÓS verifyMetaSignature e ANTES do parse JSON.
    const idxSig      = src.indexOf("verifyMetaSignature");
    const idxFlagShort = src.indexOf("!WEBHOOK_ENABLED");
    const idxParse    = src.indexOf("JSON.parse(new TextDecoder");
    const idxRpc      = src.indexOf("rpc_record_whatsapp_delivery_status");
    expect(idxSig).toBeGreaterThan(0);
    expect(idxFlagShort).toBeGreaterThan(idxSig);
    expect(idxParse).toBeGreaterThan(idxFlagShort);
    expect(idxRpc).toBeGreaterThan(idxFlagShort);
    // Resposta genérica sem PII.
    expect(src).toMatch(/jsonResponse\(200,\s*\{\s*ok:\s*true,\s*disabled:\s*true,\s*received:\s*0\s*\}\)/);
    // Assinatura inválida continua 401 antes do gate de flag.
    expect(src).toMatch(/if\s*\(\s*!sigOk\s*\)\s*return\s+jsonResponse\(401/);
  });

  it("usa runWithConcurrency; NÃO usa Promise.all irrestrito sobre statuses", () => {
    expect(src).toMatch(/runWithConcurrency\s*\(\s*parsed\.statuses\s*,/);
    // Nenhuma chamada Promise.all direta no arquivo (o pool interno usa
    // Promise.all sobre um número LIMITADO de runners, e essa importação
    // está isolada em concurrency.ts).
    expect(/Promise\.all\s*\(/.test(src)).toBe(false);
  });

  it("RPC failure escala HTTP 500 genérico (nunca 200 com ok:false)", () => {
    expect(src).toMatch(/hardError/);
    expect(src).toMatch(/jsonResponse\(500,\s*\{\s*ok:\s*false,\s*error:\s*"internal_error"/);
  });

  it("contabiliza duplicated separado de unmatched", () => {
    expect(src).toMatch(/res\.duplicated/);
    expect(src).toMatch(/duplicated,/);
  });

  it("não loga wamid/body/telefone/secret", () => {
    expect(/console\.(log|info|debug|warn|error)/.test(src)).toBe(false);
  });
});

// ─── isWhatsappWebhookConfigValid ─────────────────────────────────────────

describe("Fase 4 · isWhatsappWebhookConfigValid", () => {
  const base = { DELIVERY_ENABLED: false, EMAIL_ENABLED: false, WHATSAPP_ENABLED: false, INAPP_ENABLED: false } as const;

  it("false quando falta APP_SECRET", () => {
    expect(isWhatsappWebhookConfigValid({
      ...base, WHATSAPP_WEBHOOK_VERIFY_TOKEN: "vt", WHATSAPP_PHONE_NUMBER_ID: "123",
    })).toBe(false);
  });
  it("false quando falta VERIFY_TOKEN", () => {
    expect(isWhatsappWebhookConfigValid({
      ...base, WHATSAPP_APP_SECRET: "sk", WHATSAPP_PHONE_NUMBER_ID: "123",
    })).toBe(false);
  });
  it("false quando falta PHONE_NUMBER_ID ou é não-numérico", () => {
    expect(isWhatsappWebhookConfigValid({
      ...base, WHATSAPP_APP_SECRET: "sk", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "vt",
    })).toBe(false);
    expect(isWhatsappWebhookConfigValid({
      ...base, WHATSAPP_APP_SECRET: "sk", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "vt",
      WHATSAPP_PHONE_NUMBER_ID: "abc",
    })).toBe(false);
  });
  it("true quando os três estão presentes e phone é numérico", () => {
    expect(isWhatsappWebhookConfigValid({
      ...base, WHATSAPP_APP_SECRET: "sk", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "vt",
      WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    })).toBe(true);
  });
});

// ─── Health booleans expostos ──────────────────────────────────────────────

describe("Fase 4 · healthBooleans expõe whatsapp_webhook sem valores", () => {
  it("valores default: enabled/configured=false quando envs ausentes", () => {
    const h = healthBooleans({
      DELIVERY_ENABLED: false, EMAIL_ENABLED: false, WHATSAPP_ENABLED: false, INAPP_ENABLED: false,
    });
    expect(h.whatsapp_webhook).toEqual({ enabled: false, configured: false });
  });
  it("configured=true SOMENTE com APP_SECRET+VERIFY_TOKEN+PHONE_NUMBER_ID numérico", () => {
    const h = healthBooleans({
      DELIVERY_ENABLED: false, EMAIL_ENABLED: false, WHATSAPP_ENABLED: false, INAPP_ENABLED: false,
      WHATSAPP_APP_SECRET: "x", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "y",
      WHATSAPP_PHONE_NUMBER_ID: "1234567890",
      WHATSAPP_WEBHOOK_ENABLED: true,
    });
    expect(h.whatsapp_webhook).toEqual({ enabled: true, configured: true });
  });
});

// ─── config.toml ───────────────────────────────────────────────────────────

describe("Fase 4 · funções sem JWT legado mantêm autenticação interna", () => {
  it("cada verify_jwt=false pertence à allowlist e valida a chamada", () => {
    const s = read(resolve(ROOT, "supabase/config.toml"));
    const disabled = [...s.matchAll(/\[functions\.([a-z0-9-]+)\][^\[]*verify_jwt\s*=\s*false/g)].map((m) => m[1]);
    const contracts = new Map([
      ["whatsapp-status-webhook", /x-hub-signature-256|timingSafeEqual/],
      ["platform-complete-first-access", /auth\.getClaims\s*\(/],
      ["onboarding-cnpj-lookup", /auth\.getClaims\s*\(/],
      // F4b: only ?lane=tenant_smtp, dedicated header compared in constant time; global route keeps in-code authorize.
      ["process-communication-outbox", /authorizeLaneInvoker\(req, LANE_INVOKER_SECRET\)/],
    ]);
    expect(disabled.sort()).toEqual([...contracts.keys()].sort());
    for (const name of disabled) {
      expect(read(resolve(ROOT, `supabase/functions/${name}/index.ts`))).toMatch(contracts.get(name) as RegExp);
    }
  });
});
