import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildNfeProc,
  nfeProcStoragePath,
  NfeProcError,
} from "../../../supabase/functions/_shared/fiscal/nfe/nfeProc.ts";

const KEY = "3".repeat(44);
const PROT = "135260000000123";

const signedXml = (key = KEY, tpAmb = "2") =>
  `<?xml version="1.0"?><NFe xmlns="http://www.portalfiscal.inf.br/nfe">` +
  `<infNFe Id="NFe${key}" versao="4.00"><ide><tpAmb>${tpAmb}</tpAmb></ide></infNFe>` +
  `<Signature><SignatureValue>abc</SignatureValue></Signature></NFe>`;

const responseXml = (
  { key = KEY, prot = PROT, cStat = "100", tpAmb = "2" } = {},
) =>
  `<retEnviNFe><protNFe versao="4.00"><infProt><tpAmb>${tpAmb}</tpAmb>` +
  `<chNFe>${key}</chNFe><dhRecbto>2026-09-17T10:00:00-03:00</dhRecbto>` +
  `<nProt>${prot}</nProt><cStat>${cStat}</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>` +
  `</infProt></protNFe></retEnviNFe>`;

const readFile = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("H14 — montagem do nfeProc", () => {
  it("monta nfeProc com NFe assinada e protNFe autorizado", () => {
    const built = buildNfeProc({
      signedXml: signedXml(),
      responseXml: responseXml(),
      accessKey: KEY,
      protocol: PROT,
    });
    expect(built.xml).toContain('<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">');
    expect(built.xml).toContain(`Id="NFe${KEY}"`);
    expect(built.xml).toContain(`<nProt>${PROT}</nProt>`);
    expect(built.xml.indexOf("<NFe")).toBeLessThan(built.xml.indexOf("<protNFe"));
  });

  it("recusa XML sem assinatura", () => {
    const unsigned = signedXml().replace(/<Signature>[\s\S]*?<\/Signature>/, "");
    expect(() => buildNfeProc({ signedXml: unsigned, responseXml: responseXml(), accessKey: KEY, protocol: PROT }))
      .toThrowError(/NFEPROC_SIGNED_NFE_UNSIGNED/);
  });

  it("recusa chave divergente entre documento e protocolo", () => {
    expect(() => buildNfeProc({
      signedXml: signedXml("4".repeat(44)),
      responseXml: responseXml(),
      accessKey: KEY,
      protocol: PROT,
    })).toThrowError(/NFEPROC_ACCESS_KEY_MISMATCH/);
  });

  it("recusa protocolo divergente", () => {
    expect(() => buildNfeProc({
      signedXml: signedXml(),
      responseXml: responseXml({ prot: "999" }),
      accessKey: KEY,
      protocol: PROT,
    })).toThrowError(/NFEPROC_PROTOCOL_MISMATCH/);
  });

  it("recusa retorno não autorizado", () => {
    expect(() => buildNfeProc({
      signedXml: signedXml(),
      responseXml: responseXml({ cStat: "204" }),
      accessKey: KEY,
      protocol: PROT,
    })).toThrowError(/NFEPROC_NOT_AUTHORIZED/);
  });

  it("bloqueia ambiente de produção no documento e no protocolo", () => {
    expect(() => buildNfeProc({
      signedXml: signedXml(KEY, "1"),
      responseXml: responseXml(),
      accessKey: KEY,
      protocol: PROT,
    })).toThrowError(/FISCAL_PRODUCTION_ENDPOINT_BLOCKED/);
    expect(() => buildNfeProc({
      signedXml: signedXml(),
      responseXml: responseXml({ tpAmb: "1" }),
      accessKey: KEY,
      protocol: PROT,
    })).toThrowError(/FISCAL_PRODUCTION_ENDPOINT_BLOCKED/);
  });

  it("recusa protocolo ausente na resposta", () => {
    try {
      buildNfeProc({ signedXml: signedXml(), responseXml: "<retEnviNFe/>", accessKey: KEY, protocol: PROT });
      throw new Error("deveria falhar");
    } catch (err) {
      expect(err).toBeInstanceOf(NfeProcError);
      expect((err as NfeProcError).code).toBe("NFEPROC_PROTOCOL_NOT_FOUND");
    }
  });

  it("usa caminho determinístico por nota/chave/protocolo (replay idempotente)", () => {
    const a = nfeProcStoragePath("11111111-1111-1111-1111-111111111111", KEY, PROT);
    const b = nfeProcStoragePath("11111111-1111-1111-1111-111111111111", KEY, PROT);
    expect(a).toBe(b);
    expect(a).toBe(`nfeproc/11111111-1111-1111-1111-111111111111/${KEY}-${PROT}.xml`);
  });
});

describe("H14 — contrato do fechamento documental no transporte", () => {
  const transport = readFile("supabase/functions/fiscal-sefaz-transport/index.ts");

  it("fecha o documento apenas quando o retorno é autorizado", () => {
    expect(transport).toContain("closeAuthorizedDocument");
    expect(transport).toMatch(/if \(authorized\) \{\s*closure = await closeAuthorizedDocument/);
  });

  it("nunca declara reenvio seguro após o POST", () => {
    expect(transport).not.toContain("retrySafe: true");
  });

  it("falha de fechamento mantém pendência, não rebaixa a autorização", () => {
    expect(transport).toContain("FISCAL_AUTHORIZATION_CLOSE_PENDING");
    expect(transport).toMatch(/closure\.pending/);
    expect(transport).not.toMatch(/_state: "FAILED"[^}]*closure/);
  });

  it("usa o protocolo e a chave do retorno persistido, nunca do corpo do cliente", () => {
    expect(transport).toContain("accessKey: result.chNFe ?? null");
    expect(transport).toContain("protocol: result.nProt ?? null");
  });
});

describe("H14 — migration de fechamento documental", () => {
  const sql = readFile("restoration/fiscal-h14/20261037000000_h14_nfeproc_document_closure.sql");
  const rollback = readFile("restoration/fiscal-h14/ROLLBACK.sql");

  it("exige o projeto canônico antes de qualquer alteração", () => {
    expect(sql).toContain("swzpzcwiasxmjutrmvkm");
    expect(sql).toContain("FISCAL_CANONICAL_TARGET_REQUIRED");
  });

  it("restringe a RPC de fechamento a service_role", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.rpc_fiscal_invoice_store_protocoled_xml_v1[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.rpc_fiscal_invoice_store_protocoled_xml_v1[\s\S]*TO service_role/);
  });

  it("protege a tabela de artefatos com RLS e leitura só para operador fiscal", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("public.fn_fiscal_can_operate(auth.uid())");
    expect(sql).toContain("GRANT SELECT ON public.fiscal_protocoled_documents TO authenticated;");
  });

  it("garante idempotência e bloqueio de produção", () => {
    expect(sql).toContain("fiscal_protocoled_documents_unq");
    expect(sql).toContain("FISCAL_PROTOCOLED_DOCUMENT_CONFLICT");
    expect(sql).toContain("FISCAL_PRODUCTION_ENDPOINT_BLOCKED");
    expect(sql).toContain("environment_code = '2'");
  });

  it("rollback não apaga artefatos fiscais persistidos", () => {
    expect(rollback).not.toMatch(/DROP TABLE|DELETE FROM public\.fiscal_protocoled_documents|DROP BUCKET/i);
    expect(rollback).toContain("FISCAL_PROTOCOLED_CLOSURE_DISABLED");
  });
});

describe("H14 — harness histórico não pode rodar contra o banco canônico", () => {
  const harness = readFile("supabase/functions/hml-b2b-runtime-harness/index.ts");

  it("está desativado fail-closed e é autocontido", () => {
    expect(harness).toContain("HML_HARNESS_DISABLED_NON_CANONICAL_TARGET");
    expect(harness).toMatch(/status: 410/);
    expect(harness).not.toMatch(/^\s*import\s/m);
    expect(harness).not.toMatch(/from\s+["'](npm:|https?:\/\/)/);
    expect(harness).not.toMatch(/createClient|\.rpc\(|\.from\(|Deno\.env|ikaauvsflpmamgxmkhoq/);
    expect(harness).toMatch(/Access-Control-Allow-Origin/);
  });
});
