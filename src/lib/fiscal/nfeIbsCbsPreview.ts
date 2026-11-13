/**
 * Pré-visualização de NF-e 55 com IBS/CBS, sem transmissão: usa o MESMO gerador do backend
 * (buildNfeXml) com emitente/destinatário/valores FICTÍCIOS explícitos e a classificação real
 * do catálogo (NCM/CFOP do perfil e IBS/CBS do perfil RTC do item). Não reserva numeração,
 * não grava nota, não chama SEFAZ.
 */
import { buildNfeXml, type NfePayload } from "../../../supabase/functions/_shared/fiscal/nfe/buildNfeXml";

export type NfePreviewScenario = "interna" | "interestadual";
export interface NfePreviewItem { name: string; code: string | null; ncm: string | null; cfopInState: string | null; cfopInterstate: string | null; ibsCbsConfig: unknown }
export type NfePreviewResult = { ok: true; xml: string; scenario: NfePreviewScenario; emitUf: string; destUf: string; idDest: "1" | "2" } | { ok: false; scenario: NfePreviewScenario; missing: string[] };

const FICT = "FICTICIO - PRE-VISUALIZACAO SEM VALOR FISCAL";
const UF_CODE: Record<string, { cUF: string; cMun: string; xMun: string; CEP: string }> = {
  MG: { cUF: "31", cMun: "3106200", xMun: "BELO HORIZONTE", CEP: "30110000" },
  SP: { cUF: "35", cMun: "3550308", xMun: "SAO PAULO", CEP: "01001000" },
  GO: { cUF: "52", cMun: "5208707", xMun: "GOIANIA", CEP: "74000000" },
  BA: { cUF: "29", cMun: "2927408", xMun: "SALVADOR", CEP: "40000000" },
  MT: { cUF: "51", cMun: "5103403", xMun: "CUIABA", CEP: "78000000" },
  PR: { cUF: "41", cMun: "4106902", xMun: "CURITIBA", CEP: "80000000" },
};
export const PREVIEW_DEST_UFS = Object.keys(UF_CODE).filter((u) => u !== "MG");

export function buildNfeIbsCbsPreview(item: NfePreviewItem, scenario: NfePreviewScenario, opts: { destUf?: string; issueDate: string }): NfePreviewResult {
  const emitUf = "MG";
  const destUf = scenario === "interna" ? emitUf : (opts.destUf ?? "SP");
  const missing: string[] = [];
  if (!item.ncm || !/^\d{8}$/.test(item.ncm)) missing.push("ncm");
  const cfop = scenario === "interna" ? item.cfopInState : item.cfopInterstate;
  if (!cfop || !/^\d{4}$/.test(cfop)) missing.push(scenario === "interna" ? "cfop_interno" : "cfop_interestadual");
  else if ((scenario === "interna") !== cfop.startsWith("5")) missing.push("cfop_incompativel_com_destino");
  if (!item.ibsCbsConfig || typeof item.ibsCbsConfig !== "object" || Object.keys(item.ibsCbsConfig as object).length === 0) missing.push("ibs_cbs");
  if (!UF_CODE[destUf]) missing.push("uf_destino");
  if (missing.length) return { ok: false, scenario, missing };
  const e = UF_CODE[emitUf], d = UF_CODE[destUf];
  const idDest = destUf === emitUf ? "1" : "2";
  const nNF = scenario === "interna" ? "901" : "902";
  // Chave fictícia estrutural (tpAmb=2); não reservada.
  const base43 = `${e.cUF}${opts.issueDate.slice(2, 4)}${opts.issueDate.slice(5, 7)}1122233300018155001${nNF.padStart(9, "0")}187654321`;
  const dv = mod11(base43);
  const payload: NfePayload = {
    engineVersion: "PREVIEW", schemaVersion: "4.00", tpAmb: "2", accessKey: base43 + dv,
    ide: { cUF: e.cUF, cNF: base43.slice(35, 43), natOp: "VENDA", mod: "55", serie: "1", nNF, dhEmi: opts.issueDate, tpNF: "1", idDest,
      cMunFG: e.cMun, tpImp: "1", tpEmis: "1", cDV: String(dv), finNFe: "1", indFinal: "1", indPres: "9", procEmi: "0", verProc: "PREVIEW-IBSCBS", rtcIbsCbs: true },
    emit: { CNPJ: "11222333000181", xNome: `EMITENTE ${FICT}`, CRT: "3", IE: "0010000000001",
      enderEmit: { xLgr: "RUA FICTICIA", nro: "100", xBairro: "CENTRO", cMun: e.cMun, xMun: e.xMun, UF: emitUf, CEP: e.CEP } },
    dest: { doc: "11222333000181", xNome: `DESTINATARIO ${FICT}`, indIEDest: "9",
      enderDest: { xLgr: "AV FICTICIA", nro: "200", xBairro: "CENTRO", cMun: d.cMun, xMun: d.xMun, UF: destUf, CEP: d.CEP } },
    det: [{ nItem: 1, cProd: (item.code || "ITEM1").slice(0, 60), xProd: item.name.slice(0, 120), NCM: item.ncm, CFOP: cfop, uCom: "UN", qCom: 1, vUnCom: 100, vProd: 100,
      orig: "0", CST: "00", ibsCbsConfig: item.ibsCbsConfig,
      taxSnapshot: { taxes: { ICMS: { cst: "00", rate: 0, base: 0, baseOriginal: 0, baseReductionPct: 0, value: 0 }, PIS: { cst: "01", rate: 0, base: 0, value: 0 }, COFINS: { cst: "01", rate: 0, base: 0, value: 0 } } } }],
    total: { vBC: 0, vICMS: 0, vProd: 100, vFrete: 0, vSeg: 0, vDesc: 0, vIPI: 0, vPIS: 0, vCOFINS: 0, vOutro: 0, vNF: 100, vFCP: 0, vST: 0, vFCPST: 0 },
    infAdic: { infCpl: `PRE-VISUALIZACAO ${scenario.toUpperCase()} - DADOS FICTICIOS - SEM VALOR FISCAL` },
  } as unknown as NfePayload;
  try { return { ok: true, xml: buildNfeXml(payload).xml, scenario, emitUf, destUf, idDest }; }
  catch (err) { return { ok: false, scenario, missing: [String((err as { code?: string }).code ?? (err as Error).message ?? "erro_gerador").slice(0, 120)] }; }
}

function mod11(k: string): number {
  let s = 0, w = 2;
  for (let i = k.length - 1; i >= 0; i--) { s += Number(k[i]) * w; w = w === 9 ? 2 : w + 1; }
  const r = s % 11; return r < 2 ? 0 : 11 - r;
}
