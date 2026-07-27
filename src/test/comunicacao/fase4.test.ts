// Testes contratuais Fase 4 — recibos WhatsApp e observabilidade.
// Cobre SQL, parser/crypto do webhook, kit e config.toml.
// Correção crítica v2: migrations Fase2/Fase4 TRANSACTION-NEUTRAL, índice UNIQUE
// parcial, streaming reader, challenge numérico, phone mismatch fail-closed,
// RPC failure => HTTP 500, duplicata detectada por RETURNING id.
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
import { healthBooleans } from "../../../supabase/functions/_shared/comunicacao/adapters-types.ts";

const ROOT = resolve(__dirname, "../../..");
const F2  = resolve(ROOT, "restoration/comunicacao-fase2");
const F4  = resolve(ROOT, "restoration/comunicacao-fase4");
const KIT = resolve(ROOT, "restoration/comunicacao-deploy");
const read = (p: string) => readFileSync(p, "utf8");

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
    // Sem PII na tabela: proíbe nomes suspeitos.
    const block = migration.split("comunicacao_provider_receipts (")[1]?.split(");")[0] ?? "";
    const lower = block.toLowerCase();
    for (const banned of ["telefone","phone","recipient","payload","body","email"]) {
      expect(lower, `coluna proibida em receipts: ${banned}`).not.toContain(banned);
    }
    expect(/\bmessage\b/.test(lower), "coluna 'message' proibida").toBe(false);
    // Estado monotônico, lock explícito, RETURNING id, msgid 200 chars
    expect(migration).toMatch(/FOR UPDATE/);
    expect(migration).toMatch(/ON CONFLICT[^;]*DO NOTHING/);
    expect(migration).toMatch(/RETURNING id INTO v_inserted_id/);
    expect(migration).toMatch(/length\(provider_message_id\) BETWEEN 1 AND 200/);
    expect(migration).toMatch(/length\(p_provider_message_id\) > 200/);
    // Índice UNIQUE parcial de correlação.
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ix_comunicacao_outbox_wa_provider_msgid/);
    expect(migration).toMatch(/WHERE canal = 'whatsapp' AND provider_message_id IS NOT NULL/);
    // Grants tightened: service_role sem GRANT ALL na tabela, apenas SELECT authenticated.
    expect(migration).toMatch(/REVOKE ALL ON public\.comunicacao_provider_receipts FROM service_role/);
    expect(migration).toMatch(/GRANT SELECT ON public\.comunicacao_provider_receipts TO authenticated/);
    expect(/GRANT ALL\s+ON public\.comunicacao_provider_receipts TO service_role/i.test(migration)).toBe(false);
  });

  it("migration é TRANSACTION-NEUTRAL: sem BEGIN/COMMIT externos", () => {
    // BEGIN/COMMIT em SQL top-level (fora de DO $$ e sem indentação) não podem existir.
    // Aceitamos apenas 'BEGIN' dentro de blocos PL/pgSQL (indentação/precedido por $$).
    expect(/^BEGIN\s*;/m.test(migration), "migration não pode abrir BEGIN externo").toBe(false);
    expect(/^COMMIT\s*;/m.test(migration), "migration não pode fechar COMMIT externo").toBe(false);
  });

  it("precheck detecta duplicidade legada e evita drift", () => {
    expect(precheck).toMatch(/duplicados em whatsapp/);
    expect(precheck).toMatch(/rpc_publish_communication_event_v2/);
  });

  it("postcheck valida colunas, RLS, unique idem, trigger append-only, grants, unique correlação", () => {
    for (const s of [
      "provider_delivery_status","comunicacao_provider_receipts",
      "ux_comunicacao_provider_receipts_idem","trg_comunicacao_provider_receipts_noupd",
      "service_role","anon","authenticated",
      "deve ser UNIQUE","IS NOT NULL","200",
    ]) expect(postcheck).toContain(s);
  });

  it("rollback só remove objetos Fase 4", () => {
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
    expect(/^BEGIN\s*;/m.test(migration), "fase2 migration não pode abrir BEGIN externo").toBe(false);
    expect(/^COMMIT\s*;/m.test(migration), "fase2 migration não pode fechar COMMIT externo").toBe(false);
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
    expect(apply).toMatch(
      /run_files_atomic\s+"fase4\/precheck\+migration\+postcheck"\s+\\\s*\n\s*"\$\{F4\}\/precheck\.sql"\s+"\$\{F4\}\/migration\.sql"\s+"\$\{F4\}\/postcheck\.sql"/,
    );
  });

  it("deploy-functions lista as três funções, incluindo whatsapp-status-webhook", () => {
    expect(deploy).toContain('"whatsapp-status-webhook"');
  });

  it("rollback: F4 sob ROLLBACK_COMMUNICATION_FASE4=true, executado ANTES de F2", () => {
    expect(rollback).toMatch(/ROLLBACK_COMMUNICATION_FASE4/);
    expect(rollback.indexOf("ROLLBACK_COMMUNICATION_FASE4"))
      .toBeLessThan(rollback.lastIndexOf("ROLLBACK_COMMUNICATION"));
    expect(rollback).toMatch(/comunicacao-fase4/);
  });

  it("verify roda postcheck/harness Fase 4 e smoke Fase 4 quando presentes", () => {
    expect(verify).toMatch(/fase4\/postcheck/);
    expect(verify).toMatch(/fase4\/harness/);
    expect(verify).toMatch(/smoke-staging-fase4/);
  });

  it("env.example documenta segredos WhatsApp sem valores e sem URL exfiltrável", () => {
    for (const name of [
      "WHATSAPP_APP_SECRET","WHATSAPP_WEBHOOK_VERIFY_TOKEN","WHATSAPP_WEBHOOK_ENABLED",
    ]) expect(env).toContain(name);
    // Não pode aparecer valor após "="
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
    if (!r.ok) throw new Error((r as { error: string }).error);
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
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected error");
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
    if (!r.ok) throw new Error("expected ok");
    expect(r.statuses).toHaveLength(0);
  });

  it("normaliza error_code para allowlist a-z0-9_.:-", () => {
    const b = buildValidBody("wamid.err", "failed");
    (b.entry[0].changes[0].value.statuses[0] as unknown as { errors: unknown[] }).errors = [
      { code: 131047, title: "Re-engagement" },
    ];
    const r = parseMetaWebhookBody(b, PHONE);
    if (!r.ok) throw new Error((r as { error: string }).error);
    expect(r.statuses[0].status).toBe("failed");
    expect(r.statuses[0].error_code).toMatch(/^[a-z0-9_.:-]{1,80}$/);
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
        // Divida em 2 changes para provar cap global, não por-change.
        statuses: many.slice(0, 150),
      }}, { field: "messages", value: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: PHONE },
        statuses: many.slice(150),
      }}]}],
    };
    const r = parseMetaWebhookBody(body, PHONE);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected error");
    expect(r.error).toBe("statuses_total_too_large");
  });

  it("MAX_BODY_BYTES <= 128 KiB", () => {
    expect(MAX_BODY_BYTES).toBeLessThanOrEqual(128 * 1024);
  });
});

describe("Fase 4 · readBodyCapped (streaming, sem arrayBuffer)", () => {
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
    expect(r.ok).toBe(true);
    if (r.ok) expect(new TextDecoder().decode(r.body)).toBe("{}");
  });

  it("cancela e retorna payload_too_large quando excede", async () => {
    const chunks = [new Uint8Array(60), new Uint8Array(60), new Uint8Array(60)];
    const r = await readBodyCapped(streamOf(chunks), 128);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected error");
    expect(r.error).toBe("payload_too_large");
  });

  it("retorna no_body quando body é null", async () => {
    const r = await readBodyCapped(null, 128);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected error");
    expect(r.error).toBe("no_body");
  });

  it("retorna empty quando stream é vazio", async () => {
    const r = await readBodyCapped(streamOf([]), 128);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected error");
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

// ─── Webhook index (contratual) ────────────────────────────────────────────

describe("Fase 4 · webhook index (contratos)", () => {
  const src = read(resolve(ROOT, "supabase/functions/whatsapp-status-webhook/index.ts"));
  it("NÃO usa req.arrayBuffer(); usa readBodyCapped(req.body, MAX_BODY_BYTES)", () => {
    expect(/req\.arrayBuffer\s*\(/.test(src), "arrayBuffer proibido").toBe(false);
    expect(src).toMatch(/readBodyCapped\s*\(\s*req\.body\s*,\s*MAX_BODY_BYTES\s*\)/);
  });
  it("challenge GET valida via isValidChallenge", () => {
    expect(src).toMatch(/isValidChallenge\s*\(\s*challenge\s*\)/);
  });
  it("RPC failure escala HTTP 500 genérico (nunca 200 com ok:false)", () => {
    expect(src).toMatch(/if\s*\(\s*errors\s*>\s*0\s*\)/);
    expect(src).toMatch(/jsonResponse\(500,\s*\{\s*ok:\s*false,\s*error:\s*"internal_error"/);
  });
  it("contabiliza duplicated separado de unmatched", () => {
    expect(src).toMatch(/res\.duplicated/);
    expect(src).toMatch(/duplicated,/);
  });
  it("não loga wamid/body/telefone/secret", () => {
    expect(/console\.(log|info|debug|warn|error)/.test(src), "sem logs no webhook").toBe(false);
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
  it("configured=true quando WHATSAPP_APP_SECRET e VERIFY_TOKEN presentes", () => {
    const h = healthBooleans({
      DELIVERY_ENABLED: false, EMAIL_ENABLED: false, WHATSAPP_ENABLED: false, INAPP_ENABLED: false,
      WHATSAPP_APP_SECRET: "x", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "y",
      WHATSAPP_WEBHOOK_ENABLED: true,
    });
    expect(h.whatsapp_webhook).toEqual({ enabled: true, configured: true });
  });
});

// ─── config.toml ───────────────────────────────────────────────────────────

describe("Fase 4 · config.toml só desliga JWT do webhook", () => {
  it("apenas whatsapp-status-webhook tem verify_jwt=false", () => {
    const s = read(resolve(ROOT, "supabase/config.toml"));
    expect(s).toMatch(/\[functions\.whatsapp-status-webhook\]\s*\nverify_jwt = false/);
    const other = s.match(/\[functions\.(?!whatsapp-status-webhook)[a-z0-9-]+\][^\[]*verify_jwt\s*=\s*false/g);
    expect(other).toBeNull();
  });
});
