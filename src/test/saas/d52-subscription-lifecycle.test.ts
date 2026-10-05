import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const model = readFileSync("supabase/migrations/20261005230324_ded43cff-9df4-4c46-a61f-81324ffd39da.sql", "utf8");
const operations = readFileSync("supabase/migrations/20261005230531_27d6d69d-a955-44d5-94b7-eb209ce0ada4.sql", "utf8");
const hardening = readFileSync("supabase/migrations/20261005230657_6bdad747-6f93-46b5-be76-c5c2595a50b5.sql", "utf8");
const safeTransitions = readFileSync("supabase/migrations/20261005231703_19601a28-f4e6-4c34-9a0f-454279a68161.sql", "utf8");
const deterministicTrialBackfill = readFileSync("supabase/migrations/20261005231728_bc63c106-e15a-497e-9a12-4bb4defcbc78.sql", "utf8");
const publishAudit = readFileSync("supabase/migrations/20261005231820_9d04f357-26ee-446b-a625-9d39157325e1.sql", "utf8");
const concurrentTransitions = readFileSync("supabase/migrations/20261005231852_727f7eeb-4808-49a0-9825-d969007b3103.sql", "utf8");
const trialExtension = readFileSync("supabase/migrations/20261005232010_085c482f-45f6-467b-9727-667091e54e73.sql", "utf8");

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
    expect(deterministicTrialBackfill).toContain("started_at + interval '14 days'");
    expect(deterministicTrialBackfill).toContain("plan_version_id IS NULL");
  });

  it("retorna conflitos seguros e serializa transições idempotentes", () => {
    expect(safeTransitions).toContain("USING ERRCODE='40001'");
    expect(safeTransitions).toContain("FOR UPDATE SKIP LOCKED");
    expect(concurrentTransitions.match(/WHERE h\.correlation_id=_correlation_id/g)?.length).toBeGreaterThanOrEqual(2);
    expect(concurrentTransitions).toContain("LIMIT 1 FOR UPDATE");
  });

  it("audita publicação imutável e limita extensão explícita de trial", () => {
    expect(publishAudit).toContain("publication_reason");
    expect(publishAudit).toContain("correlation_id");
    expect(publishAudit).toContain("FOR UPDATE");
    expect(trialExtension).toContain("interval '14 days'");
    expect(trialExtension).toContain("platform_extend_trial");
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