"""Effective SQL bodies in disposable PostgreSQL; Auth/schema reduced and simulated.
No hosted connection, data, grants, UI or manufacturing. Not JWT/RLS certification.
"""
from pathlib import Path
import importlib.util
import os
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('live_fixture', ROOT / 'scripts/tests/cockpit-live-source-local.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


def main():
    sql = fixture.SETUP + r'''
CREATE TABLE organizations(id uuid PRIMARY KEY,ativo boolean);
CREATE TABLE user_roles(user_id uuid,role app_role);
CREATE TABLE organization_subscriptions(id uuid,organization_id uuid);
CREATE TABLE organization_feature_overrides(id uuid,organization_id uuid);
CREATE TABLE saas_plan_versions(id uuid); CREATE TABLE saas_plan_version_features(id uuid); CREATE TABLE saas_features(id uuid); CREATE TABLE saas_modules(id uuid);
ALTER TABLE profiles ADD COLUMN id uuid;
ALTER TABLE produtos ADD COLUMN familia_catalogo text;
ALTER TABLE ordens_servico ADD COLUMN status text DEFAULT 'aprovada';
ALTER TABLE ordens_servico ADD COLUMN volume_total_ml numeric;
ALTER TABLE ordens_servico ADD COLUMN data_programada date;
ALTER TABLE ordens_servico ADD COLUMN origem text DEFAULT 'agronomica';
ALTER TABLE ordens_servico_onfarm ADD COLUMN status text DEFAULT 'aprovada';
ALTER TABLE ordens_servico_onfarm ADD COLUMN volume_total_ml numeric;
ALTER TABLE ordens_servico_onfarm ADD COLUMN data_recomendada date;
ALTER TABLE programacao_producao ADD COLUMN status text DEFAULT 'aguardando';
ALTER TABLE programacao_producao ADD COLUMN data_programada date;
ALTER TABLE programacao_producao ADD COLUMN volume_necessario numeric;
ALTER TABLE programacao_producao ADD COLUMN created_at timestamptz DEFAULT now();
CREATE UNIQUE INDEX programacao_producao_os_uniq ON programacao_producao(ordem_servico_id) WHERE ordem_servico_id IS NOT NULL;
CREATE UNIQUE INDEX programacao_producao_os_onfarm_uniq ON programacao_producao(ordem_servico_onfarm_id) WHERE ordem_servico_onfarm_id IS NOT NULL;
CREATE TABLE production_order_link(ordem_servico_id uuid);
CREATE TABLE laboratorio_esteira_eventos(id uuid DEFAULT gen_random_uuid(),os_id uuid,origem_os text,programacao_id uuid,etapa_anterior text,etapa_nova text,acao text,usuario_id uuid,observacao text);
CREATE FUNCTION public.rpc_programar_os_v1(uuid,text,date DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$SELECT '{}'::jsonb$$;
REVOKE ALL ON FUNCTION public.rpc_programar_os_v1(uuid,text,date) FROM PUBLIC,anon,authenticated;
CREATE TEMP TABLE saved_programar_acl AS SELECT proacl,proowner FROM pg_proc WHERE oid='public.rpc_programar_os_v1(uuid,text,date)'::regprocedure;
CREATE FUNCTION public.fn_cockpit_norm_origem(p_origem text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v text := lower(btrim(coalesce(p_origem, '')));
BEGIN
  IF v IN ('manual', 'os', 'ordem_servico') THEN RETURN 'manual'; END IF;
  IF v IN ('onfarm', 'on_farm', 'ordem_servico_onfarm') THEN RETURN 'onfarm'; END IF;
  IF v = 'b2b' THEN RETURN 'b2b'; END IF;
  RAISE EXCEPTION 'COCKPIT_ORIGEM_INVALIDA';
END;
$function$;
CREATE FUNCTION platform_private.lab_item_is_manufacturable(p_product_id uuid,p_microorganism_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
 SELECT CASE WHEN p_product_id IS NOT NULL AND p_microorganism_id IS NOT NULL THEN false
 WHEN p_product_id IS NOT NULL THEN EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=p_product_id AND p.familia_catalogo='biologico')
 WHEN p_microorganism_id IS NOT NULL THEN EXISTS(SELECT 1 FROM public.microrganismos m WHERE m.id=p_microorganism_id)
 ELSE false END
$function$;
-- Actual onfarm downstream body from canonical read 18:53; reduced tables.
CREATE FUNCTION public.sync_os_onfarm_downstream() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_prog_id uuid; v_lote_id uuid;
BEGIN
 IF (OLD.status IS NOT DISTINCT FROM NEW.status) THEN RETURN NEW; END IF;
 SELECT id INTO v_prog_id FROM public.programacao_producao WHERE ordem_servico_onfarm_id=NEW.id ORDER BY created_at DESC LIMIT 1;
 IF v_prog_id IS NULL AND NEW.status::text IN ('aprovada','programada','em_producao','em_cq','envase','pronto_entrega','entregue','finalizada') AND NEW.produto_id IS NOT NULL THEN
 INSERT INTO public.programacao_producao(produto_id,volume_necessario,data_programada,status,ordem_servico_onfarm_id)
 VALUES(NEW.produto_id,NEW.volume_total_ml,COALESCE(NEW.data_recomendada,CURRENT_DATE),'aguardando',NEW.id) RETURNING id INTO v_prog_id; END IF;
 IF v_prog_id IS NOT NULL THEN SELECT id INTO v_lote_id FROM public.lotes WHERE programacao_id=v_prog_id ORDER BY created_at DESC LIMIT 1; END IF;
 CASE NEW.status::text
 WHEN 'aprovada' THEN IF v_prog_id IS NOT NULL THEN UPDATE public.programacao_producao SET status='aguardando' WHERE id=v_prog_id; END IF;
 WHEN 'programada' THEN IF v_prog_id IS NOT NULL THEN UPDATE public.programacao_producao SET status='aguardando',data_programada=COALESCE(NEW.data_recomendada,data_programada,CURRENT_DATE) WHERE id=v_prog_id; END IF;
 WHEN 'em_producao' THEN IF v_prog_id IS NOT NULL THEN UPDATE public.programacao_producao SET status='em_producao' WHERE id=v_prog_id; END IF;
 IF v_lote_id IS NULL AND NEW.produto_id IS NOT NULL THEN INSERT INTO public.lotes(codigo_lote,produto_id,programacao_id,status,volume_produzido,data_producao) VALUES(public.gerar_codigo_lote(),NEW.produto_id,v_prog_id,'em_producao',NEW.volume_total_ml,CURRENT_DATE); END IF;
 WHEN 'em_cq' THEN IF v_prog_id IS NOT NULL THEN UPDATE public.programacao_producao SET status='aguardando_cq' WHERE id=v_prog_id; END IF; IF v_lote_id IS NOT NULL THEN UPDATE public.lotes SET status='aguardando_cq' WHERE id=v_lote_id; END IF;
 WHEN 'envase' THEN IF v_prog_id IS NOT NULL THEN UPDATE public.programacao_producao SET status='aprovado' WHERE id=v_prog_id; END IF;
 ELSE NULL; END CASE; RETURN NEW;
END; $function$;
ALTER TABLE lotes ADD COLUMN created_at timestamptz DEFAULT now();
CREATE TRIGGER trg_sync_os_onfarm_downstream AFTER UPDATE OF status ON ordens_servico_onfarm FOR EACH ROW EXECUTE FUNCTION sync_os_onfarm_downstream();
'''
    live = (ROOT / 'scripts/rbac-audit/applied-20261015183119_h_cockpit_live_source_tenant_chain_closed.sql').read_text()
    sql += re.search(r'CREATE OR REPLACE FUNCTION private\.h7n_esteira_laboratorio\(\).*?\$function\$;', live, re.S).group()
    candidate = (ROOT / 'scripts/os-programming-recovery/rpc.sql.review').read_text()
    sql += re.search(r'CREATE OR REPLACE FUNCTION public\.rpc_programar_os_v1.*?\$function\$;', candidate, re.S).group()
    import json,hashlib
    downstream=json.loads((ROOT/'scripts/rbac-audit/cockpit-approval-baseline-20261015.json').read_text())
    classical=next(f for f in downstream['functions'] if f['name']=='fn_sync_os_classica_downstream')
    assert hashlib.md5(classical['definition'].encode()).hexdigest()==classical['md5']
    sql+=classical['definition']+"CREATE TRIGGER classic_downstream AFTER UPDATE OF status ON ordens_servico FOR EACH ROW EXECUTE FUNCTION fn_sync_os_classica_downstream();\n"
    q = fixture.q
    A,B,U,CA,CB,P,O,F,PP,PF,M = [q(i) for i in [1,2,41,11,12,21,31,33,51,53,22]]
    sql += f'''
INSERT INTO organizations VALUES({A},true),({B},true);
INSERT INTO profiles(user_id,id,organization_id,ativo) VALUES({U},{U},{A},true);
INSERT INTO user_roles VALUES({U},'administrador');
INSERT INTO clientes VALUES({CA},{A},'AR'),({CB},{B},'FSF');
INSERT INTO produtos(id,nome,familia_catalogo) VALUES({P},'Bio','biologico');
INSERT INTO microrganismos(id,nome) VALUES({M},'Micro');
INSERT INTO ordens_servico(id,cliente_id,produto_id,organization_id) VALUES({O},{CA},{P},{A});
INSERT INTO ordens_servico_onfarm(id,cliente_id,microrganismo_id) VALUES({F},{CA},{M});
INSERT INTO programacao_producao(id,organization_id,ordem_servico_id,produto_id) VALUES({PP},{A},{O},{P});
INSERT INTO programacao_producao(id,organization_id,ordem_servico_onfarm_id,microrganismo_id) VALUES({PF},{A},{F},{M});
SELECT set_config('t.uid',{U},false),set_config('t.org',{A},false),set_config('t.ready','true',false),set_config('t.feature','true',false),set_config('t.role','administrador',false);
'''
    labels = []
    def check(label, expr, change='', undo=''):
        nonlocal sql
        labels.append(label)
        sql += change + f"\nDO $test$ BEGIN IF NOT (({expr}) IS TRUE) THEN RAISE EXCEPTION 'FAIL {label}'; END IF; RAISE NOTICE 'PASS {label}'; END $test$;\n" + undo
    call = f"public.rpc_programar_os_v1({O},'manual','2026-10-20')"
    def deny(label, change='', undo='', invocation=call):
        nonlocal sql
        labels.append(label)
        sql += change + f"\nDO $test$ BEGIN BEGIN PERFORM {invocation}; RAISE EXCEPTION 'FAIL {label}'; EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'PROGRAMAR_SCOPE_DENIED' THEN RAISE; END IF; RAISE NOTICE 'PASS {label}'; END; END $test$;\n" + undo
    deny('foreign indistinguishable',f"SELECT set_config('t.org',{B},false);",f"SELECT set_config('t.org',{A},false);")
    deny('missing same denial',invocation=f"public.rpc_programar_os_v1({q(99)},'manual','2026-10-20')")
    for role in ['administrativo','financeiro','consultor_tecnico','operador_onfarm','superadmin']:
        deny(role,f"SELECT set_config('t.role','{role}',false);","SELECT set_config('t.role','administrador',false);")
    for key in ['ready','feature']:
        for value in ['false','']:
            deny(key+' '+(value or 'NULL'),f"SELECT set_config('t.{key}','{value}',false);",f"SELECT set_config('t.{key}','true',false);")
    deny('logout',"SELECT set_config('t.uid','',false);",f"SELECT set_config('t.uid',{U},false);")
    for label,change,undo in [
      ('client changed',f'UPDATE clientes SET organization_id={B} WHERE id={CA};',f'UPDATE clientes SET organization_id={A} WHERE id={CA};'),
      ('program tenant NULL',f'UPDATE programacao_producao SET organization_id=NULL WHERE id={PP};',f'UPDATE programacao_producao SET organization_id={A} WHERE id={PP};'),
      ('program dual origin',f'UPDATE programacao_producao SET ordem_servico_onfarm_id={O} WHERE id={PP};',f'UPDATE programacao_producao SET ordem_servico_onfarm_id=NULL WHERE id={PP};'),
      ('program wrong item',f'UPDATE programacao_producao SET produto_id={q(99)} WHERE id={PP};',f'UPDATE programacao_producao SET produto_id={P} WHERE id={PP};'),
      ('duplicate OS ID',f'INSERT INTO ordens_servico_onfarm(id,cliente_id,microrganismo_id) VALUES({O},{CA},{M});',f'DELETE FROM ordens_servico_onfarm WHERE id={O};'),
      ('orphan field',f'UPDATE ordens_servico SET talhao_id={q(99)} WHERE id={O};',f'UPDATE ordens_servico SET talhao_id=NULL WHERE id={O};')]:
        deny(label,change,undo)
    check('open no autoapproval',f"({call}->>'success')::boolean=false AND (SELECT status FROM ordens_servico WHERE id={O})='aberta'",f"UPDATE ordens_servico SET status='aberta' WHERE id={O};",f"UPDATE ordens_servico SET status='aprovada' WHERE id={O};")
    for family in ['quimico','fertilizante',None]:
        change = f"UPDATE produtos SET familia_catalogo={'NULL' if family is None else repr(family)} WHERE id={P};"
        check('family '+str(family),f"({call}->>'success')::boolean=false",change,f"UPDATE produtos SET familia_catalogo='biologico' WHERE id={P};")
    check('B2B origin withheld',f"(public.rpc_programar_os_v1({O},'b2b','2026-10-20')->>'success')::boolean=false")
    check('B2B stored origin withheld',f"({call}->>'success')::boolean=false",f"UPDATE ordens_servico SET origem='b2b' WHERE id={O};",f"UPDATE ordens_servico SET origem='agronomica' WHERE id={O};")
    check('link withheld',f"({call}->>'success')::boolean=false",f"INSERT INTO production_order_link VALUES({O});",'DELETE FROM production_order_link;')
    check('NULL date no invented date',f"(public.rpc_programar_os_v1({O},'manual',NULL)->>'success')::boolean=false")
    check('infinite date',f"(public.rpc_programar_os_v1({O},'manual','infinity')->>'success')::boolean=false")
    check('approved bio scheduled',f"({call}->>'success')::boolean=true")
    check('NULL volumes preserved',f"(SELECT volume_total_ml IS NULL FROM ordens_servico WHERE id={O}) AND (SELECT volume_necessario IS NULL FROM programacao_producao WHERE id={PP})")
    check('one program no lot',"(SELECT count(*) FROM programacao_producao)=2 AND NOT EXISTS(SELECT 1 FROM lotes)")
    check('audit concrete before after actor',f"EXISTS(SELECT 1 FROM laboratorio_esteira_eventos WHERE usuario_id={U} AND observacao::jsonb->'before'->>'status_os'='aprovada' AND observacao::jsonb->'after'->>'data_programacao'='2026-10-20' AND observacao::jsonb->>'manufacturing_started'='false')")
    check('same date replay no event',f"({call}->>'replay')::boolean=true AND (SELECT count(*) FROM laboratorio_esteira_eventos)=1")
    check('manual alias same replay',f"(public.rpc_programar_os_v1({O},'ordem_servico','2026-10-20')->>'replay')::boolean=true")
    check('onfarm micro actual trigger',f"(public.rpc_programar_os_v1({F},'on_farm','2026-10-22')->>'success')::boolean=true")
    check('onfarm explicit date and no lot',f"(SELECT data_programada FROM programacao_producao WHERE id={PF})='2026-10-22'::date AND NOT EXISTS(SELECT 1 FROM lotes)")
    check('onfarm replay',f"(public.rpc_programar_os_v1({F},'onfarm','2026-10-22')->>'replay')::boolean=true")
    check('reschedule denied',f"(public.rpc_programar_os_v1({O},'manual','2026-10-23')->>'success')::boolean=false")
    check('denied reschedule no event',"(SELECT count(*) FROM laboratorio_esteira_eventos)=2")
    check('program progressed denied',f"({call}->>'success')::boolean=false",f"UPDATE programacao_producao SET status='em_producao' WHERE id={PP};",f"UPDATE programacao_producao SET status='aguardando' WHERE id={PP};")
    check('ACL preserved',"NOT EXISTS(SELECT 1 FROM saved_programar_acl b JOIN pg_proc p ON p.oid='public.rpc_programar_os_v1(uuid,text,date)'::regprocedure WHERE b.proacl IS DISTINCT FROM p.proacl OR b.proowner IS DISTINCT FROM p.proowner)")
    for role in ['authenticated','anon']:
        check(role+' remains closed',f"NOT has_function_privilege('{role}','public.rpc_programar_os_v1(uuid,text,date)','EXECUTE')")
    tmp = Path(tempfile.mkdtemp(prefix='programar-local-',dir='/tmp')); tmp.chmod(0o777)
    pre = ['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
    started=False
    try:
        subprocess.run(pre+['initdb','-D',str(tmp/'d'),'-A','trust','-U','postgres'],check=True,capture_output=True)
        subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55493','start','-w'],check=True,capture_output=True); started=True
        f=tmp/'test.sql'; f.write_text(sql); f.chmod(0o644)
        r=subprocess.run(['psql','-h',str(tmp),'-p','55493','-U','postgres','-v','ON_ERROR_STOP=1','-f',str(f)],capture_output=True,text=True)
        if r.returncode: raise SystemExit(r.stdout[-4000:]+r.stderr[-1500:])
        print(r.stderr)
        # Reset only local synthetic fixture. Production OS never touched.
        subprocess.run(['psql','-h',str(tmp),'-p','55493','-U','postgres','-v','ON_ERROR_STOP=1','-c',f"UPDATE ordens_servico SET status='aprovada',data_programada=NULL WHERE id={O}; UPDATE programacao_producao SET data_programada=NULL WHERE id={PP};"],check=True,capture_output=True)
        # Two real local connections, same target/date. Each restores simulated actor.
        connection=['psql','-h',str(tmp),'-p','55493','-U','postgres','-v','ON_ERROR_STOP=1','-At','-c']
        actor=f"SELECT set_config('t.uid',{U},false),set_config('t.org',{A},false),set_config('t.ready','true',false),set_config('t.feature','true',false),set_config('t.role','administrador',false);"
        invocation=f"SELECT public.rpc_programar_os_v1({O},'manual','2026-10-24');"
        first=subprocess.Popen(connection+[actor+'BEGIN;'+invocation+'SELECT pg_sleep(0.3); COMMIT;'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        second=subprocess.Popen(connection+[actor+invocation],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        outputs=[first.communicate(timeout=20),second.communicate(timeout=20)]
        assert first.returncode==0 and second.returncode==0, outputs
        combined='\n'.join(out for out,err in outputs)
        assert combined.count('"replay": false')==1 and combined.count('"replay": true')==1, combined
        after=subprocess.run(connection+["SELECT count(*) FROM laboratorio_esteira_eventos;"],capture_output=True,text=True,check=True)
        assert after.stdout.strip()=='3', after.stdout
        print('PASS two local connections same-date one write one replay; PASS one new audit event')
        print('Assertions:',len(labels)+2,'Auth/schema SIMULATED; full preflight and hosted RLS NOT tested. Local concurrency only same-target/same-date.')
    finally:
        if started: subprocess.run(pre+['pg_ctl','-D',str(tmp/'d'),'stop','-m','immediate'],capture_output=True)
        shutil.rmtree(tmp,ignore_errors=True)


if __name__=='__main__':
    main()