#!/usr/bin/env node
/**
 * Gerador determinístico do módulo `xercesWasm.ts`.
 *
 * Baixa o pacote `xerces-wasm@2.0.1` do registry (via `npm pack`), confere o
 * SHA-256 do binário WebAssembly contra o valor fixado abaixo e embute o
 * binário como base64 num módulo TypeScript versionado. O runtime da Edge
 * Function passa a ser autossuficiente: nenhum `static_files`, nenhuma leitura
 * de disco e nenhuma resolução de rede para obter o `.wasm`.
 *
 * Uso: node scripts/generate-xerces-wasm.mjs
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "supabase/functions/fiscal-xml-engine/xercesWasm.ts");

const PACKAGE = "xerces-wasm@2.0.1";
const WASM_PATH = "package/wasm/xerces_validator.wasm";
const EXPECTED_SHA256 = "775d89b11ce716ac7c7feab41d13940bf81f112d26e9308d513d844fa8ce5019";
const CHUNK = 8192;

const work = mkdtempSync(resolve(tmpdir(), "xerces-wasm-"));
execFileSync("npm", ["pack", PACKAGE], { cwd: work, stdio: "ignore" });
const tgz = readdirSync(work).find((f) => f.endsWith(".tgz"));
if (!tgz) throw new Error("tarball não encontrado");
execFileSync("tar", ["xzf", tgz, WASM_PATH], { cwd: work });

const bytes = readFileSync(resolve(work, WASM_PATH));
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== EXPECTED_SHA256) {
  throw new Error(`SHA-256 divergente: ${sha256} != ${EXPECTED_SHA256}`);
}

const b64 = bytes.toString("base64");
const chunks = [];
for (let i = 0; i < b64.length; i += CHUNK) chunks.push(b64.slice(i, i + CHUNK));

const body = `/**
 * GERADO POR scripts/generate-xerces-wasm.mjs — NÃO EDITAR À MÃO.
 *
 * Binário WebAssembly do validador Apache Xerces-C++ (${PACKAGE}), embutido em
 * base64 para que a Edge Function \`fiscal-xml-engine\` não dependa de
 * \`static_files\`, disco ou rede em runtime.
 */
export const XERCES_WASM_PACKAGE = ${JSON.stringify(PACKAGE)} as const;
export const XERCES_WASM_SHA256 = ${JSON.stringify(EXPECTED_SHA256)} as const;
export const XERCES_WASM_BYTES = ${bytes.byteLength} as const;

const CHUNKS: readonly string[] = [
${chunks.map((c) => `  "${c}",`).join("\n")}
];

let cache: Uint8Array | null = null;

/** Decodifica (uma única vez) o binário WASM embutido. */
export function xercesWasmBinary(): Uint8Array {
  if (cache) return cache;
  const b64 = CHUNKS.join("");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  if (out.byteLength !== XERCES_WASM_BYTES) throw new Error("XERCES_WASM_MISMATCH");
  cache = out;
  return out;
}
`;

writeFileSync(OUT, body);
console.log(`ok ${OUT} (${bytes.byteLength} bytes, sha256 ${sha256})`);
