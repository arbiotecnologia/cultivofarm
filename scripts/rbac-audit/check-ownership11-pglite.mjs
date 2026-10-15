/** Executa o candidato 11 inteiro em PostgreSQL isolado (PGlite). Schema/identidade STUB: não prova Auth/RLS hospedados. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA platform_private; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;
CREATE FUNCTION public.fn_regulatory_can_prepare() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.fn_gtin_is_valid(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION platform_private.catalog_ownership_enabled() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE public.produtos(id uuid PRIMARY KEY, owner_organization_id uuid);
CREATE TABLE public.microrganismos(id uuid PRIMARY KEY, owner_organization_id uuid);
CREATE TABLE public.catalogo_volumes(id uuid PRIMARY KEY, produto_id uuid REFERENCES public.produtos, microrganismo_id uuid REFERENCES public.microrganismos, owner_organization_id uuid);
CREATE TABLE public.microorganism_regulatory_dossiers(id uuid PRIMARY KEY, microorganism_id uuid NOT NULL REFERENCES public.microrganismos, status text, deleted_at timestamptz);
CREATE TABLE public.microorganism_regulatory_presentations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dossier_id uuid NOT NULL REFERENCES public.microorganism_regulatory_dossiers,
 catalog_volume_id uuid REFERENCES public.catalogo_volumes ON DELETE SET NULL, volume_ml int NOT NULL, label text NOT NULL, commercial_unit text, taxable_unit text, conversion_factor numeric,
 gtin text, gtin_absent boolean NOT NULL DEFAULT false, gtin_absent_reason text, gtin_absent_by uuid, gtin_absent_at timestamptz, units_confirmed boolean NOT NULL DEFAULT false,
 units_confirmed_by uuid, units_confirmed_at timestamptz, gtin_confirmed boolean NOT NULL DEFAULT false, gtin_confirmed_by uuid, gtin_confirmed_at timestamptz,
 created_by uuid, updated_by uuid, UNIQUE(dossier_id, volume_ml));`);
await db.exec(readFileSync('scripts/rbac-audit/live-defs/public.rpc_regulatory_presentation_upsert-ownership11-before.sql','utf8'));
const G='aaaaaaaa-aaaa-4aaa-8aaa-000000000001', AR='aaaaaaaa-aaaa-4aaa-8aaa-0000000000a1', FSF='aaaaaaaa-aaaa-4aaa-8aaa-0000000000f1';
const id=(n)=>`bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12,'0')}`;
await db.query('INSERT INTO produtos VALUES ($1,NULL),($2,$4),($3,$5)',[id(1),id(2),id(3),AR,FSF]);
await db.query('INSERT INTO microrganismos VALUES ($1,NULL),($2,$3)',[id(11),id(12),AR]);
// volumes: global/global-parent, privado AR, privado FSF, volume "global" com pai privado (forja), ausente
await db.query('INSERT INTO catalogo_volumes VALUES ($1,$2,NULL,NULL),($3,$4,NULL,$7),($5,$6,NULL,$8),($9,$4,NULL,NULL),($10,NULL,$11,NULL)',[id(21),id(1),id(22),id(2),id(23),id(3),AR,FSF,id(24),id(25),id(12)]);
await db.query("INSERT INTO microorganism_regulatory_dossiers VALUES ($1,$2,'DRAFT',NULL),($3,$4,'DRAFT',NULL)",[id(31),id(11),id(32),id(12)]);
// histórico global pré-existente
await db.query('INSERT INTO microorganism_regulatory_presentations(dossier_id,catalog_volume_id,volume_ml,label) VALUES ($1,$2,1000,$3)',[id(31),id(21),'1 L']);
const preflightDef=md5=>md5;
let sql=readFileSync('scripts/rbac-audit/proposed-tenant-catalog-ownership-11-regulatory-presentations.sql','utf8');
// pg_constraint.confdeltype e md5 são reais; hash live substituído pelo hash do mesmo texto carregado (PGlite formata igual ao arquivo before?)
const h=(await db.query(`SELECT md5(pg_get_functiondef('public.rpc_regulatory_presentation_upsert(uuid,integer,jsonb)'::regprocedure)) h`)).rows[0].h;
if (h!=='74f45dd67e9435a9876b0e2609e38954') { console.log('NOTE hash PGlite',h,'≠ live; substituído apenas no harness'); sql=sql.replace('74f45dd67e9435a9876b0e2609e38954',h); }
await db.exec(sql);
let pass=0; const check=async(n,f)=>{await f();pass++;console.log('PASS',n)};
const up=(dossier,vol,ml)=>db.query('SELECT rpc_regulatory_presentation_upsert($1,$2,$3::jsonb) v',[dossier,ml,JSON.stringify(vol?{catalog_volume_id:vol}:{})]);
const cnt=async()=>Number((await db.query('SELECT count(*) n FROM microorganism_regulatory_presentations')).rows[0].n);
await check('global volume + global dossier aceita',async()=>{await up(id(31),id(21),500);assert.equal(await cnt(),2)});
for (const [n,v] of [['privado AR',id(22)],['privado FSF',id(23)],['volume global com pai privado (forja)',id(24)],['volume de micro privado',id(25)],['inexistente','cccccccc-cccc-4ccc-8ccc-cccccccccccc']]) {
  await check(`writer recusa ${n} com mensagem única e sem gravar`,async()=>{const b=await cnt();await assert.rejects(up(id(31),v,100+pass),e=>e.message==='REGULATORY_CATALOG_VOLUME_NOT_FOUND'&&e.code==='22023');assert.equal(await cnt(),b)});
}
await check('dossiê de micro privado não vincula volume global',async()=>assert.rejects(up(id(32),id(21),700),e=>e.message==='REGULATORY_CATALOG_VOLUME_NOT_FOUND'));
await check('sem volume continua aceito',async()=>{await up(id(31),null,2000)});
await check('trigger bloqueia UPDATE direto (bypass do writer) para volume privado',async()=>assert.rejects(db.query('UPDATE microorganism_regulatory_presentations SET catalog_volume_id=$1 WHERE volume_ml=1000',[id(22)]),e=>e.code==='42501'));
await check('trigger bloqueia INSERT direto com volume privado',async()=>assert.rejects(db.query('INSERT INTO microorganism_regulatory_presentations(dossier_id,catalog_volume_id,volume_ml,label) VALUES ($1,$2,9,$3)',[id(31),id(23),'x']),e=>e.code==='42501'));
await check('trigger bloqueia trocar dossiê para micro privado mantendo volume',async()=>assert.rejects(db.query('UPDATE microorganism_regulatory_presentations SET dossier_id=$1 WHERE volume_ml=1000',[id(32)]),e=>e.code==='42501'));
await check('UPDATE histórico irrelevante não é bloqueado',async()=>{await db.query("UPDATE microorganism_regulatory_presentations SET label='1 litro' WHERE volume_ml=1000")});
await check('ON DELETE SET NULL preservado (sem remover apresentação)',async()=>{await db.query('DELETE FROM catalogo_volumes WHERE id=$1',[id(21)]);const r=(await db.query('SELECT count(*) n, count(catalog_volume_id) v FROM microorganism_regulatory_presentations')).rows[0];assert.equal(Number(r.n),3);assert.equal(Number(r.v),0)});
await check('preflight real aborta se vínculo privado já existir',async()=>{
  await db.exec('ALTER TABLE microorganism_regulatory_presentations DISABLE TRIGGER trg_catalog_regulatory_presentation_guard');
  await db.query('INSERT INTO microorganism_regulatory_presentations(dossier_id,catalog_volume_id,volume_ml,label) VALUES ($1,$2,77,$3)',[id(31),id(22),'forjado']);
  const pre='DO \u0024\u0024 BEGIN '+sql.slice(sql.indexOf('  IF EXISTS (SELECT 1 FROM public.microorganism_regulatory_presentations'),sql.indexOf('END \u0024g\u0024;'))+' END \u0024\u0024;';
  await assert.rejects(db.exec(pre),e=>e.message==='ownership11_private_regulatory_link_present');
});
console.log(`${pass} PASS`);
