/**
 * Testes contratuais/comportamentais — Fase 2.3 (coerência funcional/operacional).
 * Sem rede. Lê artefatos SQL/TS diretamente do repositório.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const migration = readFileSync(join(ROOT, "restoration/comunicacao-fase2/migration.sql"), "utf8");
const postcheck = readFileSync(join(ROOT, "restoration/comunicacao-fase2/postcheck.sql"), "utf8");
const harness = readFileSync(join(ROOT, "restoration/comunicacao-fase2/harness-rls.sql"), "utf8");
const runbook = readFileSync(join(ROOT, "restoration/comunicacao-fase2/runbook.md"), "utf8");
const rollback = readFileSync(join(ROOT, "restoration/comunicacao-fase2/rollback.sql"), "utf8");
const workerSrc = readFileSync(
  join(ROOT, "supabase/functions/process-communication-outbox/index.ts"),
  "utf8",
);
const apiSrc = readFileSync(join(ROOT, "src/features/comunicacao/api.ts"), "utf8");
const uiSrc = readFileSync(
  join(ROOT, "src/features/comunicacao/ui/ComunicacaoAdminPage.tsx"),
  "utf8",
);
const typesSrc = readFileSync(join(ROOT, "src/features/comunicacao/types.ts"), "utf8");

function extractFn(src: string, name: string): string {
  const re = new RegExp(
    String.raw`CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.${name}\s*\([\s\S]*?\$\$;`,
    "i",
  );
  const m = src.match(re);
  if (!m) throw new Error(`função ${name} não encontrada`);
  return m[0];
}

describe("Fase 2.3 · rpc_publish_communication_event_v2", () => {
  it("existe com assinatura exata e retorna jsonb", () => {
    expect(migration).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.rpc_publish_communication_event_v2\(\s*p_event_key\s+text,\s*p_source_type\s+text,\s*p_source_id\s+uuid,\s*p_payload\s+jsonb,\s*p_idempotency_key\s+text\s*\)\s+RETURNS\s+jsonb/i,
    );
  });

  it("apenas administrador (rejeita anon e não-admin)", () => {
    const body = extractFn(migration, "rpc_publish_communication_event_v2");
    expect(body).toMatch(/auth\.uid\(\)\s+IS\s+NULL/i);
    expect(body).toMatch(/has_role\(auth\.uid\(\),\s*'administrador'\)/);
    expect(body).toMatch(/insufficient_privilege/);
  });

  it("whitelist de event_key e delega expansão v2 (source-aware)", () => {
    const body = extractFn(migration, "rpc_publish_communication_event_v2");
    for (const ev of [
      "produto_pronto_retirada",
      "produto_pronto_aplicacao",
      "administrative_important_update",
    ]) {
      expect(body).toContain(ev);
    }
    // Chama expand v2 com source_type e payload
    expect(body).toMatch(/public\._comunicacao_expand_event\([\s\S]*p_source_type[\s\S]*\)/);
  });

  it("produto_pronto_retirada valida pronto_entrega para OS regular e on-farm", () => {
    const body = extractFn(migration, "rpc_publish_communication_event_v2");
    expect(body).toMatch(/ordens_servico[\s\S]{0,120}pronto_entrega/);
    expect(body).toMatch(/ordens_servico_onfarm[\s\S]{0,180}pronto_entrega/);
  });

  it("produto_pronto_aplicacao aceita apenas ordens_servico regular existente", () => {
    const body = extractFn(migration, "rpc_publish_communication_event_v2");
    expect(body).toMatch(/produto_pronto_aplicacao aceita apenas ordens_servico/);
  });

  it("administrative_important_update: whitelist de chaves target_role/titulo/mensagem", () => {
    const body = extractFn(migration, "rpc_publish_communication_event_v2");
    expect(body).toMatch(/target_role/);
    expect(body).toMatch(/titulo/);
    expect(body).toMatch(/mensagem/);
    expect(body).toMatch(/chaves de payload não permitidas/i);
  });

  it("grants: REVOKE anon + GRANT authenticated", () => {
    expect(migration).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.rpc_publish_communication_event_v2[^;]*FROM\s+PUBLIC,\s*anon/i,
    );
    expect(migration).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.rpc_publish_communication_event_v2[^;]*TO\s+authenticated/i,
    );
  });

  it("UI/API só usam v2 (nenhuma chamada residual a rpc_publish_communication_event v1 pela camada Fase 2)", () => {
    // publishAdministrativeBroadcast e publishManualProdutoProntoAplicacao usam v2
    expect(apiSrc).toMatch(
      /publishAdministrativeBroadcast[\s\S]{0,400}rpc_publish_communication_event_v2/,
    );
    expect(apiSrc).toMatch(
      /publishManualProdutoProntoAplicacao[\s\S]{0,400}rpc_publish_communication_event_v2/,
    );
    // Não deve haver chamada "rpc_publish_communication_event" (v1) em api.ts.
    expect(apiSrc).not.toMatch(/callRpc\(\s*"rpc_publish_communication_event"/);
  });

  it("types.ts declara contrato rpc_publish_communication_event_v2", () => {
    expect(typesSrc).toMatch(/rpc_publish_communication_event_v2\s*:\s*\{/);
  });

  it("postcheck valida grants positivo/negativo de publish_v2", () => {
    expect(postcheck).toMatch(
      /rpc_publish_communication_event_v2[\s\S]{0,200}sem grant a authenticated/,
    );
    expect(postcheck).toMatch(
      /rpc_publish_communication_event_v2[\s\S]{0,200}exposta a anon/,
    );
  });

  it("rollback remove a RPC v2", () => {
    expect(rollback).toMatch(
      /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.rpc_publish_communication_event_v2\(text,text,uuid,jsonb,text\)/,
    );
  });
});

describe("Fase 2.3 · in-app dispatch usa pg_advisory_xact_lock (sem SELECT FOR UPDATE)", () => {
  it("advisory lock determinístico por outbox_id via hashtextextended", () => {
    const body = extractFn(migration, "rpc_dispatch_inapp_notification");
    expect(body).toMatch(/pg_advisory_xact_lock\(\s*hashtextextended\(\s*p_outbox_id::text\s*,\s*0\s*\)\s*\)/);
  });

  it("não usa mais SELECT ... FOR UPDATE dentro da dispatch", () => {
    const body = extractFn(migration, "rpc_dispatch_inapp_notification");
    expect(body).not.toMatch(/FOR\s+UPDATE/i);
  });
});

describe("Fase 2.3 · worker: terminação estruturada e HTTP 500 sem PII", () => {
  it("responde ok:false / HTTP 500 quando termination_failures > 0", () => {
    expect(workerSrc).toMatch(/termination_failures\s*>\s*0\s*\?\s*500\s*:\s*200/);
    expect(workerSrc).toMatch(/ok:\s*termination_failures\s*===\s*0/);
  });

  it("nunca inclui error.message bruto no results.terminator_error", () => {
    expect(workerSrc).not.toMatch(/terminator_error:\s*error\.message/);
  });

  it("code genérico terminalization_failed + nome allowlisted de RPC terminal", () => {
    expect(workerSrc).toMatch(/terminator:\s*"terminalization_failed"/);
    expect(workerSrc).toMatch(/TERMINAL_RPC_ALLOWLIST/);
    for (const n of [
      "rpc_complete_communication_delivery",
      "rpc_skip_communication_delivery",
      "rpc_cancel_communication_delivery",
      "rpc_defer_communication_delivery",
      "rpc_fail_communication_delivery_v2",
    ]) {
      expect(workerSrc).toContain(n);
    }
  });
});

describe("Fase 2.3 · UI: gestor sem Fila, editor de metadados WhatsApp", () => {
  it("gestor não recebe a aba 'fila'", () => {
    expect(uiSrc).toMatch(
      /isAdmin[\s\S]{0,120}\?\s*\[\s*"templates","regras","fila","preferencias"(?:,"consentimentos")?\s*\][\s\S]{0,80}:\s*\[\s*"templates","regras","preferencias"\s*\]/,
    );
  });


  it("editor WhatsApp existe e valida approved requer nome+language+mapping", () => {
    expect(uiSrc).toMatch(/function WhatsappTemplateMetadataEditor/);
    expect(uiSrc).toMatch(/approved (?:requer|exige) nome, language_code e mapping/);
    expect(uiSrc).toMatch(/Somente\s+<code>approved<\/code>\s+permite ativação\/envio/);
  });

  it("ativar template WA fica bloqueado enquanto Meta status != approved", () => {
    expect(uiSrc).toMatch(/canal === "whatsapp"[\s\S]{0,200}provider_template_status\s*!==\s*"approved"/);
  });

  it("editor não expõe tokens/envs (não referencia WHATSAPP_ACCESS_TOKEN nem WHATSAPP_PHONE_NUMBER_ID)", () => {
    const editorIdx = uiSrc.indexOf("function WhatsappTemplateMetadataEditor");
    const editorBlock = uiSrc.slice(editorIdx, editorIdx + 5000);
    expect(editorBlock).not.toMatch(/WHATSAPP_ACCESS_TOKEN/);
    expect(editorBlock).not.toMatch(/WHATSAPP_PHONE_NUMBER_ID/);
    expect(editorBlock).not.toMatch(/WHATSAPP_API_VERSION/);
  });
});

describe("Fase 2.3 · postcheck valida retorno via format_type + proretset", () => {
  it("postcheck usa format_type(prorettype,NULL) e checa proretset", () => {
    expect(postcheck).toMatch(/format_type\(p\.prorettype,\s*NULL\)/);
    expect(postcheck).toMatch(/p\.proretset/);
  });

  it("postcheck inclui rpc_publish_communication_event_v2 na matriz", () => {
    expect(postcheck).toMatch(
      /rpc_publish_communication_event_v2[^\n]*text,text,uuid,jsonb,text[^\n]*jsonb[^\n]*scalar/,
    );
  });
});

describe("Fase 2.3 · harness F2 v3 (matriz por assinatura exata)", () => {
  it("usa has_function_privilege por OID/assinatura exata (to_regprocedure)", () => {
    expect(harness).toMatch(/has_function_privilege\s*\(\s*v_role\s*,\s*v_oid\s*,\s*'EXECUTE'\s*\)/);
    expect(harness).toMatch(/to_regprocedure\(\s*v_sig\s*\)/);
    // assinatura exata inclui os tipos entre parênteses (não apenas o nome)
    expect(harness).toMatch(/public\.rpc_publish_communication_event_v2\(text,text,uuid,jsonb,text\)/);
  });

  it("simulação anon não usa WHEN OTHERS permissivo", () => {
    expect(harness).toMatch(/WHEN\s+insufficient_privilege\s+THEN\s+NULL/);
    expect(harness).toMatch(/WHEN\s+undefined_function\s+THEN\s+NULL/);
    expect(harness).toMatch(/erro inesperado sqlstate=/);
  });

  // Extrai a linha da matriz para uma assinatura exata e retorna [anon, authenticated, service_role].
  function matrixRow(sig: string): [string, string, string] {
    const escaped = sig.replace(/[.()[\]|\\+?*^$]/g, (c) => `\\${c}`);
    const re = new RegExp(
      String.raw`\[\s*'${escaped}'\s*,\s*'([tf])'\s*,\s*'([tf])'\s*,\s*'([tf])'\s*\]`,
    );
    const m = harness.match(re);
    if (!m) throw new Error(`assinatura ausente na matriz do harness: ${sig}`);
    return [m[1], m[2], m[3]];
  }

  it("publish_v2: anon negado, authenticated permitido, service_role permitido", () => {
    expect(matrixRow("public.rpc_publish_communication_event_v2(text,text,uuid,jsonb,text)"))
      .toEqual(["f", "t", "t"]);
  });

  it("RPCs internas / de worker são exclusivas de service_role", () => {
    const workerOnly = [
      "public._comunicacao_expand_event(uuid,text,text,uuid,jsonb)",
      "public._comunicacao_publish_system_event(text,text,uuid,jsonb,text)",
      "public._comunicacao_resolve_recipients_v2(text,comunicacao_regras,text,uuid)",
      "public._comunicacao_build_snapshot_v2(text,text,uuid,jsonb,uuid,uuid)",
      "public.rpc_resolve_outbox_address(uuid)",
      "public.rpc_skip_communication_delivery(uuid,text,text)",
      "public.rpc_cancel_communication_delivery(uuid,text,text)",
      "public.rpc_defer_communication_delivery(uuid,text,text,integer)",
      "public.rpc_fail_communication_delivery_v2(uuid,text,text,text,boolean)",
      "public.rpc_dispatch_inapp_notification(uuid,uuid,uuid,text,text)",
    ];
    for (const sig of workerOnly) {
      expect(matrixRow(sig)).toEqual(["f", "f", "t"]);
    }
  });

  it("sobrecargas de rpc_create_portal_notification_secure estão separadas com privilégios distintos", () => {
    // sobrecarga interna (4 args): apenas service_role
    expect(matrixRow("public.rpc_create_portal_notification_secure(uuid,text,text,text)"))
      .toEqual(["f", "f", "t"]);
    // sobrecarga larga (8 args) usada pelo frontend logado: authenticated + service_role
    expect(matrixRow(
      "public.rpc_create_portal_notification_secure(uuid,text,text,text,text,text,uuid,text)",
    )).toEqual(["f", "t", "t"]);
    // notificação operacional: apenas service_role
    expect(matrixRow("public.rpc_create_operational_notification_secure(uuid,text,text,text,text)"))
      .toEqual(["f", "f", "t"]);
  });

  it("RPCs administrativas (metadata/preview) exigem authenticated + service_role; anon negado", () => {
    expect(matrixRow("public.rpc_set_communication_template_metadata(uuid,text,text,jsonb,text)"))
      .toEqual(["f", "t", "t"]);
    expect(matrixRow("public.rpc_preview_administrative_broadcast_count(app_role)"))
      .toEqual(["f", "t", "t"]);
  });

  it("valida grants de tabela inapp_dispatch e triggers AFTER UPDATE das OS", () => {
    expect(harness).toMatch(/comunicacao_inapp_dispatch[\s\S]{0,120}anon\/authenticated/);
    expect(harness).toMatch(/trg_comunicacao_os_pronto_retirada[\s\S]{0,120}AFTER UPDATE/);
    expect(harness).toMatch(/trg_comunicacao_os_onfarm_pronto_retirada[\s\S]{0,120}AFTER UPDATE/);
  });

  it("falha com RAISE EXCEPTION quando há qualquer violação (fail-closed)", () => {
    expect(harness).toMatch(/RAISE\s+EXCEPTION\s+'harness Fase 2 v3:/);
  });
});

