import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('nega cancelamento estrangeiro e reproduz oráculo antes da transformação offline', () => {
  const output = execFileSync('python3', [
    'scripts/financial-installments-initial-20261024/test-cancel-authorization.py',
  ], { encoding: 'utf8', timeout: 180_000 });
  const result = JSON.parse(output.trim().split('\n').at(-1) ?? '{}');
  expect(result.FAIL).toBe(0);
  expect(result.PASS).toBe(55);
}, 180_000);