import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-F — gates estáticos de fechamento da auditoria H9.
 *
 * 1. O gate histórico de ambiente (`h9f-binding-gate.sh`) permanece fail-closed
 *    para o staging da auditoria H9. Após a troca canônica para CultivoFarm,
 *    ele deve rejeitar o binding atual, sem substituir o gate vigente H7d.
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

  it("o gate histórico rejeita o binding CultivoFarm sem expor segredos", () => {
    const result = spawnSync("bash", [GATE], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("H9F BINDING GATE: ABORT");
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

describe("H9-FR — retificação: contagens oficiais e veredito binário", () => {
  const DOSSIE = resolve(
    ROOT,
    "restoration/homologacao-h9/09-h9f-fechamento-e-pacote-promocao.md",
  );
  const texto = readFileSync(DOSSIE, "utf8");

  const OFICIAIS: Array<[string, number]> = [
    ["rls_enabled_no_policy", 10],
    ["extension_in_public", 2],
    ["anon_security_definer_function_executable", 2],
    ["authenticated_security_definer_function_executable", 375],
    ["auth_leaked_password_protection", 1],
    ["unindexed_foreign_keys", 172],
    ["unused_index", 188],
    ["multiple_permissive_policies", 146],
    ["duplicate_index", 1],
  ];

  it("o dossiê registra o baseline OFICIAL dos advisors com as contagens exatas", () => {
    const faltando = OFICIAIS.filter(
      ([advisor, valor]) =>
        !new RegExp(`\`${advisor}\`\\s*\\|\\s*${valor}\\s*\\|`).test(texto),
    ).map(([advisor]) => advisor);
    expect(faltando).toEqual([]);
  });

  it("os totais oficiais 390 (segurança) e 507 (performance) estão declarados", () => {
    expect(texto).toMatch(/Segurança — TOTAL\*\*\s*\|\s*\|\s*\*\*390\*\*/);
    expect(texto).toMatch(/Performance — TOTAL\*\*\s*\|\s*\|\s*\*\*507\*\*/);
    expect(
      OFICIAIS.filter(([, v]) => typeof v === "number").reduce(
        (acc, [advisor, v]) =>
          ["unindexed_foreign_keys", "unused_index", "multiple_permissive_policies", "duplicate_index"].includes(
            advisor,
          )
            ? acc
            : acc + v,
        0,
      ),
    ).toBe(390);
  });

  it("as métricas SQL equivalentes ficam rotuladas como auxiliares, sem substituir o oficial", () => {
    expect(texto).toContain("Métrica auxiliar (SQL equivalente) — NÃO substitui o oficial");
    expect(texto).toContain("prevalece o baseline oficial");
  });

  it("o smoke autenticado está declarado como não executado e bloqueante", () => {
    expect(texto).toContain("`smoke_autenticado = false`");
    expect(texto).toContain("BLOQUEANTE DO GO INTEGRAL");
  });

  it("com smoke_autenticado=false o dossiê NÃO pode declarar GO integral", () => {
    const smokeAutenticadoFalso = texto.includes("`smoke_autenticado = false`");
    expect(smokeAutenticadoFalso).toBe(true);
    // Enquanto a prova de UI autenticada não existir, o veredito integral é NO-GO.
    expect(texto).toContain("**AUDITORIA H9 INTEGRAL** | **NO-GO**");
    expect(texto).toMatch(/AUDITORIA H9 INTEGRAL: NO-GO/);
    expect(texto).not.toMatch(/\*\*AUDITORIA H9: GO\*\*/);
  });

  it("o veredito é binário por escopo: GO técnico no backend, NO-GO integral e NO-GO promoção", () => {
    expect(texto).toContain("| Backend / RPCs de visita / pacote de promoção | **GO técnico** |");
    expect(texto).toContain("| Promoção para produção | **NO-GO** |");
  });

  it("a retificação declara que a suíte integral não foi rerrodada após H9-FR", () => {
    expect(texto).toContain("A suíte integral NÃO foi\nrerrodada após H9-FR");
  });

  it("as evidências preservadas continuam registradas (12/12, 18/18, 29/29, ledger 679, 19 forwards)", () => {
    expect(texto).toContain("12/12");
    expect(texto).toContain("18/18");
    expect(texto).toContain("29 PASS / 0 FAIL");
    expect(texto).toContain("679");
    expect(pacote.forwards).toHaveLength(19);
  });
});
