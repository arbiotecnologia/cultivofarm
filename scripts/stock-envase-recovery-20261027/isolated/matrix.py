"""Local-only real-schema extension; upstream changes explicitly use replica fixtures."""
import json,time,subprocess,re
def run(X):
    T=X.T; sql=X.sql; last=X.last; snap=X.snapshot; ok=X.ok; reject=X.reject
    def fixture(n,vol=5000):
        o,p,l=[T.u(n+i) for i in range(3)]
        sql('SET session_replication_role=replica;'+T.manufactured(o,p,l,vol=vol)); return o,p,l
    def call(ids,key,q=1,actor=None,override=False,reason=None):
        o,p,l=ids
        return T.actor(actor or T.W)+T.envase(o,p,l,[{'tipo_embalagem':'frasco_1L','quantidade':q}],key,parcial='true' if override else 'false',motivo="'"+reason+"'" if reason else 'NULL')
    ids=fixture(2000)
    b=snap(); reject('REPEATABLE READ explicitly unsupported without writes','BEGIN ISOLATION LEVEL REPEATABLE READ;'+call(ids,'rr-00000001'),'0A000'); assert snap()==b
    reject('SERIALIZABLE explicitly unsupported without writes','BEGIN ISOLATION LEVEL SERIALIZABLE;'+call(ids,'ss-00000001'),'0A000'); assert snap()==b
    r=json.loads(last(call(ids,'partial-00001',2))); assert r['estado']=='partial' and r['pendente_os_ml']==3000 and T.os_status(ids[0])=='em_cq';ok('READ COMMITTED partial reserves 2000ml with 3000ml pending')
    b=snap();reject('production cannot override partial',call(ids,'override-deny1',1,override=True,reason='LOCAL'),'P0001');assert snap()==b
    reject('manager override requires reason',call(ids,'override-deny2',1,actor=T.U,override=True),'P0001');assert snap()==b
    r=json.loads(last(call(ids,'override-ok01',1,actor=T.U,override=True,reason='LOCAL')));assert r['estado']=='completed_override' and T.os_status(ids[0])=='pronto_entrega';ok('manager reasoned override completes without finance')
    for change,restore,label in [
      (f"DELETE FROM public.user_roles WHERE user_id='{T.W}' AND role='producao';",f"INSERT INTO public.user_roles(user_id,role) VALUES('{T.W}','producao');",'role'),
      (f"UPDATE public.profiles SET organization_id='{T.B}' WHERE user_id='{T.W}';",f"UPDATE public.profiles SET organization_id='{T.A}' WHERE user_id='{T.W}';",'tenant'),
      (f"UPDATE public.saas_plan_versions SET features_snapshot='[]'::jsonb WHERE id='{T.T.VER}';",f"UPDATE public.saas_plan_versions SET features_snapshot='[\"estoque_embalagens\",\"envase\",\"ordens_producao\",\"lotes_qualidade\"]'::jsonb WHERE id='{T.T.VER}';",'SaaS')]:
        for lock in ['gate','os','programacao','lote']:
            ids=fixture(2100+(['role','tenant','SaaS'].index(label)*100)+['gate','os','programacao','lote'].index(lock)*4)
            locks={'gate':'SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;', 'os':f"SELECT 1 FROM public.ordens_servico WHERE id='{ids[0]}' FOR UPDATE;",'programacao':f"SELECT 1 FROM public.programacao_producao WHERE id='{ids[1]}' FOR UPDATE;",'lote':f"SELECT 1 FROM public.lotes WHERE id='{ids[2]}' FOR UPDATE;"}
            holder=T.T.session('BEGIN;'+locks[lock]+'SET LOCAL session_replication_role=replica;'+change)
            w=subprocess.Popen(X.pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            w.stdin.write("\\set VERBOSITY verbose\nSET application_name='matrix_envase';"+call(ids,f'{label}-{lock}-0001')+'\n');w.stdin.flush()
            waited=False
            for _ in range(100):
                if last("SELECT count(*) FROM pg_stat_activity WHERE application_name='matrix_envase' AND wait_event_type='Lock';")=='1':waited=True;break
                time.sleep(.02)
            assert waited,(label,lock)
            T.T.finish(holder,'COMMIT;');b=snap();w.stdin.close();w.stdin=None;out,err=w.communicate(timeout=30)
            assert w.returncode!=0 and re.search(r'ERROR:\s+42501:',err),(label,lock,out,err)
            assert snap()==b;ok(label+' revoked during observed '+lock+' wait denies with 42501')
            sql('SET session_replication_role=replica;'+restore)
    ids=fixture(2500)
    b=snap();stmt=call(ids,'itemN-000001',2).replace("[{\"tipo_embalagem\": \"frasco_1L\", \"quantidade\": 2}]","[{\"tipo_embalagem\":\"frasco_1L\",\"quantidade\":1},{\"tipo_embalagem\":\"frasco_1L\",\"quantidade\":1}]")
    assert stmt!=call(ids,'itemN-000001',2)
    sql("CREATE FUNCTION public.local_item_n() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM public.envase WHERE lote_id=NEW.lote_id) THEN RAISE EXCEPTION 'ITEM_N_FAIL' USING ERRCODE='PT409'; END IF; RETURN NEW; END $$;CREATE TRIGGER zz_local_itemn BEFORE INSERT ON public.envase FOR EACH ROW EXECUTE FUNCTION public.local_item_n();")
    reject('item N failure rolls back prior item stock ledger receipt',stmt,'PT409');assert snap()==b
    sql('DROP TRIGGER zz_local_itemn ON public.envase;DROP FUNCTION public.local_item_n();')
    holder=T.T.session(f"BEGIN;SELECT 1 FROM public.lotes WHERE id='{ids[2]}' FOR UPDATE;")
    reject('lock timeout rolls back whole receipt and stock',call(ids,'timeout-00001'),'55P03');T.T.finish(holder,'ROLLBACK;');assert snap()==b
