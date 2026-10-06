import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { VersaoComercialEditor } from "@/components/plataforma/VersaoComercialEditor";

const sql = readFileSync("supabase/migrations/20261006203913_86ba5af8-2a95-44e2-9e0b-8b1c8558183c.sql", "utf8");

const catalogoData = {
  modules: [{ id: "m1", key: "producao_estoque", name: "Produção e estoque", description: "", active: true }],
  features: [{ id: "f1", module_id: "m1", key: "ordens_producao", name: "Ordens de produção", description: "", active: true, commercializable: true, created_at: "2026-10-06T00:00:00Z" }],
  limits: [{ id: "l1", key: "ordens_producao_mes", name: "Ordens de produção por mês", description: "Quantidade criada no mês.", category: "criacoes_mensais", unit: "ordens/mês", value_type: "integer", application: "ordens_servico", active: true }],
  featureLimits: [{ feature_id: "f1", limit_definition_id: "l1", required: false }],
  dependencies: [],
};
const planos = { data: [{ id: "p1", key: "base", name: "Base", active: true }] };
const versoes = { data: [] as unknown[], refetch: vi.fn() };
const catalogo = { data: catalogoData };
const idle = { mutate: vi.fn(), isPending: false, isError: false };
vi.mock("@/hooks/usePlataformaSaaS", () => ({
  mensagemErroPlataforma: () => "Erro",
  mensagemErroComCorrelacao: () => "Erro",
  usePlanosSaaS: () => planos,
  useVersoesPlanosSaaS: () => versoes,
  useCatalogoPlanosSaaS: () => catalogo,
  useSalvarRascunhoPlano: () => idle,
  useValidarRascunhoPlano: () => idle,
  usePublicarRascunhoPlano: () => idle,
}));

describe("Limites de uso do plano — editor", () => {
  it("agrupa por módulo/funcionalidade, mostra unidade e estados, sem JSON", () => {
    const { container } = render(<VersaoComercialEditor />);
    fireEvent.click(screen.getByLabelText("Plano *"));
    fireEvent.click(screen.getByText("Base"));
    if (!screen.queryByText("Ordens de produção por mês")) { fireEvent.click(screen.getByLabelText("Selecionar módulo Produção e estoque")); fireEvent.click(screen.getByRole("button", { name: "Confirmar" })); }
    expect(screen.getByTestId("limites-modulo-producao_estoque")).toBeTruthy();
    expect(screen.getByText("Ordens de produção por mês")).toBeTruthy();
    expect(screen.getByText(/ordens\/mês/)).toBeTruthy();
    expect(screen.getByLabelText("Estado de Ordens de produção por mês")).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();
    expect(screen.queryByText("Visualização técnica")).toBeNull();
  });
});

describe("Migração de limites e isolamento do back-office", () => {
  it("definições sem valor comercial e vínculos não obrigatórios", () => {
    expect(sql).toContain("INSERT INTO public.saas_limit_definitions");
    expect(sql).not.toMatch(/limit_value|price_amount|limits_snapshot\s*=/);
    expect(sql).toContain("SELECT f.id, l.id, false");
  });
  it("simulações usam o gate central e não confiam no partner_id do cliente", () => {
    expect(sql).toContain("FUNCTION platform_private.assert_b2b_partner_scope");
    expect(sql).toContain("_uid <> auth.uid()");
    expect(sql).toContain("pa.deleted_at IS NULL");
    expect(sql).toContain("forbidden_financial_terms");
    expect(sql).toContain("s.org_partner IS DISTINCT FROM _partner");
    expect(sql).toContain("s.user_partner IS DISTINCT FROM _partner");
    expect(sql).toContain("v_partner := s.user_partner;");
    expect(sql).toContain("PERFORM platform_private.assert_b2b_partner_scope(v_uid, p_partner_id);");
    expect(sql).toContain("REVOKE ALL ON FUNCTION platform_private.assert_b2b_partner_scope(uuid, uuid) FROM PUBLIC, anon, authenticated;");
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.(fn_resolve_commercial_price|fn_resolve_b2b_cart|fn_b2b_resolve_base_unit_price)/);
  });
});
