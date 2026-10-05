import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261005234604_d2b4d8f7-1f3f-4d82-99b4-78435144ca8c.sql", "utf8");
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
    expect(migration).toContain("saas_context_unavailable");
    expect(migration).toContain("p.ativo IS TRUE");
    expect(migration).toContain("o.ativo IS TRUE");
  });

  it("preserva exceções e permite somente encerramento auditado", () => {
    expect(migration).toContain("saas_feature_override_guard");
    expect(migration).toContain("exceções não podem ser apagadas");
    expect(migration).toContain("NEW.ended_by IS NULL");
    expect(migration).toContain("NULLIF(btrim(NEW.end_reason), '') IS NULL");
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
  });
});