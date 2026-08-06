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
// O XSD oficial exige `Signature` dentro de `NFe`: o documento NÃO assinado
// é legitimamente inválido, e essa deve ser a ÚNICA pendência apontada.
const ok = await validateAgainstOfficialXsd(xml);
const onlySignature = !ok.valid && ok.issues.length === 1 &&
  /Signature/.test(ok.issues[0].message);
console.log("GATE não assinado (só falta Signature):", onlySignature ? "PASS" : "FAIL");
if (!onlySignature) console.log(JSON.stringify(ok.issues.slice(0, 12), null, 2));

const tampered = xml.replace("<nItem", "<nItemX").replace("</det>", "</det>");
const neg1 = await validateAgainstOfficialXsd(xml.replace("<vNF>250.00</vNF>", "<vNF>250.00</vNF><vXXX>1</vXXX>"));
console.log("GATE elemento desconhecido:", neg1.valid ? "FAIL" : "PASS", neg1.issues[0]?.code ?? "");
const neg2 = await validateAgainstOfficialXsd(xml.replace(/<NCM>\d+<\/NCM>/, "<NCM>1</NCM>"));
console.log("GATE faceta NCM:", neg2.valid ? "FAIL" : "PASS", neg2.issues[0]?.code ?? "");
void tampered;

// ---- Gate assinado: XSD real sobre o documento FINAL (com Signature) ----
import { signNfeXml } from "../../../supabase/functions/_shared/fiscal/nfe/signNfeXml.ts";
const pfx = await Deno.readFile("/tmp/test-a1.pfx");
const built = buildNfeXml(payload());
const signed = signNfeXml({ xml: built.xml, infNFeId: built.infNFeId,
  namespace: "http://www.portalfiscal.inf.br/nfe", pfx, password: "homolog" });
const rSigned = await validateAgainstOfficialXsd(signed.signedXml);
console.log("GATE assinado XSD:", rSigned.valid ? "PASS" : "FAIL");
if (!rSigned.valid) console.log(JSON.stringify(rSigned.issues.slice(0, 8), null, 2));
const rTamper = await validateAgainstOfficialXsd(
  signed.signedXml.replace("<vNF>250.00</vNF>", "<vNF>ABC</vNF>"));
console.log("GATE adulteração tipo:", rTamper.valid ? "FAIL" : "PASS");

// ---- Gate XMLDSig: verificação independente e detecção de adulteração ----
import { verifyNfeSignature } from "../../../supabase/functions/_shared/fiscal/nfe/signNfeXml.ts";
const NS = "http://www.portalfiscal.inf.br/nfe";
const v1 = verifyNfeSignature(signed.signedXml, NS);
console.log("GATE XMLDSig positivo:", v1.valid ? "PASS" : "FAIL", JSON.stringify(v1));
const v2 = verifyNfeSignature(signed.signedXml.replace("<vNF>250.00</vNF>", "<vNF>251.00</vNF>"), NS);
console.log("GATE XMLDSig adulterado:", !v2.valid && v2.code === "SIGNATURE_DIGEST_MISMATCH" ? "PASS" : "FAIL", v2.code);
const v3 = verifyNfeSignature(
  signed.signedXml.replace(/<SignatureValue>[^<]*<\/SignatureValue>/, "<SignatureValue>AAAA</SignatureValue>"), NS);
console.log("GATE XMLDSig assinatura trocada:", !v3.valid ? "PASS" : "FAIL", v3.code);
