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
vi.mock("@/components/entregas/QRCodeComprovante", () => ({
  QRCodeComprovante: () => null,
  buildValidationUrl: () => "https://x",
}));

import { AssinaturaDigitalCanvas } from "@/components/entregas/AssinaturaDigitalCanvas";
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

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Desenha `n` pontos no canvas via eventos de ponteiro. */
function desenhar(canvas: HTMLElement, n: number) {
  fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0, pointerId: 1 });
  for (let i = 1; i <= n; i++) {
    fireEvent.pointerMove(canvas, { clientX: i, clientY: i, pointerId: 1 });
  }
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

function prepararCanvas(blob: Blob | null = new Blob(["x"], { type: "image/png" })) {
  const proto = HTMLCanvasElement.prototype as any;
  proto.getContext = vi.fn(() => ({
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    lineWidth: 0,
    lineCap: "",
    strokeStyle: "",
  }));
  proto.toDataURL = vi.fn(() => "data:image/png;base64,AAA");
  proto.toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(blob));
  Element.prototype.setPointerCapture = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  prepararCanvas();
  (globalThis.crypto as any).randomUUID = () => "uuid-1";
  fromMock.mockImplementation((tabela: string) =>
    tabela === "entregas"
      ? chain({ data: { id: "e1", comprovante_status: "formulario_gerado", validation_token: null } })
      : chain({ data: { numero_formulario: "AR-ENT-000004" } }),
  );
  rpcMock.mockResolvedValue({ data: null, error: null });
  uploadMock.mockResolvedValue({ data: { path: "p" }, error: null });
});

describe("AssinaturaDigitalCanvas", () => {
  it("recusa traço curto com mensagem amigável e não chama o callback", async () => {
    const onConfirm = vi.fn();
    render(<AssinaturaDigitalCanvas onConfirm={onConfirm} />);
    const canvas = screen.getByLabelText("Área de desenho da assinatura");
    desenhar(canvas, 3);
    fireEvent.click(screen.getByRole("button", { name: /confirmar assinatura/i }));
    expect(await screen.findByTestId("assinatura-erro")).toHaveTextContent(/traço muito curto/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("avisa quando a imagem não pode ser gerada (toBlob nulo)", async () => {
    prepararCanvas(null);
    const onConfirm = vi.fn();
    render(<AssinaturaDigitalCanvas onConfirm={onConfirm} />);
    desenhar(screen.getByLabelText("Área de desenho da assinatura"), 20);
    fireEvent.click(screen.getByRole("button", { name: /confirmar assinatura/i }));
    expect(await screen.findByTestId("assinatura-erro")).toHaveTextContent(/não foi possível gerar a imagem/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("duplo clique não dispara duas coletas e aguarda o callback", async () => {
    const d = deferred<void>();
    const onConfirm = vi.fn(() => d.promise);
    render(<AssinaturaDigitalCanvas onConfirm={onConfirm} />);
    desenhar(screen.getByLabelText("Área de desenho da assinatura"), 20);
    const botao = screen.getByRole("button", { name: /confirmar assinatura/i });
    fireEvent.click(botao);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /registrando/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    d.resolve();
    await waitFor(() => expect(screen.getByRole("button", { name: /confirmar assinatura/i })).toBeInTheDocument());
  });

  it("callback rejeitado vira mensagem amigável e libera nova tentativa", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("boom"));
    render(<AssinaturaDigitalCanvas onConfirm={onConfirm} />);
    desenhar(screen.getByLabelText("Área de desenho da assinatura"), 20);
    fireEvent.click(screen.getByRole("button", { name: /confirmar assinatura/i }));
    expect(await screen.findByTestId("assinatura-erro")).toHaveTextContent(/não foi possível registrar/i);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /confirmar assinatura/i })).not.toBeDisabled(),
    );
  });

  it("nada é aplicado após o unmount durante o processamento", async () => {
    const d = deferred<void>();
    const onConfirm = vi.fn(() => d.promise);
    const { unmount } = render(<AssinaturaDigitalCanvas onConfirm={onConfirm} />);
    desenhar(screen.getByLabelText("Área de desenho da assinatura"), 20);
    fireEvent.click(screen.getByRole("button", { name: /confirmar assinatura/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    unmount();
    d.reject(new Error("tarde"));
    await Promise.resolve();
    expect(screen.queryByTestId("assinatura-erro")).toBeNull();
  });
});

async function abrirAssinatura(entregaId = "e1") {
  const r = render(<EntregaComprovantePanel entrega={{ id: entregaId }} />, { wrapper });
  fireEvent.click(await screen.findByRole("button", { name: /coletar assinatura digital/i }));
  fireEvent.change(await screen.findByLabelText(/nome do recebedor/i), { target: { value: "Maria" } });
  return r;
}

async function assinar() {
  desenhar(screen.getByLabelText("Área de desenho da assinatura"), 20);
  fireEvent.click(screen.getByRole("button", { name: /confirmar assinatura/i }));
}

describe("EntregaComprovantePanel — assinatura do comprovante", () => {
  it("envia PNG com UUID e upsert false e registra a assinatura", async () => {
    await abrirAssinatura();
    await assinar();
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(uploadMock).toHaveBeenCalledWith(
      "entregas/e1/assinaturas/uuid-1.png",
      expect.anything(),
      { contentType: "image/png", upsert: false },
    );
  });

  it("retry após falha da RPC reaproveita o PNG sem reenviar", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "falha" } });
    await abrirAssinatura();
    await assinar();
    await waitFor(() => expect(screen.getByTestId("assinatura-vinculo-pendente")).toBeInTheDocument());
    expect(uploadMock).toHaveBeenCalledTimes(1);
    // Nova tentativa da MESMA assinatura: apenas confirma de novo, sem redesenhar.
    fireEvent.click(screen.getByRole("button", { name: /confirmar assinatura/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("troca de entrega durante o upload impede a chamada da RPC", async () => {
    const up = deferred<any>();
    uploadMock.mockReturnValueOnce(up.promise);
    const { rerender } = await abrirAssinatura("e1");
    await assinar();
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    rerender(<EntregaComprovantePanel entrega={{ id: "e2" }} />);
    up.resolve({ data: { path: "p" }, error: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("A→B→A: resposta antiga não altera o modal da entrega atual", async () => {
    const rpcD = deferred<any>();
    rpcMock.mockReturnValueOnce(rpcD.promise);
    const { rerender } = await abrirAssinatura("e1");
    await assinar();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    rerender(<EntregaComprovantePanel entrega={{ id: "e2" }} />);
    rerender(<EntregaComprovantePanel entrega={{ id: "e1" }} />);
    rpcD.resolve({ data: null, error: { message: "falha" } });
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByTestId("assinatura-vinculo-pendente")).toBeNull();
    expect(
      toastMock.mock.calls.some((c) => /assinatura foi enviada/i.test(c[0]?.description ?? "")),
    ).toBe(false);
  });
});

describe("EntregaComprovantePanel — reuso do PNG da assinatura", () => {
  it("retry usa o hash e o payload ORIGINAIS e faz um único upload", async () => {
    // Cada confirmação gera um hash novo no canvas (timestamp distinto).
    let t = 0;
    vi.spyOn(Date.prototype, "toISOString").mockImplementation(() => `2026-01-01T00:00:0${t++}.000Z`);
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "falha" } });
    await abrirAssinatura();
    await assinar();
    await waitFor(() => expect(screen.getByTestId("assinatura-vinculo-pendente")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /confirmar assinatura/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));

    const p1 = rpcMock.mock.calls[0][1].p_payload;
    const p2 = rpcMock.mock.calls[1][1].p_payload;
    expect(p2.assinatura_hash).toBe(p1.assinatura_hash);
    expect(p2.assinatura_digital_png_path).toBe(p1.assinatura_digital_png_path);
    expect(p2.recebedor_nome).toBe(p1.recebedor_nome);
    expect(p2.recebedor_documento).toBe(p1.recebedor_documento);
    expect(p2.recebedor_cargo).toBe(p1.recebedor_cargo);
    expect(p2.recebedor_telefone).toBe(p1.recebedor_telefone);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("mudar o recebedor descarta o pendente: reenvia o PNG com o novo payload", async () => {
    let n = 0;
    (globalThis.crypto as any).randomUUID = () => `uuid-${++n}`;
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "falha" } });
    await abrirAssinatura();
    await assinar();
    await waitFor(() => expect(screen.getByTestId("assinatura-vinculo-pendente")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/nome do recebedor/i), { target: { value: "João" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar assinatura/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[1][1].p_payload.recebedor_nome).toBe("João");
    expect(rpcMock.mock.calls[1][1].p_payload.assinatura_digital_png_path).toBe(
      "entregas/e1/assinaturas/uuid-2.png",
    );
  });
});

describe("EntregaComprovantePanel — ações de comprovação isoladas por entrega", () => {
  function statusPendente() {
    fromMock.mockImplementation((tabela: string) =>
      tabela === "entregas"
        ? chain({ data: { id: "e1", comprovante_status: "pendente", validation_token: null } })
        : chain({ data: null }),
    );
  }

  it("gerar: conclusão tardia após A→B→A não emite toast nem destrava o contexto novo", async () => {
    statusPendente();
    const d = deferred<any>();
    rpcMock.mockReturnValueOnce(d.promise);
    const { rerender } = render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /gerar formulário/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    rerender(<EntregaComprovantePanel entrega={{ id: "e2" }} />);
    rerender(<EntregaComprovantePanel entrega={{ id: "e1" }} />);
    toastMock.mockClear();
    d.resolve({ data: null, error: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(toastMock).not.toHaveBeenCalled();
    // O botão do contexto novo continua utilizável (mutação antiga não bloqueia).
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /gerar formulário/i })).not.toBeDisabled(),
    );
  });

  it("confirmar: falha tardia da entrega antiga não fecha o diálogo nem limpa ressalvas da nova", async () => {
    fromMock.mockImplementation((tabela: string) =>
      tabela === "entregas"
        ? chain({ data: { id: "x", comprovante_status: "anexado", validation_token: null } })
        : chain({ data: { numero_formulario: "AR-ENT-000004" } }),
    );
    const d = deferred<any>();
    rpcMock.mockReturnValueOnce(d.promise);
    const { rerender } = render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /confirmar recebimento/i }));
    fireEvent.change(screen.getByPlaceholderText(/descreva ressalvas/i), { target: { value: "caixa amassada" } });
    fireEvent.click(screen.getByRole("button", { name: /^confirmar$/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    // Payload capturado no início.
    expect(rpcMock.mock.calls[0][1].p_payload.ressalvas).toBe("caixa amassada");

    rerender(<EntregaComprovantePanel entrega={{ id: "e2" }} />);
    fireEvent.click(await screen.findByRole("button", { name: /confirmar recebimento/i }));
    fireEvent.change(screen.getByPlaceholderText(/descreva ressalvas/i), { target: { value: "nova" } });
    toastMock.mockClear();
    d.resolve({ data: null, error: { message: "falha" } });
    await Promise.resolve();
    await Promise.resolve();
    expect(toastMock).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText(/descreva ressalvas/i) as HTMLTextAreaElement).value).toBe("nova");
    expect(screen.getByRole("button", { name: /^confirmar$/i })).not.toBeDisabled();
  });

  it("dispensar: troca de entrega reseta o motivo e o término antigo não afeta a nova", async () => {
    const d = deferred<any>();
    rpcMock.mockReturnValueOnce(d.promise);
    const { rerender } = render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /dispensar assinatura/i }));
    fireEvent.change(screen.getByPlaceholderText(/mínimo 5 caracteres/i), { target: { value: "cliente ausente" } });
    fireEvent.click(screen.getByRole("button", { name: /^dispensar$/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock.mock.calls[0][1].p_motivo).toBe("cliente ausente");

    rerender(<EntregaComprovantePanel entrega={{ id: "e2" }} />);
    fireEvent.click(await screen.findByRole("button", { name: /dispensar assinatura/i }));
    expect((screen.getByPlaceholderText(/mínimo 5 caracteres/i) as HTMLTextAreaElement).value).toBe("");
    toastMock.mockClear();
    d.resolve({ data: null, error: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(toastMock).not.toHaveBeenCalled();
  });
});

describe("EntregaComprovantePanel — término antigo não destrava a ação nova", () => {
  it("ação de B em voo continua travada quando a ação de A termina", async () => {
    const dA = deferred<any>();
    const dB = deferred<any>();
    rpcMock.mockReturnValueOnce(dA.promise).mockReturnValueOnce(dB.promise);
    const { rerender } = render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });

    // A: dispensa em voo.
    fireEvent.click(await screen.findByRole("button", { name: /dispensar assinatura/i }));
    fireEvent.change(screen.getByPlaceholderText(/mínimo 5 caracteres/i), { target: { value: "motivo de A" } });
    fireEvent.click(screen.getByRole("button", { name: /^dispensar$/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    // Troca para B e inicia a ação de B, que fica pendente.
    rerender(<EntregaComprovantePanel entrega={{ id: "e2" }} />);
    fireEvent.click(await screen.findByRole("button", { name: /dispensar assinatura/i }));
    fireEvent.change(screen.getByPlaceholderText(/mínimo 5 caracteres/i), { target: { value: "motivo de B" } });
    fireEvent.click(screen.getByRole("button", { name: /^dispensar$/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(rpcMock.mock.calls[1][1].p_motivo).toBe("motivo de B");
    const botaoB = screen.getByRole("button", { name: /^dispensar$/i });
    expect(botaoB).toBeDisabled();

    // A termina: não pode destravar B nem fechar o diálogo de B.
    toastMock.mockClear();
    dA.resolve({ data: null, error: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(toastMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^dispensar$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeDisabled();
    expect(screen.getByPlaceholderText(/mínimo 5 caracteres/i)).toBeDisabled();

    // Só o término de B libera.
    dB.resolve({ data: null, error: null });
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/mínimo 5 caracteres/i)).toBeNull(),
    );
  });
});
