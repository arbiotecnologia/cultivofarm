import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * Baterias de PostgreSQL descartável (~60 s isoladas) estouravam o próprio timeout quando a suíte integral
 * as iniciava todas juntas com os workers jsdom. Este semáforo entre processos limita quantas rodam ao mesmo tempo;
 * o timeout de execução de cada bateria continua o original e só começa depois de obter a vaga.
 */
export const PG_BATTERY_SLOTS = Math.min(4, Math.max(2, Math.floor(cpus().length / 4)));
const ROOT = join(tmpdir(), "cultivo-pg-battery-slots");
/** Folga de fila somada ao timeout do teste (nunca ao da bateria). */
export const pgBatteryTestTimeout = (executionMs: number) => executionMs + 1_200_000;

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function acquire(): Promise<string> {
  mkdirSync(ROOT, { recursive: true });
  for (;;) {
    for (let i = 0; i < PG_BATTERY_SLOTS; i++) {
      const slot = join(ROOT, `slot-${i}`);
      try {
        mkdirSync(slot);
        writeFileSync(join(slot, "pid"), String(process.pid));
        return slot;
      } catch {
        try {
          const pid = Number(readFileSync(join(slot, "pid"), "utf8"));
          if (pid && !alive(pid)) rmSync(slot, { recursive: true, force: true });
        } catch { /* vaga sendo criada por outro processo */ }
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function runPgBattery(file: string, args: string[], options: Parameters<typeof execFile>[2] & { timeout?: number } = {}) {
  const slot = await acquire();
  try {
    return await promisify(execFile)(file, args, { encoding: "utf8", ...options } as { encoding: "utf8" });
  } finally {
    rmSync(slot, { recursive: true, force: true });
  }
}
