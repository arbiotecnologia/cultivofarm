/** Regressão DPS NFS-e Nacional 1.01 com dados 100% sintéticos (sem rede). */
import { describe, expect, it } from "vitest";
import { buildDpsXml, validateDps, type DpsInput } from "../../../supabase/functions/_shared/nfse/dps";
import { mapInvoiceToDps } from "../../../supabase/functions/_shared/nfse/dpsFromInvoice";
import { compactNfseDpsProfile, validateNfseDpsProfile } from "../../../supabase/functions/_shared/nfse/dpsProfile";

export const SYNTH: DpsInput = {
  environment: "HOMOLOGATION", issueDateTime: "2026-11-13T10:00:00-03:00", competence: "2026-11-13", series: "1", number: 11,
  emitter: { cnpj: "00000000000191", municipalityIbge: "9999901", municipalRegistration: "QA123", phone: "(00) 0000-0000", email: "prest@example.invalid", regime: { opSimpNac: "1", regEspTrib: "0" } },
  taker: { cnpjCpf: "11.222.333/0001-81", name: "Tomador Sintético", municipalRegistration: "IM99", phone: "000000000", email: "toma@example.invalid" },
  service: { nationalTaxCode: "010101", municipalTaxCode: null, description: "Serviço sintético", locationIbge: "9999902", incidenceMunicipalityIbge: "9999901", nbsCode: "012345678" },
  values: { serviceAmount: 1000, issRate: 2, issWithheld: false,
    pisCofins: { cst: "01", pAliqPis: 0.65, pAliqCofins: 3, retType: "2" },
    federalRetentions: { irrfRate: 1.5 },
    totTrib: { mode: "PERCENT", fed: 10, est: 0, mun: 2 } },
};

describe("DPS 1.01 — grupos e ordem", () => {
  const xml = buildDpsXml(SYNTH);
  it("homologação (pacote 20/10/2026): finNFSe=0 antes de cLocEmi e cNBS antes de xDescServ; cTribNac com zero inicial", () => {
    expect(xml).toContain("<tpEmit>1</tpEmit><finNFSe>0</finNFSe><cLocEmi>");
    expect(xml).toContain("<cTribNac>010101</cTribNac><cNBS>012345678</cNBS><xDescServ>Serviço sintético</xDescServ>");
  });
  it("produção mantém leiaute 1.01 de 09/02/2026 (sem finNFSe, cNBS após xDescServ)", () => {
    const p = buildDpsXml({ ...SYNTH, environment: "PRODUCTION" });
    expect(p).not.toContain("<finNFSe>");
    expect(p).toContain("<xDescServ>Serviço sintético</xDescServ><cNBS>012345678</cNBS>");
  });
  it("cLocPrestacao é o local da prestação, distinto do município de incidência", () => {
    expect(xml).toContain("<cLocPrestacao>9999902</cLocPrestacao>");
    expect(xml).not.toContain("<cLocPrestacao>9999901</cLocPrestacao>");
  });
  it("prest: IM, fone, email antes de regTrib; toma CNPJ, IM, xNome, fone, email", () => {
    expect(xml).toContain("<prest><CNPJ>00000000000191</CNPJ><IM>QA123</IM><fone>0000000000</fone><email>prest@example.invalid</email><regTrib>");
    expect(xml).toContain("<toma><CNPJ>11222333000181</CNPJ><IM>IM99</IM><xNome>Tomador Sintético</xNome><fone>000000000</fone><email>toma@example.invalid</email></toma>");
  });
  it("tribFed/piscofins com CST, base, alíquotas, valores e tipo de retenção; retenção IRRF calculada", () => {
    expect(xml).toContain("<tribFed><piscofins><CST>01</CST><vBCPisCofins>1000.00</vBCPisCofins><pAliqPis>0.65</pAliqPis><pAliqCofins>3.00</pAliqCofins><vPis>6.50</vPis><vCofins>30.00</vCofins><tpRetPisCofins>2</tpRetPisCofins></piscofins><vRetIRRF>15.00</vRetIRRF></tribFed>");
  });
  it("totTrib percentual Fed/Est/Mun", () => {
    expect(xml).toContain("<totTrib><pTotTrib><pTotTribFed>10.00</pTotTribFed><pTotTribEst>0.00</pTotTribEst><pTotTribMun>2.00</pTotTribMun></pTotTrib></totTrib>");
  });
  it("opcionais ausentes não geram tags vazias; CPF do tomador", () => {
    const min = buildDpsXml({ ...SYNTH, emitter: { ...SYNTH.emitter, phone: null, email: null, municipalRegistration: null },
      taker: { cnpjCpf: "111.444.777-35", name: "Pessoa Sintética" }, service: { ...SYNTH.service, nbsCode: null },
      values: { serviceAmount: 10, issWithheld: true, totTrib: { mode: "IND" } } });
    expect(min).toContain("<toma><CPF>11144477735</CPF><xNome>Pessoa Sintética</xNome></toma>");
    expect(min).not.toMatch(/<fone>|<email>|<IM>|<cNBS>|<tribFed>/);
    expect(min).toContain("<totTrib><indTotTrib>0</indTotTrib></totTrib>");
  });
});

describe("DPS — pendências por regime e leiaute, sem presumir", () => {
  it("totTrib ausente e local ausente viram pendência", () => {
    expect(validateDps({ ...SYNTH, service: { ...SYNTH.service, locationIbge: "" }, values: { ...SYNTH.values, totTrib: null } }))
      .toEqual(expect.arrayContaining(["local_prestacao", "total_tributos"]));
  });
  it("pTotTribSN só para optante do Simples (opSimpNac 3)", () => {
    expect(validateDps({ ...SYNTH, values: { ...SYNTH.values, totTrib: { mode: "SN", sn: 6 } } })).toContain("total_tributos_regime");
    const sn = { ...SYNTH, emitter: { ...SYNTH.emitter, regime: { opSimpNac: "3" as const, regApTribSN: "1" as const, regEspTrib: "0" as const } }, values: { ...SYNTH.values, pisCofins: null, totTrib: { mode: "SN" as const, sn: 6 } } };
    expect(buildDpsXml(sn)).toContain("<pTotTribSN>6.00</pTotTribSN>");
  });
  it("regime ausente bloqueia (não presume não optante)", () => {
    expect(validateDps({ ...SYNTH, emitter: { ...SYNTH.emitter, regime: null } })).toContain("regime_tributario");
  });
  it("CNPJ alfanumérico (IN RFB 2.229/2024) é pendência no leiaute 1.01, nunca truncado", () => {
    expect(validateDps({ ...SYNTH, taker: { ...SYNTH.taker, cnpjCpf: "12.ABC.345/01DE-35" } })).toContain("documento_tomador_alfanumerico");
    expect(validateDps({ ...SYNTH, emitter: { ...SYNTH.emitter, cnpj: "12ABC34501DE35" } })).toContain("cnpj_emitente_alfanumerico");
  });
  it("cTribNac numérico no snapshot é recusado (perderia zero inicial)", () => {
    const inv = { id: "i", environment: "HOMOLOGATION", issue_date: "2026-11-13", draft_version: 1, total_amount: 10,
      fiscal_profile_snapshot: { nfse_dps: { v: 1, service_location_ibge_code: "9999902", tot_trib: { mode: "IND" } } },
      items: [{ description: "x", net_value: 10, fiscal_profile_snapshot: { national_tax_code: 10101 as unknown as string }, tax_snapshot: {} }] };
    const c = { cnpj: "00000000000191", municipality_ibge_code: "9999901", municipal_registration: null, crt: "3", fiscal_environment: "HOMOLOGATION" };
    const m = mapInvoiceToDps(inv, c, { cpf_cnpj: "11144477735", name: "T", email: null }, new Date());
    expect(m.ok).toBe(false); if (m.ok === false) expect(m.missing).toContain("codigo_tributacao_nacional_numerico");
  });
});

describe("rascunho → DPS usa o snapshot do faturamento", () => {
  const c = { cnpj: "00000000000191", municipality_ibge_code: "9999901", municipal_registration: null, crt: "3", fiscal_environment: "HOMOLOGATION", phone: null, fiscal_email: null };
  // IBS/CBS fictício (alíquotas não reais) — agora exigido por item no snapshot.
  const ibs = { schema_version: 1, cst_ibs_cbs: "410", c_class_trib: "410001", c_ind_op: "100301", effective_from: "2026-01-01", additional_fields: { indDest: "0" } };
  const items = [{ description: "S", net_value: "100.00", fiscal_profile_snapshot: { national_tax_code: "010101", municipality_ibge_code: "9999901", ibs_cbs: ibs }, tax_snapshot: { iss_rate: 2 } }];
  it("snapshot antigo sem complemento aponta pendências", () => {
    const m = mapInvoiceToDps({ id: "i", environment: "HOMOLOGATION", issue_date: "2026-11-13", draft_version: 1, total_amount: 100, items }, c, { cpf_cnpj: "11144477735", name: "T", email: null }, new Date());
    expect(m.ok).toBe(false); if (m.ok === false) expect(m.missing).toEqual(["local_prestacao", "total_tributos"]);
  });
  it("snapshot com complemento produz DPS com NBS, local e PIS/COFINS", () => {
    const m = mapInvoiceToDps({ id: "i", environment: "HOMOLOGATION", issue_date: "2026-11-13", draft_version: 2, total_amount: 100, items,
      fiscal_profile_snapshot: { nfse_dps: { v: 1, nbs_code: "012345678", service_location_ibge_code: "9999902", pis_cofins: { cst: "06" }, tot_trib: { mode: "IND" } } } },
      c, { cpf_cnpj: "11144477735", name: "T", email: null, municipal_registration: "IM1", phone: "00000000" }, new Date());
    expect(m.ok).toBe(true);
    if (m.ok) { const xml = buildDpsXml({ ...m.input, series: "1", number: 1 }); expect(xml).toContain("<cNBS>012345678</cNBS>"); expect(xml).toContain("<piscofins><CST>06</CST></piscofins>"); expect(xml).toContain("<IM>IM1</IM>"); }
  });
});

describe("complemento do perfil", () => {
  it("valida chaves e formatos", () => {
    expect(validateNfseDpsProfile({ v: 1, nbs_code: "12" })).toContain("nbs");
    expect(validateNfseDpsProfile({ v: 1, foo: 1 })).toContain("chave_desconhecida");
    expect(validateNfseDpsProfile({ v: 1, pis_cofins: { cst: "01", p_aliq_pis: 1 } })).toContain("pis_cofins_aliquota_par");
    expect(validateNfseDpsProfile({ v: 1, tot_trib: { mode: "PERCENT", fed: 1 } })).toContain("total_tributos_percentual");
    expect(validateNfseDpsProfile(null)).toEqual([]);
  });
  it("compacta sem inventar defaults", () => {
    expect(compactNfseDpsProfile({})).toBeNull();
    expect(compactNfseDpsProfile({ nbs_code: "012345678", pis_cofins: { cst: "" } as never })).toEqual({ v: 1, nbs_code: "012345678" });
  });
});

import { buildUpdatePayload, buildInsertPayload, rowToFormValues } from "@/lib/fiscal/serviceFiscalValidation";
import { dpsFormFromRow, dpsFormToProfile } from "@/lib/fiscal/serviceNfseDpsForm";

describe("editor: complemento persiste em federal_withholding_defaults.nfse_dps", () => {
  const row = { id: "p", service_id: "00000000-0000-4000-8000-0000000005a1", source_reference: null, iss_withheld_default: false, iss_rate: null,
    federal_withholding_defaults: { outra_chave: { x: 1 } } };
  it("reabrir/salvar sem mudança não gera escrita", () => {
    const form = dpsFormFromRow(row.federal_withholding_defaults);
    const { profile } = dpsFormToProfile(form);
    expect(buildUpdatePayload({ ...rowToFormValues(row), nfse_dps: profile }, row)).toEqual({});
  });
  it("mescla preservando outras chaves e mantém cTribNac/NBS como string", () => {
    const form = { ...dpsFormFromRow(null), nbs_code: "012345678", service_location_ibge_code: "9999902", tot_mode: "IND" as const };
    const { profile, errors } = dpsFormToProfile(form);
    expect(errors).toEqual([]);
    const p = buildUpdatePayload({ ...rowToFormValues(row), nfse_dps: profile }, row);
    expect(p.federal_withholding_defaults).toEqual({ outra_chave: { x: 1 }, nfse_dps: { v: 1, nbs_code: "012345678", service_location_ibge_code: "9999902", tot_trib: { mode: "IND" } } });
    // reabertura devolve os mesmos campos
    expect(dpsFormFromRow(p.federal_withholding_defaults).nbs_code).toBe("012345678");
  });
  it("alíquota sem CST é recusada; perfil novo sem complemento não grava a coluna", () => {
    expect(dpsFormToProfile({ ...dpsFormFromRow(null), p_aliq_pis: "1" }).errors).toEqual(["pis_cofins"]);
    expect(buildInsertPayload({ service_id: row.service_id, source_reference: null }, { ...rowToFormValues(null), nfse_dps: null })).not.toHaveProperty("federal_withholding_defaults");
  });
});
