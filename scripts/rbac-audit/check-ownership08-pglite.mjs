/** SQL08 executable local checks. Auth is STUBBED: no hosted Auth/RLS certification.
 * Usage: node scripts/rbac-audit/check-ownership08-pglite.mjs /absolute/path/to/pglite/dist/index.js
 * No network, no production fixtures, no permanent gate activation.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const modulePath = process.argv[2];
if (!modulePath) throw new Error('Informe o módulo PGlite isolado; não instalar no aplicativo.');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA platform_private;
CREATE FUNCTION platform_private.catalog_ownership_enabled() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION platform_private.catalog_norm_name(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(btrim($1)) $$;
CREATE FUNCTION platform_private.catalog_tenant_actor(text) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('test.actor',true) IN ('anon','sa','service_role') THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
 RETURN current_setting('test.org')::uuid;
END $$;
CREATE TABLE produtos(id uuid PRIMARY KEY,nome text,ativo boolean,owner_organization_id uuid,archived_at timestamptz,updated_at timestamptz,tipo text, familia_catalogo text);
CREATE TABLE microrganismos(LIKE produtos INCLUDING ALL);
CREATE TABLE culturas(LIKE produtos INCLUDING ALL);
CREATE TABLE produto_composicao_conjuntos(produto_id uuid,status text);
CREATE TABLE produto_composicao_declaracoes(id uuid,produto_id uuid,ordem integer,tipo text,nome_declarado text);
CREATE TABLE catalogo_volumes(id uuid,produto_id uuid,microrganismo_id uuid,owner_organization_id uuid,ordem integer,volume_ml numeric,preco_brl numeric,updated_at timestamptz);
CREATE FUNCTION public.tenant_catalog_owned_list(p_entity_type text,p_search text,p_limit integer,p_offset integer,p_include_archived boolean) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;`);
await db.exec(readFileSync('scripts/rbac-audit/proposed-tenant-catalog-ownership-08-owned-read.sql','utf8'));
// Existing INVOKER facade is defined in SQL01; reproduce it after executing SQL08 unchanged.
await db.exec(`CREATE OR REPLACE FUNCTION public.tenant_catalog_owned_list(p_entity_type text,p_search text,p_limit integer,p_offset integer,p_include_archived boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.catalog_owned_list_core(p_entity_type,p_search,p_limit,p_offset,p_include_archived) $$;
GRANT USAGE ON SCHEMA platform_private TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_owned_list(text,text,integer,integer,boolean) TO authenticated;
SELECT set_config('test.actor','tenant',false),set_config('test.org','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
INSERT INTO culturas VALUES
('11111111-1111-4111-8111-111111111111','A Global',true,NULL,NULL,now(),NULL,NULL),
('22222222-2222-4222-8222-222222222222','B Own',true,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,now(),NULL,NULL),
('33333333-3333-4333-8333-333333333333','C Own archived',false,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now(),now(),NULL,NULL),
('44444444-4444-4444-8444-444444444444','D FSF',true,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',NULL,now(),NULL,NULL);
INSERT INTO produtos SELECT * FROM culturas;
INSERT INTO produto_composicao_conjuntos VALUES ('22222222-2222-4222-8222-222222222222','completo');
INSERT INTO produto_composicao_declaracoes VALUES ('77777777-7777-4777-8777-777777777777','22222222-2222-4222-8222-222222222222',0,'nutriente','Declarado sem inferência');
INSERT INTO catalogo_volumes VALUES ('88888888-8888-4888-8888-888888888888','22222222-2222-4222-8222-222222222222',NULL,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,1000,180,now());
SET ROLE authenticated;`);
let passes = 0;
async function value(sql, args=[]) { return (await db.query(sql,args)).rows[0].v; }
async function check(label,fn) { await fn(); passes++; console.log('PASS',label); }
async function denied(sql,args,code) { await assert.rejects(db.query(sql,args), e => e.code === code); }
const list = (archived=false,limit=50,offset=0,search='') => value('SELECT public.tenant_catalog_owned_list($1,$2,$3,$4,$5) v',['cultura',search,limit,offset,archived]);
const detail = (id,entity='cultura') => value('SELECT public.tenant_catalog_owned_detail($1,$2,50,0) v',[entity,id]);
await check('list only own active',async()=>assert.deepEqual((await list()).items.map(r=>r.nome),['B Own']));
await check('list archived filter',async()=>assert.equal((await list(true)).items.length,2));
await check('pagination has_more and truncates sentinel',async()=>{const r=await list(true,1);assert.equal(r.items.length,1);assert.equal(r.has_more,true);});
await check('pagination second page',async()=>assert.equal((await list(true,1,1)).items[0].nome,'C Own archived'));
await check('search',async()=>assert.equal((await list(true,50,0,'archived')).items.length,1));
await check('detail own',async()=>assert.equal((await detail('22222222-2222-4222-8222-222222222222')).item.nome,'B Own'));
for (const id of ['11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','99999999-9999-4999-8999-999999999999'])
 await check('detail denies global/other/missing '+id,async()=>denied('SELECT public.tenant_catalog_owned_detail($1,$2,50,0)',['cultura',id],'P0002'));
await check('detail declared composition + presentation retained',async()=>{const r=await detail('22222222-2222-4222-8222-222222222222','produto');assert.equal(r.item.declarations[0].nome_declarado,'Declarado sem inferência');assert.equal(r.presentations[0].preco_brl,180);});
for (const [entity,limit,offset,archived] of [[null,50,0,false],['cultura',null,0,false],['cultura',51,0,false],['cultura',50,-1,false],['cultura',50,0,null]])
 await check('invalid list input '+JSON.stringify([entity,limit,offset,archived]),async()=>denied('SELECT public.tenant_catalog_owned_list($1,$2,$3,$4,$5)',[entity,'',limit,offset,archived],'22023'));
await check('SA rejected by actor stub',async()=>{await db.exec("SELECT set_config('test.actor','sa',false)");await denied('SELECT public.tenant_catalog_owned_list(\'cultura\',\'\',50,0,false)',[],'42501');});
await db.exec("RESET ROLE; SET ROLE anon");
await check('anon facade EXECUTE denied',async()=>denied("SELECT public.tenant_catalog_owned_detail('cultura','22222222-2222-4222-8222-222222222222',50,0)",[],'42501'));
await db.exec('RESET ROLE; SET ROLE service_role');
await check('service role facade EXECUTE denied',async()=>denied("SELECT public.tenant_catalog_owned_detail('cultura','22222222-2222-4222-8222-222222222222',50,0)",[],'42501'));
await db.close();
console.log(JSON.stringify({passes,failed:0,scope:'SQL08 PGlite isolated; Auth identity/normalization STUBBED; real Auth/RLS UNVERIFIED'}));
