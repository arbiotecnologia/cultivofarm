import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('Entrega 1 sintético: brecha revogação reproduzida no baseline e fechada pela candidata; não JWT/RLS real', () => {
  const out = execFileSync('python3', ['scripts/tests/entrega1-client-access-local.py'], { encoding: 'utf8' });
  expect(out).toContain('PASS fase1: brechas reproduzidas no baseline');
  expect(out).toContain('PASS fase2: candidata aplicada por marcador');
  expect(out).toContain('PASS fase3: endurecimento correto');
  expect(out).toContain('PASS fase4: revogação dinâmica respeitada');
  expect(out).toContain('NO-GO hosted installation');
  expect(out).not.toContain('FAIL');
}, 60_000);
