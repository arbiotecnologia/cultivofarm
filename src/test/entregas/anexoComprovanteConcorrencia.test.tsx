import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

/** Promise controlada de verdade (sem fake timers). */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function arquivo(nome: string, tipo: string, tamanho = 1024) {
  return new File([new Uint8Array(tamanho)], nome, { type: tipo });
}

function mockEntregaOk() {
  fromMock.mockImplementation((tabela: string) =>
    tabela === "entregas"
      ? chain({ data: { id: "e1", comprovante_status: "formulario_gerado", validation_token: "tok" } })
      : chain({ data: { id: "c1", numero_formulario: "AR-ENT-000004" } }),
  );
}

async function iniciarEnvio(nomeArquivo = "comp.pdf") {
  fireEvent.click(await screen.findByRole("button", { name: /Anexar comprovante/ }));
  const input = await screen.findByLabelText("Arquivo do comprovante *");
  const file = arquivo(nomeArquivo, "application/pdf");
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("Nome do recebedor *"), { target: { value: "João" } });
  fireEvent.click(screen.getByRole("button", { name: /Enviar comprovante/ }));
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEntregaOk();
});

describe("EntregaComprovantePanel — concorrência no envio do anexo", () => {
  it("troca de entrega durante o upload: não inicia a RPC nem afeta a nova entrega", async () => {
    const up = deferred<any>();
    uploadMock.mockReturnValue(up.promise);

    const view = render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    await iniciarEnvio();
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));

    view.rerender(<EntregaComprovantePanel entrega={{ id: "e2" }} />);
    up.resolve({ error: null });
    await Promise.resolve();

    await waitFor(() => expect(rpcMock).not.toHaveBeenCalled());
    expect(screen.queryByTestId("comprovante-vinculo-pendente")).not.toBeInTheDocument();
    expect(screen.queryByTestId("comprovante-arquivo-selecionado")).not.toBeInTheDocument();
  });

  it("troca de entrega durante a RPC com rejeição tardia: não mostra erro na nova entrega", async () => {
    uploadMock.mockResolvedValue({ error: null });
    const rpc = deferred<any>();
    rpcMock.mockReturnValue(rpc.promise);

    const view = render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    await iniciarEnvio();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    view.rerender(<EntregaComprovantePanel entrega={{ id: "e2" }} />);
    rpc.reject(new Error("rede"));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByTestId("comprovante-vinculo-pendente")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("A→B→A: resultado da operação antiga não é aplicado ao voltar para A", async () => {
    uploadMock.mockResolvedValue({ error: null });
    const rpc = deferred<any>();
    rpcMock.mockReturnValue(rpc.promise);

    const view = render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    await iniciarEnvio();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    view.rerender(<EntregaComprovantePanel entrega={{ id: "e2" }} />);
    view.rerender(<EntregaComprovantePanel entrega={{ id: "e1" }} />);
    rpc.resolve({ error: { message: "falhou" } });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByTestId("comprovante-vinculo-pendente")).not.toBeInTheDocument();
    expect(screen.queryByTestId("comprovante-arquivo-selecionado")).not.toBeInTheDocument();
  });

  it("falha da operação antiga não destrava o envio em andamento da nova entrega", async () => {
    const upA = deferred<any>();
    const upB = deferred<any>();
    uploadMock.mockReturnValueOnce(upA.promise).mockReturnValueOnce(upB.promise);

    const view = render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    await iniciarEnvio();
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));

    view.rerender(<EntregaComprovantePanel entrega={{ id: "e2" }} />);
    await iniciarEnvio("outro.pdf");
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: /Enviando/ })).toBeDisabled();

    upA.resolve({ error: { message: "falha antiga" } });
    await new Promise((r) => setTimeout(r, 0));

    // A trava de B permanece: o envio de B continua em andamento.
    expect(screen.getByRole("button", { name: /Enviando/ })).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("nova tentativa com o mesmo arquivo apenas revincula, sem reenviar", async () => {
    uploadMock.mockResolvedValue({ error: null });
    rpcMock.mockResolvedValueOnce({ error: { message: "falhou" } }).mockResolvedValueOnce({ error: null });

    render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    await iniciarEnvio();

    expect(await screen.findByTestId("comprovante-vinculo-pendente")).toBeInTheDocument();
    const path = rpcMock.mock.calls[0][1].p_payload.arquivo_path;

    fireEvent.click(screen.getByRole("button", { name: /Tentar vincular novamente/ }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[1][1].p_payload.arquivo_path).toBe(path);
  });
});
