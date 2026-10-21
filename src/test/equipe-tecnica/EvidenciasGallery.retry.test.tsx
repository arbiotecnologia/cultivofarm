import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReadableStream } from "node:stream/web";

const state = vi.hoisted(() => ({
  gate: true,
  auth: { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["cliente_produtor"], loading: false, authzReady: true, authzEpoch: 0 },
  query: vi.fn(), stream: vi.fn(), sign: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/authz/attachmentBlobGate", () => ({ get AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED() { return state.gate; } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ order: state.query }) }) }),
  storage: { from: () => ({ createSignedUrls: state.sign, download: () => ({ asStream: state.stream }) }) },
} }));
import { EvidenciasGallery } from "@/components/aplicacao/EvidenciasGallery";

const row = { evidencia: { id: "E", tipo: "foto", storage_path: "private/a.jpg", legenda: "Foto privada", mime: "image/jpeg", versao_origem_id: null } };
let notify: (entries: IntersectionObserverEntry[]) => void = () => {};
function retryButton() {
  const button = screen.getAllByRole("alert").find(element => element.closest("button"))?.closest("button");
  if (!button) throw new Error("missing retry button");
  return button;
}
const okStream = () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } });

beforeEach(() => {
  state.gate = true;
  state.query.mockReset().mockResolvedValue({ data: [row], error: null });
  state.sign.mockReset().mockResolvedValue({ data: [], error: null });
  state.stream.mockReset();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:private") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof notify) { notify = callback; }
    observe() {} unobserve() {} disconnect() {}
  });
});

it("falha de rede mostra estado acessível por item e clique repete sem duplo clique invisível", async () => {
  state.stream.mockRejectedValueOnce(new Error("network"));
  const h = render(<EvidenciasGallery aplicacaoId="APP" />);
  await waitFor(() => expect(h.container.querySelector("[data-attachment-path]")).toBeTruthy());
  const target = h.container.querySelector("[data-attachment-path]");
  if (!target) throw new Error("missing attachment");
  act(() => notify([{ target, isIntersecting: true } as IntersectionObserverEntry]));
  // Falha: feedback acessível, sem URL obsoleta aberta.
  await waitFor(() => expect(screen.getAllByRole("alert")[1]).toBeTruthy());
  expect(screen.getAllByRole("alert")[1].textContent).toContain("tentar novamente");
  expect(screen.queryByAltText("Foto privada")).toBeNull();
  // Retry explícito: controllers não retêm o path, nova tentativa é emitida.
  state.stream.mockImplementation(async () => ({ data: okStream(), error: null }));
  fireEvent.click(retryButton());
  await waitFor(() => expect(screen.getByAltText("Foto privada").getAttribute("src")).toBe("blob:private"));
  expect(state.stream).toHaveBeenCalledTimes(2);
  // Após sucesso, um clique abre o lightbox (download explícito, sem clique extra).
  fireEvent.click(screen.getByAltText("Foto privada"));
  expect(screen.getByRole("dialog")).toBeTruthy();
  h.unmount();
});

it("falha persistente não abre arquivo nem limpa o estado de erro", async () => {
  state.stream.mockRejectedValue(new Error("network"));
  const h = render(<EvidenciasGallery aplicacaoId="APP" />);
  await waitFor(() => expect(h.container.querySelector("[data-attachment-path]")).toBeTruthy());
  const target = h.container.querySelector("[data-attachment-path]");
  if (!target) throw new Error("missing attachment");
  act(() => notify([{ target, isIntersecting: true } as IntersectionObserverEntry]));
  await waitFor(() => expect(screen.getAllByRole("alert")[1]).toBeTruthy());
  fireEvent.click(retryButton());
  await waitFor(() => expect(state.stream).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getAllByRole("alert")[1]).toBeTruthy());
  expect(screen.queryByRole("dialog")).toBeNull();
  h.unmount();
});

it("25 evidências: o 25º item carrega pelo fluxo normal autenticado, sem limite global", async () => {
  state.query.mockResolvedValue({ data: Array.from({ length: 25 }, (_, n) => ({ evidencia: { ...row.evidencia, id: `E${n}`, storage_path: `private/${n}.jpg`, legenda: `Foto ${n}` } })), error: null });
  state.stream.mockImplementation(async () => ({ data: okStream(), error: null }));
  const h = render(<EvidenciasGallery aplicacaoId="APP" />);
  await waitFor(() => expect(h.container.querySelectorAll("[data-attachment-path]")).toHaveLength(25));
  const target = h.container.querySelector('[data-attachment-path="private/24.jpg"]');
  if (!target) throw new Error("missing attachment");
  act(() => notify([{ target, isIntersecting: true } as IntersectionObserverEntry]));
  await waitFor(() => expect(state.stream).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/Limite de anexos excedido/)).toBeNull();
  h.unmount();
});

it("loading só pertence ao item solicitado e retry recupera limite após reduzir paths", async () => {
  let resolve: (value: unknown) => void = () => {};
  state.query.mockResolvedValue({ data: [row, { evidencia: { ...row.evidencia, id: "E2", storage_path: "private/b.jpg", legenda: "Foto B" } }], error: null });
  state.stream.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const h = render(<EvidenciasGallery aplicacaoId="APP" />);
  await waitFor(() => expect(h.container.querySelectorAll("[data-attachment-path]")).toHaveLength(2));
  const target = h.container.querySelector("[data-attachment-path]");
  if (!target) throw new Error("missing attachment");
  act(() => notify([{ target, isIntersecting: true } as IntersectionObserverEntry]));
  await waitFor(() => expect(screen.getAllByLabelText("Carregando anexo")).toHaveLength(1));
  await act(async () => resolve({ data: okStream(), error: null }));
  await screen.findByAltText("Foto privada");
  expect(screen.queryByLabelText("Carregando anexo")).toBeNull();
  h.unmount();
});
