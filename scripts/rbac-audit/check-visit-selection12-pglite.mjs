// PostgreSQL isolado; helpers/Auth simulados, NÃO certifica ambiente hospedado.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA platform_private; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'::uuid$$;
CREATE FUNCTION platform_private.catalog_ownership_enabled() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION platform_private.catalog_tenant_actor(text) RETURNS uuid LANGUAGE sql AS $$SELECT current_setting('test.org')::uuid$$;
CREATE FUNCTION public.can_view_technical_visit(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.allowed')='true'$$;
CREATE FUNCTION public._assert_visita_editavel(uuid) RETURNS boolean LANGUAGE plpgsql AS $$BEGIN
 IF current_setting('test.allowed')<>'true' THEN RAISE EXCEPTION 'sem_permissao'; END IF; RETURN true; END$$;
CREATE FUNCTION public.rpc_upsert_recomendacao_visita(uuid,uuid,jsonb,integer) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
CREATE TABLE produtos(id uuid PRIMARY KEY,nome text,familia_catalogo text,ativo boolean,owner_organization_id uuid);
CREATE TABLE microrganismos(id uuid PRIMARY KEY,nome text,ativo boolean,owner_organization_id uuid);
CREATE TABLE catalog_tenant_visibility(organization_id uuid,entity_type text,produto_id uuid,microrganismo_id uuid,hidden boolean);
CREATE TABLE registros_consultor_recomendacoes(id uuid PRIMARY KEY,registro_consultor_id uuid,produto_biologico_sugerido_id uuid,microrganismo_id uuid,recomendacao_tecnica text);
SELECT set_config('test.allowed','true',false);`);
// Apenas o hash live é substituído pelo hash do stub; o restante do candidato executa integralmente.
const stub = (await db.query(`SELECT md5(pg_get_functiondef('public.rpc_upsert_recomendacao_visita(uuid,uuid,jsonb,integer)'::regprocedure)) hash`)).rows[0].hash;
await db.exec(readFileSync('scripts/rbac-audit/proposed-tenant-catalog-ownership-12-visit-selection.sql','utf8').replace('42f87a90cb7d1be324b43bb3867b3a28',stub));
const id = n => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12,'0')}`;
const ar=id(90),fsf=id(91),visit=id(92);
await db.query(`SELECT set_config('test.org',$1,false)`,[ar]);
await db.query(`INSERT INTO produtos VALUES ($1,'Bio','biologico',true,NULL),($2,'Químico','quimico',true,NULL),
($3,'Adubo','fertilizante_adubo',true,NULL),($4,'Legado',NULL,true,NULL),($5,'Oculto','biologico',true,NULL),
($6,'Privado AR','biologico',true,$8),($7,'Privado FSF','biologico',true,$9)`,[id(1),id(2),id(3),id(4),id(5),id(6),id(7),ar,fsf]);
await db.query(`INSERT INTO catalog_tenant_visibility VALUES ($1,'produto',$2,NULL,true)`,[ar,id(5)]);
let count=0;
const check=(name,ok)=>{assert.ok(ok,name);console.log('PASS',name);count++;};
const select=async(offset=0,limit=50,include=null)=> (await db.query(`SELECT * FROM tenant_catalog_visit_selection_page($1,'produto',NULL,$2,$3,$4)`,[visit,limit,offset,include])).rows;
let rows=await select();
check('químico elegível',rows.some(r=>r.id===id(2)&&r.selectable));
check('adubo elegível',rows.some(r=>r.id===id(3)&&r.selectable));
check('NULL não inferido',rows.some(r=>r.id===id(4)&&r.familia_catalogo===null));
check('oculto excluído',!rows.some(r=>r.id===id(5)));
check('próprios excluídos ambas empresas',!rows.some(r=>[id(6),id(7)].includes(r.id)));
rows=await select(0,50,[id(5)]);check('include histórico desativado',rows.some(r=>r.id===id(5)&&!r.selectable));
rows=await select(0,1);check('paginação',rows.length===1&&Number(rows[0].total)===4);
for(const n of [1,2,3,4]){await db.query('INSERT INTO registros_consultor_recomendacoes VALUES ($1,$2,$3,NULL,$4)',[id(100+n),visit,id(n),'rec']);check('grava família '+n,true);}
for(const n of [5,6,7]){let rejected=false;try{await db.query('INSERT INTO registros_consultor_recomendacoes VALUES ($1,$2,$3,NULL,$4)',[id(200+n),visit,id(n),'rec']);}catch(e){rejected=e.message.includes('catalog_visit_item_unavailable');}check('nega oculto/privado '+n,rejected);}
// Ocultar referência já salva não impede update de texto nem remove ID.
await db.query(`INSERT INTO catalog_tenant_visibility VALUES ($1,'produto',$2,NULL,true)`,[ar,id(1)]);
await db.query(`UPDATE registros_consultor_recomendacoes SET recomendacao_tecnica='Histórico editado' WHERE id=$1`,[id(101)]);
check('histórico preservado',(await db.query('SELECT produto_biologico_sugerido_id FROM registros_consultor_recomendacoes WHERE id=$1',[id(101)])).rows[0].produto_biologico_sugerido_id===id(1));
await db.query(`SELECT set_config('test.org',$1,false)`,[fsf]);check('FSF preferência independente',(await select()).some(r=>r.id===id(5)));
await db.exec(`SELECT set_config('test.allowed','false',false)`);
let denied=false;try{await select();}catch(e){denied=e.message.includes('sem_permissao');}check('visita não autorizada negada',denied);
console.log(`${count}/${count} PASS — stubs Auth/helpers; preflight live não certificado`);
await db.close();