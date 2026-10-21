import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["consultor_tecnico", "gestor"], loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: undefined as undefined | (() => boolean) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
import { useFencedPdfExport } from "@/hooks/useFencedPdfExport";

function slow() {
  let resolve: (d: { save: ReturnType<typeof vi.fn> }) => void = () => {};
  let signal: AbortSignal | undefined;
  const doc = { save: vi.fn() };
  const generate = vi.fn((s: AbortSignal) => { signal = s; return new Promise<typeof doc>(r => { resolve = r; }); });
  return { doc, generate, finish: () => resolve(doc), signal: () => signal };
}
beforeEach(() => {
  auth.user = { id: "A" }; auth.profile = { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false };
  auth.roles = ["consultor_tecnico", "gestor"]; auth.authzReady = true; auth.authzEpoch = 0; auth.checkAuthzAccess = undefined;
});

const changes: Array<[string, () => void]> = [
  ["papel retirado (revogação parcial)", () => { auth.roles = ["gestor"]; }],
  ["tenant", () => { auth.profile = { ...auth.profile, organization_id: "OB" }; }],
  ["epoch", () => { auth.authzEpoch++; }],
  ["ready pendente", () => { auth.authzReady = false; }],
];
describe("exportação PDF da visita cercada por escopo", () => {
  for (const [name, change] of changes) it(`exportação lenta não compartilha/salva após mudança de ${name} sem unmount`, async () => {
    const share = vi.fn(async () => false);
    const h = renderHook(() => useFencedPdfExport("visita:V1", share));
    const s = slow();
    let p!: Promise<string>;
    act(() => { p = h.result.current.run(s.generate, "v.pdf"); });
    expect(h.result.current.busy).toBe(true);
    change(); h.rerender();
    expect(s.signal()?.aborted).toBe(true);
    await act(async () => { s.finish(); });
    await expect(p).resolves.toBe("cancelled");
    expect(share).not.toHaveBeenCalled(); expect(s.doc.save).not.toHaveBeenCalled();
    expect(h.result.current.busy).toBe(false);
    h.unmount();
  });
  it("lease vencida durante share: não salva fallback", async () => {
    let valid = true; auth.checkAuthzAccess = () => valid;
    let shareResolve: (v: boolean) => void = () => {};
    const share = vi.fn(() => new Promise<boolean>(r => { shareResolve = r; }));
    const h = renderHook(() => useFencedPdfExport("visita:V1", share));
    const doc = { save: vi.fn() };
    let p!: Promise<string>;
    await act(async () => { p = h.result.current.run(async () => doc, "v.pdf"); });
    expect(share).toHaveBeenCalledTimes(1);
    valid = false;
    await act(async () => shareResolve(false));
    await expect(p).resolves.toBe("cancelled");
    expect(doc.save).not.toHaveBeenCalled(); h.unmount();
  });
  it("retry autorizado após mudança entrega normalmente; finally antigo não limpa novo estado", async () => {
    const share = vi.fn(async () => false);
    const h = renderHook(() => useFencedPdfExport("visita:V1", share));
    const old = slow();
    let p1!: Promise<string>;
    act(() => { p1 = h.result.current.run(old.generate, "v.pdf"); });
    auth.roles = ["gestor"]; h.rerender();
    const fresh = slow();
    let p2!: Promise<string>;
    act(() => { p2 = h.result.current.run(fresh.generate, "v.pdf"); });
    await act(async () => { old.finish(); });
    await expect(p1).resolves.toBe("cancelled");
    expect(h.result.current.busy).toBe(true);
    await act(async () => { fresh.finish(); });
    await expect(p2).resolves.toBe("saved");
    expect(fresh.doc.save).toHaveBeenCalledWith("v.pdf"); expect(old.doc.save).not.toHaveBeenCalled();
    expect(h.result.current.busy).toBe(false); h.unmount();
  });
  it("sem acesso pronto não inicia geração", async () => {
    auth.authzReady = false;
    const h = renderHook(() => useFencedPdfExport("visita:V1", vi.fn()));
    const gen = vi.fn();
    await expect(h.result.current.run(gen, "v.pdf")).resolves.toBe("unavailable");
    expect(gen).not.toHaveBeenCalled(); h.unmount();
  });
  it("unmount aborta e não entrega", async () => {
    const share = vi.fn(async () => false);
    const h = renderHook(() => useFencedPdfExport("visita:V1", share));
    const s = slow(); let p!: Promise<string>;
    act(() => { p = h.result.current.run(s.generate, "v.pdf"); });
    h.unmount(); expect(s.signal()?.aborted).toBe(true);
    s.finish(); await expect(p).resolves.toBe("cancelled"); expect(share).not.toHaveBeenCalled();
  });
});
