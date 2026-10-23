import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
// Real candidate page, real registration fields/validation/payload and lifecycle.
// Only Auth/transport and unrelated tabs are doubles; no hosted identity is used.
const s = vi.hoisted(() => ({ org: "00000000-0000-4000-8000-000000000010", ready: true, farms: true,
  rows: [] as Record<string, unknown>[], partnerLink: true, version: "a".repeat(32), roles: ["parceiro_b2b"],
  conflict: false, denied: false, invoke: vi.fn(), rpc: vi.fn(), from: vi.fn(), toast: vi.fn() }));
const partner = "00000000-0000-4000-8000-000000000001", client = "00000000-0000-4000-8000-000000000002", target = "00000000-0000-4000-8000-000000000003";
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "admin-synthetic" }, profile: { nome: "Admin", organization_id: s.org }, role: "administrador", roles: ["administrador"] }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => { const scope = s.org; return { scope, ready: s.ready, capture: () => () => s.ready && s.org === scope }; } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: s.rpc, from: s.from, functions: { invoke: s.invoke } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: s.toast }) }));
vi.mock("@/hooks/useOrgOnboarding", () => ({ useOnboardingState: () => ({ data: { nome: "Empresa sintética" }, isLoading: false }) }));
vi.mock("@/components/configuracoes/AparenciaTab", () => ({ default: () => null }));
vi.mock("@/pages/financeiro/ConfiguracoesFinanceiras", () => ({ default: () => null }));
vi.mock("@/pages/configuracoes/SlaB2BTab", () => ({ SlaB2BTab: () => null }));
vi.mock("@/pages/configuracoes/MeuPlanoTab", () => ({ MeuPlanoTab: () => null }));
vi.mock("@/pages/configuracoes/TenantEmailSettings", () => ({ default: () => null }));
import Configuracoes from "@/pages/Configuracoes";
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const element = () => <QueryClientProvider client={qc}><MemoryRouter initialEntries={["/configuracoes?tab=usuarios"]}><Configuracoes /></MemoryRouter></QueryClientProvider>;
  const view = render(element()); return { view, element, qc };
}
beforeEach(() => {
  s.org = "00000000-0000-4000-8000-000000000010"; s.ready = true; s.farms = true; s.rows = []; s.partnerLink = true;
  s.version = "a".repeat(32); s.roles = ["parceiro_b2b"]; s.conflict = false; s.denied = false;
  s.toast.mockReset(); s.invoke.mockReset().mockResolvedValue({ data: { success: true, user_id: target }, error: null });
  s.rpc.mockReset().mockImplementation((name, args) => {
    const response = async () => {
      if (name === "tenant_admin_list_users") return { data: { items: s.rows, total: s.rows.length }, error: null };
      if (name === "tenant_admin_user_links") return { data: { items: s.rows.map(row => ({ user_id: row.user_id, expected_version: "a".repeat(64), clientes: [], parceiro: s.partnerLink ? { partner_id: partner, razao_social: "Parceiro sintético", papel: "gestor", ativo: true } : null, parceiros_total: s.partnerLink ? 1 : 0, fora_do_alcance: 0 })) }, error: null };
      if (name === "get_partner_user_lifecycle") return { data: { version: s.version, state: { roles: s.roles, link: s.partnerLink ? { revoked_at: null } : null }, history: [], next_cursor: null }, error: null };
      if (name === "link_partner_user") {
        if (s.conflict) return { data: null, error: { code: "40001" } };
        if (s.denied) return { data: null, error: { code: "42501" } };
        s.roles = args.p_roles; s.version = "b".repeat(32);
        return { data: { ok: true, user_id: target, partner_id: partner, action: args.p_action, version: s.version, reader_activation: false }, error: null };
      }
      return { data: null, error: null };
    };
    return { then: (a: unknown, b: unknown) => response().then(a as never, b as never), abortSignal: response };
  });
  s.from.mockReset().mockImplementation(table => {
    const result = () => ({ data: table === "partner_accounts" ? [{ id: partner, razao_social: "Parceiro sintético" }] : table === "clientes" ? [{ id: client, nome: "Cliente sintético" }] : table === "fazendas" && s.farms ? [{ id: target, cliente_id: client, nome: "Fazenda sintética" }] : [], error: null, count: 1 });
    const chain: Record<string, unknown> = { abortSignal: async () => result() };
    for (const method of ["select", "filter", "eq", "is", "ilike", "order", "range", "in"]) chain[method] = vi.fn(() => chain);
    return chain;
  });
});
afterEach(cleanup);
async function openCreate(kind = "Parceiro B2B") {
  fireEvent.click(await screen.findByRole("button", { name: "Novo Usuário" }));
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(kind) }));
  fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Pessoa sintética" } });
  fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "synthetic@example.invalid" } });
  if (kind === "Parceiro B2B") fireEvent.click(await screen.findByRole("checkbox", { name: "Parceiro sintético" }));
}
async function selectProducer() {
  fireEvent.click(screen.getByRole("checkbox", { name: "Cliente/Produtor" }));
  fireEvent.click(await screen.findByRole("checkbox", { name: "Cliente sintético" }));
  await screen.findByText("Fazenda sintética");
  await act(async () => {});
}
it("novo cadastro envia três perfis externos, parceiro e cliente principal sem papel interno/senha/tenant", async () => {
  mount(); await openCreate(); fireEvent.click(screen.getByRole("checkbox", { name: "Técnico B2B" })); await selectProducer();
  fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" }));
  await waitFor(() => expect(s.invoke).toHaveBeenCalledTimes(1));
  const body = s.invoke.mock.calls[0][1].body;
  expect(body).toMatchObject({ roles: ["cliente_produtor", "parceiro_b2b", "parceiro_b2b_tecnico"], external_roles: ["cliente_produtor", "parceiro_b2b", "parceiro_b2b_tecnico"], partner_id: partner, partner_papel: "gestor", cliente_ids: [client], principal_cliente_id: client });
  for (const key of ["role", "password", "tenant_id", "organization_id", "verified_client_ids"]) expect(body).not.toHaveProperty(key);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("novo técnico exclusivo usa o mesmo cadastro e papel técnico", async () => {
  mount(); await openCreate(); fireEvent.click(screen.getByRole("checkbox", { name: "Gestor B2B" })); fireEvent.click(screen.getByRole("checkbox", { name: "Técnico B2B" }));
  // Deselecting the last partner role clears its link; select it again explicitly.
  fireEvent.click(await screen.findByRole("checkbox", { name: "Parceiro sintético" }));
  fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" }));
  await waitFor(() => expect(s.invoke).toHaveBeenCalledTimes(1));
  expect(s.invoke.mock.calls[0][1].body).toMatchObject({ roles: ["parceiro_b2b_tecnico"], partner_papel: "tecnico" });
});
it("produtor exclusivo preserva criação sem parceiro", async () => {
  mount(); await openCreate("Cliente Produtor"); fireEvent.click(await screen.findByRole("checkbox", { name: "Cliente sintético" }));
  await screen.findByText("Fazenda sintética"); await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" }));
  await waitFor(() => expect(s.invoke).toHaveBeenCalledTimes(1));
  expect(s.invoke.mock.calls[0][1].body).toMatchObject({ roles: ["cliente_produtor"], external_roles: ["cliente_produtor"], partner_id: null, partner_papel: null, cliente_ids: [client] });
});
it("cliente sem fazenda ativa bloqueia o envio mantendo rascunho", async () => {
  s.farms = false; mount(); await openCreate("Cliente Produtor"); fireEvent.click(await screen.findByRole("checkbox", { name: "Cliente sintético" }));
  await screen.findByText("Cada cliente selecionado precisa de fazenda ativa na sua empresa.");
  fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" }));
  expect(s.invoke).not.toHaveBeenCalled(); expect(screen.getByLabelText("Nome *")).toHaveValue("Pessoa sintética");
});
it("sem parceiro e sem perfil não cria usuário", async () => {
  mount(); await openCreate(); fireEvent.click(screen.getByRole("checkbox", { name: "Parceiro sintético" }));
  fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" })); expect(s.invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: "Gestor B2B" }));
  fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" })); expect(s.invoke).not.toHaveBeenCalled();
});
it("erro preserva recibo e lock; retry é idêntico e não aceita payload alterado", async () => {
  let resolve: (v: unknown) => void = () => {}; s.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  mount(); await openCreate(); const submit = screen.getByRole("button", { name: "Criar Usuário" });
  fireEvent.click(submit); fireEvent.click(submit); await waitFor(() => expect(s.invoke).toHaveBeenCalledTimes(1));
  await act(async () => resolve({ data: { error: "b2b_provisioning_auth_pending" }, error: null }));
  fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" })); await waitFor(() => expect(s.invoke).toHaveBeenCalledTimes(2));
  expect(s.invoke.mock.calls[1][1].body).toEqual(s.invoke.mock.calls[0][1].body);
});
it("solicitação incerta não muda de payload com o mesmo recibo", async () => {
  s.invoke.mockResolvedValue({ data: { error: "b2b_provisioning_auth_pending" }, error: null });
  mount(); await openCreate(); fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Criar Usuário" })).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Outra pessoa" } });
  fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" }));
  await screen.findByText("Preserve os dados da solicitação pendente para verificar o mesmo cadastro."); expect(s.invoke).toHaveBeenCalledTimes(1);
});
it("troca tenant durante criação fecha dados antigos e não adota sucesso tardio", async () => {
  let resolve: (v: unknown) => void = () => {}; s.invoke.mockImplementation(() => new Promise(r => { resolve = r; }));
  const { view, element } = mount(); await openCreate(); fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" }));
  await waitFor(() => expect(s.invoke).toHaveBeenCalledTimes(1)); s.org = "tenant-B"; view.rerender(element());
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await act(async () => resolve({ data: { success: true, user_id: target }, error: null }));
  expect(s.toast.mock.calls.some(c => c[0].title === "Usuário criado com sucesso")).toBe(false);
});
async function openEdit() {
  s.rows = [{ user_id: target, nome: "Alvo sintético", email: "target@example.invalid", roles: s.roles, ativo: true, updated_at: "2026-10-23T00:00:00Z" }];
  const mounted = mount(); fireEvent.click(await screen.findByText("Alvo sintético"));
  await screen.findByRole("button", { name: "Confirmar perfis" }); return mounted;
}
it("edição cumulativa e revogação usam um único botão com conjunto final e CAS", async () => {
  await openEdit(); const area = within(screen.getByRole("region", { name: "Acessos do parceiro" }));
  fireEvent.click(area.getByRole("checkbox", { name: "Consultor técnico B2B" })); fireEvent.change(area.getByRole("textbox", { name: "Motivo" }), { target: { value: "Revisão sintética" } });
  fireEvent.click(area.getByRole("button", { name: "Confirmar perfis" })); await screen.findByText("Alteração confirmada.");
  expect(s.rpc.mock.calls.filter(c => c[0] === "link_partner_user").at(-1)?.[1]).toMatchObject({ p_action: "assign", p_roles: ["parceiro_b2b", "parceiro_b2b_tecnico"], p_expected: "a".repeat(32) });
  await waitFor(() => expect(area.getByRole("button", { name: "Confirmar perfis" })).toBeEnabled());
  fireEvent.click(area.getByRole("checkbox", { name: "Gestor B2B" })); fireEvent.click(area.getByRole("button", { name: "Confirmar perfis" }));
  await waitFor(() => expect(s.rpc.mock.calls.filter(c => c[0] === "link_partner_user")).toHaveLength(2));
  expect(s.rpc.mock.calls.filter(c => c[0] === "link_partner_user").at(-1)?.[1]).toMatchObject({ p_action: "revoke_roles", p_roles: ["parceiro_b2b_tecnico"], p_expected: "b".repeat(32) });
});
it("edição com CAS conflitante exige releitura antes de usar nova versão", async () => {
  s.conflict = true; await openEdit(); fireEvent.change(within(screen.getByRole("region", { name: "Acessos do parceiro" })).getByRole("textbox", { name: "Motivo" }), { target: { value: "Revisão sintética" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar perfis" })); await screen.findByRole("button", { name: "Atualizar dados" });
  expect(screen.getByRole("button", { name: "Confirmar perfis" })).toBeDisabled(); s.version = "c".repeat(32); s.conflict = false;
  fireEvent.click(screen.getByRole("button", { name: "Atualizar dados" })); await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar perfis" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Confirmar perfis" })); await screen.findByText("Alteração confirmada.");
  expect(s.rpc.mock.calls.filter(c => c[0] === "link_partner_user").at(-1)?.[1].p_expected).toBe("c".repeat(32));
});
it("produtor existente sem parceiro pode escolher parceiro no mesmo editor antes de atribuir B2B", async () => {
  s.roles = ["cliente_produtor"]; s.partnerLink = false;
  s.rows = [{ user_id: target, nome: "Alvo sintético", email: "target@example.invalid", roles: s.roles, ativo: true, updated_at: "2026-10-23T00:00:00Z" }];
  mount(); fireEvent.click(await screen.findByText("Alvo sintético")); fireEvent.click(await screen.findByRole("checkbox", { name: "Parceiro sintético" }));
  await screen.findByRole("button", { name: "Confirmar perfis" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Gestor B2B" })); fireEvent.change(screen.getAllByRole("textbox", { name: "Motivo" })[0], { target: { value: "Revisão sintética" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar perfis" })); await screen.findByText("Alteração confirmada.");
  expect(s.rpc.mock.calls.filter(c => c[0] === "link_partner_user").at(-1)?.[1]).toMatchObject({ p_partner_id: partner, p_action: "assign", p_roles: ["cliente_produtor", "parceiro_b2b"] });
});
it("erro de edição preserva seleção e não anuncia confirmação", async () => {
  s.denied = true; await openEdit(); fireEvent.click(screen.getByRole("checkbox", { name: "Consultor técnico B2B" }));
  fireEvent.change(within(screen.getByRole("region", { name: "Acessos do parceiro" })).getByRole("textbox", { name: "Motivo" }), { target: { value: "Revisão sintética" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar perfis" })); await screen.findByText("Não foi possível confirmar. Preserve a tentativa para verificar novamente.");
  expect(screen.getByRole("checkbox", { name: "Consultor técnico B2B" })).toBeChecked(); expect(screen.queryByText("Alteração confirmada.")).not.toBeInTheDocument();
});