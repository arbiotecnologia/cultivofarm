/**
 * Fase F4 — Validação estrutural contra a gramática do leiaute NF-e 4.00.
 *
 * Por que gramática compilada e não `xmllint --schema`: o runtime Deno das
 * Edge Functions não expõe libxml2 nem permite baixar/carregar o pacote XSD
 * oficial em tempo de requisição. A gramática abaixo é derivada do XSD
 * oficial (`leiauteNFe_v4.00.xsd` / `nfe_v4.00.xsd`, Portal Nacional da
 * NF-e) e cobre: elemento raiz, namespace, ordem dos filhos, cardinalidade,
 * obrigatoriedade, tipos (N, C, decimais com casas fixas) e facetas de
 * tamanho. A versão do esquema aplicada é rastreada em
 * `public.fiscal_xsd_registry`.
 *
 * O validador é fail-closed: elemento desconhecido, fora de ordem, fora da
 * cardinalidade ou com valor fora da faceta reprova a execução.
 *
 * Módulo puro (sem APIs Deno).
 */

import { NFE_NAMESPACE, NFE_VERSION } from "./buildNfeXml.ts";
import { parseXml, type XmlNode } from "./xmlParse.ts";

export interface FieldRule {
  name: string;
  min: number;
  max: number;
  /** N = numérico inteiro, D2/D4 = decimal com casas fixas, C = caractere. */
  /** R2/R4 = TDec1302RTC / TDec_0302_04RTC (RTC, casas variáveis conforme padrão oficial). */
  type: "N" | "D2" | "D4" | "C" | "R2" | "R4";
  /** Grupo oficial reconhecido na posição correta, mas sem regras internas: presença gera erro explícito. */
  unsupported?: boolean;
  minLen?: number;
  maxLen?: number;
  enum?: string[];
  children?: FieldRule[];
}

const ENDERECO = (name: string): FieldRule => ({
  name, min: 1, max: 1, type: "C",
  children: [
    { name: "xLgr", min: 1, max: 1, type: "C", minLen: 2, maxLen: 60 },
    { name: "nro", min: 1, max: 1, type: "C", minLen: 1, maxLen: 60 },
    { name: "xCpl", min: 0, max: 1, type: "C", minLen: 1, maxLen: 60 },
    { name: "xBairro", min: 1, max: 1, type: "C", minLen: 2, maxLen: 60 },
    { name: "cMun", min: 1, max: 1, type: "N", minLen: 7, maxLen: 7 },
    { name: "xMun", min: 1, max: 1, type: "C", minLen: 2, maxLen: 60 },
    { name: "UF", min: 1, max: 1, type: "C", minLen: 2, maxLen: 2 },
    { name: "CEP", min: 1, max: 1, type: "N", minLen: 8, maxLen: 8 },
    { name: "cPais", min: 0, max: 1, type: "N", minLen: 4, maxLen: 4 },
    { name: "xPais", min: 0, max: 1, type: "C", minLen: 2, maxLen: 60 },
  ],
});

// ——— IBS/CBS (RTC) — PL_010g: TTribNFe (det/imposto/IBSCBS) e TIBSCBSMonoTot (total/IBSCBSTot) ———
const R2 = (name: string, min = 1): FieldRule => ({ name, min, max: 1, type: "R2" });
const R4 = (name: string, min = 1): FieldRule => ({ name, min, max: 1, type: "R4" });
const UNSUP = (name: string): FieldRule => ({ name, min: 0, max: 1, type: "C", unsupported: true });
const G_DIF: FieldRule = { name: "gDif", min: 0, max: 1, type: "C", children: [R4("pDif"), R2("vDif")] };
const G_DEV: FieldRule = { name: "gDevTrib", min: 0, max: 1, type: "C", children: [R4("pDevTrib", 0), R2("vDevTrib")] };
const G_RED: FieldRule = { name: "gRed", min: 0, max: 1, type: "C", children: [R4("pRedAliq"), R4("pAliqEfet")] };
const IBSCBS_RULE: FieldRule = {
  name: "IBSCBS", min: 0, max: 1, type: "C",
  children: [
    { name: "CST", min: 1, max: 1, type: "N", minLen: 3, maxLen: 3 },
    { name: "cClassTrib", min: 1, max: 1, type: "N", minLen: 6, maxLen: 6 },
    { name: "indDoacao", min: 0, max: 1, type: "N", enum: ["1"] },
    // xs:choice (0..1): gIBSCBS | gIBSCBSMono | gTransfCred | gAjusteCompet — checado em validateNfeXml.
    {
      name: "gIBSCBS", min: 0, max: 1, type: "C",
      children: [
        R2("vBC"),
        { name: "gIBSUF", min: 1, max: 1, type: "C", children: [R4("pIBSUF"), G_DIF, G_DEV, G_RED, R2("vIBSUF")] },
        { name: "gIBSMun", min: 1, max: 1, type: "C", children: [R4("pIBSMun"), G_DIF, G_DEV, G_RED, R2("vIBSMun")] },
        R2("vIBS"),
        { name: "gCBS", min: 1, max: 1, type: "C", children: [R4("pCBS"), G_DIF, G_DEV, G_RED, UNSUP("gALCZFMCBS"), R2("vCBS")] },
        UNSUP("gTribRegular"), UNSUP("gTribCompraGov"),
      ],
    },
    UNSUP("gIBSCBSMono"), UNSUP("gTransfCred"), UNSUP("gAjusteCompet"),
    UNSUP("gEstornoCred"), UNSUP("gCredPresOper"), UNSUP("gCredPresIBSZFM"),
  ],
};
const IBSCBS_TOT_RULE: FieldRule = {
  name: "IBSCBSTot", min: 0, max: 1, type: "C",
  children: [
    R2("vBCIBSCBS"),
    {
      name: "gIBS", min: 0, max: 1, type: "C",
      children: [
        { name: "gIBSUF", min: 1, max: 1, type: "C", children: [R2("vDif"), R2("vDevTrib"), R2("vIBSUF")] },
        { name: "gIBSMun", min: 1, max: 1, type: "C", children: [R2("vDif"), R2("vDevTrib"), R2("vIBSMun")] },
        R2("vIBS"), R2("vCredPres"), R2("vCredPresCondSus"),
      ],
    },
    { name: "gCBS", min: 0, max: 1, type: "C", children: [R2("vDif"), R2("vDevTrib"), R2("vCBS"), R2("vCredPres"), R2("vCredPresCondSus")] },
    UNSUP("gMono"), UNSUP("gEstornoCred"),
  ],
};

export const NFE_GRAMMAR: FieldRule = {
  name: "infNFe", min: 1, max: 1, type: "C",
  children: [
    {
      name: "ide", min: 1, max: 1, type: "C",
      children: [
        { name: "cUF", min: 1, max: 1, type: "N", minLen: 2, maxLen: 2 },
        { name: "cNF", min: 1, max: 1, type: "N", minLen: 8, maxLen: 8 },
        { name: "natOp", min: 1, max: 1, type: "C", minLen: 1, maxLen: 60 },
        { name: "mod", min: 1, max: 1, type: "N", enum: ["55"] },
        { name: "serie", min: 1, max: 1, type: "N", minLen: 1, maxLen: 3 },
        { name: "nNF", min: 1, max: 1, type: "N", minLen: 1, maxLen: 9 },
        { name: "dhEmi", min: 1, max: 1, type: "C", minLen: 25, maxLen: 25 },
        { name: "tpNF", min: 1, max: 1, type: "N", enum: ["0", "1"] },
        { name: "idDest", min: 1, max: 1, type: "N", enum: ["1", "2", "3"] },
        { name: "cMunFG", min: 1, max: 1, type: "N", minLen: 7, maxLen: 7 },
        { name: "tpImp", min: 1, max: 1, type: "N", enum: ["0", "1", "2", "3", "4", "5"] },
        { name: "tpEmis", min: 1, max: 1, type: "N", enum: ["1"] },
        { name: "cDV", min: 1, max: 1, type: "N", minLen: 1, maxLen: 1 },
        { name: "tpAmb", min: 1, max: 1, type: "N", enum: ["2"] },
        { name: "finNFe", min: 1, max: 1, type: "N", enum: ["1", "2", "3", "4"] },
        { name: "indFinal", min: 1, max: 1, type: "N", enum: ["0", "1"] },
        { name: "indPres", min: 1, max: 1, type: "N", enum: ["0", "1", "2", "3", "4", "5", "9"] },
        { name: "procEmi", min: 1, max: 1, type: "N", enum: ["0", "1", "2", "3"] },
        { name: "verProc", min: 1, max: 1, type: "C", minLen: 1, maxLen: 20 },
      ],
    },
    {
      name: "emit", min: 1, max: 1, type: "C",
      children: [
        { name: "CNPJ", min: 1, max: 1, type: "N", minLen: 14, maxLen: 14 },
        { name: "xNome", min: 1, max: 1, type: "C", minLen: 2, maxLen: 60 },
        { name: "xFant", min: 0, max: 1, type: "C", minLen: 1, maxLen: 60 },
        ENDERECO("enderEmit"),
        { name: "IE", min: 1, max: 1, type: "C", minLen: 2, maxLen: 14 },
        { name: "CNAE", min: 0, max: 1, type: "N", minLen: 7, maxLen: 7 },
        { name: "CRT", min: 1, max: 1, type: "N", enum: ["1", "2", "3", "4"] },
      ],
    },
    {
      name: "dest", min: 1, max: 1, type: "C",
      children: [
        { name: "CNPJ", min: 0, max: 1, type: "N", minLen: 14, maxLen: 14 },
        { name: "CPF", min: 0, max: 1, type: "N", minLen: 11, maxLen: 11 },
        { name: "xNome", min: 1, max: 1, type: "C", minLen: 2, maxLen: 60 },
        ENDERECO("enderDest"),
        { name: "indIEDest", min: 1, max: 1, type: "N", enum: ["1", "2", "9"] },
        { name: "IE", min: 0, max: 1, type: "C", minLen: 2, maxLen: 14 },
      ],
    },
    {
      name: "det", min: 1, max: 990, type: "C",
      children: [
        {
          name: "prod", min: 1, max: 1, type: "C",
          children: [
            { name: "cProd", min: 1, max: 1, type: "C", minLen: 1, maxLen: 60 },
            { name: "cEAN", min: 1, max: 1, type: "C", minLen: 1, maxLen: 14 },
            { name: "xProd", min: 1, max: 1, type: "C", minLen: 1, maxLen: 120 },
            { name: "NCM", min: 1, max: 1, type: "N", minLen: 8, maxLen: 8 },
            { name: "CEST", min: 0, max: 1, type: "N", minLen: 7, maxLen: 7 },
            { name: "CFOP", min: 1, max: 1, type: "N", minLen: 4, maxLen: 4 },
            { name: "uCom", min: 1, max: 1, type: "C", minLen: 1, maxLen: 6 },
            { name: "qCom", min: 1, max: 1, type: "D4" },
            { name: "vUnCom", min: 1, max: 1, type: "D4" },
            { name: "vProd", min: 1, max: 1, type: "D2" },
            { name: "cEANTrib", min: 1, max: 1, type: "C", minLen: 1, maxLen: 14 },
            { name: "uTrib", min: 1, max: 1, type: "C", minLen: 1, maxLen: 6 },
            { name: "qTrib", min: 1, max: 1, type: "D4" },
            { name: "vUnTrib", min: 1, max: 1, type: "D4" },
            { name: "vFrete", min: 0, max: 1, type: "D2" },
            { name: "vSeg", min: 0, max: 1, type: "D2" },
            { name: "vDesc", min: 0, max: 1, type: "D2" },
            { name: "vOutro", min: 0, max: 1, type: "D2" },
            { name: "indTot", min: 1, max: 1, type: "N", enum: ["0", "1"] },
          ],
        },
        {
          name: "imposto", min: 1, max: 1, type: "C",
          children: [
            {
              name: "ICMS", min: 1, max: 1, type: "C",
              children: [
                {
                  name: "ICMS00", min: 0, max: 1, type: "C",
                  children: [
                    { name: "orig", min: 1, max: 1, type: "N", minLen: 1, maxLen: 1 },
                    { name: "CST", min: 1, max: 1, type: "N", minLen: 2, maxLen: 2 },
                    { name: "modBC", min: 1, max: 1, type: "N", enum: ["0", "1", "2", "3"] },
                    { name: "vBC", min: 1, max: 1, type: "D2" },
                    { name: "pICMS", min: 1, max: 1, type: "D2" },
                    { name: "vICMS", min: 1, max: 1, type: "D2" },
                  ],
                },
                {
                  name: "ICMS20", min: 0, max: 1, type: "C",
                  children: [
                    { name: "orig", min: 1, max: 1, type: "N", minLen: 1, maxLen: 1 },
                    { name: "CST", min: 1, max: 1, type: "N", enum: ["20"] },
                    { name: "modBC", min: 1, max: 1, type: "N", enum: ["0", "1", "2", "3"] },
                    { name: "pRedBC", min: 1, max: 1, type: "D4" },
                    { name: "vBC", min: 1, max: 1, type: "D2" },
                    { name: "pICMS", min: 1, max: 1, type: "D2" },
                    { name: "vICMS", min: 1, max: 1, type: "D2" },
                  ],
                },
                {
                  name: "ICMS40", min: 0, max: 1, type: "C",
                  children: [
                    { name: "orig", min: 1, max: 1, type: "N", minLen: 1, maxLen: 1 },
                    { name: "CST", min: 1, max: 1, type: "N", enum: ["40", "41", "50"] },
                  ],
                },
                {
                  name: "ICMSSN101", min: 0, max: 1, type: "C",
                  children: [
                    { name: "orig", min: 1, max: 1, type: "N", minLen: 1, maxLen: 1 },
                    { name: "CSOSN", min: 1, max: 1, type: "N", enum: ["101"] },
                    { name: "pCredSN", min: 1, max: 1, type: "D4" },
                    { name: "vCredICMSSN", min: 1, max: 1, type: "D2" },
                  ],
                },
                {
                  name: "ICMSSN102", min: 0, max: 1, type: "C",
                  children: [
                    { name: "orig", min: 1, max: 1, type: "N", minLen: 1, maxLen: 1 },
                    { name: "CSOSN", min: 1, max: 1, type: "N", minLen: 3, maxLen: 3 },
                  ],
                },
              ],
            },
            {
              name: "IPI", min: 0, max: 1, type: "C",
              children: [
                { name: "cEnq", min: 1, max: 1, type: "C", minLen: 1, maxLen: 3 },
                {
                  name: "IPITrib", min: 0, max: 1, type: "C",
                  children: [
                    { name: "CST", min: 1, max: 1, type: "N", minLen: 2, maxLen: 2 },
                    { name: "vBC", min: 1, max: 1, type: "D2" },
                    { name: "pIPI", min: 1, max: 1, type: "D4" },
                    { name: "vIPI", min: 1, max: 1, type: "D2" },
                  ],
                },
                {
                  name: "IPINT", min: 0, max: 1, type: "C",
                  children: [
                    { name: "CST", min: 1, max: 1, type: "N", minLen: 2, maxLen: 2 },
                  ],
                },
              ],
            },

            {
              name: "PIS", min: 1, max: 1, type: "C",
              children: [
                {
                  name: "PISAliq", min: 0, max: 1, type: "C",
                  children: [
                    { name: "CST", min: 1, max: 1, type: "N", minLen: 2, maxLen: 2 },
                    { name: "vBC", min: 1, max: 1, type: "D2" },
                    { name: "pPIS", min: 1, max: 1, type: "D2" },
                    { name: "vPIS", min: 1, max: 1, type: "D2" },
                  ],
                },
                // Fase C6 — CST nao tributado usa o grupo PISNT.
                {
                  name: "PISNT", min: 0, max: 1, type: "C",
                  children: [
                    { name: "CST", min: 1, max: 1, type: "N", minLen: 2, maxLen: 2 },
                  ],
                },
              ],
            },
            {
              name: "COFINS", min: 1, max: 1, type: "C",
              children: [
                {
                  name: "COFINSAliq", min: 0, max: 1, type: "C",
                  children: [
                    { name: "CST", min: 1, max: 1, type: "N", minLen: 2, maxLen: 2 },
                    { name: "vBC", min: 1, max: 1, type: "D2" },
                    { name: "pCOFINS", min: 1, max: 1, type: "D2" },
                    { name: "vCOFINS", min: 1, max: 1, type: "D2" },
                  ],
                },
                // Fase C6 — CST nao tributado usa o grupo COFINSNT.
                {
                  name: "COFINSNT", min: 0, max: 1, type: "C",
                  children: [
                    { name: "CST", min: 1, max: 1, type: "N", minLen: 2, maxLen: 2 },
                  ],
                },
              ],
            },
            // Ordem oficial após COFINS: COFINSST?, ICMSUFDest?, IS?, IBSCBS?
            UNSUP("COFINSST"), UNSUP("ICMSUFDest"), UNSUP("IS"),
            IBSCBS_RULE,
          ],
        },
      ],
    },
    {
      name: "total", min: 1, max: 1, type: "C",
      children: [
        {
          name: "ICMSTot", min: 1, max: 1, type: "C",
          children: [
            "vBC", "vICMS", "vICMSDeson", "vFCP", "vBCST", "vST", "vFCPST", "vFCPSTRet",
            "vProd", "vFrete", "vSeg", "vDesc", "vII", "vIPI", "vIPIDevol", "vPIS",
            "vCOFINS", "vOutro", "vNF",
          ].map((n): FieldRule => ({ name: n, min: 1, max: 1, type: "D2" })),
        },
        // Ordem oficial: ICMSTot, ISSQNtot?, retTrib?, ISTot?, IBSCBSTot?
        UNSUP("ISSQNtot"), UNSUP("retTrib"), UNSUP("ISTot"),
        IBSCBS_TOT_RULE,
      ],
    },
    {
      name: "transp", min: 1, max: 1, type: "C",
      children: [
        { name: "modFrete", min: 1, max: 1, type: "N", enum: ["0", "1", "2", "3", "4", "9"] },
      ],
    },
    {
      name: "pag", min: 1, max: 1, type: "C",
      children: [
        {
          name: "detPag", min: 1, max: 100, type: "C",
          children: [
            { name: "indPag", min: 0, max: 1, type: "N", enum: ["0", "1"] },
            { name: "tPag", min: 1, max: 1, type: "N", minLen: 2, maxLen: 2 },
            { name: "vPag", min: 1, max: 1, type: "D2" },
          ],
        },
      ],
    },
    {
      name: "infAdic", min: 0, max: 1, type: "C",
      children: [
        { name: "infCpl", min: 0, max: 1, type: "C", minLen: 1, maxLen: 5000 },
      ],
    },
  ],
};

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  schemaName: string;
  schemaVersion: string;
  namespace: string;
  issues: ValidationIssue[];
  elementCount: number;
}

function validateValue(rule: FieldRule, node: XmlNode, path: string, issues: ValidationIssue[]): void {
  const value = node.text;
  if (rule.enum && !rule.enum.includes(value)) {
    issues.push({ path, code: "XSD_ENUM", message: `valor "${value}" fora do domínio permitido` });
    return;
  }
  if (rule.type === "N") {
    if (!/^\d+$/.test(value)) {
      issues.push({ path, code: "XSD_TYPE_N", message: "esperado inteiro numérico" });
      return;
    }
  } else if (rule.type === "R2" || rule.type === "R4") {
    // Padrões oficiais TDec1302RTC / TDec_0302_04RTC (PL_010g).
    const re = rule.type === "R2" ? /^(0|0\.[0-9]{2}|[1-9][0-9]{0,12}(\.[0-9]{2})?)$/ : /^(0|0\.[0-9]{2,4}|[1-9][0-9]{0,2}(\.[0-9]{2,4})?)$/;
    if (!re.test(value)) {
      issues.push({ path, code: `XSD_TYPE_${rule.type}`, message: "decimal fora do padrão RTC oficial" });
      return;
    }
  } else if (rule.type === "D2" || rule.type === "D4") {
    const places = rule.type === "D2" ? 2 : 4;
    const re = new RegExp(`^-?\\d{1,15}\\.\\d{${places}}$`);
    if (!re.test(value)) {
      issues.push({ path, code: `XSD_TYPE_${rule.type}`, message: `esperado decimal com ${places} casas` });
      return;
    }
  }
  if (rule.minLen !== undefined && value.length < rule.minLen) {
    issues.push({ path, code: "XSD_MINLEN", message: `tamanho mínimo ${rule.minLen}` });
  }
  if (rule.maxLen !== undefined && value.length > rule.maxLen) {
    issues.push({ path, code: "XSD_MAXLEN", message: `tamanho máximo ${rule.maxLen}` });
  }
}

function validateNode(rules: FieldRule[], node: XmlNode, path: string, issues: ValidationIssue[]): number {
  let count = 1;
  const allowed = new Set(rules.map((r) => r.name));
  for (const child of node.children) {
    if (!allowed.has(child.name)) {
      issues.push({
        path: `${path}/${child.name}`,
        code: "XSD_UNEXPECTED_ELEMENT",
        message: "elemento não previsto no leiaute",
      });
    }
  }

  // Ordem: a sequência observada deve ser subsequência da sequência do XSD.
  let cursor = 0;
  for (const child of node.children) {
    const idx = rules.findIndex((r, i) => i >= cursor && r.name === child.name);
    if (idx < 0) {
      const known = rules.findIndex((r) => r.name === child.name);
      if (known >= 0) {
        issues.push({
          path: `${path}/${child.name}`,
          code: "XSD_ORDER",
          message: "elemento fora da ordem definida pelo leiaute",
        });
      }
      continue;
    }
    cursor = idx;
  }

  for (const rule of rules) {
    const found = node.children.filter((c) => c.name === rule.name);
    if (found.length < rule.min) {
      issues.push({
        path: `${path}/${rule.name}`,
        code: "XSD_MIN_OCCURS",
        message: `ocorrência mínima ${rule.min}`,
      });
    }
    if (found.length > rule.max) {
      issues.push({
        path: `${path}/${rule.name}`,
        code: "XSD_MAX_OCCURS",
        message: `ocorrência máxima ${rule.max}`,
      });
    }
    found.forEach((child, i) => {
      const childPath = rule.max > 1 ? `${path}/${rule.name}[${i + 1}]` : `${path}/${rule.name}`;
      if (rule.unsupported) {
        issues.push({ path: childPath, code: "XSD_GROUP_NOT_COVERED", message: "grupo oficial não coberto pelo validador interno; validar no XSD oficial" });
        return;
      }
      if (rule.children && rule.children.length > 0) {
        count += validateNode(rule.children, child, childPath, issues);
      } else {
        count += 1;
        if (child.children.length > 0) {
          issues.push({ path: childPath, code: "XSD_SIMPLE_TYPE", message: "elemento simples com filhos" });
        }
        validateValue(rule, child, childPath, issues);
      }
    });
  }
  return count;
}

/** Valida o XML da NF-e contra a gramática derivada do XSD oficial 4.00. */
export function validateNfeXml(xml: string, schemaVersion = NFE_VERSION): ValidationReport {
  const issues: ValidationIssue[] = [];
  let elementCount = 0;
  const report = (valid: boolean): ValidationReport => ({
    valid,
    schemaName: "nfe_v4.00",
    schemaVersion,
    namespace: NFE_NAMESPACE,
    issues,
    elementCount,
  });

  let root: XmlNode;
  try {
    root = parseXml(xml);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    issues.push({ path: "/", code: e.code ?? "XML_PARSE_ERROR", message: e.message ?? "XML inválido" });
    return report(false);
  }

  if (root.name !== "NFe") {
    issues.push({ path: "/", code: "XSD_ROOT", message: `elemento raiz esperado NFe, obtido ${root.name}` });
    return report(false);
  }
  if (root.attrs.xmlns !== NFE_NAMESPACE) {
    issues.push({ path: "/NFe", code: "XSD_NAMESPACE", message: "namespace do Portal Fiscal ausente ou incorreto" });
  }

  const inf = root.children.filter((c) => c.name === "infNFe");
  if (inf.length !== 1) {
    issues.push({ path: "/NFe/infNFe", code: "XSD_MIN_OCCURS", message: "exatamente um infNFe é exigido" });
    return report(false);
  }
  const infNFe = inf[0];
  if (infNFe.attrs.versao !== NFE_VERSION) {
    issues.push({ path: "/NFe/infNFe@versao", code: "XSD_ATTR", message: `versao deve ser ${NFE_VERSION}` });
  }
  if (!/^NFe\d{44}$/.test(infNFe.attrs.Id ?? "")) {
    issues.push({ path: "/NFe/infNFe@Id", code: "XSD_ATTR", message: "Id deve ser NFe + 44 dígitos" });
  }
  for (const extra of root.children.filter((c) => c.name !== "infNFe" && c.name !== "Signature")) {
    issues.push({ path: `/NFe/${extra.name}`, code: "XSD_UNEXPECTED_ELEMENT", message: "elemento não previsto" });
  }

  elementCount = validateNode(NFE_GRAMMAR.children ?? [], infNFe, "/NFe/infNFe", issues);

  // Regras de escolha (xs:choice) que a gramática tabular não expressa.
  for (const det of infNFe.children.filter((c) => c.name === "det")) {
    const nItem = det.attrs.nItem;
    if (!/^\d{1,3}$/.test(nItem ?? "")) {
      issues.push({ path: "/NFe/infNFe/det@nItem", code: "XSD_ATTR", message: "nItem obrigatório (1..990)" });
    }
    const icms = det.children.find((c) => c.name === "imposto")?.children.find((c) => c.name === "ICMS");
    const groups = icms?.children.length ?? 0;
    if (groups !== 1) {
      issues.push({
        path: `/NFe/infNFe/det[${nItem}]/imposto/ICMS`,
        code: "XSD_CHOICE",
        message: "exatamente um grupo de tributação ICMS é exigido",
      });
    }
  }
  for (const det of infNFe.children.filter((c) => c.name === "det")) {
    const ibs = det.children.find((c) => c.name === "imposto")?.children.find((c) => c.name === "IBSCBS");
    if (!ibs) continue;
    const choice = ibs.children.filter((c) => ["gIBSCBS", "gIBSCBSMono", "gTransfCred", "gAjusteCompet"].includes(c.name)).length;
    const cred = ibs.children.filter((c) => ["gCredPresOper", "gCredPresIBSZFM"].includes(c.name)).length;
    if (choice > 1 || cred > 1) {
      issues.push({ path: `/NFe/infNFe/det[${det.attrs.nItem}]/imposto/IBSCBS`, code: "XSD_CHOICE", message: "no máximo um grupo de cada escolha IBS/CBS" });
    }
  }
  const dest = infNFe.children.find((c) => c.name === "dest");
  if (dest) {
    const docs = dest.children.filter((c) => c.name === "CNPJ" || c.name === "CPF").length;
    if (docs !== 1) {
      issues.push({ path: "/NFe/infNFe/dest", code: "XSD_CHOICE", message: "informe exatamente CNPJ ou CPF" });
    }
  }

  return report(issues.length === 0);
}

/**
 * Documento COMPLETO: além do infNFe, o leiaute exige ds:Signature (TNFe). Sem assinatura o
 * documento é inválido — a prévia não assinada nunca passa aqui.
 */
export function validateNfeDocument(xml: string, schemaVersion = NFE_VERSION): ValidationReport {
  const rep = validateNfeXml(xml, schemaVersion);
  let signed = false;
  try { signed = parseXml(xml).children.filter((c) => c.name === "Signature").length === 1; } catch { /* erro já reportado */ }
  if (!signed) rep.issues.push({ path: "/NFe/Signature", code: "XSD_SIGNATURE_MISSING", message: "assinatura digital (Signature) obrigatória no documento completo" });
  return { ...rep, valid: rep.issues.length === 0 };
}
