import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn(); const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { USER_ADMIN_REFINEMENT_INSTALLED, validateTransition, validatePeriod, isValidCivilDate, friendlyError, parseClientesPage, parseConsultorLinks, emailSchema } from "@/lib/configuracoes/userAdminRefinement";
import { UserAdminRefinementPanel } from "@/components/configuracoes/UserAdminRefinementPanel";

const A = "11111111-1111-4111-8111-111111111111", T = "22222222-2222-4222-8222-222222222222", C = "33333333-3333-4333-8333-333333333333";
const base = { actorId: A, targetId: T, from: "internal", to: "producer" as const, internalRoles: [], clienteId: C, reason: "mudança aprovada" };
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

describe("gate", () => { it("UI fechada até instalação revisada", () => expect(USER_ADMIN_REFINEMENT_INSTALLED).toBe(false)); });

describe("validateTransition", () => {
  it("bloqueia autoalteração", () => expect(validateTransition({ ...base, targetId: A })).toMatch(/próprio/));
  it("exige tipo diferente", () => expect(validateTransition({ ...base, to: "internal" as never, from: "internal" })).toMatch(/diferente/));
  it("interno exige perfil", () => expect(validateTransition({ ...base, from: "producer", to: "internal" as never })).toMatch(/perfil interno/));
  it("superadmin nunca", () => expect(validateTransition({ ...base, from: "producer", to: "internal" as never, internalRoles: ["superadmin"] })).toMatch(/não atribuível/));
  it("produtor exige cliente", () => expect(validateTransition({ ...base, clienteId: null })).toMatch(/cliente/));
  it("motivo mínimo", () => expect(validateTransition({ ...base, reason: "ok" })).toMatch(/motivo/i));
  it("válida", () => expect(validateTransition(base)).toBeNull());
});

describe("período e e-mail", () => {
  it("data civil inválida", () => { expect(isValidCivilDate("2026-02-30")).toBe(false); expect(validatePeriod("2026-02-30", null)).toBe("Data inválida."); });
  it("fim antes do início", () => expect(validatePeriod("2026-12-10", "2026-12-01")).toMatch(/posterior/));
  it("fim passado sem início", () => expect(validatePeriod(null, "2020-01-01", new Date("2026-11-17"))).toMatch(/futuro/));
  it("e-mail normalizado", () => expect(emailSchema.parse("  Novo@Ex.Test ")).toBe("novo@ex.test"));
  it("e-mail inválido", () => expect(emailSchema.safeParse("x@").success).toBe(false));
  it("erro desconhecido é neutro", () => expect(friendlyError("boom")).toMatch(/Nada foi alterado/));
  it("contrato de paginação rejeita limite > 50", () => expect(() => parseClientesPage({ total: 1, offset: 0, limit: 51, items: [] })).toThrow());
  it("contrato de vínculos rejeita status inventado", () => expect(() => parseConsultorLinks({ items: [{ cliente_id: C, nome: "x", access_level: "read", valid_from: null, valid_until: null, revoked_at: null, status: "ativo" }], history: [] })).toThrow());
});

describe("painel", () => {
  beforeEach(() => { rpc.mockReset(); invoke.mockReset(); });
  it("próprio usuário não vê ações de tipo nem e-mail", () => {
    wrap(<UserAdminRefinementPanel target={{ user_id: A, email: "a@ex.test", roles: ["administrador"] }} actorId={A} currentType="internal" onChanged={() => {}} />);
    expect(screen.getByText(/não pode alterar o próprio/)).toBeTruthy();
    expect(screen.queryByLabelText("Alterar e-mail")).toBeNull();
  });
  it("e-mail pendente mantém o atual e oferece cancelar", async () => {
    rpc.mockImplementation(async (n: string) => n === "tenant_admin_email_change_status_v1" ? { data: { status: "pending", new_email: "novo@ex.test" }, error: null } : { data: null, error: null });
    wrap(<UserAdminRefinementPanel target={{ user_id: T, email: "old@ex.test", roles: ["financeiro"] }} actorId={A} currentType="internal" onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Pendente: novo@ex.test/)).toBeTruthy());
    expect(screen.getByText(/Atual: old@ex.test/)).toBeTruthy();
    expect(screen.getByText(/O e-mail atual continua válido/)).toBeTruthy();
  });
  it("após aceite do titular o admin não vê Cancelar e é avisado do link oficial", async () => {
    rpc.mockImplementation(async (n: string) => n === "tenant_admin_email_change_status_v1" ? { data: { status: "accepted_awaiting_auth", new_email: "novo@ex.test", cancellable: false }, error: null } : { data: null, error: null });
    wrap(<UserAdminRefinementPanel target={{ user_id: T, email: "old@ex.test", roles: ["financeiro"] }} actorId={A} currentType="internal" onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Pendente: novo@ex.test/)).toBeTruthy());
    expect(screen.getByText(/não pode ser cancelada/)).toBeTruthy();
    expect(screen.queryByText("Cancelar solicitação")).toBeNull();
  });
  it("admin só registra o pedido (sem Edge/links) e não afirma troca", async () => {
    rpc.mockResolvedValue({ data: { status: "none" }, error: null });
    rpc.mockImplementation(async (n: string) => n === "tenant_admin_email_change_request_v1" ? { data: { ok: true, status: "pending" }, error: null } : { data: { status: "none" }, error: null });
    wrap(<UserAdminRefinementPanel target={{ user_id: T, email: "old@ex.test", roles: [] }} actorId={A} currentType="internal" onChanged={() => {}} />);
    fireEvent.change(await screen.findByLabelText("Novo e-mail"), { target: { value: "novo@ex.test" } });
    fireEvent.click(screen.getByText("Solicitar alteração"));
    await waitFor(() => expect(screen.getByText(/O titular verá o pedido/)).toBeTruthy());
    expect(invoke).not.toHaveBeenCalled();
    expect(rpc.mock.calls.find((c) => c[0] === "tenant_admin_email_change_request_v1")![1]).toMatchObject({ p_user_id: T, p_new_email: "novo@ex.test" });
  });
  it("consultor: lista vínculos, erro de servidor e encerramento", async () => {
    rpc.mockImplementation(async (n: string) => {
      if (n === "tenant_admin_consultor_links_v1") return { data: { items: [{ cliente_id: C, nome: "Fazenda Um", access_level: "read", valid_from: null, valid_until: null, revoked_at: null, status: "vigente" }], history: [] }, error: null };
      if (n === "tenant_admin_search_clientes_v1") return { data: null, error: { message: "forbidden" } };
      if (n === "tenant_admin_consultor_link_v1") return { data: null, error: { message: "link_not_active" } };
      return { data: { status: "none" }, error: null };
    });
    wrap(<UserAdminRefinementPanel target={{ user_id: T, email: "c@ex.test", roles: ["consultor_tecnico"] }} actorId={A} currentType="internal" onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Fazenda Um/)).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText(/Operação não permitida/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("Encerrar"));
    await waitFor(() => expect(screen.getByText(/já foi encerrado/)).toBeTruthy());
    const call = rpc.mock.calls.find((c) => c[0] === "tenant_admin_consultor_link_v1")!;
    expect(call[1]).toMatchObject({ p_action: "end", p_cliente_id: C, p_user_id: T });
  });
  it("produtor não recebe seção de consultor", () => {
    rpc.mockResolvedValue({ data: { status: "none" }, error: null });
    wrap(<UserAdminRefinementPanel target={{ user_id: T, email: null, roles: ["cliente_produtor"] }} actorId={A} currentType="producer" onChanged={() => {}} />);
    expect(screen.queryByLabelText("Clientes do consultor")).toBeNull();
  });
});

describe("fase 2b/3b — papéis combinados e titular", () => {
  it("incompatíveis exigem confirmação explícita", async () => {
    const { incompatibleRoles } = await import("@/lib/configuracoes/userAdminRefinement");
    expect(incompatibleRoles(["parceiro_b2b", "parceiro_b2b_tecnico"], "b2b")).toEqual([]);
    expect(incompatibleRoles(["financeiro", "gestor"], "producer")).toEqual(["financeiro", "gestor"]);
    expect(validateTransition({ ...base, currentRoles: ["financeiro"], removeRoles: [] })).toMatch(/incompatíveis/);
    expect(validateTransition({ ...base, currentRoles: ["financeiro"], removeRoles: ["financeiro"] })).toBeNull();
  });
  it("interno preserva perfis existentes (sem exigir novo)", () => {
    expect(validateTransition({ ...base, from: "b2b", to: "internal" as never, clienteId: null, currentRoles: ["parceiro_b2b", "gestor"], removeRoles: ["parceiro_b2b"] })).toBeNull();
  });
});
