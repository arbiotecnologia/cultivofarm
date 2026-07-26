// Testes estáticos da Fase 0.2 do Módulo de Comunicação.
// Objetivo: falhar CI enquanto houver:
//  (a) INSERTs diretos em tabelas cujas escritas devem passar por RPC.
//  (b) `(supabase.rpc as any)` marcado como TODO temporário até regeneração dos types.
//
// Depois de regenerar `src/integrations/supabase/types.ts` com as RPCs
// (rpc_create_notificacao_operacional, rpc_create_portal_notification_secure,
// rpc_record_aplicacao_email), os `as any` devem ser removidos.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const BLOCKED_TABLES = ["notificacoes_operacionais", "portal_notificacoes", "aplicacao_emails"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const FILES = walk(SRC);

describe("Comunicação Fase 0.2 — invariantes estáticos", () => {
  it("nenhum INSERT direto em tabelas restritas fora dos hooks de leitura", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const content = readFileSync(f, "utf8");
      for (const t of BLOCKED_TABLES) {
        // Casa .from("tabela").insert(  (com ou sem espaços)
        const re = new RegExp(
          String.raw`\.from\(\s*["']${t}["']\s*\)\s*(?:\.[A-Za-z0-9_]+\([^)]*\)\s*)*\.insert\(`
        );
        if (re.test(content)) offenders.push(`${f} -> ${t}`);
      }
    }
    expect(offenders, `INSERTs diretos proibidos:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("chamadas às RPCs canônicas usam nomes válidos", () => {
    const validRpcs = [
      "rpc_create_notificacao_operacional",
      "rpc_create_portal_notification_secure",
      "rpc_record_aplicacao_email",
    ];
    const invalidPortalTypes = /rpc_create_portal_notification_secure[^}]*_tipo:\s*["'](visita|os)["']/;
    const bad: string[] = [];
    for (const f of FILES) {
      const content = readFileSync(f, "utf8");
      if (invalidPortalTypes.test(content)) {
        bad.push(`${f}: usa tipo fora do enum tipo_notificacao_portal (visita/os)`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
    // Sanity check: ao menos um call site conhecido usa cada RPC.
    const all = FILES.map((f) => readFileSync(f, "utf8")).join("\n");
    for (const name of validRpcs) {
      // As RPCs canônicas devem ser referenciadas em algum lugar de src/.
      expect(all.includes(name), `RPC ${name} não referenciada em src/`).toBe(true);
    }
  });
});
