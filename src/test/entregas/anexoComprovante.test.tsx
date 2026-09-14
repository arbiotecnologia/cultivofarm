import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  validarAnexoComprovante,
  normalizarMimeAnexo,
  TAMANHO_MAXIMO_ANEXO_BYTES,
} from "@/lib/entregas/anexoComprovante";

const { fromMock, rpcMock, uploadMock, toastMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  uploadMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
    storage: {
      from: () => ({
        upload: uploadMock,
        createSignedUrl: async () => ({ data: null, error: { message: "x" } }),
      }),
    },
  },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: toastMock, useToast: () => ({ toast: toastMock }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, role: "administrador" }) }));
vi.mock("@/components/entregas/EntregaChecklistPanel", () => ({ EntregaChecklistPanel: () => null }));
vi.mock("@/components/entregas/EntregaOcorrenciasPanel", () => ({ EntregaOcorrenciasPanel: () => null }));

import { EntregaComprovantePanel } from "@/components/entregas/EntregaComprovantePanel";

function chain(resultado: { data?: any; error?: any }) {
  const obj: any = {
    select: () => obj,
    eq: () => obj,
    order: () => obj,
    limit: () => obj,
    maybeSingle: async () => resultado,
    then: (res: any, rej: any) => Promise.resolve(resultado).then(res, rej),
  };
  return obj;
}

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

function arquivo(nome: string, tipo: string, tamanho = 1024) {
  const f = new File([new Uint8Array(tamanho)], nome, { type: tipo });
  return f;
}

function mockEntregaOk() {
  fromMock.mockImplementation((tabela: string) =>
    tabela === "entregas"
      ? chain({ data: { id: "e1", comprovante_status: "formulario_gerado", validation_token: "tok" } })
      : chain({ data: { id: "c1", numero_formulario: "AR-ENT-000004" } }),
  );
}

async function abrirDialogoAnexo() {
  fireEvent.click(await screen.findByRole("button", { name: /Anexar comprovante/ }));
  return await screen.findByLabelText("Arquivo do comprovante *");
}

async function preencherRecebedor() {
  fireEvent.change(screen.getByLabelText("Nome do recebedor *"), { target: { value: "João" } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validarAnexoComprovante", () => {
  it("aceita PDF, PNG, JPEG e WEBP com extensão coerente", () => {
    expect(validarAnexoComprovante(arquivo("a.pdf", "application/pdf")).ok).toBe(true);
    expect(validarAnexoComprovante(arquivo("a.png", "image/png")).ok).toBe(true);
    expect(validarAnexoComprovante(arquivo("a.jpeg", "image/jpeg")).ok).toBe(true);
    expect(validarAnexoComprovante(arquivo("a.webp", "image/webp")).ok).toBe(true);
  });

  it("rejeita MIME não aceito, arquivo vazio, acima de 10 MiB e extensão incoerente", () => {
    expect(validarAnexoComprovante(arquivo("a.exe", "application/x-msdownload")).ok).toBe(false);
    expect(validarAnexoComprovante(arquivo("a.pdf", "application/pdf", 0)).ok).toBe(false);
    expect(validarAnexoComprovante(arquivo("a.pdf", "application/pdf", TAMANHO_MAXIMO_ANEXO_BYTES + 1)).ok).toBe(false);
    expect(validarAnexoComprovante(arquivo("a.pdf", "image/png")).ok).toBe(false);
    expect(validarAnexoComprovante(arquivo("semextensao", "application/pdf")).ok).toBe(false);
    expect(validarAnexoComprovante(null).ok).toBe(false);
  });

  it("normaliza apelidos de MIME", () => {
    expect(normalizarMimeAnexo("IMAGE/JPG")).toBe("image/jpeg");
    expect(normalizarMimeAnexo("image/pjpeg")).toBe("image/jpeg");
  });
});

describe("EntregaComprovantePanel — anexo", () => {
  it("selecionar arquivo não envia nada automaticamente", async () => {
    mockEntregaOk();
    render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });

    const input = await abrirDialogoAnexo();
    fireEvent.change(input, { target: { files: [arquivo("comp.pdf", "application/pdf")] } });

    expect(await screen.findByTestId("comprovante-arquivo-selecionado")).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Enviar comprovante/ })).toBeEnabled();
  });

  it("arquivo de tipo não aceito é rejeitado antes do envio", async () => {
    mockEntregaOk();
    render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });

    const input = await abrirDialogoAnexo();
    fireEvent.change(input, { target: { files: [arquivo("virus.exe", "application/x-msdownload")] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Formato não aceito");
    expect(uploadMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Enviar comprovante/ })).toBeDisabled();
  });

  it("arquivo acima de 10 MB é rejeitado antes do envio", async () => {
    mockEntregaOk();
    render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });

    const input = await abrirDialogoAnexo();
    fireEvent.change(input, {
      target: { files: [arquivo("grande.pdf", "application/pdf", TAMANHO_MAXIMO_ANEXO_BYTES + 10)] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("excede o limite de 10 MB");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("envia com upsert:false e UUID no caminho, apenas ao clicar no botão", async () => {
    mockEntregaOk();
    uploadMock.mockResolvedValue({ error: null });
    rpcMock.mockResolvedValue({ error: null });

    render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    const input = await abrirDialogoAnexo();
    await preencherRecebedor();
    fireEvent.change(input, { target: { files: [arquivo("comp.pdf", "application/pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar comprovante/ }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [caminho, , opcoes] = uploadMock.mock.calls[0];
    expect(caminho).toMatch(/^entregas\/e1\/comprovantes\/[0-9a-f-]{36}\.pdf$/i);
    expect(opcoes).toMatchObject({ upsert: false, contentType: "application/pdf" });
  });

  it("clique duplo não envia o arquivo duas vezes", async () => {
    mockEntregaOk();
    uploadMock.mockImplementation(() => new Promise((r) => setTimeout(() => r({ error: null }), 40)));
    rpcMock.mockResolvedValue({ error: null });

    render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    const input = await abrirDialogoAnexo();
    await preencherRecebedor();
    fireEvent.change(input, { target: { files: [arquivo("comp.pdf", "application/pdf")] } });
    const botao = screen.getByRole("button", { name: /Enviar comprovante/ });
    fireEvent.click(botao);
    fireEvent.click(botao);

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("falha na vinculação mantém o arquivo e a nova tentativa não reenvia o arquivo", async () => {
    mockEntregaOk();
    uploadMock.mockResolvedValue({ error: null });
    rpcMock.mockResolvedValueOnce({ error: { message: "violação interna" } });

    render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    const input = await abrirDialogoAnexo();
    await preencherRecebedor();
    fireEvent.change(input, { target: { files: [arquivo("comp.pdf", "application/pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar comprovante/ }));

    expect(await screen.findByTestId("comprovante-vinculo-pendente")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("não foi possível vinculá-lo");
    expect(screen.queryByText(/violação interna/)).not.toBeInTheDocument();

    rpcMock.mockResolvedValueOnce({ error: null });
    fireEvent.click(screen.getByRole("button", { name: /Tentar vincular novamente/ }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[1][1].p_payload.arquivo_path).toBe(rpcMock.mock.calls[0][1].p_payload.arquivo_path);
  });

  it("falha no envio do arquivo não chama a vinculação e mantém a seleção", async () => {
    mockEntregaOk();
    uploadMock.mockResolvedValue({ error: { message: "storage caiu" } });

    render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    const input = await abrirDialogoAnexo();
    await preencherRecebedor();
    fireEvent.change(input, { target: { files: [arquivo("comp.pdf", "application/pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar comprovante/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível enviar o arquivo");
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("comprovante-arquivo-selecionado")).toBeInTheDocument();
    expect(screen.queryByTestId("comprovante-vinculo-pendente")).not.toBeInTheDocument();
  });

  it("trocar de entrega descarta o arquivo selecionado", async () => {
    mockEntregaOk();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <EntregaComprovantePanel entrega={{ id: "e1" }} />
      </QueryClientProvider>,
    );

    const input = await abrirDialogoAnexo();
    fireEvent.change(input, { target: { files: [arquivo("comp.pdf", "application/pdf")] } });
    expect(await screen.findByTestId("comprovante-arquivo-selecionado")).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={qc}>
        <EntregaComprovantePanel entrega={{ id: "e2" }} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.queryByTestId("comprovante-arquivo-selecionado")).not.toBeInTheDocument());
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
