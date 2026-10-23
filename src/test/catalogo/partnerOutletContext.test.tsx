import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Outlet, useOutletContext } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EntitlementOutlet } from "@/components/guards/EntitlementOutlet";

const state = vi.hoisted(() => ({ ready: true, entitled: true, calls: 0 }));
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => ({ status: state.ready ? "ready" : "loading", features: new Set(state.entitled ? ["catalogo_precos"] : []) }) }));
const partner = { id: "partner-A" };
const context = { partner };
function Consumer() {
  state.calls++;
  const received = useOutletContext<typeof context>();
  expect(received).toBe(context);
  const { partner: scoped } = received;
  return <output>{scoped.id}</output>;
}
function mount() {
  return render(<MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Routes>
    <Route path="/portal-parceiro" element={<Outlet context={context} />}>
      <Route element={<EntitlementOutlet />}>
        <Route path="catalogo" element={<Consumer />} />
      </Route>
    </Route>
  </Routes></MemoryRouter>);
}
beforeEach(() => Object.assign(state, { ready: true, entitled: true, calls: 0 }));
afterEach(cleanup);
it("canonical nested entitlement outlet preserves the exact partner context", () => {
  mount(); expect(screen.getByText("partner-A")).toBeTruthy();
});
it.each(["denied", "pending"])("%s entitlement never mounts partner readers", mode => {
  if (mode === "denied") state.entitled = false; else state.ready = false;
  mount(); expect(state.calls).toBe(0); expect(screen.queryByText("partner-A")).toBeNull();
});