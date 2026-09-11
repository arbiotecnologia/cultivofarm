import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H7O item 3 — Integração do gate de binding CultivoFarm na suíte de testes.
 *
 * O gate `restoration/homologacao-h7/check-frontend-binding.sh` é estático
 * (não acessa banco, não lê segredos) e é o mesmo usado por `guard-staging.sh`
 * e pelo aplicador de migrations. Aqui ele passa a rodar também no Vitest,
 * garantindo que qualquer drift de `.env`, `client.ts`, `config.toml` ou
 * `types.ts` quebre a suíte antes de qualquer execução contra o banco.
 *
 * Nada de segredo é registrado: o script imprime apenas o project ref
 * (público, pois faz parte da URL) e mensagens de diagnóstico.
 */

const ROOT = resolve(__dirname, "../../..");
const GATE = resolve(ROOT, "restoration/homologacao-h7/check-frontend-binding.sh");
const SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_-]{10,}\./, // JWT
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]+/,
  /postgres(?:ql)?:\/\//i,
  /service_role/i,
];

describe("Gate de binding CultivoFarm", () => {
  it("o script do gate existe no repositório", () => {
    expect(existsSync(GATE)).toBe(true);
  });

  it("o gate aprova o binding atual e não expõe segredos", () => {
    let output: string;
    try {
      output = execFileSync("bash", [GATE], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      const detail = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
      throw new Error(`Gate de binding reprovou: ${detail}`);
    }

    expect(output).toContain("H7d BINDING GATE: OK");
    expect(output).toContain("swzpzcwiasxmjutrmvkm");
    for (const pattern of SECRET_PATTERNS) {
      expect(pattern.test(output), `saída do gate casou com ${pattern}`).toBe(false);
    }
  });

  it("falha fechado quando o projeto esperado diverge do binding atual", () => {
    const result = spawnSync("bash", [GATE], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, CULTIVOFARM_REF_EXPECTED: "ref-divergente" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("H7d BINDING GATE: ABORT");
  });
});
