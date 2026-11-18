import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const env = new Map();
globalThis.Deno = { env: { get: key => env.get(key) } };
const { generateResponse, responseText, openAIModel } = await import('../supabase/functions/_shared/openai.ts');
const complete = { status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text: '{"texto":"ok"}' }] }] };
test('missing key never calls network', async () => {
  globalThis.fetch = () => { throw new Error('network must not run'); };
  await assert.rejects(generateResponse({}), { code: 'openai_not_configured', httpStatus: 503 });
});
test('direct request uses server key, disables storage and preserves search/schema', async () => {
  env.set('OPENAI_API_KEY', 'test-only');
  const body = { model: openAIModel(true), tools: [{ type: 'web_search' }], text: { format: { type: 'json_schema' } }, store: true };
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization, 'Bearer test-only');
    assert.equal(init.redirect, 'error');
    assert.deepEqual(JSON.parse(init.body), { ...body, store: false });
    return Response.json(complete);
  };
  assert.equal(responseText(await generateResponse(body)), '{"texto":"ok"}');
});
for (const [status, code, expected] of [[429,'credit_balance_exhausted',402],[429,'insufficient_quota',402],[429,'rate_limit_exceeded',429],[401,'invalid_api_key',503],[500,'server_error',502]]) {
  test(`sanitizes provider error ${status}/${code}`, async () => {
    globalThis.fetch = async () => Response.json({ error: { code, message: 'secret provider details' } }, { status });
    await assert.rejects(generateResponse({}), e => e.httpStatus === expected && !e.message.includes('secret'));
  });
}
test('partial response never accepted', async () => {
  globalThis.fetch = async () => Response.json({ ...complete, status: 'incomplete' });
  await assert.rejects(generateResponse({}), { code: 'openai_incomplete_response' });
});
test('refusal and empty output never accepted', () => {
  assert.throws(() => responseText({output: []}), {code:'openai_empty_response'});
  assert.throws(() => responseText({output:[{type:'message',content:[{type:'refusal'}]}]}), {code:'openai_refusal'});
});
test('cancellation does not retry', async () => {
  let calls = 0;
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async (_url, init) => { calls++; init.signal.throwIfAborted(); };
  await assert.rejects(generateResponse({}, {signal:controller.signal}), {httpStatus:504});
  assert.equal(calls, 1);
});
test('all changed TypeScript files parse', () => {
  for (const file of ['_shared/openai.ts','ai-generate-ficha-campo/index.ts','ai-sugerir-alvos/index.ts','catalog-documentary-suggestions/index.ts','catalog-documentary-suggestions/inference.ts']) {
    assert.doesNotThrow(() => stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/'+file, import.meta.url), 'utf8')));
  }
});

