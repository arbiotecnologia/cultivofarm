import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('Entrega 2 sintético: helpers escalares com brecha no baseline e fail-closed pela candidata; não JWT/RLS real', () => {
  const out = execFileSync('python3', ['scripts/tests/entrega2-helpers-local.py'], { encoding: 'utf8' });
  expect(out).toContain('PASS fase1: brechas reproduzidas no baseline');
  expect(out).toContain('PASS fase3: helpers endurecidos fail-closed');
  expect(out).toContain('PASS fase4: revogação dinâmica respeitada');
  expect(out).toContain('NO-GO hosted installation');
  expect(out).not.toContain('FAIL');
}, 60_000);
