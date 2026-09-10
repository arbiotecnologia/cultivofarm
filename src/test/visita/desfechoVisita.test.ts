import { describe, it, expect } from "vitest";
import {
  desfechoGeraArtefatoAprovavel,
  descricaoVisitaFinalizada,
  etapaAtivaFinalizada,
} from "@/lib/visita/desfechoVisita";
import { contarEvidencias } from "@/lib/visita/evidenciasCount";

describe("H9-G 2A · desfecho da visita", () => {
  it("recomendação e OS geram artefato aprovável", () => {
    expect(desfechoGeraArtefatoAprovavel("emitir_recomendacao")).toBe(true);
    expect(desfechoGeraArtefatoAprovavel("gerar_os")).toBe(true);
  });

  it("monitorar e retorno NÃO geram artefato aprovável", () => {
    expect(desfechoGeraArtefatoAprovavel("monitorar_area")).toBe(false);
    expect(desfechoGeraArtefatoAprovavel("programar_nova_visita")).toBe(false);
    expect(desfechoGeraArtefatoAprovavel(null)).toBe(false);
    expect(desfechoGeraArtefatoAprovavel(undefined)).toBe(false);
    expect(desfechoGeraArtefatoAprovavel("desconhecido")).toBe(false);
  });

  it("texto de monitoramento não promete aprovação técnica", () => {
    const txt = descricaoVisitaFinalizada("monitorar_area");
    expect(txt).not.toMatch(/pronta para envio/i);
    expect(txt).toMatch(/monitorar/i);
  });

  it("texto de recomendação/OS mantém envio à aprovação", () => {
    expect(descricaoVisitaFinalizada("emitir_recomendacao")).toMatch(/aprovação técnica/i);
    expect(descricaoVisitaFinalizada("gerar_os")).toMatch(/aprovação técnica/i);
  });

  it("etapa ativa após finalizar depende do desfecho", () => {
    expect(etapaAtivaFinalizada("emitir_recomendacao")).toBe("aprovacao");
    expect(etapaAtivaFinalizada("gerar_os")).toBe("aprovacao");
    expect(etapaAtivaFinalizada("monitorar_area")).toBe("concluida");
    expect(etapaAtivaFinalizada("programar_nova_visita")).toBe("concluida");
  });
});

describe("H9-G 2A · contagem de evidências", () => {
  it("soma arquivos e notas rápidas", () => {
    expect(contarEvidencias([], [])).toBe(0);
    expect(contarEvidencias([], [{ id: "1" }])).toBe(1);
    expect(contarEvidencias([{ id: "a" }, { id: "b" }], [{ id: "1" }])).toBe(3);
  });

  it("tolera valores ausentes", () => {
    expect(contarEvidencias(null, undefined)).toBe(0);
    expect(contarEvidencias(undefined, [{ id: "1" }])).toBe(1);
  });
});
