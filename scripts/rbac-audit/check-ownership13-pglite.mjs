/** SQL13 integral, corpo live before. Auth/tenant/schema stubs NÃO certificam hospedado. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.actor')::uuid $$;
CREATE FUNCTION platform_private.catalog_tenant_actor(text) RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.org')::uuid $$;
CREATE FUNCTION platform_private.catalog_ownership_enabled() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE produtos(id uuid PRIMARY KEY, ativo boolean, owner_organization_id uuid, archived_at timestamptz);
CREATE TABLE microrganismos(LIKE produtos INCLUDING ALL); CREATE TABLE culturas(LIKE produtos INCLUDING ALL);
CREATE TABLE catalog_tenant_visibility(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, entity_type text, produto_id uuid, microrganismo_id uuid, cultura_id uuid, hidden boolean, version integer, reason text, updated_by uuid, updated_at timestamptz DEFAULT now());
CREATE TABLE catalog_tenant_visibility_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, actor_id uuid, idempotency_key uuid, payload_hash text, entity_type text, entity_id uuid, before_state jsonb, after_state jsonb, reason text, result jsonb, UNIQUE(actor_id,organization_id,idempotency_key));`);
const before=readFileSync('scripts/rbac-audit/live-defs/platform_private.catalog_tenant_set_visibility_core-ownership13-before.sql','utf8');
await db.exec(before);
const id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
const AR=id(1),FSF=id(2);
async function actor(org){await db.query("SELECT set_config('test.org',$1,false),set_config('test.actor',$1,false)",[org]);}
let seq=1000;
const call=(type,item,hidden,version=0,key=id(seq++),reason='motivo teste')=>db.query('SELECT platform_private.catalog_tenant_set_visibility_core($1,$2,$3,$4,$5,$6) v',[type,item,hidden,version,reason,key]);
const rejects=(p,code,msg)=>assert.rejects(p,e=>e.code===code&&e.message===msg);
let pass=0;async function check(n,f){await f();console.log('PASS',n);pass++;}
await db.query('INSERT INTO produtos VALUES ($1,true,$2,NULL)',[id(10),AR]);await actor(FSF);
await check('before reproduz SHOW privado no_change',()=>rejects(call('produto',id(10),false),'22023','catalog_visibility_no_change'));
await check('before inexistente not_found',()=>rejects(call('produto',id(999),false),'P0002','catalog_visibility_item_not_found'));
const hash=(await db.query("SELECT md5(pg_get_functiondef('platform_private.catalog_tenant_set_visibility_core(text,uuid,boolean,integer,text,uuid)'::regprocedure)) h")).rows[0].h;
let sql=readFileSync('scripts/rbac-audit/proposed-tenant-catalog-ownership-13-visibility-target.sql','utf8');
if(hash!=='806751acb0477165ed863320ab24c6d0'){console.log('NOTE formatação hash PGlite difere live; somente preflight substituído',hash);sql=sql.replace('806751acb0477165ed863320ab24c6d0',hash);}
await db.exec(sql);
assert.equal(sql.match(/owner_organization_id IS NULL/g).length,3);
for(const [ti,table,type] of [[0,'produtos','produto'],[1,'microrganismos','microrganismo'],[2,'culturas','cultura']]){
 for(const [oi,owner] of [[0,AR],[1,FSF]])for(const [si,active,archived] of [[0,true,false],[1,false,false],[2,false,true]]){
  const item=id(100+ti*100+oi*10+si);await db.query(`INSERT INTO ${table} VALUES ($1,$2,$3,$4)`,[item,active,owner,archived?'2026-10-15T00:00:00Z':null]);
  for(const org of [AR,FSF])for(const hidden of [false,true])await check(`${type} privado owner${oi} estado${si} ator${org===AR?'AR':'FSF'} ${hidden?'HIDE':'SHOW'} = inexistente`,async()=>{await actor(org);await rejects(call(type,item,hidden),'P0002','catalog_visibility_item_not_found');await rejects(call(type,id(999),hidden),'P0002','catalog_visibility_item_not_found');});
 }
 const global=id(500+ti),inactive=id(600+ti);await db.query(`INSERT INTO ${table} VALUES ($1,true,NULL,NULL),($2,false,NULL,NULL)`,[global,inactive]);await actor(AR);
 await check(`${type} global SHOW sem preferência preserva no_change`,()=>rejects(call(type,global,false),'22023','catalog_visibility_no_change'));
 const key=id(seq++);
 await check(`${type} global HIDE v1`,async()=>{const r=(await call(type,global,true,0,key)).rows[0].v;assert.equal(r.version,1);assert.equal(r.hidden,true);});
 await check(`${type} retry exato replay sem novo ledger`,async()=>{const n=(await db.query('SELECT count(*) n FROM catalog_tenant_visibility_ledger')).rows[0].n;assert.equal((await call(type,global,true,0,key)).rows[0].v.replayed,true);assert.equal((await db.query('SELECT count(*) n FROM catalog_tenant_visibility_ledger')).rows[0].n,n);});
 await check(`${type} mesma chave intenção alterada conflita`,()=>rejects(call(type,global,false,0,key),'22023','catalog_visibility_idempotency_conflict'));
 await check(`${type} mesma chave outro alvo privado conflita sem lookup`,()=>rejects(call(type,id(100+ti*100),true,0,key),'22023','catalog_visibility_idempotency_conflict'));
 await check(`${type} replay ator FSF não usa recibo AR`,async()=>{await actor(FSF);await rejects(call(type,global,false,0,key),'22023','catalog_visibility_no_change');await actor(AR);});
 await check(`${type} CAS stale`,()=>rejects(call(type,global,false,0),'40001','catalog_visibility_version_conflict'));
 await check(`${type} global SHOW v2`,async()=>{assert.equal((await call(type,global,false,1)).rows[0].v.version,2);});
 await check(`${type} global inativo SHOW negado`,()=>rejects(call(type,inactive,false),'22023','catalog_visibility_item_inactive'));
 await check(`${type} global inativo HIDE permitido`,async()=>{assert.equal((await call(type,inactive,true)).rows[0].v.hidden,true);});
 await check(`${type} replay global continua mesmo após inativação`,async()=>{await db.query(`UPDATE ${table} SET ativo=false WHERE id=$1`,[global]);assert.equal((await call(type,global,true,0,key)).rows[0].v.replayed,true);});
}
await check('nenhuma preferência ou recibo privado gravado',async()=>{assert.equal(Number((await db.query('SELECT count(*) n FROM catalog_tenant_visibility WHERE coalesce(produto_id,microrganismo_id,cultura_id) NOT IN (SELECT id FROM produtos WHERE owner_organization_id IS NULL UNION SELECT id FROM microrganismos WHERE owner_organization_id IS NULL UNION SELECT id FROM culturas WHERE owner_organization_id IS NULL)')).rows[0].n),0);});
console.log(`${pass}/${pass} PASS; Auth/RLS hospedado e concorrência duas conexões UNVERIFIED`);
await db.close();
