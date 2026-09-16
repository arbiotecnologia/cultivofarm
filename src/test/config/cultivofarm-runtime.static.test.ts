import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const root = process.cwd();
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return ['test', '__tests__'].includes(entry.name) ? [] : files(path);
    return /\.[jt]sx?$/.test(path) && !/\.(test|spec)\./.test(path) ? [path] : [];
  });
}
const clientPath = resolve(root, 'src/integrations/supabase/client.ts');
const managedPath = resolve(root, 'src/integrations/supabase/types');
const forbidden = ['yzszlzjpovmcteuxjznj', 'chkgpuawcswhefiabwsm', 'navfzbwgwzruipouyfnk', 'ikaauvsflpmamgxmkhoq'];

describe('CultivoFarm independente da geração Cloud', () => {
  it('preserva byte a byte o contrato canônico vigente', () => {
    // Fase C1 — contrato regenerado a partir do banco Cultivo Farm após as
    // migrations 20261029000000 (base_reduction_mode / tax_input_snapshot) e
    // 20261030000000 (auditoria da redução). A trava continua sendo byte a byte;
    // apenas o alvo foi atualizado para o contrato realmente implantado.
    const data = readFileSync('src/integrations/supabase/cultivofarm.types.ts');
    expect(createHash('sha256').update(data).digest('hex')).toBe('d7a770b0ab2b57cfcceaefcbacb41a859428dabe08fd46833921fd030d4afcb3');
    expect(data.toString().trimEnd().split('\n')).toHaveLength(21995);
  });


  it('permite somente o cliente canônico e nenhum contrato gerenciado em produção', { timeout: 60_000 }, () => {
    let creations = 0;
    for (const path of files(resolve(root, 'src'))) {
      const text = readFileSync(path, 'utf8');
      for (const ref of forbidden) expect(text.includes(ref), path).toBe(false);
      expect(text, path).not.toMatch(/VITE_SUPABASE_(URL|PROJECT_ID|PUBLISHABLE_KEY)/);
      const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        if (ts.isStringLiteral(node)) {
          const spec = node.text;
          const target = spec.startsWith('@/') ? resolve(root, 'src', spec.slice(2)) : resolve(dirname(path), spec);
          expect(target.replace(/\.ts$/, ''), path).not.toBe(managedPath);
          if (spec === '@supabase/supabase-js' && path !== clientPath && ts.isImportDeclaration(node.parent)) {
            expect(node.parent.importClause?.isTypeOnly, path).toBe(true);
          }
        }
        if (ts.isCallExpression(node) && node.expression.getText(tree) === 'createClient') {
          creations++;
          expect(path).toBe(clientPath);
        }
        if (ts.isIdentifier(node) && /^(createClient|SupabaseClient|createBrowserClient|createServerClient)$/.test(node.text) && path !== clientPath) {
          // Type references are harmless; runtime factories and constructors are not.
          expect(ts.isCallExpression(node.parent) || ts.isNewExpression(node.parent), path).toBe(false);
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
    expect(creations).toBe(1);
    const client = readFileSync(clientPath, 'utf8');
    expect(client).toContain('"https://swzpzcwiasxmjutrmvkm.supabase.co"');
    expect(client).toContain("from './cultivofarm.types'");
    expect(client).not.toContain('import.meta.env');
    expect(client.indexOf('assertCanonicalSupabaseBinding(SUPABASE_URL)')).toBeLessThan(client.indexOf('createClient<Database>'));
  });
});