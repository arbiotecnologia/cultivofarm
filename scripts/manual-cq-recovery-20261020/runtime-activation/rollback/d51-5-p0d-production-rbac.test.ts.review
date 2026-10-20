import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const permissions = readFileSync(resolve(ROOT, "src/lib/permissions.ts"), "utf8");
const clientes = readFileSync(resolve(ROOT, "src/pages/clientes/ProdutoresTab.tsx"), "utf8");
const fazendas = readFileSync(resolve(ROOT, "src/pages/Fazendas.tsx"), "utf8");
const talhoes = readFileSync(resolve(ROOT, "src/pages/Talhoes.tsx"), "utf8");
const talhoesFazenda = readFileSync(resolve(ROOT, "src/components/fazendas/TalhoesFazendaTab.tsx"), "utf8");
const cq = readFileSync(resolve(ROOT, "src/components/cockpit/RegistrarCQDialog.tsx"), "utf8");
const envase = readFileSync(resolve(ROOT, "src/pages/EnvasePage.tsx"), "utf8");

describe("D51.5 P0-D — frontend alinhado ao ACCESS_MAP", () => {
  it("preserva os papéis de escrita declarados para cadastros", () => {
    expect(permissions).toMatch(/"\/clientes":\s*\{[\s\S]*?administrador: "rw", gestor: "rw", gestor_comercial: "rw"/);
    expect(permissions).toMatch(/"\/fazendas":\s*\{[\s\S]*?administrador: "rw", gestor: "rw"/);
    expect(permissions).toMatch(/"\/talhoes":\s*\{[\s\S]*?administrador: "rw", gestor: "rw"/);
  });

  it("oculta mutações de clientes, fazendas e talhões para perfis read-only", () => {
    expect(clientes).toContain('canWrite(role, "/clientes")');
    expect(fazendas).toContain('canWrite(role, "/fazendas")');
    expect(talhoes).toContain('canWrite(role, "/talhoes")');
    expect(talhoesFazenda).toContain('canWrite(role, "/talhoes")');
    for (const source of [clientes, fazendas, talhoes, talhoesFazenda]) {
      expect(source).toMatch(/canManage\s*&&|canManage\s*\?/);
    }
  });

  it("bloqueia lançamento de CQ fora dos papéis autorizados", () => {
    expect(cq).toContain('if (!canEditRef)');
    expect(cq).toContain('disabled={!canEditRef || saving || !form.resultado}');
  });

  it("não oferece envase complementar a perfil somente leitura", () => {
    expect(envase).toContain('canWrite(role, "/envase")');
    expect(envase).toContain("canManage && lotesComplementares.length > 0");
  });
});