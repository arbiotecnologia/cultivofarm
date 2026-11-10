#!/usr/bin/env python3
"""PG descartável. Corpo LIVE v2 (md5 verificado = 3e0dc7c4...) vs delta 02 exato. Helper de escopo/allowlist
verbatim do 61. Seams DECLARADOS: auth.uid, stock_motor_actor/item/context, rpc_estoque_operar_v1 (reserva com split),
tabelas mínimas. Não prova JWT/RLS hospedado nem o motor real de estoque."""
import json,os,re,shutil,subprocess,tempfile,threading,time,uuid,hashlib,sys
from pathlib import Path
import psycopg2
H=Path(__file__).parent
P61=H.parent/"order-e2e-new-20261108/production-rollout-posplans-20261108/61-pilot-containment-install.sql.review"
SU=["setpriv","--reuid=1000","--regid=1000","--clear-groups"] if os.getuid()==0 else []
def sh(*a): return subprocess.run(SU+list(a),check=True,capture_output=True,text=True)
R=[];fail=0
def check(n,c,d=""):
    global fail
    R.append({"case":n,"pass":bool(c),"detail":d});print(("PASS " if c else "FAIL ")+n,d)
    if not c: fail+=1
U=lambda:str(uuid.uuid4())
SETUP=r"""
CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE TABLE platform_private.finished_product_gate_v1(singleton boolean PRIMARY KEY DEFAULT true,enabled boolean NOT NULL DEFAULT false);
CREATE TABLE platform_private.b2b_resale_logistics_gate_v1(singleton boolean PRIMARY KEY DEFAULT true,enabled boolean NOT NULL DEFAULT false);
INSERT INTO platform_private.finished_product_gate_v1 DEFAULT VALUES;INSERT INTO platform_private.b2b_resale_logistics_gate_v1 DEFAULT VALUES;
CREATE TABLE public.ordens_servico(id uuid PRIMARY KEY,organization_id uuid,partner_order_item_id uuid);
CREATE TABLE public.estoque_produto(id uuid PRIMARY KEY,organization_id uuid,produto_id uuid,origem_estoque text,status text,quantidade numeric,quantidade_reservada numeric,reservado_para_os_id uuid);
CREATE TABLE public.estoque_movimentacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),idempotency_key text UNIQUE,estoque_produto_id uuid);
CREATE TABLE platform_private.stock_batch_requests(request_key text PRIMARY KEY,actor uuid,organization_id uuid,fingerprint text,result jsonb);
CREATE TABLE public.test_actor(uid uuid PRIMARY KEY,org uuid);
CREATE SCHEMA cf_user_guards_v1;CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY DEFAULT true);INSERT INTO cf_user_guards_v1.state DEFAULT VALUES;GRANT USAGE ON SCHEMA cf_user_guards_v1 TO authenticated;
CREATE FUNCTION platform_private.stock_motor_actor(a text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE v uuid;BEGIN SELECT org INTO v FROM public.test_actor WHERE uid=auth.uid();IF v IS NULL THEN RAISE EXCEPTION 'ESTQ_SEM_PERMISSAO' USING ERRCODE='42501';END IF;RETURN v;END$$;
CREATE FUNCTION platform_private.stock_motor_context_set(c jsonb) RETURNS void LANGUAGE sql AS $$SELECT$$;
CREATE FUNCTION platform_private.stock_motor_item(i uuid,a text,p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN IF NOT EXISTS(SELECT 1 FROM public.estoque_produto s JOIN public.test_actor t ON t.org=s.organization_id AND t.uid=auth.uid() WHERE s.id=i) THEN RAISE EXCEPTION 'ESTQ_ITEM_FORA_ESCOPO' USING ERRCODE='42501';END IF;END$$;
"""
OPER=r"""
CREATE FUNCTION public.rpc_estoque_operar_v1(a text,i uuid,q numeric,k text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.estoque_produto%ROWTYPE;n uuid;m uuid;org uuid:=platform_private.stock_motor_actor('reserva');
BEGIN SELECT * INTO s FROM public.estoque_produto WHERE id=i FOR UPDATE;
 IF s.origem_estoque IS NOT NULL AND platform_private.resale_pilot_scope_v1(CASE p->>'os_tipo' WHEN 'b2b' THEN 'b2b_resale' ELSE 'finished_product' END,'reserve',auth.uid(),org,
   CASE WHEN p->>'os_tipo'='b2b' THEN (p->>'partner_id')::uuid END,CASE WHEN p->>'os_tipo'='b2b' THEN (p->>'partner_order_id')::uuid END,
   CASE WHEN p->>'os_tipo'='b2b' THEN (SELECT partner_order_item_id FROM public.ordens_servico WHERE id=(p->>'os_id')::uuid) END,s.produto_id,s.id,NULL) IS NOT TRUE THEN RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501';END IF;
 IF q<s.quantidade THEN n:=gen_random_uuid();UPDATE public.estoque_produto SET quantidade=quantidade-q WHERE id=i;
  INSERT INTO public.estoque_produto VALUES(n,s.organization_id,s.produto_id,s.origem_estoque,'reservado',q,q,(p->>'os_id')::uuid);
 ELSE n:=i;UPDATE public.estoque_produto SET status='reservado',quantidade_reservada=q,reservado_para_os_id=(p->>'os_id')::uuid WHERE id=i;END IF;
 INSERT INTO public.estoque_movimentacoes(idempotency_key,estoque_produto_id) VALUES(k,n) RETURNING id INTO m;
 RETURN jsonb_build_object('ok',true,'replay',false,'movimentacao_id',m);END$$;
REVOKE ALL ON FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb) FROM PUBLIC;
GRANT USAGE ON SCHEMA auth,platform_private TO authenticated;
"""
def run(variant):
    d=Path(tempfile.mkdtemp());os.chmod(d,0o777);port=str(56000+(os.getpid()+len(variant))%900)
    sh("initdb","-D",str(d/"db"),"-U","postgres","-A","trust")
    sh("pg_ctl","-D",str(d/"db"),"-o",f"-p {port} -k {d} -c listen_addresses=''","-l",str(d/"log"),"-w","start")
    def conn():
        c=psycopg2.connect(host=str(d),port=port,user="postgres",dbname="postgres");c.autocommit=True;return c
    try:
        c=conn();q=c.cursor();src=P61.read_text()
        tbl=re.search(r"CREATE TABLE platform_private\.resale_pilot_allowlist_v1\(.*?\n \)\);",src,re.S).group(0)
        scope=re.search(r"CREATE FUNCTION platform_private\.resale_pilot_scope_v1\(.*?\n\$\$;",src,re.S).group(0)
        q.execute(SETUP+tbl+"\n"+scope+"\nREVOKE ALL ON FUNCTION platform_private.resale_pilot_scope_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;\n"+OPER)
        q.execute((H/"live-v2-body.sql").read_text().rstrip("\n")+";")
        q.execute("REVOKE ALL ON FUNCTION public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb) TO service_role,authenticated")
        q.execute("SELECT md5(pg_get_functiondef('public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)'::regprocedure))")
        live_md5=q.fetchone()[0];check(f"{variant}:LIVE_BODY_MD5_EQUALS_PRODUCTION",live_md5=="3e0dc7c48ab28f4402699b234476aa8a",live_md5)
        q.execute((H/"01-pre.sql.readonly").read_text());check(f"{variant}:PRE_PASS",q.fetchone()[0]=="PRE_PASS")
        cand_md5=None
        if variant=="CANDIDATE":
            q.execute((H/"02-install.sql.review").read_text())
            q.execute("SELECT md5(pg_get_functiondef('public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)'::regprocedure))");cand_md5=q.fetchone()[0]
            post=(H/"03-post.sql.readonly").read_text().replace(":CAND_MD5:",cand_md5)
            (H/"03-post.sql.readonly").write_text(post)
            q.execute(post);check("CANDIDATE:POST_PASS",q.fetchone()[0]=="POST_PASS",cand_md5)
            try: q.execute((H/"02-install.sql.review").read_text());check("CANDIDATE:RERUN_REFUSED",False)
            except psycopg2.Error as e: q.execute("ROLLBACK");check("CANDIDATE:RERUN_REFUSED","INSTALL_PIN_DRIFT_OR_RERUN" in str(e))
        A,F,act,fact=U(),U(),U(),U();pa,po,item,prod,os_,st,bio,os2=U(),U(),U(),U(),U(),U(),U(),U()
        q.execute("INSERT INTO public.test_actor VALUES(%s,%s),(%s,%s)",(act,A,fact,F))
        q.execute("INSERT INTO public.ordens_servico VALUES(%s,%s,%s),(%s,%s,NULL)",(os_,A,item,os2,A))
        q.execute("INSERT INTO public.estoque_produto VALUES(%s,%s,%s,'compra','disponivel',10,0,NULL),(%s,%s,%s,NULL,'disponivel',8,0,NULL)",(st,A,prod,bio,A,prod))
        q.execute("UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true")
        q.execute("INSERT INTO platform_private.resale_pilot_allowlist_v1(gate,operation,actor_id,organization_id,partner_id,order_id,order_item_id,product_id,stock_id,valid_until) VALUES('b2b_resale','reserve',%s,%s,%s,%s,%s,%s,%s,now()+interval '1 hour') RETURNING id",(act,A,pa,po,item,prod,st));g=q.fetchone()[0]
        def call(uid,key,osid=os_,origem="b2b",stock=st,qty=3,dados=None,cur=None):
            cur=cur or conn().cursor()
            dados=dados if dados is not None else {"partner_id":pa,"partner_order_id":po}
            try:
                cur.execute("BEGIN");cur.execute("SET LOCAL ROLE authenticated");cur.execute("SELECT set_config('test.uid',%s,true)",(uid,))
                cur.execute("SELECT public.rpc_estoque_reservar_v1(%s,%s,%s::jsonb,%s,%s::jsonb)",(osid,origem,json.dumps([{"item_id":stock,"quantidade":qty}]),key,json.dumps(dados)));v=cur.fetchone()[0];cur.execute("COMMIT");return ("ok",v)
            except psycopg2.Error as e:
                cur.execute("ROLLBACK");return (e.pgcode,str(e).split("\n")[0])
        def moves(): q.execute("SELECT count(*) FROM public.estoque_movimentacoes");return q.fetchone()[0]
        r1=call(act,"key-b2b-0001");check(f"{variant}:FIRST_SPLIT_RESERVE",r1[0]=="ok" and r1[1]["replay"] is False and r1[1]["itens"][0]!=st,json.dumps(r1[1]))
        r2=call(act,"key-b2b-0001");check(f"{variant}:REPLAY_SAME_RECEIPT_NO_NEW_MOVE",r2[0]=="ok" and r2[1]["replay"] is True and r2[1]["itens"]==r1[1]["itens"] and moves()==1)
        r3=call(fact,"key-b2b-0001");check(f"{variant}:FOREIGN_ACTOR_DENIED",r3[0] in ("42501","23505"),str(r3))
        # Biológico/outra origem: recibo preservado mesmo com gate fechado.
        rb=call(act,"key-bio-0001",osid=os2,origem="manual",stock=bio,qty=8,dados={});check(f"{variant}:BIO_FIRST",rb[0]=="ok",str(rb))
        q.execute("UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false")
        rb2=call(act,"key-bio-0001",osid=os2,origem="manual",stock=bio,qty=8,dados={});check(f"{variant}:BIO_REPLAY_PRESERVED",rb2[0]=="ok" and rb2[1]["replay"] is True)
        rg=call(act,"key-b2b-0001");exp_ok=variant=="LIVE"
        check(f"{variant}:GATE_OFF_REPLAY",rg[0]==("ok" if exp_ok else "42501"),("REPRODUZ: recibo devolvido com gate fechado " if exp_ok else "negado ")+str(rg[0]))
        q.execute("UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true")
        # Revogação DURANTE espera comprovada no lock do recibo.
        holder=conn().cursor();holder.execute("BEGIN");holder.execute("SELECT pg_advisory_xact_lock(hashtextextended('stock_batch:'||'key-b2b-0001',0))")
        wc=conn();res={}
        t=threading.Thread(target=lambda: res.update(r=call(act,"key-b2b-0001",cur=wc.cursor())));t.start()
        waited=False
        for _ in range(100):
            q.execute("SELECT count(*) FROM pg_locks l WHERE l.locktype='advisory' AND NOT l.granted AND l.pid=%s",(wc.get_backend_pid(),))
            if q.fetchone()[0]==1: waited=True;break
            time.sleep(0.05)
        check(f"{variant}:WAITER_PROVEN",waited)
        q.execute("UPDATE platform_private.resale_pilot_allowlist_v1 SET revoked_at=clock_timestamp() WHERE id=%s",(g,))
        holder.execute("COMMIT");t.join(10)
        check(f"{variant}:REVOKED_DURING_WAIT",res["r"][0]==("ok" if exp_ok else "42501"),("REPRODUZ: recibo após revogação " if exp_ok else "negado pós-espera ")+str(res["r"][0]))
        # Ator removido durante espera.
        q.execute("INSERT INTO platform_private.resale_pilot_allowlist_v1(gate,operation,actor_id,organization_id,partner_id,order_id,order_item_id,product_id,stock_id,valid_until) VALUES('b2b_resale','reserve',%s,%s,%s,%s,%s,%s,%s,now()+interval '1 hour')",(act,A,pa,po,item,prod,st))
        ok=call(act,"key-b2b-0001");check(f"{variant}:REGRANT_REPLAY_OK",ok[0]=="ok" and ok[1]["itens"]==r1[1]["itens"])
        holder=conn().cursor();holder.execute("BEGIN");holder.execute("SELECT pg_advisory_xact_lock(hashtextextended('stock_batch:'||'key-b2b-0001',0))")
        wc=conn();res={};t=threading.Thread(target=lambda: res.update(r=call(act,"key-b2b-0001",cur=wc.cursor())));t.start()
        waited=False
        for _ in range(100):
            q.execute("SELECT count(*) FROM pg_locks l WHERE l.locktype='advisory' AND NOT l.granted AND l.pid=%s",(wc.get_backend_pid(),))
            if q.fetchone()[0]==1: waited=True;break
            time.sleep(0.05)
        check(f"{variant}:WAITER2_PROVEN",waited)
        q.execute("DELETE FROM public.test_actor WHERE uid=%s",(act,));holder.execute("COMMIT");t.join(10)
        check(f"{variant}:ACTOR_REMOVED_DURING_WAIT",res["r"][0]==("ok" if exp_ok else "42501"),str(res["r"][0]))
        q.execute("INSERT INTO public.test_actor VALUES(%s,%s)",(act,A))
        q.execute("UPDATE platform_private.resale_pilot_allowlist_v1 SET valid_until=valid_from+interval '1 ms' WHERE revoked_at IS NULL");time.sleep(0.01)
        ex=call(act,"key-b2b-0001");check(f"{variant}:EXPIRED_REPLAY",ex[0]==("ok" if exp_ok else "42501"),str(ex[0]))
        check(f"{variant}:NO_EXTRA_MOVEMENT",moves()==2,str(moves()))
        q.execute("SELECT count(*) FROM platform_private.stock_batch_requests");check(f"{variant}:RECEIPTS_PRESERVED",q.fetchone()[0]==2)
        if variant=="CANDIDATE":
            q.execute((H/"04-rollback-deny.sql.review").read_text())
            q.execute("SELECT has_function_privilege('authenticated','public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)','EXECUTE')");check("CANDIDATE:ROLLBACK_DENY",q.fetchone()[0] is False)
        return live_md5,cand_md5
    finally:
        sh("pg_ctl","-D",str(d/"db"),"-m","fast","stop");shutil.rmtree(d,ignore_errors=True)
live,_=run("LIVE");_,cand=run("CANDIDATE")
(H/"evidence").mkdir(exist_ok=True)
files=["01-pre.sql.readonly","02-install.sql.review","03-post.sql.readonly","04-rollback-deny.sql.review","live-v2-body.sql","generate.py","db_replay_test.py"]
(H/"evidence/db-results.json").write_text(json.dumps({"live_md5":live,"candidate_md5":cand,"failed":fail,"results":R,"sha256":{f:hashlib.sha256((H/f).read_bytes()).hexdigest() for f in files}},indent=1,ensure_ascii=False))
print(f"TOTAL {len(R)-fail}/{len(R)}");sys.exit(1 if fail else 0)
