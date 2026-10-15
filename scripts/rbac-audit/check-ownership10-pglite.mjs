/** Executes complete candidate10 function definitions in isolated PostgreSQL.
 * Minimal schemas/identity/permission helpers STUBBED: not hosted Auth/RLS proof.
 * No network. node scripts/rbac-audit/check-ownership10-pglite.mjs /tmp/.../pglite/dist/index.js */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`CREATE SCHEMA platform_private; CREATE SCHEMA auth;
CREATE TYPE app_role AS ENUM ('administrador','gestor_comercial','financeiro','parceiro_b2b_tecnico');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;
CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION fn_regulatory_can_prepare() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION _saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION fn_catalogo_preco_canonico(uuid,uuid,text,numeric) RETURNS numeric LANGUAGE sql AS $$ SELECT 180::numeric $$;
CREATE TABLE produtos(id uuid PRIMARY KEY,nome text,codigo text,owner_organization_id uuid,ativo boolean,b2b_enabled boolean,valor_ha_brl numeric,dose_ml_ha numeric,valor_dose_brl numeric,valor_litro_brl numeric);
CREATE TABLE microrganismos(LIKE produtos INCLUDING ALL, product_id uuid);
CREATE TABLE partner_accounts(id uuid,desconto_padrao numeric,ativo boolean,deleted_at timestamptz);
CREATE TABLE partner_product_prices(partner_id uuid,product_id uuid,microrganismo_id uuid,preco_tabela numeric,desconto_percentual numeric,preco_final numeric,ativo boolean,is_current boolean,valid_from date,valid_until date);
CREATE UNIQUE INDEX ppp ON partner_product_prices(partner_id,product_id) WHERE product_id IS NOT NULL;
CREATE TABLE partner_user_clients(cliente_id uuid,user_id uuid,partner_id uuid,active boolean);
CREATE TABLE partner_technician_clients(cliente_id uuid,technician_user_id uuid,partner_id uuid,active boolean);
CREATE TABLE partner_simulations(id uuid DEFAULT gen_random_uuid(),partner_id uuid,created_by uuid,titulo text,observacoes text,cultura text,area_total_ha numeric,objetivo_tecnico text,status text,total_cheio numeric,valid_until date,cliente_id uuid);
CREATE TABLE partner_simulation_items(simulation_id uuid,item_tipo text,item_id uuid,nome text,quantidade numeric,valor_unitario_cheio numeric,subtotal numeric,unidade_medida text,volume_ml numeric,area_ha numeric);
CREATE TABLE fiscal_invoices(id uuid);
CREATE TABLE product_fiscal_profiles(product_id uuid);
`);
const sql=readFileSync('scripts/rbac-audit/proposed-tenant-catalog-ownership-10-global-roots.sql','utf8');
await db.exec(`CREATE FUNCTION platform_private.catalog_ownership_enabled() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;`);
const definitions=sql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g);
assert.equal(definitions.length,9);
for (const name of ["public.partner_apply_default_discount","public.rpc_commercial_simulator","public.fn_resolve_commercial_price","public.fn_b2b_resolve_base_unit_price","public.fn_resolve_b2b_cart","platform_private.b2b_save_technical_simulation","public.rpc_associate_microorganism_fiscal_product","public.rpc_regulatory_dossier_ensure_draft","public.rpc_fiscal_draft_save"]) await db.exec(readFileSync(`scripts/rbac-audit/live-defs/${name}-ownership10-before.sql`, "utf8"));
await db.exec(sql);
let passes=0;
const check=async(name, fn)=>{await fn();passes++;console.log('PASS',name)};
const global='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const own='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const other='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const absent='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
await db.query(`INSERT INTO produtos(id,nome,owner_organization_id,ativo,b2b_enabled,valor_ha_brl) VALUES ($1,'Bomb',NULL,true,true,180),($2,'AR privado',$2,true,true,42),($3,'FSF privado',$3,true,true,84)`,[global,own,other]);
await db.exec('INSERT INTO microrganismos SELECT p.*,NULL::uuid FROM produtos p');
const result=async(query,args)=>(await db.query(query,args)).rows[0].v;
for(const id of [own,other,absent]){
 await check(`base price private/missing ${id.slice(-1)}`,async()=>assert.deepEqual(await result(`SELECT fn_b2b_resolve_base_unit_price(NULL,$1,NULL,'litro',NULL,NULL) v`,[id]),{ok:false,reason_code:'ITEM_INVALID'}));
 await check(`commercial price before quote/replay ${id.slice(-1)}`,async()=>assert.equal((await result(`SELECT fn_resolve_commercial_price('partner',NULL,NULL,NULL,$1,NULL,'litro',NULL) v`,[id])).reason_code,'ITEM_INVALID'));
 await check(`simulator before campaign ${id.slice(-1)}`,async()=>assert.rejects(result('SELECT rpc_commercial_simulator(NULL,$1,1,0) v',[id]),e=>e.code==='P0002'&&e.message.includes('product_unavailable')));
 await check(`cart private matches missing ${id.slice(-1)}`,async()=>assert.rejects(result('SELECT fn_resolve_b2b_cart(NULL,NULL,$1::jsonb) v',[JSON.stringify([{item_id:id,item_tipo:'produto',quantidade:1}])]),e=>e.message.includes('product_unavailable')));
 await check(`association private matches missing ${id.slice(-1)}`,async()=>assert.rejects(db.query('SELECT * FROM rpc_associate_microorganism_fiscal_product($1,NULL)',[id]),e=>e.code==='P0002'&&e.message==='not_found'));
 await check(`regulatory before existing draft ${id.slice(-1)}`,async()=>assert.rejects(result('SELECT rpc_regulatory_dossier_ensure_draft($1) v',[id]),e=>e.code==='22023'&&e.message.includes('REGULATORY_MICROORGANISM_NOT_FOUND')));
 await check(`technical simulation rolls back private ${id.slice(-1)}`,async()=>{await assert.rejects(result('SELECT platform_private.b2b_save_technical_simulation($1::jsonb) v',[JSON.stringify({partner_id:global,items:[{item_id:id,item_tipo:'produto',quantidade:1}]})]),e=>e.message.includes('product_unavailable'));assert.equal((await db.query('SELECT count(*) n FROM partner_simulations')).rows[0].n,0)});
}
await check('base global retains 180',async()=>assert.equal((await result("SELECT fn_b2b_resolve_base_unit_price(NULL,$1,NULL,'litro') v",[global])).base_price,180));
await check('SA association cannot reference private product',async()=>assert.rejects(db.query('SELECT * FROM rpc_associate_microorganism_fiscal_product($1,$2)',[global,own]),e=>e.code==='P0002'&&e.message==='product_not_found'));
await check('SA association global succeeds',async()=>assert.equal((await db.query('SELECT * FROM rpc_associate_microorganism_fiscal_product($1,$1)',[global])).rows[0].product_id,global));
await check('discount bulk operation selects globals, not private (even B2B true)',async()=>{
 await db.query('INSERT INTO partner_accounts VALUES($1,10,true,NULL)',[global]);
 assert.equal(await result('SELECT partner_apply_default_discount($1) v',[global]),1);
 assert.deepEqual((await db.query('SELECT product_id,preco_final FROM partner_product_prices')).rows,[{product_id:global,preco_final:'162.00'}]);
});
await check('technical simulation global succeeds',async()=>{assert.ok(await result('SELECT platform_private.b2b_save_technical_simulation($1::jsonb) v',[JSON.stringify({partner_id:global,items:[{item_id:global,item_tipo:'microrganismo',quantidade:1}]})]));assert.equal((await db.query('SELECT count(*) n FROM partner_simulation_items')).rows[0].n,1)});
console.log(`${passes}/${passes} PASS. All nine definitions registered; fiscal draft mutation runtime UNVERIFIED; complete SQL10 plus nine hash preflights executed. Auth/roles/schema helpers STUBBED.`);
await db.close();
