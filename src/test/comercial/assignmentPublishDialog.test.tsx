import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanAssignment } from "@/hooks/useCommercialConditions";

const state = vi.hoisted(() => ({
  tenant: "007bb519-cba0-4704-be2c-cb93ad010048",
  roles: ["administrador"],
  epoch: 0,
  ready: true,
  leaseValid: true,
  assignments: [] as PlanAssignment[],
}));
const rpcMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
let publishImpl: () => Promise<{ error: { message: string } | null }>;

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock } }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-arbio" },
    profile: {
      user_id: "admin-arbio",
      organization_id: state.tenant,
      ativo: true,
      senha_provisoria: false,
    },
    roles: state.roles,
    loading: false,
    authzReady: state.ready,
    authzEpoch: state.epoch,
    checkAuthzAccess: () => state.leaseValid,
    revalidateAuthz: vi.fn(),
  }),
}));
vi.mock("@/hooks/useCommercialConditions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useCommercialConditions")>();
  return {
    ...actual,
    usePlanAssignments: () => ({ data: state.assignments, isLoading: false, isError: false, error: null }),
    useSaveAssignment: () => ({ mutate: vi.fn(), isPending: false }),
    useSubmitAssignment: () => ({ mutate: vi.fn(), isPending: false }),
    useArchiveAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  };
});
vi.mock("@/hooks/useCommercialPaymentPlansAdmin", () => ({
  useAllCommercialPaymentPlans: () => ({
    data: [{ id: "plan-test", code: "TESTE-B2B-PACK-20261106", name: "Condição fictícia de teste" }],
  }),
}));
vi.mock("@/hooks/useCommercialPriceRules", () => ({
  usePriceRuleLookups: () => ({
    data: { partners: [{ id: "partner-test", nome_fantasia: "Parceiro fictício B2B", razao_social: "Fixture" }] },
  }),
}));

import { AtribuicoesPlanosTab } from "@/components/comercial/AtribuicoesPlanosTab";

const assignment: PlanAssignment = {
  id: "assignment-test",
  plan_id: "plan-test",
  buyer_scope: "partner",
  partner_id: "partner-test",
  customer_id: null,
  status: "pending_approval",
  valid_from: "2026-11-06",
  valid_until: "2026-11-08",
  motivo: null,
  published_at: null,
  created_at: "2026-11-06T00:00:00Z",
};

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = (children: ReactNode) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = render(tree(<AtribuicoesPlanosTab />));
  return {
    client,
    invalidate: vi.spyOn(client, "invalidateQueries"),
    update: () => view.rerender(tree(<AtribuicoesPlanosTab />)),
  };
}

function openPublish(index = 0) {
  fireEvent.click(screen.getAllByRole("button", { name: "Publicar" })[index]);
  return screen.getByRole("alertdialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  state.tenant = "007bb519-cba0-4704-be2c-cb93ad010048";
  state.roles = ["administrador"];
  state.epoch = 0;
  state.ready = true;
  state.leaseValid = true;
  state.assignments = [{ ...assignment }];
  publishImpl = async () => ({ error: null });
  rpcMock.mockImplementation((name: string) => {
    if (name === "rpc_cc_publish_assignment") return publishImpl();
    throw new Error(`RPC inesperada: ${name}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("confirmação controlada de publicação da atribuição", () => {
  it.each([0, 1])("abre no layout %s sem confirm nativo e mostra condição e destino exatos", (index) => {
    const nativeConfirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderTab();
    const dialog = openPublish(index);
    expect(within(dialog).getByText("TESTE-B2B-PACK-20261106 — Condição fictícia de teste")).toBeInTheDocument();
    expect(within(dialog).getByText("Parceiro fictício B2B")).toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("cancelar fecha sem RPC", async () => {
    renderTab();
    openPublish();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("bloqueia duplo clique, mostra pendência e invalida as leituras após confirmação", async () => {
    let resolve!: (value: { error: null }) => void;
    publishImpl = () => new Promise((r) => { resolve = r; });
    const view = renderTab();
    openPublish();
    const confirm = screen.getByRole("button", { name: "Confirmar publicação" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Publicando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await act(async () => resolve({ error: null }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(toastMock.success).toHaveBeenCalledWith("Atribuição publicada");
    expect(view.invalidate).toHaveBeenCalledWith({ queryKey: ["commercial-conditions"] });
    expect(view.invalidate).toHaveBeenCalledWith({ queryKey: ["commercial-payment-plans", "selectable"] });
  });

  it("espera 190 s, renova normalmente e ainda exige reabertura e novo clique explícito", async () => {
    vi.useFakeTimers();
    const view = renderTab();
    openPublish();
    act(() => {
      vi.advanceTimersByTime(190_000);
      state.leaseValid = false;
      state.ready = false;
    });
    view.update();
    act(() => {
      state.leaseValid = true;
      state.ready = true;
    });
    view.update();
    expect(screen.getByRole("button", { name: "Confirmar publicação" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Feche esta janela e abra a publicação novamente/);
    expect(rpcMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    view.update();
    openPublish();
    expect(rpcMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar publicação" }));
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("revogação e troca de tenant/época durante o diálogo negam o envio", () => {
    const view = renderTab();
    openPublish();
    act(() => {
      state.tenant = "outro-tenant";
      state.roles = ["gestor_comercial"];
      state.epoch += 1;
    });
    view.update();
    expect(screen.getByRole("button", { name: "Confirmar publicação" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/sessão, a empresa, o perfil ou a atribuição mudou/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("troca o destino durante o diálogo e exige nova conferência", () => {
    const view = renderTab();
    openPublish();
    state.assignments = [{ ...assignment, partner_id: "outro-parceiro" }];
    view.update();
    expect(screen.getByRole("button", { name: "Confirmar publicação" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/atribuição mudou/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("erro do servidor permanece visível sem falsa confirmação", async () => {
    publishImpl = async () => ({ error: { message: "not_authorized_publish" } });
    renderTab();
    openPublish();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar publicação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Somente administrador ou financeiro pode publicar.");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("mudança de contexto após a chamada não confirma nem invalida como sucesso", async () => {
    let resolve!: (value: { error: null }) => void;
    publishImpl = () => new Promise((r) => { resolve = r; });
    const view = renderTab();
    openPublish();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar publicação" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    act(() => {
      state.tenant = "outro-tenant";
      state.epoch += 1;
    });
    view.update();
    await act(async () => resolve({ error: null }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/contexto mudou durante a publicação/i);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(view.invalidate).not.toHaveBeenCalled();
  });
});
