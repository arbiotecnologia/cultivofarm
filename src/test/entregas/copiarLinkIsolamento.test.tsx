import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, rpcMock, uploadMock, toastMock, copiarTextoMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  uploadMock: vi.fn(),
  toastMock: vi.fn(),
  copiarTextoMock: vi.fn(),
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
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, role: "administrador", roles: ["administrador"], loading: false,
  profile: { user_id: "u1", organization_id: "O1", ativo: true, senha_provisoria: false } }) }));
vi.mock("@/components/entregas/EntregaChecklistPanel", () => ({ EntregaChecklistPanel: () => null }));
vi.mock("@/components/entregas/EntregaOcorrenciasPanel", () => ({ EntregaOcorrenciasPanel: () => null }));
vi.mock("@/components/entregas/QRCodeComprovante", () => ({
  QRCodeComprovante: () => null,
  buildValidationUrl: (t: string) => `https://x/${t}`,
}));
vi.mock("@/lib/entregas/copiarLink", async () => {
  const real = await vi.importActual<any>("@/lib/entregas/copiarLink");
  return { ...real, copiarTexto: copiarTextoMock };
});

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
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function prepararCanvas() {
  const proto = HTMLCanvasElement.prototype as any;
  proto.getContext = vi.fn(() => ({
    scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    stroke: vi.fn(), clearRect: vi.fn(), lineWidth: 0, lineCap: "", strokeStyle: "",
  }));
  proto.toDataURL = vi.fn(() => "data:image/png;base64,AAA");
  proto.toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(["x"], { type: "image/png" })));
  Element.prototype.setPointerCapture = vi.fn();
}

function desenhar(canvas: HTMLElement, n: number) {
  fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0, pointerId: 1 });
  for (let i = 1; i <= n; i++) fireEvent.pointerMove(canvas, { clientX: i, clientY: i, pointerId: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

function entregaComToken(id: string) {
  fromMock.mockImplementation((tabela: string) =>
    tabela === "entregas"
      ? chain({ data: { id, comprovante_status: "formulario_gerado", validation_token: `tok-${id}` } })
      : chain({ data: { numero_formulario: "AR-ENT-000004" } }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  prepararCanvas();
  (globalThis.crypto as any).randomUUID = () => "uuid-1";
  entregaComToken("e1");
  rpcMock.mockResolvedValue({ data: null, error: null });
  uploadMock.mockResolvedValue({ data: { path: "p" }, error: null });
  copiarTextoMock.mockResolvedValue(true);
});

describe("copiar link de validação — isolado das gravações", () => {
  it("copiar durante uma assinatura pendente não invalida a gravação", async () => {
    const upload = deferred<any>();
    uploadMock.mockReturnValue(upload.promise);

    render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /coletar assinatura digital/i }));
    fireEvent.change(await screen.findByLabelText(/nome do recebedor/i), { target: { value: "Maria" } });
    desenhar(screen.getByLabelText("Área de desenho da assinatura"), 20);
    fireEvent.click(screen.getByRole("button", { name: /confirmar assinatura/i }));
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));

    // Cópia do link no meio da gravação.
    // O botão fica atrás do diálogo modal (hidden para a árvore acessível).
    fireEvent.click(screen.getByRole("button", { name: /copiar link de validação/i, hidden: true }));
    await waitFor(() => expect(copiarTextoMock).toHaveBeenCalledTimes(1));

    // A gravação conclui normalmente: a RPC é chamada e a trava é liberada.
    upload.resolve({ data: { path: "entregas/e1/assinaturas/uuid-1.png" }, error: null });
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByLabelText("Área de desenho da assinatura")).toBeNull(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /coletar assinatura digital/i })).not.toBeDisabled(),
    );
  });

  it("A→B→A: cópia antiga concluída não escreve na tela atual", async () => {
    const copia = deferred<boolean>();
    copiarTextoMock.mockReturnValueOnce(copia.promise);

    const { rerender } = render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /copiar link de validação/i }));
    await waitFor(() => expect(copiarTextoMock).toHaveBeenCalledTimes(1));

    entregaComToken("e2");
    rerender(<EntregaComprovantePanel entrega={{ id: "e2" }} />);
    entregaComToken("e1");
    rerender(<EntregaComprovantePanel entrega={{ id: "e1" }} />);

    copia.resolve(false);
    await Promise.resolve();
    await waitFor(() => expect(copiarTextoMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText(/cópia manual/i)).toBeNull();
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/copiado/i) }),
    );
  });
});
