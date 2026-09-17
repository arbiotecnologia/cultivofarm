import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guardas estaticas dos artefatos de saida do backend gerenciado.
 * Os scripts sao somente leitura e nao podem escrever no projeto canonico.
 */

const ROOT = resolve(__dirname, "../../..");
const CANONICAL_REF = "swzpzcwiasxmjutrmvkm";

const read = (relative: string): string =>
  readFileSync(resolve(ROOT, relative), "utf8");

describe("Cloud exit — artefatos de inventario", () => {
  const inventory = read("scripts/cloud-exit/inventory-cloud.sh");
  const exporter = read("scripts/cloud-exit/export-selective.sh");
  const report = read("docs/auditorias/cultivo-farm-cloud-exit-inventory.md");

  it("os arquivos existem", () => {
    expect(existsSync(resolve(ROOT, "scripts/cloud-exit/inventory-cloud.sh"))).toBe(true);
    expect(existsSync(resolve(ROOT, "scripts/cloud-exit/export-selective.sh"))).toBe(true);
    expect(existsSync(resolve(ROOT, "docs/auditorias/cultivo-farm-cloud-exit-inventory.md"))).toBe(true);
  });

  it("o inventario e somente leitura e recusa o canonico como origem", () => {
    expect(inventory).toContain("default_transaction_read_only = on");
    expect(inventory).toContain(CANONICAL_REF);
    expect(inventory).toContain("FAIL-CLOSED");
    expect(inventory).not.toMatch(/\b(insert|update|delete|drop|alter|create)\s+/i);
  });

  it("o export seletivo exige destino canonico, lista explicita e confirmacao", () => {
    expect(exporter).toContain(`TARGET_REF" != "${"${CANONICAL_REF}"}`);
    expect(exporter).toContain("--i-have-audited-the-diff");
    expect(exporter).toContain("TABLES");
    expect(exporter).toContain("DENYLIST");
    expect(exporter).toContain("default_transaction_read_only = on");
  });

  it("nenhum script cita refs proibidos adicionais", () => {
    for (const source of [inventory, exporter]) {
      expect(source).not.toContain("chkgpuawcswhefiabwsm");
      expect(source).not.toContain("navfzbwgwzruipouyfnk");
      expect(source).not.toContain("ikaauvsflpmamgxmkhoq");
      expect(source).not.toContain("yzszlzjpovmcteuxjznj");
    }
  });

  it("o relatorio registra origem vazia e nao promete desvinculacao", () => {
    expect(report).toContain("0");
    expect(report).toContain("fiscal_environment_marker");
    expect(report).toContain("Não existe desvinculação");
    expect(report).toContain("production_emission_allowed=false");
  });
});
