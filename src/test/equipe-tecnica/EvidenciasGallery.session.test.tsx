import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadableStream } from "node:stream/web";
const auth = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["administrador"], loading: false }));
const mocks = vi.hoisted(() => ({ query: vi.fn(), sign: vi.fn(), stream: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ order: mocks.query }) }) }),
  storage: { from: () => ({ download: () => ({ asStream: mocks.stream }), createSignedUrls: mocks.sign, createSignedUrl: async () => ({ data: { signedUrl: "https://example.invalid/old" } }) }) },
} }));
import { EvidenciasGallery } from "@/components/aplicacao/EvidenciasGallery";
const row = { evidencia: { id: "E", tipo: "foto", storage_path: "C/APP/a.jpg", legenda: "Foto privada", mime: "image/jpeg", versao_origem_id: null } };
beforeEach(() => {
  auth.user = { id: "A" }; auth.profile = { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false };
  auth.roles = ["administrador"]; auth.loading = false;
  mocks.query.mockReset().mockResolvedValue({ data: [row], error: null });
  mocks.sign.mockReset().mockResolvedValue({ data: [{ path: row.evidencia.storage_path, signedUrl: "https://example.invalid/old" }], error: null });
  mocks.stream.mockReset().mockImplementation(async () => ({ data: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }), error: null }));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:private") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.stubGlobal("IntersectionObserver", class { constructor(cb: (e: IntersectionObserverEntry[]) => void) { observers.push(cb); } observe(t: Element) { observers[observers.length - 1]([{ target: t, isIntersecting: true } as IntersectionObserverEntry]); } unobserve() {} disconnect() {} });
});
const observers: Array<(e: IntersectionObserverEntry[]) => void> = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><EvidenciasGallery aplicacaoId="APP" /></QueryClientProvider>);
  return { ...view, refresh: () => view.rerender(<QueryClientProvider client={client}><EvidenciasGallery aplicacaoId="APP" /></QueryClientProvider>) };
}
describe("EvidenciasGallery session isolation", () => {
  for (const change of ["identity", "tenant", "roles", "logout", "inactive", "loading", "mismatch"] as const) {
    it(`clears items and lightbox on ${change}`, async () => {
      const h = mount();
      await waitFor(() => expect(screen.getByAltText("Foto privada")).toBeTruthy());
      fireEvent.click(screen.getByAltText("Foto privada"));
      expect(screen.getByRole("dialog")).toBeTruthy();
      mocks.query.mockImplementation(() => new Promise(() => {}));
      if (change === "identity") { auth.user = { id: "B" }; auth.profile.user_id = "B"; }
      if (change === "tenant") auth.profile.organization_id = "OB";
      if (change === "roles") auth.roles = [];
      if (change === "logout") auth.user = null;
      if (change === "inactive") auth.profile.ativo = false;
      if (change === "loading") auth.loading = true;
      if (change === "mismatch") auth.profile.user_id = "B";
      h.refresh();
      expect(screen.queryByAltText("Foto privada")).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(mocks.sign).not.toHaveBeenCalled();
      h.unmount();
    });
  }
  it("discards an old query response after tenant change", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.query.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({ data: [], error: null });
    const h = mount();
    auth.profile.organization_id = "OB"; h.refresh();
    await act(async () => { resolve({ data: [row], error: null }); });
    expect(screen.queryByAltText("Foto privada")).toBeNull();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});