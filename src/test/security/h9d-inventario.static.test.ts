import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-D — gate estático do inventário de funções `SECURITY DEFINER` executáveis por
 * `authenticated`. Garante que o inventário publicado continue determinístico, com o
 * mesmo universo auditado (376) e a aritmética das classificações fechando.
 */
const ROOT = resolve(__dirname, "../../..");
const DIR = resolve(ROOT, "restoration/homologacao-h9/h9d-inventario");

const resumo = JSON.parse(readFileSync(resolve(DIR, "resumo-h9d.json"), "utf8")) as {
  total_auditado: number;
  ledger: number;
  ambiente: string;
  por_classificacao: Record<string, number>;
};

const tsv = readFileSync(resolve(DIR, "secdef-authenticated-inventory-h9d.tsv"), "utf8")
  .trim()
  .split("\n");
const header = tsv[0].split("\t");
const rows = tsv.slice(1).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [header[i], v])));

const ALLOWED = new Set([
  "AUTH_COMPROVADA",
  "NAO_APLICAVEL",
  "EXPOSICAO_COMPROVADA_CORRIGIDA",
  "PENDENTE_EVIDENCIA",
]);

describe("H9-D — inventário de SECURITY DEFINER por authenticated", () => {
  it("declara homologação e o ledger corrente", () => {
    expect(resumo.ambiente).toContain("ikaauvsflpmamgxmkhoq");
    expect(resumo.ledger).toBe(662);
  });

  it("audita exatamente 376 funções e a aritmética fecha", () => {
    expect(resumo.total_auditado).toBe(376);
    expect(rows).toHaveLength(376);
    const soma = Object.values(resumo.por_classificacao).reduce((a, b) => a + b, 0);
    expect(soma).toBe(376);
  });

  it("só usa classificações permitidas e toda linha tem evidência", () => {
    for (const r of rows) {
      expect(ALLOWED.has(r.classificacao_h9d)).toBe(true);
      expect((r.evidencia ?? "").length).toBeGreaterThan(10);
      expect(r.schema).toBe("public");
    }
  });

  it("registra a exposição corrigida da H9-D1 exatamente uma vez", () => {
    const exp = rows.filter((r) => r.classificacao_h9d === "EXPOSICAO_COMPROVADA_CORRIGIDA");
    expect(exp).toHaveLength(1);
    expect(exp[0].signature).toBe("fn_run_recurring_generation()");
  });

  it("assinaturas são únicas e ordenadas de forma determinística", () => {
    const sigs = rows.map((r) => r.signature);
    expect(new Set(sigs).size).toBe(sigs.length);
    expect([...sigs].sort()).toEqual(sigs);
  });
});
