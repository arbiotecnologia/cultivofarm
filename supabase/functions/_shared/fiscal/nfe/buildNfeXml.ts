/**
 * Fase F4 — Construtor determinístico do XML da NF-e 4.00 (modelo 55).
 *
 * Entrada: EXCLUSIVAMENTE o payload congelado por
 * `rpc_fiscal_xml_prepare_v1`. O builder é função pura: mesmo payload
 * produz byte a byte o mesmo XML (canônico, sem espaços supérfluos,
 * ordem de elementos fixa conforme leiaute).
 *
 * Teto: gera apenas o documento `NFe` de homologação (tpAmb=2). Não
 * monta `nfeProc`, não monta lote e não fala com SEFAZ.
 *
 * Módulo puro (sem APIs Deno).
 */

import { icmsCodeKindForCrt } from "./icmsRegime.ts";
import { nfeIbsCbsBase, nfeIbsCbsItemXml, nfeIbsCbsTotals, nfeIbsCbsTotXml, nfeIbsCbsValues, resolveIbsCbs, type NfeIbsCbsItemValues } from "../rtc/ibsCbs.ts";

export const NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
export const NFE_VERSION = "4.00";

export class NfeBuildError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "NfeBuildError";
  }
}

export interface NfePayload {
  engineVersion: string;
  schemaVersion: string;
  tpAmb: string;
  accessKey: string;
  ide: Record<string, unknown>;
  emit: Record<string, unknown>;
  dest: Record<string, unknown>;
  det: Array<Record<string, unknown>>;
  total: Record<string, unknown> | null;
  infAdic?: Record<string, unknown>;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Normaliza texto para o leiaute: sem controle, sem espaços duplicados. */
export function sanitizeText(value: unknown, maxLen: number): string {
  const raw = value === null || value === undefined ? "" : String(value);
  // deno-lint-ignore no-control-regex
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return clean.slice(0, maxLen);
}

export function dec(value: unknown, places: number): string {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) {
    throw new NfeBuildError("NFE_NUMBER_INVALID", "valor numérico inválido no payload");
  }
  // HALF_UP determinístico em 2/4 casas, idêntico ao fn_fiscal_round.
  const factor = 10 ** places;
  const rounded = Math.sign(n) * Math.round(Math.abs(n) * factor + Number.EPSILON) / factor;
  return rounded.toFixed(places);
}

function tag(name: string, value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text === "") return "";
  return `<${name}>${escapeXml(text)}</${name}>`;
}

function required(payload: Record<string, unknown>, key: string, ctx: string): string {
  const v = payload[key];
  const s = v === null || v === undefined ? "" : String(v).trim();
  if (s === "") {
    throw new NfeBuildError("NFE_FIELD_REQUIRED", `campo obrigatório ausente: ${ctx}.${key}`);
  }
  return s;
}

function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function buildEndereco(tagName: string, e: Record<string, unknown>, ctx: string): string {
  return [
    `<${tagName}>`,
    tag("xLgr", sanitizeText(required(e, "xLgr", ctx), 60)),
    tag("nro", sanitizeText(e.nro ?? "SN", 60)),
    tag("xCpl", sanitizeText(e.xCpl, 60)),
    tag("xBairro", sanitizeText(required(e, "xBairro", ctx), 60)),
    tag("cMun", digits(required(e, "cMun", ctx))),
    tag("xMun", sanitizeText(required(e, "xMun", ctx), 60)),
    tag("UF", String(required(e, "UF", ctx)).toUpperCase()),
    tag("CEP", digits(required(e, "CEP", ctx))),
    tag("cPais", digits(e.cPais ?? "1058")),
    tag("xPais", sanitizeText(e.xPais ?? "BRASIL", 60)),
    `</${tagName}>`,
  ].join("");
}

/**
 * dhEmi no leiaute 4.00 exige data-hora com offset (AAAA-MM-DDThh:mm:ssTZD).
 * Aceita tanto data pura quanto data-hora já completa, sem duplicar sufixo.
 */
function normalizeDhEmi(raw: string): string {
  const v = raw.trim();
  if (!v.includes("T")) return `${v}T00:00:00-03:00`;
  return /[+-]\d{2}:\d{2}$/.test(v) ? v : `${v}-03:00`;
}

function buildIde(p: NfePayload): string {

  const ide = p.ide ?? {};
  return [
    "<ide>",
    tag("cUF", digits(required(ide, "cUF", "ide"))),
    tag("cNF", digits(required(ide, "cNF", "ide")).padStart(8, "0")),
    tag("natOp", sanitizeText(required(ide, "natOp", "ide"), 60)),
    tag("mod", "55"),
    tag("serie", String(Number(required(ide, "serie", "ide")))),
    tag("nNF", String(Number(required(ide, "nNF", "ide")))),
    tag("dhEmi", normalizeDhEmi(String(required(ide, "dhEmi", "ide")))),
    tag("tpNF", required(ide, "tpNF", "ide")),
    tag("idDest", required(ide, "idDest", "ide")),
    tag("cMunFG", digits(required(ide, "cMunFG", "ide"))),
    tag("tpImp", ide.tpImp ?? "1"),
    tag("tpEmis", "1"),
    tag("cDV", required(ide, "cDV", "ide")),
    tag("tpAmb", p.tpAmb),
    tag("finNFe", ide.finNFe ?? "1"),
    tag("indFinal", required(ide, "indFinal", "ide")),
    tag("indPres", ide.indPres ?? "9"),
    tag("procEmi", ide.procEmi ?? "0"),
    tag("verProc", sanitizeText(ide.verProc ?? "ARBIO", 20)),
    "</ide>",
  ].join("");
}

function buildEmit(p: NfePayload): string {
  const e = p.emit ?? {};
  const cnpj = digits(required(e, "CNPJ", "emit"));
  if (cnpj.length !== 14) throw new NfeBuildError("NFE_EMIT_CNPJ_INVALID", "CNPJ do emitente inválido");
  const ie = digits(e.IE);
  // Ordem obrigatória do leiaute 4.00 (grupo emit):
  // CNPJ, xNome, xFant, enderEmit, IE, IEST, IM, CNAE, CRT.
  // O XSD só admite CNAE dentro da sequência que contém IM; sem IM o
  // elemento CNAE é rejeitado. Por isso CNAE é emitido apenas com IM.
  const im = sanitizeText(e.IM, 15);
  return [
    "<emit>",
    tag("CNPJ", cnpj),
    tag("xNome", sanitizeText(required(e, "xNome", "emit"), 60)),
    tag("xFant", sanitizeText(e.xFant, 60)),
    buildEndereco("enderEmit", (e.enderEmit ?? {}) as Record<string, unknown>, "emit.enderEmit"),
    ie ? tag("IE", ie) : tag("IE", "ISENTO"),
    tag("IEST", digits(e.IEST)),
    im ? tag("IM", im) + tag("CNAE", digits(e.CNAE)) : "",
    tag("CRT", required(e, "CRT", "emit")),
    "</emit>",
  ].join("");

}

function buildDest(p: NfePayload): string {
  const d = p.dest ?? {};
  const doc = digits(required(d, "doc", "dest"));
  if (doc.length !== 11 && doc.length !== 14) {
    throw new NfeBuildError("NFE_DEST_DOC_INVALID", "CPF/CNPJ do destinatário inválido");
  }
  // Homologação: MOC exige razão social fixa no destinatário (tpAmb=2).
  const nome = p.tpAmb === "2"
    ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
    : sanitizeText(required(d, "xNome", "dest"), 60);
  const indIE = String(d.indIEDest ?? "9");
  const ie = digits(d.IE);
  return [
    "<dest>",
    doc.length === 14 ? tag("CNPJ", doc) : tag("CPF", doc),
    tag("xNome", nome),
    buildEndereco("enderDest", (d.enderDest ?? {}) as Record<string, unknown>, "dest.enderDest"),
    tag("indIEDest", indIE),
    indIE === "1" && ie ? tag("IE", ie) : "",
    "</dest>",
  ].join("");
}

/** Leitura canônica do grupo de um tributo dentro do snapshot congelado. */
function taxOf(item: Record<string, unknown>, kind: string): Record<string, unknown> {
  const snapshot = (item.taxSnapshot ?? {}) as Record<string, unknown>;
  const taxes = (snapshot.taxes ?? {}) as Record<string, Record<string, unknown>>;
  return taxes[kind] ?? {};
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fase F3.4 — Dispatch do grupo ICMS por CRT + CST/CSOSN.
 *
 * A redução da base NUNCA é convertida em redução de alíquota: o percentual
 * vai em `pRedBC` e a base já reduzida (calculada no servidor) vai em `vBC`.
 * CST sem grupo implementado bloqueia a geração de forma explícita.
 */
function icmsBlock(item: Record<string, unknown>, crt: string): string {
  const orig = String(item.orig ?? "0");
  const icms = taxOf(item, "ICMS");
  const base = dec(icms.baseValue ?? icms.base ?? 0, 2);
  const rate = dec(icms.rate ?? 0, 2);
  const value = dec(icms.value ?? 0, 2);
  const redPct = num(icms.baseReductionPct);
  const nItem = String(item.nItem ?? "?");

  if (icmsCodeKindForCrt(crt) === "CSOSN") {
    const csosn = String(item.CSOSN ?? icms.csosn ?? "").trim() || "102";
    if (redPct > 0) {
      throw new NfeBuildError(
        "NFE_ICMS_REDUCTION_INCOMPATIBLE",
        `item ${nItem}: redução da base de cálculo não é compatível com CSOSN ${csosn} (Simples Nacional)`,
      );
    }
    if (csosn === "101") {
      const credito = taxOf(item, "ICMS_SN_CREDIT");
      return [
        "<ICMS><ICMSSN101>",
        tag("orig", orig),
        tag("CSOSN", "101"),
        tag("pCredSN", dec(credito.rate ?? icms.rate ?? 0, 4)),
        tag("vCredICMSSN", dec(credito.value ?? icms.value ?? 0, 2)),
        "</ICMSSN101></ICMS>",
      ].join("");
    }
    if (csosn === "102" || csosn === "103" || csosn === "300" || csosn === "400") {
      return `<ICMS><ICMSSN102><orig>${orig}</orig><CSOSN>${csosn}</CSOSN></ICMSSN102></ICMS>`;
    }
    throw new NfeBuildError(
      "NFE_ICMS_CSOSN_UNSUPPORTED",
      `item ${nItem}: CSOSN ${csosn} ainda não possui grupo XML homologado`,
    );
  }

  const cst = String(item.CST ?? icms.cst ?? "").trim() || "00";
  // Fase C6: somente modBC=3 (valor da operação) está homologado nesta etapa.
  // Qualquer outra modalidade declarada na regra bloqueia a geração.
  const modBC = String(icms.baseModality ?? icms.modBC ?? "3").trim() || "3";
  if (modBC !== "3") {
    throw new NfeBuildError(
      "NFE_ICMS_MODBC_UNSUPPORTED",
      `item ${nItem}: modalidade de base de cálculo ${modBC} não homologada (apenas valor da operação)`,
    );
  }

  if (cst === "20") {
    if (!(redPct > 0)) {
      throw new NfeBuildError(
        "NFE_ICMS_REDUCTION_MISSING",
        `item ${nItem}: CST 20 exige percentual de redução da base de cálculo`,
      );
    }
    return [
      "<ICMS><ICMS20>",
      tag("orig", orig),
      tag("CST", "20"),
      tag("modBC", modBC),
      tag("pRedBC", dec(redPct, 4)),
      tag("vBC", base),
      tag("pICMS", rate),
      tag("vICMS", value),
      "</ICMS20></ICMS>",
    ].join("");
  }

  if (redPct > 0) {
    throw new NfeBuildError(
      "NFE_ICMS_REDUCTION_INCOMPATIBLE",
      `item ${nItem}: redução da base de cálculo exige CST 20; CST informado: ${cst}`,
    );
  }

  if (cst === "00") {
    return [
      "<ICMS><ICMS00>",
      tag("orig", orig),
      tag("CST", cst),
      tag("modBC", modBC),
      tag("vBC", base),
      tag("pICMS", rate),
      tag("vICMS", value),
      "</ICMS00></ICMS>",
    ].join("");
  }

  if (cst === "40" || cst === "41" || cst === "50") {
    return [
      "<ICMS><ICMS40>",
      tag("orig", orig),
      tag("CST", cst),
      "</ICMS40></ICMS>",
    ].join("");
  }

  throw new NfeBuildError(
    "NFE_ICMS_CST_UNSUPPORTED",
    `item ${nItem}: CST ${cst} ainda não possui grupo XML homologado`,
  );
}

/**
 * Grupo IPI por item. Só é emitido quando o motor canônico apurou IPI para o
 * item; valor apurado sem grupo compatível bloqueia a geração.
 */
function ipiBlock(item: Record<string, unknown>): string {
  const ipi = taxOf(item, "IPI");
  const hasIpi = Object.keys(ipi).length > 0;
  const value = num(ipi.value);
  if (!hasIpi && value === 0) return "";
  const cst = String(ipi.cst ?? "").trim();
  const nItem = String(item.nItem ?? "?");
  if (num(ipi.baseReductionPct) > 0) {
    throw new NfeBuildError(
      "NFE_IPI_REDUCTION_UNSUPPORTED",
      `item ${nItem}: redução da base de IPI não possui grupo XML homologado`,
    );
  }
  const cEnq = sanitizeText(ipi.cEnq ?? "999", 3) || "999";
  if (value > 0 || cst === "00" || cst === "49" || cst === "50" || cst === "99") {
    if (!cst) {
      throw new NfeBuildError(
        "NFE_IPI_CST_MISSING",
        `item ${nItem}: IPI apurado sem CST no snapshot`,
      );
    }
    return [
      "<IPI>",
      tag("cEnq", cEnq),
      "<IPITrib>",
      tag("CST", cst),
      tag("vBC", dec(ipi.baseValue ?? ipi.base ?? 0, 2)),
      tag("pIPI", dec(ipi.rate ?? 0, 4)),
      tag("vIPI", dec(ipi.value ?? 0, 2)),
      "</IPITrib>",
      "</IPI>",
    ].join("");
  }
  return [
    "<IPI>",
    tag("cEnq", cEnq),
    `<IPINT>${tag("CST", cst || "53")}</IPINT>`,
    "</IPI>",
  ].join("");
}

/**
 * Fase C6 — dispatch fail-closed de PIS/COFINS por CST.
 *
 * CST de tributação por alíquota  -> PISAliq / COFINSAliq
 * CST não tributado / isento etc. -> PISNT  / COFINSNT
 * Demais CSTs (quantidade, ST, outras operações) ainda não têm grupo
 * homologado: a geração é bloqueada com erro técnico explícito. NUNCA
 * colocamos um CST incompatível dentro do grupo de alíquota.
 */
const PIS_COFINS_CST_ALIQ = new Set(["01", "02"]);
const PIS_COFINS_CST_NT = new Set(["04", "05", "06", "07", "08", "09"]);

function contribBlock(
  kind: "PIS" | "COFINS",
  data: Record<string, unknown>,
  nItem: string,
): string {
  const cst = String(data.cst ?? "").trim();
  if (!cst) {
    throw new NfeBuildError(
      `NFE_${kind}_CST_MISSING`,
      `item ${nItem}: ${kind} sem CST no snapshot tributário`,
    );
  }
  if (num(data.baseReductionPct) > 0 && !PIS_COFINS_CST_ALIQ.has(cst)) {
    throw new NfeBuildError(
      `NFE_${kind}_REDUCTION_INCOMPATIBLE`,
      `item ${nItem}: redução da base de ${kind} incompatível com CST ${cst}`,
    );
  }
  if (PIS_COFINS_CST_ALIQ.has(cst)) {
    const inner = [
      tag("CST", cst),
      tag("vBC", dec(data.baseValue ?? data.base ?? 0, 2)),
      tag(kind === "PIS" ? "pPIS" : "pCOFINS", dec(data.rate ?? 0, 2)),
      tag(kind === "PIS" ? "vPIS" : "vCOFINS", dec(data.value ?? 0, 2)),
    ].join("");
    return `<${kind}><${kind}Aliq>${inner}</${kind}Aliq></${kind}>`;
  }
  if (PIS_COFINS_CST_NT.has(cst)) {
    if (num(data.value) > 0) {
      throw new NfeBuildError(
        `NFE_${kind}_NT_WITH_VALUE`,
        `item ${nItem}: CST ${cst} de ${kind} não tributado com valor apurado`,
      );
    }
    return `<${kind}><${kind}NT>${tag("CST", cst)}</${kind}NT></${kind}>`;
  }
  throw new NfeBuildError(
    `NFE_${kind}_CST_UNSUPPORTED`,
    `item ${nItem}: CST ${cst} de ${kind} ainda não possui grupo XML homologado`,
  );
}

function pisCofinsBlock(item: Record<string, unknown>): string {
  const nItem = String(item.nItem ?? "?");
  const snapshot = (item.taxSnapshot ?? {}) as Record<string, unknown>;
  const taxes = (snapshot.taxes ?? {}) as Record<string, Record<string, unknown>>;
  return [
    contribBlock("PIS", taxes.PIS ?? {}, nItem),
    contribBlock("COFINS", taxes.COFINS ?? {}, nItem),
  ].join("");
}

/**
 * IBS/CBS por item a partir do snapshot congelado (`item.ibsCbsConfig`, cópia do
 * perfil RTC do item). Com `ide.rtcIbsCbs === true` todo item precisa do grupo;
 * sem a marca, nada é emitido (comportamento anterior preservado).
 */
function ibsCbsForItem(p: NfePayload, item: Record<string, unknown>): { xml: string; values: NfeIbsCbsItemValues | null } | null {
  const nItem = String(item.nItem ?? "?");
  const required = (p.ide ?? {}).rtcIbsCbs === true;
  if (item.ibsCbsConfig === undefined || item.ibsCbsConfig === null) {
    if (required) throw new NfeBuildError("NFE_IBSCBS_MISSING", `item ${nItem}: snapshot IBS/CBS ausente`);
    return null;
  }
  const emitUf = String(((p.emit ?? {}).enderEmit as Record<string, unknown> | undefined)?.UF ?? "");
  const destUf = String(((p.dest ?? {}).enderDest as Record<string, unknown> | undefined)?.UF ?? "");
  const r = resolveIbsCbs(item.ibsCbsConfig, { documentKind: "NFE", issueDate: String((p.ide ?? {}).dhEmi ?? "").slice(0, 10), emitterUf: emitUf, destinationUf: destUf });
  if (r.ok === false) throw new NfeBuildError("NFE_IBSCBS_PENDING", `item ${nItem}: ${r.missing.join(",")}`);
  const t = (k: string) => num(taxOf(item, k).value);
  const base = nfeIbsCbsBase({ vProd: num(item.vProd), vFrete: num(item.vFrete), vSeg: num(item.vSeg), vOutro: num(item.vOutro), vDesc: num(item.vDesc),
    vPIS: t("PIS"), vCOFINS: t("COFINS"), vICMS: t("ICMS"), vFCP: num(taxOf(item, "ICMS").fcpValue) });
  const values = nfeIbsCbsValues(r.snapshot, base);
  return { xml: nfeIbsCbsItemXml(r.snapshot, values), values };
}

function buildDet(p: NfePayload): string {
  const crt = String((p.emit ?? {}).CRT ?? "3");
  if (!Array.isArray(p.det) || p.det.length === 0) {
    throw new NfeBuildError("NFE_NO_ITEMS", "documento sem itens");
  }
  if (p.det.length > 990) {
    throw new NfeBuildError("NFE_TOO_MANY_ITEMS", "NF-e 4.00 suporta no máximo 990 itens");
  }
  return p.det
    .map((item, idx) => {
      const nItem = Number(item.nItem ?? idx + 1);
      const ncm = digits(required(item, "NCM", `det[${nItem}]`));
      if (ncm.length !== 8) {
        throw new NfeBuildError("NFE_NCM_INVALID", `NCM inválido no item ${nItem}`);
      }
      const cfop = digits(required(item, "CFOP", `det[${nItem}]`));
      if (cfop.length !== 4) {
        throw new NfeBuildError("NFE_CFOP_INVALID", `CFOP inválido no item ${nItem}`);
      }
      const cest = digits(item.CEST);
      const prod = [
        "<prod>",
        tag("cProd", sanitizeText(required(item, "cProd", `det[${nItem}]`), 60)),
        tag("cEAN", "SEM GTIN"),
        tag("xProd", sanitizeText(required(item, "xProd", `det[${nItem}]`), 120)),
        tag("NCM", ncm),
        cest ? tag("CEST", cest.padStart(7, "0")) : "",
        tag("CFOP", cfop),
        tag("uCom", sanitizeText(item.uCom ?? "UN", 6)),
        tag("qCom", dec(item.qCom, 4)),
        tag("vUnCom", dec(item.vUnCom, 4)),
        tag("vProd", dec(item.vProd, 2)),
        tag("cEANTrib", "SEM GTIN"),
        tag("uTrib", sanitizeText(item.uCom ?? "UN", 6)),
        tag("qTrib", dec(item.qCom, 4)),
        tag("vUnTrib", dec(item.vUnCom, 4)),
        Number(item.vFrete ?? 0) > 0 ? tag("vFrete", dec(item.vFrete, 2)) : "",
        Number(item.vSeg ?? 0) > 0 ? tag("vSeg", dec(item.vSeg, 2)) : "",
        Number(item.vDesc ?? 0) > 0 ? tag("vDesc", dec(item.vDesc, 2)) : "",
        Number(item.vOutro ?? 0) > 0 ? tag("vOutro", dec(item.vOutro, 2)) : "",
        tag("indTot", "1"),
        "</prod>",
      ].join("");
      return [
        `<det nItem="${nItem}">`,
        prod,
        "<imposto>",
        icmsBlock(item, crt),
        ipiBlock(item),
        pisCofinsBlock(item),
        ibsCbsForItem(p, item)?.xml ?? "",
        "</imposto>",
        "</det>",
      ].join("");
    })
    .join("");
}

function buildTotal(p: NfePayload): string {
  const t = (p.total ?? {}) as Record<string, unknown>;
  if (!t || Object.keys(t).length === 0) {
    throw new NfeBuildError("NFE_TOTALS_MISSING", "snapshot de totais ausente");
  }
  return [
    "<total><ICMSTot>",
    tag("vBC", dec(t.vBC ?? t.vProd ?? 0, 2)),
    tag("vICMS", dec(t.vICMS, 2)),
    tag("vICMSDeson", dec(0, 2)),
    tag("vFCP", dec(t.vFCP, 2)),
    tag("vBCST", dec(0, 2)),
    tag("vST", dec(t.vST, 2)),
    tag("vFCPST", dec(t.vFCPST, 2)),
    tag("vFCPSTRet", dec(0, 2)),
    tag("vProd", dec(t.vProd, 2)),
    tag("vFrete", dec(t.vFrete, 2)),
    tag("vSeg", dec(t.vSeg, 2)),
    tag("vDesc", dec(t.vDesc, 2)),
    tag("vII", dec(0, 2)),
    tag("vIPI", dec(t.vIPI, 2)),
    tag("vIPIDevol", dec(0, 2)),
    tag("vPIS", dec(t.vPIS, 2)),
    tag("vCOFINS", dec(t.vCOFINS, 2)),
    tag("vOutro", dec(t.vOutro, 2)),
    tag("vNF", dec(t.vNF, 2)),
    "</ICMSTot>",
    ibsCbsTotal(p),
    "</total>",
  ].join("");
}

function ibsCbsTotal(p: NfePayload): string {
  const per = (p.det ?? []).map((it) => ibsCbsForItem(p, it));
  if (per.every((x) => x === null)) return "";
  return nfeIbsCbsTotXml(nfeIbsCbsTotals(per.map((x) => x?.values ?? null)));
}

function buildTransp(): string {
  return "<transp><modFrete>9</modFrete></transp>";
}

function buildPag(p: NfePayload): string {
  const t = (p.total ?? {}) as Record<string, unknown>;
  return [
    "<pag><detPag>",
    tag("indPag", "1"),
    tag("tPag", "99"),
    tag("vPag", dec(t.vNF, 2)),
    "</detPag></pag>",
  ].join("");
}

function buildInfAdic(p: NfePayload): string {
  const infCpl = sanitizeText((p.infAdic ?? {}).infCpl, 5000);
  if (!infCpl) return "";
  return `<infAdic>${tag("infCpl", infCpl)}</infAdic>`;
}

export interface BuiltNfe {
  xml: string;
  infNFeId: string;
  accessKey: string;
}

/** Constrói o XML `NFe` (sem assinatura) a partir do payload congelado. */
export function buildNfeXml(payload: NfePayload): BuiltNfe {
  if (!payload || typeof payload !== "object") {
    throw new NfeBuildError("NFE_PAYLOAD_INVALID", "payload ausente");
  }
  if (payload.tpAmb !== "2") {
    throw new NfeBuildError("NFE_ENVIRONMENT_BLOCKED", "apenas homologação (tpAmb=2) é permitida");
  }
  const key = digits(payload.accessKey);
  if (key.length !== 44) {
    throw new NfeBuildError("NFE_ACCESS_KEY_INVALID", "chave de acesso deve ter 44 dígitos");
  }
  const infNFeId = `NFe${key}`;

  const inner = [
    buildIde(payload),
    buildEmit(payload),
    buildDest(payload),
    buildDet(payload),
    buildTotal(payload),
    buildTransp(),
    buildPag(payload),
    buildInfAdic(payload),
  ].join("");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<NFe xmlns="${NFE_NAMESPACE}">` +
    `<infNFe Id="${infNFeId}" versao="${NFE_VERSION}">` +
    inner +
    `</infNFe>` +
    `</NFe>`;

  return { xml, infNFeId, accessKey: key };
}
