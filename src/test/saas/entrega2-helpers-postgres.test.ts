import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

// execFileSync sem shell/pipes: exit code não-zero lança exceção (nenhum
// pipefail mascarando erro). O runner NUNCA regrava hashes nem arquivos.
it('Entrega 2 rev 2.3: candidata/rollback inteiros e matriz sobre corpos reais em PostgreSQL descartável; não JWT/RLS real', () => {
  const out = execFileSync('python3', ['scripts/tests/entrega2-helpers-local.py'], { encoding: 'utf8' });
  expect(out).toContain('PASS baseline: corpos extraídos do rollback conferem hashes de produção');
  expect(out).toContain('PASS candidata: arquivo inteiro executado com pre/post guards intactos');
  expect(out).toContain('PASS hashes fixos: corpos candidatos conferem os hashes commitados');
  expect(out).toContain('PASS fidelidade Entrega 1');
  expect(out).toContain('PASS matriz M1-M15: corpos reais fail-closed e uniformes');
  expect(out).toContain('PASS rollback 5a: arquivo inteiro executado; baseline restaurado e hashes baseline conferem');
  expect(out).toContain('PASS rollback 5b: rollback inteiro rejeitou drift atomicamente; corpos candidatos preservados');
  expect(out).toContain('NO-GO hosted installation');
  expect(out).not.toContain('FAIL');
}, 60_000);
