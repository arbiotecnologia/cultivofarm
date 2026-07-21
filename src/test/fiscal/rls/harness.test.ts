/**
 * Fase Fiscal 3.0.1 — vitest do harness RLS.
 *
 * Sem envs de staging: skip explícito com aviso. Nunca executa em produção.
 */
import { describe, test, expect } from "vitest";
import {
  MATRIX, VIEW_MATRIX, RPC_EXPECTATIONS, ROLES, FISCAL_TABLES, FISCAL_VIEWS,
} from "./matrix";
import {
  loadRunnerConfigFromEnv, runCellRest, runViewCell, runRpcCell, summarize,
} from "./runner";

const cfg = loadRunnerConfigFromEnv();

describe("Fase Fiscal 3.0.1 — Harness RLS runtime", () => {
  test("matriz estática: 15 × 9 × 4 = 540 células + views + RPCs", () => {
    expect(MATRIX.length).toBe(ROLES.length * FISCAL_TABLES.length * 4);
    expect(VIEW_MATRIX.length).toBe(ROLES.length * FISCAL_VIEWS.length);
    expect(RPC_EXPECTATIONS.length).toBe(ROLES.length);
  });

  test.runIf(cfg !== null)("execução runtime — tabelas", async () => {
    if (!cfg) return;
    const results = await Promise.all(MATRIX.map((c) => runCellRest(cfg, c)));
    const s = summarize(results);
    if (s.failed.length > 0) console.error("[RLS tabelas] falhas:", s.failed);
    if (s.errors.length > 0) console.error("[RLS tabelas] erros:", s.errors);
    expect(s.errors).toHaveLength(0);
    expect(s.failed).toHaveLength(0);
  }, 180_000);

  test.runIf(cfg !== null)("execução runtime — views", async () => {
    if (!cfg) return;
    const results = await Promise.all(VIEW_MATRIX.map((c) => runViewCell(cfg, c)));
    const s = summarize(results);
    if (s.failed.length > 0) console.error("[RLS views] falhas:", s.failed);
    expect(s.errors).toHaveLength(0);
    expect(s.failed).toHaveLength(0);
  }, 60_000);

  test.runIf(cfg !== null)("execução runtime — RPC rpc_fiscal_event_manual", async () => {
    if (!cfg) return;
    const results = await Promise.all(
      RPC_EXPECTATIONS.map((c) => runRpcCell(cfg, c.role, c.rpc, c.expected)),
    );
    const s = summarize(results);
    if (s.failed.length > 0) console.error("[RLS RPC] falhas:", s.failed);
    expect(s.errors).toHaveLength(0);
    expect(s.failed).toHaveLength(0);
  }, 60_000);

  test.skipIf(cfg !== null)(
    "EXECUÇÃO RUNTIME PENDENTE EM STAGING — defina PGURL_STAGING/PGREST_STAGING/PGREST_ANON_KEY + FISCAL_TEST_ENV=STAGING + JWT_<ROLE> + FIXTURE_<TABLE>_ID",
    () => {
      expect(true).toBe(true);
    },
  );
});
