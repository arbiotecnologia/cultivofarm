import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  gate: true, download: vi.fn(), sign: vi.fn(), query: vi.fn(), toast: vi.fn(),
  image: false,
  auth: { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["cliente_produtor"], loading: false, authzReady: true, authzEpoch: 0 },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/authz/attachmentBlobGate", () => ({ get AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED() { return mocks.gate; } }));
vi.mock("@/lib/authz/authenticatedAttachment", () => ({ ATTACHMENT_LIMITS: { files: 24, fileBytes: 20 * 1024 * 1024, totalBytes: 60 * 1024 * 1024 }, downloadAuthenticatedAttachment: mocks.download }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast, success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ order: mocks.query }) }) }),
  storage: { from: () => ({ createSignedUrl: mocks.sign }) },
} }));
vi.mock("@/hooks/useCommercial", () => ({
  useOrderMessages: () => ({ data: [{ id: "M", autor_tipo: "parceiro", mensagem: "Mensagem", created_at: "2026-10-17T00:00:00Z" }] }),
  useSendOrderMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useSetMessageStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useMessageAttachments: () => ({ data: [{ id: "F", file_path: "private/a.pdf", file_name: "Anexo pedido", mime_type: mocks.image ? "image/jpeg" : "application/pdf" }] }),
  useUploadMessageAttachment: () => ({ mutate: vi.fn() }),
  getAttachmentSignedUrl: mocks.sign,
}));
import { ClienteDocumentosTab } from "@/components/clientes/ClienteDocumentosTab";
import { OrderMessagesPanel } from "@/components/comercial/OrderMessagesPanel";
beforeEach(() => {
  mocks.gate = true; mocks.image = false;
  mocks.auth.authzReady = true; mocks.auth.authzEpoch = 0;
  mocks.auth.user.id = "A"; mocks.auth.profile.user_id = "A"; mocks.auth.profile.organization_id = "OA";
  mocks.download.mockReset().mockResolvedValue(new Blob(["private"]));
  mocks.sign.mockReset().mockResolvedValue({ data: { signedUrl: "https://legacy.invalid/file" } });
  mocks.toast.mockReset();
  mocks.query.mockResolvedValue({ data: [{ id: "D", nome: "Documento", tipo: "cnh", arquivo_path: "private/a.pdf" }], error: null });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:owned") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(window, "open").mockImplementation(() => null);
});
for (const consumer of ["cliente", "pedido"] as const) {
  const component = (id: string) => consumer === "cliente" ? <ClienteDocumentosTab clienteId={id} /> : <OrderMessagesPanel orderId={id} authorType="parceiro" />;
  const trigger = () => consumer === "cliente" ? screen.getByTitle(/^Baixar/) : screen.getByRole("button", { name: /Anexo pedido/ });
  it(`${consumer}: prepara uma vez, download explícito sem popup e revoga ao desmontar`, async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const h = render(component("R1"));
    await waitFor(() => expect(trigger()).toBeTruthy());
    fireEvent.click(trigger());
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(window.open).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger().textContent + trigger().getAttribute("title")).toMatch(/Baixar arquivo/));
    fireEvent.click(trigger()); fireEvent.click(trigger());
    expect(click).toHaveBeenCalledTimes(2);
    expect(mocks.download).toHaveBeenCalledTimes(1); expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(mocks.sign).not.toHaveBeenCalled();
    h.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:owned");
  });
  it(`${consumer}: negativa permite retry manual sem fallback`, async () => {
    mocks.download.mockRejectedValueOnce(new Error("403"));
    const h = render(component("R1"));
    await waitFor(() => expect(trigger()).toBeTruthy()); fireEvent.click(trigger());
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    expect(mocks.sign).not.toHaveBeenCalled(); expect(window.open).not.toHaveBeenCalled();
    fireEvent.click(trigger());
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(window.open).not.toHaveBeenCalled(); h.unmount();
  });
  for (const change of ["pending", "epoch", "tenant", "ABA", "resource", "unmount"] as const) {
    it(`${consumer}: ${change} aborta e descarta sucesso tardio, com trava de duplo clique`, async () => {
      let resolve: (value: Blob) => void = () => {};
      mocks.download.mockImplementation(() => new Promise(r => { resolve = r; }));
      const h = render(component("R1"));
      await waitFor(() => expect(trigger()).toBeTruthy());
      fireEvent.click(trigger()); fireEvent.click(trigger());
      expect(mocks.download).toHaveBeenCalledTimes(1);
      const signal = mocks.download.mock.calls[0][2] as AbortSignal;
      if (change === "pending") mocks.auth.authzReady = false;
      if (change === "epoch") mocks.auth.authzEpoch++;
      if (change === "tenant") mocks.auth.profile.organization_id = "OB";
      if (change === "ABA") { mocks.auth.user.id = "B"; mocks.auth.profile.user_id = "B"; h.rerender(component("R1")); mocks.auth.user.id = "A"; mocks.auth.profile.user_id = "A"; }
      if (change === "unmount") h.unmount(); else h.rerender(component(change === "resource" ? "R2" : "R1"));
      expect(signal.aborted).toBe(true);
      await act(async () => resolve(new Blob(["obsolete"])));
      expect(window.open).not.toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
      h.unmount();
    });
  }
}
it("thumbnail pedido desaparece e revoga em pending, sem assinador remoto", async () => {
  mocks.image = true;
  const h = render(<OrderMessagesPanel orderId="R1" authorType="parceiro" />);
  await screen.findByAltText("Anexo pedido");
  mocks.auth.authzReady = false;
  h.rerender(<OrderMessagesPanel orderId="R1" authorType="parceiro" />);
  expect(screen.queryByAltText("Anexo pedido")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:owned");
  expect(mocks.sign).not.toHaveBeenCalled(); h.unmount();
});