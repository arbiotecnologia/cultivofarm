import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20261007125937_6ec29729-d13c-4c57-b565-6b0b9dbe616f.sql", "utf8");

describe("execução autenticada da regularização legada", () => {
  it("mantém wrapper INVOKER e reutiliza núcleo privado com autorização existente", () => {
    expect(sql).toContain("pg_get_functiondef('public.platform_transition_subscription");
    expect(sql).toContain("FUNCTION platform_private.transition_subscription_core(");
    expect(sql).toContain("LANGUAGE plpgsql SECURITY DEFINER");
    expect(sql).toContain("SECURITY INVOKER SET search_path TO ''");
    expect(sql).toContain("FROM PUBLIC, anon");
  });

  it("não expõe emissão de tickets nem permite escrita direta", () => {
    expect(sql).toContain("REVOKE UPDATE ON public.organization_subscriptions FROM authenticated");
    expect(sql).not.toMatch(/GRANT[^;]*issue_ticket/);
  });

  it("inicializa fim do trial somente na criação, nunca em change_plan", () => {
    expect(sql).toContain("IF NEW.status='TRIAL' AND TG_OP='INSERT' THEN");
    expect(sql).not.toContain("OLD.plan_version_id IS DISTINCT FROM NEW.plan_version_id");
  });
});