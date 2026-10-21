import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('scripts/attachment-http-revocation-20261021/legacy-origin-deny.sql.review', 'utf8');
const match = sql.match(/allow_any_operation\(ARRAY\[([\s\S]*?)\]::text\[\]\)/);
const operations = new Set(Array.from(match?.[1].matchAll(/'([^']+)'/g) ?? [], m => m[1]));
describe('review SQL operation boundary, synthetic not Storage RLS proof', () => {
  for (const op of ['object.list','object.list_v2','object.upload','object.upload_update','object.delete','object.delete_many'])
    it(`preserves SELECT dependency ${op}`, () => expect(operations.has(op)).toBe(true));
  for (const op of ['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info','object.sign','object.sign_many','unknown'])
    it(`does not grant ${op}`, () => expect(operations.has(op)).toBe(false));
});