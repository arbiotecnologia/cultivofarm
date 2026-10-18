import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('B3.3-B sintético: mandato, receipt, CAS, colisão, cleanup monotônico; não JWT/RLS real', () => {
  const out = execFileSync('python3', ['scripts/tests/b2b-f2b33b-receipt-local.py'], { encoding: 'utf8' });
  expect(out).toContain('NO-GO hosted installation/JWT/RLS');
  expect(out.match(/NOTICE: {2}PASS/g)).toHaveLength(17);
  expect(out).not.toContain('FAIL');
}, 60_000);
