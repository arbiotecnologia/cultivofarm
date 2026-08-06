/**
 * F4.1-R1 — Gate de integridade do bundle XSD versionado.
 *
 * Confere que os arquivos em `supabase/functions/fiscal-xml-engine/xsd/`
 * batem byte a byte com os hashes declarados em `xsd/manifest.json`
 * (extraídos do pacote oficial PL_010e_v1.02). Falha ⇒ exit 1.
 *
 * Uso: deno run -A restoration/fase-f4-1/runtime-harness/xsd-bundle-integrity.ts
 */
import { encodeHex } from "jsr:@std/encoding@1/hex";

const dir = new URL("../../../supabase/functions/fiscal-xml-engine/xsd/", import.meta.url);
const manifest = JSON.parse(await Deno.readTextFile(new URL("manifest.json", dir))) as {
  package_sha256: string;
  files: Array<{ name: string; bytes: number; sha256: string }>;
};

let failures = 0;
for (const f of manifest.files) {
  const bytes = await Deno.readFile(new URL(f.name, dir));
  const sha = encodeHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  const ok = sha === f.sha256 && bytes.byteLength === f.bytes;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${f.name} (${bytes.byteLength} bytes)`);
}
console.log(`BUNDLE ${manifest.package_sha256.slice(0, 12)}…: ${failures === 0 ? "PASS" : "FAIL"}`);
if (failures > 0) Deno.exit(1);
