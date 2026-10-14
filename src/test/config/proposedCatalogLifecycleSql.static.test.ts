import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// Guarda ESTRUTURAL do texto do candidato; não executa SQL e não é prova de banco.
const sql = readFileSync(resolve(__dirname, "../../../scripts/rbac-audit/proposed-platform-catalog-global-lifecycle.sql"), "utf8");
describe("candidato SQL de ciclo de vida global (texto)", () => {
  it("preflight usa os nomes reais dos triggers de código", () => {
    expect(sql).toContain("'trg_set_codigo_produto_ins','trg_set_codigo_produto_upd'");
    expect(sql).not.toMatch(/tgname='trg_set_codigo_produto'/);
  });
  it("não usa comparação ternária de tipo JSON", () => {
    expect(sql).not.toMatch(/jsonb_typeof\([^)]*\)\s*(<>|NOT IN)/);
  });
  it("UUID estrito, volume obrigatório e snapshot no ledger", () => {
    expect(sql).toContain("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    expect(sql).toContain("v_vol IS NULL");
    expect(sql).toContain("'after',v_snapshot");
  });
  it("auditoria termina com ponto e vírgula antes do RETURN", () => {
    expect(sql).toMatch(/'after',v_snapshot\),pg_catalog\.clock_timestamp\(\)\);\s*RETURN v_receipt;/);
  });
  it("status confirma id, ativo e versão avançada; não concede CRUD de tabela", () => {
    expect(sql).toContain("v_new.ativo IS DISTINCT FROM p_ativo");
    expect(sql).toContain("v_new.updated_at <= v_old.updated_at");
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON\s+(TABLE\s+)?public\./i);
  });
});
