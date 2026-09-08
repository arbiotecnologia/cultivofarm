import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-B1 — garante que a correção da RPC pública de rastreio permaneça no repositório
 * com o rate-limit aplicado ANTES de qualquer leitura ou escrita, e com rollback nominal.
 * Ambiente alvo: homologação. Produção permanece proibida.
 */
const FORWARD = resolve(
  process.cwd(),
  "supabase/migrations/20261004000000_h9b1_rate_limit_rastreio_v1.sql",
);
const ROLLBACK = resolve(
  process.cwd(),
  "restoration/homologacao-h9/h9b-rollbacks/20261004000000_h9b1_rate_limit_rastreio_v1_rollback.sql",
);

describe("H9-B1 — rate-limit da validação pública de rastreio", () => {
  it("forward e rollback existem", () => {
    expect(existsSync(FORWARD)).toBe(true);
    expect(existsSync(ROLLBACK)).toBe(true);
  });

  it("forward é idempotente, SECURITY DEFINER e com search_path fixo", () => {
    const sql = readFileSync(FORWARD, "utf8");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.rpc_validar_rastreio_produto");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toMatch(/SET search_path TO 'public'/);
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });

  it("aplica private.fn_public_validation_rate_check antes da leitura da etiqueta", () => {
    const sql = readFileSync(FORWARD, "utf8");
    const rate = sql.indexOf("private.fn_public_validation_rate_check");
    const read = sql.indexOf("FROM public.produto_etiquetas WHERE trace_token");
    const insert = sql.indexOf("INSERT INTO public.produto_etiqueta_consultas");
    expect(rate).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(rate);
    expect(insert).toBeGreaterThan(rate);
    expect(sql).toContain("rate_limited");
  });

  it("rollback restaura a versão sem o gate H9-B1", () => {
    const sql = readFileSync(ROLLBACK, "utf8");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.rpc_validar_rastreio_produto");
    expect(sql).not.toContain("H9-B1:");
  });

  it("não contém referência ao projeto de produção", () => {
    for (const f of [FORWARD, ROLLBACK]) {
      expect(readFileSync(f, "utf8")).not.toContain("navfzbwgwzruipouyfnk");
    }
  });
});
