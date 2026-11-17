import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import FichasTecnicas from "@/pages/portal-parceiro/FichasTecnicas";
// Real app mounts every page under QueryClientProvider (catalog family filter reads through it).
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
const mocks = vi.hoisted(() => ({ refetch: vi.fn(), produto: vi.fn(), micro: vi.fn(), ready: true, scope: "A" }));
vi.mock("@/hooks/usePartnerCatalogTecnico", () => ({ usePartnerCatalogTecnico: () => ({
  data: [{ item_id: "same-id", item_tipo: "produto", ficha_aprovada: true, nome: "Produto", familia_catalogo: "quimico" }],
  isLoading: false, error: null, refetch: mocks.refetch,
}) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({
  ready: mocks.ready, scope: mocks.scope, capture: () => { const scope = mocks.scope; return () => mocks.ready && scope === mocks.scope; },
}) }));
vi.mock("@/lib/pdf/fichaTecnicaProdutoPdf", () => ({ generateFichaTecnicaProdutoPdf: mocks.produto }));
vi.mock("@/lib/pdf/fichaTecnicaMicrorganismoPdf", () => ({ generateFichaTecnicaMicrorganismoPdf: mocks.micro }));
const response = (item_tipo = "produto", error: Error | null = null) => ({
  data: [{ item_id: "same-id", item_tipo, ficha_aprovada: true }], error,
});
beforeEach(() => {
  vi.clearAllMocks(); mocks.scope = "A"; mocks.ready = true;
  mocks.refetch.mockResolvedValue(response());
  mocks.produto.mockResolvedValue({ blobUrl: "blob:pdf", filename: "ficha.pdf" });
  vi.stubGlobal("URL", { revokeObjectURL: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("first refetch failure with retained stale data never calls either PDF generator", async () => {
  mocks.refetch.mockResolvedValue(response("produto", new Error("refetch denied")));
  render(<FichasTecnicas />, { wrapper }); fireEvent.click(screen.getByRole("button", { name: "Visualizar" }));
  await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1));
  expect(mocks.produto).not.toHaveBeenCalled(); expect(mocks.micro).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("same ID with divergent first type denies generation", async () => {
  mocks.refetch.mockResolvedValue(response("microrganismo"));
  render(<FichasTecnicas />, { wrapper }); fireEvent.click(screen.getByRole("button", { name: "Visualizar" }));
  await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1));
  expect(mocks.produto).not.toHaveBeenCalled(); expect(mocks.micro).not.toHaveBeenCalled();
});
it("same ID with divergent second type revokes generated blob and denies preview", async () => {
  mocks.refetch.mockResolvedValueOnce(response()).mockResolvedValueOnce(response("microrganismo"));
  render(<FichasTecnicas />, { wrapper }); fireEvent.click(screen.getByRole("button", { name: "Visualizar" }));
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf"));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("type captured before await survives tab change without switching PDF generators", async () => {
  let resolve: ((v: ReturnType<typeof response>) => void) | undefined;
  mocks.refetch.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(response());
  render(<FichasTecnicas />, { wrapper }); fireEvent.click(screen.getByRole("button", { name: "Visualizar" }));
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Microrganismos" }), { button: 0, ctrlKey: false });
  resolve?.(response());
  await waitFor(() => expect(mocks.produto).toHaveBeenCalledTimes(1));
  expect(mocks.micro).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
});
it("changed actor while first refetch is pending never publishes PDF", async () => {
  let resolve: ((v: ReturnType<typeof response>) => void) | undefined;
  mocks.refetch.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const ui = render(<FichasTecnicas />, { wrapper }); fireEvent.click(screen.getByRole("button", { name: "Visualizar" }));
  mocks.scope = "B"; ui.rerender(<FichasTecnicas />); resolve?.(response());
  await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1));
  expect(mocks.produto).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
});