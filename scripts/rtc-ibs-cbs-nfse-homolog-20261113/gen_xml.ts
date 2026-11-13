// Gera XMLs SINTÉTICOS (dados fictícios, alíquotas fictícias marcadas como tal) pelos builders reais; sem rede.
import { readFileSync, writeFileSync } from "node:fs";
import { buildNfeXml, type NfePayload } from "../../supabase/functions/_shared/fiscal/nfe/buildNfeXml";
import { buildDpsXml, type DpsInput } from "../../supabase/functions/_shared/nfse/dps";
import { mapInvoiceToDps } from "../../supabase/functions/_shared/nfse/dpsFromInvoice";
const H = import.meta.dir;
// Alíquotas FICTÍCIAS de teste — não são alíquotas reais.
const FAKE = { schema_version: 1, cst_ibs_cbs: "000", c_class_trib: "000001", effective_from: "2026-01-01", aliquota_cbs: 0.9, aliquota_ibs_uf: 0.1, aliquota_ibs_municipio: 0,
  additional_fields: { effective_to: "2026-12-31", ibs_destino: { SP: { uf: 0.1, mun: 0 } } } };
// Assinatura estrutural (placeholder) só para o XSD exigir o elemento; não é prova criptográfica.
const SIG = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#ID"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>AAAA</DigestValue></Reference></SignedInfo><SignatureValue>AAAA</SignatureValue><KeyInfo><X509Data><X509Certificate>AAAA</X509Certificate></X509Data></KeyInfo></Signature>`;
const base = JSON.parse(readFileSync(`${H}/../nfe-f41-certification-20261112/fixtures/synthetic-mg-icms00.json`, "utf8")) as NfePayload;
function nfe(name: string, p: NfePayload) {
  const b = buildNfeXml(p);
  writeFileSync(`${H}/evidence/nfe-${name}.xml`, b.xml.replace("</infNFe></NFe>", `</infNFe>${SIG.replace("#ID", "#" + b.infNFeId)}</NFe>`));
}
const withIbs = (p: NfePayload, cfg: unknown): NfePayload => ({ ...p, ide: { ...p.ide, rtcIbsCbs: true }, det: p.det.map((d) => ({ ...d, vProd: 1000, vUnCom: 1000, ibsCbsConfig: cfg })), total: { ...p.total, vProd: 1000, vNF: 1000 } });
nfe("interna-cst000", withIbs(base, FAKE));
const inter = withIbs(base, FAKE);
inter.dest = { ...inter.dest, enderDest: { ...(inter.dest.enderDest as Record<string, unknown>), cMun: "3550308", xMun: "SAO PAULO", UF: "SP", CEP: "01001000" } };
inter.det = inter.det.map((d) => ({ ...d, CFOP: "6101" }));
inter.ide = { ...inter.ide, idDest: "2" };
nfe("interestadual-cst000", inter);
nfe("interna-cst410", withIbs(base, { schema_version: 1, cst_ibs_cbs: "410", c_class_trib: "410001", effective_from: "2026-01-01" }));

// DPS pelo caminho real rascunho→mapeamento→builder.
const svcIbs = { schema_version: 1, cst_ibs_cbs: "000", c_class_trib: "000001", c_ind_op: "100301", effective_from: "2026-01-01", aliquota_cbs: 0.9, aliquota_ibs_uf: 0.1, aliquota_ibs_municipio: 0, additional_fields: { indDest: "0", indFinal: "0" } };
const inv = { id: "00000000-0000-4000-8000-000000000001", environment: "HOMOLOGATION", issue_date: "2026-11-13", draft_version: 3, total_amount: 1000,
  fiscal_profile_snapshot: { nfse_dps: { v: 1, service_location_ibge_code: "9999902", nbs_code: "012345678", tot_trib: { mode: "IND" } } },
  items: [{ description: "Serviço sintético", net_value: 1000, fiscal_profile_snapshot: { national_tax_code: "010101", municipality_ibge_code: "9999901", ibs_cbs: svcIbs }, tax_snapshot: { iss_rate: 2, iss_withheld: false } }] };
const comp = { cnpj: "00000000000191", municipality_ibge_code: "9999901", municipal_registration: null, crt: "3", fiscal_environment: "HOMOLOGATION" };
const cust = { cpf_cnpj: "11222333000181", name: "Tomador Sintético", email: null };
const m = mapInvoiceToDps(inv, comp, cust, new Date("2026-11-13T13:00:00Z"));
if (!m.ok) throw new Error("map:" + m.missing.join(","));
const dps: DpsInput = { ...m.input, series: "1", number: 31 };
writeFileSync(`${H}/evidence/homolog-dps-ibscbs.xml`, buildDpsXml(dps));
writeFileSync(`${H}/evidence/producao-dps-ibscbs.xml`, buildDpsXml({ ...dps, environment: "PRODUCTION" }));
console.log("ok");
