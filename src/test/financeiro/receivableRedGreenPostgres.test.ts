import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('reproduz P0 red e conserva financiamento e eventos green apenas no PG descartável', async () => {
  const { stdout: output } = await promisify(execFile)('python3', [
    'scripts/financial-installments-initial-20261024/test-receivable-red-green.py',
  ], { encoding: 'utf8', timeout: 180_000 });
  const result = JSON.parse(output.trim().split('\n').at(-1) ?? '{}');
  expect(result.FAIL).toBe(0);
  expect(result.PASS).toBe(37);
}, 180_000);