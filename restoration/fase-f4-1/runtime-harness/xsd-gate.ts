/**
 * F4.1-R1 — Gate local de XSD real (offline, sem banco e sem SEFAZ).
 * Executa: deno run -A restoration/fase-f4-1/runtime-harness/xsd-gate.ts
 */
import { buildNfeXml, type NfePayload } from "../../../supabase/functions/_shared/fiscal/nfe/buildNfeXml.ts";
import { validateAgainstOfficialXsd } from "../../../supabase/functions/fiscal-xml-engine/xsdValidate.ts";

const ACCESS_KEY = "35240800000000000191550010000000011000000017";
const payload = (o: Partial<NfePayload> = {}): NfePayload => ({
  engineVersion: "F4.1-R1", schemaVersion: "4.00", tpAmb: "2", accessKey: ACCESS_KEY,
  ide: { cUF: "35", cNF: "00000001", natOp: "VENDA DE MERCADORIA", mod: "55", serie: 1, nNF: 1,
    dhEmi: "2026-08-22", tpNF: "1", idDest: "1", cMunFG: "3550308", tpImp: "1", tpEmis: "1",
    cDV: "7", finNFe: "1", indFinal: "1", indPres: "9", procEmi: "0", verProc: "ARBIO-F4.1" },
  emit: { CNPJ: "00000000000191", xNome: "AR BIO LTDA", xFant: "AR BIO", IE: "123456789", CRT: "3", CNAE: "2029100",
    enderEmit: { xLgr: "RUA DAS BIOFABRICAS", nro: "100", xBairro: "CENTRO", cMun: "3550308",
      xMun: "SAO PAULO", UF: "SP", CEP: "01001000", cPais: "1058", xPais: "BRASIL" } },
  dest: { personType: "PJ", doc: "11222333000181", xNome: "CLIENTE TESTE", indIEDest: "1", IE: "987654321",
    enderDest: { xLgr: "AVENIDA RURAL", nro: "50", xBairro: "ZONA RURAL", cMun: "3550308",
      xMun: "SAO PAULO", UF: "SP", CEP: "01002000", cPais: "1058", xPais: "BRASIL" } },
  det: [{ nItem: 1, cProd: "PROD-1", xProd: "BIOINSUMO A", NCM: "38089999", CFOP: "5101", uCom: "L",
    qCom: 10, vUnCom: 25, vProd: 250, vDesc: 0, vFrete: 0, vSeg: 0, vOutro: 0, orig: "0", CST: "00",
    taxSnapshot: { taxes: { ICMS: { baseValue: 250, rate: 18, value: 45, cst: "00" },
      PIS: { baseValue: 250, rate: 1.65, value: 4.13, cst: "01" },
      COFINS: { baseValue: 250, rate: 7.6, value: 19, cst: "01" } } } }],
  total: { vProd: 250, vDesc: 0, vFrete: 0, vSeg: 0, vOutro: 0, vICMS: 45, vST: 0, vFCP: 0, vFCPST: 0,
    vPIS: 4.13, vCOFINS: 19, vIPI: 0, vNF: 250 },
  infAdic: { infCpl: "AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" }, ...o });

const { xml } = buildNfeXml(payload());
const ok = await validateAgainstOfficialXsd(xml);
console.log("GATE positivo:", ok.valid ? "PASS" : "FAIL");
if (!ok.valid) console.log(JSON.stringify(ok.issues.slice(0, 12), null, 2));

const tampered = xml.replace("<nItem", "<nItemX").replace("</det>", "</det>");
const neg1 = await validateAgainstOfficialXsd(xml.replace("<vNF>250.00</vNF>", "<vNF>250.00</vNF><vXXX>1</vXXX>"));
console.log("GATE elemento desconhecido:", neg1.valid ? "FAIL" : "PASS", neg1.issues[0]?.code ?? "");
const neg2 = await validateAgainstOfficialXsd(xml.replace(/<NCM>\d+<\/NCM>/, "<NCM>1</NCM>"));
console.log("GATE faceta NCM:", neg2.valid ? "FAIL" : "PASS", neg2.issues[0]?.code ?? "");
void tampered;
