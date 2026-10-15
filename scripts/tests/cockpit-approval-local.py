"""Exact candidate + hash-matched triggers in disposable PostgreSQL. Simulated Auth/schema."""
from pathlib import Path
import importlib.util
import json
import re
import os
import subprocess
import tempfile
import shutil
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('cockpit-live-source-local.py'))
f=importlib.util.module_from_spec(spec); spec.loader.exec_module(f)

def main():
    source=Path(__file__).with_name('cockpit-programar-local.py').read_text()
    extra=re.search("sql = fixture.SETUP \\+ r'''(.*?)'''",source,re.S).group(1)
    extra=extra[:extra.index('-- Actual onfarm downstream')]
    baseline=json.loads((ROOT/'scripts/rbac-audit/cockpit-approval-baseline-20261015.json').read_text())
    sql=f.SETUP+extra+'''ALTER TABLE controle_qualidade ADD COLUMN resultado text;
ALTER TABLE lotes ADD COLUMN created_at timestamptz DEFAULT now();
CREATE TYPE public.status_os AS ENUM('aberta','aprovada','programada','em_producao','em_cq','envase','aguardando_reserva','pronto_entrega','entregue','finalizada');
CREATE TYPE public.status_os_onfarm AS ENUM('aberta','aprovada','programada','em_producao','em_cq','envase','aguardando_reserva','pronto_entrega','entregue','finalizada','cancelada');
ALTER TABLE ordens_servico ALTER COLUMN status DROP DEFAULT;
ALTER TABLE ordens_servico ALTER COLUMN status TYPE status_os USING status::status_os;
ALTER TABLE ordens_servico ALTER COLUMN status SET DEFAULT 'aberta';
ALTER TABLE ordens_servico_onfarm ALTER COLUMN status DROP DEFAULT;
ALTER TABLE ordens_servico_onfarm ALTER COLUMN status TYPE status_os_onfarm USING status::status_os_onfarm;
ALTER TABLE ordens_servico_onfarm ALTER COLUMN status SET DEFAULT 'aberta';
'''
    for item in baseline['functions']:
        sql+=item['definition']+';\n'
        import hashlib
        assert hashlib.md5(item['definition'].encode()).hexdigest()==item['md5']
    for table in ['ordens_servico','ordens_servico_onfarm']:
        sql+=f'CREATE TRIGGER trg_check_os_status_transition BEFORE UPDATE OF status ON {table} FOR EACH ROW EXECUTE FUNCTION check_os_status_transition();\n'
    sql+='CREATE TRIGGER trg_sync_os_classica_downstream AFTER UPDATE ON ordens_servico FOR EACH ROW EXECUTE FUNCTION fn_sync_os_classica_downstream();\nCREATE TRIGGER trg_sync_os_onfarm_downstream AFTER UPDATE OF status ON ordens_servico_onfarm FOR EACH ROW EXECUTE FUNCTION sync_os_onfarm_downstream();\n'
    live=(ROOT/'scripts/rbac-audit/applied-20261015183119_h_cockpit_live_source_tenant_chain_closed.sql').read_text()
    sql+=re.search(r'CREATE OR REPLACE FUNCTION private\.h7n_esteira_laboratorio\(\).*?\$function\$;',live,re.S).group()
    candidate=(ROOT/'scripts/rbac-audit/proposed-cockpit-os-approval-closed.sql').read_text()
    sql+=candidate[candidate.index('CREATE OR REPLACE FUNCTION private.assert_os_approval_scope'):candidate.index('DO $post$')]
    program=(ROOT/'scripts/rbac-audit/proposed-cockpit-programar-os-closed.sql').read_text()
    sql+=re.search(r'CREATE OR REPLACE FUNCTION public\.rpc_programar_os_v1.*?\$function\$;',program,re.S).group()
    A,B,U,C,P,O,F,PP,PF=[f.q(i) for i in [1,2,41,11,21,31,33,51,53]]
    sql+=f'''INSERT INTO organizations VALUES({A},true),({B},true);
INSERT INTO profiles(user_id,id,organization_id,ativo) VALUES({U},{U},{A},true);
INSERT INTO clientes VALUES({C},{A},'Synthetic');
INSERT INTO produtos(id,nome,familia_catalogo) VALUES({P},'Bio','biologico');
INSERT INTO ordens_servico(id,cliente_id,produto_id,organization_id) VALUES({O},{C},{P},{A});
INSERT INTO ordens_servico_onfarm(id,cliente_id,produto_id) VALUES({F},{C},{P});
INSERT INTO programacao_producao(id,organization_id,ordem_servico_id,produto_id) VALUES({PP},{A},{O},{P});
INSERT INTO programacao_producao(id,organization_id,ordem_servico_onfarm_id,produto_id) VALUES({PF},{A},{F},{P});
SELECT set_config('t.uid',{U},false),set_config('t.org',{A},false),set_config('t.role','administrador',false),set_config('t.ready','true',false),set_config('t.feature','true',false);
'''
    labels=[]
    def check(label,expr,action=''):
        nonlocal sql
        labels.append(label); sql+=action+f"\nDO $t$ BEGIN IF NOT (({expr}) IS TRUE) THEN RAISE EXCEPTION 'FAIL {label}'; END IF; RAISE NOTICE 'PASS {label}'; END $t$;\n"
    call=f"public.rpc_aprovar_os_v1({O},'manual')"
    def deny(label,statement,change='',undo=''):
        nonlocal sql
        labels.append(label)
        sql+=change+f"\nDO $t$ BEGIN BEGIN {statement}; RAISE EXCEPTION 'FAIL {label}'; EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'OS_APPROVAL_SCOPE_DENIED' THEN RAISE; END IF; RAISE NOTICE 'PASS {label}'; END; END $t$;\n"+undo
    for role in ['producao','administrativo','consultor_tecnico','financeiro','superadmin']:
        change=f"SELECT set_config('t.role','{role}',false);"; undo="SELECT set_config('t.role','administrador',false);"
        deny(role+' RPC','PERFORM '+call,change,undo)
        deny(role+' direct',f"UPDATE ordens_servico SET status='aprovada' WHERE id={O}",change,undo)
    for key in ['ready','feature']:
        for val in ['false','']:
            deny(key+val,'PERFORM '+call,f"SELECT set_config('t.{key}','{val}',false);",f"SELECT set_config('t.{key}','true',false);")
            deny(key+val+' direct',f"UPDATE ordens_servico SET status='aprovada' WHERE id={O}",f"SELECT set_config('t.{key}','{val}',false);",f"SELECT set_config('t.{key}','true',false);")
    deny('foreign','PERFORM '+call,f"SELECT set_config('t.org',{B},false);",f"SELECT set_config('t.org',{A},false);")
    deny('missing',f"PERFORM public.rpc_aprovar_os_v1({f.q(99)},'manual')")
    deny('logout','PERFORM '+call,"SELECT set_config('t.uid','',false);",f"SELECT set_config('t.uid',{U},false);")
    deny('mutate refs and approve',f"UPDATE ordens_servico SET status='aprovada',cliente_id={f.q(99)} WHERE id={O}")
    deny('foreign child','PERFORM '+call,f"UPDATE programacao_producao SET organization_id={B} WHERE id={PP};",f"UPDATE programacao_producao SET organization_id={A} WHERE id={PP};")
    for family in ['quimico','fertilizante']:
        deny(family,'PERFORM '+call,f"UPDATE produtos SET familia_catalogo='{family}' WHERE id={P};",f"UPDATE produtos SET familia_catalogo='biologico' WHERE id={P};")
    deny('family NULL','PERFORM '+call,f"UPDATE produtos SET familia_catalogo=NULL WHERE id={P};",f"UPDATE produtos SET familia_catalogo='biologico' WHERE id={P};")
    deny('ambiguous UUID','PERFORM '+call,f"INSERT INTO ordens_servico_onfarm(id,cliente_id,produto_id) VALUES({O},{C},{P});",f"DELETE FROM ordens_servico_onfarm WHERE id={O};")
    deny('missing program','PERFORM '+call,f"DELETE FROM programacao_producao WHERE id={PP};",f"INSERT INTO programacao_producao(id,organization_id,ordem_servico_id,produto_id) VALUES({PP},{A},{O},{P});")
    deny('B2B stored denied','PERFORM '+call,f"UPDATE ordens_servico SET origem='b2b' WHERE id={O};",f"UPDATE ordens_servico SET origem='agronomica' WHERE id={O};")
    check('open program denied',"(SELECT status FROM ordens_servico WHERE id="+O+")='aberta'",f"DO $x$ BEGIN IF (public.rpc_programar_os_v1({O},'manual','2026-10-20')->>'success')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'autoapproved'; END IF; END $x$;")
    check('admin approves',f"(SELECT status FROM ordens_servico WHERE id={O})='aprovada'",f'SELECT {call};')
    check('audit once',"(SELECT count(*) FROM laboratorio_esteira_eventos WHERE acao='aprovar_os')=1")
    check('replay no effects',"(SELECT count(*) FROM laboratorio_esteira_eventos WHERE acao='aprovar_os')=1",f'SELECT {call};')
    check('direct replay no effects',"(SELECT count(*) FROM laboratorio_esteira_eventos WHERE acao='aprovar_os')=1",f"UPDATE ordens_servico SET status='aprovada' WHERE id={O};")
    check('gestor onfarm approved',f"(SELECT status FROM ordens_servico_onfarm WHERE id={F})='aprovada'",f"SELECT set_config('t.role','gestor',false); SELECT public.rpc_aprovar_os_v1({F},'onfarm');")
    check('no date volume lot invented',"NOT EXISTS(SELECT 1 FROM lotes) AND NOT EXISTS(SELECT 1 FROM programacao_producao WHERE data_programada IS NOT NULL OR volume_necessario IS NOT NULL) AND (SELECT count(*) FROM programacao_producao)=2")
    check('audit actor before after',f"EXISTS(SELECT 1 FROM laboratorio_esteira_eventos WHERE acao='aprovar_os' AND usuario_id={U} AND observacao::jsonb->'before'->>'status'='aberta' AND observacao::jsonb->'after'->>'status'='aprovada' AND observacao::jsonb->>'manufacturing_started'='false')")
    check('production programs approved only',f"(SELECT status FROM ordens_servico WHERE id={O})='programada'",f"SELECT set_config('t.role','producao',false); SELECT public.rpc_programar_os_v1({O},'manual','2026-10-20');")
    check('closed RPC auth anon',"NOT has_function_privilege('authenticated','public.rpc_aprovar_os_v1(uuid,text)','EXECUTE') AND NOT has_function_privilege('anon','public.rpc_aprovar_os_v1(uuid,text)','EXECUTE') AND NOT has_function_privilege('authenticated','public.rpc_programar_os_v1(uuid,text,date)','EXECUTE')")
    sql+=f"SELECT set_config('t.role','administrador',false); INSERT INTO ordens_servico(id,cliente_id,produto_id,organization_id) VALUES({f.q(35)},{C},{P},{A}); INSERT INTO programacao_producao(id,organization_id,ordem_servico_id,produto_id) VALUES({f.q(55)},{A},{f.q(35)},{P});"
    check('admin direct approval',f"(SELECT status FROM ordens_servico WHERE id={f.q(35)})='aprovada'",f"UPDATE ordens_servico SET status='aprovada' WHERE id={f.q(35)};")
    check('direct audited once',"(SELECT count(*) FROM laboratorio_esteira_eventos WHERE acao='aprovar_os')=3")
    # Every enum state is concrete: keep the fixture aligned with canonical enums.
    # Rejected INSERTs must leave neither OS nor approval/audit effects, even as postgres.
    states=['aprovada','programada','em_producao','em_cq','envase','aguardando_reserva','pronto_entrega','entregue','finalizada']
    for table,advanced in [('ordens_servico',states),('ordens_servico_onfarm',states+['cancelada'])]:
        columns='id,cliente_id,produto_id,status'
        for status in advanced+[None]:
            label=f'INSERT {table} {status or "NULL"}'
            value='NULL' if status is None else "'"+status+"'"
            deny(label,f"INSERT INTO {table}({columns}) VALUES({f.q(36)},{C},{P},{value})")
            check(label+' no row/event',f"NOT EXISTS(SELECT 1 FROM {table} WHERE id={f.q(36)}) AND NOT EXISTS(SELECT 1 FROM laboratorio_esteira_eventos WHERE os_id={f.q(36)}) AND NOT EXISTS(SELECT 1 FROM programacao_producao WHERE ordem_servico_id={f.q(36)} OR ordem_servico_onfarm_id={f.q(36)})")
        # Unknown is rejected by the real enum input cast before row triggers run.
        labels.append(f'INSERT {table} unknown enum')
        sql+=f"""DO $t$ BEGIN BEGIN
INSERT INTO {table}({columns}) VALUES({f.q(36)},{C},{P},'unknown');
RAISE EXCEPTION 'FAIL unknown enum {table}';
EXCEPTION WHEN invalid_text_representation THEN RAISE NOTICE 'PASS unknown enum {table}'; END; END $t$;"""
        check(f'INSERT {table} unknown no row/event',f"NOT EXISTS(SELECT 1 FROM {table} WHERE id={f.q(36)}) AND NOT EXISTS(SELECT 1 FROM laboratorio_esteira_eventos WHERE os_id={f.q(36)})")
        check(f'INSERT {table} explicit aberta allowed',f"(SELECT status::text FROM {table} WHERE id={f.q(36)})='aberta' AND NOT EXISTS(SELECT 1 FROM laboratorio_esteira_eventos WHERE os_id={f.q(36)})",f"INSERT INTO {table}({columns}) VALUES({f.q(36)},{C},{P},'aberta');")
        sql+=f"DELETE FROM {table} WHERE id={f.q(36)};"
    # A service role is not an authorization whitelist. GUC flags cannot bypass the guard.
    sql+='GRANT INSERT,SELECT ON ordens_servico,ordens_servico_onfarm TO service_role;'
    sql+="SELECT set_config('app.skip_approval','true',false); SET ROLE service_role;"
    for table in ['ordens_servico','ordens_servico_onfarm']:
        deny('service no bypass '+table,f"INSERT INTO {table}(id,cliente_id,produto_id,status) VALUES({f.q(36)},{C},{P},'programada')")
    sql+='RESET ROLE;'
    # Real local ROLE/RLS evaluation, reduced policies only; not hosted RLS equivalence.
    sql+='''GRANT USAGE ON SCHEMA public,auth,platform_private TO authenticated;
ALTER FUNCTION platform_private.h15_actor_organization() SET search_path TO '';
ALTER FUNCTION public.has_role(uuid,public.app_role) SET search_path TO '';
GRANT SELECT,UPDATE ON ordens_servico TO authenticated;
ALTER TABLE ordens_servico ENABLE ROW LEVEL SECURITY;
CREATE POLICY local_read ON ordens_servico FOR SELECT TO authenticated USING(true);
CREATE POLICY local_write ON ordens_servico FOR UPDATE TO authenticated USING(public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY local_tenant ON ordens_servico AS RESTRICTIVE FOR ALL TO authenticated USING(organization_id=platform_private.h15_actor_organization()) WITH CHECK(organization_id=platform_private.h15_actor_organization());
'''
    sql+=f"SELECT set_config('t.org',{B},false); SET ROLE authenticated;"
    check('local RLS foreign zero',f"(SELECT count(*) FROM ordens_servico WHERE id={f.q(35)})=0",f"UPDATE ordens_servico SET status='aprovada' WHERE id={f.q(35)};")
    check('local RLS missing zero',f"(SELECT count(*) FROM ordens_servico WHERE id={f.q(99)})=0",f"UPDATE ordens_servico SET status='aprovada' WHERE id={f.q(99)};")
    sql+=f"RESET ROLE; SELECT set_config('t.org',{A},false); SET ROLE authenticated;"
    check('local RLS admin direct replay',f"(SELECT status FROM ordens_servico WHERE id={f.q(35)})='aprovada'",f"UPDATE ordens_servico SET status='aprovada' WHERE id={f.q(35)};")
    sql+='RESET ROLE;'
    sql+=f"INSERT INTO microrganismos(id,nome) VALUES({f.q(22)},'Micro'); INSERT INTO ordens_servico_onfarm(id,cliente_id,microrganismo_id) VALUES({f.q(37)},{C},{f.q(22)}); INSERT INTO programacao_producao(id,organization_id,ordem_servico_onfarm_id,microrganismo_id) VALUES({f.q(57)},{A},{f.q(37)},{f.q(22)});"
    check('micro approved no invented program',f"(SELECT status FROM ordens_servico_onfarm WHERE id={f.q(37)})='aprovada' AND (SELECT count(*) FROM programacao_producao WHERE ordem_servico_onfarm_id={f.q(37)})=1",f"SELECT public.rpc_aprovar_os_v1({f.q(37)},'onfarm');")
    tmp=Path(tempfile.mkdtemp(prefix='approval-local-',dir='/tmp')); tmp.chmod(0o777)
    pre=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []; started=False
    try:
        subprocess.run(pre+['initdb','-D',str(tmp/'d'),'-A','trust','-U','postgres'],check=True,capture_output=True)
        subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55494','start','-w'],check=True,capture_output=True); started=True
        path=tmp/'test.sql'; path.write_text(sql); path.chmod(0o644)
        r=subprocess.run(['psql','-h',str(tmp),'-p','55494','-U','postgres','-v','ON_ERROR_STOP=1','-f',str(path)],capture_output=True,text=True)
        if r.returncode: raise SystemExit(r.stdout[-1500:]+r.stderr[-2000:])
        print(r.stderr); print('Assertions:',len(labels),'PASS; exact candidate/3 hash-matched triggers; Auth/schema SIMULATED, hosted fullpreflight/RLS NOT tested')
    finally:
        if started: subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'stop','-m','immediate'],capture_output=True)
        shutil.rmtree(tmp,ignore_errors=True)
if __name__=='__main__': main()
