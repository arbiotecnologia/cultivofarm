import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('download-client-document gateway configuration', () => {
  it('explicitly preserves verify_jwt=true during future deployments', () => {
    const configured = execFileSync('python3', ['-c', [
      'import json, tomllib',
      'with open("supabase/config.toml", "rb") as config:',
      '    parsed = tomllib.load(config)',
      'print(json.dumps(parsed.get("functions", {}).get("download-client-document", {}).get("verify_jwt")))',
    ].join('\n')], { encoding: 'utf8' });

    expect(JSON.parse(configured)).toBe(true);
  });
});