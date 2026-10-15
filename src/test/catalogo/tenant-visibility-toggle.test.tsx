import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const mutateAsync = vi.fn();
let pending = false;
let scope: { userId: string; organizationId: string } | null = { userId: "u", organizationId: "o" };
vi.mock("@/hooks/useTenantCatalogVisibility", () => ({
  useTenantCatalogScope: () => scope,
  useSetTenantVisibility: () => ({ mutateAsync, isPending: pending }),
  useTenantVisibilityMap: () => ({}),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ roles: ["gestor"] }) }));
const toastFns = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastFns }));

import { TenantVisibilityToggle } from "@/components/protocolos/TenantVisibilityControls";

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "33333333-3333-4333-8333-333333333333";

function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}

function openAndConfirm(reason = "Não vendemos este") {
  fireEvent.click(screen.getByRole("button", { name: /Ocultar/ }));
  fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: reason } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
}

describe("TenantVisibilityToggle", () => {
  beforeEach(() => {
    mutateAsync.mockReset(); pending = false; scope = { userId: "u", organizationId: "o" };
    Object.values(toastFns).forEach((f) => f.mockReset());
  });

  it("item inativo oculto não pode ser exibido", () => {
    render(<TenantVisibilityToggle entity="produto" item={{ id: ID, nome: "X", ativo: false }} state={{ hidden: true, version: 1 }} />);
    expect(screen.getByRole("button", { name: /Exibir/ }).matches(":disabled")).toBe(true);
  });
  it("sem escopo de empresa fica desativado", () => {
    scope = null;
    render(<TenantVisibilityToggle entity="produto" item={{ id: ID, nome: "X", ativo: true }} state={undefined} />);
    expect(screen.getByRole("button", { name: /Ocultar/ }).matches(":disabled")).toBe(true);
  });
  it("envia a intenção congelada na abertura e exige motivo", async () => {
    mutateAsync.mockResolvedValue({ hidden: true, version: 1, replayed: false });
    render(<TenantVisibilityToggle entity="produto" item={{ id: ID, nome: "X", ativo: true }} state={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /Ocultar/ }));
    expect(screen.getByRole("button", { name: "Confirmar" }).matches(":disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Não vendemos este" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ entityId: ID, hidden: true, expectedVersion: 0, scopeAtStart: { organizationId: "o", userId: "u" } });
    await vi.waitFor(() => expect(toastFns.success).toHaveBeenCalledTimes(1));
  });

  for (const [label, change] of [
    ["empresa", () => { scope = { userId: "u", organizationId: "o2" }; }],
    ["usuário", () => { scope = { userId: "u2", organizationId: "o" }; }],
  ] as const) {
    it(`troca de ${label} com envio pendente fecha o diálogo e descarta sucesso tardio`, async () => {
      const d = deferred<{ hidden: boolean; version: number; replayed: boolean }>();
      mutateAsync.mockReturnValue(d.promise);
      const el = (s?: { hidden: boolean; version: number }) =>
        <TenantVisibilityToggle entity="produto" item={{ id: ID, nome: "X", ativo: true }} state={s} />;
      const { rerender } = render(el());
      openAndConfirm();
      await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      change();
      rerender(el());
      expect(screen.queryByLabelText("Motivo")).toBeNull();
      expect(toastFns.info).toHaveBeenCalledTimes(1);
      await act(async () => { d.resolve({ hidden: true, version: 1, replayed: false }); await d.promise; });
      expect(toastFns.success).not.toHaveBeenCalled();
      expect(screen.queryByLabelText("Motivo")).toBeNull();
    });
  }

  it("troca de item ou versão com diálogo aberto invalida a intenção (sem envio)", () => {
    const { rerender } = render(<TenantVisibilityToggle entity="produto" item={{ id: ID, nome: "X", ativo: true }} state={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /Ocultar/ }));
    rerender(<TenantVisibilityToggle entity="produto" item={{ id: ID2, nome: "Y", ativo: true }} state={undefined} />);
    expect(screen.queryByLabelText("Motivo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ocultar/ }));
    rerender(<TenantVisibilityToggle entity="produto" item={{ id: ID2, nome: "Y", ativo: true }} state={{ hidden: false, version: 3 }} />);
    expect(screen.queryByLabelText("Motivo")).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("erro tardio após troca de versão não mostra toast de erro", async () => {
    const d = deferred<never>();
    mutateAsync.mockReturnValue(d.promise);
    const { rerender } = render(<TenantVisibilityToggle entity="produto" item={{ id: ID, nome: "X", ativo: true }} state={undefined} />);
    openAndConfirm();
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    rerender(<TenantVisibilityToggle entity="produto" item={{ id: ID, nome: "X", ativo: true }} state={{ hidden: true, version: 1 }} />);
    await act(async () => { d.reject(new Error("tarde")); await d.promise.catch(() => {}); });
    expect(toastFns.error).not.toHaveBeenCalled();
  });

  it("retry do mesmo payload reusa a chave; motivo alterado gera chave nova", async () => {
    mutateAsync.mockRejectedValue(new Error("rede"));
    render(<TenantVisibilityToggle entity="produto" item={{ id: ID, nome: "X", ativo: true }} state={undefined} />);
    openAndConfirm("Motivo um");
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" }).matches(":disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" }).matches(":disabled")).toBe(false));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Motivo dois" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(3));
    const keys = mutateAsync.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("estado ocupado desativa o botão", () => {
    pending = true;
    render(<TenantVisibilityToggle entity="cultura" item={{ id: ID, nome: "Soja", ativo: true }} state={{ hidden: true, version: 2 }} />);
    expect(screen.getByRole("button", { name: /Exibir/ }).matches(":disabled")).toBe(true);
  });
});
