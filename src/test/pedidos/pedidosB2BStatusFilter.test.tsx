import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { clearAllPauseStates, pauseStateKey, writePauseState } from "@/lib/authz/pauseRetainedState";

let auth: any;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
import { PEDIDOS_B2B_DEFAULT_STATUS, usePedidosB2BStatusFilter } from "@/hooks/usePedidosB2BStatusFilter";

const OPTS = ["all", "aguardando_aprovacao_credito", "aprovado"];
const DEF = PEDIDOS_B2B_DEFAULT_STATUS;
const actor = (uid: string, org: string, epoch = 0, authzReady = true) => ({
  user: { id: uid }, profile: { user_id: uid, organization_id: org, ativo: true },
  roles: ["comercial"], authzEpoch: epoch, authzReady, loading: false,
});
let observedSearch = "";
let navigate: NavigateFunction;
const LocationProbe = () => { observedSearch = useLocation().search; navigate = useNavigate(); return null; };
const use = (initial = "/comercial/pedidos-b2b") => renderHook(
  () => usePedidosB2BStatusFilter(OPTS, DEF),
  { wrapper: ({ children }) => <MemoryRouter initialEntries={[initial]}><LocationProbe />{children}</MemoryRouter> },
);

describe("filtro de status /comercial/pedidos-b2b", () => {
  beforeEach(() => { clearAllPauseStates(); auth = actor("uA", "orgA"); observedSearch = ""; });

  it("o padrão de produção é Todos", () => {
    expect(PEDIDOS_B2B_DEFAULT_STATUS).toBe("all");
  });

  it("desmontar/remontar do mesmo ator preserva a seleção durante a pausa", () => {
    const h = use();
    act(() => h.result.current[1]("aguardando_aprovacao_credito"));
    h.unmount();
    expect(use().result.current[0]).toBe("aguardando_aprovacao_credito");
  });

  it("reload real descarta a memória, volta a Todos e não persiste status na URL", () => {
    const h = use("/comercial/pedidos-b2b?aba=carteira");
    act(() => h.result.current[1]("aguardando_aprovacao_credito"));
    expect(observedSearch).toBe("?aba=carteira");
    h.unmount();
    clearAllPauseStates(); // um reload perde todo o Map volátil
    const after = use(`/comercial/pedidos-b2b${observedSearch}`);
    expect(after.result.current[0]).toBe("all");
    expect(observedSearch).toBe("?aba=carteira");
  });

  it("query válida é intenção única, vale na entrada e não persiste status na URL", () => {
    writePauseState(`${pauseStateKey({ userId: "uA", organizationId: "orgA", roles: ["comercial"], epoch: 0 })}:pedidos-b2b:status`, "aguardando_aprovacao_credito");
    const h = use("/comercial/pedidos-b2b?status=aprovado&aba=carteira");
    expect(h.result.current[0]).toBe("aprovado");
    expect(observedSearch).toBe("?aba=carteira");
    h.unmount();
    expect(use(`/comercial/pedidos-b2b${observedSearch}`).result.current[0]).toBe("aprovado");
  });

  it("query recebida com a página já montada aplica crédito e limpa somente status", () => {
    const h = use("/comercial/pedidos-b2b?aba=carteira");
    expect(h.result.current[0]).toBe("all");
    act(() => navigate("/comercial/pedidos-b2b?aba=carteira&status=aguardando_aprovacao_credito"));
    expect(h.result.current[0]).toBe("aguardando_aprovacao_credito");
    expect(observedSearch).toBe("?aba=carteira");
  });

  it("query inválida cai em Todos, é removida e não recupera escolha anterior", () => {
    writePauseState(`${pauseStateKey({ userId: "uA", organizationId: "orgA", roles: ["comercial"], epoch: 0 })}:pedidos-b2b:status`, "aguardando_aprovacao_credito");
    const h = use("/comercial/pedidos-b2b?status=hack&aba=carteira");
    expect(h.result.current[0]).toBe("all");
    expect(observedSearch).toBe("?aba=carteira");
    h.unmount();
    expect(use(`/comercial/pedidos-b2b${observedSearch}`).result.current[0]).toBe("all");
  });

  it("reload após consumir query válida perde a intenção e volta a Todos", () => {
    const h = use("/comercial/pedidos-b2b?status=aguardando_aprovacao_credito&aba=carteira");
    expect(h.result.current[0]).toBe("aguardando_aprovacao_credito");
    expect(observedSearch).toBe("?aba=carteira");
    h.unmount();
    clearAllPauseStates();
    const after = use(`/comercial/pedidos-b2b${observedSearch}`);
    expect(after.result.current[0]).toBe("all");
    expect(observedSearch).toBe("?aba=carteira");
  });

  it("ready -> revalidando (nova época) -> ready não reseta", () => {
    const h = use();
    act(() => h.result.current[1]("aguardando_aprovacao_credito"));
    h.unmount();
    auth = actor("uA", "orgA", 1, false); // pausa: boundary oculta/desmonta
    auth = actor("uA", "orgA", 2, true);
    expect(use().result.current[0]).toBe("aguardando_aprovacao_credito");
  });

  it("valor inválido retido cai no padrão Todos", () => {
    writePauseState(`${pauseStateKey({ userId: "uA", organizationId: "orgA", roles: ["comercial"], epoch: 0 })}:pedidos-b2b:status`, "hack");
    expect(use().result.current[0]).toBe("all");
    const h = use();
    act(() => h.result.current[1]("xyz"));
    expect(h.result.current[0]).toBe("all");
  });

  it("troca A -> B não herda (montado e remontado)", () => {
    const h = use();
    act(() => h.result.current[1]("aguardando_aprovacao_credito"));
    auth = actor("uB", "orgB");
    h.rerender();
    expect(h.result.current[0]).toBe("all");
    h.unmount();
    expect(use().result.current[0]).toBe("all");
  });

  it("logout (clearAllPauseStates via useAuth) descarta e volta a Todos", () => {
    const h = use();
    act(() => h.result.current[1]("aguardando_aprovacao_credito"));
    h.unmount();
    clearAllPauseStates();
    expect(use().result.current[0]).toBe("all");
  });

  it("sem identidade ativa não lê nem grava", () => {
    auth = { ...actor("uA", "orgA"), profile: { user_id: "uA", organization_id: "orgA", ativo: false } };
    const h = use();
    act(() => h.result.current[1]("aguardando_aprovacao_credito"));
    h.unmount();
    auth = actor("uA", "orgA");
    expect(use().result.current[0]).toBe("all");
  });
});
