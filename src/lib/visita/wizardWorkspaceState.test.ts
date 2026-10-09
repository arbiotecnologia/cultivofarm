import { describe, it, expect } from "vitest";
import { deriveVisitaWizardState } from "./wizardWorkspaceState";

const ws = (can_edit: boolean, is_editable_status: boolean, status = "rascunho") => ({
  status,
  permissions: { can_edit, is_editable_status },
});

describe("deriveVisitaWizardState", () => {
  it.each(["reprovado", "finalizado", "aprovado", "enviado_aprovacao"])("%s não permite edição mesmo com permissão stale", (status) => {
    expect(deriveVisitaWizardState({ isNew: false, loading: false, workspace: ws(true, true, status) }).locked).toBe(true);
  });
  it("nova visita é editável e sem banner", () => {
    const r = deriveVisitaWizardState({ isNew: true, loading: false });
    expect(r.state).toBe("novo");
    expect(r.locked).toBe(false);
    expect(r.message).toBeNull();
  });

  it("carregando não afirma concluída", () => {
    const r = deriveVisitaWizardState({ isNew: false, loading: true });
    expect(r.state).toBe("carregando");
    expect(r.locked).toBe(true);
    expect(r.message).toBe("Carregando atendimento…");
    expect(r.message).not.toMatch(/concluída/i);
  });

  it("erro de servidor mostra mensagem de erro com retry", () => {
    const r = deriveVisitaWizardState({
      isNew: false,
      loading: false,
      error: { code: "42703", message: 'column os.data_prevista does not exist' },
    });
    expect(r.state).toBe("erro");
    expect(r.message).toBe("Não foi possível carregar o atendimento");
    expect(r.canRetry).toBe(true);
    expect(r.message).not.toMatch(/concluída/i);
  });

  it("permissão negada é distinta de concluída", () => {
    const r = deriveVisitaWizardState({
      isNew: false,
      loading: false,
      error: { code: "42501", message: "forbidden_visita" },
    });
    expect(r.state).toBe("permissao_negada");
    expect(r.canRetry).toBe(false);
    expect(r.message).not.toMatch(/concluída/i);
  });

  it("workspace ausente sem erro NÃO vira concluída", () => {
    const r = deriveVisitaWizardState({ isNew: false, loading: false, workspace: null });
    expect(r.state).toBe("erro");
    expect(r.message).not.toMatch(/concluída/i);
  });

  it("rascunho com can_edit é editável", () => {
    const r = deriveVisitaWizardState({
      isNew: false,
      loading: false,
      workspace: ws(true, true, "rascunho"),
    });
    expect(r.state).toBe("editavel");
    expect(r.locked).toBe(false);
    expect(r.message).toBeNull();
  });

  it("visita concluída é somente leitura", () => {
    const r = deriveVisitaWizardState({
      isNew: false,
      loading: false,
      workspace: ws(false, false, "concluido"),
    });
    expect(r.state).toBe("somente_leitura");
    expect(r.locked).toBe(true);
    expect(r.message).toBe("Visita concluída. Modo somente leitura.");
  });

  it("status editável sem permissão de edição não é 'concluída'", () => {
    const r = deriveVisitaWizardState({
      isNew: false,
      loading: false,
      workspace: ws(false, true, "rascunho"),
    });
    expect(r.state).toBe("permissao_negada");
    expect(r.message).not.toMatch(/concluída/i);
  });
});
