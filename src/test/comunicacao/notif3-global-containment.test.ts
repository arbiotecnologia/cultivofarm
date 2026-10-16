import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the actual Edge source after removing imports; only dependencies mocked.
function handler(name: string, profileActive = true, superadmin = true) {
  const rpc = vi.fn(async () => ({ data: superadmin, error: null }));
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: 'actor', ativo: profileActive }, error: null }) }) }) }));
  const client = { rpc, from, auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'actor' } }, error: null })) } };
  const serviceClient = vi.fn(() => client);
  const createClient = vi.fn(() => client);
  let serve: ((req: Request) => Promise<Response>) | undefined;
  const source = readFileSync(`supabase/functions/${name}/index.ts`, 'utf8');
  const parsed = ts.createSourceFile('edge.ts', source, ts.ScriptTarget.Latest, true);
  let clean = source;
  for (const statement of [...parsed.statements].reverse()) {
    if (ts.isImportDeclaration(statement)) clean = clean.slice(0, statement.getFullStart()) + clean.slice(statement.end);
  }
  const noEffects = vi.fn(() => { throw new Error('unexpected effect'); });
  const schema = { object: () => schema, enum: () => schema, default: () => schema, optional: () => schema, literal: () => schema, string: () => schema, trim: () => schema, email: () => schema, max: () => schema, strict: () => schema };
  const context = {
    Request, Response, URL, crypto, console, exports: {},
    Deno: { env: { get: (key: string) => key === 'SUPABASE_URL' ? 'https://swzpzcwiasxmjutrmvkm.supabase.co' : 'test-only' }, serve: (fn: typeof serve) => { serve = fn; } },
    createClient, serviceClient, z: schema,
    json: (status: number, body: unknown) => new Response(JSON.stringify(body), { status }),
    requirePost: (req: Request) => req.method === 'POST' ? null : new Response(null, { status: 405 }),
    corsHeaders: {}, corsHeadersFor: () => ({}), isTrustedOrigin: () => true,
    handlePreflight: () => new Response(null, { status: 204 }),
    loadRuntimeConfig: noEffects, readWorkerEnv: noEffects, sendEmail: noEffects,
    sendWhatsapp: noEffects, sendInApp: noEffects, probeSmtpProviderInDeno: noEffects,
    // Tenant lane wiring (promoted F4b): global requests never take the lane branch.
    isTenantLaneRequest: () => false, authorizeLaneInvoker: () => false, runTenantLane: noEffects, tenantSmtpDeps: {}, TENANT_PINNING_PROVEN: true,
  };
  runInNewContext(ts.transpileModule(clean, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  if (!serve) throw new Error('handler missing');
  return { serve, rpc, from, serviceClient, createClient, noEffects };
}

describe('NOTIF-3 HTTP containment before global effects', () => {
  for (const name of ['communication-health', 'process-communication-outbox', 'whatsapp-status-webhook', 'test-communication-email']) {
    it(`${name}: internal credential cannot bypass containment`, async () => {
      const h = handler(name);
      const res = await h.serve(new Request('https://local.test', { method: 'POST', headers: { 'x-internal-secret': 'test-only' }, body: '{}' }));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, error: 'NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE' });
      expect(h.rpc).not.toHaveBeenCalled(); expect(h.from).not.toHaveBeenCalled();
      expect(h.createClient).not.toHaveBeenCalled(); expect(h.serviceClient).not.toHaveBeenCalled(); expect(h.noEffects).not.toHaveBeenCalled();
    });
  }
  it('tenant admin health cannot use service client to aggregate', async () => {
    const h = handler('communication-health');
    const res = await h.serve(new Request('https://local.test', { method: 'POST', headers: { Authorization: 'Bearer fake-test' } }));
    expect(res.status).toBe(403); expect(h.rpc).not.toHaveBeenCalled(); expect(h.from).not.toHaveBeenCalled();
  });
  it('provider settings denies tenant admin before global reads/writes', async () => {
    const h = handler('communication-provider-settings', true, false);
    const res = await h.serve(new Request('https://local.test', { headers: { Authorization: 'Bearer fake-test' } }));
    expect(res.status).toBe(403); expect(h.rpc).toHaveBeenCalledTimes(1); expect(h.from).not.toHaveBeenCalled();
  });
  it('provider settings denies inactive superadmin before config/rate mutation', async () => {
    const h = handler('communication-provider-settings', false);
    const res = await h.serve(new Request('https://local.test', { method: 'PUT', headers: { Authorization: 'Bearer fake-test' }, body: '{}' }));
    expect(res.status).toBe(403); expect(h.rpc).toHaveBeenCalledTimes(1); expect(h.from).toHaveBeenCalledWith('profiles');
  });
});