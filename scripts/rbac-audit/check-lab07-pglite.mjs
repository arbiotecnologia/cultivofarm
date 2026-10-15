/** Actual candidate07 DDL/functions in ephemeral PostgreSQL. Auth/ACL/schema helpers STUBBED.
 * Before-hash preflight requires live definitions: NOT run here. Never hosted certification. */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
if (!process.argv[2]) throw Error('Provide isolated PGlite module');
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
await db.exec(`CREATE SCHEMA platform_private; CREATE SCHEMA auth;
CREATE ROLE authenticated; CREATE ROLE anon;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT $1 IS NOT NULL AND current_setting('test.role',true)='administrador'$$;
CREATE TYPE partner_order_status AS ENUM('aprovado','em_producao','produzido','entregue','faturado','cancelado','reprovado');
CREATE TYPE production_planning_status AS ENUM('aguardando_planejamento','planejado','em_producao','produzido','entregue','replanejar');
CREATE TABLE produtos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),familia_catalogo text);
CREATE TABLE microrganismos(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE partner_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome_fantasia text,razao_social text);
CREATE TABLE partner_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),partner_id uuid,numero text,status partner_order_status DEFAULT 'aprovado',ready_for_production boolean DEFAULT true,internal_origin_snapshot jsonb,requires_financial_approval boolean DEFAULT false,financial_approval_status text,updated_at timestamptz);
CREATE TABLE production_planning(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),partner_order_id uuid,partner_id uuid,status production_planning_status DEFAULT 'aguardando_planejamento',planned_start_date date,planned_finish_date date,updated_at timestamptz);
CREATE TABLE partner_order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid,product_id uuid,microrganismo_id uuid,quantidade numeric,unidade_medida text,preco_tabela_snapshot numeric,preco_unitario numeric,produto_nome_snapshot text,produto_codigo_snapshot text,created_at timestamptz DEFAULT now());
CREATE TABLE catalogo_volumes(id uuid DEFAULT gen_random_uuid(),item_tipo text,produto_id uuid,volume_ml numeric,preco_brl numeric,ativo boolean);
CREATE TABLE ordens_servico(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,fazenda_id uuid,talhao_id uuid,produto_id uuid,microrganismo_id uuid,volume_total_ml numeric,area_hectares numeric,prioridade text,status text, tipo_item text,numero_os text,partner_order_id uuid,partner_order_item_id uuid,origem text,data_programada date);
CREATE TABLE ordens_servico_onfarm(LIKE ordens_servico INCLUDING ALL);
CREATE TABLE programacao_producao(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ordem_servico_id uuid,ordem_servico_onfarm_id uuid,produto_id uuid,microrganismo_id uuid,data_programada date,status text);
CREATE TABLE lotes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),programacao_id uuid UNIQUE,codigo_lote text UNIQUE,produto_id uuid,microrganismo_id uuid,volume_produzido numeric,data_producao date,responsavel_producao text,tanque text,observacoes_tecnicas text);
CREATE TABLE production_order_link(partner_order_id uuid,partner_order_item_id uuid UNIQUE,planning_id uuid,ordem_servico_id uuid,created_by uuid);
CREATE TABLE production_timeline_events(partner_order_id uuid,event_type text,actor_id uuid,meta jsonb);
CREATE TABLE partner_order_audit_logs(order_id uuid,partner_id uuid,usuario_id uuid,acao text,dados_novos jsonb);
CREATE TABLE laboratorio_esteira_eventos(os_id uuid,origem_os text,programacao_id uuid,lote_id uuid,etapa_anterior text,etapa_nova text,acao text,usuario_id uuid,observacao text);
CREATE TABLE production_planning_publications(planning_id uuid UNIQUE,partner_order_id uuid,idempotency_key text UNIQUE,os_created int,resultado jsonb,performed_by uuid);
CREATE TABLE user_roles(user_id uuid,role text);
CREATE FUNCTION _validate_planning_integrity(uuid) RETURNS void LANGUAGE sql AS $$SELECT$$;
CREATE FUNCTION refresh_esteira_laboratorio() RETURNS void LANGUAGE sql AS $$SELECT$$;
CREATE FUNCTION fn_cockpit_assert_operador_origem(text) RETURNS text LANGUAGE plpgsql AS $$BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF; RETURN $1; END$$;
CREATE FUNCTION gerar_codigo_lote(integer) RETURNS text LANGUAGE sql AS $$SELECT gen_random_uuid()::text$$;`);
const sql=readFileSync('scripts/rbac-audit/proposed-lab-biological-only-07.sql','utf8');
// Only the LIVE-hash/ref preflight is excluded; all candidate definitions/triggers execute verbatim.
const preflightStart=sql.indexOf('DO $$ BEGIN');
const preflightEnd=sql.indexOf('END $$;',preflightStart)+7;
await db.exec(sql.slice(0,preflightStart)+sql.slice(preflightEnd));
let passes=0;
async function check(name,fn){await fn();passes++;console.log('PASS',name);}
const q=async(sql,p=[])=>(await db.query(sql,p)).rows;
const id=async(table,columns='',params=[])=> (await q(`INSERT INTO ${table} ${columns} RETURNING id`,params))[0].id;
const bio=await id('produtos','(familia_catalogo) VALUES ($1)',['biologico']);
const chemical=await id('produtos','(familia_catalogo) VALUES ($1)',['quimico']);
const fert=await id('produtos','(familia_catalogo) VALUES ($1)',['fertilizante_adubo']);
const unclassified=await id('produtos','DEFAULT VALUES');
const micro=await id('microrganismos','DEFAULT VALUES');
for(const [name,p,m,expected] of [['bio',bio,null,true],['chemical',chemical,null,false],['fertilizer',fert,null,false],['NULL family',unclassified,null,false],['micro',null,micro,true],['no roots',null,null,false],['dual chemical/micro',chemical,micro,false],['dual bio/micro',bio,micro,false]]){
 await check(name,async()=>assert.equal((await q('SELECT platform_private.lab_item_is_manufacturable($1,$2) ok',[p,m]))[0].ok,expected));
}
for(const table of ['ordens_servico','ordens_servico_onfarm','programacao_producao','lotes']){
 for(const [name,p,m] of [['chemical',chemical,null],['fert',fert,null],['NULL',unclassified,null],['dual',bio,micro]]){
  await check(`${table} rejects ${name}`,async()=>assert.rejects(q(`INSERT INTO ${table}(produto_id,microrganismo_id) VALUES($1,$2)`,[p,m]),e=>e.code==='23514'));
 }
 await check(`${table} accepts bio and micro`,async()=>{await q(`INSERT INTO ${table}(produto_id,microrganismo_id) VALUES($1,NULL),(NULL,$2)`,[bio,micro]);});
}
// Historical unclassified record predates the new guard; no data backfill/reclassification.
await db.exec('ALTER TABLE programacao_producao DISABLE TRIGGER trg_lab_programming_biological_only;');
const hist=await id('programacao_producao','(produto_id,status) VALUES($1,$2)',[unclassified,'old']);
await db.exec('ALTER TABLE programacao_producao ENABLE TRIGGER trg_lab_programming_biological_only;');
await check('irrelevant history update preserved',async()=>{await q('UPDATE programacao_producao SET status=$1,produto_id=produto_id WHERE id=$2',['kept',hist]);assert.equal((await q('SELECT produto_id FROM programacao_producao WHERE id=$1',[hist]))[0].produto_id,unclassified);});
const actor='11111111-1111-4111-8111-111111111111';
await q("SELECT set_config('test.actor',$1,false),set_config('test.role','administrador',false)",[actor]);
await q('INSERT INTO user_roles VALUES($1,$2)',[actor,'administrador']);
const partner=await id('partner_accounts','DEFAULT VALUES');
const order=await id('partner_orders','(partner_id) VALUES($1)',[partner]);
const planning=await id('production_planning','(partner_order_id,partner_id) VALUES($1,$2)',[order,partner]);
for(const [p,m] of [[bio,null],[chemical,null],[fert,null],[unclassified,null],[null,micro],[bio,micro]]) await id('partner_order_items','(order_id,product_id,microrganismo_id,quantidade,unidade_medida) VALUES($1,$2,$3,2,$4)',[order,p,m,'litro']);
let result;
await check('mixed order creates only bio/micro OS',async()=>{result=(await q('SELECT generate_production_orders_from_partner($1) v',[order]))[0].v;assert.equal(result.os_created,2);assert.equal(result.non_lab_items,4);assert.equal((await q('SELECT count(*)::int n FROM partner_order_items WHERE order_id=$1',[order]))[0].n,6);assert.equal((await q('SELECT count(*)::int n FROM production_order_link WHERE partner_order_id=$1',[order]))[0].n,2);});
await check('generation replay has zero new OS',async()=>{const v=(await q('SELECT generate_production_orders_from_partner($1) v',[order]))[0].v;assert.equal(v.os_created,0);assert.equal((await q('SELECT count(*)::int n FROM ordens_servico WHERE partner_order_id=$1',[order]))[0].n,2);});
await check('publish and same-key replay preserve nonlab lines',async()=>{const first=(await q('SELECT rpc_planejamento_publicar_v1($1,$2) v',[planning,'audit-key-0001']))[0].v;assert.equal(first.replay,false);const second=(await q('SELECT rpc_planejamento_publicar_v1($1,$2) v',[planning,'audit-key-0001']))[0].v;assert.equal(second.replay,true);assert.equal((await q('SELECT count(*)::int n FROM partner_order_items WHERE order_id=$1',[order]))[0].n,6);});
await db.exec('CREATE TRIGGER lab07_sync_test AFTER UPDATE ON ordens_servico FOR EACH ROW EXECUTE FUNCTION trg_os_sync_partner_order_fn();');
await check('mixed order not marked wholly produced',async()=>{await q("UPDATE ordens_servico SET status='pronto_entrega' WHERE partner_order_id=$1",[order]);assert.notEqual((await q('SELECT status FROM partner_orders WHERE id=$1',[order]))[0].status,'produzido');});
const os=(await q('SELECT id,produto_id,microrganismo_id FROM ordens_servico WHERE partner_order_id=$1 ORDER BY produto_id NULLS LAST',[order]))[0];
const prog=await id('programacao_producao','(ordem_servico_id,produto_id,microrganismo_id) VALUES($1,$2,$3)',[os.id,os.produto_id,os.microrganismo_id]);
await check('lot derives roots, replay does not fabricate twice',async()=>{const a=(await q('SELECT rpc_cockpit_gerar_lote_v1($1,$2,$3,$4) v',[prog,os.id,'b2b',JSON.stringify({volume_produzido:10})]))[0].v;assert.equal(a.replay,false);const b=(await q('SELECT rpc_cockpit_gerar_lote_v1($1,$2,$3,$4) v',[prog,os.id,'b2b','{}']))[0].v;assert.equal(b.replay,true);assert.equal(a.lote_id,b.lote_id);});
await check('internal downstream blocked including publication replay',async()=>{await q('UPDATE partner_orders SET internal_origin_snapshot=$1 WHERE id=$2',['{}',order]);await assert.rejects(q('SELECT generate_production_orders_from_partner($1)',[order]),e=>e.code==='42501'&&e.message==='B2B_INTERNAL_DOWNSTREAM_UNVERIFIED');await assert.rejects(q('SELECT rpc_planejamento_publicar_v1($1,$2)',[planning,'audit-key-0001']),e=>e.code==='42501'&&e.message==='B2B_INTERNAL_DOWNSTREAM_UNVERIFIED');});
await check('Auth absent generation rejects',async()=>{await q("SELECT set_config('test.actor','',false)");await assert.rejects(q('SELECT generate_production_orders_from_partner($1)',[order]),e=>e.code==='42501');});
console.log(JSON.stringify({passes,failed:0,preflights:'NOT RUN: canonical live definitions required',hosted:'UNVERIFIED',stubs:'Auth/permissions/schema/cockpit/integrity/refresh'}));
await db.close();
