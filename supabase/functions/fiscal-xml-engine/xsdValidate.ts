/**
 * Fase F4.1-R2 — Validação XSD 1.0 REAL da NF-e 4.00, em processo.
 *
 * Adaptador normativo: Apache Xerces-C++ compilado para WebAssembly
 * (`xerces-wasm@2.0.1`). O binário `.wasm` é EMBUTIDO em `./xercesWasm.ts`
 * (gerado por `scripts/generate-xerces-wasm.mjs`, com SHA-256 fixado), e os 5
 * XSDs oficiais vêm de `./xsdBundle.ts` (gerado a partir de `./xsd/`, hashes
 * em `./xsd/manifest.json`).
 *
 * Por que trocamos o validador anterior (libxml2 via WASM em Worker): aquela
 * implementação criava um Worker de thread do Node por chamada, incompatível
 * com o isolamento da Supabase Edge Function (runtime respondia
 * XSD_VALIDATOR_MEMORY_OR_WASM_FAILED). O Xerces roda síncrono, no MESMO
 * processo, sem threads de worker, subprocessos, FFI, rede ou serviço externo.
 *
 * Nenhum fallback heurístico é aceito como validação normativa: se o schema
 * não compilar, a validação falha fechada.
 *
 * Pacote XSD oficial: PL_010e_v1.02 (Portal Nacional da NF-e, 10/07/2026).
 */
// deno-lint-ignore-file no-explicit-any
import XercesModule from "npm:xerces-wasm@2.0.1/wasm/xerces_validator.js";
import {
  loadVerifiedXsdBundle,
  XSD_ENTRY_SCHEMA as ENTRY,
  XSD_FILE_COUNT as FILE_COUNT,
  XSD_FILES as FILES,
} from "./xsdBundleIntegrity.ts";
import { XERCES_WASM_PACKAGE, XERCES_WASM_SHA256, xercesWasmBinary } from "./xercesWasm.ts";

export interface XsdIssue {
  line: number | null;
  code: string;
  message: string;
}

export interface XsdReport {
  valid: boolean;
  validator: string;
  schema: string;
  package: string;
  issues: XsdIssue[];
}

export const XSD_PACKAGE = "PL_010e_v1.02";
export const XSD_VALIDATOR = `${XERCES_WASM_PACKAGE} (Apache Xerces-C++, XSD 1.0, in-process WASM)`;
export const XSD_ENTRY_SCHEMA = ENTRY;
export const XERCES_WASM_DIGEST = XERCES_WASM_SHA256;

/** Ordem canônica dos XSDs oficiais (fonte única: xsdBundleIntegrity). */
const XSD_FILES = FILES;

/** Número de arquivos XSD oficiais no bundle (prova de empacotamento no selftest). */
export const XSD_FILE_COUNT = XSD_FILES.length;

let modulePromise: Promise<any> | null = null;

/** Instancia o módulo WASM uma única vez, com o binário embutido. */
function xerces(): Promise<any> {
  if (!modulePromise) {
    modulePromise = (XercesModule as any)({
      wasmBinary: xercesWasmBinary(),
      // Nunca deve ser usado (o binário já foi fornecido); mantido para impedir
      // qualquer tentativa de resolução relativa a disco/rede.
      locateFile: () => "embedded:xerces_validator.wasm",
      print: () => {},
      printErr: () => {},
    });
  }
  return modulePromise;
}

type Validator = { validate(xml: string): any; delete(): void };

let validatorCache: Validator | null = null;

/**
 * Compila a gramática oficial uma única vez e mantém o validador em memória.
 * Fail-closed: schema/import faltante ou bundle adulterado aborta com
 * `XSD_SCHEMA_COMPILE_FAILED` — nunca há degradação para heurística.
 */
async function loadValidator(): Promise<Validator> {
  if (validatorCache) return validatorCache;
  const files = await loadVerifiedXsdBundle();
  const mod = await xerces();
  const instance = new mod.ProjectValidator() as Validator & {
    init(entry: string, files: Record<string, string>, ns: string | null): boolean;
  };
  let ok = false;
  try {
    ok = instance.init(XSD_ENTRY_SCHEMA, files, null) === true;
  } catch {
    ok = false;
  }
  if (!ok) {
    try {
      instance.delete();
    } catch { /* noop */ }
    throw new Error("XSD_SCHEMA_COMPILE_FAILED");
  }
  validatorCache = instance;
  return instance;
}

/**
 * Sanitiza a mensagem do Xerces: mantém apenas elemento/razão, sem recorte do
 * documento (que poderia conter dados fiscais) nem caminhos locais.
 */
/** Mensagem genérica: jamais expõe texto do Xerces, valor fiscal, XML ou path. */
const XSD_GENERIC_MESSAGE = "documento incompatível com o schema XSD oficial";
/** Nome de elemento/atributo aceito: apenas NCName simples, curto. */
const SAFE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;

function safeName(raw: string): string {
  const m = raw.match(/element\s+'([^']{1,80})'/i) ?? raw.match(/attribute\s+'([^']{1,80})'/i);
  if (!m) return "";
  const candidate = m[1].includes(":") ? m[1].slice(m[1].lastIndexOf(":") + 1) : m[1];
  return SAFE_NAME_RE.test(candidate) ? candidate : "";
}

function toIssue(diag: { message?: unknown; line?: unknown }): XsdIssue {
  const raw = String(diag?.message ?? "").split("\n")[0];
  const element = safeName(raw);
  return {
    line: typeof diag?.line === "number" && diag.line > 0 ? diag.line : null,
    code: element ? `XSD_INVALID:${element}` : "XSD_INVALID",
    message: XSD_GENERIC_MESSAGE,
  };
}


export interface XsdBundleInspection {
  ok: boolean;
  fileCount: number;
  schema: string;
}

/**
 * Diagnóstico somente leitura: confere presença/ordem dos 5 XSDs e informa o
 * schema final. Não retorna conteúdo algum e não instancia o WASM.
 */
export async function inspectOfficialXsdBundle(): Promise<XsdBundleInspection> {
  const files = await loadVerifiedXsdBundle();
  const names = Object.keys(files);
  return {
    ok: names.length === FILE_COUNT && names[names.length - 1] === XSD_ENTRY_SCHEMA,
    fileCount: names.length,
    schema: XSD_ENTRY_SCHEMA,
  };
}

/** Valida um documento NF-e (assinado ou não) contra o XSD oficial 4.00. */
export async function validateAgainstOfficialXsd(xml: string): Promise<XsdReport> {
  if (typeof xml !== "string" || xml.trim().length === 0) {
    return {
      valid: false,
      validator: XSD_VALIDATOR,
      schema: XSD_ENTRY_SCHEMA,
      package: XSD_PACKAGE,
      issues: [{ line: null, code: "XSD_EMPTY_DOCUMENT", message: "documento vazio" }],
    };
  }
  const validator = await loadValidator();
  const result = validator.validate(xml) as {
    valid?: boolean;
    parseErrors?: unknown[];
    schemaErrors?: unknown[];
  };
  const diagnostics = [...(result?.parseErrors ?? []), ...(result?.schemaErrors ?? [])];
  const valid = result?.valid === true && diagnostics.length === 0;
  return {
    valid,
    validator: XSD_VALIDATOR,
    schema: XSD_ENTRY_SCHEMA,
    package: XSD_PACKAGE,
    issues: valid ? [] : diagnostics.map((d) => toIssue(d as { message?: unknown; line?: unknown })),
  };
}
