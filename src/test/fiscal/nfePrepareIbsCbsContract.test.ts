import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildNfeXml, type NfePayload } from "../../../supabase/functions/_shared/fiscal/nfe/buildNfeXml";

const SQL = readFileSync("scripts/rtc-ibs-cbs-nfse-homolog-20261113/migration/03_micro_billing_xml_prepare.sql", "utf8");
const base = JSON.parse(readFileSync("scripts/nfe-f41-certification-20261112/fixtures/synthetic-mg-icms00.json", "utf8")) as NfePayload;
// Alíquotas FICTÍCIAS.
const FAKE = { schema_version: 1, cst_ibs_cbs: "000", c_class_trib: "000001", effective_from: "2026-01-01", aliquota_cbs: 0.9, aliquota_ibs_uf: 0.1, aliquota_ibs_municipio: 0,
  additional_fields: { ibs_destino: { SP: { uf: 0.1, mun: 0 } } } };

// Mesmo formato que rpc_fiscal_xml_prepare_v1 passa a emitir: det[].ibsCbsConfig + ide.rtcIbsCbs.
const prepared = (uf: string, cfg: unknown = FAKE): NfePayload => ({ ...base,
  ide: { ...base.ide, rtcIbsCbs: true, idDest: uf === "MG" ? "1" : "2" },
  dest: { ...base.dest, enderDest: { ...(base.dest as { enderDest: object }).enderDest, UF: uf } },
  det: (base.det ?? []).map((d) => ({ ...d, ...(cfg ? { ibsCbsConfig: cfg } : {}) })) } as NfePayload);

describe("preparo NF-e real → gerador (IBS/CBS por item)", () => {
  it("SQL de preparo usa as mesmas chaves que o gerador consome", () => {
    expect(SQL).toContain("jsonb_build_object(''ibsCbsConfig'', x.cfg)");
    expect(SQL).toContain("jsonb_build_object(''rtcIbsCbs'', true)");
    expect(SQL).toContain("PRE_PIN_MISMATCH:xml_prepare");
  });
  it("faturamento novo de serviço copia ibs_cbs do perfil ativo", () => {
    expect(SQL).toContain("''ibs_cbs'', nullif(r.p_ibs,''{}''::jsonb)");
  });
  it("interna e interestadual geram grupo IBSCBS e totais", () => {
    const i = buildNfeXml(prepared("MG")).xml, e = buildNfeXml(prepared("SP")).xml;
    for (const x of [i, e]) { expect(x).toContain("<IBSCBS>"); expect(x).toContain("<IBSCBSTot>"); expect(x).toContain("<CST>000</CST>"); }
    expect(e).not.toBe(i);
  });
  it("item sem perfil com rtc marcado bloqueia; sem IBS/CBS o XML anterior é preservado", () => {
    expect(() => buildNfeXml(prepared("MG", null))).toThrow();
    expect(buildNfeXml(base).xml).not.toContain("IBSCBS");
  });
  it("idempotente: mesmo payload, mesmo XML", () => {
    expect(buildNfeXml(prepared("SP")).xml).toBe(buildNfeXml(prepared("SP")).xml);
  });
});
