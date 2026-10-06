import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261006042518_fd69f433-4611-4982-90f8-69e298b7101b.sql",
  "utf8",
);
const hooks = readFileSync("src/hooks/usePlataformaSaaS.ts", "utf8");
const routeMap = readFileSync("src/lib/saas/featureRouteMap.ts", "utf8");
const roleGuard = readFileSync("src/App.tsx", "utf8");
const sidebar = readFileSync("src/components/AppSidebar.tsx", "utf8");

describe("D52 — hardening multiplano", () => {
  it("centraliza entitlements e mantém consumidores legados no contrato canônico", () => {
    expect(migration).toContain("platform_private.entitlements_for_user");
    expect(migration).toContain("FROM platform_private.entitlements_for_user(auth.uid())");
    expect(migration).toContain("FROM platform_private.entitlements_for_user(_uid)");
    expect(migration).toContain("v.status = 'PUBLISHED'");
    expect(migration).toContain("m.active IS TRUE");
  });

  it("mantém overrides idempotentes sem abrir acesso anônimo", () => {
    expect(migration).toContain("idempotency_key uuid NULL");
    expect(migration).toContain("end_idempotency_key uuid NULL");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("REVOKE ALL ON TABLE public.organization_feature_overrides FROM anon");
    expect(migration).toContain("is_platform_superadmin(auth.uid())");
  });

  it("reutiliza a chave somente no retry da mesma ação", () => {
    expect(hooks).toContain("retryRef.current?.signature !== signature");
    expect(hooks).toContain("_idempotency_key: retryRef.current.key");
    expect(hooks.match(/retryRef\.current = null/g)).toHaveLength(2);
  });

  it("aplica a mesma decisão de plano à rota direta e ao menu", () => {
    expect(roleGuard).toContain("isPathEntitled(location.pathname, entitlements)");
    expect(sidebar).toContain("isPathEntitled(routePath(item.route), entitlements)");
    expect(routeMap).toContain("return state.features.has(feature);");
  });
});