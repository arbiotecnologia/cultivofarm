import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { runInNewContext } from "node:vm";
import type { VisitaPdfData } from "@/lib/pdfVisita";

// Executa o corpo completo de buildPdfData do código real, não uma expressão do patch.
// Somente dependências do closure recebem fixtures locais; nenhuma consulta/escrita remota.
const source = ts.createSourceFile("VisitaTecnica.tsx", readFileSync("src/pages/VisitaTecnica.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let buildPdfNode: ts.ArrowFunction | undefined;
function findBuilder(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "buildPdfData" && node.initializer && ts.isArrowFunction(node.initializer)) {
    buildPdfNode = node.initializer;
  }
  ts.forEachChild(node, findBuilder);
}
findBuilder(source);
if (!buildPdfNode) throw new Error("Função efetiva buildPdfData ausente");
const builderCode = ts.transpileModule(`const buildPdfData = ${ts.createPrinter().printNode(ts.EmitHint.Expression, buildPdfNode, source)}; buildPdfData();`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
type OsFixture = { volume_total_ml: number | null | undefined; dose_ml_ha: number | null | undefined };
function buildData(os: OsFixture, visita: object | null = {}) {
  return runInNewContext(builderCode, {
    visita, arquivos: [], checkins: [], fotos: [], config: null,
    ordensConsolidado: [{ ...os, area_hectares: 2, status: "aberta", produtos: { nome: "Biológico teste" } }],
    descricaoTecnica: "", encerramento: {}, conduta: {},
    formatOS: () => "OS teste", formatDateDisplay: () => "", formatDateTimeDisplay: () => "",
  }) as VisitaPdfData | null;
}
function effectiveOs(os: OsFixture) {
  const result = buildData(os)?.osVinculadas?.[0];
  if (!result) throw new Error("OS ausente no resultado efetivo do PDF");
  return result;
}

describe("buildPdfData efetivo sem volume ou dose inventados", () => {
  it("NULL não vira volume numérico nem dispara toFixed", () => {
    const result = effectiveOs({ volume_total_ml: null, dose_ml_ha: 12 });
    expect(result.volumeTotal).not.toMatch(/\d|mL| L$/);
    expect(result.dose).toBe("12 mL/ha");
  });
  it("dose NULL não vira quantidade ou unidade inferida", () => {
    const result = effectiveOs({ volume_total_ml: 1000, dose_ml_ha: null });
    expect(result.dose).not.toMatch(/\d|mL|ha/);
    expect(result.volumeTotal).toBe("1.00 L");
  });
  it("ausência de ambos não dispara exceção nem inventa medidas", () => {
    const result = effectiveOs({ volume_total_ml: undefined, dose_ml_ha: undefined });
    expect(result.volumeTotal).not.toMatch(/\d|mL| L$/);
    expect(result.dose).not.toMatch(/\d|mL|ha/);
  });
  it("preserva zero informado sem confundir com ausência", () => {
    const result = effectiveOs({ volume_total_ml: 0, dose_ml_ha: 0 });
    expect(result.volumeTotal).toBe("0 mL");
    expect(result.dose).toBe("0 mL/ha");
  });
  it("preserva mL abaixo de 1000", () => expect(effectiveOs({ volume_total_ml: 999, dose_ml_ha: 3 }).volumeTotal).toBe("999 mL"));
  it("converte 1000mL em 1L", () => expect(effectiveOs({ volume_total_ml: 1000, dose_ml_ha: 3 }).volumeTotal).toBe("1.00 L"));
  it("mantém arredondamento de volume informado", () => expect(effectiveOs({ volume_total_ml: 1250, dose_ml_ha: 2.5 }).volumeTotal).toBe("1.25 L"));
  it("sem visita permanece sem documento", () => expect(buildData({ volume_total_ml: null, dose_ml_ha: null }, null)).toBeNull());
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