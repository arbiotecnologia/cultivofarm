import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, rpcMock, toastMock, storageFrom, checklistProps, ocorrenciaProps } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  toastMock: vi.fn(),
  storageFrom: vi.fn(),
  checklistProps: [] as any[],
  ocorrenciaProps: [] as any[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock, rpc: rpcMock, functions: { invoke: vi.fn() }, storage: { from: storageFrom } },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: toastMock, useToast: () => ({ toast: toastMock }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, role: "administrador", roles: ["administrador"], loading: false,
    profile: { user_id: "u1", organization_id: "O1", ativo: true, senha_provisoria: false } }),
}));
vi.mock("@/components/entregas/EntregaChecklistPanel", () => ({
  EntregaChecklistPanel: (p: any) => { checklistProps.push(p); return null; },
}));
vi.mock("@/components/entregas/EntregaOcorrenciasPanel", () => ({
  EntregaOcorrenciasPanel: (p: any) => { ocorrenciaProps.push(p); return null; },
}));

import { EntregaComprovantePanel } from "@/components/entregas/EntregaComprovantePanel";
import { TermoEntregaPanel } from "@/components/entregas/TermoEntregaPanel";

function chain(resultado: { data?: any; error?: any }) {
  const obj: any = {
    select: () => obj, eq: () => obj, order: () => obj, limit: () => obj,
    maybeSingle: async () => resultado,
    then: (res: any, rej: any) => Promise.resolve(resultado).then(res, rej),
  };
  return obj;
}
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, W };
}
const MUTACOES = [/Coletar assinatura digital/, /Anexar comprovante/, /Confirmar recebimento/, /Dispensar assinatura/, /Gerar formulário/];

let entregaRow: any;
const comprovanteRow = { id: "c1", numero_formulario: "AR-ENT-000009", arquivo_path: "entregas/e1/comprovantes/x.pdf" };
beforeEach(() => {
  vi.clearAllMocks();
  checklistProps.length = 0; ocorrenciaProps.length = 0;
  storageFrom.mockReturnValue({ createSignedUrl: async () => ({ data: null, error: { message: "x" } }) });
  fromMock.mockImplementation((t: string) => (t === "entregas" ? chain({ data: entregaRow }) : chain({ data: comprovanteRow })));
});

describe("Comprovante — entrega cancelada é somente consulta", () => {
  it("cancelada no servidor (prop antiga 'separado'): nenhuma mutação, consulta/impressão/download preservados", async () => {
    entregaRow = { id: "e1", status: "cancelada", comprovante_status: "anexado", validation_token: "tok" };
    const { W } = makeWrapper();
    render(<EntregaComprovantePanel entrega={{ id: "e1", status: "separado", comprovante_status: "anexado" }} />, { wrapper: W });
    expect(await screen.findByTestId("comprovante-somente-consulta")).toBeInTheDocument();
    for (const n of MUTACOES) expect(screen.queryByRole("button", { name: n })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Imprimir formulário/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Preparar comprovante/ })).toBeInTheDocument();
    expect(checklistProps.at(-1).canEdit).toBe(false);
    expect(ocorrenciaProps.at(-1).canAdd).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("snapshot cancelado nunca reabre mesmo se a leitura fresca vier divergente", async () => {
    entregaRow = { id: "e1", status: "separado", comprovante_status: "formulario_gerado", validation_token: "tok" };
    const { W } = makeWrapper();
    render(<EntregaComprovantePanel entrega={{ id: "e1", status: "cancelada" }} />, { wrapper: W });
    expect(await screen.findByTestId("comprovante-somente-consulta")).toBeInTheDocument();
    for (const n of MUTACOES) expect(screen.queryByRole("button", { name: n })).not.toBeInTheDocument();
  });

  it("cancelamento observado com diálogo aberto fecha o diálogo e não grava", async () => {
    entregaRow = { id: "e1", status: "separado", comprovante_status: "formulario_gerado", validation_token: "tok" };
    const { qc, W } = makeWrapper();
    render(<EntregaComprovantePanel entrega={{ id: "e1", status: "separado" }} />, { wrapper: W });
    fireEvent.click(await screen.findByRole("button", { name: /Anexar comprovante/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    entregaRow = { ...entregaRow, status: "cancelada" };
    await act(async () => { await qc.invalidateQueries(); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("comprovante-somente-consulta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Coletar assinatura digital/ })).not.toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("estados permitidos preservam gerar, assinar e anexar", async () => {
    entregaRow = { id: "e1", status: "separado", comprovante_status: "pendente", validation_token: null };
    const { W } = makeWrapper();
    const { unmount } = render(<EntregaComprovantePanel entrega={{ id: "e1", status: "separado" }} />, { wrapper: W });
    expect(await screen.findByRole("button", { name: /Gerar formulário/ })).toBeInTheDocument();
    unmount();
    entregaRow = { id: "e1", status: "em_rota", comprovante_status: "formulario_gerado", validation_token: "tok" };
    const w2 = makeWrapper();
    render(<EntregaComprovantePanel entrega={{ id: "e1", status: "em_rota" }} />, { wrapper: w2.W });
    expect(await screen.findByRole("button", { name: /Coletar assinatura digital/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anexar comprovante/ })).toBeInTheDocument();
    expect(screen.queryByTestId("comprovante-somente-consulta")).not.toBeInTheDocument();
    expect(checklistProps.at(-1).canEdit).toBe(true);
    expect(ocorrenciaProps.at(-1).canAdd).toBe(true);
  });
});

describe("Termo — entrega cancelada é somente consulta", () => {
  const itens = [{ etiqueta_id: "et1", produto_etiquetas: { id: "et1", codigo_etiqueta: "ETQ-1", status: "ativa", cq_liberado: true } }];
  function mock(entrega: any, termo: any, entregaErro = false) {
    fromMock.mockImplementation((t: string) => {
      if (t === "entregas") return chain(entregaErro ? { data: null, error: { message: "x" } } : { data: entrega, error: null });
      if (t === "entrega_etiquetas") return chain({ data: itens, error: null });
      if (t === "entrega_conferencia_itens") return chain({ data: [], error: null });
      if (t === "entrega_termos") return chain({ data: termo, error: null });
      return chain({ data: null, error: null });
    });
  }
  const assinado = { id: "t1", versao: 1, status: "assinado", snapshot_hash: "h", assinado_em: "2026-10-30T10:00:00Z", recebedor_nome: "M", pdf_path: "termos/t1.pdf", pdf_hash: "p" };

  it("cancelada: sem salvar/gerar termo/cancelar termo/conferência; download preservado", async () => {
    mock({ id: "A", status: "cancelada" }, assinado);
    const { W } = makeWrapper();
    render(<TermoEntregaPanel entregaId="A" />, { wrapper: W });
    expect(await screen.findByTestId("termo-somente-consulta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Salvar conferência/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gerar termo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancelar termo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gerar PDF/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aceito/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Preparar termo assinado|Baixar termo assinado/ })).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("cancelada com termo em rascunho: assinatura não é oferecida", async () => {
    mock({ id: "A", status: "cancelada" }, { id: "t1", versao: 1, status: "rascunho", snapshot_hash: "h" });
    const { W } = makeWrapper();
    render(<TermoEntregaPanel entregaId="A" />, { wrapper: W });
    expect(await screen.findByTestId("termo-somente-consulta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Assinar termo/ })).not.toBeInTheDocument();
  });

  it("falha ao ler a situação da entrega bloqueia gravações (fail-closed)", async () => {
    mock(null, null, true);
    const { W } = makeWrapper();
    render(<TermoEntregaPanel entregaId="A" />, { wrapper: W });
    await screen.findByText("ETQ-1");
    expect(screen.queryByRole("button", { name: /Salvar conferência/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gerar termo/ })).not.toBeInTheDocument();
  });

  it("entrega ativa mantém conferência e geração do termo", async () => {
    mock({ id: "A", status: "separado" }, null);
    const { W } = makeWrapper();
    render(<TermoEntregaPanel entregaId="A" />, { wrapper: W });
    expect(await screen.findByRole("button", { name: /Salvar conferência/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar termo/ })).toBeInTheDocument();
    expect(screen.queryByTestId("termo-somente-consulta")).not.toBeInTheDocument();
  });
});
