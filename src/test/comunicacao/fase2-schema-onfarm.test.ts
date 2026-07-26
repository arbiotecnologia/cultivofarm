// Testes contratuais estáticos — schema vs helpers da Fase 2.
//
// Fato: public.ordens_servico_onfarm NÃO tem coluna data_programada;
// a coluna equivalente para agendamento on-farm é data_recomendada.
// O helper _comunicacao_build_snapshot_v2 precisa refletir essa diferença.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = readFileSync("restoration/comunicacao-fase2/migration.sql", "utf8");
const PRECHECK = readFileSync("restoration/comunicacao-fase2/precheck.sql", "utf8");
const TYPES = readFileSync("src/integrations/supabase/types.ts", "utf8");

function extractFn(name: string): string {
  const re = new RegExp(
    String.raw`CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.${name}\s*\([\s\S]*?\$\$;`,
    "i",
  );
  const m = MIGRATION.match(re);
  if (!m) throw new Error(`função ${name} não encontrada`);
  return m[0];
}

function extractSection(name: string): string {
  const start = TYPES.indexOf(`${name}: {`);
  if (start < 0) throw new Error(`seção ${name} não encontrada em types.ts`);
  // pega ~4000 chars — suficiente para conter Row/Insert/Update
  return TYPES.slice(start, start + 4000);
}

describe("Fase 2 · schema on-farm vs regular (contratual)", () => {
  it("types.ts: ordens_servico tem data_programada", () => {
    const sec = extractSection("ordens_servico");
    expect(sec).toMatch(/data_programada\s*:\s*string\s*\|\s*null/);
  });

  it("types.ts: ordens_servico_onfarm tem data_recomendada e NÃO data_programada", () => {
    const sec = extractSection("ordens_servico_onfarm");
    expect(sec).toMatch(/data_recomendada\s*:\s*string\s*\|\s*null/);
    expect(sec).not.toMatch(/data_programada/);
  });

  it("_comunicacao_build_snapshot_v2: branch on-farm usa data_recomendada, nunca data_programada", () => {
    const body = extractFn("_comunicacao_build_snapshot_v2");
    // isola o ramo WHEN 'ordens_servico_onfarm' THEN ... FROM public.ordens_servico_onfarm ...
    const onfarmIdx = body.indexOf("WHEN 'ordens_servico_onfarm'");
    expect(onfarmIdx).toBeGreaterThan(0);
    const endIdx = body.indexOf("END CASE", onfarmIdx);
    const onfarmBranch = body.slice(onfarmIdx, endIdx > 0 ? endIdx : undefined);
    expect(onfarmBranch).toMatch(/o\.data_recomendada/);
    expect(onfarmBranch).not.toMatch(/o\.data_programada/);
  });

  it("_comunicacao_build_snapshot_v2: branch OS regular continua com data_programada", () => {
    const body = extractFn("_comunicacao_build_snapshot_v2");
    const regIdx = body.indexOf("WHEN 'ordens_servico'");
    expect(regIdx).toBeGreaterThan(0);
    const nextIdx = body.indexOf("WHEN 'ordens_servico_onfarm'", regIdx);
    const regBranch = body.slice(regIdx, nextIdx > 0 ? nextIdx : undefined);
    expect(regBranch).toMatch(/o\.data_programada/);
    expect(regBranch).not.toMatch(/o\.data_recomendada/);
  });

  it("precheck.sql valida colunas críticas por tabela", () => {
    const required = [
      "ordens_servico.id","ordens_servico.status","ordens_servico.cliente_id",
      "ordens_servico.numero_os","ordens_servico.data_programada",
      "ordens_servico_onfarm.id","ordens_servico_onfarm.status",
      "ordens_servico_onfarm.cliente_id","ordens_servico_onfarm.numero_os",
      "ordens_servico_onfarm.data_recomendada",
      "profiles.user_id","profiles.nome","profiles.cliente_id",
      "profiles.ativo","profiles.telefone","profiles.email",
      "clientes.id","clientes.nome","clientes.telefone",
      "clientes.telefones","clientes.email",
      "portal_notificacoes.cliente_id","portal_notificacoes.titulo",
      "portal_notificacoes.mensagem","portal_notificacoes.tipo",
      "notificacoes_operacionais.user_id","notificacoes_operacionais.titulo",
      "notificacoes_operacionais.mensagem","notificacoes_operacionais.tipo",
      "user_roles.user_id","user_roles.role",
    ];
    for (const pair of required) {
      expect(PRECHECK, `precheck sem ${pair}`).toContain(`'${pair}'`);
    }
  });

  it("precheck.sql: on-farm data_programada NÃO consta como coluna requerida", () => {
    expect(PRECHECK).not.toContain("'ordens_servico_onfarm.data_programada'");
  });
});
