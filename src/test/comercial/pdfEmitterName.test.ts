import { describe, it, expect, vi } from "vitest";
import { drawArBioHeader, drawArBioFooter, NEUTRAL_EMITTER } from "@/lib/pdf/arBioHeader";

function fakeDoc() {
  const texts: string[] = [];
  const doc = {
    internal: { pageSize: { getWidth: () => 595, getHeight: () => 842 } },
    addImage: vi.fn(), setFont: vi.fn(), setFontSize: vi.fn(), setTextColor: vi.fn(), setDrawColor: vi.fn(), setLineWidth: vi.fn(),
    line: vi.fn(), getNumberOfPages: () => 1, setPage: vi.fn(),
    text: (t: string | string[]) => { texts.push(Array.isArray(t) ? t.join(" ") : t); },
    splitTextToSize: (t: string) => [t],
  };
  return { doc: doc as never, texts };
}

describe("cabeçalho de PDF: empresa emitente dinâmica, marca do sistema preservada", () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  it.each([["AR Bio"], ["FSF Agro"]])("imprime %s como emitente", async (nome) => {
    const { doc, texts } = fakeDoc();
    await drawArBioHeader(doc, { subtitulo: "Pedido Comercial — 1", empresaNome: nome });
    expect(texts[0]).toBe(nome);
    expect(texts.join("|")).not.toMatch(/^Cultivo Farm\|/);
  });
  it.each([[null], [undefined], ["   "]])("sem nome comprovado (%s) usa rótulo neutro, nunca a marca do sistema como empresa", async (v) => {
    const { doc, texts } = fakeDoc();
    await drawArBioHeader(doc, { subtitulo: "Ficha", empresaNome: v });
    expect(texts[0]).toBe(NEUTRAL_EMITTER);
    expect(texts[0]).not.toMatch(/cultivo ?farm/i);
  });
  it("rodapé continua identificando o sistema gerador", () => {
    const { doc, texts } = fakeDoc();
    drawArBioFooter(doc);
    expect(texts.join(" ")).toMatch(/Cultivo Farm/);
  });
});
