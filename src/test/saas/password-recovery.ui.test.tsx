import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Auth from "@/pages/Auth";
import MobileLogin from "@/pages/app/MobileLogin";
import ResetPassword from "@/pages/ResetPassword";
import { PasswordRecoveryForm } from "@/components/auth/PasswordRecoveryForm";

const mocks = vi.hoisted(() => ({
  reset: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), update: vi.fn(), invoke: vi.fn(),
  getSession: vi.fn(), onAuth: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { resetPasswordForEmail: mocks.reset, signInWithPassword: mocks.signIn,
    signUp: mocks.signUp, updateUser: mocks.update, getSession: mocks.getSession,
    onAuthStateChange: mocks.onAuth }, functions: { invoke: mocks.invoke },
} }));
vi.mock("@/hooks/useSystemConfig", () => ({ useSystemConfig: () => ({ defaults: { nome_empresa: "Cultivo Farm" }, isLoading: false }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/LogoDisplay", () => ({ LogoDisplay: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.reset.mockResolvedValue({ error: null });
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.onAuth.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  window.history.replaceState({}, "", "/");
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("pausa local de recuperação", () => {
  for (const failure of [
    { code: "over_email_send_rate_limit" },
    { code: "over_request_rate_limit" },
    { status: 429 },
    { code: "other_error", status: 429 },
  ]) {
    it(`bloqueia por 60s sem retry automático: ${JSON.stringify(failure)}`, async () => {
      vi.useFakeTimers();
      mocks.reset.mockResolvedValueOnce({ error: { ...failure, message: "User not found titular@example.invalid" } });
      render(<PasswordRecoveryForm onBack={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "titular@example.invalid" } });
      const form = screen.getByRole("form", { name: "Recuperar senha" });
      await act(async () => { fireEvent.submit(form); fireEvent.submit(form); });
      expect(mocks.reset).toHaveBeenCalledTimes(1);
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("limite temporário de envios");
      expect(alert).not.toHaveTextContent(/User not found|titular@example|60|minuto/);
      expect(screen.getByRole("button", { name: "Aguarde para tentar novamente" })).toBeDisabled();
      await act(async () => { vi.advanceTimersByTime(59_999); fireEvent.submit(form); });
      expect(mocks.reset).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Aguarde para tentar novamente" })).toBeDisabled();
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(mocks.reset).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Enviar link de recuperação" })).toBeEnabled();
      await act(async () => { fireEvent.submit(form); fireEvent.submit(form); });
      expect(mocks.reset).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("status")).toHaveTextContent("Se houver uma conta elegível");
      expect(mocks.reset).toHaveBeenLastCalledWith("titular@example.invalid", {
        redirectTo: "https://app.cultivofarm.com.br/reset-password",
      });
      expect(mocks.signIn).not.toHaveBeenCalled();
      expect(mocks.signUp).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    });
  }
  it("limpa timer ao desmontar sem enviar novamente", async () => {
    vi.useFakeTimers();
    mocks.reset.mockResolvedValueOnce({ error: { status: 429 } });
    const view = render(<PasswordRecoveryForm onBack={vi.fn()} />);
    await act(async () => { fireEvent.submit(screen.getByRole("form", { name: "Recuperar senha" })); });
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(mocks.reset).toHaveBeenCalledTimes(1);
  });
  it("ignora limite retornado após desmontagem sem criar timer", async () => {
    vi.useFakeTimers();
    let finish: ((value: { error: { status: number } }) => void) | undefined;
    mocks.reset.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<PasswordRecoveryForm onBack={vi.fn()} />);
    fireEvent.submit(screen.getByRole("form", { name: "Recuperar senha" }));
    view.unmount();
    await act(async () => { finish?.({ error: { status: 429 } }); });
    expect(vi.getTimerCount()).toBe(0);
    expect(mocks.reset).toHaveBeenCalledTimes(1);
  });
});

for (const [name, Page, recoveryButton] of [
  ["principal", Auth, "Esqueci minha senha"],
  ["mobile", MobileLogin, "Esqueceu a senha?"],
] as const) {
  describe(`recuperação ${name}`, () => {
    async function open() {
      const user = userEvent.setup();
      render(<MemoryRouter><Page /></MemoryRouter>);
      await user.click(screen.getByRole("button", { name: recoveryButton }));
      return user;
    }
    it("abre email sem senha, volta ao login e não reabre cadastro", async () => {
      const user = await open();
      expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Email")).toBeRequired();
      await user.click(screen.getByRole("button", { name: "Voltar ao login" }));
      expect(screen.getByLabelText("Senha")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Criar conta" })).not.toBeInTheDocument();
      expect(mocks.reset).not.toHaveBeenCalled();
    });
    it("envia apenas recovery ao destino canônico e mostra confirmação genérica", async () => {
      const user = await open();
      await user.type(screen.getByLabelText("Email"), "titular@example.invalid");
      await user.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
      expect(mocks.reset).toHaveBeenCalledExactlyOnceWith("titular@example.invalid", {
        redirectTo: "https://app.cultivofarm.com.br/reset-password",
      });
      expect(await screen.findByRole("status")).toHaveTextContent("Se houver uma conta elegível");
      expect(screen.getByRole("status")).not.toHaveTextContent("titular@example.invalid");
      expect(mocks.signIn).not.toHaveBeenCalled();
      expect(mocks.signUp).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    });
    for (const kind of ["erro", "rejeição"] as const) {
      it(`${kind} fica sanitizado e finally permite nova tentativa`, async () => {
        if (kind === "erro") mocks.reset.mockResolvedValueOnce({ error: { message: "User not found titular@example.invalid" } });
        else mocks.reset.mockRejectedValueOnce(new Error("segredo interno"));
        const user = await open();
        await user.type(screen.getByLabelText("Email"), "titular@example.invalid");
        await user.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("Não foi possível solicitar a recuperação");
        expect(alert).not.toHaveTextContent(/User not found|segredo interno|titular@example/);
        expect(screen.getByRole("button", { name: "Enviar link de recuperação" })).toBeEnabled();
        await user.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
        expect(await screen.findByRole("status")).toBeInTheDocument();
        expect(mocks.reset).toHaveBeenCalledTimes(2);
      });
    }
    it("lock síncrono bloqueia submit duplicado, loading e volta durante envio", async () => {
      let finish: ((value: { error: null }) => void) | undefined;
      mocks.reset.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
      const user = await open();
      await user.type(screen.getByLabelText("Email"), "titular@example.invalid");
      const form = screen.getByRole("form", { name: "Recuperar senha" });
      act(() => { fireEvent.submit(form); fireEvent.submit(form); });
      expect(mocks.reset).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Enviando…" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Voltar ao login" })).toBeDisabled();
      await act(async () => { finish?.({ error: null }); });
      expect(await screen.findByRole("status")).toBeInTheDocument();
    });
  });
}

it("link inválido encaminha para novo pedido e permite voltar ao login sem finalizar senha", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={["/reset-password"]}><ResetPassword /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "Solicitar nova recuperação" })).toHaveAttribute("href", "/auth?recovery=1");
  expect(screen.getByRole("link", { name: "Voltar ao login" })).toHaveAttribute("href", "/auth");
  await user.click(screen.getByRole("link", { name: "Solicitar nova recuperação" }));
  await waitFor(() => expect(mocks.getSession).toHaveBeenCalled());
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.reset).not.toHaveBeenCalled();
});

it("destino de novo pedido abre diretamente o formulário no login principal", () => {
  render(<MemoryRouter initialEntries={["/auth?recovery=1"]}><Auth /></MemoryRouter>);
  expect(screen.getByRole("form", { name: "Recuperar senha" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
});
