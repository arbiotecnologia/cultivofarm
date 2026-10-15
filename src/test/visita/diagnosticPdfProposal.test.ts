import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// Executa a expressão proposta, não verifica copy/markup/snapshot.
const patch = readFileSync("scripts/rbac-audit/proposed-diagnostic-and-pdf-ui.patch", "utf8");
const volumeExpression = patch.split("\n").find(line => line.startsWith("+      volumeTotal:"))?.slice("+      volumeTotal:".length).trim().replace(/,$/, "");
if (!volumeExpression) throw new Error("Expressão proposta de volume ausente");
const formatVolume = new Function("os", `return ${volumeExpression};`) as (os: { volume_total_ml: number | null }) => string;

describe("proposta PDF sem volume inventado", () => {
  it("NULL não vira volume numérico nem dispara toFixed", () => {
    const result = formatVolume({ volume_total_ml: null });
    expect(result).not.toMatch(/\d|mL| L$/);
  });
  it("preserva zero informado", () => expect(formatVolume({ volume_total_ml: 0 })).toBe("0 mL"));
  it("preserva mL abaixo de 1000", () => expect(formatVolume({ volume_total_ml: 999 })).toBe("999 mL"));
  it("converte 1000mL em 1L", () => expect(formatVolume({ volume_total_ml: 1000 })).toBe("1.00 L"));
});

describe("claims de ensaio atualizadas", () => {
  it("iat atual e exp uma hora depois para cada ator", () => {
    const uuids = [80, 81, 82].map(n => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, "0")}`);
    const sql = execFileSync("node", ["scripts/rbac-audit/build-hotfix-visit12-hosted-rollback.mjs", ...uuids], { encoding: "utf8" });
    // Executa a construção de tempo em valores concretos; o SQL será avaliado no instante do ensaio.
    const expressions = [...sql.matchAll(/'iat',extract\(epoch FROM clock_timestamp\(\)\)::bigint,'exp',extract\(epoch FROM clock_timestamp\(\)\)::bigint\+(\d+)/g)];
    expect(expressions).toHaveLength(3);
    for (const expression of expressions) expect(Number(expression[1])).toBe(3600);
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION|CREATE TRIGGER/);
  });
});