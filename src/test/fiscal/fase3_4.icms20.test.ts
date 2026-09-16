/**
 * Fase Fiscal 3.4 — Redução da base de cálculo no XML da NF-e.
 *
 * Fixture obrigatória: base 10.000, redução 60%, base tributável 4.000,
 * alíquota 18%, ICMS 720 → grupo ICMS20 com pRedBC=60.00.
 */
import { describe, expect, it } from "vitest";
import {
  buildNfeXml,
  NfeBuildError,
  type NfePayload,
} from "../../../supabase/functions/_shared/fiscal/nfe/buildNfeXml.ts";

function payload(
  itemOverride: Record<string, unknown> = {},
  crt = "3",
): NfePayload {
  return {
    engineVersion: "F3.4",
    schemaVersion: "4.00",
    tpAmb: "2",
    accessKey: "1".repeat(44),
    ide: {
      cUF: "51", cNF: "12345678", natOp: "VENDA", mod: "55", serie: "1",
      nNF: "1", dhEmi: "2026-01-01T10:00:00-04:00", tpNF: "1", idDest: "1",
      cMunFG: "5103403", tpImp: "1", tpEmis: "1", cDV: "0", finNFe: "1",
      indFinal: "0", indPres: "9", procEmi: "0", verProc: "1.0",
    },
    emit: {
      CNPJ: "11222333000181", xNome: "EMITENTE TESTE", CRT: crt,
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
        taxSnapshot: {
          taxes: {
            ICMS: {
              cst: "20", rate: 18, base: 4000, baseOriginal: 10000,
              baseReductionPct: 60, baseReductionSource: "MANUAL", value: 720,
            },
            PIS: { cst: "01", rate: 1.65, base: 4000, value: 66 },
            COFINS: { cst: "01", rate: 7.6, base: 4000, value: 304 },
          },
        },
        ...itemOverride,
      },
    ],
    total: {
      vBC: 4000, vICMS: 720, vProd: 10000, vFrete: 0, vSeg: 0, vDesc: 0,
      vIPI: 0, vPIS: 66, vCOFINS: 304, vOutro: 0, vNF: 10000,
      vFCP: 0, vST: 0, vFCPST: 0,
    },
  };
}

describe("XML NF-e — redução da base de cálculo", () => {
  it("gera ICMS20 com pRedBC na ordem do leiaute", () => {
    const { xml } = buildNfeXml(payload());
    expect(xml).toContain(
      "<ICMS><ICMS20><orig>0</orig><CST>20</CST><modBC>3</modBC>" +
        "<pRedBC>60.0000</pRedBC><vBC>4000.00</vBC>" +
        "<pICMS>18.00</pICMS><vICMS>720.00</vICMS></ICMS20></ICMS>",
    );
    expect(xml).not.toContain("ICMS00");
  });

  it("mantém a alíquota nominal (não converte redução em alíquota menor)", () => {
    const { xml } = buildNfeXml(payload());
    expect(xml).toContain("<pICMS>18.00</pICMS>");
  });

  it("PIS/COFINS usam a base efetiva e não recebem pRedBC", () => {
    const { xml } = buildNfeXml(payload());
    expect(xml).toContain("<PIS><PISAliq><CST>01</CST><vBC>4000.00</vBC>");
    expect(xml).not.toContain("<PISAliq><CST>01</CST><vBC>4000.00</vBC><pRedBC>");
  });

  it("mantém ICMS00 idêntico quando não há redução (regressão)", () => {
    const { xml } = buildNfeXml(
      payload({
        CST: "00",
        taxSnapshot: {
          taxes: {
            ICMS: { cst: "00", rate: 18, base: 10000, baseOriginal: 10000, baseReductionPct: 0, value: 1800 },
            PIS: { cst: "01", rate: 1.65, base: 10000, value: 165 },
            COFINS: { cst: "01", rate: 7.6, base: 10000, value: 760 },
          },
        },
      }),
    );
    expect(xml).toContain(
      "<ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC>" +
        "<vBC>10000.00</vBC><pICMS>18.00</pICMS><vICMS>1800.00</vICMS></ICMS00></ICMS>",
    );
  });

  it("bloqueia redução declarada com CST incompatível", () => {
    expect(() => buildNfeXml(payload({ CST: "00" }))).toThrow(NfeBuildError);
    try {
      buildNfeXml(payload({ CST: "00" }));
    } catch (e) {
      expect((e as NfeBuildError).code).toBe("NFE_ICMS_REDUCTION_INCOMPATIBLE");
    }
  });

  it("bloqueia CST 20 sem percentual de redução", () => {
    try {
      buildNfeXml(
        payload({
          taxSnapshot: {
            taxes: {
              ICMS: { cst: "20", rate: 18, base: 10000, baseReductionPct: 0, value: 1800 },
              PIS: { cst: "01", rate: 1.65, base: 10000, value: 165 },
              COFINS: { cst: "01", rate: 7.6, base: 10000, value: 760 },
            },
          },
        }),
      );
      throw new Error("deveria falhar");
    } catch (e) {
      expect((e as NfeBuildError).code).toBe("NFE_ICMS_REDUCTION_MISSING");
    }
  });

  it("bloqueia CST sem grupo homologado", () => {
    try {
      buildNfeXml(
        payload({
          CST: "60",
          taxSnapshot: {
            taxes: {
              ICMS: { cst: "60", rate: 0, base: 0, baseReductionPct: 0, value: 0 },
              PIS: { cst: "01", rate: 1.65, base: 10000, value: 165 },
              COFINS: { cst: "01", rate: 7.6, base: 10000, value: 760 },
            },
          },
        }),
      );
      throw new Error("deveria falhar");
    } catch (e) {
      expect((e as NfeBuildError).code).toBe("NFE_ICMS_CST_UNSUPPORTED");
    }
  });

  it("bloqueia redução no Simples Nacional", () => {
    try {
      buildNfeXml(payload({ CSOSN: "102" }, "1"));
      throw new Error("deveria falhar");
    } catch (e) {
      expect((e as NfeBuildError).code).toBe("NFE_ICMS_REDUCTION_INCOMPATIBLE");
    }
  });

  it("emite grupo IPI quando o motor apura IPI no item", () => {
    const { xml } = buildNfeXml(
      payload({
        taxSnapshot: {
          taxes: {
            ICMS: { cst: "20", rate: 18, base: 4000, baseReductionPct: 60, value: 720 },
            IPI: { cst: "50", rate: 5, base: 10000, value: 500 },
            PIS: { cst: "01", rate: 1.65, base: 4000, value: 66 },
            COFINS: { cst: "01", rate: 7.6, base: 4000, value: 304 },
          },
        },
      }),
    );
    expect(xml).toContain(
      "<IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>10000.00</vBC>" +
        "<pIPI>5.0000</pIPI><vIPI>500.00</vIPI></IPITrib></IPI>",
    );
    expect(xml.indexOf("<IPI>")).toBeGreaterThan(xml.indexOf("</ICMS>"));
    expect(xml.indexOf("<IPI>")).toBeLessThan(xml.indexOf("<PIS>"));
  });

  it("não emite grupo IPI quando não há IPI apurado", () => {
    const { xml } = buildNfeXml(payload());
    expect(xml).not.toContain("<IPI>");
  });
});
