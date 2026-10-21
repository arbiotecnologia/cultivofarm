import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReadableStream } from "node:stream/web";
const state = vi.hoisted(() => ({ gate: true, auth: { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["cliente_produtor"], loading: false, authzReady: true, authzEpoch: 0 }, query: vi.fn(), stream: vi.fn(), sign: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/authz/attachmentBlobGate", () => ({ get AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED() { return state.gate; } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ order: state.query }) }) }),
  storage: { from: () => ({ createSignedUrls: state.sign, download: () => ({ asStream: state.stream }) }) },
} }));
import { EvidenciasGallery } from "@/components/aplicacao/EvidenciasGallery";
const row = { evidencia: { id: "E", tipo: "foto", storage_path: "private/a.jpg", legenda: "Foto privada", mime: "image/jpeg", versao_origem_id: null } };
let notify: (entries: IntersectionObserverEntry[]) => void = () => {};
beforeEach(() => {
  state.gate = true; state.auth.authzReady = true; state.auth.authzEpoch = 0;
  state.query.mockReset().mockResolvedValue({ data: [row], error: null });
  state.sign.mockReset().mockResolvedValue({ data: [{ path: row.evidencia.storage_path, signedUrl: "https://legacy.invalid/file" }], error: null });
  state.stream.mockReset().mockImplementation(async () => ({ data: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }), error: null }));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:private") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof notify) { notify = callback; }
    observe() {} unobserve() {} disconnect() {}
  });
});
it("real gallery with candidate gate waits for visibility, never signs and clears media on pending", async () => {
  const h = render(<EvidenciasGallery aplicacaoId="APP" />);
  await waitFor(() => expect(h.container.querySelector("[data-attachment-path]")).toBeTruthy());
  expect(state.stream).not.toHaveBeenCalled(); expect(state.sign).not.toHaveBeenCalled();
  const target = h.container.querySelector("[data-attachment-path]");
  if (!target) throw new Error("missing attachment");
  act(() => notify([{ target, isIntersecting: true } as IntersectionObserverEntry]));
  await waitFor(() => expect(screen.getByAltText("Foto privada").getAttribute("src")).toBe("blob:private"));
  fireEvent.click(screen.getByAltText("Foto privada")); expect(screen.getByRole("dialog")).toBeTruthy();
  state.auth.authzReady = false; h.rerender(<EvidenciasGallery aplicacaoId="APP" />);
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByAltText("Foto privada")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private"); h.unmount();
});
it("gate value false (rollback) never reopens signing: gallery still uses authenticated bytes", async () => {
  state.gate = false;
  const h = render(<EvidenciasGallery aplicacaoId="APP" />);
  await waitFor(() => expect(h.container.querySelector("[data-attachment-path]")).toBeTruthy());
  const target = h.container.querySelector("[data-attachment-path]");
  if (!target) throw new Error("missing attachment");
  act(() => notify([{ target, isIntersecting: true } as IntersectionObserverEntry]));
  await waitFor(() => expect(screen.getByAltText("Foto privada").getAttribute("src")).toBe("blob:private"));
  expect(state.sign).not.toHaveBeenCalled(); h.unmount();
});
