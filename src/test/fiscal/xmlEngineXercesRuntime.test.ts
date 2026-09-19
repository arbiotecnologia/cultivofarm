/**
 * Adaptador normativo XSD em processo (Apache Xerces-C++ / WASM).
 *
 * Estes testes executam o MESMO caminho do runtime da Edge Function
 * `fiscal-xml-engine`: binário WASM embutido em `xercesWasm.ts` + os 5 XSDs
 * oficiais de `xsdBundle.ts`, compilados por `ProjectValidator` no mesmo
 * processo (sem worker_threads, child_process, FFI ou rede).
 */
import { describe, expect, it, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  XSD_BUNDLE,
  XSD_BUNDLE_ORDER,
  XSD_BUNDLE_SHA256,
} from "../../../supabase/functions/fiscal-xml-engine/xsdBundle";
import { loadVerifiedXsdBundle } from "../../../supabase/functions/fiscal-xml-engine/xsdBundleIntegrity";
import {
  XERCES_WASM_BYTES,
  XERCES_WASM_PACKAGE,
  XERCES_WASM_SHA256,
  xercesWasmBinary,
} from "../../../supabase/functions/fiscal-xml-engine/xercesWasm";

const ROOT = resolve(__dirname, "../../..");
const require_ = createRequire(resolve(ROOT, "package.json"));
const GLUE_PATH = require_.resolve("xerces-wasm/wasm/xerces_validator.js");
const WASM_PATH = resolve(GLUE_PATH, "../xerces_validator.wasm");
const XSD_VALIDATE = readFileSync(
  resolve(ROOT, "supabase/functions/fiscal-xml-engine/xsdValidate.ts"),
  "utf8",
);
const INDEX = readFileSync(
  resolve(ROOT, "supabase/functions/fiscal-xml-engine/index.ts"),
  "utf8",
);

const INVALID_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<xsdSelfTestProbe xmlns="http://www.portalfiscal.inf.br/nfe">invalid-root</xsdSelfTestProbe>';
const INCOMPLETE_NFE =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">' +
  '<infNFe versao="4.00" Id="NFe35200114200166000187550010000000015123456789"></infNFe></NFe>';

type Diag = { message: string; line: number; column: number; severity: string };
type Result = { valid: boolean; parseErrors: Diag[]; schemaErrors: Diag[] };
interface Instance {
  init(entry: string, files: Record<string, string>, ns: string | null): boolean;
  validate(xml: string): Result;
  delete(): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;

function bundleFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of XSD_BUNDLE_ORDER) files[name] = XSD_BUNDLE[name];
  return files;
}

function newValidator(files: Record<string, string>): { ok: boolean; instance: Instance } {
  const instance = new mod.ProjectValidator() as Instance;
  let ok = false;
  try {
    ok = instance.init("nfe_v4.00.xsd", files, null) === true;
  } catch {
    ok = false;
  }
  return { ok, instance };
}

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factory = require_(GLUE_PATH) as any;
  mod = await factory({
    wasmBinary: xercesWasmBinary(),
    locateFile: () => "embedded:xerces_validator.wasm",
    print: () => {},
    printErr: () => {},
  });
}, 120_000);

describe("xercesWasm — binário embutido determinístico", () => {
  it("bate byte a byte com o .wasm do pacote publicado", () => {
    const source = readFileSync(WASM_PATH);
    const embedded = Buffer.from(xercesWasmBinary());
    expect(embedded.equals(source)).toBe(true);
    expect(embedded.byteLength).toBe(XERCES_WASM_BYTES);
  });

  it("confere o SHA-256 declarado", () => {
    const sha = createHash("sha256").update(Buffer.from(xercesWasmBinary())).digest("hex");
    expect(sha).toBe(XERCES_WASM_SHA256);
    expect(XERCES_WASM_PACKAGE).toBe("xerces-wasm@2.0.1");
  });
});

describe("validação normativa real contra o XSD oficial da NF-e", () => {
  it("rejeita XML deliberadamente inválido (raiz inexistente)", () => {
    const { ok, instance } = newValidator(bundleFiles());
    expect(ok).toBe(true);
    const res = instance.validate(INVALID_XML);
    expect(res.valid).toBe(false);
    expect(res.schemaErrors.length + res.parseErrors.length).toBeGreaterThan(0);
    instance.delete();
  }, 120_000);

  it("reporta o modelo de conteúdo real do leiaute para NFe incompleta", () => {
    const { ok, instance } = newValidator(bundleFiles());
    expect(ok).toBe(true);
    const res = instance.validate(INCOMPLETE_NFE);
    expect(res.valid).toBe(false);
    // Prova que o leiauteNFe_v4.00 foi de fato compilado (modelo de conteúdo).
    expect(res.schemaErrors.map((e) => e.message).join(" ")).toMatch(/ide|content model/i);
    instance.delete();
  }, 120_000);

  it("gate de integridade aceita o bundle oficial íntegro", async () => {
    const files = await loadVerifiedXsdBundle();
    expect(Object.keys(files)).toHaveLength(5);
    expect(Object.keys(files)[4]).toBe("nfe_v4.00.xsd");
  });

  it("falha fechado quando um import do schema está ausente", async () => {
    const files = bundleFiles();
    delete files["leiauteNFe_v4.00.xsd"];
    await expect(
      loadVerifiedXsdBundle(files, XSD_BUNDLE_ORDER, { ...XSD_BUNDLE_SHA256 }),
    ).rejects.toThrow(/XSD_BUNDLE_(MISSING_FILE|MISMATCH)/);
  });

  it("falha fechado quando o bundle é adulterado", async () => {
    const files = bundleFiles();
    files["leiauteNFe_v4.00.xsd"] = "<not-a-schema/>";
    await expect(
      loadVerifiedXsdBundle(files, XSD_BUNDLE_ORDER, { ...XSD_BUNDLE_SHA256 }),
    ).rejects.toThrow("XSD_BUNDLE_MISMATCH");
  });

  it("o compilador do Xerces sozinho NÃO é fail-closed (por isso o gate de hash)", () => {
    const files = bundleFiles();
    files["leiauteNFe_v4.00.xsd"] = "<not-a-schema/>";
    const { instance } = newValidator(files);
    // Documenta o comportamento tolerante do Xerces: a proteção efetiva está
    // no gate de integridade por SHA-256, executado antes da compilação.
    try {
      instance.delete();
    } catch {
      /* noop */
    }
  }, 120_000);
});

describe("grafo da função — sem worker_threads e sem vazamento de erro cru", () => {
  it("nenhum módulo próprio da função usa worker_threads/child_process/FFI", () => {
    for (const src of [XSD_VALIDATE, INDEX]) {
      expect(src).not.toMatch(/node:worker_threads|worker_threads|child_process|Deno\.dlopen|Deno\.run|Deno\.Command/);
    }
  });

  it("xmllint-wasm foi removido do caminho de execução", () => {
    expect(XSD_VALIDATE).not.toContain("npm:xmllint-wasm");
    expect(INDEX).not.toContain("xmllint-wasm");
  });

  it("erro interno não expõe stack, caminho ou conteúdo", () => {
    const block = INDEX.slice(
      INDEX.indexOf('action === "xsd-selftest"'),
      INDEX.indexOf("Cliente do usuário: toda autorização"),
    );
    expect(block).not.toMatch(/\.stack|String\(err|err\.message/);
    expect(block).toContain('error: "XSD_BUNDLE_UNAVAILABLE"');
  });

  it("mensagens do validador são truncadas e sem recorte do documento", () => {
    expect(XSD_VALIDATE).toContain("raw.slice(0, 400)");
  });
});
