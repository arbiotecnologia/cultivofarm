import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: rpcMock },
}));

import ValidarEntrega from "@/pages/public/ValidarEntrega";

const TOKEN_A = "11111111-1111-4111-8111-111111111111";
const TOKEN_B = "22222222-2222-4222-8222-222222222222";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function abrir(token?: string) {
  return render(
    <MemoryRouter initialEntries={[token ? `/validar/${token}` : "/validar"]}>
      <Routes>
        <Route path="/validar" element={<ValidarEntrega />} />
        <Route path="/validar/:token" element={<ValidarEntrega />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({ data: { valido: true, status: "gerado" }, error: null });
});

describe("ValidarEntrega — token", () => {
  it("token ausente não consulta e não fica carregando", async () => {
    abrir();
    expect(await screen.findByText(/endereço de validação inválido/i)).toBeInTheDocument();
    expect(screen.queryByText(/verificando/i)).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("token malformado não consulta a RPC", async () => {
    abrir("abc-123");
    expect(await screen.findByText(/endereço de validação inválido/i)).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("ValidarEntrega — resultados", () => {
  it("documento gerado sem confirmação não mostra recebimento confirmado", async () => {
    rpcMock.mockResolvedValue({
      data: { valido: true, status: "gerado", numero_formulario: "AR-ENT-000004" },
      error: null,
    });
    abrir(TOKEN_A);
    expect(
      await screen.findByText(/documento registrado — recebimento ainda não confirmado/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/recebimento confirmado/i)).toBeNull();
  });

  it("confirmado mostra recebimento confirmado e data válida", async () => {
    rpcMock.mockResolvedValue({
      data: {
        valido: true,
        status: "confirmado",
        data_confirmacao: "2026-09-10T12:00:00Z",
        data_assinatura: "data-invalida",
      },
      error: null,
    });
    abrir(TOKEN_A);
    expect(await screen.findByText(/recebimento confirmado/i)).toBeInTheDocument();
    expect(screen.getByText(/confirmado em/i)).toBeInTheDocument();
    expect(screen.queryByText(/assinatura:/i)).toBeNull();
  });

  it("dispensa de assinatura é identificada claramente", async () => {
    rpcMock.mockResolvedValue({
      data: { valido: true, status: "dispensado", assinatura_tipo: "dispensada" },
      error: null,
    });
    abrir(TOKEN_A);
    expect(await screen.findByText(/assinatura deste comprovante foi dispensada/i)).toBeInTheDocument();
    expect(screen.queryByText(/^recebimento confirmado$/i)).toBeNull();
  });

  it("rótulo desconhecido é exibido de forma segura", async () => {
    rpcMock.mockResolvedValue({ data: { valido: true, status: "status_novo_xyz" }, error: null });
    abrir(TOKEN_A);
    expect(await screen.findByText("status novo xyz")).toBeInTheDocument();
  });

  it("comprovante indisponível não oferece nova tentativa", async () => {
    rpcMock.mockResolvedValue({ data: { valido: false, mensagem: "Comprovante revogado." }, error: null });
    abrir(TOKEN_A);
    expect(await screen.findByText(/comprovante indisponível/i)).toBeInTheDocument();
    expect(screen.getByText("Comprovante revogado.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tentar novamente/i })).toBeNull();
  });
});

describe("ValidarEntrega — falhas e limites", () => {
  it("erro da RPC é tratado como falha de rede, com nova tentativa manual", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "network" } });
    abrir(TOKEN_A);
    expect(await screen.findByText(/consulta não concluída/i)).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/documento registrado/i)).toBeInTheDocument();
  });

  it("promessa rejeitada não deixa a tela carregando", async () => {
    rpcMock.mockRejectedValueOnce(new Error("offline"));
    abrir(TOKEN_A);
    expect(await screen.findByText(/verifique a conexão/i)).toBeInTheDocument();
    expect(screen.queryByText(/verificando/i)).toBeNull();
  });

  it("rate limit respeita a espera e não consulta automaticamente", async () => {
    rpcMock.mockResolvedValueOnce({ data: { retry_after_seconds: 30 }, error: null });
    abrir(TOKEN_A);
    const botao = await screen.findByRole("button", { name: /tentar novamente em 30s/i });
    expect(botao).toBeDisabled();
    await new Promise((r) => setTimeout(r, 30));
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("troca rápida de token descarta a resposta antiga", async () => {
    const dA = deferred<any>();
    rpcMock.mockReturnValueOnce(dA.promise);
    const { unmount } = abrir(TOKEN_A);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    unmount();

    rpcMock.mockResolvedValue({ data: { valido: true, status: "confirmado" }, error: null });
    abrir(TOKEN_B);
    expect(await screen.findByText(/recebimento confirmado/i)).toBeInTheDocument();
    dA.resolve({ data: { valido: false, mensagem: "antigo" }, error: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText("antigo")).toBeNull();
    expect(screen.getByText(/recebimento confirmado/i)).toBeInTheDocument();
  });
});
