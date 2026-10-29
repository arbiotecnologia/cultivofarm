import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('nega cancelamento estrangeiro e reproduz oráculo antes da transformação offline', () => {
  const outputDir = join(mkdtempSync(join(tmpdir(), 'cancel-vitest-')), 'results');
  const output = execFileSync('python3', [
    'scripts/financial-installments-initial-20261024/test-cancel-authorization.py',
    '--output-dir', outputDir,
  ], { encoding: 'utf8', timeout: 180_000 });
  const result = JSON.parse(output.trim().split('\n').at(-1) ?? '{}');
  expect(result.FAIL).toBe(0);
  expect(result.PASS).toBe(189);
  const evidence = JSON.parse(readFileSync(join(outputDir, 'results.json'), 'utf8'));
  expect(evidence.races).toHaveLength(14);
  const green = evidence.races.filter((row: { test: string }) => row.test.startsWith('GREEN_OFFLINE_ONLY'));
  expect(green).toHaveLength(4);
  for (const row of green) {
    expect(row.wait.wait_event_type).toBe('Lock');
    expect(row.wait.blockers.length).toBeGreaterThan(0);
    expect(row.error).toEqual(['42501', 'FINANCIAL_SCOPE_DENIED']);
    expect(row.state_unchanged).toBe(true);
  }
}, 180_000);