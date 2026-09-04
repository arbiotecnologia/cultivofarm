import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * FASE H7P — gate estático contra reaplicação das migrations repo-only.
 *
 * O ledger do staging autorizado tem 658 versões (654 em H7P + 3 aplicadas na fase
 * H8-A: duplicate_index, auth_rls_initplan e policies redundantes + 1 aplicada na H8-B1); o repositório tem mais
 * arquivos do que isso. As 59 migrations excedentes foram reconciliadas na
 * H7P e NENHUMA delas deve ser aplicada:
 *   - 36 já refletidas semanticamente no catálogo;
 *   -  3 superadas por definições mais recentes já vigentes no banco;
 *   - 20 pertencentes a um backend estranho (Cloud sandbox) — conflitantes.
 *
 * Este teste falha se o manifesto divergir do repositório, para que uma
 * aplicação em lote acidental (`db push` ou runner genérico) seja detectada
 * antes de tocar o banco.
 */

const ROOT = resolve(__dirname, "../../..");
const MANIFEST = resolve(
  ROOT,
  "restoration/homologacao-h7/h7p-repo-only-manifest.json",
);
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");

interface Entry {
  version: string;
  file: string;
  sha256: string;
  classification: string;
  apply_to_staging: boolean;
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  total_repo_only: number;
  ledger_versoes: number;
  entries: Entry[];
};

const sha256 = (p: string) =>
  createHash("sha256").update(readFileSync(p)).digest("hex");

describe("H7P — manifesto de migrations repo-only", () => {
  it("declara exatamente 59 entradas contra o ledger de 658 versões", () => {
    expect(manifest.ledger_versoes).toBe(658);
    expect(manifest.total_repo_only).toBe(59);
    expect(manifest.entries).toHaveLength(59);
  });

  it("nenhuma entrada está autorizada a ser aplicada no staging", () => {
    const applicable = manifest.entries.filter((e) => e.apply_to_staging);
    expect(applicable.map((e) => e.file)).toEqual([]);
  });

  it("todo arquivo do manifesto existe e mantém o conteúdo auditado", () => {
    const drift = manifest.entries.filter((e) => {
      const p = resolve(MIGRATIONS_DIR, e.file);
      try {
        return sha256(p) !== e.sha256;
      } catch {
        return true;
      }
    });
    expect(drift.map((e) => e.file)).toEqual([]);
  });

  it("as 20 migrations do backend estranho seguem em quarentena", () => {
    const foreign = manifest.entries.filter(
      (e) => e.classification === "CONFLITANTE_BACKEND_ESTRANHO",
    );
    expect(foreign).toHaveLength(20);
    expect(foreign.every((e) => e.version.startsWith("20260812"))).toBe(true);
  });

  it("classificações usam apenas o vocabulário homologado na H7P", () => {
    const allowed = new Set([
      "CONFLITANTE_BACKEND_ESTRANHO",
      "SUPERSEDED_DB_A_FRENTE",
      "REFLETIDA_SEMANTICAMENTE_NO_CATALOGO",
    ]);
    const invalid = manifest.entries
      .map((e) => e.classification)
      .filter((c) => !allowed.has(c));
    expect(invalid).toEqual([]);
  });

  it("cada versão do manifesto é única e corresponde ao prefixo do arquivo", () => {
    const versions = manifest.entries.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
    const mismatched = manifest.entries.filter(
      (e) => !e.file.startsWith(`${e.version}_`),
    );
    expect(mismatched).toEqual([]);
  });

  it("o repositório não ganhou novas migrations fora do ledger sem reconciliação", () => {
    const repoVersions = readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d{14}_.+\.sql$/.test(f))
      .map((f) => f.slice(0, 14));
    // 658 aplicadas + 59 reconciliadas = 717. Qualquer arquivo novo posterior
    // é legítimo apenas se também tiver sido aplicado (ledger cresce junto).
    const known = manifest.ledger_versoes + manifest.total_repo_only;
    expect(repoVersions.length).toBeLessThanOrEqual(known);
  });
});
