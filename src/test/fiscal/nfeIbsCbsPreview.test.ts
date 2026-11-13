import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildNfeIbsCbsPreview, type NfePreviewItem } from "@/lib/fiscal/nfeIbsCbsPreview";

// Classificação fictícia no formato do perfil RTC (alíquotas FICTÍCIAS).
const CFG = { schema_version: 1, cst_ibs_cbs: "000", c_class_trib: "000001", effective_from: "2026-01-01", aliquota_cbs: 0.9, aliquota_ibs_uf: 0.1, aliquota_ibs_municipio: 0,
  additional_fields: { ibs_destino: { SP: { uf: 0.1, mun: 0 } } } };
const item: NfePreviewItem = { name: "PRODUTO FICTICIO", code: "P1", ncm: "31010000", cfopInState: "5102", cfopInterstate: "6102", ibsCbsConfig: CFG };
const OUT = "scripts/rtc-ibs-cbs-nfse-homolog-20261113/evidence/preview";

describe("pré-visualização NF-e IBS/CBS (gerador do backend, sem transmissão)", () => {
  it("interna: idDest 1, CFOP 5xxx, UF MG→MG, grupo IBSCBS e totais", () => {
    const r = buildNfeIbsCbsPreview(item, "interna", { issueDate: "2026-11-13" });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.idDest).toBe("1"); expect(r.destUf).toBe("MG");
    expect(r.xml).toContain("<idDest>1</idDest>"); expect(r.xml).toContain("<CFOP>5102</CFOP>");
    expect(r.xml).toContain("<IBSCBS>"); expect(r.xml).toContain("<IBSCBSTot>"); expect(r.xml).toContain("<tpAmb>2</tpAmb>");
    mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/preview-interna.xml`, r.xml);
  });
  it("interestadual: idDest 2, CFOP 6xxx, UF MG→SP com alíquota da UF de destino", () => {
    const r = buildNfeIbsCbsPreview(item, "interestadual", { destUf: "SP", issueDate: "2026-11-13" });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.xml).toContain("<idDest>2</idDest>"); expect(r.xml).toContain("<CFOP>6102</CFOP>"); expect(r.xml).toContain("<UF>SP</UF>");
    writeFileSync(`${OUT}/preview-interestadual.xml`, r.xml);
  });
  it("os dois cenários diferem e são determinísticos", () => {
    const a = buildNfeIbsCbsPreview(item, "interna", { issueDate: "2026-11-13" }), b = buildNfeIbsCbsPreview(item, "interestadual", { issueDate: "2026-11-13" });
    expect(a.ok && b.ok && a.xml !== b.xml).toBe(true);
    expect(buildNfeIbsCbsPreview(item, "interna", { issueDate: "2026-11-13" })).toEqual(a);
  });
  it("ausências viram pendência, sem presumir", () => {
    const r = buildNfeIbsCbsPreview({ ...item, ibsCbsConfig: {}, cfopInterstate: null }, "interestadual", { issueDate: "2026-11-13" });
    expect(r.ok).toBe(false); if (r.ok !== false) return;
    expect(r.missing).toEqual(expect.arrayContaining(["ibs_cbs", "cfop_interestadual"]));
  });
  it("UF de destino sem alíquota no perfil bloqueia no gerador", () => {
    const r = buildNfeIbsCbsPreview(item, "interestadual", { destUf: "GO", issueDate: "2026-11-13" });
    expect(r.ok).toBe(false);
  });
});
