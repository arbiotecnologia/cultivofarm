import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

// O RPC worker→principal do Vitest (birpc) expira em 60 s. Uma chamada síncrona de
// subprocesso bloqueia o event loop do worker; acima de 60 s o timer dispara antes da
// resposta e gera "Timeout calling onTaskUpdate". Ensaios longos devem usar execFile assíncrono.
const WORKER_RPC_TIMEOUT_MS = 60_000;
const SYNC_CALL = /\b(execFileSync|spawnSync|execSync)\s*\(/;

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return testFiles(full);
    return /\.(test|spec)\.tsx?$/.test(name) ? [full] : [];
  });
}

function allowances(source: string): number[] {
  const values = [
    ...source.matchAll(/\},\s*([0-9_]+)\s*\)/g),
    ...source.matchAll(/timeout:\s*([0-9_]+)/g),
  ].map((match) => Number(match[1].replace(/_/g, "")));
  return values;
}

it("nenhum teste com subprocesso síncrono admite espera acima do timeout RPC do worker", () => {
  const offenders = testFiles(path.resolve(__dirname, ".."))
    .filter((file) => path.resolve(file) !== path.resolve(__filename))
    .filter((file) => SYNC_CALL.test(readFileSync(file, "utf8")))
    .map((file) => ({ file: path.relative(process.cwd(), file), max: Math.max(0, ...allowances(readFileSync(file, "utf8"))) }))
    .filter(({ max }) => max > WORKER_RPC_TIMEOUT_MS);
  expect(offenders).toEqual([]);
});

it("o detector reconhece um ensaio síncrono longo", () => {
  const sample = 'execFileSync("python3", ["x.py"], { timeout: 180_000 });\n}, 180_000);';
  expect(SYNC_CALL.test(sample)).toBe(true);
  expect(Math.max(...allowances(sample))).toBe(180_000);
});
