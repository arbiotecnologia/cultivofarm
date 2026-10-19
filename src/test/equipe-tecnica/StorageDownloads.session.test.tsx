import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null,
  profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false },
  roles: ["administrador"], role: "administrador", loading: false, checkAuthzAccess: (): boolean => true }));
const mocks = vi.hoisted(() => ({ sign: vi.fn(), query: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const q: Record<string, unknown> = {};
    for (const name of ["select", "eq", "is", "order", "limit", "gte", "lte"]) q[name] = () => q;
    q.then = (resolve: (v: unknown) => unknown, reject: (v: unknown) => unknown) => mocks.query().then(resolve, reject);
    return q;
  }, storage: { from: () => ({ createSignedUrl: mocks.sign }) },
} }));
import { ClienteDocumentosTab } from "@/components/clientes/ClienteDocumentosTab";
import { ConfirmacaoEntregaPanel } from "@/components/entregas/ConfirmacaoEntregaPanel";
const doc = { id: "D", file_name: "PRIVATE_DOC", nome: "PRIVATE_DOC", nome_arquivo: "PRIVATE_DOC", tipo: "outro", tipo_documento: "OUTRO",
  report_title: "PRIVATE_DOC", report_type: "monthly", status: "SUCCESS", generated_at: "2026-10-08", uploaded_at: "2026-10-08",
  storage_path: "OA/report.pdf", arquivo_path: "OA/report.pdf" };
beforeEach(() => {
  auth.user = { id: "A" }; auth.profile = { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false };
  auth.roles = ["administrador"]; auth.loading = false;
  auth.checkAuthzAccess = () => true;
  mocks.query.mockReset().mockResolvedValue({ data: [doc], error: null }); mocks.sign.mockReset();
});
describe("delayed Storage downloads", () => {
  const views = [
    ["customer", () => <ClienteDocumentosTab clienteId="C" />],
    ["delivery", () => <ConfirmacaoEntregaPanel entrega={{ id: "E", status: "cancelada" }} />],
  ] as const;
  for (const [name, component] of views) {
    it(`${name}: does not open delayed signed URL after lease expires without rerender`, async () => {
      let leaseValid = true;
      auth.checkAuthzAccess = () => leaseValid;
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const h = render(<MemoryRouter><QueryClientProvider client={client}>{component()}</QueryClientProvider></MemoryRouter>);
      await screen.findByText("PRIVATE_DOC");
      let resolve: (v: unknown) => void = () => {};
      mocks.sign.mockImplementation(() => new Promise(r => { resolve = r; }));
      const open = vi.spyOn(window, "open").mockImplementation(() => null);
      const download = screen.getAllByRole("button").find(b => b.querySelector("svg.lucide-download"));
      if (!download) throw new Error("download missing");
      fireEvent.click(download); await waitFor(() => expect(mocks.sign).toHaveBeenCalledTimes(1));
      leaseValid = false; // same callback reads current monitor, no Auth rerender
      await act(async () => resolve({ data: { signedUrl: "https://example.invalid/late" }, error: null }));
      expect(open).not.toHaveBeenCalled();
      fireEvent.click(download); expect(mocks.sign).toHaveBeenCalledTimes(1);
      open.mockRestore(); h.unmount(); client.clear();
    });
    for (const change of ["tenant", "logout", "roles", "inactive"] as const) {
      it(`${name}: discards URL and document on ${change}`, async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const tree = () => <MemoryRouter><QueryClientProvider client={client}>{component()}</QueryClientProvider></MemoryRouter>;
        const h = render(tree());
        await screen.findByText("PRIVATE_DOC");
        let resolve: (v: unknown) => void = () => {};
        mocks.sign.mockImplementation(() => new Promise(r => { resolve = r; }));
        const open = vi.spyOn(window, "open").mockImplementation(() => null);
        const buttons = screen.getAllByRole("button");
        const download = buttons.find(b => b.querySelector("svg.lucide-download"));
        expect(download).toBeTruthy();
        if (!download) throw new Error("download missing");
        fireEvent.click(download);
        await waitFor(() => expect(mocks.sign).toHaveBeenCalledTimes(1));
        mocks.query.mockImplementation(() => new Promise(() => {}));
        if (change === "tenant") auth.profile.organization_id = "OB";
        if (change === "logout") auth.user = null;
        if (change === "roles") auth.roles = [];
        if (change === "inactive") auth.profile.ativo = false;
        h.rerender(tree());
        expect(screen.queryByText("PRIVATE_DOC")).toBeNull();
        await act(async () => { resolve({ data: { signedUrl: "https://example.invalid/private" }, error: null }); });
        expect(open).not.toHaveBeenCalled();
        open.mockRestore(); h.unmount(); client.clear();
      });
    }
  }
});