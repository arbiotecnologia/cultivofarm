import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => ({ abortSignal: () => rpc(...a) }) } }));
let auth: { roles: string[]; authzReady?: boolean } = { roles: ["parceiro_b2b_financeiro"] };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ ...auth, role: auth.roles[0] ?? null, user: { id: "u1" }, loading: false, profile: { nome: "F" } }) }));
vi.mock("@/hooks/useScopedPortalQuery", () => ({ useScopedPortalQuery: (o: any) => ({ ...useQuery({ ...o, retry: false, refetchInterval: false, queryFn: ({ signal }) => o.queryFn(signal) }), ready: true }) }));
vi.mock("@/components/portal/PortalTopBar", () => ({ PortalTopBar: (p: { brandTitle: string }) => <header>{p.brandTitle}</header> }));
const csv = vi.fn();
vi.mock("@/lib/biExport", () => ({ exportToCSV: (...a: unknown[]) => csv(...a), buildExportFilename: (p: string) => `${p}.csv` }));

import PortalFinanceiroB2B from "@/pages/portal-financeiro-b2b/PortalFinanceiroB2B";
import {
  B2B_FINANCE_ROLE_INSTALLED, isExclusiveFinanceRoles, isOverdue, obligationExportRows, parseFinanceCapability, parseFinanceCredit, summarizeObligations, titleOpen,
} from "@/lib/comercial/b2bFinanceRole";
import { externalUserPayload, registrationRoles, validateUserDraft } from "@/lib/configuracoes/externalUserDraft";
import { canAccess, getHomeForRole } from "@/lib/permissions";
import { tipoAcessoDoUsuario } from "@/lib/configuracoes/userLinks";

const P1 = "20000000-0000-4000-8000-000000000001";
const cap = { contract: "B2B_FINANCE_ROLE_V1", allowed: true, partner_id: P1, partner_name: "Parceiro Um", obligations_read: true, export: true, credit_read: false, credit_reason: "canonical_calculator_blocked", writes: false };
const inst = (n: number, venc: string, valor: number, recebido: number, status = "OPEN") => ({ id: `30000000-0000-4000-8000-00000000000${n}`, numero: n, vencimento: venc, valor, recebido, status });
const title = (n: number, installments: ReturnType<typeof inst>[], status = "OPEN") => ({ id: `40000000-0000-4000-8000-00000000000${n}`, order_id: `50000000-0000-4000-8000-00000000000${n}`, numero: `PED-${n}`, created_at: "2026-11-01T10:00:00+00:00", total: installments.reduce((s, i) => s + i.valor, 0), status, installments });
const obligations = (rows: unknown[]) => ({ contract: "C2_OWN_OBLIGATIONS_V1", partner_id: P1, rows, limit: 50, documents_enabled: false });
const reply = (fn: string, data: unknown) => (name: string) => Promise.resolve(name === fn ? { data, error: null } : { data: null, error: { message: "x" } });
const wrap = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/portal-financeiro-b2b"]}><Routes>
  <Route path="/portal-financeiro-b2b" element={<PortalFinanceiroB2B />} /><Route path="/sem-permissao" element={<p>Sem permissão</p>} /></Routes></MemoryRouter></QueryClientProvider>);
beforeEach(() => { rpc.mockReset(); csv.mockReset(); auth = { roles: ["parceiro_b2b_financeiro"] }; });

describe("Financeiro B2B — regras de papel e rotas", () => {
  it("papel é exclusivo: qualquer combinação nega", () => {
    expect(isExclusiveFinanceRoles(["parceiro_b2b_financeiro"])).toBe(true);
    for (const r of ["parceiro_b2b", "parceiro_b2b_tecnico", "cliente_produtor", "financeiro", "administrador"])
      expect(isExclusiveFinanceRoles(["parceiro_b2b_financeiro", r])).toBe(false);
    expect(isExclusiveFinanceRoles(["parceiro_b2b"])).toBe(false);
  });
  it("home e rotas: só o portal financeiro próprio, nada do gestor, técnico ou financeiro interno", () => {
    expect(getHomeForRole("parceiro_b2b_financeiro")).toBe("/portal-financeiro-b2b");
    expect(canAccess("parceiro_b2b_financeiro", "/portal-financeiro-b2b")).toBe(true);
    for (const p of ["/portal-parceiro/financeiro", "/portal-parceiro/pedidos", "/portal-parceiro/catalogo", "/portal-parceiro/novo", "/portal-parceiro/simulador",
      "/portal-parceiro/meus-produtores", "/portal-parceiro/fichas", "/financeiro", "/financeiro/b2b", "/configuracoes", "/comercial/parceiros"])
      expect(canAccess("parceiro_b2b_financeiro", p)).toBe(false);
    for (const r of ["parceiro_b2b", "parceiro_b2b_tecnico", "financeiro", "administrador"]) expect(canAccess(r, "/portal-financeiro-b2b")).toBe(false);
    expect(tipoAcessoDoUsuario(["parceiro_b2b_financeiro"])).toBe("b2b_financeiro");
    expect(tipoAcessoDoUsuario(["parceiro_b2b_financeiro", "parceiro_b2b"])).toBe("misto");
  });
  it("capacidade estrita: escrita nunca, campos extras ou contrato errado rejeitados", () => {
    expect(parseFinanceCapability(cap)).toMatchObject({ allowed: true, partner_id: P1 });
    expect(parseFinanceCapability({ contract: "B2B_FINANCE_ROLE_V1", allowed: false, reason: "not_entitled" })).toMatchObject({ allowed: false });
    expect(() => parseFinanceCapability({ ...cap, writes: true })).toThrow();
    expect(() => parseFinanceCapability({ ...cap, saldo_fornecedor: 1 })).toThrow();
    expect(() => parseFinanceCapability({ ...cap, contract: "C2_CAT_V1" })).toThrow();
  });
  it("resumo usa centavos, vencido só após o dia e ignora quitadas", () => {
    const rows = [title(1, [inst(1, "2026-11-10", 100.1, 0.05), inst(2, "2026-11-17", 50, 0), inst(3, "2026-12-01", 20, 20, "PAID")])];
    expect(isOverdue(rows[0].installments[1], "2026-11-17")).toBe(false);
    expect(isOverdue(rows[0].installments[1], "2026-11-18")).toBe(true);
    expect(summarizeObligations(rows, "2026-11-17")).toEqual({ open: 150.05, overdue: 100.05, overdueCount: 1, nextDue: "2026-11-17", openTitles: 1 });
  });
  it("exportação contém só campos financeiros, sem identificadores internos", () => {
    const out = obligationExportRows([title(1, [inst(1, "2026-11-10", 10, 4)])]);
    expect(out).toEqual([{ pedido: "PED-1", titulo_status: "Em aberto", parcela: "1", vencimento: "2026-11-10", valor: "10.00", pago: "4.00", saldo: "6.00", parcela_status: "Em aberto" }]);
    expect(JSON.stringify(out)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});

const credit = { contract: "B2B_FINANCE_CREDIT_V1", partner_id: P1, credit_limit: 10000, exposicao_atual: 1000, credito_disponivel: 9000,
  percentual_utilizado: 10, saldo_em_aberto: 1000, saldo_vencido: 0, comprometido_nao_faturado: 0, comprometido_pendente: 0, tem_vencidos: false, reason_code: "OK" };
describe("Financeiro B2B — status e crédito", () => {
  it("título cancelado/quitado/desconhecido não soma saldo mesmo com parcela OPEN", () => {
    const rows = [title(1, [inst(1, "2026-11-01", 100, 0)], "CANCELED"), title(2, [inst(1, "2026-11-01", 70, 0)], "canceled"),
      title(3, [inst(1, "2026-11-01", 30, 0, "CANCELED")]), title(4, [inst(1, "2026-11-01", 9, 0)], "ESTRANHO"), title(5, [inst(1, "2026-11-30", 5, 0, "partial")])];
    expect(summarizeObligations(rows, "2026-11-17")).toEqual({ open: 5, overdue: 0, overdueCount: 0, nextDue: "2026-11-30", openTitles: 1 });
    expect(rows.filter(titleOpen).map((r) => r.numero)).toEqual(["PED-5"]);
    expect(obligationExportRows([rows[0]])[0]).toMatchObject({ saldo: "0.00", titulo_status: "Cancelado" });
  });
  it("crédito estrito: outro parceiro, campos de política e contrato errado rejeitados", () => {
    expect(parseFinanceCredit(credit, P1).credito_disponivel).toBe(9000);
    expect(() => parseFinanceCredit(credit, "20000000-0000-4000-8000-000000000002")).toThrow();
    expect(() => parseFinanceCredit({ ...credit, credit_limit_action: "block" }, P1)).toThrow();
    expect(() => parseFinanceCredit({ ...credit, contract: "X" }, P1)).toThrow();
    expect(() => parseFinanceCredit({ ...credit, credito_disponivel: -1 }, P1)).toThrow();
  });
  it("crédito exibido só com capacidade positiva; erro mostra indisponível, nunca zero", async () => {
    let fail = false;
    rpc.mockImplementation((name: string) => Promise.resolve(name === "b2b_finance_capability_v1" ? { data: { ...cap, credit_read: true, credit_reason: undefined }, error: null }
      : name === "b2b_finance_credit_v1" ? (fail ? { data: null, error: { message: "x" } } : { data: credit, error: null }) : { data: obligations([]), error: null }));
    const { unmount } = wrap();
    const box = await screen.findByLabelText("Crédito do parceiro");
    expect(box.textContent).toMatch(/10\.000,00/); expect(box.textContent).toMatch(/9\.000,00/);
    expect(rpc).toHaveBeenCalledWith("b2b_finance_credit_v1");
    unmount(); fail = true; wrap();
    expect((await screen.findByText("Não foi possível carregar o crédito."))).toBeTruthy();
    expect(screen.queryByLabelText("Crédito do parceiro")).toBeNull();
  });
  it("capacidade sem crédito não consulta o leitor de crédito", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve(name === "b2b_finance_capability_v1" ? { data: cap, error: null } : { data: obligations([]), error: null }));
    wrap(); await screen.findByText(/Informações de crédito indisponíveis/);
    expect(rpc).not.toHaveBeenCalledWith("b2b_finance_credit_v1");
  });
});

describe("Financeiro B2B — cadastro canônico", () => {
  const base = { nome: "Fin", email: "Fin@X.io", password: "", roles: ["parceiro_b2b_financeiro"], partner_id: P1, cliente_ids: [] as string[] };
  it("gate OFF (parâmetro explícito): perfil não oferecido nem aceito", () => {
    expect(registrationRoles(false)).not.toContain("parceiro_b2b_financeiro");
    expect(validateUserDraft(base as any, "b2b", false).roles).toBeTruthy();
  });
  // Estado de ativação separado: liberação final (backend de produção instalado, POST_PASS).
  it("ativação: flag do código ON após liberação", () => {
    expect(B2B_FINANCE_ROLE_INSTALLED).toBe(true);
  });
  it("gate ON: exige parceiro, é exclusivo e grava papel financeiro", () => {
    expect(registrationRoles(true)).toContain("parceiro_b2b_financeiro");
    expect(validateUserDraft(base as any, "b2b", true)).toEqual({});
    expect(validateUserDraft({ ...base, partner_id: "" } as any, "b2b", true).partner_id).toBeTruthy();
    expect(validateUserDraft({ ...base, roles: ["parceiro_b2b_financeiro", "parceiro_b2b_tecnico"] } as any, "b2b", true).roles).toMatch(/não pode ser combinado/);
    expect(validateUserDraft({ ...base, roles: ["parceiro_b2b_financeiro", "parceiro_b2b"] } as any, "b2b", true).roles).toMatch(/não pode ser combinado/);
    const p = externalUserPayload(base as any, "b2b", "60000000-0000-4000-8000-000000000001", true);
    expect(p).toMatchObject({ roles: ["parceiro_b2b_financeiro"], partner_id: P1, partner_papel: "financeiro", email: "fin@x.io", cliente_ids: [] });
    expect(validateUserDraft(base as any, "internal", true).roles).toBeTruthy();
  });
  it("regressão: técnico e gestor mantêm papel do vínculo", () => {
    expect(externalUserPayload({ ...base, roles: ["parceiro_b2b_tecnico"] } as any, "b2b", "60000000-0000-4000-8000-000000000002").partner_papel).toBe("tecnico");
    expect(externalUserPayload({ ...base, roles: ["parceiro_b2b"] } as any, "b2b", "60000000-0000-4000-8000-000000000003").partner_papel).toBe("gestor");
  });
});

describe("Financeiro B2B — portal e guarda", () => {
  it("capacidade positiva: títulos próprios, parcelas, exportação e crédito marcado indisponível", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve(name === "b2b_finance_capability_v1" ? { data: cap, error: null }
      : { data: obligations([title(1, [inst(1, "2026-11-10", 100, 0)]), title(2, [inst(1, "2026-10-01", 50, 50, "PAID")], "PAID")]), error: null }));
    wrap();
    await screen.findByText("Financeiro do parceiro");
    await screen.findByText(/Informações de crédito indisponíveis/);
    expect(rpc).toHaveBeenCalledWith("rpc_portal_partner_financial", { p_partner_id: P1, p_own_finance_v1: true, p_before: null, p_before_id: null });
    expect(rpc.mock.calls.map((c) => c[0]).sort()).toEqual(["b2b_finance_capability_v1", "rpc_portal_partner_financial"]);
    fireEvent.click(screen.getByRole("button", { name: /Exportar CSV/ }));
    expect(csv).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /baixar|quitar|novo pedido|limite|renegoci/i })).toBeNull();
  });
  it("parceiro da leitura vem só da capacidade do servidor", async () => {
    rpc.mockImplementation(reply("b2b_finance_capability_v1", cap));
    wrap(); await screen.findByRole("alert");
    expect(rpc.mock.calls.find((c) => c[0] === "rpc_portal_partner_financial")?.[1]).toMatchObject({ p_partner_id: P1 });
  });
  it("negação do servidor redireciona sem montar dados", async () => {
    rpc.mockImplementation(reply("b2b_finance_capability_v1", { contract: "B2B_FINANCE_ROLE_V1", allowed: false, reason: "not_finance_actor" }));
    wrap(); await screen.findByText("Sem permissão");
    expect(rpc).not.toHaveBeenCalledWith("rpc_portal_partner_financial", expect.anything());
  });
  it("erro ou resposta inválida da capacidade fica indisponível", async () => {
    rpc.mockImplementation(reply("b2b_finance_capability_v1", { ...cap, writes: true }));
    wrap(); expect((await screen.findByRole("alert")).textContent).toMatch(/indisponível/);
  });
  it("gestor, técnico e combinados nunca consultam o portal financeiro", async () => {
    for (const roles of [["parceiro_b2b"], ["parceiro_b2b_tecnico"], ["parceiro_b2b_financeiro", "parceiro_b2b_tecnico"], ["financeiro"]]) {
      auth = { roles }; const { unmount } = wrap(); await screen.findByText("Sem permissão"); unmount();
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("revogação percebida na reconsulta retira o acesso", async () => {
    let allowed = true;
    rpc.mockImplementation((name: string) => Promise.resolve(name === "b2b_finance_capability_v1"
      ? { data: allowed ? cap : { contract: "B2B_FINANCE_ROLE_V1", allowed: false, reason: "not_finance_actor" }, error: null }
      : { data: obligations([]), error: null }));
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/portal-financeiro-b2b"]}><Routes>
      <Route path="/portal-financeiro-b2b" element={<PortalFinanceiroB2B />} /><Route path="/sem-permissao" element={<p>Sem permissão</p>} /></Routes></MemoryRouter></QueryClientProvider>);
    await screen.findByText("Financeiro do parceiro");
    allowed = false; await client.invalidateQueries({ queryKey: ["b2b-finance-capability"] });
    await waitFor(() => expect(screen.getByText("Sem permissão")).toBeTruthy());
  });
});
