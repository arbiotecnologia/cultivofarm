/**
 * Fase SINIEF 3 — Testes estáticos:
 * - Nenhum novo módulo SINIEF 49 chama Supabase/persistência.
 * - `canTransmit` nunca é atribuído `true` em qualquer arquivo do domínio.
 * - Wizard integra o painel como aba adicional preservando o fluxo legado.
 * - Mapper de persistência está desabilitado por constante literal.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DOMAIN_DIR = join(process.cwd(), "src/lib/fiscal/sinief49");
const PANEL = join(
  process.cwd(),
  "src/components/fiscal/documentos/sinief49/SinefOperationsPanel.tsx",
);
const WIZARD = join(
  process.cwd(),
  "src/components/fiscal/documentos/RascunhoWizard.tsx",
);

function domainFiles(): string[] {
  return readdirSync(DOMAIN_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(DOMAIN_DIR, f));
}

describe("Fase SINIEF 3 · auditoria estática de integração segura", () => {
  it("nenhum arquivo do domínio importa supabase-js ou o client de projeto", () => {
    for (const f of domainFiles()) {
      const src = readFileSync(f, "utf8");
      expect(src, `Arquivo ${f} não pode importar supabase`).not.toMatch(
        /from\s+["'](?:@supabase\/supabase-js|@\/integrations\/supabase\/client)["']/,
      );
    }
  });

  it("painel SinefOperationsPanel não faz nenhuma chamada Supabase", () => {
    const src = readFileSync(PANEL, "utf8");
    expect(src).not.toMatch(/from\s+["']@supabase\/supabase-js["']/);
    expect(src).not.toMatch(/@\/integrations\/supabase\/client/);
    expect(src).not.toMatch(/\bsupabase\s*\./);
  });

  it("canTransmit nunca é atribuído `true` no domínio nem no painel", () => {
    const files = [...domainFiles(), PANEL];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, `canTransmit=true detectado em ${f}`).not.toMatch(
        /canTransmit\s*[:=]\s*true/,
      );
    }
  });

  it("mapper de persistência declara PERSISTENCE_MAPPER_ENABLED=false literal", () => {
    const src = readFileSync(join(DOMAIN_DIR, "persistenceMapper.ts"), "utf8");
    expect(src).toMatch(/PERSISTENCE_MAPPER_ENABLED\s*=\s*false as const/);
  });

  it("wizard integra o painel como aba adicional (sinief49) sem remover as legadas", () => {
    const src = readFileSync(WIZARD, "utf8");
    // Fluxo legado preservado
    for (const step of ["documento", "destinatario", "itens", "tributos", "revisao"]) {
      expect(src).toContain(`value="${step}"`);
    }
    // Nova aba
    expect(src).toContain(`value="sinief49"`);
    expect(src).toContain("SinefOperationsPanel");
  });
});
