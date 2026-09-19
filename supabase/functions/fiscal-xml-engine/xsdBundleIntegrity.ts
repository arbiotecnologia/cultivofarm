/**
 * Integridade do bundle XSD oficial — gate fail-closed.
 *
 * O compilador de schema do Xerces tolera includes ausentes/inválidos (compila
 * uma gramática parcial). Por isso a integridade NÃO pode depender do
 * compilador: antes de compilar, conferimos presença, ordem e SHA-256 de cada
 * um dos 5 XSDs contra os hashes do manifesto oficial (PL_010e_v1.02).
 *
 * Módulo sem dependências externas (sem npm:, sem disco, sem rede) para poder
 * ser exercitado tanto pelo runtime Deno quanto pelos testes.
 */
import { XSD_BUNDLE, XSD_BUNDLE_ORDER, XSD_BUNDLE_SHA256 } from "./xsdBundle.ts";

/** Ordem canônica de preload: dependências antes do entry. */
export const XSD_FILES = [
  "xmldsig-core-schema_v1.01.xsd",
  "tiposBasico_v4.00.xsd",
  "DFeTiposBasicos_v1.00.xsd",
  "leiauteNFe_v4.00.xsd",
  "nfe_v4.00.xsd",
] as const;

export const XSD_FILE_COUNT = XSD_FILES.length;
export const XSD_ENTRY_SCHEMA = "nfe_v4.00.xsd";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Devolve o mapa nome→conteúdo dos 5 XSDs oficiais, na ordem canônica.
 * Lança `XSD_BUNDLE_MISSING_FILE` (ausente/vazio) ou `XSD_BUNDLE_MISMATCH`
 * (ordem, contagem ou hash divergente). Nunca degrada para gramática parcial.
 */
export async function loadVerifiedXsdBundle(
  source: Record<string, string> = XSD_BUNDLE as Record<string, string>,
  order: readonly string[] = XSD_BUNDLE_ORDER,
  hashes: Record<string, string> = XSD_BUNDLE_SHA256 as Record<string, string>,
): Promise<Record<string, string>> {
  if (order.length !== XSD_FILES.length) throw new Error("XSD_BUNDLE_MISMATCH");
  const files: Record<string, string> = {};
  for (let i = 0; i < XSD_FILES.length; i++) {
    const name = XSD_FILES[i];
    if (order[i] !== name) throw new Error("XSD_BUNDLE_MISMATCH");
    const contents = source[name];
    if (typeof contents !== "string" || contents.length === 0) {
      throw new Error("XSD_BUNDLE_MISSING_FILE");
    }
    const expected = hashes[name];
    if (typeof expected !== "string" || expected.length !== 64) {
      throw new Error("XSD_BUNDLE_MISMATCH");
    }
    if (await sha256Hex(contents) !== expected) throw new Error("XSD_BUNDLE_MISMATCH");
    files[name] = contents;
  }
  if (Object.keys(source).length !== XSD_FILES.length) throw new Error("XSD_BUNDLE_MISMATCH");
  return files;
}
