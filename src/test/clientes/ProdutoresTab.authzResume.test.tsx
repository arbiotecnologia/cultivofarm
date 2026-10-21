// Retomada de navegação após pausa do monitor (unmount pelo AuthzEpochBoundary).
// Transporte simulado; NÃO é homologação real JWT/RLS.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useFormContext } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  user: "UA" as string | null, org: "OA", roles: ["administrador"] as string[], scopeGen: 0,
  rows: [{ id: "C1", nome: "Cliente 1", nome_fantasia: "Cliente 1", status_cliente: "ativo", telefones: [], tags: [] }] as Record<string, unknown>[],
  reads: 0,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: s.roles[0], roles: s.roles, user: s.user ? { id: s.user } : null, profile: { organization_id: s.org } }) }));
vi.mock("@/hooks/useCommercialRegistrationScope", () => ({ useCommercialRegistrationScope: () => {
  const scope = JSON.stringify([s.user, s.org, s.roles, s.scopeGen]);
  return { ready: true, scope, organizationId: s.org, capture: () => () => true };
} }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/clientes/ClienteHistoricoDialog", () => ({ ClienteHistoricoDialog: () => null }));
vi.mock("@/components/clientes/ClienteFormTabs", () => ({ ClienteFormTabs: ({ initialTab, onTabChange }: { initialTab?: string; onTabChange?: (t: string) => void }) => {
  const { register } = useFormContext();
  return <div>
    <span data-testid="tab">{initialTab ?? "geral"}</span>
    <button type="button" onClick={() => onTabChange?.("documentos")}>Aba Documentos</button>
    <input aria-label="Nome fantasia" {...register("nome_fantasia")} />
  </div>;
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const q: Record<string, unknown> = {};
  for (const n of ["select", "filter", "order", "eq", "not", "in", "single"]) q[n] = () => q;
  q.then = (resolve: (v: unknown) => void) => { s.reads += 1; resolve({ data: table === "clientes" ? s.rows : [], error: null }); };
  return q;
} } }));
import ProdutoresTab from "@/pages/clientes/ProdutoresTab";
import { __peekResumeForTests, clearResume, observeResumePrincipal, resumePrincipalKey, takeResume, rememberResume, RESUME_TTL_MS } from "@/lib/navigation/protectedResumeContext";

const mount = () => render(<MemoryRouter><ProdutoresTab /></MemoryRouter>);
async function openDocs() {
  const v = mount();
  await waitFor(() => expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  fireEvent.click(screen.getByRole("button", { name: "Aba Documentos" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nome fantasia" }), { target: { value: "RASCUNHO_SENSIVEL" } });
  return v;
}
beforeEach(() => { clearResume(); s.user = "UA"; s.org = "OA"; s.roles = ["administrador"]; s.reads = 0;
  s.rows = [{ id: "C1", nome: "Cliente 1", nome_fantasia: "Cliente 1", status_cliente: "ativo", telefones: [], tags: [] }]; });

describe("pausa -> recuperação em /clientes", () => {
  it("mesmo ator/empresa/papéis: refaz leitura e reabre cliente na aba Documentos sem rascunho", async () => {
    const v = await openDocs();
    const slot = __peekResumeForTests();
    expect(slot && Object.keys(slot).sort()).toEqual(["at", "principal", "recordId", "route", "tab"]);
    expect(JSON.stringify(slot)).not.toContain("RASCUNHO");
    v.unmount(); // boundary: authzReady=false remove todo o conteúdo
    expect(screen.queryByRole("dialog")).toBeNull();
    const before = s.reads;
    mount();
    await waitFor(() => expect(screen.getByTestId("tab")).toHaveTextContent("documentos"));
    expect(screen.getByRole("textbox", { name: "Nome fantasia" })).toHaveValue("Cliente 1");
    expect(s.reads - before).toBe(2); // mesmas 2 leituras de qualquer montagem: sem carga extra
  });
  it("consumo único: segunda remontagem não reabre", async () => {
    (await openDocs()).unmount();
    const v2 = mount(); await waitFor(() => screen.getByTestId("tab"));
    v2.unmount(); clearResume();
    mount(); await waitFor(() => expect(s.reads).toBeGreaterThan(4));
    expect(screen.queryByTestId("tab")).toBeNull();
  });
  it("revogação de papel durante a pausa não reapresenta", async () => {
    (await openDocs()).unmount();
    s.roles = ["gestor"]; observeResumePrincipal(resumePrincipalKey("UA", "OA", s.roles));
    mount(); await waitFor(() => expect(s.reads).toBeGreaterThan(2));
    expect(screen.queryByTestId("tab")).toBeNull();
    expect(__peekResumeForTests()).toBeNull();
  });
  it("cliente excluído/sem acesso na releitura não reabre", async () => {
    (await openDocs()).unmount();
    s.rows = [];
    mount(); await waitFor(() => expect(s.reads).toBeGreaterThan(2));
    expect(screen.queryByTestId("tab")).toBeNull();
    expect(__peekResumeForTests()).toBeNull();
  });
  it("A -> B -> A descarta o contexto", async () => {
    (await openDocs()).unmount();
    observeResumePrincipal(resumePrincipalKey("UB", "OB", ["administrador"]));
    observeResumePrincipal(resumePrincipalKey("UA", "OA", ["administrador"]));
    mount(); await waitFor(() => expect(s.reads).toBeGreaterThan(2));
    expect(screen.queryByTestId("tab")).toBeNull();
  });
  it("fechar explicitamente descarta", async () => {
    await openDocs();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(__peekResumeForTests()).toBeNull();
  });
});

describe("protectedResumeContext", () => {
  const P = resumePrincipalKey("U", "O", ["b", "a"]);
  it("principal exige usuário, empresa e papéis; papéis ordenados", () => {
    expect(resumePrincipalKey(null, "O", ["a"])).toBeNull();
    expect(resumePrincipalKey("U", null, ["a"])).toBeNull();
    expect(resumePrincipalKey("U", "O", [])).toBeNull();
    expect(P).toBe(resumePrincipalKey("U", "O", ["a", "b"]));
  });
  it("TTL vencido e rota diferente descartam", () => {
    rememberResume(P, "/r", "C", "documentos", 0);
    expect(takeResume(P, "/r", RESUME_TTL_MS + 1)).toBeNull();
    rememberResume(P, "/r", "C", "documentos", 0);
    expect(takeResume(P, "/x", 1)).toBeNull();
    expect(__peekResumeForTests()).toBeNull();
  });
  it("aba fora da allowlist não é guardada; logout (principal nulo) limpa", () => {
    rememberResume(P, "/r", "C", "<script>", 0); expect(__peekResumeForTests()).toBeNull();
    rememberResume(P, "/r", "C", "documentos", 0); observeResumePrincipal(null);
    expect(__peekResumeForTests()).toBeNull();
    act(() => undefined);
  });
});
