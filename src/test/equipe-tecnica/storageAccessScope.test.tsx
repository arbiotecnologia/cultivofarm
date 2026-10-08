import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["administrador"], loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

beforeEach(() => {
  auth.user = { id: "A" }; auth.profile = { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false };
  auth.roles = ["administrador"]; auth.loading = false;
});
describe("Storage request fence", () => {
  for (const change of ["identity", "tenant", "roles", "logout", "inactive", "loading", "mismatch"] as const) {
    it(`discards a delayed opening on ${change}`, async () => {
      const h = renderHook(() => useStorageAccessScope("file"));
      const current = h.result.current.capture();
      const open = vi.fn();
      let resolve: () => void = () => {};
      const pending = new Promise<void>(r => { resolve = r; }).then(() => { if (current()) open(); });
      if (change === "identity") { auth.user = { id: "B" }; auth.profile.user_id = "B"; }
      if (change === "tenant") auth.profile.organization_id = "OB";
      if (change === "roles") auth.roles = [];
      if (change === "logout") auth.user = null;
      if (change === "inactive") auth.profile.ativo = false;
      if (change === "loading") auth.loading = true;
      if (change === "mismatch") auth.profile.user_id = "B";
      h.rerender();
      await act(async () => { resolve(); await pending; });
      expect(open).not.toHaveBeenCalled();
    });
  }
  it("does not resurrect a request after A→B→A or unmount", () => {
    const h = renderHook(() => useStorageAccessScope("file"));
    const old = h.result.current.capture();
    auth.profile.organization_id = "OB"; h.rerender();
    auth.profile.organization_id = "OA"; h.rerender();
    expect(old()).toBe(false);
    const now = h.result.current.capture(); expect(now()).toBe(true);
    h.unmount(); expect(now()).toBe(false);
  });
});