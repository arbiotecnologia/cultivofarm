import { describe, it, expect } from "vitest";
import { descreverStatusLog } from "@/lib/visita/statusLogTimeline";

const label = (s?: string | null) =>
  s === "finalizado" ? "Finalizado" : s === "rascunho" ? "Rascunho" : s ?? "—";

describe("H9-G 2B — timeline de status da visita", () => {
  it("rotula finalizado→finalizado como edição justificada e mostra motivo e autor", () => {
    const r = descreverStatusLog(
      {
        status_anterior: "finalizado",
        status_novo: "finalizado",
        motivo: "Teste H9-G de persistência de nota rápida após recarga",
        autorNome: "Renato",
      },
      label,
    );
    expect(r.isEdicaoJustificada).toBe(true);
    expect(r.title).toBe("Edição justificada (Finalizado)");
    expect(r.detail).toContain("Teste H9-G de persistência");
    expect(r.detail).toContain("por Renato");
  });

  it("edição justificada sem motivo não quebra e não inventa texto", () => {
    const r = descreverStatusLog(
      { status_anterior: "finalizado", status_novo: "finalizado", motivo: null },
      label,
    );
    expect(r.isEdicaoJustificada).toBe(true);
    expect(r.detail).toBeUndefined();
  });

  it("transição real preserva o formato de status e agrega o motivo", () => {
    const r = descreverStatusLog(
      { status_anterior: "rascunho", status_novo: "finalizado", motivo: "Encerrada em campo" },
      label,
    );
    expect(r.isEdicaoJustificada).toBe(false);
    expect(r.title).toBe("Status: Rascunho → Finalizado");
    expect(r.detail).toBe("Motivo: Encerrada em campo");
  });

  it("não expõe identificadores técnicos quando o autor é desconhecido", () => {
    const r = descreverStatusLog(
      { status_anterior: null, status_novo: "finalizado", motivo: "x", autorNome: null },
      label,
    );
    expect(r.title).toBe("Status: — → Finalizado");
    expect(r.detail).toBe("Motivo: x");
  });
});
