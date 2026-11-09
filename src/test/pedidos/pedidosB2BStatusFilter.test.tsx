import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { clearAllPauseStates, pauseStateKey, writePauseState } from "@/lib/authz/pauseRetainedState";

let auth: any;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
import { usePedidosB2BStatusFilter } from "@/hooks/usePedidosB2BStatusFilter";

const OPTS = ["all", "aguardando_aprovacao_credito", "aprovado"];
const DEF = "aguardando_aprovacao_credito";
const actor = (uid: string, org: string, epoch = 0, authzReady = true) => ({
  user: { id: uid }, profile: { user_id: uid, organization_id: org, ativo: true },
  roles: ["comercial"], authzEpoch: epoch, authzReady, loading: false,
});
let observedSearch = "";
const LocationProbe = () => { observedSearch = useLocation().search; return null; };
const use = (initial = "/comercial/pedidos-b2b") => renderHook(
  () => usePedidosB2BStatusFilter(OPTS, DEF),
  { wrapper: ({ children }) => <MemoryRouter initialEntries={[initial]}><LocationProbe />{children}</MemoryRouter> },
);

describe("filtro de status /comercial/pedidos-b2b", () => {
  beforeEach(() => { clearAllPauseStates(); auth = actor("uA", "orgA"); });

  it("desmontar/remontar do mesmo ator preserva Todos", () => {
    const h = use();
    act(() => h.result.current[1]("all"));
    h.unmount();
    expect(use().result.current[0]).toBe("all");
  });

  it("reload real preserva o filtro na URL, mesmo sem memória volátil", () => {
    const h = use("/comercial/pedidos-b2b?aba=carteira");
    act(() => h.result.current[1]("all"));
    expect(observedSearch).toBe("?aba=carteira&status=all");
    h.unmount();
    clearAllPauseStates(); // um reload perde todo o Map volátil
    expect(use(`/comercial/pedidos-b2b${observedSearch}`).result.current[0]).toBe("all");
  });

  it("status explícito no endereço prevalece sobre a retenção da pausa", () => {
    writePauseState(`${pauseStateKey({ userId: "uA", organizationId: "orgA", roles: ["comercial"], epoch: 0 })}:pedidos-b2b:status`, "all");
    expect(use("/comercial/pedidos-b2b?status=aprovado").result.current[0]).toBe("aprovado");
  });

  it("ready -> revalidando (nova época) -> ready não reseta", () => {
    const h = use();
    act(() => h.result.current[1]("all"));
    h.unmount();
    auth = actor("uA", "orgA", 1, false); // pausa: boundary oculta/desmonta
    auth = actor("uA", "orgA", 2, true);
    expect(use().result.current[0]).toBe("all");
  });

  it("valor inválido retido cai no padrão", () => {
    writePauseState(`${pauseStateKey({ userId: "uA", organizationId: "orgA", roles: ["comercial"], epoch: 0 })}:pedidos-b2b:status`, "hack");
    expect(use().result.current[0]).toBe(DEF);
    const h = use();
    act(() => h.result.current[1]("xyz"));
    expect(h.result.current[0]).toBe(DEF);
  });

  it("troca A -> B não herda (montado e remontado)", () => {
    const h = use();
    act(() => h.result.current[1]("all"));
    auth = actor("uB", "orgB");
    h.rerender();
    expect(h.result.current[0]).toBe(DEF);
    h.unmount();
    expect(use().result.current[0]).toBe(DEF);
  });

  it("logout (clearAllPauseStates via useAuth) descarta", () => {
    const h = use();
    act(() => h.result.current[1]("all"));
    h.unmount();
    clearAllPauseStates();
    expect(use().result.current[0]).toBe(DEF);
  });

  it("sem identidade ativa não lê nem grava", () => {
    auth = { ...actor("uA", "orgA"), profile: { user_id: "uA", organization_id: "orgA", ativo: false } };
    const h = use();
    act(() => h.result.current[1]("all"));
    h.unmount();
    auth = actor("uA", "orgA");
    expect(use().result.current[0]).toBe(DEF);
  });
});
