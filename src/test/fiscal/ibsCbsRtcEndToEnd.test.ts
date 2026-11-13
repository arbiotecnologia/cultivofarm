/** IBS/CBS por item → snapshot → XML NF-e 55 e DPS; exceção de envio homologação. Dados e alíquotas FICTÍCIOS. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { nfeIbsCbsBase, nfeIbsCbsValues, parseReturnedIbsCbs, resolveIbsCbs, dpsIbsCbsXml } from "../../../supabase/functions/_shared/fiscal/rtc/ibsCbs";
import { buildNfeXml, type NfePayload } from "../../../supabase/functions/_shared/fiscal/nfe/buildNfeXml";
import { mapInvoiceToDps } from "../../../supabase/functions/_shared/nfse/dpsFromInvoice";
import { buildDpsXml } from "../../../supabase/functions/_shared/nfse/dps";
import { assertAllowlistUrl, decideTransmissionGate, rejectRedirect } from "../../../supabase/functions/_shared/nfse/homologAllowlist";
import { ibsCbsProfileIssues, setDestRates, setExtra } from "@/lib/fiscal/ibsCbsItemForm";

const FAKE = { schema_version: 1, cst_ibs_cbs: "000", c_class_trib: "000001", effective_from: "2026-01-01", aliquota_cbs: 0.9, aliquota_ibs_uf: 0.1, aliquota_ibs_municipio: 0,
  additional_fields: { effective_to: "2026-12-31", ibs_destino: { SP: { uf: 0.2, mun: 0.05 } } } };
const NFE_CTX = { documentKind: "NFE" as const, issueDate: "2026-11-13", emitterUf: "MG", destinationUf: "MG" };

describe("resolveIbsCbs — regras do perfil", () => {
  it("ausência vira pendência, nunca alíquota presumida", () => {
    expect(resolveIbsCbs(undefined, NFE_CTX)).toEqual({ ok: false, missing: ["ibs_cbs_ausente"] });
    expect(resolveIbsCbs({ schema_version: 1 }, NFE_CTX)).toEqual({ ok: false, missing: ["ibs_cbs_ausente"] });
  });
  it("cClassTrib precisa pertencer ao CST", () => {
    const r = resolveIbsCbs({ ...FAKE, c_class_trib: "410001" }, NFE_CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("ibs_cbs_cst_cclasstrib_divergente");
  });
  it("fora da vigência bloqueia (antes do início e depois do fim)", () => {
    for (const d of ["2025-12-31", "2027-01-01"]) {
      const r = resolveIbsCbs(FAKE, { ...NFE_CTX, issueDate: d });
      expect(r.ok ? [] : r.missing).toContain("ibs_cbs_fora_vigencia");
    }
  });
  it("CST 000 sem alíquota CBS fica pendente", () => {
    const { aliquota_cbs: _x, ...noCbs } = FAKE;
    const r = resolveIbsCbs(noCbs, NFE_CTX);
    expect(r.ok ? [] : r.missing).toEqual(["ibs_cbs_aliquota_cbs"]);
  });
  it("CST 410 não aceita alíquota positiva; CSTs sem grupo homologado ficam pendentes", () => {
    expect(resolveIbsCbs({ ...FAKE, cst_ibs_cbs: "410", c_class_trib: "410001" }, NFE_CTX).ok).toBe(false);
    const r = resolveIbsCbs({ ...FAKE, cst_ibs_cbs: "200", c_class_trib: "200001" }, NFE_CTX);
    expect(r.ok ? [] : r.missing).toContain("ibs_cbs_cst_nao_suportado");
  });
  it("interestadual usa a UF de destino; UF sem cadastro fica pendente", () => {
    const sp = resolveIbsCbs(FAKE, { ...NFE_CTX, destinationUf: "SP" });
    expect(sp.ok && sp.snapshot.rates).toEqual({ cbs: 0.9, ibsUf: 0.2, ibsMun: 0.05 });
    const rj = resolveIbsCbs(FAKE, { ...NFE_CTX, destinationUf: "RJ" });
    expect(rj.ok ? [] : rj.missing).toEqual(["ibs_cbs_aliquota_destino"]);
  });
  it("NFS-e exige cIndOp de 6 dígitos e indDest = 0", () => {
    const r = resolveIbsCbs({ ...FAKE, c_ind_op: "1003" }, { documentKind: "NFSE", issueDate: "2026-11-13" });
    expect(r.ok ? [] : r.missing).toEqual(expect.arrayContaining(["ibs_cbs_cindop", "ibs_cbs_inddest"]));
  });
});

describe("NF-e 55 — valores e totais", () => {
  const base = JSON.parse(readFileSync("scripts/nfe-f41-certification-20261112/fixtures/synthetic-mg-icms00.json", "utf8")) as NfePayload;
  const payload = (cfg: unknown, uf = "MG"): NfePayload => ({ ...base, ide: { ...base.ide, rtcIbsCbs: true },
    dest: { ...base.dest, enderDest: { ...(base.dest.enderDest as Record<string, unknown>), UF: uf } },
    det: base.det.map((d) => ({ ...d, vProd: 1000, ibsCbsConfig: cfg })) });

  it("base 2026 desconta PIS/COFINS/ICMS do item", () => {
    expect(nfeIbsCbsBase({ vProd: 1000, vPIS: 0.02, vCOFINS: 0.08, vICMS: 0.18 })).toBe(999.72);
    expect(nfeIbsCbsValues(resolveIbsCbs(FAKE, NFE_CTX).ok ? (resolveIbsCbs(FAKE, NFE_CTX) as { snapshot: never }).snapshot : (null as never), 999.72))
      .toEqual({ vBC: 999.72, vIBSUF: 1, vIBSMun: 0, vIBS: 1, vCBS: 9 });
  });
  it("interna: grupo do item e IBSCBSTot com os mesmos valores", () => {
    const xml = buildNfeXml(payload(FAKE)).xml;
    expect(xml).toContain("<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>999.72</vBC><gIBSUF><pIBSUF>0.1000</pIBSUF><vIBSUF>1.00</vIBSUF>");
    expect(xml).toContain("<gCBS><pCBS>0.9000</pCBS><vCBS>9.00</vCBS></gCBS>");
    expect(xml).toMatch(/<\/ICMSTot><IBSCBSTot><vBCIBSCBS>999\.72<\/vBCIBSCBS>.*<vIBS>1\.00<\/vIBS>.*<vCBS>9\.00<\/vCBS>/);
  });
  it("interestadual: alíquotas da UF de destino", () => {
    const xml = buildNfeXml(payload(FAKE, "SP")).xml;
    expect(xml).toContain("<pIBSUF>0.2000</pIBSUF><vIBSUF>2.00</vIBSUF>");
    expect(xml).toContain("<pIBSMun>0.0500</pIBSMun><vIBSMun>0.50</vIBSMun>");
  });
  it("marcado como obrigatório, item sem snapshot bloqueia; sem marca o XML anterior é preservado", () => {
    expect(() => buildNfeXml(payload(undefined))).toThrow(/NFE_IBSCBS_MISSING|snapshot IBS\/CBS ausente/);
    expect(buildNfeXml(base).xml).not.toContain("IBSCBS");
  });
  it("mesmo payload gera o mesmo XML (determinístico)", () => {
    expect(buildNfeXml(payload(FAKE)).xml).toBe(buildNfeXml(payload(FAKE)).xml);
  });
});

describe("DPS — somente campos declarados; devolvidos separados", () => {
  const svc = { schema_version: 1, cst_ibs_cbs: "000", c_class_trib: "000001", c_ind_op: "100301", effective_from: "2026-01-01", aliquota_cbs: 0.9, aliquota_ibs_uf: 0.1, aliquota_ibs_municipio: 0, additional_fields: { indDest: "0" } };
  const inv = (items: unknown[]) => ({ id: "00000000-0000-4000-8000-000000000001", environment: "HOMOLOGATION", issue_date: "2026-11-13", draft_version: 3, total_amount: 1000 * items.length,
    fiscal_profile_snapshot: { nfse_dps: { v: 1, service_location_ibge_code: "9999902", tot_trib: { mode: "IND" } } }, items: items as never });
  const item = (ibs: unknown) => ({ description: "Serviço sintético", net_value: 1000, fiscal_profile_snapshot: { national_tax_code: "010101", municipality_ibge_code: "9999901", ibs_cbs: ibs }, tax_snapshot: { iss_rate: 2, iss_withheld: false } });
  const comp = { cnpj: "00000000000191", municipality_ibge_code: "9999901", municipal_registration: null, crt: "3", fiscal_environment: "HOMOLOGATION" };
  const cust = { cpf_cnpj: "11222333000181", name: "Tomador Sintético", email: null };
  const now = new Date("2026-11-13T13:00:00Z");

  it("rascunho sem ibs_cbs no item fica pendente", () => {
    const m = mapInvoiceToDps(inv([item(undefined)]), comp, cust, now);
    expect(m.ok ? [] : m.missing).toContain("ibs_cbs_ausente");
  });
  it("itens com IBS/CBS divergentes bloqueiam", () => {
    const m = mapInvoiceToDps(inv([item(svc), item({ ...svc, c_ind_op: "100302" })]), comp, cust, now);
    expect(m.ok ? [] : m.missing).toContain("ibs_cbs_itens_divergentes");
  });
  it("homologação: IBSCBS após valores com CST/cClassTrib diretos, sem alíquota/valor", () => {
    const m = mapInvoiceToDps(inv([item(svc)]), comp, cust, now);
    if (!m.ok) throw new Error(m.missing.join());
    const xml = buildDpsXml({ ...m.input, series: "1", number: 1 });
    expect(xml).toContain("</valores><IBSCBS><cIndOp>100301</cIndOp><indDest>0</indDest><valores><trib><CST>000</CST><cClassTrib>000001</cClassTrib></trib></valores></IBSCBS></infDPS>");
    expect(xml.slice(xml.indexOf("<IBSCBS>"))).not.toMatch(/pCBS|pIBSUF|vBC/);
  });
  it("produção 1.01: finNFSe dentro de IBSCBS e trib/gIBSCBS", () => {
    expect(dpsIbsCbsXml({ cst: "000", cClassTrib: "000001", cIndOp: "100301", indFinal: null, indDest: "0" }, "PRODUCTION"))
      .toBe("<IBSCBS><finNFSe>0</finNFSe><cIndOp>100301</cIndOp><indDest>0</indDest><valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores></IBSCBS>");
  });
  it("impressão digital inclui o IBS/CBS (idempotência muda se o declarado muda)", () => {
    const a = mapInvoiceToDps(inv([item(svc)]), comp, cust, now), b = mapInvoiceToDps(inv([item(svc)]), comp, cust, new Date("2026-11-13T15:00:00Z"));
    const c = mapInvoiceToDps(inv([item({ ...svc, c_ind_op: "100302" })]), comp, cust, now);
    if (!a.ok || !b.ok || !c.ok) throw new Error("map");
    expect(a.fingerprintSource).toBe(b.fingerprintSource);
    expect(a.fingerprintSource).not.toBe(c.fingerprintSource);
  });
  it("valores devolvidos vêm do IBSCBS da NFS-e, não do IBSCBS da DPS embutida", () => {
    const nfse = `<NFSe><infNFSe><IBSCBS><cLocalidadeIncid>9999901</cLocalidadeIncid><valores><vBC>950.00</vBC><uf><pIBSUF>0.10</pIBSUF></uf><mun><pIBSMun>0.00</pIBSMun></mun><fed><pCBS>0.90</pCBS></fed></valores></IBSCBS>` +
      `<DPS><infDPS><IBSCBS><cIndOp>100301</cIndOp><valores><vBC>1.00</vBC></valores></IBSCBS></infDPS></DPS></infNFSe></NFSe>`;
    expect(parseReturnedIbsCbs(nfse)).toMatchObject({ cLocalidadeIncid: "9999901", vBC: "950.00", pIBSUF: "0.10", pCBS: "0.90" });
    expect(parseReturnedIbsCbs("<NFSe><infNFSe><DPS><IBSCBS><vBC>1</vBC></IBSCBS></DPS></infNFSe></NFSe>")).toBeNull();
  });
});

describe("Exceção de envio NFS-e homologação (allowlist privada)", () => {
  it("trava global desligada + fora da allowlist = bloqueado", () => {
    expect(decideTransmissionGate({ globalEnabled: false, productionFlag: false, allowlist: { allowed: false, reason: "not_allowlisted" } }))
      .toEqual({ enabled: false, mode: "off", reason: "not_allowlisted" });
    expect(decideTransmissionGate({ globalEnabled: false, productionFlag: true, allowlist: null }).enabled).toBe(false);
  });
  it("allowlist força produção desligada mesmo com flag de produção ligada", () => {
    const g = decideTransmissionGate({ globalEnabled: false, productionFlag: true, allowlist: { allowed: true } });
    expect(g).toEqual({ enabled: true, mode: "homolog_allowlist", productionEnabled: false, homologOnlyHost: true });
  });
  it("host exato de produção restrita; produção, porta e credenciais recusados", () => {
    expect(() => assertAllowlistUrl("https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse")).not.toThrow();
    for (const u of ["https://sefin.nfse.gov.br/SefinNacional/nfse", "https://sefin.producaorestrita.nfse.gov.br:8443/x", "https://a:b@sefin.producaorestrita.nfse.gov.br/x", "http://sefin.producaorestrita.nfse.gov.br/x", "https://x.sefin.producaorestrita.nfse.gov.br/x"])
      expect(() => assertAllowlistUrl(u)).toThrow();
  });
  it("redirecionamento nunca é seguido", () => {
    expect(() => rejectRedirect(302)).toThrow();
    expect(() => rejectRedirect(201)).not.toThrow();
  });
});

describe("Guia fiscal — campos complementares", () => {
  it("vigência final/indDest persistem em additional_fields e limpam quando vazios", () => {
    let c = setExtra({ schema_version: 1 }, "effective_to", "2026-12-31");
    c = setExtra(c, "indDest", "0");
    expect(c.additional_fields).toEqual({ effective_to: "2026-12-31", indDest: "0" });
    c = setDestRates(setExtra(setExtra(c, "effective_to", ""), "indDest", ""), {});
    expect(c.additional_fields).toBeUndefined();
  });
  it("pendências do perfil apontam CST×cClassTrib e cIndOp do serviço", () => {
    expect(ibsCbsProfileIssues({ ...FAKE, c_class_trib: "410001" } as never, false)).toContain("ibs_cbs_cst_cclasstrib_divergente");
    expect(ibsCbsProfileIssues(FAKE as never, true)).toEqual(expect.arrayContaining(["ibs_cbs_cindop", "ibs_cbs_inddest"]));
    expect(ibsCbsProfileIssues(FAKE as never, false)).toEqual([]);
  });
});
