import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-D — gate estático do inventário de funções `SECURITY DEFINER` executáveis por
 * `authenticated` na homologação, e do dossiê do lote H9-D-L1.
 *
 * Aritmética obrigatória:
 *   universo bruto            = 376
 *   fora do escopo profundo   =  84 (herdadas da H9-C, com referência explícita)
 *   escopo profundo H9-D      = 292
 *
 * Regras de prova:
 *   - regex/posição é apenas TRIAGEM e nunca promove uma assinatura;
 *   - AUTH_COMPROVADA/NAO_APLICAVEL exigem evidência específica (dossiê ou decisão
 *     manual) chaveada pela ASSINATURA CANÔNICA COMPLETA, nunca pelo nome;
 *   - evidência vaga ("delegação a função guardada", frases genéricas de regex)
 *     é proibida;
 *   - o lote H9-D-L1 tem exatamente 30 assinaturas, únicas e sem colisão por
 *     sobrecarga.
 */
const ROOT = resolve(__dirname, "../../..");
const DIR = resolve(ROOT, "restoration/homologacao-h9/h9d-inventario");

const resumo = JSON.parse(readFileSync(resolve(DIR, "resumo-h9d.json"), "utf8")) as {
  total_bruto: number;
  fora_escopo_h9d: number;
  escopo_h9d: number;
  ledger: number;
  ambiente: string;
  lotes_auditados: string[];
  por_classificacao: Record<string, number>;
};

const dossie = JSON.parse(readFileSync(resolve(DIR, "dossie-l1.json"), "utf8")) as {
  ambiente: string;
  ledger: number;
  lote: string;
  total: number;
  assinaturas: Record<
    string,
    {
      acl: string;
      search_path: string;
      body_md5: string;
      body_len: number;
      guarda_textual: string;
      cadeia_transitiva: string;
      null_fail_closed: string;
      tenant_bola_idor: string;
      sql_dinamico: string;
      callsites: string;
      classificacao: string;
    }
  >;
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
  "delegação a função guardada",
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

  it("nenhuma classificação conclusiva usa evidência genérica ou vaga", () => {
    const conclusivas = rows.filter(
      (r) => r.classificacao_h9d === "AUTH_COMPROVADA" || r.classificacao_h9d === "NAO_APLICAVEL",
    );
    expect(conclusivas.length).toBeGreaterThan(0);
    for (const r of conclusivas) {
      expect(r.evidencia.length).toBeGreaterThan(60);
      for (const g of GENERICA) expect(r.evidencia.includes(g), `evidência vaga em ${r.signature}`).toBe(false);
      expect(/dossi|Corpo lido|corpo lido|teste|Primitivo/.test(r.evidencia), r.signature).toBe(true);
    }
  });

  it("as pendentes declaram lote determinístico e não afirmam segurança", () => {
    const pend = rows.filter((r) => r.classificacao_h9d === "PENDENTE_EVIDENCIA");
    expect(pend.length).toBe(resumo.por_classificacao.PENDENTE_EVIDENCIA);
    for (const r of pend) {
      expect(/Lote determinístico H9-D-L\d+/.test(r.evidencia), r.signature).toBe(true);
      // nenhuma pendente pode ser rotulada como já auditada no L1
      expect(r.evidencia).not.toContain("Lote determinístico H9-D-L1.");
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

describe("H9-D — dossiê do lote L1", () => {
  const chaves = Object.keys(dossie.assinaturas);
  const inventario = new Map(rows.map((r) => [r.signature, r]));

  it("declara homologação, ledger e lote", () => {
    expect(dossie.ambiente).toBe("ikaauvsflpmamgxmkhoq");
    expect(dossie.ledger).toBe(662);
    expect(dossie.lote).toBe("H9-D-L1");
    expect(resumo.lotes_auditados).toContain("H9-D-L1");
  });

  it("contém exatamente 30 assinaturas únicas", () => {
    expect(dossie.total).toBe(30);
    expect(chaves).toHaveLength(30);
    expect(new Set(chaves).size).toBe(30);
  });

  it("toda chave é assinatura canônica completa e existe no inventário", () => {
    for (const k of chaves) {
      expect(k, `chave sem lista de argumentos: ${k}`).toMatch(/^[a-z0-9_]+\(.*\)$/);
      expect(inventario.has(k), `assinatura ausente do inventário: ${k}`).toBe(true);
      expect(inventario.get(k)!.escopo_h9d).toBe("ESCOPO_PROFUNDO_H9D");
    }
  });

  it("não há promoção por nome: cada nome sobrecarregado é tratado por assinatura", () => {
    for (const k of chaves) {
      const nome = k.slice(0, k.indexOf("("));
      const mesmasBases = rows.filter((r) => r.signature.startsWith(`${nome}(`));
      for (const r of mesmasBases) {
        if (r.signature === k) continue;
        // Uma sobrecarga não coberta pelo dossiê nunca pode herdar a evidência do L1.
        expect(r.evidencia.includes("Lote H9-D-L1"), `colisão por overload em ${r.signature}`).toBe(false);
      }
    }
  });

  it("cada assinatura do L1 tem evidência específica e completa", () => {
    for (const [k, d] of Object.entries(dossie.assinaturas)) {
      expect(d.classificacao).toBe("AUTH_COMPROVADA");
      expect(d.body_md5).toMatch(/^[0-9a-f]{32}$/);
      expect(d.body_len).toBeGreaterThan(100);
      expect(d.acl).toContain("authenticated");
      expect(d.search_path).toContain("search_path");
      expect(d.guarda_textual.length).toBeGreaterThan(20);
      expect(d.cadeia_transitiva.length).toBeGreaterThan(20);
      expect(d.null_fail_closed.length).toBeGreaterThan(3);
      expect(d.tenant_bola_idor.length).toBeGreaterThan(10);
      expect(d.sql_dinamico.length).toBeGreaterThan(3);
      expect(d.callsites.length).toBeGreaterThan(10);
      for (const g of GENERICA) expect(d.guarda_textual.includes(g), k).toBe(false);
    }
  });

  it("o inventário reflete o dossiê nas 30 assinaturas do L1", () => {
    for (const k of chaves) {
      const r = inventario.get(k)!;
      expect(r.classificacao_h9d).toBe("AUTH_COMPROVADA");
      expect(r.evidencia).toContain("Lote H9-D-L1");
      expect(r.evidencia).toContain(dossie.assinaturas[k].body_md5);
    }
  });
});
