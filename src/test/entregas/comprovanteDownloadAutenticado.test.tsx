import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliveryReceiptLocator } from "@/lib/entregas/comprovanteLocator";

const E = "11111111-1111-4111-8111-111111111111";
const PATH = `entregas/${E}/comprovantes/22222222-2222-4222-8222-222222222222.pdf`;
const auth = vi.hoisted(() => ({
  user: { id: "A" } as { id: string } | null,
  profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false },
  roles: ["administrador"], role: "administrador", loading: false, authzReady: true, authzEpoch: 0,
  checkAuthzAccess: (): boolean => true,
}));
const m = vi.hoisted(() => ({ download: vi.fn(), sign: vi.fn(), storageFrom: vi.fn(), toast: vi.fn(), rows: {} as Record<string, unknown> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-toast", () => ({ toast: m.toast, useToast: () => ({ toast: m.toast }) }));
vi.mock("@/lib/authz/authenticatedAttachment", () => ({
  ATTACHMENT_LIMITS: { files: 24, fileBytes: 20 * 1024 * 1024, totalBytes: 60 * 1024 * 1024 },
  downloadAuthenticatedAttachment: m.download,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (t: string) => {
    const r = m.rows[t] ?? { data: null, error: null };
    const q: Record<string, unknown> = {};
    for (const n of ["select", "eq", "order", "limit"]) q[n] = () => q;
    q.maybeSingle = async () => r;
    q.then = (a: (v: unknown) => unknown, b: (v: unknown) => unknown) => Promise.resolve(r).then(a, b);
    return q;
  },
  rpc: vi.fn(),
  storage: { from: (b: string) => { m.storageFrom(b); return { createSignedUrl: m.sign, createSignedUrls: m.sign }; } },
} }));
vi.mock("@/components/entregas/EntregaChecklistPanel", () => ({ EntregaChecklistPanel: () => null }));
vi.mock("@/components/entregas/EntregaOcorrenciasPanel", () => ({ EntregaOcorrenciasPanel: () => null }));
import { EntregaComprovantePanel } from "@/components/entregas/EntregaComprovantePanel";
import { ConfirmacaoEntregaPanel } from "@/components/entregas/ConfirmacaoEntregaPanel";

let blobN = 0;
beforeEach(() => {
  Object.assign(auth, { user: { id: "A" }, roles: ["administrador"], role: "administrador", loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: () => true });
  auth.profile = { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false };
  m.download.mockReset().mockResolvedValue(new Blob(["%PDF"]));
  m.sign.mockReset(); m.storageFrom.mockReset(); m.toast.mockReset();
  m.rows = {
    entregas: { data: { id: E, comprovante_status: "anexado", validation_token: null }, error: null },
    entrega_comprovantes: { data: { id: "C1", numero_formulario: "AR-ENT-1", arquivo_path: PATH }, error: null },
    entrega_documentos: { data: [{ id: "D1", tipo_documento: "COMPROVANTE", nome_arquivo: "recibo.pdf", arquivo_path: PATH, uploaded_at: "2026-10-19" }], error: null },
  };
  blobN = 0;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:${++blobN}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

const views = [
  ["EntregaComprovantePanel", () => <EntregaComprovantePanel entrega={{ id: E }} />, /Preparar comprovante/, /Baixar comprovante/, "22222222-2222-4222-8222-222222222222.pdf"],
  ["ConfirmacaoEntregaPanel", () => <ConfirmacaoEntregaPanel entrega={{ id: E, status: "cancelada" }} />, /Preparar recibo/, /Baixar recibo/, "recibo.pdf"],
] as const;

function mount(view: () => JSX.Element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <MemoryRouter><QueryClientProvider client={client}>{view()}</QueryClientProvider></MemoryRouter>;
  const h = render(tree());
  return { ...h, again: () => h.rerender(tree()) };
}

describe("locator de comprovante de entrega", () => {
  it("aceita só entregas/<entrega>/comprovantes/<uuid>.<ext> da própria entrega", () => {
    expect(deliveryReceiptLocator(E, PATH)).toBe(PATH);
    for (const bad of ["p.pdf", `entregas/${E}/assinaturas/22222222-2222-4222-8222-222222222222.png`,
      `entregas/33333333-3333-4333-8333-333333333333/comprovantes/22222222-2222-4222-8222-222222222222.pdf`,
      `entregas/${E}/comprovantes/../x.pdf`, `/entregas/${E}/comprovantes/22222222-2222-4222-8222-222222222222.pdf`, null, 1]) {
      expect(deliveryReceiptLocator(E, bad)).toBeNull();
    }
    expect(deliveryReceiptLocator(null, PATH)).toBeNull();
  });
});

for (const [name, view, prep, dl, fileName] of views) describe(name, () => {
  it("happy path: preparar baixa com sessão, baixar só no segundo clique; nenhuma URL assinada", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe("blob:1"); expect(this.download).toBe(fileName);
    });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const h = mount(view);
    fireEvent.click(await screen.findByRole("button", { name: prep }));
    await screen.findByRole("button", { name: dl });
    expect(m.download).toHaveBeenCalledWith("entrega-documentos", PATH, expect.any(AbortSignal));
    expect(click).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: dl }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(m.sign).not.toHaveBeenCalled(); expect(m.storageFrom).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
    h.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
    click.mockRestore(); open.mockRestore();
  });

  it("erro de download: aviso neutro, sem blob nem URL", async () => {
    m.download.mockRejectedValue(new Error("token=SEGREDO"));
    mount(view);
    fireEvent.click(await screen.findByRole("button", { name: prep }));
    await waitFor(() => expect(m.toast).toHaveBeenCalled());
    expect(JSON.stringify(m.toast.mock.calls)).not.toContain("SEGREDO");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: dl })).toBeNull();
    expect(m.sign).not.toHaveBeenCalled();
  });

  it("caminho fora do contrato: nenhuma requisição e aviso neutro", async () => {
    m.rows.entrega_comprovantes = { data: { id: "C1", arquivo_path: "OB/x.pdf" }, error: null };
    m.rows.entrega_documentos = { data: [{ id: "D1", tipo_documento: "OUTRO", nome_arquivo: "recibo.pdf", arquivo_path: "OB/x.pdf" }], error: null };
    mount(view);
    fireEvent.click(await screen.findByRole("button", { name: prep }));
    await waitFor(() => expect(m.toast).toHaveBeenCalled());
    expect(m.download).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled();
  });

  for (const change of ["tenant", "roles", "epoch", "lease"] as const) {
    const apply = () => {
      if (change === "tenant") auth.profile = { ...auth.profile, organization_id: "OB" };
      if (change === "roles") auth.roles = ["gestor"];
      if (change === "epoch") auth.authzEpoch = 1;
      if (change === "lease") auth.checkAuthzAccess = () => false;
    };
    it(`${change} alterado durante o download descarta bytes tardios`, async () => {
      let resolve: (b: Blob) => void = () => {};
      m.download.mockImplementation((_b: string, _p: string, signal: AbortSignal) => new Promise((r, j) => { resolve = r; signal.addEventListener("abort", () => j(new Error("abort"))); }));
      const h = mount(view);
      fireEvent.click(await screen.findByRole("button", { name: prep }));
      await waitFor(() => expect(m.download).toHaveBeenCalledTimes(1));
      apply(); h.again();
      await act(async () => resolve(new Blob(["late"])));
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: dl })).toBeNull();
      expect(m.toast).not.toHaveBeenCalled();
    });
    it(`${change} alterado após preparo revoga o blob e bloqueia o clique antigo`, async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const h = mount(view);
      fireEvent.click(await screen.findByRole("button", { name: prep }));
      const old = await screen.findByRole("button", { name: dl });
      apply(); h.again();
      if (change !== "lease") await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1"));
      fireEvent.click(old);
      expect(click).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: dl })).toBeNull();
      click.mockRestore();
    });
  }

  it("sem arquivo: nenhum botão de preparo nem requisição", async () => {
    m.rows.entrega_comprovantes = { data: { id: "C1", numero_formulario: "AR-ENT-1", arquivo_path: null }, error: null };
    m.rows.entrega_documentos = { data: [], error: null };
    mount(view);
    await waitFor(() => expect(screen.queryByText(/AR-ENT-1|Nenhum documento anexado/)).not.toBeNull());
    expect(screen.queryByRole("button", { name: prep })).toBeNull();
    expect(m.download).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled();
  });
});
