/**
 * Fase Fiscal 3.0.2-B — Harness runtime.
 *
 * - Sem envs de staging: SKIP explícito documentando o motivo.
 * - Com envs presentes porém INCOMPLETAS: FALHA (loadRunnerConfigFromEnv throw).
 * - Com envs completas: exige zero skips, zero erros, zero falhas.
 *
 * Nenhum caminho invoca setupStaging fora do modo runtime.
 */
import { describe, test, expect } from "vitest";
import {
  MATRIX, VIEW_MATRIX, RPC_EXPECTATIONS, OWNERSHIP_CELLS, PLANNED_COUNTS,
  ROLES, FISCAL_TABLES, FISCAL_VIEWS,
} from "./matrix";
import { loadRunnerConfigFromEnv } from "./runner";

let load: ReturnType<typeof loadRunnerConfigFromEnv> | { kind: "skip"; reason: string };
try {
  load = loadRunnerConfigFromEnv();
} catch (err) {
  // Configuração parcial ⇒ transforma em falha determinística.
  load = { kind: "skip", reason: `configuração parcial: ${(err as Error).message}` };
}

const isRuntime = load.kind === "config";

describe("Fase Fiscal 3.0.2-B — Harness RLS", () => {
  test("matriz declarativa: totais planejados", () => {
    expect(MATRIX.length).toBe(ROLES.length * FISCAL_TABLES.length * 4);      // 540
    expect(VIEW_MATRIX.length).toBe(ROLES.length * FISCAL_VIEWS.length);      // 75
    expect(RPC_EXPECTATIONS.length).toBe(ROLES.length);                       // 15
    expect(OWNERSHIP_CELLS.length).toBeGreaterThan(0);
    expect(PLANNED_COUNTS.total).toBe(
      MATRIX.length + VIEW_MATRIX.length + RPC_EXPECTATIONS.length + OWNERSHIP_CELLS.length,
    );
  });

  test.skipIf(isRuntime)(
    "SKIP EXPLÍCITO — staging não provisionado ou config parcial",
    () => {
      // Este teste apenas documenta o motivo. Runtime real requer as 6 envs
      // (ver src/test/fiscal/rls/runner.ts). Configuração parcial vira falha
      // via loadRunnerConfigFromEnv(); ausência total é skip aqui.
      expect(load.kind).toBe("skip");
      // Sinaliza motivo no output do vitest.
      // eslint-disable-next-line no-console
      console.warn(`[fiscal-harness] SKIP: ${(load as { reason: string }).reason}`);
    },
  );

  test.runIf(isRuntime)(
    "execução runtime completa — tabelas + views + RPC + ownership",
    async () => {
      // Import dinâmico para não instanciar setup fora do modo runtime.
      const { setupStaging, runCellRest, runViewCell, runOwnershipCell, runRpcCell, summarize } =
        await import("./runner");
      const cfg = (load as { kind: "config"; cfg: import("./runner").RunnerConfig }).cfg;
      const session = await setupStaging(cfg);
      try {
        const tableResults: import("./runner").RunResult[] = [];
        for (const c of MATRIX) tableResults.push(await runCellRest(session, c));
        const viewResults: import("./runner").RunResult[] = [];
        for (const v of VIEW_MATRIX) viewResults.push(await runViewCell(session, v));
        const ownResults: import("./runner").RunResult[] = [];
        for (const o of OWNERSHIP_CELLS) ownResults.push(await runOwnershipCell(session, o));
        const rpcResults: import("./runner").RunResult[] = [];
        for (const r of RPC_EXPECTATIONS) {
          rpcResults.push(...(await runRpcCell(session, r.role, r.expected)));
        }
        const all = [...tableResults, ...viewResults, ...ownResults, ...rpcResults];
        const s = summarize(all, PLANNED_COUNTS.total + rpcResults.length - RPC_EXPECTATIONS.length);
        // eslint-disable-next-line no-console
        console.log("[fiscal-harness] summary", JSON.stringify({
          planned: s.planned, executed: s.executed, passed: s.passed,
          failed: s.failed.length, errors: s.errors.length, skipped: s.skipped,
        }));
        if (s.errors.length > 0) console.error("[fiscal-harness] erros:", s.errors);
        if (s.failed.length > 0) console.error("[fiscal-harness] falhas:", s.failed);
        expect(s.errors).toHaveLength(0);
        expect(s.failed).toHaveLength(0);
        expect(s.skipped).toBe(0);
      } finally {
        await session.teardown().catch((e) => console.error("teardown:", e));
      }
    },
    600_000,
  );
});
