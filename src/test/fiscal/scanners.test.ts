/**
 * Fase Fiscal 3.0.2-D — Testes dos scanners com fixtures FAIL/PASS.
 * Spawna o shell dos dois scanners e valida exit code + output.
 */
import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const SECRETS = resolve(ROOT, "scripts/fiscal-secrets-scan.sh");
const INTEG   = resolve(ROOT, "scripts/fiscal-integration-scan.sh");
const FIX     = resolve(ROOT, "scripts/fixtures/fiscal-scan");

function run(cmd: string, args: string[]) {
  return spawnSync("bash", [cmd, ...args], { cwd: ROOT, encoding: "utf8" });
}

describe("fiscal-secrets-scan", () => {
  test("PASS: fixture legítima não dispara alertas", () => {
    const r = run(SECRETS, [resolve(FIX, "pass.txt")]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/OK — nenhum valor secreto real encontrado/);
  });

  test("FAIL: fixture com JWT/serviço/pg/PEM dispara alertas mascarados", () => {
    const r = run(SECRETS, [resolve(FIX, "fail-secrets.txt")]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/FISCAL SECRETS: \[JWT\]/);
    expect(r.stdout).toMatch(/FISCAL SECRETS: \[SUPABASE_SECRET\]/);
    expect(r.stdout).toMatch(/FISCAL SECRETS: \[PG_URL_WITH_PWD\]/);
    expect(r.stdout).toMatch(/FISCAL SECRETS: \[PEM_BLOCK\]/);
    // Não pode vazar valor real
    expect(r.stdout).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
    expect(r.stdout).not.toMatch(/mysupersecretpwd/);
    expect(r.stdout).not.toMatch(/MIIEvQ/);
  });
});

describe("fiscal-integration-scan", () => {
  test("PASS: fixture legítima (menciona nomes de env, não integra) não dispara alertas", () => {
    const r = run(INTEG, [resolve(FIX, "pass.txt")]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/OK — nenhum indicador de emissão fiscal em runtime/);
  });

  test("FAIL: import de SDK fiscal e fetch para provedor disparam alertas", () => {
    const r = run(INTEG, [resolve(FIX, "fail-integration.ts")]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/FISCAL INTEGRATION: \[FOCUS_(HOST|SDK|FETCH)/);
  });
});
