import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9 — gate estático dos forwards aplicados FORA de `supabase/migrations/`.
 *
 * A plataforma bloqueou a escrita direta em `supabase/migrations/` durante a H9-C, então o
 * forward `20261005000000_h9c1_least_privilege_secdef_v1` aplicado em homologação vive em
 * `restoration/homologacao-h9/h9c-forwards/`. Varrer apenas `supabase/migrations/` na promoção
 * perderia essa alteração — por isso ela é rastreada aqui, com hash e versão conferidos, e
 * marcada como obrigatória no bundle de promoção.
 *
 * Este manifesto é o oposto do manifesto repo-only da H7P: lá são 59 migrations proibidas de
 * aplicar; aqui são forwards já aplicados e obrigatórios. Os dois conjuntos não podem se cruzar.
 */
const ROOT = resolve(__dirname, "../../..");
const MANIFEST = resolve(ROOT, "restoration/homologacao-h9/h9c-applied-forwards.json");
const REPO_ONLY = resolve(ROOT, "restoration/homologacao-h7/h7p-repo-only-manifest.json");

interface AppliedForward {
  version: string;
  path: string;
  sha256: string;
  rollback_path: string;
  rollback_sha256: string;
  applied_to_staging: boolean;
  registered_in_ledger: boolean;
  required_in_promotion_bundle: boolean;
  repo_only_quarantined: boolean;
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  ambiente: string;
  ledger_versoes: number;
  total_applied_forwards: number;
  entries: AppliedForward[];
};
const repoOnly = JSON.parse(readFileSync(REPO_ONLY, "utf8")) as {
  ledger_versoes: number;
  total_repo_only: number;
  entries: { version: string }[];
};

const sha256 = (p: string) =>
  createHash("sha256").update(readFileSync(resolve(ROOT, p))).digest("hex");

describe("H9 — forwards aplicados fora de supabase/migrations", () => {
  it("declara o ambiente de homologação e o ledger corrente", () => {
    expect(manifest.ambiente).toContain("ikaauvsflpmamgxmkhoq");
    expect(manifest.ledger_versoes).toBe(684);
    expect(manifest.ledger_versoes).toBe(repoOnly.ledger_versoes);
    expect(manifest.entries).toHaveLength(manifest.total_applied_forwards);
  });

  it("cada forward existe em disco e o hash confere", () => {
    for (const e of manifest.entries) {
      expect(sha256(e.path)).toBe(e.sha256);
      expect(sha256(e.rollback_path)).toBe(e.rollback_sha256);
    }
  });

  it("as versões 20261005000000, 20261006000000 e 20261007000000 aparecem exatamente uma vez", () => {
    for (const v of ["20261005000000", "20261006000000", "20261007000000"]) {
      expect(manifest.entries.filter((e) => e.version === v)).toHaveLength(1);
    }
    const versions = manifest.entries.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("está aplicada em staging e é obrigatória no bundle de promoção", () => {
    for (const e of manifest.entries) {
      expect(e.applied_to_staging).toBe(true);
      expect(e.registered_in_ledger).toBe(true);
      expect(e.required_in_promotion_bundle).toBe(true);
    }
  });

  it("não se confunde com as 59 repo-only bloqueadas", () => {
    expect(repoOnly.total_repo_only).toBe(59);
    const quarantined = new Set(repoOnly.entries.map((e) => e.version));
    for (const e of manifest.entries) {
      expect(e.repo_only_quarantined).toBe(false);
      expect(quarantined.has(e.version)).toBe(false);
    }
  });

  it("o caminho do forward fica fora de supabase/migrations", () => {
    for (const e of manifest.entries) {
      expect(e.path.startsWith("restoration/")).toBe(true);
      expect(e.path).not.toContain("supabase/migrations");
    }
  });
});
