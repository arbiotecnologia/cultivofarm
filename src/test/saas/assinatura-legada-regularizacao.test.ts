import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mensagemErroAssinatura } from "@/hooks/usePlataformaSaaS";

const sql = readFileSync("supabase/migrations/20261007035510_7d788f41-445d-48cc-9a26-55693fed74b9.sql", "utf8");
const tela = readFileSync("src/pages/plataforma/PlataformaGestao.tsx", "utf8");

describe("regularização de assinatura legada (plan_version_id NULL)", () => {
  it("só libera change_plan com versão informada; demais ações seguem bloqueadas", () => {
    expect(sql).toMatch(/v_sub\.plan_version_id IS NULL AND NOT \(_action='change_plan' AND _plan_version_id IS NOT NULL\)/);
    expect(sql).toContain("assinatura legada exige regularização explícita");
  });
  it("exige versão PUBLISHED e vigente", () => {
    expect(sql).toMatch(/v\.status='PUBLISHED' AND v\.effective_from<=v_now AND \(v\.effective_to IS NULL OR v\.effective_to>v_now\)/);
  });
  it("preserva superadmin, idempotência por correlação, ticket e lock", () => {
    expect(sql).toContain("is_platform_superadmin(auth.uid())");
    expect(sql).toContain("h.correlation_id=_correlation_id");
    expect(sql).toContain("issue_ticket('saas_subscription_write',_organization_id)");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.platform_transition_subscription[^;]+FROM PUBLIC, anon/);
  });
  it("change_plan não altera status nem trial_ends_at", () => {
    expect(sql).toContain("ELSE v_sub.status END");
    expect(sql).not.toMatch(/SET[^;]*trial_ends_at=/);
  });
  it("traduz erros conhecidos sem expor detalhes internos", () => {
    const m = (s: string) => mensagemErroAssinatura(new Error(s));
    expect(m("platform_conflict: assinatura legada exige regularização explícita")).toContain("Alterar plano");
    expect(m("platform_invalid: versão inexistente ou fora de vigência")).toContain("não está publicada");
    expect(m("platform_forbidden: apenas superadmin")).toBe("Seu acesso não permite concluir esta operação.");
    expect(m("platform_conflict: transição inválida")).toContain("não é permitida");
    const desconhecido = m("ERROR 42P01 relation x does not exist");
    expect(desconhecido).not.toContain("42P01");
  });
  it("bloqueia duplo clique", () => {
    expect(tela).toContain("if (alterar.isPending) return;");
    expect(tela).toContain("mensagemErroAssinatura(e)");
  });
});
