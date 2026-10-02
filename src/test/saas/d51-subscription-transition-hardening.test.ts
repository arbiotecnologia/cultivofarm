import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const rpcFix = readFileSync(
  "supabase/migrations/20261002184357_33a7c9c4-3c43-4b6e-a726-96115188c57c.sql",
  "utf8",
);
const rlsFix = readFileSync(
  "supabase/migrations/20261002184434_ef99d7fb-b067-4f67-b768-9f504a6ebd62.sql",
  "utf8",
);

describe("D51.2 — alteração segura de assinatura", () => {
  it("mantém a RPC como invoker, com autorização, motivo e lock", () => {
    expect(rpcFix).toContain("SECURITY INVOKER");
    expect(rpcFix).toContain("public.is_platform_superadmin(auth.uid())");
    expect(rpcFix).toContain("length(btrim(_reason)) < 5");
    expect(rpcFix).toContain("FOR UPDATE");
  });

  it("converte o texto validado para o enum antes de persistir", () => {
    expect(rpcFix).toContain("v_status public.saas_subscription_status");
    expect(rpcFix).toContain("v_status := _status::public.saas_subscription_status");
    expect(rpcFix).toContain("status = v_status");
  });

  it("mantém timestamps coerentes ao suspender, cancelar ou reverter", () => {
    expect(rpcFix).toMatch(/v_status = 'SUSPENDED'[\s\S]*COALESCE\(suspended_at, now\(\)\)[\s\S]*ELSE NULL/);
    expect(rpcFix).toMatch(/v_status = 'CANCELLED'[\s\S]*COALESCE\(cancelled_at, now\(\)\)[\s\S]*ELSE NULL/);
  });

  it("nega execução pública e anônima", () => {
    expect(rpcFix).toContain(
      "REVOKE ALL ON FUNCTION public.platform_change_subscription(uuid,text,text,text) FROM PUBLIC, anon",
    );
    expect(rpcFix).toContain(
      "GRANT EXECUTE ON FUNCTION public.platform_change_subscription(uuid,text,text,text) TO authenticated, service_role",
    );
  });

  it("permite ao Superadmin localizar e auditar a assinatura sob RLS", () => {
    for (const table of ["organization_subscriptions", "organization_subscription_history"]) {
      expect(rlsFix).toContain(`ON public.${table}`);
    }
    expect(rlsFix.match(/FOR SELECT/g)).toHaveLength(2);
    expect(rlsFix.match(/TO authenticated/g)).toHaveLength(2);
    expect(rlsFix.match(/public\.is_platform_superadmin\(\(SELECT auth\.uid\(\)\)\)/g)).toHaveLength(2);
    expect(rlsFix).not.toMatch(/TO (?:PUBLIC|anon)/i);
  });
});