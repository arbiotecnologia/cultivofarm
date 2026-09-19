/**
 * Fase F4.1-R1 — Validação XSD 1.0 REAL da NF-e 4.00.
 *
 * Usa `xmllint-wasm` (libxml2 compilado para WebAssembly). Todos os XSDs
 * oficiais são carregados de `./xsd/` (bundle local versionado, com hashes
 * em `./xsd/manifest.json`). Nenhuma resolução de rede, DTD ou entidade
 * externa é permitida: `xmllint-wasm` roda em WASM sem acesso a rede e os
 * `xs:include`/`xs:import` são satisfeitos exclusivamente por `preload`.
 *
 * Pacote oficial: PL_010e_v1.02 (Portal Nacional da NF-e, 10/07/2026).
 */
import { validateXML, type XmlValidationError } from "npm:xmllint-wasm@5.3.0";

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

async function loadBundle() {
  if (cache) return cache;
  const files: Preload[] = [];
  for (const name of XSD_FILES) {
    const url = new URL(`./xsd/${name}`, import.meta.url);
    files.push({ fileName: name, contents: await Deno.readTextFile(url) });
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
  });
  return {
    valid: result.valid === true,
    validator: XSD_VALIDATOR,
    schema: "nfe_v4.00.xsd",
    package: XSD_PACKAGE,
    issues: result.valid ? [] : (result.errors ?? []).map(toIssue),
  };
}
