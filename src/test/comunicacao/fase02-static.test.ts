// Testes estáticos da Fase 0.2 do Módulo de Comunicação.
// Falha CI enquanto houver:
//  (a) INSERTs diretos em tabelas cuja escrita deve passar por RPC.
//  (b) uso de tipos fora do enum tipo_notificacao_portal (ex.: "visita"/"os").
//  (c) RPCs canônicas sem qualquer referência em src/.

import { describe, it, expect, beforeAll } from "vitest";
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

let corpus: Array<{ file: string; content: string }> = [];
let allContent = "";

beforeAll(() => {
  const files = walk(SRC).filter((f) => !f.includes("__snapshots__"));
  corpus = files.map((f) => ({ file: f, content: readFileSync(f, "utf8") }));
  allContent = corpus.map((c) => c.content).join("\n");
}, 30_000);

describe("Comunicação Fase 0.2 — invariantes estáticos", () => {
  it("nenhum INSERT direto em tabelas restritas", () => {
    const offenders: string[] = [];
    for (const { file, content } of corpus) {
      for (const t of BLOCKED_TABLES) {
        const re = new RegExp(
          String.raw`\.from\(\s*["']${t}["']\s*\)\s*(?:\.[A-Za-z0-9_]+\([^)]*\)\s*)*\.insert\(`
        );
        if (re.test(content)) offenders.push(`${file} -> ${t}`);
      }
    }
    expect(offenders, `INSERTs diretos proibidos:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("nenhum uso de tipos fora do enum tipo_notificacao_portal (visita/os) na RPC de portal", () => {
    const re = /rpc_create_portal_notification_secure[^)]*_tipo:\s*["'](visita|os)["']/s;
    const bad: string[] = [];
    for (const { file, content } of corpus) {
      if (re.test(content)) bad.push(file);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("RPCs canônicas são referenciadas em src/", () => {
    for (const name of [
      "rpc_create_notificacao_operacional",
      "rpc_create_portal_notification_secure",
      "rpc_record_aplicacao_email",
    ]) {
      expect(allContent.includes(name), `RPC ${name} não referenciada`).toBe(true);
    }
  });
});

