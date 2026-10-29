import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('distingue execução SQL de textos e preserva limites da proveniência dos consumidores', () => {
  const outputDir = join(mkdtempSync(join(tmpdir(), 'provenance-vitest-')), 'results');
  execFileSync('python3', ['scripts/financial-installments-initial-20261024/test-financial-provenance.py', '--output-dir', outputDir], { timeout: 20_000 });
  const evidence = JSON.parse(readFileSync(join(outputDir, 'provenance.json'), 'utf8'));
  expect(evidence.classifications).toEqual({ EXECUTABLE_DYNAMIC_SQL: 1, TEXT_FORMAT_NOT_SQL_EXECUTE: 4, LEXICAL_ACCESS_LEVEL_NOT_SQL_EXECUTE: 9 });
  expect(evidence.consumers).toHaveLength(17);
  expect(evidence.operational_go).toBe(false);
});