import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductTechnicalProfileDialog } from "@/components/protocolos/ProductTechnicalProfileDialog";

const mocks = vi.hoisted(() => ({ role: "gestor_comercial", upsert: vi.fn(), rpc: vi.fn(), log: vi.fn(), refetch: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: mocks.role }) }));
vi.mock("@/hooks/useProductProfile", () => ({
  useProductProfile: () => ({ data: { profile: null, composicao: [] }, isLoading: false, isError: false, isSuccess: true, refetch: mocks.refetch }),
  useUpsertProductProfile: () => ({ mutateAsync: mocks.upsert, isPending: false }),
}));
vi.mock("@/hooks/useLogCatalogAccess", () => ({ useLogCatalogAccess: () => mocks.log }));
vi.mock("@/hooks/useEffectiveCatalogSources", () => ({ useEffectiveCatalogSources: () => ({ hasSources: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/components/protocolos/catalog/ProfileFieldAI", () => ({
  ProfileFieldAI: ({ label, value, readOnly, onChange }: { label: string; value: string; readOnly: boolean; onChange: (value: string) => void }) =>
    <textarea aria-label={label} value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />,
}));
vi.mock("@/components/protocolos/ProductFormulaBenefits", () => ({ ProductFormulaBenefits: () => null }));
vi.mock("@/components/protocolos/catalog/TargetsManager", () => ({ TargetsManager: () => null }));
vi.mock("@/components/protocolos/catalog/CropsManager", () => ({ CropsManager: () => null }));
vi.mock("@/components/protocolos/catalog/SourcesManager", () => ({ SourcesManager: () => null }));
vi.mock("@/components/protocolos/catalog/VersoesHistoricoTab", () => ({ VersoesHistoricoTab: () => null }));
vi.mock("@/components/protocolos/catalog/ReturnToReviewButton", () => ({ ReturnToReviewButton: () => null }));
vi.mock("@/components/protocolos/catalog/ApprovalChecklistDialog", () => ({ ApprovalChecklistDialog: () => null }));

const produto = { id: "produto-existente", codigo: "EXISTENTE", nome: "Produto existente", tipo: "inoculante", b2b_enabled: true };
const tree = () => <ProductTechnicalProfileDialog open onOpenChange={() => {}} produto={produto} />;
beforeEach(() => { mocks.role = "gestor_comercial"; vi.clearAllMocks(); });
afterEach(cleanup);
describe("contenção da edição B2B da ficha global", () => {
  it("gestor comercial consulta o texto B2B sem escrita ou oferta de salvar", () => {
    render(tree());
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^B2B$/ }), { button: 0, ctrlKey: false });
    expect(screen.getByRole("textbox", { name: "Linguagem para parceiro B2B" })).toHaveProperty("readOnly", true);
    expect(screen.queryByRole("button", { name: /Salvar|Enviar para revisão|Arquivar|Aprovar ficha/ })).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("troca de técnico para gestor comercial remove a edição sem promover alçada", () => {
    mocks.role = "tecnico_agronomo";
    const view = render(tree());
    expect(screen.getByRole("textbox", { name: "Resumo curto" })).toHaveProperty("readOnly", false);
    expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeEnabled();
    mocks.role = "gestor_comercial"; view.rerender(tree());
    expect(screen.getByRole("textbox", { name: "Resumo curto" })).toHaveProperty("readOnly", true);
    expect(screen.queryByRole("button", { name: "Salvar rascunho" })).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("superadmin não recebe nova capacidade de edição full neste diálogo", () => {
    mocks.role = "superadmin"; render(tree());
    expect(screen.getByRole("textbox", { name: "Resumo curto" })).toHaveProperty("readOnly", true);
    expect(screen.queryByRole("button", { name: /Salvar|Aprovar ficha/ })).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});