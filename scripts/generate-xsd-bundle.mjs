/**
 * Gera supabase/functions/fiscal-xml-engine/xsdBundle.ts a partir dos 5 XSDs
 * oficiais versionados em supabase/functions/fiscal-xml-engine/xsd/.
 *
 * Motivo: o canal de deploy das Edge Functions não empacota `static_files`,
 * então o runtime precisa dos schemas embutidos em um módulo TypeScript.
 * Não edite o arquivo gerado à mão — rode `node scripts/generate-xsd-bundle.mjs`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "supabase/functions/fiscal-xml-engine/xsd");
const manifest = JSON.parse(readFileSync(resolve(DIR, "manifest.json"), "utf8"));

// Ordem de preload exigida pelo validador (schema final por último).
const ORDER = [
  "xmldsig-core-schema_v1.01.xsd",
  "tiposBasico_v4.00.xsd",
  "DFeTiposBasicos_v1.00.xsd",
  "leiauteNFe_v4.00.xsd",
  "nfe_v4.00.xsd",
];

function lit(s) {
  // String literal ASCII-safe: todo caractere não-ASCII vira \uXXXX.
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (cp < 0x20 || cp > 0x7e) {
      for (let i = 0; i < ch.length; i++) {
        out += "\\u" + ch.charCodeAt(i).toString(16).padStart(4, "0");
      }
    } else out += ch;
  }
  return '"' + out + '"';
}

const parts = [];
const hashes = [];
for (const name of ORDER) {
  const buf = readFileSync(resolve(DIR, name));
  const sha = createHash("sha256").update(buf).digest("hex");
  const declared = manifest.files.find((f) => f.name === name);
  if (!declared) throw new Error(`arquivo ausente no manifesto: ${name}`);
  if (declared.sha256 !== sha || declared.bytes !== buf.byteLength) {
    throw new Error(`divergência de integridade em ${name}`);
  }
  parts.push(`  ${lit(name)}: ${lit(buf.toString("utf8"))},`);
  hashes.push(`  ${lit(name)}: ${lit(sha)},`);
}

const out = `/**
 * ARQUIVO GERADO — não edite manualmente.
 * Fonte: supabase/functions/fiscal-xml-engine/xsd/ (pacote ${manifest.package}).
 * Gerador: scripts/generate-xsd-bundle.mjs
 *
 * O canal de deploy das Edge Functions não empacota \`static_files\`; sem este
 * módulo o runtime falha com XSD_BUNDLE_UNAVAILABLE. As strings abaixo são
 * equivalentes byte a byte aos arquivos versionados (conferido por SHA-256
 * contra xsd/manifest.json nos testes estáticos).
 */

/** Ordem de preload: dependências primeiro, schema final por último. */
export const XSD_BUNDLE_ORDER = [
${ORDER.map((n) => `  ${lit(n)},`).join("\n")}
] as const;

export const XSD_BUNDLE: Readonly<Record<string, string>> = Object.freeze({
${parts.join("\n")}
});

/** SHA-256 declarados em xsd/manifest.json (pacote ${manifest.package}). */
export const XSD_BUNDLE_SHA256: Readonly<Record<string, string>> = Object.freeze({
${hashes.join("\n")}
});

export const XSD_BUNDLE_PACKAGE_SHA256 = ${lit(manifest.package_sha256)};

export const XSD_BUNDLE_FILE_COUNT = XSD_BUNDLE_ORDER.length;
`;

writeFileSync(resolve(ROOT, "supabase/functions/fiscal-xml-engine/xsdBundle.ts"), out);
console.log("xsdBundle.ts gerado:", ORDER.length, "arquivos");
