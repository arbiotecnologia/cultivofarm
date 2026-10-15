/** Executes actual SQL01 mutation core, not a regex test. Schema minimal, identity/gate STUBBED.
 * node scripts/rbac-audit/check-owned-save-pglite.mjs /tmp/.../pglite/dist/index.js
 * No network; gate stub only in ephemeral database; not hosted Auth/RLS certification. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
if (!process.argv[2]) throw new Error('Provide isolated PGlite module');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`CREATE SCHEMA platform_private; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '11111111-1111-4111-8111-111111111111'::uuid$$;
CREATE FUNCTION platform_private.catalog_tenant_actor(text) RETURNS uuid LANGUAGE sql AS $$SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$;
CREATE FUNCTION platform_private.catalog_ownership_enabled() RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION platform_private.catalog_norm_name(text) RETURNS text LANGUAGE sql AS $$SELECT lower(btrim($1))$$;
CREATE FUNCTION platform_private.catalog_name_lock(text,text) RETURNS void LANGUAGE sql AS $$SELECT$$;
CREATE FUNCTION platform_private.catalog_composition_type_allowed(text,text) RETURNS boolean LANGUAGE sql AS $$SELECT $1='quimico' AND $2='ingrediente_ativo'$$;
CREATE TYPE tipo_produto AS ENUM ('inseticida','fungicida','solo','inoculante','solubilizador');
CREATE TYPE tipo_microrganismo AS ENUM ('bacteria','fungo','levedura','consorcio');
CREATE TABLE produtos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text,tipo tipo_produto,descricao text,modo_acao text,funcao_completa text,modo_aplicacao text,familia_catalogo text,classe_catalogo text,ativo boolean,b2b_enabled boolean,owner_organization_id uuid,updated_at timestamptz DEFAULT clock_timestamp(),archived_at timestamptz);
CREATE TABLE microrganismos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text,tipo tipo_microrganismo,nome_cientifico text,descricao text,ativo boolean,b2b_enabled boolean,owner_organization_id uuid,updated_at timestamptz DEFAULT clock_timestamp(),archived_at timestamptz);
CREATE TABLE culturas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text,descricao text,ativo boolean,owner_organization_id uuid,updated_at timestamptz DEFAULT clock_timestamp(),archived_at timestamptz);
CREATE TABLE formulacoes(id uuid,produto_id uuid,microrganismo_id uuid NOT NULL);
CREATE TABLE produto_composicao_conjuntos(produto_id uuid PRIMARY KEY REFERENCES produtos,status text CHECK(status IN ('rascunho','completo')),updated_by uuid,updated_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE produto_composicao_declaracoes(id uuid DEFAULT gen_random_uuid(),produto_id uuid REFERENCES produtos,ordem smallint,tipo_componente text CHECK(tipo_componente IN ('microrganismo','ingrediente_ativo','nutriente','outro')),microrganismo_id uuid,componente_nome text,quantidade numeric,unidade text CHECK(unidade IN ('mL/L','g/L','g/kg','%m/m','%m/v','%v/v','UFC/mL','UFC/g')),base text CHECK(base IN ('por_volume_produto','por_massa_produto')),natureza text CHECK(natureza IN ('teor_garantido','concentracao_declarada')));
CREATE TABLE catalog_tenant_owned_ledger(organization_id uuid,actor_id uuid,entity_type text,entity_id uuid,operation text,idempotency_key uuid,payload_hash text,reason text,before_state jsonb,after_state jsonb,result jsonb,UNIQUE(organization_id,actor_id,idempotency_key));`);
const sql=readFileSync('scripts/rbac-audit/proposed-tenant-catalog-ownership.sql','utf8');
for (const name of ['catalog_owned_allowed_keys','catalog_owned_mutate_core']) {
 const start=sql.indexOf(`CREATE FUNCTION platform_private.${name}(`);
 const end=sql.indexOf('END $$;',start);
 // Allowed keys is SQL, mutation PL/pgSQL. Execute exact source definition.
 await db.exec(sql.slice(start,name==='catalog_owned_allowed_keys'?sql.indexOf('END $$;',start)+7:end+7));
}
const composition={status:'completo',itens:[{ordem:1,tipo_componente:'ingrediente_ativo',microrganismo_id:null,componente_nome:'Declarado',quantidade:50,unidade:'g/L',base:'por_volume_produto',natureza:'concentracao_declarada'}]};
const payload={nome:'Produto transacional',tipo:'fungicida',familia_catalogo:'quimico',classe_catalogo:'fungicida',composition};
const key='22222222-2222-4222-8222-222222222222';
const mutate=async(op,id,version,p,k=key)=>(await db.query('SELECT platform_private.catalog_owned_mutate_core($1,$2,$3,$4,$5,$6,$7) v',['produto',op,id,version,JSON.stringify(p),'motivo suficiente',k])).rows[0].v;
let passes=0;
async function check(name,fn){await fn();passes++;console.log('PASS',name);}
await check('failure of composition rolls back root and ledger',async()=>{
 await assert.rejects(mutate('create',null,null,{...payload,composition:{...composition,itens:[{...composition.itens[0],quantidade:-1}]}}),e=>e.code==='22023');
 assert.equal((await db.query('SELECT count(*)::int n FROM produtos')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM catalog_tenant_owned_ledger')).rows[0].n,0);
});
const created=await mutate('create',null,null,payload);
await check('create and composition committed in same receipt',async()=>{
 assert.equal((await db.query('SELECT count(*)::int n FROM produtos')).rows[0].n,1);
 assert.equal((await db.query('SELECT quantidade FROM produto_composicao_declaracoes')).rows[0].quantidade,'50');
});
await check('same request replays without new roots or audit entries',async()=>{
 const replay=await mutate('create',null,null,payload);assert.equal(replay.replayed,true);assert.equal(replay.id,created.id);
 assert.equal((await db.query('SELECT count(*)::int n FROM catalog_tenant_owned_ledger')).rows[0].n,2);
});
await check('changed composition rejects reuse of same key',async()=>assert.rejects(mutate('create',null,null,{...payload,composition:{status:'rascunho',itens:[]}}),e=>e.code==='22023'));
await check('failed combined update preserves name/version/declarations',async()=>{
 await assert.rejects(mutate('update',created.id,created.updated_at,{nome:'Must rollback',composition:{status:'invalid',itens:[]}},'33333333-3333-4333-8333-333333333333'),e=>e.code==='22023');
 assert.equal((await db.query('SELECT nome FROM produtos')).rows[0].nome,payload.nome);
 assert.equal((await db.query('SELECT count(*)::int n FROM produto_composicao_declaracoes')).rows[0].n,1);
});
const cleared=await mutate('update',created.id,created.updated_at,{composition:{status:'rascunho',itens:[]}},'44444444-4444-4444-8444-444444444444');
await check('composition-only clear accepted without metadata no-op',async()=>assert.equal((await db.query('SELECT count(*)::int n FROM produto_composicao_declaracoes')).rows[0].n,0));
await check('stale CAS rejected',async()=>assert.rejects(mutate('update',created.id,created.updated_at,{nome:'stale'},'55555555-5555-4555-8555-555555555555'),e=>e.code==='40001'));
await check('omitted composition preserves existing declarations',async()=>{
 await mutate('update',created.id,cleared.updated_at,{nome:'Changed name'},'66666666-6666-4666-8666-666666666666');
 assert.equal((await db.query('SELECT status FROM produto_composicao_conjuntos')).rows[0].status,'rascunho');
});
console.log(JSON.stringify({passes,failed:0,evidence:'actual SQL01 core executed; identity/schema/gate stubs, NOT hosted Auth/RLS'}));
await db.close();
