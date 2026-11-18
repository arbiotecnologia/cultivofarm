import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  error: false, success: true, evidenceError: false, revision: "2026-11-18T04:00:00Z",
  evidenceRevision: "2026-11-18T04:00:00Z", absent: false,
  refetch: vi.fn(), evidenceRefetch: vi.fn(), save: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ profile: { organization_id: "org1" }, roles: ["gestor"] }) }));
vi.mock("@/hooks/useTenantCatalogEditor", () => ({ useTenantCatalogEditor: () => ({ scope: "scope1", canEdit: true, ready: true, capture: () => () => true }) }));
vi.mock("@/hooks/useProductProfile", () => ({
  useProductProfile: () => ({ isSuccess: state.success, isError: state.error, data: { profile: state.absent ? null : { id: "profile1", updated_at: state.revision, resumo_curto: "Texto observado", status_validacao: "rascunho" }, composicao: [] }, refetch: state.refetch }),
  useProductDocumentaryEvidence: () => ({ isSuccess: !state.evidenceError, isError: state.evidenceError, data: [], profileId: state.absent ? null : "profile1", profileRevision: state.absent ? null : state.evidenceRevision, refetch: state.evidenceRefetch }),
  useUpsertProductProfile: () => ({ isPending: false, mutateAsync: state.save }),
}));
vi.mock("@/hooks/useProductResearchDossier", () => ({ useProductResearchDossier: () => ({ data: null }) }));
vi.mock("@/components/protocolos/catalog/ProfileFieldAI", () => ({ ProfileFieldAI: ({ label, value, onChange }: any) => <textarea aria-label={label} value={value} onChange={e => onChange(e.target.value)} /> }));
vi.mock("@/components/protocolos/ProductFormulaBenefits", () => ({ ProductFormulaBenefits: () => null }));
vi.mock("@/components/protocolos/ProductFichaRelations", () => ({ ProductFichaRelations: () => null }));
vi.mock("@/components/protocolos/catalog/DocumentaryAI", () => ({ DocumentaryAI: () => null }));
vi.mock("@/components/protocolos/catalog/VersoesHistoricoTab", () => ({ VersoesHistoricoTab: () => null }));
vi.mock("@/components/fiscal/ProductDossierManagement", () => ({ ProductDossierManagement: () => null }));
import { ProductTechnicalProfileDialog } from "@/components/protocolos/ProductTechnicalProfileDialog";
const tree = (id = "p1", descricao = "Descrição atual") => <ProductTechnicalProfileDialog embedded open produto={{ id, nome: "Produto", tipo: "solo", codigo: null, descricao, owner_organization_id: "org1" }} onOpenChange={() => {}} />;
beforeEach(() => {
  vi.clearAllMocks(); state.error = false; state.success = true; state.evidenceError = false; state.absent = false;
  state.revision = "2026-11-18T04:00:00Z"; state.evidenceRevision = state.revision;
});
afterEach(cleanup);
it("erro de perfil bloqueia escrita e retry relê perfil e evidências", () => {
  state.error = true; state.success = false;
  render(tree());
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("button", { name: "Salvar conteúdo" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(state.refetch).toHaveBeenCalledOnce(); expect(state.evidenceRefetch).toHaveBeenCalledOnce(); expect(state.save).not.toHaveBeenCalled();
});
it("erro de evidências não hidrata como ausência e não permite salvar", () => {
  state.evidenceError = true; render(tree());
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("button", { name: "Salvar conteúdo" })).toBeDisabled();
  expect(state.save).not.toHaveBeenCalled();
});
it("versões concorrentes exigem releitura, recuperam antes de hidratar e não rebaseiam rascunho sujo", async () => {
  state.evidenceRevision = "2026-11-18T03:00:00Z";
  const view = render(tree());
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  state.evidenceRevision = state.revision; view.rerender(tree());
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Resumo curto" })).toHaveValue("Texto observado"));
  fireEvent.change(screen.getByRole("textbox", { name: "Resumo curto" }), { target: { value: "Rascunho local" } });
  state.revision = "2026-11-18T05:00:00Z"; state.evidenceRevision = state.revision; view.rerender(tree());
  expect(screen.getByRole("textbox", { name: "Resumo curto" })).toHaveValue("Rascunho local");
  expect(state.save).not.toHaveBeenCalled();
});
it("troca de produto com ausência confirmada não herda rascunho anterior", () => {
  const view = render(tree());
  fireEvent.change(screen.getByRole("textbox", { name: "Resumo curto" }), { target: { value: "Anterior" } });
  state.absent = true; view.rerender(tree("p2", "Descrição nova"));
  expect(screen.getByRole("textbox", { name: "Resumo curto" })).toHaveValue("Descrição nova");
  expect(screen.getByRole("button", { name: "Salvar conteúdo" })).toBeEnabled();
  expect(state.save).not.toHaveBeenCalled();
});