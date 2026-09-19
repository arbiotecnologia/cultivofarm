/**
 * xsd-selftest — diagnóstico seguro e somente leitura do bundle XSD no
 * runtime de `fiscal-xml-engine`.
 *
 * Prova por inspeção estática (o módulo é Deno e não roda no vitest):
 *  - ordem dos gates: CORS → método → Bearer → projeto canônico → parse do
 *    body → selftest; claims e perfil fiscal só depois;
 *  - ausência de parse duplo do body;
 *  - o selftest executa a validação XSD real e só aceita sucesso com
 *    valid=false e ao menos um erro (fail-closed);
 *  - resposta limitada a metadados não sensíveis;
 *  - nenhuma escrita (banco/Storage) dentro do ramo do selftest;
 *  - verify_jwt=true e static_files do bundle preservados no config.toml.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const INDEX = readFileSync(
  resolve(ROOT, "supabase/functions/fiscal-xml-engine/index.ts"),
  "utf8",
);
const TOML = readFileSync(resolve(ROOT, "supabase/config.toml"), "utf8");
const INTEGRITY = readFileSync(
  resolve(ROOT, "supabase/functions/fiscal-xml-engine/xsdBundleIntegrity.ts"),
  "utf8",
);
const XSD_VALIDATE = readFileSync(
  resolve(ROOT, "supabase/functions/fiscal-xml-engine/xsdValidate.ts"),
  "utf8",
);

function blockOf(toml: string, name: string): string | null {
  const match = toml.match(new RegExp(`\\[functions\\.${name}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
  if (!match) return null;
  return match[1].split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");
}

const pos = (needle: string) => INDEX.indexOf(needle);

describe("fiscal-xml-engine — ordem dos gates do xsd-selftest", () => {
  it("selftest aparece após CORS, método, Bearer, gate canônico e parse do body", () => {
    const selftest = pos('action === "xsd-selftest"');
    expect(selftest).toBeGreaterThan(-1);
    expect(pos('req.method === "OPTIONS"')).toBeLessThan(selftest);
    expect(pos('req.method !== "POST"')).toBeLessThan(selftest);
    expect(pos('authHeader?.startsWith("Bearer ")')).toBeLessThan(selftest);
    expect(pos("isCanonicalSupabaseUrl(supabaseUrl)")).toBeLessThan(selftest);
    expect(pos("await req.json()")).toBeLessThan(selftest);
  });

  it("claims e perfil fiscal só são exigidos depois do ramo do selftest", () => {
    const selftest = pos('action === "xsd-selftest"');
    expect(pos("authed.auth.getClaims")).toBeGreaterThan(selftest);
    expect(pos('authed.rpc("fn_fiscal_can_operate"')).toBeGreaterThan(selftest);
  });

  it("body é parseado exatamente uma vez (sem parse duplo)", () => {
    expect(INDEX.match(/await req\.json\(\)/g)?.length).toBe(1);
  });

  it("download e generate permanecem roteados após os gates de identidade", () => {
    const selftest = pos('action === "xsd-selftest"');
    expect(pos('action === "download"')).toBeGreaterThan(selftest);
    expect(pos('action !== "generate"')).toBeGreaterThan(selftest);
  });
});

describe("fiscal-xml-engine — comportamento fail-closed do selftest", () => {
  it("chama o validador XSD real com o XML mínimo deliberadamente inválido", () => {
    const selftestBlock = INDEX.slice(
      pos('action === "xsd-selftest"'),
      pos("Cliente do usuário: toda autorização"),
    );
    expect(selftestBlock).toContain("validateAgainstOfficialXsd(XSD_SELFTEST_XML)");
    const probe = INDEX.match(/const XSD_SELFTEST_XML =[\s\S]*?';\n/);
    expect(probe).toBeTruthy();
    expect(probe?.[0]).toContain("xsdSelfTestProbe");
  });

  it("só considera sucesso quando valid=false e há ao menos um erro XSD", () => {
    const selftestBlock = INDEX.slice(
      pos('action === "xsd-selftest"'),
      pos("authed.auth.getClaims"),
    );
    expect(selftestBlock).toContain("probe.valid === false");
    expect(selftestBlock).toContain("(probe.issues?.length ?? 0) > 0");
  });

  it("ausência/erro do bundle responde 500 com XSD_BUNDLE_UNAVAILABLE", () => {
    const selftestBlock = INDEX.slice(
      pos('action === "xsd-selftest"'),
      pos("authed.auth.getClaims"),
    );
    expect(selftestBlock.match(/XSD_BUNDLE_UNAVAILABLE/g)?.length).toBe(4);
    expect(selftestBlock).toContain("catch");
    expect(selftestBlock).toContain("500");
  });

  it("inspeciona o bundle (somente leitura) antes de executar o validador", () => {
    const selftest = pos('action === "xsd-selftest"');
    const inspect = INDEX.indexOf("inspectOfficialXsdBundle()", selftest);
    const validate = INDEX.indexOf("validateAgainstOfficialXsd(XSD_SELFTEST_XML)", selftest);
    expect(inspect).toBeGreaterThan(selftest);
    expect(validate).toBeGreaterThan(inspect);
  });

  it("diagnóstico é enum sanitizado, sem mensagem ou stack crus", () => {
    const selftestBlock = INDEX.slice(
      pos('action === "xsd-selftest"'),
      pos("Cliente do usuário: toda autorização"),
    );
    expect(selftestBlock).toContain('diagnostic: "XSD_BUNDLE_CHECK_FAILED"');
    expect(selftestBlock).toContain('diagnostic: "XSD_VALIDATOR_MEMORY_OR_WASM_FAILED"');
    expect(selftestBlock).not.toMatch(/catch\s*\(\s*\w+\s*\)/);
    expect(selftestBlock).not.toMatch(/\.stack|String\(err|err\.message|\bmessage:\s*\w/);
  });

  it("sucesso responde apenas metadados não sensíveis", () => {
    const selftestBlock = INDEX.slice(
      pos('action === "xsd-selftest"'),
      pos("authed.auth.getClaims"),
    );
    expect(selftestBlock).toContain("ok: true");
    expect(selftestBlock).toContain("validator: probe.validator");
    expect(selftestBlock).toContain("package: probe.package");
    expect(selftestBlock).toContain("schema: probe.schema");
    expect(selftestBlock).toContain("loadedFiles: XSD_SELFTEST_EXPECTED_FILES");
    // Nenhum conteúdo cru vazando no ramo de sucesso.
    expect(selftestBlock).not.toContain("probe.issues[");
    expect(selftestBlock).not.toContain("XSD_SELFTEST_XML.slice");
  });

  it("contagem de arquivos vem do bundle real (5 XSDs)", () => {
    expect(XSD_VALIDATE).toMatch(/export const XSD_FILE_COUNT = XSD_FILES\.length/);
    const files = INTEGRITY.match(/XSD_FILES = \[([\s\S]*?)\] as const/);
    expect(files?.[1]?.match(/\.xsd/g)?.length).toBe(5);
    expect(INDEX).toContain("const XSD_SELFTEST_EXPECTED_FILES = XSD_FILE_COUNT");
  });

  it("ramo do selftest não toca banco nem Storage", () => {
    const selftestBlock = INDEX.slice(
      pos('action === "xsd-selftest"'),
      pos("Cliente do usuário: toda autorização"),
    );
    expect(selftestBlock).not.toMatch(/\.from\(|\.storage\.|createClient|\.rpc\(/);
  });
});

describe("config.toml — proteção do gateway e bundle XSD preservados", () => {
  it("fiscal-xml-engine mantém verify_jwt = true", () => {
    expect(blockOf(TOML, "fiscal-xml-engine")).toContain("verify_jwt = true");
  });

  it("fiscal-xml-engine mantém static_files com os 5 XSDs e o manifesto", () => {
    const block = blockOf(TOML, "fiscal-xml-engine");
    expect(block).toContain("static_files");
    expect(block).toContain("./functions/fiscal-xml-engine/xsd/*.xsd");
    expect(block).toContain("./functions/fiscal-xml-engine/xsd/manifest.json");
  });
});
