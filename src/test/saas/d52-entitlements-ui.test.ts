import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261005235114_bfbe25bc-7be0-44d3-b707-fc4f722e4c3c.sql", "utf8");
const hardening = readFileSync("supabase/migrations/20261005234604_d2b4d8f7-1f3f-4d82-99b4-78435144ca8c.sql", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const guard = readFileSync("src/components/guards/ForaDoPlano.tsx", "utf8");
const hooks = readFileSync("src/hooks/usePlataformaSaaS.ts", "utf8");
const gestao = readFileSync("src/pages/plataforma/PlataformaGestao.tsx", "utf8");
const meuPlano = readFileSync("src/pages/configuracoes/MeuPlanoTab.tsx", "utf8");

describe("D52 — entitlements e telas", () => {
  it("deriva módulos da versão imutável e bloqueia legado/status não liberados", () => {
    expect(migration).toContain("JOIN public.saas_plan_version_features");
    expect(migration).toContain("s.plan_version_id IS NOT NULL");
    expect(migration).toContain("s.status = 'ACTIVE'");
    expect(migration).not.toContain("s.status IN ('TRIAL','ACTIVE','PAST_DUE')");
  });

  it("falha fechado sem usuário ativo e empresa ativa", () => {
    expect(hardening).toContain("saas_context_unavailable");
    expect(migration).toContain("p.ativo IS TRUE");
    expect(migration).toContain("org.ativo IS TRUE");
  });

  it("usa os modos canônicos das exceções e não os valores inexistentes", () => {
    expect(migration).toContain("mode = 'GRANT'");
    expect(migration).toContain("mode = 'REVOKE'");
    expect(migration).not.toContain("mode = 'allow'");
    expect(migration).not.toContain("mode = 'deny'");
  });

  it("preserva exceções e permite somente encerramento auditado", () => {
    expect(hardening).toContain("saas_feature_override_guard");
    expect(hardening).toContain("exceções não podem ser apagadas");
    expect(hardening).toContain("NEW.ended_by IS NULL");
    expect(hardening).toContain("NULLIF(btrim(NEW.end_reason), '') IS NULL");
  });

  it("remove seletor arbitrário e usa somente a RPC específica", () => {
    expect(hooks).toContain('db.rpc("platform_transition_subscription"');
    expect(hooks).not.toContain('db.rpc("platform_change_subscription"');
    expect(gestao).toContain("Nenhuma versão comercial vigente");
  });

  it("expõe regularização pendente e bloqueio sem oferecer escrita tenant", () => {
    expect(meuPlano).toContain("Regularização comercial pendente");
    expect(meuPlano).toContain("Novas criações bloqueadas");
    expect(meuPlano).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(guard).toContain("Regularização comercial pendente");
    expect(app).toContain("<RoleGuard><ComunicacaoRouteGuard><ComunicacaoAdminPage /></ComunicacaoRouteGuard></RoleGuard>");
  });
});