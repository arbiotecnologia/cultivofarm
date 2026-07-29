import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * GUARD DE PADRONIZAÇÃO — unidades, arredondamentos e custo por hectare.
 *
 * Toda tela dentro do escopo de catálogo/comercial/portal do parceiro deve
 * derivar formatação e arredondamento de `src/lib/catalogo/formatUnidades.ts`.
 * Este teste falha quando alguém reintroduz `toFixed`, literais de rótulo
 * ("Sob consulta", "Custo/ha") ou interpolação manual de "R$ ".
 */

const ROOT = join(process.cwd(), "src");

/** Diretórios/arquivos auditados. */
const ESCOPO = [
  "components/catalogo",
  "components/comercial",
  "pages/portal-parceiro",
  "lib/catalogo",
  "lib/pdf",
  "hooks/usePartnerCatalog.ts",
  "hooks/usePartnerCatalogTecnico.ts",
  "hooks/usePartnerPrices.ts",
];

/** Exceções justificadas (não são unidades de preço/área/volume). */
const ALLOWLIST = new Set<string>([
  "components/comercial/FaseSlaBadge.tsx", // horas de SLA, não unidade comercial
]);

const REGRAS: { nome: string; re: RegExp; dica: string }[] = [
  {
    nome: "toFixed",
    re: /\.toFixed\s*\(/,
    dica: "use round2/roundDose/roundArea/roundVolume ou os formatadores de formatUnidades.ts",
  },
  {
    nome: 'literal "Sob consulta"',
    re: /["'`]Sob consulta["'`]/,
    dica: "use SOB_CONSULTA_LABEL",
  },
  {
    nome: 'literal "Custo/ha"',
    re: /["'`]Custo\/ha["'`]/,
    dica: "use LABEL_CUSTO_HA_CURTO",
  },
  {
    nome: "interpolação manual de R$",
    re: /R\$\s*\{/,
    dica: "use formatarMoeda()/brl()",
  },
];

function listarArquivos(alvo: string): string[] {
  const abs = join(ROOT, alvo);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return [];
  }
  if (st.isFile()) return [abs];
  return readdirSync(abs).flatMap((entry) => listarArquivos(join(alvo, entry)));
}

const ARQUIVOS = ESCOPO.flatMap(listarArquivos)
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts"))
  .map((f) => relative(ROOT, f).split(sep).join("/"))
  .filter((f) => !ALLOWLIST.has(f))
  // o próprio utilitário canônico é a fonte dos literais
  .filter((f) => f !== "lib/catalogo/formatUnidades.ts" && f !== "lib/catalogo/unidades.ts");

describe("guard: padronização de unidades e custo por hectare", () => {
  it("encontra arquivos no escopo auditado", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(10);
  });

  it.each(ARQUIVOS)("%s usa apenas formatUnidades.ts para unidades e arredondamentos", (rel) => {
    const conteudo = readFileSync(join(ROOT, rel), "utf8");
    const violacoes: string[] = [];

    conteudo.split("\n").forEach((linha, i) => {
      for (const regra of REGRAS) {
        if (regra.re.test(linha)) {
          violacoes.push(`L${i + 1} [${regra.nome}] ${linha.trim()} → ${regra.dica}`);
        }
      }
    });

    expect(violacoes, `${rel}\n${violacoes.join("\n")}`).toEqual([]);
  });
});
