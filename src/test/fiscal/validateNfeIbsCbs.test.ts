import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateNfeXml, validateNfeDocument } from "../../../supabase/functions/_shared/fiscal/nfe/validateNfeXml";

const DIR = "scripts/rtc-ibs-cbs-nfse-homolog-20261113/evidence/preview";
const load = (f: string) => readFileSync(`${DIR}/${f}`, "utf-8");
const codes = (xml: string) => validateNfeXml(xml).issues.map((i) => `${i.code}@${i.path}`);

describe("validador interno — IBSCBS e IBSCBSTot (PL_010g)", () => {
  for (const f of ["preview-interna.xml", "preview-interestadual.xml", "preview-qa-travessao.xml"]) {
    it(`positivo: ${f} sem erros no infNFe`, () => { expect(codes(load(f))).toEqual([]); });
  }
  const base = load("preview-interna.xml");
  it("filho indevido dentro de IBSCBS é rejeitado", () => {
    expect(codes(base.replace("<cClassTrib>", "<xLixo>1</xLixo><cClassTrib>"))).toContain("XSD_UNEXPECTED_ELEMENT@/NFe/infNFe/det/imposto/IBSCBS/xLixo");
  });
  it("filho indevido em IBSCBSTot é rejeitado", () => {
    expect(codes(base.replace("<vBCIBSCBS>", "<xLixo>1</xLixo><vBCIBSCBS>")).some((c) => c.startsWith("XSD_UNEXPECTED_ELEMENT@/NFe/infNFe/total/IBSCBSTot/xLixo"))).toBe(true);
  });
  it("ordem errada (IBSCBS antes de PIS) é rejeitada", () => {
    const m = base.match(/<IBSCBS>.*?<\/IBSCBS>/)![0];
    const moved = base.replace(m, "").replace("<PIS>", m + "<PIS>");
    expect(codes(moved).some((c) => c.startsWith("XSD_ORDER"))).toBe(true);
  });
  it("IBSCBSTot antes de ICMSTot é rejeitado", () => {
    const m = base.match(/<IBSCBSTot>.*?<\/IBSCBSTot>/)![0];
    expect(codes(base.replace(m, "").replace("<ICMSTot>", m + "<ICMSTot>")).some((c) => c.startsWith("XSD_ORDER"))).toBe(true);
  });
  it("decimal fora do padrão RTC e CST curto são rejeitados", () => {
    expect(codes(base.replace(/<vIBS>[^<]*<\/vIBS>/, "<vIBS>0.1</vIBS>"))).toContain("XSD_TYPE_R2@/NFe/infNFe/det/imposto/IBSCBS/gIBSCBS/vIBS");
    expect(codes(base.replace("<CST>000</CST>", "<CST>00</CST>")).some((c) => c.includes("IBSCBS/CST"))).toBe(true);
  });
  it("grupo obrigatório ausente (gCBS) é rejeitado", () => {
    expect(codes(base.replace(/<gCBS><pCBS>.*?<\/gCBS>/, ""))).toContain("XSD_MIN_OCCURS@/NFe/infNFe/det/imposto/IBSCBS/gIBSCBS/gCBS");
  });
  it("grupo oficial não coberto não passa em silêncio", () => {
    expect(codes(base.replace("</gIBSCBS>", "</gIBSCBS><gIBSCBSMono><x>1</x></gIBSCBSMono>"))).toEqual(expect.arrayContaining([expect.stringMatching(/^XSD_GROUP_NOT_COVERED/), expect.stringMatching(/^XSD_CHOICE/)]));
  });
  it("documento completo sem Signature é inválido", () => {
    const d = validateNfeDocument(base);
    expect(d.valid).toBe(false); expect(d.issues.map((i) => i.code)).toEqual(["XSD_SIGNATURE_MISSING"]);
  });
});
