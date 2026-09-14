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
