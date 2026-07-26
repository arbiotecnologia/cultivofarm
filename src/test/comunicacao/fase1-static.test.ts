import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const FRONT_FILES = walk("src").filter(p => /\.(ts|tsx)$/.test(p));

describe("comunicação fase 1 — proibições estáticas", () => {
  it("não há INSERT direto de frontend em tabelas comunicacao_*", () => {
    const bad: string[] = [];
    for (const f of FRONT_FILES) {
      const txt = readFileSync(f, "utf8");
      // .from('comunicacao_*').insert|update|delete
      if (/\.from\((['"])comunicacao_[^'"]+\1\)\s*\.\s*(insert|update|delete)\(/i.test(txt)) {
        bad.push(f);
      }
    }
    expect(bad, `arquivos com escrita direta:\n${bad.join("\n")}`).toEqual([]);
  });

  it("worker não faz rede externa nesta fase (sem fetch para URLs externas)", () => {
    const worker = readFileSync("supabase/functions/process-communication-outbox/index.ts", "utf8");
    expect(worker).not.toMatch(/fetch\(["']https?:\/\//);
  });

  it("worker respeita COMMUNICATION_DELIVERY_ENABLED", () => {
    const worker = readFileSync("supabase/functions/process-communication-outbox/index.ts", "utf8");
    expect(worker).toMatch(/COMMUNICATION_DELIVERY_ENABLED/);
    expect(worker).toMatch(/dry_run/);
  });

  it("feature flag frontend padrão false", () => {
    const src = readFileSync("src/features/comunicacao/flags.ts", "utf8");
    expect(src).toMatch(/VITE_COMUNICACAO_MODULE_ENABLED/);
  });

  it("migration proposta não fica em supabase/migrations", () => {
    const migrations = readdirSync("supabase/migrations");
    expect(migrations.some(m => /comunicacao_fase1/i.test(m))).toBe(false);
  });

  it("nenhum arquivo comunicacao_* contém secret/env aparente", () => {
    const bad: string[] = [];
    for (const f of FRONT_FILES) {
      if (!/comunicacao/i.test(f)) continue;
      const txt = readFileSync(f, "utf8");
      if (/(SERVICE_ROLE|SECRET_KEY|ACCESS_TOKEN)\s*=\s*['"][A-Za-z0-9_-]{16,}/.test(txt)) {
        bad.push(f);
      }
    }
    expect(bad).toEqual([]);
  });
});
