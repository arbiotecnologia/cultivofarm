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
  ROLES, FISCAL_TABLES, FISCAL_VIEWS, RPC_CASES_PER_ROLE,
} from "./matrix";
import { loadRunnerConfigFromEnv } from "./runner";

type LoadState =
  | { kind: "skip"; reason: string }
  | { kind: "config"; cfg: import("./runner").RunnerConfig }
  | { kind: "partial"; error: string };

let load: LoadState;
try {
  const r = loadRunnerConfigFromEnv();
  load = r;
} catch (err) {
  load = { kind: "partial", error: (err as Error).message };
}

const isRuntime = load.kind === "config";
const isPartial = load.kind === "partial";
const isSkip = load.kind === "skip";

describe("Fase Fiscal 3.0.2-B.1 — Harness RLS", () => {
  test("matriz declarativa: totais planejados", () => {
    expect(MATRIX.length).toBe(ROLES.length * FISCAL_TABLES.length * 4);
    expect(VIEW_MATRIX.length).toBe(ROLES.length * FISCAL_VIEWS.length);
    expect(RPC_EXPECTATIONS.length).toBe(ROLES.length);
    expect(OWNERSHIP_CELLS.length).toBeGreaterThan(0);
    expect(PLANNED_COUNTS.rpcCells).toBe(ROLES.length * RPC_CASES_PER_ROLE);
    expect(PLANNED_COUNTS.total).toBe(
      MATRIX.length + VIEW_MATRIX.length + PLANNED_COUNTS.rpcCells + OWNERSHIP_CELLS.length,
    );
  });

  test.skipIf(!isPartial)(
    "FALHA — configuração de staging PARCIAL detectada",
    () => {
      // Config parcial NUNCA é convertida em skip.
      expect.fail(`[fiscal-harness] configuração parcial: ${(load as { error: string }).error}`);
    },
  );

  test.skipIf(!isSkip)(
    "SKIP EXPLÍCITO — staging não provisionado (todas as envs ausentes)",
    () => {
      expect(load.kind).toBe("skip");
      console.warn(`[fiscal-harness] SKIP: ${(load as { reason: string }).reason}`);
    },
  );

  test.runIf(isRuntime)(
    "execução runtime completa — tabelas + views + RPC + ownership",
    async () => {
      const { setupStaging, runCellRest, runViewCell, runOwnershipCell, runRpcCell, summarize } =
        await import("./runner");
      const cfg = (load as { kind: "config"; cfg: import("./runner").RunnerConfig }).cfg;
      const session = await setupStaging(cfg);
      try {
        const results: import("./runner").RunResult[] = [];
        for (const c of MATRIX) results.push(await runCellRest(session, c));
        for (const v of VIEW_MATRIX) results.push(await runViewCell(session, v));
        for (const o of OWNERSHIP_CELLS) results.push(await runOwnershipCell(session, o));
        for (const r of RPC_EXPECTATIONS) {
          results.push(...(await runRpcCell(session, r.role, r.expected)));
        }
        const s = summarize(results, PLANNED_COUNTS.total);
        console.log("[fiscal-harness] summary", JSON.stringify({
          planned: s.planned, executed: s.executed, passed: s.passed,
          failed: s.failed.length, errors: s.errors.length, skipped: s.skipped,
        }));
        if (s.errors.length > 0) console.error("[fiscal-harness] erros:", s.errors);
        if (s.failed.length > 0) console.error("[fiscal-harness] falhas:", s.failed);
        expect(s.errors).toHaveLength(0);
        expect(s.failed).toHaveLength(0);
        expect(s.skipped).toBe(0);
        expect(s.executed).toBe(s.planned);
      } finally {
        await session.teardown().catch((e) => console.error("teardown:", e));
      }
    },
    600_000,
  );
});
