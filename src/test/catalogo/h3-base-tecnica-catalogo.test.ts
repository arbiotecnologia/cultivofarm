import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DOSE_PADRAO_ML,
  DOSES_POR_LITRO,
  calcularValorDose,
  calcularValorLitro,
  calcularDosesPorVolume,
  calcularPrecoLitro,
  calcularValorDoseVolume,
  resolverCustoHa,
} from "@/lib/catalogo/pricing";

const read = (p: string) => readFileSync(p, "utf8");

describe("H3 — regras canônicas de dose/unidade/preço", () => {
  it("mantém dose padrão de 100 mL e 1 L = 10 doses", () => {
    expect(DOSE_PADRAO_ML).toBe(100);
    expect(DOSES_POR_LITRO).toBe(10);
    expect(calcularValorLitro(21.67)).toBeCloseTo(216.7, 6);
    expect(calcularValorDose(216.7)).toBeCloseTo(21.67, 6);
    expect(calcularDosesPorVolume(5000)).toBe(50);
    expect(calcularDosesPorVolume(20000)).toBe(200);
  });

  it("deriva preço por litro e por dose da mesma fonte comercial", () => {
    const precoLitro = calcularPrecoLitro(5000, 1083.33);
    expect(precoLitro).toBeCloseTo(216.666, 3);
    expect(calcularValorDoseVolume(5000, 1083.33)).toBeCloseTo(21.6666, 4);
  });

  it("resolve custo/ha com precedência determinística", () => {
    expect(resolverCustoHa({ tipo: "produto", valorHa: 120 })).toBe(120);
    expect(resolverCustoHa({ tipo: "produto", doseMlHa: 200, valorDose: 20 })).toBe(40);
    expect(resolverCustoHa({ tipo: "produto", doseMlHa: 200, valorLitro: 200 })).toBe(40);
    expect(resolverCustoHa({ tipo: "microrganismo", valorLitro: 200 })).toBe(20);
    expect(resolverCustoHa({ tipo: "produto" })).toBeNull();
  });
});

describe("H3 — rota canônica e redirects legados", () => {
  const app = read("src/App.tsx");
  const nav = read("src/config/navigation.ts");

  it("mantém apenas o catálogo unificado em /base-tecnica?tab=catalogo-tecnico", () => {
    expect(nav).toContain('route: "/base-tecnica?tab=catalogo-tecnico"');
    expect(nav).not.toMatch(/route:\s*"\/comercial\/catalogo"/);
  });

  it("preserva o redirect da rota legada sem loop", () => {
    expect(app).toContain(
      'path="/comercial/catalogo" element={<PreservedNavigate to="/base-tecnica?tab=catalogo-tecnico" />}',
    );
  });
});

describe("H3 — visibilidade por perfil na ficha do produtor", () => {
  const ficha = read("src/components/catalogo/FichaProdutorDrawer.tsx");

  it("lê as views seguras em vez das tabelas mestres", () => {
    expect(ficha).toContain("vw_catalogo_ficha_produtos");
    expect(ficha).toContain("vw_catalogo_ficha_microrganismos");
    expect(ficha).not.toContain('from("produtos")');
    expect(ficha).not.toContain('from("microrganismos")');
  });

  it("não solicita colunas internas sensíveis", () => {
    ["fornecedor", "meio_cultivo", "preco_tabela", "safra_referencia"].forEach((c) => {
      expect(ficha).not.toContain(c);
    });
  });
});

describe("H3 — migration versionada", () => {
  const mig = read("supabase/migrations/20260908000000_h3_base_tecnica_catalogo_v1.sql");

  it("arredonda valores monetários derivados no banco", () => {
    expect(mig).toContain("round(NEW.preco_brl / (NEW.volume_ml / 1000.0), 2)");
    expect(mig).toContain("round(NEW.preco_litro_brl / 10.0, 2)");
  });

  it("remove a leitura ampla das tabelas mestres e cria as views seguras", () => {
    expect(mig).toContain('DROP POLICY IF EXISTS "Authenticated users can read produtos"');
    expect(mig).toContain('DROP POLICY IF EXISTS "Authenticated users can read microrganismos"');
    expect(mig).toContain("CREATE OR REPLACE VIEW public.vw_catalogo_ficha_produtos");
    expect(mig).toContain("CREATE OR REPLACE VIEW public.vw_catalogo_ficha_microrganismos");
    expect(mig).not.toMatch(/fornecedor|meio_cultivo|preco_tabela/);
  });
});
