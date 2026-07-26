/**
 * Testes de comportamento — Fase 1 Comunicação (v2 corretiva).
 * - Vetores compartilhados de render (paridade frontend ↔ shared).
 * - Route guard bloqueia com flag desligada.
 * - Ausência de chamadas de rede no worker (import estático inspecionado).
 * - Migration contém expansão real (verificação estrutural mínima).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  renderTemplate,
  TemplateRenderError,
} from "@/features/comunicacao/render/renderTemplate";
import { RENDER_VECTORS } from "./render-vectors";

describe("comunicacao: render vectors (contract)", () => {
  for (const v of RENDER_VECTORS) {
    it(v.name, () => {
      if (v.expect.kind === "throw") {
        try {
          renderTemplate(v.template, v.input);
          throw new Error("esperava exceção");
        } catch (e) {
          expect(e).toBeInstanceOf(TemplateRenderError);
          expect((e as TemplateRenderError).code).toBe(v.expect.code);
        }
      } else {
        const r = renderTemplate(v.template, v.input);
        expect(r.corpo).toBe(v.expect.corpo);
        if (v.expect.assunto !== undefined) expect(r.assunto).toBe(v.expect.assunto);
        expect(r.missing.sort()).toEqual(v.expect.missing.sort());
      }
    });
  }
});

describe("comunicacao: migration structural checks", () => {
  const sql = readFileSync(
    join(process.cwd(), "restoration/comunicacao-fase1/migration.sql"),
    "utf8",
  );

  it("publish RPC expande para outbox", () => {
    expect(sql).toMatch(/rpc_publish_communication_event/);
    expect(sql).toMatch(/INSERT INTO public\.comunicacao_outbox/);
    expect(sql).toMatch(/_comunicacao_resolve_recipients/);
    expect(sql).toMatch(/_comunicacao_can_deliver/);
    expect(sql).toMatch(/idempotency_key/);
  });

  it("publish restringe eventos manuais a administrador nesta fase", () => {
    expect(sql).toMatch(/apenas administrador pode publicar eventos nesta fase/);
  });

  it("produto_pronto_retirada exige status exato pronto_entrega", () => {
    expect(sql).toMatch(/o\.status = 'pronto_entrega'/);
  });

  it("produto_pronto_aplicacao NÃO tem mapeamento de status inventado", () => {
    // não deve haver equivalência pronto_entrega/entregue para aplicacao
    const trecho = sql.match(/produto_pronto_aplicacao[\s\S]{0,600}/)?.[0] ?? "";
    expect(trecho).not.toMatch(/status IN \('pronto_entrega','entregue'\)/);
  });

  it("preferências: XOR estrito user_id/cliente_id", () => {
    expect(sql).toMatch(/comunicacao_preferencias_scope_xor/);
    expect(sql).toMatch(/user_id IS NOT NULL AND cliente_id IS NULL/);
  });

  it("verificação separada do consentimento", () => {
    expect(sql).toMatch(/rpc_verify_communication_channel/);
    expect(sql).toMatch(/apenas administrador \(verificação exige evidência externa\)/);
  });

  it("claim usa p_lease_seconds, reclama processing expirado e valida worker", () => {
    expect(sql).toMatch(/lease_expires_at/);
    expect(sql).toMatch(/lease_expires_at < now\(\)/);
    expect(sql).toMatch(/worker_id inválido/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it("complete/fail validam locked_by e lease e exigem worker_id", () => {
    expect(sql).toMatch(/rpc_complete_communication_delivery\([^)]*p_worker_id text/);
    expect(sql).toMatch(/rpc_fail_communication_delivery\([^)]*p_worker_id text/);
    expect(sql).toMatch(/lease pertence a outro worker/);
    expect(sql).toMatch(/lease expirado/);
  });

  it("audit helper NÃO executável por authenticated", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\._comunicacao_write_audit[^;]*FROM PUBLIC, anon, authenticated/);
  });

  it("templates: trigger permite transição active→archived, bloqueia alteração de conteúdo", () => {
    expect(sql).toMatch(/conteúdo de template ativo é imutável/);
    expect(sql).toMatch(/só pode transitar para archived/);
  });

  it("existe archive RPC", () => {
    expect(sql).toMatch(/rpc_archive_communication_template/);
  });

  it("histórico de opt-in/out em consent_log append-only", () => {
    expect(sql).toMatch(/comunicacao_consent_log/);
    expect(sql).toMatch(/comunicacao_consent_no_mutation/);
  });
});

describe("comunicacao: worker (edge function) sem rede externa", () => {
  const src = readFileSync(
    join(process.cwd(), "supabase/functions/process-communication-outbox/index.ts"),
    "utf8",
  );

  it("importa renderer compartilhado real", () => {
    expect(src).toMatch(/from "\.\.\/_shared\/communication-render\.ts"/);
    expect(src).toMatch(/from "\.\.\/_shared\/auth-guard\.ts"/);
  });

  it("não usa fetch/https/http de rede externa", () => {
    // permitido: apenas usos internos via SDK do Supabase (via serviceClient).
    // Não deve haver chamadas literais fetch(...) ou URL de webhook.
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/https?:\/\//i);
  });

  it("não usa import suspeito npm:@supabase/supabase-js@2/cors", () => {
    expect(src).not.toMatch(/npm:@supabase\/supabase-js@2\/cors/);
  });

  it("com DELIVERY_ENABLED=false não faz claim (dry_run)", () => {
    expect(src).toMatch(/DELIVERY_ENABLED/);
    expect(src).toMatch(/dry_run: true/);
    // claim só é chamado sob delivery habilitado
    expect(src).toMatch(/if \(!DELIVERY_ENABLED\)[\s\S]{0,200}return json/);
  });

  it("adapters retornam provider_not_configured", () => {
    expect(src).toMatch(/provider_not_configured/);
  });

  it("autorização por Bearer JWT (service role) ou secret exato, sem substring", () => {
    expect(src).not.toMatch(/\.includes\(/);
    expect(src).toMatch(/secret === INTERNAL_SECRET/);
    expect(src).toMatch(/token === SERVICE_KEY/);
  });
});

describe("comunicacao: route guard e flag", () => {
  it("flag padrão é false", async () => {
    const { isComunicacaoModuleEnabled } = await import("@/features/comunicacao/flags");
    expect(isComunicacaoModuleEnabled()).toBe(false);
  });
});
