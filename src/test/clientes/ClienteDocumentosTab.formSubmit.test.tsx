import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// P2: ClienteDocumentosTab dentro do <form> do cadastro não pode submeter o
// form pai (fechava o modal). Botões Baixar/Excluir/Enviar são type="button".

const DOC = {
  id: "d1", cliente_id: "c1", nome: "cnh.pdf", tipo: "cnh",
  arquivo_path: "o1/clientes/c1/cnh/x.pdf", tamanho_bytes: 1024,
  uploaded_at: "2026-10-01T00:00:00Z", descricao: null,
};

const removeSpy = vi.fn();
const deleteSpy = vi.fn();
const createSignedUrl = vi.fn(() => new Promise(() => {})); // pendente

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {
    select: () => builder, eq: () => builder, filter: () => builder,
    order: () => Promise.resolve({ data: [DOC], error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    delete: () => { deleteSpy(); return builder; },
    insert: () => Promise.resolve({ error: null }),
  };
  return {
    supabase: {
      from: () => builder,
      storage: { from: () => ({ createSignedUrl, remove: removeSpy, upload: vi.fn() }) },
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    },
  };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ profile: { organization_id: "o1" } }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({
  useStorageAccessScope: (s: string) => ({ ready: true, scope: s, capture: () => () => true }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ClienteDocumentosTab } from "@/components/clientes/ClienteDocumentosTab";

function renderInForm() {
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  render(<form onSubmit={onSubmit}><ClienteDocumentosTab clienteId="c1" /></form>);
  return onSubmit;
}

describe("ClienteDocumentosTab dentro de form pai", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("Preparar não submete o form pai nem assina URL", async () => {
    const onSubmit = renderInForm();
    const btn = await screen.findByRole("button", { name: /Preparar cnh.pdf/ });
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 20));
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(0);
  });

  it("Excluir abre confirmação sem executar exclusão nem submeter", async () => {
    const onSubmit = renderInForm();
    fireEvent.click(await screen.findByTitle("Excluir"));
    expect(await screen.findByText("Excluir documento?")).toBeTruthy();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(0);
  });

  it("Enviar com arquivo sem tipo nega por validação sem submeter", async () => {
    const onSubmit = renderInForm();
    await screen.findByRole("button", { name: /Preparar cnh.pdf/ });
    const input = document.getElementById("doc-file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } });
    const enviar = screen.getByRole("button", { name: /Enviar$/ });
    fireEvent.click(enviar);
    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Selecione o tipo do documento"));
    expect(onSubmit).toHaveBeenCalledTimes(0);
  });
});
