/**
 * Fase F4 — Testes do motor de XML da NF-e 4.00.
 *
 * Cobrem: construção determinística, facetas do leiaute, gramática XSD
 * (ordem, cardinalidade, tipos), teto de ambiente (tpAmb=2) e o parser
 * fail-closed contra XXE/entity expansion.
 */
import { describe, expect, it } from "vitest";
import {
  buildNfeXml,
  dec,
  sanitizeText,
  type NfePayload,
} from "../../../supabase/functions/_shared/fiscal/nfe/buildNfeXml";
import { validateNfeXml } from "../../../supabase/functions/_shared/fiscal/nfe/validateNfeXml";
import { parseXml, XmlParseError } from "../../../supabase/functions/_shared/fiscal/nfe/xmlParse";

const ACCESS_KEY = "35240800000000000191550010000000011000000017";

function payload(overrides: Partial<NfePayload> = {}): NfePayload {
  return {
    engineVersion: "F4.1",
    schemaVersion: "4.00",
    tpAmb: "2",
    accessKey: ACCESS_KEY,
    ide: {
      cUF: "35", cNF: "00000001", natOp: "VENDA DE MERCADORIA", mod: "55",
      serie: 1, nNF: 1, dhEmi: "2026-08-22", tpNF: "1", idDest: "1",
      cMunFG: "3550308", tpImp: "1", tpEmis: "1", cDV: "7", finNFe: "1",
      indFinal: "1", indPres: "9", procEmi: "0", verProc: "ARBIO-F4.1",
    },
    emit: {
      CNPJ: "00000000000191", xNome: "AR BIO LTDA", xFant: "AR BIO", IE: "123456789",
      CRT: "3", CNAE: "2029100",
      enderEmit: {
        xLgr: "RUA DAS BIOFABRICAS", nro: "100", xBairro: "CENTRO",
        cMun: "3550308", xMun: "SAO PAULO", UF: "SP", CEP: "01001000",
        cPais: "1058", xPais: "BRASIL",
      },
    },
    dest: {
      personType: "PJ", doc: "11222333000181", xNome: "CLIENTE TESTE",
      indIEDest: "1", IE: "987654321",
      enderDest: {
        xLgr: "AVENIDA RURAL", nro: "50", xBairro: "ZONA RURAL",
        cMun: "3550308", xMun: "SAO PAULO", UF: "SP", CEP: "01002000",
        cPais: "1058", xPais: "BRASIL",
      },
    },
    det: [
      {
        nItem: 1, cProd: "PROD-1", xProd: "BIOINSUMO A", NCM: "38089999",
        CFOP: "5101", uCom: "L", qCom: 10, vUnCom: 25, vProd: 250,
        vDesc: 0, vFrete: 0, vSeg: 0, vOutro: 0, orig: "0", CST: "00",
        taxSnapshot: {
          taxes: {
            ICMS: { baseValue: 250, rate: 18, value: 45, cst: "00" },
            PIS: { baseValue: 250, rate: 1.65, value: 4.13, cst: "01" },
            COFINS: { baseValue: 250, rate: 7.6, value: 19, cst: "01" },
          },
        },
      },
    ],
    total: {
      vProd: 250, vDesc: 0, vFrete: 0, vSeg: 0, vOutro: 0, vICMS: 45,
      vST: 0, vFCP: 0, vFCPST: 0, vPIS: 4.13, vCOFINS: 19, vIPI: 0, vNF: 250,
    },
    infAdic: { infCpl: "AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" },
    ...overrides,
  };
}

describe("dec / sanitizeText", () => {
  it("arredonda HALF_UP com casas fixas", () => {
    expect(dec(2.345, 2)).toBe("2.35");
    expect(dec(10, 4)).toBe("10.0000");
    expect(dec("0.1", 2)).toBe("0.10");
  });

  it("remove controle e colapsa espaços, respeitando o tamanho máximo", () => {
    expect(sanitizeText("  A\u0000B   C  ", 60)).toBe("A B C");
    expect(sanitizeText("X".repeat(80), 60)).toHaveLength(60);
  });
});

describe("buildNfeXml", () => {
  it("gera XML determinístico e válido na gramática 4.00", () => {
    const a = buildNfeXml(payload());
    const b = buildNfeXml(payload());
    expect(a.xml).toBe(b.xml);
    expect(a.infNFeId).toBe(`NFe${ACCESS_KEY}`);

    const report = validateNfeXml(a.xml);
    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.schemaVersion).toBe("4.00");
  });

  it("força a razão social de homologação no destinatário", () => {
    const { xml } = buildNfeXml(payload());
    expect(xml).toContain("NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL");
    expect(xml).not.toContain("CLIENTE TESTE");
  });

  it("bloqueia tpAmb de produção", () => {
    expect(() => buildNfeXml(payload({ tpAmb: "1" })))
      .toThrowError(/NFE_ENVIRONMENT_BLOCKED|homologação/);
  });

  it("recusa chave de acesso fora de 44 dígitos", () => {
    expect(() => buildNfeXml(payload({ accessKey: "123" }))).toThrowError(/44 dígitos/);
  });

  it("recusa NCM e CFOP inválidos", () => {
    const bad = payload();
    bad.det[0].NCM = "123";
    expect(() => buildNfeXml(bad)).toThrowError(/NCM inválido/);

    const bad2 = payload();
    bad2.det[0].CFOP = "51";
    expect(() => buildNfeXml(bad2)).toThrowError(/CFOP inválido/);
  });

  it("usa CSOSN para Simples Nacional (CRT 1)", () => {
    const p = payload();
    (p.emit as Record<string, unknown>).CRT = "1";
    p.det[0].CSOSN = "102";
    const { xml } = buildNfeXml(p);
    expect(xml).toContain("<ICMSSN102>");
    expect(xml).not.toContain("<ICMS00>");
    expect(validateNfeXml(xml).valid).toBe(true);
  });

  it("CRT 2 (excesso de sublimite) usa grupo normal CST, não CSOSN", () => {
    const p = payload();
    (p.emit as Record<string, unknown>).CRT = "2";
    const { xml } = buildNfeXml(p);
    expect(xml).toContain("<ICMS00>");
    expect(xml).not.toContain("<ICMSSN");
    expect(validateNfeXml(xml).valid).toBe(true);
  });

  it("CRT 4 (MEI) usa CSOSN", () => {
    const p = payload();
    (p.emit as Record<string, unknown>).CRT = "4";
    p.det[0].CSOSN = "102";
    const { xml } = buildNfeXml(p);
    expect(xml).toContain("<ICMSSN102>");
  });

  it("emite CPF quando o destinatário é pessoa física", () => {
    const p = payload();
    (p.dest as Record<string, unknown>).doc = "12345678909";
    (p.dest as Record<string, unknown>).indIEDest = "9";
    const { xml } = buildNfeXml(p);
    expect(xml).toContain("<CPF>12345678909</CPF>");
    expect(validateNfeXml(xml).valid).toBe(true);
  });

  it("escapa caracteres especiais no texto", () => {
    const p = payload();
    p.det[0].xProd = "BIO & CIA <TESTE>";
    const { xml } = buildNfeXml(p);
    expect(xml).toContain("BIO &amp; CIA &lt;TESTE&gt;");
  });
});

describe("Fase C6 — PIS/COFINS por CST e modalidade da base", () => {
  function comTributos(taxes: Record<string, unknown>) {
    const base = payload();
    const det = [{ ...base.det[0], taxSnapshot: { taxes } }];
    return { ...base, det } as NfePayload;
  }

  it("CST de alíquota continua gerando PISAliq/COFINSAliq válidos no XSD", () => {
    const { xml } = buildNfeXml(payload());
    expect(xml).toContain("<PISAliq>");
    expect(xml).toContain("<COFINSAliq>");
    expect(validateNfeXml(xml).valid).toBe(true);
  });

  it("CST não tributado usa PISNT/COFINSNT e permanece válido no XSD", () => {
    const { xml } = buildNfeXml(
      comTributos({
        ICMS: { baseValue: 250, rate: 18, value: 45, cst: "00" },
        PIS: { cst: "07", value: 0 },
        COFINS: { cst: "07", value: 0 },
      }),
    );
    expect(xml).toContain("<PISNT><CST>07</CST></PISNT>");
    expect(xml).toContain("<COFINSNT><CST>07</CST></COFINSNT>");
    expect(xml).not.toContain("<PISAliq>");
    expect(validateNfeXml(xml).valid).toBe(true);
  });

  it("CST sem grupo homologado bloqueia a geração (fail-closed)", () => {
    expect(() =>
      buildNfeXml(
        comTributos({
          ICMS: { baseValue: 250, rate: 18, value: 45, cst: "00" },
          PIS: { cst: "03", value: 4.13, rate: 1.65, baseValue: 250 },
          COFINS: { cst: "01", value: 19, rate: 7.6, baseValue: 250 },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "NFE_PIS_CST_UNSUPPORTED" }));
  });

  it("CST não tributado com valor apurado bloqueia a geração", () => {
    expect(() =>
      buildNfeXml(
        comTributos({
          ICMS: { baseValue: 250, rate: 18, value: 45, cst: "00" },
          PIS: { cst: "07", value: 4.13 },
          COFINS: { cst: "01", value: 19, rate: 7.6, baseValue: 250 },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "NFE_PIS_NT_WITH_VALUE" }));
  });

  it("PIS sem CST no snapshot bloqueia a geração", () => {
    expect(() =>
      buildNfeXml(
        comTributos({
          ICMS: { baseValue: 250, rate: 18, value: 45, cst: "00" },
          PIS: { value: 0 },
          COFINS: { cst: "01", value: 19, rate: 7.6, baseValue: 250 },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "NFE_PIS_CST_MISSING" }));
  });

  it("modalidade de base diferente do valor da operação bloqueia a geração", () => {
    expect(() =>
      buildNfeXml(
        comTributos({
          ICMS: { baseValue: 250, rate: 18, value: 45, cst: "00", baseModality: "0" },
          PIS: { cst: "01", value: 4.13, rate: 1.65, baseValue: 250 },
          COFINS: { cst: "01", value: 19, rate: 7.6, baseValue: 250 },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "NFE_ICMS_MODBC_UNSUPPORTED" }));
  });
});

describe("validateNfeXml", () => {
  it("reprova namespace ausente", () => {
    const { xml } = buildNfeXml(payload());
    const broken = xml.replace(' xmlns="http://www.portalfiscal.inf.br/nfe"', "");
    const report = validateNfeXml(broken);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "XSD_NAMESPACE")).toBe(true);
  });

  it("reprova elemento fora de ordem", () => {
    const { xml } = buildNfeXml(payload());
    const broken = xml
      .replace(/<ide>.*?<\/ide>/, "")
      .replace("</infNFe>", `${xml.match(/<ide>.*?<\/ide>/)![0]}</infNFe>`);
    const report = validateNfeXml(broken);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "XSD_ORDER")).toBe(true);
  });

  it("reprova elemento desconhecido", () => {
    const { xml } = buildNfeXml(payload());
    const report = validateNfeXml(xml.replace("</infNFe>", "<xInvalido>1</xInvalido></infNFe>"));
    expect(report.issues.some((i) => i.code === "XSD_UNEXPECTED_ELEMENT")).toBe(true);
  });

  it("reprova decimal com casas erradas", () => {
    const { xml } = buildNfeXml(payload());
    const report = validateNfeXml(xml.replace("<vNF>250.00</vNF>", "<vNF>250.0</vNF>"));
    expect(report.issues.some((i) => i.code === "XSD_TYPE_D2")).toBe(true);
  });

  it("reprova tpAmb de produção também na validação", () => {
    const { xml } = buildNfeXml(payload());
    const report = validateNfeXml(xml.replace("<tpAmb>2</tpAmb>", "<tpAmb>1</tpAmb>"));
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "XSD_ENUM")).toBe(true);
  });

  it("reprova ausência de grupo obrigatório", () => {
    const { xml } = buildNfeXml(payload());
    const report = validateNfeXml(xml.replace(/<transp>.*?<\/transp>/, ""));
    expect(report.issues.some((i) => i.code === "XSD_MIN_OCCURS")).toBe(true);
  });
});

describe("parseXml — superfície fail-closed", () => {
  it("rejeita DOCTYPE e ENTITY (XXE)", () => {
    const evil = `<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "y">]><NFe/>`;
    expect(() => parseXml(evil)).toThrowError(XmlParseError);
  });

  it("rejeita comentários, CDATA e processing instructions", () => {
    expect(() => parseXml("<a><!-- c --></a>")).toThrowError(/<!--/);
    expect(() => parseXml("<a><![CDATA[x]]></a>")).toThrowError(/CDATA/);
    expect(() => parseXml('<?xml version="1.0"?><a><?php ?></a>'))
      .toThrowError(/processing instruction/);
  });


  it("rejeita tags desbalanceadas e múltiplas raízes", () => {
    expect(() => parseXml("<a><b></a>")).toThrowError(XmlParseError);
    expect(() => parseXml("<a/><b/>")).toThrowError(XmlParseError);
  });

  it("faz parse de atributos e texto simples", () => {
    const node = parseXml('<a x="1"><b>ok &amp; bom</b></a>');
    expect(node.attrs.x).toBe("1");
    expect(node.children[0].text).toBe("ok & bom");
  });
});
