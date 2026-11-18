import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const run = promisify(execFile);
const base = 'scripts/microorganism-ficha-20261118';

it.each(['vrlcdwmlytukrjezrrnf', 'swzpzcwiasxmjutrmvkm'])('monta documentos e IA com binding explícito %s sem executar', async (ref) => {
  const dir = await mkdtemp(join(tmpdir(), 'micro-release-'));
  try {
    for (const service of ['documents', 'documentary']) {
      const out = join(dir, service);
      await run('python3', [`${base}/build-edge.py`, '--ref', ref, '--service', service, '--out', out]);
      expect(await readFile(join(out, 'binding.ts'), 'utf8')).toContain(`PROJECT_REF = "${ref}"`);
      const index = await readFile(join(out, 'index.ts'), 'utf8');
      expect(index).toContain('PROJECT_REF');
      expect(index).not.toContain('Deno.env.set');
      if (service === 'documents') {
        expect(index).toContain("['vrlcdwmlytukrjezrrnf', 'swzpzcwiasxmjutrmvkm'].includes(ref)");
        const probe = `import {handle} from ${JSON.stringify(join(out, 'index.ts'))};
          const response=await handle(new Request('http://localhost/',{method:'POST'}));
          console.log(await response.text());`;
        const env = { ...process.env, SUPABASE_URL: `https://${ref}.supabase.co`, SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' };
        expect((await run('deno', ['eval', probe], { env })).stdout).toContain('document_configuration');
        expect((await run('deno', ['eval', probe], { env: { ...env, SUPABASE_URL: 'https://invalid.example' } })).stdout).toContain('document_binding_required');
      }
      const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'));
      expect(manifest.ref).toBe(ref);
      for (const file of Object.keys(manifest.files)) {
        expect((await readFile(join(out, file))).includes(13)).toBe(false);
      }
    }
    const capture = join(dir, 'capture.sql');
    await run('python3', [`${base}/documents/build-capture.py`, '--ref', ref, '--out', capture]);
    expect(await readFile(capture, 'utf8')).toContain(`'ref','${ref}'`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('recusa ref ausente ou não autorizado antes da montagem', async () => {
  await expect(run('python3', [`${base}/build-edge.py`, '--service', 'documents', '--out', '/tmp/denied-micro-release'])).rejects.toThrow();
  await expect(run('python3', [`${base}/build-edge.py`, '--ref', 'invalid-ref', '--service', 'documents', '--out', '/tmp/denied-micro-release'])).rejects.toThrow();
});

it('roundtrip UTF-8 de corpo acentuado preserva hash; CP1252/CRLF e captura divergente são recusados', async () => {
  const script = `
import importlib.util,hashlib,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('assembly','${base}/documents/assemble.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
body='CREATE FUNCTION exemplo() AS $$ -- ação, bactéria, concentração\\n$$;\\n'
pin=hashlib.md5(body.encode('utf-8')).hexdigest()
functions=[{'signature':s,'md5':pin,'definition':body,'owner':'postgres','acl':['postgres=X/postgres']} for s in m.SIGNATURES]
# Synthetic encoding control only; production pins remain immutable in the assembly module.
m.EXPECTED=[pin]*len(functions)
capture={'ref':'swzpzcwiasxmjutrmvkm','functions':functions,'relations':[{'name':n,'fingerprint':{}} for n in ['public.microrganismos','platform_private.tenant_catalog_root_receipts','storage.objects']],'bucket':{'id':'microorganism-documents','public':False,'file_size_limit':10485760}}
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'body.sql';p.write_text(body,encoding='utf-8',newline='\\n')
 assert hashlib.md5(p.read_text(encoding='utf-8').encode('utf-8')).hexdigest()==pin
 m.assemble(capture,Path(d)/'valid')
 for invalid in [p.read_bytes().decode('cp1252'),body.replace('\\n','\\r\\n')]:
  changed={**capture,'functions':[{**f,'definition':invalid} for f in functions]}
  try:m.assemble(changed,Path(d)/'invalid')
  except ValueError as e:assert 'DEPENDENCY_PIN' in str(e)
  else:raise AssertionError('encoding drift accepted')
 try:m.assemble({**capture,'ref':'invalid-ref'},Path(d)/'invalid')
 except ValueError as e:assert str(e)=='REF_DENIED'
 else:raise AssertionError('wrong environment accepted')
print('UTF8_ROUNDTRIP_PASS')
`;
  expect((await run('python3', ['-c', script])).stdout).toContain('UTF8_ROUNDTRIP_PASS');
});