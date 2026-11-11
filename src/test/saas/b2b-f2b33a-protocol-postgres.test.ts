import { pgBatteryTestTimeout, runPgBattery } from "@/test/helpers/pgBatterySlot";
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('B3.3-A protocolo sintético: ator/alvo, source, CAS, rollback e concorrência; não JWT/RLS real', async () => {
  const { stdout: output } = await runPgBattery('python3', ['scripts/tests/b2b-f2b33a-protocol-local.py'], { encoding: 'utf8' });
  expect(output).toContain('NO-GO hosted installation/JWT/RLS');
  expect(output).toContain('PASS grant versus same-key grant; real session lock wait and commit observed');
  expect(output).toContain('PASS link revoke then grant revalidates; real session lock wait and commit observed');
  expect(output).toContain('PASS cleanup works with ineligible target preserves direct');
  expect(output).toContain('PASS direct collision concurrent state preserved');
}, pgBatteryTestTimeout(120_000));