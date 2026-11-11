import { pgBatteryTestTimeout, runPgBattery } from "@/test/helpers/pgBatterySlot";
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('nega cancelamento estrangeiro e reproduz oráculo antes da transformação offline', async () => {
  const outputDir = join(mkdtempSync(join(tmpdir(), 'cancel-vitest-')), 'results');
  const { stdout: output } = await runPgBattery('python3', [
    'scripts/financial-installments-initial-20261024/test-cancel-authorization.py',
    '--output-dir', outputDir,
  ], { encoding: 'utf8', timeout: 180_000 });
  const result = JSON.parse(output.trim().split('\n').at(-1) ?? '{}');
  expect(result.FAIL).toBe(0);
  expect(result.PASS).toBe(810);
  expect(result.BLOCKED).toBe(1);
  expect(result['NOT RUN']).toBe(1);
  const evidence = JSON.parse(readFileSync(join(outputDir, 'results.json'), 'utf8'));
  expect(evidence.races).toHaveLength(14);
  expect(evidence.by_mode.RED_NULL_KIND_CAPTURED).toBe(43);
  expect(evidence.by_mode.GREEN_NULL_KIND_SANDBOX).toBe(40);
  const nullKind = evidence.checks.find((row: { test: string }) => row.test === 'GREEN_NULL_KIND_SANDBOX NULL kind own payable exact error');
  expect(nullKind.actual).toBe("('23514', 'Tipo inválido: <NULL>')");
  expect(nullKind.status).toBe('PASS');
  const green = evidence.races.filter((row: { test: string }) => row.test.startsWith('GREEN_OFFLINE_ONLY'));
  expect(green).toHaveLength(4);
  expect(evidence.risk_composition.tables).toContain('partner_risk_scores');
  expect(evidence.risk_composition.deferred.risk_fk_resolved).toBe(true);
  const finding = (name: string) => evidence.checks.find((row: { test: string }) => row.test === name);
  expect(finding('projection exact AR owner FSF buyer').status).toBe('PASS');
  expect(finding('GREEN owner proceeds only to legitimate billing denial').actual).toBe("('P0001', 'billing_not_eligible:PAYMENT_TERMS_NOT_DEFINED')");
  expect(finding('credit zero not unlimited exposure reason').actual).toBe('LIMIT_EXCEEDED_BLOCK');
  expect(Number(finding('exposure exact exposicao_projetada').actual)).toBe(13500);
  expect(Number(finding('exposure financed total minus payment').actual)).toBe(9300);
  expect(evidence.risk_composition.parties_credit.synthetic_ids.ar_bio_owner).not.toBe(evidence.risk_composition.parties_credit.synthetic_ids.fsf_buyer_tenant);
  for (const tenant of ['A', 'B']) {
    expect(finding(`deferred no settings method ticket ${tenant}`).actual).toBe('0|0');
    expect(finding(`deferred complete updater ${tenant}`).actual).toBe('0');
    expect(finding(`deferred absent settings risk ${tenant} exact error`).actual).toBe("('P0001', 'B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED')");
    expect(finding(`deferred legacy incomplete wrapper ${tenant} exact error`).actual).toBe("('P0001', 'B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED')");
    expect(finding(`deferred configured still C2_ACCOUNTING_PENDING ${tenant} exact error`).actual).toBe("('42501', 'C2_ACCOUNTING_PENDING')");
    expect(finding(`deferred configured still B2B_INTERNAL_DOWNSTREAM_UNVERIFIED ${tenant} exact error`).actual).toBe("('42501', 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED')");
    expect(finding(`GREEN zero foreign scope first ${tenant} exact error`).actual).toBe("('42501', 'C2P1_FORBIDDEN')");
    for (const entry of ['automatic', 'wrapper', 'delivery link']) {
      expect(finding(`GREEN zero ${entry} ${tenant} exact error`).actual).toBe("('23514', 'B2B_ZERO_CREDIT_LIMIT')");
    }
  }
  const barriers = evidence.checks.filter((row: { mode: string }) => row.mode === 'RISK_BLOCKED_EXPECTED');
  expect(barriers).toHaveLength(10);
  expect(barriers.every((row: { status: string }) => row.status === 'PASS')).toBe(true);
  for (const row of green) {
    expect(row.wait.wait_event_type).toBe('Lock');
    expect(row.wait.blockers.length).toBeGreaterThan(0);
    expect(row.error).toEqual(['42501', 'FINANCIAL_SCOPE_DENIED']);
    expect(row.state_unchanged).toBe(true);
  }
}, pgBatteryTestTimeout(180_000));