import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261008184449_025a0908-63b7-4d56-b1c6-6006510e4aed.sql", "utf8");
const predicate = sql.match(/WHERE pa\.id=p_partner_id[\s\S]*?\n {3}\)\)/)?.[0];
if (!predicate) throw new Error("commercial_predicate_missing");
const result = spawnSync("python3", ["-c", `
import sqlite3,json,sys
c=sqlite3.connect(':memory:')
c.execute("attach database ':memory:' as public")
c.execute('create table public.partner_accounts(id text,commercial_owner_organization_id text,ativo boolean,deleted_at text,client_id text)')
c.execute('create table public.clientes(id text,organization_id text)')
c.executemany('insert into public.clientes values (?,?)',[('ca','A'),('cp','P')])
cases=[('own_A','A','A',1,None,'ca',1),('optional_client','A','A',1,None,None,1),('P_to_A','P','A',1,None,'ca',0),('A_to_P','A','P',1,None,'cp',0),('same_cnpj_no_right','P','A',1,None,None,0),('linked_P_no_right','P','A',1,None,'ca',0),('orphan','A',None,1,None,None,0),('inactive_partner','A','A',0,None,'ca',0),('deleted','A','A',1,'removed','ca',0),('cross_client','A','A',1,None,'cp',0),('missing_client','A','A',1,None,'absent',0),('no_org',None,'A',1,None,None,0)]
predicate=sys.stdin.read().replace('p_partner_id',':partner').replace('v_org',':org')
out=[]
for name,actor,owner,active,deleted,client,expected in cases:
 c.execute('delete from public.partner_accounts')
 c.execute('insert into public.partner_accounts values (?,?,?,?,?)',('target',owner,active,deleted,client))
 actual=c.execute('select exists(select 1 from public.partner_accounts pa '+predicate+')',{'partner':'target','org':actor}).fetchone()[0]
 out.append([name,actual,expected])
print(json.dumps(out))
`], { input: predicate, encoding: "utf8" });
if (result.status !== 0) throw new Error("local_commercial_predicate_failed");
const rows: [string, number, number][] = JSON.parse(result.stdout);

describe("P2A actual commercial SQL predicate locally — not RLS/JWT", () => {
  for (const [name, actual, expected] of rows) {
    it(name, () => expect(actual).toBe(expected));
  }
  it("requires active tenant, existing role and entitlement before price lookup", () => {
    for (const guard of ["auth_required", "ACTIVE_TENANT_REQUIRED", "fn_cc_can_prepare(v_uid)", "_saas_user_has_feature(v_uid,'catalogo_precos')", "COMMERCIAL_PARTNER_SCOPE_DENIED"]) {
      expect(sql.indexOf(guard)).toBeGreaterThan(-1);
      expect(sql.indexOf(guard)).toBeLessThan(sql.indexOf("RETURN public.fn_resolve_commercial_price"));
    }
    expect(sql).not.toContain("PERFORM platform_private.assert_b2b_partner_scope");
    expect(sql).not.toMatch(/\b(?:INSERT INTO|UPDATE public|DELETE FROM|ALTER POLICY)\b/i);
  });
  it("does not grant callers access to any other endpoint", () => {
    const grants = sql.match(/^GRANT .*$/gm);
    expect(grants).toHaveLength(1);
    expect(grants?.[0]).toContain("public.rpc_cc_simulate_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric)");
    expect(sql).toContain("FROM PUBLIC, anon;");
  });
});