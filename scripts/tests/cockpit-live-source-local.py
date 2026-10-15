"""Disposable PostgreSQL: effective candidate bodies, reduced source/schema, simulated Auth.
No production connection; no hosted claims, grants, RLS or full preflight proof.
"""
from pathlib import Path
import os,re,subprocess,tempfile,shutil
ROOT=Path(__file__).resolve().parents[2]
SETUP=r'''
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA private; CREATE SCHEMA platform_private; CREATE SCHEMA auth;
CREATE TYPE public.app_role AS ENUM('administrador','gestor','administrativo','producao','financeiro','consultor_tecnico','operador_onfarm','superadmin');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('t.uid',true),'')::uuid$$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('t.org',true),'')::uuid$$;
CREATE FUNCTION public.technical_actor_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1 IS NOT NULL AND nullif(current_setting('t.ready',true),'')::boolean$$;
CREATE FUNCTION public._saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $2='ordens_producao' AND nullif(current_setting('t.feature',true),'')::boolean$$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1=auth.uid() AND $2::text=current_setting('t.role',true)$$;
CREATE FUNCTION public.fn_cockpit_stage(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT $1$$;
CREATE TABLE public.clientes(id uuid PRIMARY KEY, organization_id uuid,nome text);
CREATE TABLE public.fazendas(id uuid PRIMARY KEY, organization_id uuid,cliente_id uuid,ativo boolean,nome text);
CREATE TABLE public.talhoes(id uuid PRIMARY KEY, organization_id uuid,fazenda_id uuid,ativo boolean,nome text);
CREATE TABLE public.produtos(id uuid PRIMARY KEY,nome text,owner_organization_id uuid);
CREATE TABLE public.microrganismos(id uuid PRIMARY KEY,nome text,owner_organization_id uuid);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid,nome text,ativo boolean);
CREATE TABLE public.registros_consultor(id uuid PRIMARY KEY,cliente_id uuid,fazenda_id uuid,talhao_id uuid);
CREATE TABLE public.ordens_servico(id uuid PRIMARY KEY,cliente_id uuid,fazenda_id uuid,talhao_id uuid,produto_id uuid,microrganismo_id uuid,partner_order_id uuid,partner_order_item_id uuid,organization_id uuid);
CREATE TABLE public.ordens_servico_onfarm(id uuid PRIMARY KEY,cliente_id uuid,fazenda_id uuid,talhao_id uuid,produto_id uuid,microrganismo_id uuid,registro_consultor_id uuid);
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY,partner_id uuid,cliente_id uuid,numero text);
CREATE TABLE public.partner_order_items(id uuid PRIMARY KEY,order_id uuid,product_id uuid,microrganismo_id uuid);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY,client_id uuid,commercial_owner_organization_id uuid,ativo boolean,deleted_at timestamptz);
CREATE TABLE public.programacao_producao(id uuid PRIMARY KEY,organization_id uuid,ordem_servico_id uuid,ordem_servico_onfarm_id uuid,produto_id uuid,microrganismo_id uuid,responsavel_id uuid,responsavel text);
CREATE TABLE public.lotes(id uuid PRIMARY KEY,programacao_id uuid,organization_id uuid,produto_id uuid,microrganismo_id uuid);
CREATE TABLE public.controle_qualidade(id uuid PRIMARY KEY,lote_id uuid,organization_id uuid,responsavel_id uuid);
CREATE TABLE public.envase(id uuid PRIMARY KEY,lote_id uuid,organization_id uuid);
CREATE TABLE public.estoque_produto(id uuid PRIMARY KEY,lote_id uuid,produto_id uuid,microrganismo_id uuid,envase_id uuid,reservado_para_os_id uuid,reservado_para_os_tipo text,reservado_para_cliente_id uuid,reservado_para_partner_order_id uuid,reservado_para_partner_id uuid);
CREATE TABLE public.entregas(id uuid PRIMARY KEY,organization_id uuid,cliente_id uuid,ordem_servico_id uuid,ordem_servico_onfarm_id uuid,produto_id uuid,partner_order_id uuid,lote_id uuid,estoque_produto_id uuid);
CREATE TABLE public.aplicacoes(id uuid PRIMARY KEY,organization_id uuid,ordem_servico_id uuid,ordem_servico_onfarm_id uuid,produto_usado_id uuid,lote_usado_id uuid,responsavel_id uuid,parent_id uuid);
CREATE TABLE public.mv_esteira_laboratorio(os_id uuid,origem_os text,numero_os text,cliente_id uuid,cliente_nome text,fazenda_id uuid,fazenda_nome text,talhao_id uuid,talhao_nome text,produto_id uuid,produto_nome text,microrganismo_id uuid,microrganismo_nome text,partner_id uuid,partner_numero text,partner_nome text,titular_nome text,titular_tipo text,prioridade text,volume_solicitado_l float8,status_os text,status_esteira_oficial text,programacao_id uuid,data_programada date,lote_id uuid,codigo_lote text,status_lote text,cq_resultado text,envase_id uuid,estoque_id uuid,estoque_reservado_id uuid,entrega_id uuid,entrega_status text,atrasado boolean,bloqueios text[],pode_finalizar boolean,proxima_acao text,created_at timestamptz);
-- Reduced live source: names/client/children change dynamically; source is NOT a hosted view clone.
CREATE VIEW public._src_vw_esteira_laboratorio AS
WITH os AS (SELECT id,'manual'::text origin,cliente_id,fazenda_id,talhao_id,produto_id,microrganismo_id FROM public.ordens_servico UNION ALL SELECT id,'onfarm',cliente_id,fazenda_id,talhao_id,produto_id,microrganismo_id FROM public.ordens_servico_onfarm)
SELECT (jsonb_populate_record(NULL::public.mv_esteira_laboratorio,jsonb_build_object(
'os_id',o.id,'origem_os',o.origin,'numero_os',o.id::text,'cliente_id',o.cliente_id,'cliente_nome',c.nome,
'fazenda_id',o.fazenda_id,'talhao_id',o.talhao_id,'produto_id',o.produto_id,'microrganismo_id',o.microrganismo_id,
'produto_nome',p.nome,'microrganismo_nome',m.nome,'programacao_id',pp.id,'status_os','aberta','status_esteira_oficial','programada','atrasado',false,'created_at','2026-10-15T18:18:00Z'))).*
FROM os o LEFT JOIN public.clientes c ON c.id=o.cliente_id LEFT JOIN public.produtos p ON p.id=o.produto_id
LEFT JOIN public.microrganismos m ON m.id=o.microrganismo_id LEFT JOIN public.programacao_producao pp ON pp.ordem_servico_id=o.id OR pp.ordem_servico_onfarm_id=o.id;
CREATE FUNCTION private.h7n_esteira_laboratorio() RETURNS SETOF public.mv_esteira_laboratorio LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$ SELECT * FROM public.mv_esteira_laboratorio $$;
CREATE VIEW public.vw_esteira_laboratorio WITH(security_invoker=true) AS SELECT * FROM private.h7n_esteira_laboratorio();
REVOKE ALL ON FUNCTION private.h7n_esteira_laboratorio() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.vw_esteira_laboratorio,public.mv_esteira_laboratorio FROM PUBLIC,anon,authenticated;
CREATE TEMP TABLE saved_acl AS SELECT proacl,proowner FROM pg_proc WHERE oid='private.h7n_esteira_laboratorio()'::regprocedure;
'''
# Stable synthetic identifiers; no real users/records.
def uid(i): return f'00000000-0000-0000-0000-{i:012d}'
def q(i): return "'"+uid(i)+"'"

def main():
    candidate=(ROOT/'scripts/rbac-audit/proposed-cockpit-live-source-closed.sql').read_text()
    bodies='\n'.join(re.findall(r'CREATE OR REPLACE FUNCTION .*?\$function\$;',candidate,re.S))
    sql=SETUP+bodies+'''REVOKE ALL ON FUNCTION public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer) FROM PUBLIC,anon,authenticated;\n'''
    A,B=q(1),q(2); CA,CB=q(11),q(12); OA,OB=q(31),q(32); P=q(21); U=q(41); PP=q(51); L=q(61)
    sql+=f'''INSERT INTO clientes VALUES({CA},{A},'AR'),({CB},{B},'FSF');
INSERT INTO produtos VALUES({P},'Biologico',NULL);
INSERT INTO profiles VALUES({U},{A},'AR Responsavel',true);
INSERT INTO ordens_servico(id,cliente_id,produto_id,organization_id) VALUES({OA},{CA},{P},{A}),({OB},{CB},{P},{B});
INSERT INTO programacao_producao(id,organization_id,ordem_servico_id,produto_id,responsavel_id) VALUES({PP},{A},{OA},{P},{U});
INSERT INTO lotes VALUES({L},{PP},{A},{P},NULL);
INSERT INTO mv_esteira_laboratorio SELECT * FROM _src_vw_esteira_laboratorio;
SELECT set_config('t.uid',{U},false),set_config('t.org',{A},false),set_config('t.ready','true',false),set_config('t.feature','true',false),set_config('t.role','administrador',false);
'''
    labels=[]
    def check(label,expr,change='',undo=''):
        nonlocal sql
        labels.append(label)
        sql+=change+f"\nDO $t$ BEGIN IF NOT (({expr}) IS TRUE) THEN RAISE EXCEPTION 'FAIL {label}'; END IF; RAISE NOTICE 'PASS {label}'; END $t$;\n"+undo+'\n'
    count="(SELECT count(*) FROM private.h7n_esteira_laboratorio())"
    check('AR own one',count+'=1')
    check('FSF positive and no AR',count+f"=1 AND NOT EXISTS(SELECT 1 FROM private.h7n_esteira_laboratorio() WHERE os_id={OA})",f"SELECT set_config('t.org',{B},false);",f"SELECT set_config('t.org',{A},false);")
    for role in ['financeiro','consultor_tecnico','operador_onfarm','superadmin']:
        check('role '+role+' not widened',count+'=0',f"SELECT set_config('t.role','{role}',false);","SELECT set_config('t.role','administrador',false);")
    for key,val in [('ready','false'),('ready',''),('feature','false'),('feature',''),('uid',''),('org','')]:
        old=uid(41) if key=='uid' else uid(1) if key=='org' else 'true'
        check(key+' '+(val or 'NULL')+' denied',count+'=0',f"SELECT set_config('t.{key}','{val}',false);",f"SELECT set_config('t.{key}','{old}',false);")
    # Simulated canonical readiness after membership revocation.
    check('revoked membership denied',count+'=0',"SELECT set_config('t.ready','false',false);","SELECT set_config('t.ready','true',false);")
    mutations=[('client NULL',f'UPDATE clientes SET organization_id=NULL WHERE id={CA}',f'UPDATE clientes SET organization_id={A} WHERE id={CA}'),
    ('tenant changed after snapshot',f'UPDATE clientes SET organization_id={B} WHERE id={CA}',f'UPDATE clientes SET organization_id={A} WHERE id={CA}'),
    ('OS tenant cross',f'UPDATE ordens_servico SET organization_id={B} WHERE id={OA}',f'UPDATE ordens_servico SET organization_id={A} WHERE id={OA}'),
    ('OS orphan',f'UPDATE ordens_servico SET cliente_id={q(99)} WHERE id={OA}',f'UPDATE ordens_servico SET cliente_id={CA} WHERE id={OA}'),
    ('OS no item',f'UPDATE ordens_servico SET produto_id=NULL WHERE id={OA}',f'UPDATE ordens_servico SET produto_id={P} WHERE id={OA}'),
    ('OS dual item',f'UPDATE ordens_servico SET microrganismo_id={q(22)} WHERE id={OA}',f'UPDATE ordens_servico SET microrganismo_id=NULL WHERE id={OA}'),
    ('private item OFF',f'UPDATE produtos SET owner_organization_id={A} WHERE id={P}',f'UPDATE produtos SET owner_organization_id=NULL WHERE id={P}'),
    ('programming cross',f'UPDATE programacao_producao SET organization_id={B} WHERE id={PP}',f'UPDATE programacao_producao SET organization_id={A} WHERE id={PP}'),
    ('programming NULL',f'UPDATE programacao_producao SET organization_id=NULL WHERE id={PP}',f'UPDATE programacao_producao SET organization_id={A} WHERE id={PP}'),
    ('programming XOR',f'UPDATE programacao_producao SET ordem_servico_onfarm_id={OA} WHERE id={PP}',f'UPDATE programacao_producao SET ordem_servico_onfarm_id=NULL WHERE id={PP}'),
    ('responsible cross',f'UPDATE profiles SET organization_id={B} WHERE user_id={U}',f'UPDATE profiles SET organization_id={A} WHERE user_id={U}'),
    ('responsible inactive',f'UPDATE profiles SET ativo=false WHERE user_id={U}',f'UPDATE profiles SET ativo=true WHERE user_id={U}'),
    ('lot cross',f'UPDATE lotes SET organization_id={B} WHERE id={L}',f'UPDATE lotes SET organization_id={A} WHERE id={L}'),
    ('lot NULL',f'UPDATE lotes SET organization_id=NULL WHERE id={L}',f'UPDATE lotes SET organization_id={A} WHERE id={L}')]
    for label,change,undo in mutations: check(label,count+'=0',change+';',undo+';')
    for table,cols,vals in [('controle_qualidade','id,lote_id,organization_id',[q(71),L,B]),('envase','id,lote_id,organization_id',[q(72),L,B]),('estoque_produto','id,lote_id,produto_id',[q(73),L,q(99)]),('entregas','id,organization_id,cliente_id,ordem_servico_id',[q(74),B,CA,OA]),('aplicacoes','id,organization_id,ordem_servico_id',[q(75),B,OA])]:
        check(table+' crossed child',count+'=0',f"INSERT INTO {table}({cols}) VALUES({','.join(vals)});",f'DELETE FROM {table};')
    check('older crossed child not masked',count+'=0',f"INSERT INTO programacao_producao(id,organization_id,ordem_servico_id,produto_id) VALUES({q(52)},{B},{OA},{P});",f'DELETE FROM programacao_producao WHERE id={q(52)};')
    check('farm cross',count+'=0',f"INSERT INTO fazendas VALUES({q(81)},{B},{CB},true,'FSF farm'); UPDATE ordens_servico SET fazenda_id={q(81)} WHERE id={OA};",f'UPDATE ordens_servico SET fazenda_id=NULL WHERE id={OA};')
    check('field orphan',count+'=0',f'UPDATE ordens_servico SET talhao_id={q(82)} WHERE id={OA};',f'UPDATE ordens_servico SET talhao_id=NULL WHERE id={OA};')
    check('partner orphan',count+'=0',f'UPDATE ordens_servico SET partner_order_id={q(83)} WHERE id={OA};',f'UPDATE ordens_servico SET partner_order_id=NULL WHERE id={OA};')
    check('live name not snapshot',"(SELECT cliente_nome FROM private.h7n_esteira_laboratorio())='AR Atual' AND (SELECT cliente_nome FROM mv_esteira_laboratorio WHERE os_id="+OA+")='AR'",f"UPDATE clientes SET nome='AR Atual' WHERE id={CA};")
    check('pagination scoped total',"(public.rpc_cockpit_listar_esteira_v1(p_limit=>1,p_offset=>1)->>'total_count')::int=1 AND jsonb_array_length(public.rpc_cockpit_listar_esteira_v1(p_limit=>1,p_offset=>1)->'items')=0")
    check('pagination clamp',"(public.rpc_cockpit_listar_esteira_v1(p_limit=>999,p_offset=>-1)->>'limit')::int=200 AND (public.rpc_cockpit_listar_esteira_v1(p_limit=>999,p_offset=>-1)->>'offset')::int=0")
    check('search SQL text no injection',"(public.rpc_cockpit_listar_esteira_v1(p_busca=>''' OR 1=1 --')->>'total_count')::int=0")
    check('onfarm micro',count+f'=2 AND EXISTS(SELECT 1 FROM private.h7n_esteira_laboratorio() WHERE microrganismo_id={q(22)})',f"INSERT INTO microrganismos VALUES({q(22)},'Micro',NULL); INSERT INTO ordens_servico_onfarm(id,cliente_id,microrganismo_id) VALUES({q(33)},{CA},{q(22)});")
    check('duplicate OS origin denied',count+'=1',f'INSERT INTO ordens_servico_onfarm(id,cliente_id,microrganismo_id) VALUES({OA},{CA},{q(22)});',f'DELETE FROM ordens_servico_onfarm WHERE id={OA};')
    check('onfarm visit cross',count+'=1',f'INSERT INTO registros_consultor VALUES({q(84)},{CB},NULL,NULL); UPDATE ordens_servico_onfarm SET registro_consultor_id={q(84)} WHERE id={q(33)};',f'UPDATE ordens_servico_onfarm SET registro_consultor_id=NULL WHERE id={q(33)};')
    check('helper ACL owner unchanged',"NOT EXISTS(SELECT 1 FROM saved_acl b JOIN pg_proc p ON p.oid='private.h7n_esteira_laboratorio()'::regprocedure WHERE b.proacl IS DISTINCT FROM p.proacl OR b.proowner IS DISTINCT FROM p.proowner)")
    for role in ['authenticated','anon']:
        check(role+' helper ACL closed',f"NOT has_function_privilege('{role}','private.h7n_esteira_laboratorio()','EXECUTE')")
        check(role+' RPC ACL closed',f"NOT has_function_privilege('{role}','public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)','EXECUTE')")
        check(role+' view ACL closed',f"NOT has_table_privilege('{role}','public.vw_esteira_laboratorio','SELECT')")
    tmp=Path(tempfile.mkdtemp(prefix='cockpit-live-',dir='/tmp'));tmp.chmod(0o777)
    pre=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
    started=False
    try:
        subprocess.run(pre+['initdb','-D',str(tmp/'d'),'-A','trust','-U','postgres'],check=True,capture_output=True)
        subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55492','start','-w'],check=True,capture_output=True);started=True
        f=tmp/'test.sql';f.write_text(sql);f.chmod(0o644)
        r=subprocess.run(['psql','-h',str(tmp),'-p','55492','-U','postgres','-v','ON_ERROR_STOP=1','-f',str(f)],capture_output=True,text=True)
        if r.returncode: raise SystemExit(r.stderr[-5000:])
        print(r.stderr); print('Assertions:',len(labels),'Auth/source/schema SIMULATED. Full hosted preflight NOT executed.')
    finally:
        if started: subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'stop','-m','immediate'],capture_output=True)
        shutil.rmtree(tmp,ignore_errors=True)
if __name__=='__main__': main()
