import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";

const m = vi.hoisted(() => ({
  auth: { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true }, roles: ["administrador"] },
  portal: { clienteId: "CA", loading: false },
  queries: [] as Array<Record<string, unknown>>,
  chain: {} as Record<string, ReturnType<typeof vi.fn>>,
  remove: vi.fn(), invalidate: vi.fn(), mutations: [] as Array<{ mutationFn: (id: string) => Promise<unknown> }>,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => m.auth }));
vi.mock("@/hooks/usePortalCliente", () => ({ usePortalCliente: () => m.portal }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (o: Record<string, unknown>) => { m.queries.push(o); return { data: [], refetch: vi.fn() }; },
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
  useMutation: (o: { mutationFn: (id: string) => Promise<unknown> }) => { m.mutations.push(o); return o; },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => m.chain,
  channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
  removeChannel: m.remove,
} }));
import { useNotificacoesUnificadas } from "@/hooks/useNotificacoesUnificadas";

beforeEach(() => {
  m.auth = { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true }, roles: ["administrador"] };
  m.portal = { clienteId: "CA", loading: false };
  m.queries = []; m.mutations = []; m.remove.mockClear();
  for (const name of ["select", "eq", "filter", "order", "limit", "update"]) m.chain[name] = vi.fn(() => m.chain);
});

describe("P1 notification identity/tenant scope (mock, not browser)", () => {
  it("cache keys distinguish user and tenant and role", () => {
    const h = renderHook(() => useNotificacoesUnificadas());
    expect(m.queries[0].queryKey).toEqual(["notif-unified", "op", "A", "OA", "administrador"]);
    m.auth = { user: { id: "B" }, profile: { user_id: "B", organization_id: "OB", ativo: true }, roles: ["gestor"] };
    h.rerender();
    expect(m.queries.at(-2)?.queryKey).toEqual(["notif-unified", "op", "B", "OB", "gestor"]);
    expect(m.remove).toHaveBeenCalled();
  });
  it("portal requires producer role and ready linked selection", () => {
    renderHook(() => useNotificacoesUnificadas());
    expect(m.queries[1].enabled).toBe(false);
    m.auth.roles = ["cliente_produtor"];
    renderHook(() => useNotificacoesUnificadas());
    expect(m.queries.at(-1)?.enabled).toBe(true);
  });
  it("inactive or missing profile fails closed and hides cached rows", () => {
    m.auth.profile.ativo = false;
    const h = renderHook(() => useNotificacoesUnificadas());
    expect(m.queries[0].enabled).toBe(false);
    expect(h.result.current.all).toEqual([]);
    expect(h.result.current.unreadCount).toBe(0);
  });
  it("markRead scopes operational mutation by recipient", async () => {
    renderHook(() => useNotificacoesUnificadas());
    await m.mutations[0].mutationFn("op:N");
    expect(m.chain.eq).toHaveBeenCalledWith("id", "N");
    expect(m.chain.eq).toHaveBeenCalledWith("usuario_id", "A");
  });
  it("markRead scopes producer by both individual recipient and client", async () => {
    m.auth.roles = ["cliente_produtor"];
    renderHook(() => useNotificacoesUnificadas());
    await m.mutations[0].mutationFn("portal:N");
    expect(m.chain.filter).toHaveBeenCalledWith("recipient_user_id", "eq", "A");
    expect(m.chain.eq).toHaveBeenCalledWith("cliente_id", "CA");
  });
  it("non-producer cannot mark portal rows", async () => {
    renderHook(() => useNotificacoesUnificadas());
    await expect(m.mutations[0].mutationFn("portal:N")).rejects.toThrow("NOTIF_PORTAL_REQUIRED");
  });
});

describe("P1 structural containment (not remote runtime)", () => {
  const migrations = readdirSync("supabase/migrations").filter(n => /^2026100804(11|12|13|16|19)/.test(n)).map(n => readFileSync(`supabase/migrations/${n}`, "utf8")).join("\n");
  it("keeps origin, recipient, immutable fields and lido-only grants", () => {
    expect(migrations).toContain("notification_p1_op_isolation");
    expect(migrations).toContain("recipient_user_id");
    expect(migrations).toContain("GRANT UPDATE(lido)");
    expect(migrations).toContain("NOTIF_CONTENT_IMMUTABLE");
  });
  it("SQL proof requires final rollback and eleven negatives", () => {
    const sql = readFileSync("scripts/rbac-audit/notification-p1-proof.sql", "utf8");
    expect(sql).toContain("NOTIFICATION_P1_ROLLBACK");
    expect(sql).toContain("denied<>11");
    expect(sql).not.toMatch(/DISABLE TRIGGER|TRUNCATE/);
  });
  it("legacy email and push cannot deliver or enumerate recipients", () => {
    for (const name of ["send-push-notification", "enviar-alertas-notificacoes"]) {
      const edge = readFileSync(`supabase/functions/${name}/index.ts`, "utf8");
      expect(edge).toContain("NOTIF_EXTERNAL_DELIVERY_DISABLED");
      expect(edge).not.toMatch(/sendNotification|client\.send|\.from\(/);
    }
  });
  it("mobile uses scoped unified hook, not unrestricted portal query", () => {
    const mobile = readFileSync("src/pages/app/MobileNotificacoes.tsx", "utf8");
    expect(mobile).toContain("useNotificacoesUnificadas({ limit: 30 })");
    expect(mobile).not.toContain('.from("portal_notificacoes")');
  });
  it("portal selector resets state, fences old requests and scopes storage", () => {
    const hook = readFileSync("src/hooks/usePortalCliente.ts", "utf8");
    expect(hook).toContain("requestGeneration !== generation.current");
    expect(hook).toContain('setClientes([]); setClienteId(null); setClienteNome(null)');
    expect(hook).toContain("${STORAGE_KEY}:${scope}");
    expect(hook).toContain('.filter("organization_id", "eq", organizationId)');
  });
});