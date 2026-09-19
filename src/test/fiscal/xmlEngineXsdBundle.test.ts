/**
 * Bundle XSD compilado (`xsdBundle.ts`) — prova de equivalência com a fonte.
 *
 * O runtime v6 da Edge Function `fiscal-xml-engine` respondeu
 * XSD_BUNDLE_UNAVAILABLE porque o canal de deploy não empacota `static_files`.
 * A correção embute os 5 XSDs oficiais num módulo TypeScript. Estes testes
 * garantem que o módulo gerado continua idêntico aos arquivos versionados e
 * aos hashes do manifesto, e que o validador não lê disco nem rede.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  XSD_BUNDLE,
  XSD_BUNDLE_FILE_COUNT,
  XSD_BUNDLE_ORDER,
  XSD_BUNDLE_PACKAGE_SHA256,
  XSD_BUNDLE_SHA256,
} from "../../../supabase/functions/fiscal-xml-engine/xsdBundle";

const ROOT = resolve(__dirname, "../../..");
const XSD_DIR = resolve(ROOT, "supabase/functions/fiscal-xml-engine/xsd");
const MANIFEST = JSON.parse(readFileSync(resolve(XSD_DIR, "manifest.json"), "utf8")) as {
  package_sha256: string;
  files: Array<{ name: string; bytes: number; sha256: string }>;
};
const XSD_VALIDATE = readFileSync(
  resolve(ROOT, "supabase/functions/fiscal-xml-engine/xsdValidate.ts"),
  "utf8",
);

const EXPECTED_ORDER = [
  "xmldsig-core-schema_v1.01.xsd",
  "tiposBasico_v4.00.xsd",
  "DFeTiposBasicos_v1.00.xsd",
  "leiauteNFe_v4.00.xsd",
  "nfe_v4.00.xsd",
];

describe("xsdBundle — nomes, ordem e contagem", () => {
  it("expõe exatamente os 5 nomes oficiais na ordem de preload", () => {
    expect([...XSD_BUNDLE_ORDER]).toEqual(EXPECTED_ORDER);
    expect(XSD_BUNDLE_FILE_COUNT).toBe(5);
    expect(Object.keys(XSD_BUNDLE).sort()).toEqual([...EXPECTED_ORDER].sort());
  });

  it("schema final é nfe_v4.00.xsd", () => {
    expect(XSD_BUNDLE_ORDER[XSD_BUNDLE_ORDER.length - 1]).toBe("nfe_v4.00.xsd");
  });

  it("objeto é readonly (congelado)", () => {
    expect(Object.isFrozen(XSD_BUNDLE)).toBe(true);
    expect(Object.isFrozen(XSD_BUNDLE_SHA256)).toBe(true);
  });
});

describe("xsdBundle — equivalência byte a byte com a fonte versionada", () => {
  for (const name of EXPECTED_ORDER) {
    it(`${name} bate com o arquivo e com o SHA-256 do manifesto`, () => {
      const source = readFileSync(resolve(XSD_DIR, name));
      const embedded = Buffer.from(XSD_BUNDLE[name], "utf8");
      expect(embedded.equals(source)).toBe(true);

      const sha = createHash("sha256").update(embedded).digest("hex");
      const declared = MANIFEST.files.find((f) => f.name === name);
      expect(declared).toBeTruthy();
      expect(sha).toBe(declared!.sha256);
      expect(embedded.byteLength).toBe(declared!.bytes);
      expect(XSD_BUNDLE_SHA256[name]).toBe(declared!.sha256);
    });
  }

  it("mantém o SHA-256 do pacote oficial declarado no manifesto", () => {
    expect(XSD_BUNDLE_PACKAGE_SHA256).toBe(MANIFEST.package_sha256);
  });
});

describe("xsdValidate — runtime autossuficiente, sem disco e sem rede", () => {
  it("carrega os schemas do módulo compilado", () => {
    expect(XSD_VALIDATE).toContain('from "./xsdBundle.ts"');
    expect(XSD_VALIDATE).toContain("XSD_BUNDLE[name]");
  });

  it("não usa Deno.readTextFile nem import.meta.url", () => {
    expect(XSD_VALIDATE).not.toContain("Deno.readTextFile");
    expect(XSD_VALIDATE).not.toContain("import.meta.url");
  });

  it("não faz resolução de rede", () => {
    expect(XSD_VALIDATE).not.toMatch(/fetch\(|https?:\/\/[^\s"']*\.xsd/);
  });

  it("é fail-closed quando um arquivo do bundle falta ou diverge", () => {
    expect(XSD_VALIDATE).toContain("XSD_BUNDLE_MISSING_FILE");
    expect(XSD_VALIDATE).toContain("XSD_BUNDLE_MISMATCH");
  });

  it("preserva ordem, cache e API pública", () => {
    expect(XSD_VALIDATE).toContain("let cache:");
    expect(XSD_VALIDATE).toContain("export const XSD_FILE_COUNT = XSD_FILES.length");
    expect(XSD_VALIDATE).toContain("export async function validateAgainstOfficialXsd");
    expect(XSD_VALIDATE).toContain("fileName: schema.fileName");
  });
});

describe("xsdValidate — memória do WASM e inspeção somente leitura", () => {
  it("configura initialMemoryPages=1024 e maxMemoryPages=2048 (64/128 MiB)", () => {
    expect(XSD_VALIDATE).toContain("export const XSD_INITIAL_MEMORY_PAGES = 1024");
    expect(XSD_VALIDATE).toContain("export const XSD_MAX_MEMORY_PAGES = 2048");
    expect(XSD_VALIDATE).toContain("initialMemoryPages: XSD_INITIAL_MEMORY_PAGES");
    expect(XSD_VALIDATE).toContain("maxMemoryPages: XSD_MAX_MEMORY_PAGES");
  });

  it("teto de memória não excede 128 MiB e inicial não excede o teto", () => {
    const initial = Number(XSD_VALIDATE.match(/XSD_INITIAL_MEMORY_PAGES = (\d+)/)![1]);
    const max = Number(XSD_VALIDATE.match(/XSD_MAX_MEMORY_PAGES = (\d+)/)![1]);
    expect(initial * 64 * 1024).toBe(64 * 1024 * 1024);
    expect(max * 64 * 1024).toBe(128 * 1024 * 1024);
    expect(max * 64 * 1024).toBeLessThanOrEqual(128 * 1024 * 1024);
    expect(initial).toBeLessThanOrEqual(max);
  });

  it("inspectOfficialXsdBundle é somente leitura e não expõe conteúdo", () => {
    const fn = XSD_VALIDATE.slice(
      XSD_VALIDATE.indexOf("export async function inspectOfficialXsdBundle"),
      XSD_VALIDATE.indexOf("/** Valida um documento NF-e"),
    );
    expect(fn).toContain("await loadBundle()");
    expect(fn).toContain("fileCount: preload.length");
    expect(fn).toContain('schema.fileName === "nfe_v4.00.xsd"');
    expect(fn).not.toContain("validateXML");
    expect(fn).not.toContain("contents");
  });

  it("inspeção esperada: 5 arquivos e schema nfe_v4.00.xsd", () => {
    expect(XSD_BUNDLE_FILE_COUNT).toBe(5);
    expect(XSD_BUNDLE_ORDER[XSD_BUNDLE_ORDER.length - 1]).toBe("nfe_v4.00.xsd");
  });
});
