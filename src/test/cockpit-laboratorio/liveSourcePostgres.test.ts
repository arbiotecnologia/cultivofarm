import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Cockpit live-source candidate — disposable PostgreSQL, simulated Auth/schema', () => {
  it('executes actual candidate bodies without granting reader access', () => {
    const output = execFileSync('python3', ['scripts/tests/cockpit-live-source-local.py'], { encoding: 'utf8' });
    expect(output).toContain('Assertions: 61');
    expect(output).toContain('PASS tenant changed after snapshot');
    expect(output).toContain('PASS older crossed child not masked');
    expect(output).toContain('PASS partner valid explicit owner');
    expect(output).toContain('PASS partner owner cross');
    expect(output).toContain('PASS onfarm micro');
    expect(output).toContain('PASS authenticated actual SQL role 42501');
    expect(output).toContain('PASS anon actual SQL role 42501');
    expect(output).toContain('PASS pagination scoped total');
    expect(output).toContain('PASS helper ACL owner unchanged');
  }, 60_000);
});