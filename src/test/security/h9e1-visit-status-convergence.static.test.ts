import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-E1 — gate estático da convergência do fluxo de início/encerramento de visita.
 *
 * Dois forwards aplicados uma única vez em homologação (ledger 675 -> 677):
 *   20261020000000 — matriz de `validate_registro_status_transition` passa a reconhecer
 *                    o estado `em_andamento`, que já existia no enum e era gravado por
 *                    `start_technical_visit_secure`.
 *   20261021000000 — `finish_technical_visit_secure` qualifica `visita_diagnosticos.registro_id`
 *                    com alias, eliminando a colisão 42702 com o parâmetro OUT homônimo.
 *
 * O teste falha se o SQL versionado divergir do manifesto, se a correção perder qualquer
 * bloqueio preservado, ou se algum artefato abrir permissão para PUBLIC/anon.
 */
const ROOT = resolve(__dirname, "../../..");
const MANIFEST = resolve(ROOT, "restoration/homologacao-h9/h9c-applied-forwards.json");

interface Entry {
  version: string;
  name: string;
  fase?: string;
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
  ledger_versoes: number;
  total_applied_forwards: number;
  entries: Entry[];
};

const h9e1 = manifest.entries.filter((e) => e.fase === "H9-E1");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const sha256 = (p: string) =>
  createHash("sha256").update(readFileSync(resolve(ROOT, p))).digest("hex");

const TRIGGER = h9e1.find((e) => e.version === "20261020000000")!;
const FINISH = h9e1.find((e) => e.version === "20261021000000")!;

describe("H9-E1 — convergência do fluxo de visita", () => {
  it("registra exatamente dois forwards no ledger 679", () => {
    expect(manifest.ledger_versoes).toBe(683);
    expect(manifest.total_applied_forwards).toBe(manifest.entries.length);
    expect(h9e1.map((e) => e.version)).toEqual([
      "20261020000000",
      "20261021000000",
    ]);
  });

  it("forwards e rollbacks existem em disco com hash conferido", () => {
    for (const e of h9e1) {
      expect(sha256(e.path)).toBe(e.sha256);
      expect(sha256(e.rollback_path)).toBe(e.rollback_sha256);
      expect(e.applied_to_staging).toBe(true);
      expect(e.registered_in_ledger).toBe(true);
      expect(e.required_in_promotion_bundle).toBe(true);
      expect(e.repo_only_quarantined).toBe(false);
      expect(e.path.startsWith("restoration/homologacao-h9/h9e-forwards/")).toBe(true);
    }
  });

  it("nenhum artefato abre PUBLIC ou anon, e todos revogam explicitamente", () => {
    for (const e of h9e1) {
      for (const sql of [read(e.path), read(e.rollback_path)]) {
        expect(sql).toContain("REVOKE ALL ON FUNCTION");
        expect(sql).toContain("FROM PUBLIC");
        expect(sql).toContain("FROM anon");
        expect(sql).not.toMatch(/GRANT[^;]*TO[^;]*\banon\b/);
        expect(sql).not.toMatch(/GRANT[^;]*TO\s+PUBLIC/);
        expect(sql).toContain("SET search_path TO 'public'");
      }
    }
  });

  it("os artefatos não trazem transação própria (incidente da L7)", () => {
    for (const e of h9e1) {
      for (const sql of [read(e.path), read(e.rollback_path)]) {
        expect(sql).not.toMatch(/^\s*BEGIN;/m);
        expect(sql).not.toMatch(/^\s*COMMIT;/m);
      }
    }
  });

  it("a matriz corrigida admite em_andamento e preserva os demais bloqueios", () => {
    const fw = read(TRIGGER.path);
    expect(fw).toContain(
      "WHEN OLD.status::text = 'rascunho' AND NEW.status::text IN ('em_andamento', 'finalizado', 'arquivado') THEN TRUE",
    );
    expect(fw).toContain(
      "WHEN OLD.status::text = 'em_andamento' AND NEW.status::text IN ('finalizado', 'arquivado') THEN TRUE",
    );
    // exigência de problema_principal passa a cobrir também o novo caminho
    expect(fw).toContain(
      "IF NEW.status::text = 'finalizado' AND OLD.status::text IN ('rascunho', 'em_andamento') THEN",
    );
    // bloqueios preservados
    expect(fw).toContain("ELSE FALSE");
    expect(fw).toContain("v_user_role = 'administrador'");
    expect(fw).toContain("registros_consultor_status_log");
    // nenhuma transição nova além das duas declaradas
    const linhas = fw.match(/WHEN OLD\.status::text/g) ?? [];
    expect(linhas).toHaveLength(8);
  });

  it("o rollback do trigger volta ao estado sem em_andamento", () => {
    const rb = read(TRIGGER.rollback_path);
    expect(rb).toContain(
      "WHEN OLD.status::text = 'rascunho' AND NEW.status::text IN ('finalizado', 'arquivado') THEN TRUE",
    );
    expect(rb).not.toContain("'em_andamento'");
  });

  it("o encerramento qualifica a coluna ambígua sem mudar o contrato", () => {
    const fw = read(FINISH.path);
    expect(fw).toContain(
      "FROM public.visita_diagnosticos vd WHERE vd.registro_id = v_reg.id;",
    );
    expect(fw).toContain("RETURNS TABLE(registro_id uuid, checkout_id uuid, finalized_at timestamp with time zone)");
    expect(fw).toContain("'visit_not_in_progress:%'");
    expect(fw).toContain("'diagnostico_required'");
    expect(fw).toContain("'not_visit_owner'");

    const rb = read(FINISH.rollback_path);
    expect(rb).toContain(
      "FROM public.visita_diagnosticos WHERE registro_id = v_reg.id;",
    );
  });
});
