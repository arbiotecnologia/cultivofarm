import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const model = readFileSync("supabase/migrations/20261005230324_ded43cff-9df4-4c46-a61f-81324ffd39da.sql", "utf8");
const operations = readFileSync("supabase/migrations/20261005230531_27d6d69d-a955-44d5-94b7-eb209ce0ada4.sql", "utf8");
const hardening = readFileSync("supabase/migrations/20261005230657_6bdad747-6f93-46b5-be76-c5c2595a50b5.sql", "utf8");

describe("D52 — ciclo interno de assinatura", () => {
  it("cria versões e snapshots sem preencher contratos legados", () => {
    expect(model).toContain("CREATE TABLE public.saas_plan_versions");
    expect(model).toContain("features_snapshot jsonb");
    expect(model).not.toContain("SET plan_version_id=(SELECT");
  });

  it("protege versões publicadas e assinatura por ticket transacional", () => {
    expect(model).toContain("saas_plan_version_no_mutation");
    expect(hardening).toContain("platform_private.has_ticket('saas_subscription_write'");
    expect(hardening).toContain("platform_private.issue_ticket('saas_plan_version_create'");
  });

  it("mantém somente ações específicas e não confirma pagamento", () => {
    expect(hardening).toContain("platform_transition_subscription");
    expect(hardening).not.toContain("'activate_manual'");
    expect(model).toContain("DROP FUNCTION IF EXISTS public.platform_change_subscription");
  });

  it("cria trial novo de 14 dias e mantém legado fora da expiração automática", () => {
    expect(hardening).toContain("v_now+interval '14 days'");
    expect(hardening).toContain("plan_version_id IS NOT NULL AND trial_ends_at IS NOT NULL");
    expect(operations).toContain("cron.schedule('saas-expire-due-trials','15 2 * * *'");
  });

  it("entitlements exigem versão e estado efetivo válido", () => {
    expect(model).toContain("s.plan_version_id IS NOT NULL");
    expect(model).toContain("s.status IN ('TRIAL','ACTIVE')");
    expect(model).not.toContain("s.status IN ('TRIAL','ACTIVE','PAST_DUE')");
  });

  it("não cria gateway, checkout ou webhook de pagamento", () => {
    const all = `${model}\n${operations}\n${hardening}`;
    expect(all).not.toMatch(/stripe|checkout|payment_intent|payment webhook/i);
  });
});