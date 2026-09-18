import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Incidente pós-corte: os harnesses de runtime são MUTANTES (criam usuários e
 * fixtures reais) e nunca existiram implantados no projeto canônico. Como a
 * plataforma republica todas as funções automaticamente, a única proteção
 * confiável é uma trava server-side no próprio código.
 *
 * Estes testes verificam a ORDEM da trava (antes de autenticar, ler corpo ou
 * consultar dados) e a SAÍDA (410 com código explícito). Nenhum harness é
 * executado — a verificação é estática sobre o entrypoint.
 */

const ROOT = resolve(__dirname, "../../..");

const HARNESSES = [
  {
    name: "entrega-runtime-harness",
    path: "supabase/functions/entrega-runtime-harness/index.ts",
    code: "ENTREGA_HARNESS_DISABLED_CANONICAL_TARGET",
  },
  {
    name: "fase-e-runtime-harness",
    path: "supabase/functions/fase-e-runtime-harness/index.ts",
    code: "FASE_E_HARNESS_DISABLED_CANONICAL_TARGET",
  },
] as const;

const FORBIDDEN_REFS = [
  "yzszlzjpovmcteuxjznj",
  "chkgpuawcswhefiabwsm",
  "navfzbwgwzruipouyfnk",
  "ikaauvsflpmamgxmkhoq",
];

describe.each(HARNESSES)("$name — trava canônica fail-closed", (h) => {
  const src = readFileSync(resolve(ROOT, h.path), "utf8");
  const serveIdx = src.indexOf("Deno.serve(");
  const handler = src.slice(serveIdx);
  const guardIdx = handler.indexOf("isCanonicalSupabaseUrl(SUPABASE_URL)");

  it("importa o alvo canônico compartilhado, sem literal duplicado", () => {
    expect(src).toContain(
      'import { isCanonicalSupabaseUrl } from "../_shared/fiscal/canonicalProject.ts"',
    );
  });

  it("aplica a trava dentro do handler", () => {
    expect(serveIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(-1);
  });

  it("responde 410 com código explícito", () => {
    const block = handler.slice(guardIdx, guardIdx + 500);
    expect(block).toContain("status: 410");
    expect(block).toContain(h.code);
  });

  it("OPTIONS responde 204 antes da trava (preflight CORS preservado)", () => {
    const optionsIdx = handler.indexOf('req.method === "OPTIONS"');
    expect(optionsIdx).toBeGreaterThan(-1);
    expect(optionsIdx).toBeLessThan(guardIdx);
    expect(handler.slice(optionsIdx, guardIdx)).toContain("status: 204");
  });

  it("a trava precede qualquer autenticação por segredo ou chave de serviço", () => {
    for (const marker of ["INTERNAL_SECRET", "x-internal-secret"]) {
      const idx = handler.indexOf(marker);
      if (idx === -1) continue;
      expect(
        guardIdx,
        `trava deve preceder "${marker}" no handler`,
      ).toBeLessThan(idx);
    }
  });

  it("a trava precede leitura de corpo e qualquer acesso a dados no handler", () => {
    for (const marker of ["req.json(", "await run(", "svc.", ".from(", ".rpc("]) {
      const idx = handler.indexOf(marker);
      if (idx === -1) continue;
      expect(
        guardIdx,
        `trava deve preceder "${marker}" no handler`,
      ).toBeLessThan(idx);
    }
  });

  it("não cria allowlist alternativa nem fallback para projetos antigos", () => {
    for (const ref of FORBIDDEN_REFS) expect(src).not.toContain(ref);
    expect(src).not.toMatch(/allowlist|ALLOWED_PROJECTS|FALLBACK_URL/i);
  });
});

describe("hml-b2b-runtime-harness — stub preservado", () => {
  const src = readFileSync(
    resolve(ROOT, "supabase/functions/hml-b2b-runtime-harness/index.ts"),
    "utf8",
  );

  it("permanece stub autocontido e inerte", () => {
    expect(src).toContain("410");
    expect(src).toContain("HML_HARNESS_DISABLED_NON_CANONICAL_TARGET");
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toContain("createClient");
    expect(src).not.toContain("Deno.env");
  });
});
