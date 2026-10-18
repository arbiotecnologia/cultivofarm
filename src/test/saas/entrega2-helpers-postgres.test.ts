import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('Entrega 2 rev 2.2: matriz sobre os corpos reais da candidata em PostgreSQL descartável; não JWT/RLS real', () => {
  const out = execFileSync('python3', ['scripts/tests/entrega2-helpers-local.py'], { encoding: 'utf8' });
  expect(out).toContain('PASS matriz M1-M12: corpos reais fail-closed e uniformes');
  expect(out).toContain('PASS fidelidade Entrega 1');
  expect(out).toContain('PASS rollback: guarda reescrita com hashes exatos');
  expect(out).toContain('PASS rollback 5a: instalação exata aceita e baseline restaurado');
  expect(out).toContain('PASS rollback 5b: drift com marcadores preservados rejeitado atomicamente');
  expect(out).toContain('NO-GO hosted installation');
  expect(out).not.toContain('FAIL');
}, 60_000);
