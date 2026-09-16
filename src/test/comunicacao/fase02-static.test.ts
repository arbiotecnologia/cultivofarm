// Testes estáticos da Fase 0.2 do Módulo de Comunicação (revisão bloqueante).
// Falha CI enquanto houver:
//   (a) INSERT direto em notificacoes_operacionais/portal_notificacoes/aplicacao_emails.
//   (b) tipos fora do enum tipo_notificacao_portal (visita/os) na RPC de portal.
//   (c) casts (supabase.rpc as any) referenciando as 3 RPCs canônicas.
//   (d) chamadas às RPCs sem source_type/source_id (par obrigatório).
//   (e) RPCs canônicas sem qualquer referência em src/.
//   (f) referência a rpc_check_monitoramento_and_notify em src/ (é server-only).

import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const BLOCKED_TABLES = ["notificacoes_operacionais", "portal_notificacoes", "aplicacao_emails"];
const CANONICAL_RPCS = [
  "rpc_create_notificacao_operacional",
  "rpc_create_portal_notification_secure",
  "rpc_record_aplicacao_email",
];

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

let corpus: Array<{ file: string; content: string }> = [];
let allContent = "";

beforeAll(() => {
  corpus = walk(SRC)
    .filter((f) => !f.includes("__snapshots__"))
    .map((f) => ({ file: f, content: readFileSync(f, "utf8") }));
  allContent = corpus.map((c) => c.content).join("\n");
}, 30_000);

describe("Comunicação Fase 0.2 — invariantes estáticos", () => {
  it("(a) nenhum INSERT direto em tabelas restritas", () => {
    const offenders: string[] = [];
    for (const { file, content } of corpus) {
      for (const t of BLOCKED_TABLES) {
        const re = new RegExp(
          String.raw`\.from\(\s*["']${t}["']\s*\)\s*(?:\.[A-Za-z0-9_]+\([^)]*\)\s*)*\.insert\(`,
        );
        if (re.test(content)) offenders.push(`${file} -> ${t}`);
      }
    }
    expect(offenders, `INSERTs diretos proibidos:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("(b) nenhum tipo fora do enum tipo_notificacao_portal (visita/os)", () => {
    const re = /rpc_create_portal_notification_secure[^)]*_tipo:\s*["'](visita|os)["']/s;
    const bad: string[] = [];
    for (const { file, content } of corpus) if (re.test(content)) bad.push(file);
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("(c) nenhum cast (supabase.rpc as any) para RPCs canônicas", () => {
    const bad: string[] = [];
    for (const { file, content } of corpus) {
      for (const rpc of CANONICAL_RPCS) {
        const re = new RegExp(
          String.raw`\(\s*supabase\.rpc\s+as\s+any\s*\)\s*\(\s*["']${rpc}["']`,
        );
        if (re.test(content)) bad.push(`${file} -> ${rpc}`);
      }
    }
    expect(
      bad,
      `Casts (supabase.rpc as any) impedem certificação:\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("(d) toda chamada às RPCs de notificação contém _source_type e _source_id na janela seguinte", () => {
    const bad: string[] = [];
    const WINDOW = 1500;
    for (const { file, content } of corpus) {
      if (file.includes("/test/")) continue;
      for (const rpc of CANONICAL_RPCS) {
        if (rpc === "rpc_record_aplicacao_email") continue;
        const nameRe = new RegExp(String.raw`["']${rpc}["']`, "g");
        let m: RegExpExecArray | null;
        while ((m = nameRe.exec(content)) !== null) {
          const window = content.slice(m.index, m.index + WINDOW);
          if (!/_source_type\s*:/.test(window) || !/_source_id\s*:/.test(window)) {
            bad.push(`${file}@${m.index} -> ${rpc}: sem _source_type/_source_id na janela`);
          }
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("(e) RPCs canônicas são referenciadas em src/", () => {
    for (const name of CANONICAL_RPCS) {
      expect(allContent.includes(name), `RPC ${name} não referenciada`).toBe(true);
    }
  });

  it("(f) rpc_check_monitoramento_and_notify é server-only", () => {
    const leaks: string[] = [];
    for (const { file, content } of corpus) {
      if (file.includes("/test/")) continue;
      if (file.endsWith("src/integrations/supabase/types.ts")) continue;
      if (file.endsWith("src/integrations/supabase/cultivofarm.types.ts")) continue;
      if (content.includes("rpc_check_monitoramento_and_notify")) leaks.push(file);
    }
    expect(
      leaks,
      `rpc_check_monitoramento_and_notify não deve ser chamada de src/ (apenas Edge Function/service_role):\n${leaks.join("\n")}`,
    ).toEqual([]);
  });
});
