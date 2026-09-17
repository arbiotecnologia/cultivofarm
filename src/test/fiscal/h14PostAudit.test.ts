import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAlreadyExistingObject, sha256Bytes, verifyExistingObject } from "../../../supabase/functions/_shared/fiscal/nfe/protocoledStorage.ts";
import { buildNfeProc, extractProtNFe, NFE_NAMESPACE } from "../../../supabase/functions/_shared/fiscal/nfe/nfeProc.ts";

describe("H14 Storage integrity", () => {
  const bytes = new TextEncoder().encode("official XML");
  const download = (value = bytes) => async () => ({ data: { arrayBuffer: async () => new Uint8Array(value).buffer }, error: null });
  it("accepts an identical stored object", async () => {
    vi.stubGlobal("crypto", webcrypto);
    expect(await verifyExistingObject(download(), await sha256Bytes(bytes), bytes.length)).toBeNull();
    vi.unstubAllGlobals();
  });
  it("rejects different hash and different size independently", async () => {
    vi.stubGlobal("crypto", webcrypto);
    expect(await verifyExistingObject(download(), "0".repeat(64), bytes.length)).toBe("FISCAL_PROTOCOLED_STORAGE_CONFLICT");
    expect(await verifyExistingObject(download(), await sha256Bytes(bytes), bytes.length + 1)).toBe("FISCAL_PROTOCOLED_STORAGE_CONFLICT");
    vi.unstubAllGlobals();
  });
  it("fails closed on read error, missing content or exception", async () => {
    for (const read of [async () => ({ data: null, error: new Error() }), async () => ({ data: null, error: null }), async () => { throw new Error(); }]) {
      expect(await verifyExistingObject(read, "hash", 1)).toBe("FISCAL_PROTOCOLED_STORAGE_VERIFY_FAILED");
    }
  });
  it("classifies duplicates without a broad existence regex", () => {
    expect(isAlreadyExistingObject({ statusCode: "409" })).toBe(true);
    expect(isAlreadyExistingObject({ message: "The resource already exists" })).toBe(true);
    expect(isAlreadyExistingObject({ message: "Bucket does not exist" })).toBe(false);
    expect(isAlreadyExistingObject({ statusCode: 403 })).toBe(false);
  });
  it("checks stored content before RPC and returns pending without retry", () => {
    const source = readFileSync("supabase/functions/fiscal-sefaz-transport/index.ts", "utf8");
    expect(source).toContain("if (verificationError) return pending(verificationError)");
    expect(source.indexOf("await verifyExistingObject(")).toBeLessThan(source.indexOf('admin.rpc("rpc_fiscal_invoice_store_protocoled_xml_v1"'));
    expect(source).not.toContain("retrySafe: true");
    expect(source).toContain("upsert: false");
  });
});

describe("H14 namespace and repository mirrors", () => {
  it("assembles namespace-valid nfeProc without modifying signed NFe", () => {
    const key = "3".repeat(44);
    const signed = `<NFe xmlns="${NFE_NAMESPACE}"><infNFe Id="NFe${key}"><tpAmb>2</tpAmb></infNFe><Signature><SignatureValue>original</SignatureValue></Signature></NFe>`;
    const response = `<s:Envelope xmlns:s="urn:soap" xmlns:nfe="${NFE_NAMESPACE}"><s:Body><nfe:protNFe versao="4.00"><nfe:infProt><nfe:tpAmb>2</nfe:tpAmb><nfe:chNFe>${key}</nfe:chNFe><nfe:nProt>123</nfe:nProt><nfe:cStat>100</nfe:cStat></nfe:infProt></nfe:protNFe></s:Body></s:Envelope>`;
    const result = buildNfeProc({ signedXml: signed, responseXml: response, accessKey: key, protocol: "123" });
    expect(result.xml).toContain(signed);
    const parsed = new DOMParser().parseFromString(result.xml, "application/xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.getElementsByTagNameNS(NFE_NAMESPACE, "protNFe").length).toBe(1);
  });
  it("preserves official prefixed content with autonomous namespace declarations", () => {
    const content = '<nfe:infProt><nfe:xMotivo>Autorizado &amp; válido</nfe:xMotivo></nfe:infProt>';
    const fragment = extractProtNFe(`<s:Envelope xmlns:s="urn:soap" xmlns:nfe="${NFE_NAMESPACE}"><s:Body><nfe:protNFe versao="4.00">${content}</nfe:protNFe></s:Body></s:Envelope>`);
    expect(fragment).toContain(content);
    const parsed = new DOMParser().parseFromString(fragment, "application/xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.documentElement.namespaceURI).toBe(NFE_NAMESPACE);
    expect(parsed.getElementsByTagNameNS(NFE_NAMESPACE, "xMotivo").length).toBe(1);
  });
  it("rejects undeclared protocol prefixes", () => {
    expect(() => extractProtNFe('<ret><nfe:protNFe versao="4.00"><nfe:infProt/></nfe:protNFe></ret>')).toThrow(/NAMESPACE_INVALID/);
  });
  for (const [phase, file] of [["h13", "20261036000000_h13_fiscal_acl_and_authorization_resilience.sql"], ["h14", "20261037000000_h14_nfeproc_document_closure.sql"]]) {
    it(`mirrors ${phase} byte-for-byte without executing SQL`, () => {
      expect(readFileSync(`supabase/migrations/${file}`)).toEqual(readFileSync(`restoration/fiscal-${phase}/${file}`));
    });
  }
  it("keeps harness as a minimal inert stub", () => {
    const source = readFileSync("supabase/functions/hml-b2b-runtime-harness/index.ts", "utf8");
    expect(source).toContain('req.method === "OPTIONS"');
    expect(source).toContain("status: 410");
    expect(source).not.toMatch(/createClient|createUser|\.rpc\(|\.from\(|Deno\.env|ikaauvsflpmamgxmkhoq/);
    // fully self-contained: no external imports of any kind
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/from\s+["'](npm:|https?:\/\/)/);
    expect(source).toMatch(/Access-Control-Allow-Origin/);
    expect(source).toMatch(/Access-Control-Allow-Headers/);
    expect(source).toMatch(/Access-Control-Allow-Methods/);
    expect(source.split("\n").length).toBeLessThan(20);
  });
});