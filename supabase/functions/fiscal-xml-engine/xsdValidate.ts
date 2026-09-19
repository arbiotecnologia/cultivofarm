/**
 * Fase F4.1-R1 — Validação XSD 1.0 REAL da NF-e 4.00.
 *
 * Usa `xmllint-wasm` (libxml2 compilado para WebAssembly). Todos os XSDs
 * oficiais vêm de `./xsdBundle.ts`, módulo GERADO a partir de `./xsd/`
 * (fonte auditável, hashes em `./xsd/manifest.json`). O canal de deploy das
 * Edge Functions não empacota `static_files`, então nada é lido do disco
 * (sem leitura de arquivo e sem URL de módulo). Nenhuma resolução de rede,
 * DTD ou entidade externa é permitida: `xmllint-wasm` roda em WASM sem acesso
 * a rede e os `xs:include`/`xs:import` são satisfeitos apenas por `preload`.
 *
 * Pacote oficial: PL_010e_v1.02 (Portal Nacional da NF-e, 10/07/2026).
 */
import { validateXML, type XmlValidationError } from "npm:xmllint-wasm@5.3.0";
import { XSD_BUNDLE, XSD_BUNDLE_ORDER } from "./xsdBundle.ts";

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
export const XSD_VALIDATOR = "xmllint-wasm@5.3.0 (libxml2, XSD 1.0)";

const XSD_FILES = [
  "xmldsig-core-schema_v1.01.xsd",
  "tiposBasico_v4.00.xsd",
  "DFeTiposBasicos_v1.00.xsd",
  "leiauteNFe_v4.00.xsd",
  "nfe_v4.00.xsd",
] as const;

/** Número de arquivos XSD oficiais no bundle (prova de empacotamento no selftest). */
export const XSD_FILE_COUNT = XSD_FILES.length;

type Preload = { fileName: string; contents: string };

let cache: { schema: Preload; preload: Preload[] } | null = null;

/**
 * Carrega os XSDs do módulo compilado `xsdBundle.ts` (nenhum acesso a disco
 * ou rede). Fail-closed: qualquer arquivo ausente/vazio aborta a validação.
 */
// deno-lint-ignore require-await
async function loadBundle() {
  if (cache) return cache;
  if (XSD_BUNDLE_ORDER.length !== XSD_FILES.length) {
    throw new Error("XSD_BUNDLE_MISMATCH");
  }
  const files: Preload[] = [];
  for (let i = 0; i < XSD_FILES.length; i++) {
    const name = XSD_FILES[i];
    if (XSD_BUNDLE_ORDER[i] !== name) throw new Error("XSD_BUNDLE_MISMATCH");
    const contents = XSD_BUNDLE[name];
    if (typeof contents !== "string" || contents.length === 0) {
      throw new Error("XSD_BUNDLE_MISSING_FILE");
    }
    files.push({ fileName: name, contents });
  }
  const schema = files[files.length - 1];
  cache = { schema, preload: files };
  return cache;
}

/**
 * Sanitiza a mensagem do libxml2: remove o recorte do documento (que pode
 * conter dados fiscais) e mantém apenas o caminho/elemento e a razão.
 */
function toIssue(err: XmlValidationError): XsdIssue {
  const raw = String(err.message ?? "").split("\n")[0];
  const m = raw.match(/Element\s+'([^']+)'(?:,\s*attribute\s*'([^']+)')?:?\s*(.*)$/);
  const element = m ? (m[2] ? `${m[1]}@${m[2]}` : m[1]) : "";
  const reason = (m ? m[3] : raw).replace(/\[facet\s+'[^']*'\]/g, (s) => s).trim();
  return {
    line: typeof err.loc?.lineNumber === "number" ? err.loc.lineNumber : null,
    code: element ? `XSD_INVALID:${element}` : "XSD_INVALID",
    message: reason.slice(0, 400),
  };
}

/**
 * Memória do módulo WASM do libxml2. O default do `xmllint-wasm` é um teto de
 * 32 MiB, insuficiente para o conjunto NF-e (~438 KB de XSD, sendo ~350 KB só
 * o leiauteNFe_v4.00) — a execução aborta no runtime. Elevamos para 64 MiB
 * iniciais e 128 MiB de teto, conforme a recomendação do pacote para schemas
 * grandes. 1 página WASM = 64 KiB.
 */
export const XSD_INITIAL_MEMORY_PAGES = 1024; // 64 MiB
export const XSD_MAX_MEMORY_PAGES = 2048; // 128 MiB

export interface XsdBundleInspection {
  ok: boolean;
  fileCount: number;
  schema: string;
}

/**
 * Diagnóstico somente leitura: executa apenas `loadBundle` e informa se os 5
 * XSDs estão presentes e qual é o schema final. Não retorna conteúdo algum.
 */
export async function inspectOfficialXsdBundle(): Promise<XsdBundleInspection> {
  const { schema, preload } = await loadBundle();
  return {
    ok: preload.length === XSD_FILE_COUNT && schema.fileName === "nfe_v4.00.xsd",
    fileCount: preload.length,
    schema: schema.fileName,
  };
}

/** Valida um documento NF-e (assinado ou não) contra o XSD oficial 4.00. */
export async function validateAgainstOfficialXsd(xml: string): Promise<XsdReport> {
  if (typeof xml !== "string" || xml.trim().length === 0) {
    return {
      valid: false,
      validator: XSD_VALIDATOR,
      schema: "nfe_v4.00.xsd",
      package: XSD_PACKAGE,
      issues: [{ line: null, code: "XSD_EMPTY_DOCUMENT", message: "documento vazio" }],
    };
  }
  const { schema, preload } = await loadBundle();
  const result = await validateXML({
    xml: [{ fileName: "nfe.xml", contents: xml }],
    schema: [{ fileName: schema.fileName, contents: schema.contents }],
    preload,
    initialMemoryPages: XSD_INITIAL_MEMORY_PAGES,
    maxMemoryPages: XSD_MAX_MEMORY_PAGES,
  });
  return {
    valid: result.valid === true,
    validator: XSD_VALIDATOR,
    schema: "nfe_v4.00.xsd",
    package: XSD_PACKAGE,
    issues: result.valid ? [] : (result.errors ?? []).map(toIssue),
  };
}
