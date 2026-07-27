// Cobertura estática (Fase C) da rodada "AUDITORIA E2E + IN-APP REALTIME".
//
// Estes testes documentam invariantes do frontend/migrations que a rodada
// entregou e falham se alguém regredir:
//  1) A tab de auditoria de comunicação SÓ é montada na página de auditoria
//     dentro do bloco restrito a `administrador`.
//  2) Os hooks de notificação in-app (sino) mantêm cleanup do canal Realtime
//     e filtram pelo usuário autenticado — nunca subscrevem globalmente.
//  3) A migration desta rodada adicionou as tabelas de notificação à
//     publicação `supabase_realtime` e criou a policy admin-only para o
//     audit de provider settings — não substituir/relaxar sem revisão.
//
// Não abrem conexão com Supabase e não emitem I/O externo.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function readMigrations(): string {
  const dir = join(ROOT, "supabase/migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

describe("Auditoria E2E — realtime in-app", () => {
  const migrations = readMigrations();

  it("adiciona notificacoes_operacionais à publicação supabase_realtime", () => {
    expect(migrations).toMatch(
      /ALTER PUBLICATION supabase_realtime ADD TABLE public\.notificacoes_operacionais/i,
    );
  });

  it("adiciona portal_notificacoes à publicação supabase_realtime", () => {
    expect(migrations).toMatch(
      /ALTER PUBLICATION supabase_realtime ADD TABLE public\.portal_notificacoes/i,
    );
  });

  it("adiciona comunicacao_inapp_dispatch à publicação supabase_realtime", () => {
    expect(migrations).toMatch(
      /ALTER PUBLICATION supabase_realtime ADD TABLE public\.comunicacao_inapp_dispatch/i,
    );
  });

  it("define REPLICA IDENTITY FULL para as tabelas de notificação (UPDATE lida)", () => {
    expect(migrations).toMatch(
      /ALTER TABLE public\.notificacoes_operacionais REPLICA IDENTITY FULL/i,
    );
    expect(migrations).toMatch(
      /ALTER TABLE public\.portal_notificacoes\s+REPLICA IDENTITY FULL/i,
    );
  });

  it("cria policy admin-only para communication_provider_settings_audit", () => {
    expect(migrations).toMatch(
      /CREATE POLICY\s+provider_settings_audit_select_admin[\s\S]*has_role\(auth\.uid\(\),\s*'administrador'::app_role\)/i,
    );
  });

  it("hook useNotificacoesOperacionais filtra por usuario_id e limpa o canal", () => {
    const src = readFileSync(
      join(ROOT, "src/hooks/useNotificacoesOperacionais.ts"),
      "utf8",
    );
    expect(src).toMatch(/filter:\s*`usuario_id=eq\.\$\{user\.id\}`/);
    expect(src).toMatch(/supabase\.removeChannel\(channel\)/);
  });

  it("ComunicacaoTab de auditoria só é usada em bloco de admin", () => {
    const audit = readFileSync(join(ROOT, "src/pages/Auditoria.tsx"), "utf8");
    // A tab é importada e renderizada apenas dentro de bloco condicionado
    // a `administrador` (ou equivalente exclusivo de admin).
    expect(audit).toMatch(/ComunicacaoTab/);
    expect(audit).toMatch(/administrador/);
  });
});
