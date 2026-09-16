/**
 * Fase Fiscal 8 — Validação do XML gerado contra o XSD OFICIAL da NF-e 4.00.
 *
 * Usa `xmllint --schema` com os arquivos oficiais versionados em
 * `supabase/functions/fiscal-xml-engine/xsd/`. Uma assinatura sintética
 * estruturalmente válida é anexada apenas para satisfazer a cardinalidade
 * de `ds:Signature` em `TNFe` (o XML de preparação ainda não é assinado).
 *
 * Fixture obrigatória: base 10.000, redução 60%, base tributável 4.000,
 * alíquota 18%, ICMS 720 → grupo ICMS20 com pRedBC.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildNfeXml,
  type NfePayload,
} from "../../../supabase/functions/_shared/fiscal/nfe/buildNfeXml.ts";

const XSD = "supabase/functions/fiscal-xml-engine/xsd/nfe_v4.00.xsd";

const SIGNATURE_STUB = [
  '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo>',
  '<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
  '<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>',
  '<Reference URI="#NFe' + "1".repeat(44) + '"><Transforms>',
  '<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>',
  '<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
  "</Transforms>",
  '<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>',
  "<DigestValue>YWFhYQ==</DigestValue></Reference></SignedInfo>",
  "<SignatureValue>YWFhYQ==</SignatureValue>",
  "<KeyInfo><X509Data><X509Certificate>YWFhYQ==</X509Certificate></X509Data></KeyInfo>",
  "</Signature>",
].join("");

function payload(taxes: Record<string, unknown>, itemOverride: Record<string, unknown> = {}): NfePayload {
  return {
    engineVersion: "F3.4",
    schemaVersion: "4.00",
    tpAmb: "2",
    accessKey: "1".repeat(44),
    ide: {
      cUF: "51", cNF: "12345678", natOp: "VENDA", mod: "55", serie: "1",
      nNF: "1", dhEmi: "2026-01-05", tpNF: "1", idDest: "1",
      cMunFG: "5103403", tpImp: "1", tpEmis: "1", cDV: "0", finNFe: "1",
      indFinal: "0", indPres: "9", procEmi: "0", verProc: "1.0",
    },
    emit: {
      CNPJ: "11222333000181", xNome: "EMITENTE TESTE", CRT: "3",
      enderEmit: {
        xLgr: "RUA A", nro: "1", xBairro: "CENTRO", cMun: "5103403",
        xMun: "CUIABA", UF: "MT", CEP: "78000000",
      },
      IE: "1234567890",
    },
    dest: {
      doc: "11222333000181", xNome: "DESTINO", indIEDest: "9",
      enderDest: {
        xLgr: "RUA B", nro: "2", xBairro: "CENTRO", cMun: "5103403",
        xMun: "CUIABA", UF: "MT", CEP: "78000000",
      },
    },
    det: [
      {
        nItem: 1, cProd: "P1", xProd: "PRODUTO 1", NCM: "12345678",
        CFOP: "5102", uCom: "UN", qCom: 1, vUnCom: 10000, vProd: 10000,
        orig: "0", CST: "20",
        taxSnapshot: { taxes },
        ...itemOverride,
      },
    ],
    total: {
      vBC: 4000, vICMS: 720, vProd: 10000, vFrete: 0, vSeg: 0, vDesc: 0,
      vIPI: 0, vPIS: 66, vCOFINS: 304, vOutro: 0, vNF: 10000,
      vFCP: 0, vST: 0, vFCPST: 0,
    },
  } as NfePayload;
}

const ICMS20_TAXES = {
  ICMS: {
    cst: "20", rate: 18, base: 4000, baseOriginal: 10000,
    baseReductionPct: 60, baseReductionSource: "MANUAL", value: 720,
  },
  PIS: { cst: "01", rate: 1.65, base: 4000, value: 66 },
  COFINS: { cst: "01", rate: 7.6, base: 4000, value: 304 },
};

function validate(xml: string): { ok: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "nfe-xsd-"));
  const file = join(dir, "nfe.xml");
  writeFileSync(file, xml.replace("</NFe>", `${SIGNATURE_STUB}</NFe>`));
  try {
    execFileSync("xmllint", ["--noout", "--schema", XSD, file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output: "" };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string };
    return { ok: false, output: String(e.stderr ?? e.stdout ?? err) };
  }
}

describe("Fase 8 — XML com redução da base valida contra o XSD oficial", () => {
  it("ICMS20 com pRedBC passa na validação oficial", () => {
    const { xml } = buildNfeXml(payload(ICMS20_TAXES));
    expect(xml).toContain("<pRedBC>60.0000</pRedBC>");
    const res = validate(xml);
    expect(res.output).toBe("");
    expect(res.ok).toBe(true);
  });

  it("ICMS20 com IPI apurado passa na validação oficial", () => {
    const { xml } = buildNfeXml(
      payload({
        ...ICMS20_TAXES,
        IPI: { cst: "50", rate: 5, base: 10000, value: 500, cEnq: "999" },
      }),
    );
    expect(xml).toContain("<IPITrib>");
    const res = validate(xml);
    expect(res.output).toBe("");
    expect(res.ok).toBe(true);
  });

  it("NF-e sem redução (ICMS00) mantém validação oficial", () => {
    const { xml } = buildNfeXml(
      payload(
        {
          ICMS: { cst: "00", rate: 18, base: 10000, baseOriginal: 10000, baseReductionPct: 0, value: 1800 },
          PIS: { cst: "01", rate: 1.65, base: 10000, value: 165 },
          COFINS: { cst: "01", rate: 7.6, base: 10000, value: 760 },
        },
        { CST: "00" },
      ),
    );
    expect(xml).toContain("<ICMS00>");
    const res = validate(xml);
    expect(res.output).toBe("");
    expect(res.ok).toBe(true);
  });
});
