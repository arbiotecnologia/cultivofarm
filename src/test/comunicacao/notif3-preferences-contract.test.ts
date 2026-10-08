import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261008124100_6f41ecb2-d446-4837-82fc-db5adfbc169b.sql', 'utf8');
describe('NOTIF-3 individual preference authorization contract (SQL structure, not runtime)', () => {
  it('checks canonical active actor before the first preference read or write', () => {
    const guard = sql.indexOf('platform_private.platform_actor_access_ready(v_uid)');
    const read = sql.indexOf('SELECT * INTO v_prev');
    expect(guard).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(guard);
    expect(sql.slice(guard, read)).toContain("ERRCODE='42501'");
  });
  it('checks canonical active organization before the first preference read', () => {
    expect(sql.slice(0, sql.indexOf('SELECT * INTO v_prev'))).toContain('v_org := platform_private.h15_actor_organization()');
    expect(sql.slice(0, sql.indexOf('SELECT * INTO v_prev'))).toContain('IF v_org IS NULL THEN');
  });
  it('derives individual owner exclusively from auth.uid and keeps direct reads restrictive', () => {
    expect(sql).toContain('v_uid uuid := auth.uid()');
    expect(sql).toContain('VALUES (v_uid, p_canal');
    expect(sql).toContain('AS RESTRICTIVE FOR ALL TO anon, authenticated');
    expect(sql.match(/user_id = \(SELECT auth.uid\(\)\)/g)).toHaveLength(2);
  });
  it('requires same-tenant proven client in both policy predicates', () => {
    expect(sql.match(/c.organization_id = \(SELECT public.h15_actor_organization\(\)\)/g)).toHaveLength(2);
    expect(sql.match(/c.id = ANY\(public.get_cliente_ids_for_user/g)).toHaveLength(2);
  });
});