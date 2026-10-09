/**
 * H9-G Bloco 2F — ações de persistência da visita.
 *
 * Reproduções cobertas:
 *  - tecnico_agronomo/consultor com read no cliente, sem participação, em visita
 *    finalizada: nenhuma ação de salvar/finalizar ativa;
 *  - gestor/admin fora do modo edição: nada de salvar; após edição justificada,
 *    a ação canônica volta;
 *  - rascunho e visita nova preservam salvar/finalizar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveVisitaAcoes } from "@/lib/visita/acoesPersistencia";

describe("resolveVisitaAcoes", () => {
  // Corrigido na auditoria da visita: antes de existir registro salvo não há
  // check-in, evidências nem status — Finalizar não pode ser oferecido.
  it("visita nova permite salvar, mas não finalizar", () => {
    const a = resolveVisitaAcoes({ isNew: true, status: null, uiMode: "editing" });
    expect(a).toEqual({ readOnly: false, canPersist: true, showSave: true, showFinalize: false });
  });

  it("rascunho preserva salvar e finalizar", () => {
    const a = resolveVisitaAcoes({ isNew: false, status: "rascunho", uiMode: "editing", canEdit: true });
    expect(a.showSave).toBe(true);
    expect(a.showFinalize).toBe(true);
  });

  it("leitor sem permissão em visita finalizada não recebe ação de salvar", () => {
    const a = resolveVisitaAcoes({ isNew: false, status: "finalizado", uiMode: "locked", canEdit: false });
    expect(a.readOnly).toBe(true);
    expect(a.showSave).toBe(false);
    expect(a.showFinalize).toBe(false);
  });

  it("gestor/admin fora do modo edição não recebe ação de salvar", () => {
    const a = resolveVisitaAcoes({ isNew: false, status: "finalizado", uiMode: "locked", canEdit: true });
    expect(a.showSave).toBe(false);
    expect(a.showFinalize).toBe(false);
  });

  it("edição local justificada não desbloqueia finalizado nem para admin", () => {
    const a = resolveVisitaAcoes({ isNew: false, status: "finalizado", uiMode: "editing", canEdit: true });
    expect(a.canPersist).toBe(false);
    expect(a.showSave).toBe(false);
    // finalizar não reaparece: a visita já está finalizada
    expect(a.showFinalize).toBe(false);
  });

  it("status pós-aprovação ficam travados mesmo em modo edição", () => {
    for (const status of ["finalizado", "enviado_aprovacao", "aprovado", "reprovado", "convertido_os", "arquivado"]) {
      const a = resolveVisitaAcoes({ isNew: false, status, uiMode: "editing", canEdit: true });
      expect(a.canPersist).toBe(false);
      expect(a.showSave).toBe(false);
    }
  });
  it("nega rascunho ao leitor e estado desconhecido, permite em_andamento autorizado", () => {
    expect(resolveVisitaAcoes({ isNew: false, status: "rascunho", uiMode: "editing", canEdit: false }).canPersist).toBe(false);
    expect(resolveVisitaAcoes({ isNew: false, uiMode: "editing", canEdit: true }).canPersist).toBe(false);
    expect(resolveVisitaAcoes({ isNew: false, status: "em_andamento", uiMode: "editing", canEdit: true }).canPersist).toBe(true);
  });
});

describe("H9-G 2F — UI da visita usa a fonte canônica", () => {
  const src = readFileSync(resolve(process.cwd(), "src/pages/VisitaTecnica.tsx"), "utf8");

  it("importa e resolve as ações canônicas", () => {
    expect(src).toContain('from "@/lib/visita/acoesPersistencia"');
    expect(src).toContain("const acoesVisita = resolveVisitaAcoes(");
  });

  it("todas as ações de salvar são condicionadas por acoesVisita.showSave", () => {
    const saves = src.match(/onClick=\{handleSaveDraft\}/g) || [];
    expect(saves.length).toBeGreaterThanOrEqual(3);
    const guardas = src.match(/acoesVisita\.showSave/g) || [];
    expect(guardas.length).toBeGreaterThanOrEqual(3);
  });

  it("finalizar na barra inferior é condicionado por showFinalize", () => {
    expect(src).toContain("acoesVisita.showFinalize");
  });
});
