/** Isolated PostgreSQL only. Auth/RBAC/tenant helpers STUBBED; no hosted writes. */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
if(!process.argv[2]) throw Error('Provide isolated PGlite module path');
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const source=readFileSync('scripts/rbac-audit/check-lab07-pglite.mjs','utf8');
await db.exec(source.slice(source.indexOf('await db.exec(`')+15,source.indexOf('`);')));
await db.exec(`CREATE TYPE app_role AS ENUM('administrador','gestor','consultor_tecnico','tecnico_agronomo');
CREATE TYPE estrategia_manejo AS ENUM('biologico','manejo_integrado','monitoramento','correcao_operacional','ajuste_aplicacao','ajuste_janela','outro');
CREATE TYPE status_registro_consultor AS ENUM('rascunho','em_andamento','finalizado','enviado_aprovacao','aprovado','convertido_os','arquivado','reprovado');
CREATE TYPE modo_aplicacao_consultor AS ENUM('foliar','aplicacao_no_colo_da_planta','via_solo','tratamento_semente','sulco_plantio','jato_dirigido','outro');
ALTER TABLE produtos ADD ativo boolean DEFAULT true, ADD owner_organization_id uuid;
ALTER TABLE microrganismos ADD ativo boolean DEFAULT true, ADD owner_organization_id uuid;
CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$SELECT has_role($1,$2::text)$$;
CREATE TABLE registros_consultor(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,consultor_responsavel uuid,status status_registro_consultor DEFAULT 'aprovado',cliente_id uuid DEFAULT gen_random_uuid(),fazenda_id uuid DEFAULT gen_random_uuid(),talhao_id uuid DEFAULT gen_random_uuid(),area_hectares numeric,cultura_id uuid,fase_fenologica text,problema_principal text,solicitacao_id uuid,hora_inicio timestamptz,updated_at timestamptz);
CREATE FUNCTION can_view_technical_visit(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM registros_consultor WHERE id=$2 AND organization_id=h15_actor_organization() AND $1=auth.uid())$$;
CREATE TABLE registros_consultor_recomendacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),registro_consultor_id uuid REFERENCES registros_consultor(id),produto_biologico_sugerido_id uuid,microrganismo_id uuid,encaminhar_para_os boolean DEFAULT false,recomendacao_tecnica text,observacoes_finais text,estrategia_manejo estrategia_manejo,modo_aplicacao modo_aplicacao_consultor,versao integer NOT NULL DEFAULT 1,created_at timestamptz DEFAULT now());
ALTER TABLE ordens_servico_onfarm ADD registro_consultor_id uuid,ADD solicitacao_id uuid,ADD consultor_responsavel uuid,ADD cultura_id uuid,ADD fase_fenologica text,ADD problema_principal text,ADD diagnostico text,ADD recomendacao_tecnica text,ADD observacoes_adicionais text,ADD created_by uuid,ADD modo_aplicacao modo_aplicacao_consultor,ADD data_recomendada date;
CREATE UNIQUE INDEX idx_unique_os_onfarm_registro_consultor ON public.ordens_servico_onfarm USING btree(registro_consultor_id) WHERE registro_consultor_id IS NOT NULL;
ALTER TABLE programacao_producao ADD volume_necessario numeric;
CREATE TABLE portal_solicitacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text DEFAULT 'aguardando_decisao_produtor',updated_at timestamptz);
CREATE TABLE solicitacoes_timeline(solicitacao_id uuid,tipo_evento text,descricao text,usuario_id uuid);
CREATE TABLE registros_consultor_status_log(registro_consultor_id uuid,status_anterior text,status_novo text,motivo text,changed_by uuid,changed_at timestamptz);
CREATE TABLE visitas_logs(registro_consultor_id uuid,solicitacao_id uuid,acao text,descricao text,usuario_id uuid,metadata jsonb);
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text,name text);
INSERT INTO supabase_migrations.schema_migrations VALUES('20261015154248','h_catalog_visit_conversion_enum_text');
CREATE TABLE fiscal_environment_marker(project_ref text);
INSERT INTO fiscal_environment_marker VALUES('swzpzcwiasxmjutrmvkm');`);
const base=readFileSync('scripts/rbac-audit/proposed-lab-biological-only-07.sql','utf8');
const start=base.indexOf('DO $$ BEGIN'),end=base.indexOf('END $$;',start)+7;
await db.exec(base.slice(0,start)+base.slice(end));
const snapshot=readFileSync('scripts/rbac-audit/live-defs/public.rpc_converter_visita_em_os-enum-text-applied.sql','utf8');
await db.exec(snapshot);
const scalar=async(sql,p=[])=> (await db.query(sql,p)).rows[0];
const before=(await scalar("SELECT md5(pg_get_functiondef('public.rpc_converter_visita_em_os(uuid,text)'::regprocedure)) hash")).hash;
assert.equal(before,'89a904d232b32c57c24931a007f6d728');
// Exact canonical BEFORE trigger bodies (hash-checked by the candidate preflight).
await db.exec(`CREATE OR REPLACE FUNCTION public.auto_advance_solicitacao_on_registro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.solicitacao_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- hora_inicio set => em_visita
  IF TG_OP = 'UPDATE' AND OLD.hora_inicio IS NULL AND NEW.hora_inicio IS NOT NULL THEN
    UPDATE public.portal_solicitacoes
      SET status = 'em_visita', updated_at = now()
      WHERE id = NEW.solicitacao_id
        AND status NOT IN ('concluida','cancelada');
  END IF;

  -- status convertido_os => concluida
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status::text = 'convertido_os' THEN
    UPDATE public.portal_solicitacoes
      SET status = 'concluida', updated_at = now()
      WHERE id = NEW.solicitacao_id;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_create_programacao_on_os_onfarm_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status::text NOT IN ('aberta','aprovada','programada') THEN
    RETURN NEW;
  END IF;
  IF NEW.produto_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.programacao_producao WHERE ordem_servico_onfarm_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.programacao_producao
    (produto_id, volume_necessario, data_programada, status, ordem_servico_onfarm_id)
  VALUES
    (NEW.produto_id, NEW.volume_total_ml,
     COALESCE(NEW.data_recomendada, CURRENT_DATE), 'aguardando', NEW.id);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION rpc_converter_visita_em_os(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpc_converter_visita_em_os(uuid,text) TO authenticated;
CREATE TRIGGER trg_auto_advance_solicitacao_registro AFTER UPDATE ON registros_consultor FOR EACH ROW EXECUTE FUNCTION auto_advance_solicitacao_on_registro();
CREATE TRIGGER trg_create_programacao_on_os_insert AFTER INSERT ON ordens_servico_onfarm FOR EACH ROW EXECUTE FUNCTION fn_create_programacao_on_os_onfarm_insert();`);
const candidate=readFileSync('scripts/rbac-audit/proposed-lab-visit-explicit-07.sql','utf8');
await db.exec(candidate); // FULL visit preflight including REAL hashes/enum/index; no md5 stub.
let passes=0;
async function check(name,fn){await fn();passes++;console.log('PASS',name);}
const q=async(sql,p=[])=>(await db.query(sql,p)).rows;
const id=async(table,cols='DEFAULT VALUES',p=[])=>(await scalar(`INSERT INTO ${table} ${cols} RETURNING id`,p)).id;
const AR='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',FSF='ffffffff-ffff-4fff-8fff-ffffffffffff',actor='11111111-1111-4111-8111-111111111111',missing='00000000-0000-4000-8000-000000000000';
await q("SELECT set_config('test.actor',$1,false),set_config('test.role','administrador',false),set_config('test.org',$2,false)",[actor,AR]);
const bio=await id('produtos',"(familia_catalogo) VALUES('biologico')"),chem=await id('produtos',"(familia_catalogo) VALUES('quimico')"),fert=await id('produtos',"(familia_catalogo) VALUES('fertilizante_adubo')"),nul=await id('produtos'),micro=await id('microrganismos');
const visit=async()=>{const solic=await id('portal_solicitacoes');return id('registros_consultor','(organization_id,consultor_responsavel,solicitacao_id) VALUES($1,$2,$3)',[AR,actor,solic]);};
const rec=(v,p,m,flag=true,text='Recomendação')=>id('registros_consultor_recomendacoes','(registro_consultor_id,produto_biologico_sugerido_id,microrganismo_id,encaminhar_para_os,recomendacao_tecnica,estrategia_manejo) VALUES($1,$2,$3,$4,$5,\'biologico\')',[v,p,m,flag,text]);
const convert=async(v)=>(await scalar('SELECT rpc_converter_visita_em_os($1,NULL) v',[v])).v;
const counts=async(v)=>(await scalar('SELECT (SELECT count(*)::int FROM ordens_servico_onfarm WHERE registro_consultor_id=$1) os,(SELECT count(*)::int FROM visitas_logs WHERE registro_consultor_id=$1) logs',[v]));
await check('enum before errors 42883 and 42804 reproduced',async()=>{await assert.rejects(q('SELECT btrim(estrategia_manejo) FROM registros_consultor_recomendacoes LIMIT 0'),e=>e.code==='42883');await assert.rejects(q('SELECT coalesce(recomendacao_tecnica,observacoes_finais,estrategia_manejo) FROM registros_consultor_recomendacoes LIMIT 0'),e=>e.code==='42804');});
await check('casts compile with real enum',async()=>{await q('SELECT btrim(estrategia_manejo::text),coalesce(recomendacao_tecnica,observacoes_finais,estrategia_manejo::text) FROM registros_consultor_recomendacoes LIMIT 0');});
for(const [name,p,m,flag,code] of [['chemical',chem,null,true,'LAB_VISIT_SELECTION_CONFLICT'],['fert',fert,null,true,'LAB_VISIT_SELECTION_CONFLICT'],['NULL family',nul,null,true,'LAB_VISIT_SELECTION_CONFLICT'],['dual bio',bio,micro,true,'LAB_VISIT_SELECTION_CONFLICT'],['dual chemical',chem,micro,true,'LAB_VISIT_SELECTION_CONFLICT'],['no refs',null,null,true,'LAB_VISIT_SELECTION_CONFLICT'],['no flag',bio,null,false,'LAB_VISIT_NO_SELECTION'],['NULL flag',bio,null,null,'LAB_VISIT_NO_SELECTION']]){
 await check(`${name} denied with no writes`,async()=>{const v=await visit();await rec(v,p,m,flag);assert.equal((await convert(v)).code,code);assert.deepEqual(await counts(v),{os:0,logs:0});assert.equal((await scalar('SELECT status FROM registros_consultor WHERE id=$1',[v])).status,'aprovado');});
}
await check('no recommendations denied',async()=>assert.equal((await convert(await visit())).code,'LAB_VISIT_NO_SELECTION'));
await check('multiple eligible cannot choose last',async()=>{const v=await visit();await rec(v,bio,null);await rec(v,null,micro);assert.equal((await convert(v)).code,'LAB_VISIT_MULTIPLE_SELECTIONS');assert.deepEqual(await counts(v),{os:0,logs:0});});
await check('bio plus flagged chemical conflict requires review',async()=>{const v=await visit();await rec(v,bio,null);await rec(v,chem,null);assert.equal((await convert(v)).code,'LAB_VISIT_MULTIPLE_SELECTIONS');});
for(const [name,p,m] of [['bio',bio,null],['micro',null,micro]]){
 await check(`${name} exact refs snapshot programming replay`,async()=>{const v=await visit();const r=await rec(v,p,m);const a=await convert(v);assert.equal(a.success,true);const os=await scalar('SELECT produto_id,microrganismo_id FROM ordens_servico_onfarm WHERE id=$1',[a.os_id]);assert.deepEqual(os,{produto_id:p,microrganismo_id:m});const prog=await scalar('SELECT produto_id,microrganismo_id FROM programacao_producao WHERE ordem_servico_onfarm_id=$1',[a.os_id]);assert.deepEqual(prog,os);const log=await scalar('SELECT metadata FROM visitas_logs WHERE registro_consultor_id=$1',[v]);assert.equal(log.metadata.recomendacao_id,r);assert.equal(log.metadata.selection_snapshot.encaminhar_para_os,true);const b=await convert(v);assert.equal(b.already_exists,true);assert.equal(a.os_id,b.os_id);assert.deepEqual(await counts(v),{os:1,logs:1});});
}
await check('mixed preserves all lines and never concludes request',async()=>{const v=await visit();const r=await rec(v,bio,null);await rec(v,chem,null,false);await rec(v,fert,null,false);const before=await q('SELECT * FROM registros_consultor_recomendacoes WHERE registro_consultor_id=$1 ORDER BY id',[v]);const a=await convert(v);assert.equal(a.recomendacao_id,r);assert.equal(a.remaining_recommendations,2);assert.equal(a.commercial_completed,false);assert.deepEqual(await q('SELECT * FROM registros_consultor_recomendacoes WHERE registro_consultor_id=$1 ORDER BY id',[v]),before);assert.equal((await scalar('SELECT s.status FROM portal_solicitacoes s JOIN registros_consultor v ON v.solicitacao_id=s.id WHERE v.id=$1',[v])).status,'aguardando_os');});
await check('FSF existing and missing identical including replay',async()=>{const v=await visit();await rec(v,bio,null);await convert(v);await q("SELECT set_config('test.org',$1,false)",[FSF]);assert.deepEqual(await convert(v),await convert(missing));await q("SELECT set_config('test.org',$1,false)",[AR]);});
await check('empty explicit recommendation denied',async()=>{const v=await visit();const r=await rec(v,bio,null,true,'');await q('UPDATE registros_consultor_recomendacoes SET estrategia_manejo=NULL WHERE id=$1',[r]);assert.equal((await convert(v)).code,'LAB_VISIT_EMPTY_RECOMMENDATION');});
await check('enum-only recommendation uses cast fallback',async()=>{const v=await visit();await rec(v,bio,null,true,null);const a=await convert(v);assert.equal(a.success,true);assert.equal((await scalar('SELECT recomendacao_tecnica FROM ordens_servico_onfarm WHERE id=$1',[a.os_id])).recomendacao_tecnica,'biologico');});
await check('concurrent queue returns same singular OS',async()=>{const v=await visit();await rec(v,bio,null);const [a,b]=await Promise.all([convert(v),convert(v)]);assert.equal(a.os_id,b.os_id);assert.equal([a,b].filter(r=>r.already_exists===false).length,1);assert.deepEqual(await counts(v),{os:1,logs:1});});
await check('concurrent queued edit after conversion rejected by parent fence',async()=>{const v=await visit();const r=await rec(v,bio,null);const [a,b]=await Promise.allSettled([convert(v),q('UPDATE registros_consultor_recomendacoes SET encaminhar_para_os=false WHERE id=$1',[r])]);assert.equal(a.status,'fulfilled');assert.equal(b.status,'rejected');assert.equal(b.reason.code,'23514');});
await check('write failure rolls back OS programming status and logs',async()=>{await db.exec(`CREATE FUNCTION test_fail_log() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture failure'; END$$; CREATE TRIGGER test_fail_log BEFORE INSERT ON visitas_logs FOR EACH ROW EXECUTE FUNCTION test_fail_log();`);const v=await visit();await rec(v,bio,null);assert.equal((await convert(v)).code,'LAB_VISIT_CONVERSION_FAILED');assert.deepEqual(await counts(v),{os:0,logs:0});assert.equal((await scalar('SELECT status FROM registros_consultor WHERE id=$1',[v])).status,'aprovado');assert.equal((await scalar('SELECT count(*)::int n FROM programacao_producao p JOIN ordens_servico_onfarm o ON o.id=p.ordem_servico_onfarm_id WHERE o.registro_consultor_id=$1',[v])).n,0);await db.exec('DROP TRIGGER test_fail_log ON visitas_logs');});
await check('unrelated unique conflict not fake replay success',async()=>{await db.exec(`CREATE UNIQUE INDEX test_single_log ON visitas_logs(acao);` ).catch(()=>{}); // use isolated explicit trigger to raise same SQLSTATE
 await db.exec(`CREATE FUNCTION test_unique() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'unrelated constraint' USING ERRCODE='23505'; END$$;CREATE TRIGGER test_unique BEFORE INSERT ON visitas_logs FOR EACH ROW EXECUTE FUNCTION test_unique();`);const v=await visit();await rec(v,bio,null);assert.equal((await convert(v)).success,false);assert.deepEqual(await counts(v),{os:0,logs:0});await db.exec('DROP TRIGGER test_unique ON visitas_logs');});
console.log(JSON.stringify({passes,failed:0,visitPreflight:'FULL: real before hashes/index/enum, schema fixture',basePreflight:'EXCLUDED',hosted:'UNVERIFIED',concurrency:'PGlite serialized queue only, NOT independent sessions',stubs:'Auth/RBAC/tenant/schema/other base helpers'}));
await db.close();
