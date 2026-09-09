import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-F — gates estáticos de fechamento da auditoria H9.
 *
 * 1. O gate de ambiente (`h9f-binding-gate.sh`) roda dentro da suíte: qualquer
 *    drift de `.env`, `client.ts`, `config.toml` ou `types.ts` para o sandbox
 *    Lovable Cloud quebra os testes antes de qualquer acesso a banco.
 * 2. O pacote de promoção é verificado: 19 forwards na ordem exata, cada um com
 *    rollback correspondente, hashes conferidos e as 59 migrations
 *    BLOQUEADA_PERMANENTE formalmente excluídas.
 *
 * Nenhum teste aqui acessa banco, e nada expõe segredos.
 */

const ROOT = resolve(__dirname, "../../..");
const GATE = resolve(ROOT, "restoration/homologacao-h9/h9f-gates/h9f-binding-gate.sh");
const PACOTE = resolve(
  ROOT,
  "restoration/homologacao-h9/h9f-pacote/h9f-pacote-promocao.json",
);
const STAGING_REF = "ikaauvsflpmamgxmkhoq";
const SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_-]{10,}\./,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]+/,
  /postgres(?:ql)?:\/\//i,
  /service_role/i,
];

interface Forward {
  ordem: number;
  version: string;
  forward_path: string;
  forward_sha256: string;
  rollback_path: string;
  rollback_sha256: string;
  aplicado_em_staging: boolean;
}

const pacote = JSON.parse(readFileSync(PACOTE, "utf8")) as {
  project_ref_homologacao: string;
  ambientes_proibidos: string[];
  ledger_homologacao: number;
  promocao_autorizada: boolean;
  total_forwards: number;
  ordem_aplicacao: string[];
  ordem_rollback_inversa: string[];
  forwards: Forward[];
  exclusoes_bloqueada_permanente: {
    total: number;
    itens: { version: string; apply_to_staging: boolean; decisao?: string }[];
  };
};

const sha256 = (p: string) =>
  createHash("sha256").update(readFileSync(resolve(ROOT, p))).digest("hex");

describe("H9-F — gate de ambiente executável", () => {
  it("o script do gate existe", () => {
    expect(existsSync(GATE)).toBe(true);
  });

  it("o gate aprova o binding atual sem expor segredos", () => {
    let output: string;
    try {
      output = execFileSync("bash", [GATE], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      throw new Error(
        `Gate H9-F reprovou: ${`${err.stdout ?? ""}${err.stderr ?? ""}`.trim()}`,
      );
    }
    expect(output).toContain("H9F BINDING GATE: OK");
    expect(output).toContain(STAGING_REF);
    for (const pattern of SECRET_PATTERNS) {
      expect(pattern.test(output), `saída casou com ${pattern}`).toBe(false);
    }
  });
});

describe("H9-F — pacote de promoção", () => {
  it("aponta para homologação e não autoriza promoção", () => {
    expect(pacote.project_ref_homologacao).toBe(STAGING_REF);
    expect(pacote.promocao_autorizada).toBe(false);
    expect(pacote.ledger_homologacao).toBe(679);
    expect(pacote.ambientes_proibidos).toEqual([
      "navfzbwgwzruipouyfnk",
      "yzszlzjpovmcteuxjznj",
    ]);
  });

  it("declara exatamente 19 forwards em ordem cronológica estrita", () => {
    expect(pacote.total_forwards).toBe(19);
    expect(pacote.forwards).toHaveLength(19);
    const versions = pacote.forwards.map((f) => f.version);
    expect(versions).toEqual([...versions].sort());
    expect(new Set(versions).size).toBe(19);
    expect(pacote.ordem_aplicacao).toEqual(versions);
    expect(pacote.ordem_rollback_inversa).toEqual([...versions].reverse());
  });

  it("cada forward tem arquivo, rollback e hash íntegros", () => {
    const drift = pacote.forwards.filter((f) => {
      try {
        return (
          sha256(f.forward_path) !== f.forward_sha256 ||
          sha256(f.rollback_path) !== f.rollback_sha256
        );
      } catch {
        return true;
      }
    });
    expect(drift.map((f) => f.version)).toEqual([]);
  });

  it("forward e rollback compartilham a mesma versão", () => {
    const mismatch = pacote.forwards.filter(
      (f) =>
        !f.forward_path.includes(`${f.version}_`) ||
        !f.rollback_path.includes(`${f.version}_`),
    );
    expect(mismatch.map((f) => f.version)).toEqual([]);
  });

  it("as 59 migrations BLOQUEADA_PERMANENTE estão formalmente excluídas", () => {
    expect(pacote.exclusoes_bloqueada_permanente.total).toBe(59);
    expect(pacote.exclusoes_bloqueada_permanente.itens).toHaveLength(59);
    const aplicaveis = pacote.exclusoes_bloqueada_permanente.itens.filter(
      (e) => e.apply_to_staging,
    );
    expect(aplicaveis.map((e) => e.version)).toEqual([]);
    const semDecisao = pacote.exclusoes_bloqueada_permanente.itens.filter(
      (e) => !e.decisao,
    );
    expect(semDecisao.map((e) => e.version)).toEqual([]);
  });

  it("nenhuma migration excluída aparece no pacote promovível", () => {
    const promovidas = new Set(pacote.forwards.map((f) => f.version));
    const colisao = pacote.exclusoes_bloqueada_permanente.itens.filter((e) =>
      promovidas.has(e.version),
    );
    expect(colisao.map((e) => e.version)).toEqual([]);
  });
});

describe("H9-F — provas versionadas no repositório", () => {
  const provas = [
    "restoration/homologacao-h9/h9f-provas/h9f-prova-cardinalidade-concorrencia.py",
    "restoration/homologacao-h9/h9f-provas/h9f-matriz-adversarial-12.sql",
    "restoration/homologacao-h9/h9e-provas/h9e2-prova-authz-sem-oraculo.sql",
  ];

  it("as provas de concorrência e adversarial estão versionadas", () => {
    const faltando = provas.filter((p) => !existsSync(resolve(ROOT, p)));
    expect(faltando).toEqual([]);
  });

  it("a prova de concorrência exige cardinalidade e limpeza em finally", () => {
    const src = readFileSync(resolve(ROOT, provas[0]), "utf8");
    expect(src).toContain("solicitacoes_timeline");
    expect(src).toContain("residuo zero apos limpeza (finally)");
    expect(src).toContain("cardinalidade visitas_logs");
    expect(src).toContain("ikaauvsflpmamgxmkhoq");
  });

  it("a matriz adversarial cobre 3 RPCs x 4 sondas = 12 casos", () => {
    const src = readFileSync(resolve(ROOT, provas[1]), "utf8");
    expect(src).toContain("'finish','checkin','checkout'");
    expect(src).toContain("'ghost:existente','ghost:aleatorio','alheio:existente','alheio:aleatorio'");
    expect(src).toContain("v_pass <> 12");
  });
});
