import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { isAlreadyExistingObject } from "../../../supabase/functions/_shared/fiscal/nfe/protocoledStorage";

const root = "scripts/fiscal-xml-download-blob-20261021/edge/";
const compile = (source: string) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
type Helpers = {
  sha256Hex(bytes: Uint8Array): Promise<string>;
  aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, cipher: Uint8Array): Promise<Uint8Array>;
  ensureStoredArtifact(admin: unknown, path: string, bytes: Uint8Array, sha: string): Promise<string | null>;
};

for (const name of ["index.ts.review", "rollback-deny.index.ts.review"]) {
  const source = readFileSync(root + name, "utf8");
  const code = compile(source.slice(source.indexOf("async function sha256Hex"), source.indexOf("Deno.serve")));
  const verify = vi.fn(async () => null);
  const helpers: Helpers = new Function("crypto", "BUCKET", "isAlreadyExistingObject", "verifyExistingObject",
    code + "\nreturn { sha256Hex, aesGcmDecrypt, ensureStoredArtifact };")(
    webcrypto, "fiscal-xml", isAlreadyExistingObject, verify);

  it(`${name}: digest preserva somente os bytes da view`, async () => {
    const bytes = new Uint8Array([0, 97, 98, 99, 255]).subarray(1, 4);
    expect(await helpers.sha256Hex(bytes)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it(`${name}: AES-GCM preserva key/iv/cipher com offsets e recusa adulteração`, async () => {
    const key = new Uint8Array(34).subarray(1, 33);
    const iv = new Uint8Array(14).subarray(1, 13);
    const imported = await webcrypto.subtle.importKey("raw", new Uint8Array(key).buffer, "AES-GCM", false, ["encrypt"]);
    const encrypted = new Uint8Array(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv: new Uint8Array(iv).buffer }, imported, new TextEncoder().encode("XML fictício")));
    const padded = new Uint8Array(encrypted.length + 2);
    padded.set(encrypted, 1);
    const cipher = padded.subarray(1, padded.length - 1);
    expect(new TextDecoder().decode(await helpers.aesGcmDecrypt(key, iv, cipher))).toBe("XML fictício");
    cipher[0] ^= 1;
    await expect(helpers.aesGcmDecrypt(key, iv, cipher)).rejects.toThrow();
  });

  it(`${name}: erro Storage mantém classificação e verificação de colisão`, async () => {
    const upload = vi.fn(async () => ({ error: { statusCode: "409", message: "duplicate" } }));
    const admin = { storage: { from: () => ({ upload, download: vi.fn() }) } };
    verify.mockClear();
    expect(await helpers.ensureStoredArtifact(admin, "synthetic.xml", new Uint8Array([1]), "hash")).toBeNull();
    expect(verify).toHaveBeenCalledTimes(1);
    upload.mockResolvedValue({ error: { statusCode: "500", message: "unavailable" } });
    expect(await helpers.ensureStoredArtifact(admin, "synthetic.xml", new Uint8Array([1]), "hash")).toBe("XML_STORAGE_FAILED");
    expect(verify).toHaveBeenCalledTimes(1);
  });
}

it("XSD mantém uma única Promise do módulo, inclusive após rejeição", async () => {
  const source = readFileSync(root + "xsdValidate.ts.review", "utf8");
  const code = compile(source.slice(source.indexOf("type Validator ="), source.indexOf("let validatorCache:")));
  const failed = Promise.reject(new Error("synthetic WASM failure"));
  const factory = vi.fn(() => failed);
  const get: () => Promise<unknown> = new Function("XercesModule", "xercesWasmBinary", code + "\nreturn xerces;")(factory, () => new Uint8Array());
  const first = get();
  expect(get()).toBe(first);
  await expect(first).rejects.toThrow("synthetic WASM failure");
  expect(get()).toBe(first);
  expect(factory).toHaveBeenCalledTimes(1);
});