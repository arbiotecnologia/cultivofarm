import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Gate global permanece FALSE: o componente deve usar o abridor autenticado mesmo assim.
const m = vi.hoisted(() => ({
  download: vi.fn(), sign: vi.fn(), toast: vi.fn(), path: "OA/clientes/C1/cnh/a.pdf",
  auth: { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false },
    roles: ["administrador"], loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: (): boolean => true },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => m.auth }));
vi.mock("@/lib/authz/authenticatedAttachment", () => ({
  ATTACHMENT_LIMITS: { files: 24, fileBytes: 20 * 1024 * 1024, totalBytes: 60 * 1024 * 1024 }, downloadAuthenticatedAttachment: m.download,
}));
vi.mock("sonner", () => ({ toast: { error: m.toast, success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: "D", nome: "Documento.pdf", tipo: "cnh", arquivo_path: m.path }], error: null }) }) }) }),
  storage: { from: () => ({ createSignedUrl: m.sign, createSignedUrls: m.sign }) },
} }));
import { AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED } from "@/lib/authz/attachmentBlobGate";
import { ClienteDocumentosTab } from "@/components/clientes/ClienteDocumentosTab";

beforeEach(() => {
  m.path = "OA/clientes/C1/cnh/a.pdf";
  Object.assign(m.auth, { roles: ["administrador"], authzReady: true, authzEpoch: 0, checkAuthzAccess: () => true });
  m.auth.profile = { ...m.auth.profile, organization_id: "OA" };
  m.download.mockReset().mockResolvedValue(new Blob(["%PDF"])); m.sign.mockReset(); m.toast.mockReset();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:1") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
const tree = () => <form onSubmit={submit}><ClienteDocumentosTab clienteId="C1" /></form>;
const submit = vi.fn((e: React.FormEvent) => e.preventDefault());

describe("ClienteDocumentosTab — abridor autenticado incondicional", () => {
  it("gate Blob ativo e happy path prepara/baixa sem URL assinada, popup ou submit", async () => {
    expect(AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED).toBe(true);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe("blob:1"); expect(this.download).toBe("Documento.pdf");
    });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(tree());
    fireEvent.click(await screen.findByRole("button", { name: /Preparar Documento/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Baixar Documento/ }));
    expect(m.download).toHaveBeenCalledWith("clientes-docs", m.path, expect.any(AbortSignal));
    expect(click).toHaveBeenCalledTimes(1);
    expect(m.sign).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
    click.mockRestore(); open.mockRestore();
  });
  it("caminho de outra empresa/cliente falha fechado sem requisição", async () => {
    m.path = "OB/clientes/C1/cnh/a.pdf";
    render(tree());
    fireEvent.click(await screen.findByRole("button", { name: /Preparar Documento/ }));
    expect(m.toast).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(m.toast.mock.calls)).not.toMatch(/OB|clientes/);
    expect(m.download).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled();
  });
  it("erro neutro sem detalhes do transporte", async () => {
    m.download.mockRejectedValue(new Error("token=SEGREDO"));
    render(tree());
    fireEvent.click(await screen.findByRole("button", { name: /Preparar Documento/ }));
    await waitFor(() => expect(m.toast).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(m.toast.mock.calls)).not.toContain("SEGREDO"); expect(m.sign).not.toHaveBeenCalled();
  });
  for (const change of ["tenant", "roles", "epoch", "lease"] as const) {
    it(`${change} após preparo revoga/oculta e bloqueia clique antigo`, async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const h = render(tree());
      fireEvent.click(await screen.findByRole("button", { name: /Preparar Documento/ }));
      const old = await screen.findByRole("button", { name: /Baixar Documento/ });
      if (change === "tenant") m.auth.profile = { ...m.auth.profile, organization_id: "OB" };
      if (change === "roles") m.auth.roles = ["gestor"];
      if (change === "epoch") m.auth.authzEpoch = 1;
      if (change === "lease") m.auth.checkAuthzAccess = () => false;
      await act(async () => h.rerender(tree()));
      if (change !== "lease") expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
      fireEvent.click(old);
      expect(click).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: /Baixar Documento/ })).toBeNull();
      expect(m.sign).not.toHaveBeenCalled();
      click.mockRestore();
    });
  }
});
