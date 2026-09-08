import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-D — gate estático do inventário de funções `SECURITY DEFINER` executáveis por
 * `authenticated` na homologação.
 *
 * Aritmética obrigatória (retificação metodológica):
 *   universo bruto            = 376
 *   fora do escopo profundo   =  84 (herdadas da H9-C, com referência explícita)
 *   escopo profundo H9-D      = 292 (186 PENDENTE_EVIDENCIA_ONDA_POSTERIOR +
 *                                    106 SEM_ESCRITA_NAO_AUDITADA_EM_PROFUNDIDADE)
 *
 * Regex é apenas TRIAGEM: nenhuma linha AUTH_COMPROVADA/NAO_APLICAVEL pode usar
 * evidência genérica; cada uma cita o dossiê de leitura e a guarda da própria
 * assinatura (ou a decisão manual registrada).
 */
const ROOT = resolve(__dirname, "../../..");
const DIR = resolve(ROOT, "restoration/homologacao-h9/h9d-inventario");

const resumo = JSON.parse(readFileSync(resolve(DIR, "resumo-h9d.json"), "utf8")) as {
  total_bruto: number;
  fora_escopo_h9d: number;
  escopo_h9d: number;
  ledger: number;
  ambiente: string;
  por_classificacao: Record<string, number>;
};

const tsv = readFileSync(resolve(DIR, "secdef-authenticated-inventory-h9d.tsv"), "utf8").trim().split("\n");
const header = tsv[0].split("\t");
const rows = tsv.slice(1).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [header[i], v])));

const ESCOPO = new Set([
  "AUTH_COMPROVADA",
  "NAO_APLICAVEL",
  "EXPOSICAO_COMPROVADA_CORRIGIDA",
  "PENDENTE_EVIDENCIA",
]);

const GENERICA = [
  "guarda de identidade/papel precede o primeiro acesso sensivel",
  "guarda de identidade/papel precede o primeiro acesso sensível",
];

describe("H9-D — inventário de SECURITY DEFINER por authenticated", () => {
  it("declara homologação e o ledger corrente", () => {
    expect(resumo.ambiente).toContain("ikaauvsflpmamgxmkhoq");
    expect(resumo.ledger).toBe(662);
  });

  it("separa universo bruto, herança da H9-C e escopo profundo", () => {
    expect(resumo.total_bruto).toBe(376);
    expect(rows).toHaveLength(376);
    expect(resumo.fora_escopo_h9d).toBe(84);
    expect(resumo.escopo_h9d).toBe(292);
    expect(resumo.fora_escopo_h9d + resumo.escopo_h9d).toBe(resumo.total_bruto);
  });

  it("a soma das classificações do escopo fecha exatamente em 292", () => {
    const soma = Object.values(resumo.por_classificacao).reduce((a, b) => a + b, 0);
    expect(soma).toBe(292);
    for (const k of Object.keys(resumo.por_classificacao)) expect(ESCOPO.has(k)).toBe(true);
  });

  it("as 84 herdadas citam a H9-C e não são recontadas como prova nova", () => {
    const herdadas = rows.filter((r) => r.escopo_h9d === "FORA_ESCOPO_H9D_HERDADO_H9C");
    expect(herdadas).toHaveLength(84);
    for (const r of herdadas) {
      expect(r.classificacao_h9d).toBe("HERDADA_H9C");
      expect(r.evidencia).toContain("03-h9c-secdef-authenticated.md");
    }
  });

  it("nenhuma classificação conclusiva usa evidência genérica de regex", () => {
    const conclusivas = rows.filter(
      (r) => r.classificacao_h9d === "AUTH_COMPROVADA" || r.classificacao_h9d === "NAO_APLICAVEL",
    );
    expect(conclusivas.length).toBeGreaterThan(0);
    for (const r of conclusivas) {
      expect(r.evidencia.length).toBeGreaterThan(60);
      for (const g of GENERICA) expect(r.evidencia).not.toBe(g);
      expect(/dossi|Corpo lido|corpo lido|teste|Primitivo|delega/.test(r.evidencia)).toBe(true);
    }
  });

  it("as pendentes declaram lote determinístico e não afirmam segurança", () => {
    const pend = rows.filter((r) => r.classificacao_h9d === "PENDENTE_EVIDENCIA");
    expect(pend.length).toBe(resumo.por_classificacao.PENDENTE_EVIDENCIA);
    for (const r of pend) {
      expect(/Lote determinístico H9-D-L\d+|least-privilege|callsites|não foram comprovados|pendente/i.test(r.evidencia)).toBe(
        true,
      );
    }
  });

  it("registra a exposição corrigida da H9-D1 exatamente uma vez", () => {
    const exp = rows.filter((r) => r.classificacao_h9d === "EXPOSICAO_COMPROVADA_CORRIGIDA");
    expect(exp).toHaveLength(1);
    expect(exp[0].signature.startsWith("fn_run_recurring_generation(")).toBe(true);
    expect(exp[0].evidencia).toContain("20261006000000");
  });

  it("assinaturas são únicas e ordenadas de forma determinística", () => {
    const sigs = rows.map((r) => r.signature);
    expect(new Set(sigs).size).toBe(sigs.length);
    expect([...sigs].sort()).toEqual(sigs);
  });
});
