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
  expect(result.PASS).toBe(263);
  expect(result.BLOCKED).toBe(1);
  expect(result['NOT RUN']).toBe(1);
  const evidence = JSON.parse(readFileSync(join(outputDir, 'results.json'), 'utf8'));
  expect(evidence.races).toHaveLength(14);
  const green = evidence.races.filter((row: { test: string }) => row.test.startsWith('GREEN_OFFLINE_ONLY'));
  expect(green).toHaveLength(4);
  expect(evidence.risk_composition.tables).toContain('partner_risk_scores');
  const barriers = evidence.checks.filter((row: { mode: string }) => row.mode === 'RISK_BLOCKED_EXPECTED');
  expect(barriers).toHaveLength(10);
  expect(barriers.every((row: { status: string }) => row.status === 'PASS')).toBe(true);
  for (const row of green) {
    expect(row.wait.wait_event_type).toBe('Lock');
    expect(row.wait.blockers.length).toBeGreaterThan(0);
    expect(row.error).toEqual(['42501', 'FINANCIAL_SCOPE_DENIED']);
    expect(row.state_unchanged).toBe(true);
  }
}, 180_000);