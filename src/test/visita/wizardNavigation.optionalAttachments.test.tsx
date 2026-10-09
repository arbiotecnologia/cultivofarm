import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ missing: "", rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useParams: () => ({ id: "visit-fake" }), useSearchParams: () => [new URLSearchParams()] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "actor-fake" } }) }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOnlineStatus: () => true }));
vi.mock("@/hooks/useUnsavedChanges", () => ({ useUnsavedChanges: vi.fn() }));
vi.mock("@/hooks/useObjetivosVisita", () => ({ useObjetivosVisita: () => ({ data: [] }) }));
vi.mock("@/hooks/useVisitaWorkspace", () => ({
  useVisitaWorkspace: () => ({ data: { status: "rascunho", permissions: { can_edit: true, is_editable_status: true } }, isLoading: false }),
  EMPTY_VISITA_PERMISSIONS: {}, visitaWorkspaceKey: (id: string) => ["visita-workspace", id],
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    const data = key === "mobile-wizard-registro" ? { id: "visit-fake", cultura_id: "crop-fake", status: "rascunho" }
      : key.startsWith("wizard-") && key.endsWith("-flag") ? (key === mocks.missing || key === "wizard-anexos-flag" ? null : { id: "persisted-fake" }) : [];
    return { data, isLoading: false };
  },
}));
vi.mock("@/pages/app/wizard/WizardCheckinStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardCampoStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardDiagnosticoStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardRecomendacaoStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardAnexosStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardRevisaoStep", () => ({ default: () => <div>Revisão montada</div> }));
vi.mock("@/components/visita/AcompanhamentoVisita", () => ({ AcompanhamentoVisita: () => <div>Acompanhamento montado</div> }));
import MobileVisitaWizard from "@/pages/app/MobileVisitaWizard";
beforeEach(() => { mocks.missing = ""; vi.clearAllMocks(); });
afterEach(cleanup);
it("navega às etapas 7 e 8 com recomendação persistida e zero anexos sem mutação", () => {
  render(<MobileVisitaWizard />);
  fireEvent.click(screen.getByRole("button", { name: "7 Revisão" }));
  expect(screen.getByText("Revisão montada")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "8 Acompanhamento" }));
  expect(screen.getByText("Acompanhamento montado")).toBeTruthy();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  ["wizard-campo-flag", "4 Diagnóstico"],
  ["wizard-diag-flag", "5 Recomendação"],
  ["wizard-rec-flag", "7 Revisão"],
])("%s ausente mantém %s bloqueado", (missing, label) => {
  mocks.missing = missing;
  render(<MobileVisitaWizard />);
  expect(screen.getByRole("button", { name: label })).toBeDisabled();
  expect(screen.getByRole("button", { name: "8 Acompanhamento" })).toBeDisabled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});