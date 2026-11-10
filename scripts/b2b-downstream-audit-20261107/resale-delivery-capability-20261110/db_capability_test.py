#!/usr/bin/env python3
"""PostgreSQL descartável local. Esquema mínimo + seams DECLARADOS; corpo real do helper de escopo
extraído verbatim de 61-pilot-containment-install.sql.review. Não prova JWT/RLS/Storage hospedado."""
import hashlib, json, os, re, shutil, subprocess, sys, tempfile, time, uuid
from pathlib import Path
HERE=Path(__file__).parent
SRC=HERE.parent/"order-e2e-new-20261108/production-rollout-posplans-20261108/61-pilot-containment-install.sql.review"
SEAMS=["auth.uid() lê GUC test.uid","delivery_actor_20261030 lê tabela test_actor (seam)","fn_estoque_pode_operar lê test_actor.reserve","b2b_resale_os_operational_valid_v1 reduzido a origem/status/escopo (seam)","tabelas com colunas mínimas","reserva simulada por UPDATE direto como superusuário (seam do writer real)"]
d=Path(tempfile.mkdtemp());os.chmod(d,0o777);port=str(55400+os.getpid()%500)
SU=["setpriv","--reuid=1000","--regid=1000","--clear-groups"] if os.getuid()==0 else []
def sh(*a,**k): return subprocess.run(SU+list(a),check=True,capture_output=True,text=True,**k)
sh("initdb","-D",str(d/"db"),"-U","postgres","-A","trust")
sh("pg_ctl","-D",str(d/"db"),"-o",f"-p {port} -k {d} -c listen_addresses=''","-l",str(d/"log"),"-w","start")
import psycopg2  # type: ignore
def conn(): c=psycopg2.connect(host=str(d),port=port,user="postgres",dbname="postgres"); c.autocommit=True; return c
R=[];fail=0
def check(name,cond,detail=""):
    global fail
    R.append({"case":name,"pass":bool(cond),"detail":detail}); print(("PASS " if cond else "FAIL ")+name,detail)
    if not cond: fail+=1
try:
    c=conn();q=c.cursor()
    src=SRC.read_text()
    tbl=re.search(r"CREATE TABLE platform_private\.resale_pilot_allowlist_v1\(.*?\n \)\);",src,re.S).group(0)
    scope=re.search(r"CREATE FUNCTION platform_private\.resale_pilot_scope_v1\(.*?\n\$\$;",src,re.S).group(0)
    q.execute("""
CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE SCHEMA auth;CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE TABLE platform_private.finished_product_gate_v1(singleton boolean PRIMARY KEY DEFAULT true,enabled boolean NOT NULL DEFAULT false);
CREATE TABLE platform_private.b2b_resale_logistics_gate_v1(singleton boolean PRIMARY KEY DEFAULT true,enabled boolean NOT NULL DEFAULT false);
INSERT INTO platform_private.finished_product_gate_v1 DEFAULT VALUES;INSERT INTO platform_private.b2b_resale_logistics_gate_v1 DEFAULT VALUES;
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY,commercial_owner_organization_id uuid);
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY,partner_id uuid);
CREATE TABLE public.ordens_servico(id uuid PRIMARY KEY,organization_id uuid,origem text,status text,partner_order_id uuid,partner_order_item_id uuid);
CREATE TABLE public.estoque_produto(id uuid PRIMARY KEY,organization_id uuid,produto_id uuid,origem_estoque text,status text,quantidade numeric,quantidade_reservada numeric,reservado_para_os_id uuid);
CREATE TABLE public.test_actor(uid uuid PRIMARY KEY,org uuid,reserve boolean);
CREATE FUNCTION platform_private.delivery_actor_20261030(p_action text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v uuid;BEGIN SELECT org INTO v FROM public.test_actor WHERE uid=auth.uid(); IF v IS NULL THEN RAISE EXCEPTION 'DELIVERY_ACTOR_DENIED' USING ERRCODE='42501';END IF;RETURN v;END$$;
CREATE FUNCTION public.fn_estoque_pode_operar(u uuid,a text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT coalesce((SELECT reserve FROM public.test_actor WHERE uid=u),false)$$;
"""+tbl+"\n"+scope+"""
CREATE FUNCTION platform_private.b2b_resale_os_operational_valid_v1(o public.ordens_servico) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT o.origem='b2b' AND o.status='pronto_entrega' AND platform_private.resale_pilot_scope_v1('b2b_resale',NULL,auth.uid(),o.organization_id,(SELECT po.partner_id FROM public.partner_orders po WHERE po.id=o.partner_order_id),o.partner_order_id,o.partner_order_item_id,NULL,NULL,NULL) IS NOT NULL$$;
CREATE FUNCTION public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb) RETURNS void LANGUAGE sql AS $$SELECT$$;
REVOKE ALL ON FUNCTION public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_private.resale_pilot_scope_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION platform_private.delivery_actor_20261030(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_estoque_pode_operar(uuid,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA auth,platform_private TO authenticated,anon;
""")
    scope_md5=q.execute("SELECT md5(pg_get_functiondef('platform_private.resale_pilot_scope_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure))") or q.fetchone()[0]
    pre=(HERE/"01-pre.sql.readonly").read_text()
    if ":SCOPE_MD5:" in pre: pre=pre.replace(":SCOPE_MD5:",scope_md5);(HERE/"01-pre.sql.readonly").write_text(pre)
    q.execute(pre);check("PRE_PASS",q.fetchone()[0]=="PRE_PASS",scope_md5)
    install=(HERE/"02-install.sql.review").read_text();q.execute(install)
    cap_md5=q.execute("SELECT md5(pg_get_functiondef('public.rpc_b2b_resale_delivery_capability_v1(uuid,uuid[])'::regprocedure))") or q.fetchone()[0]
    post=(HERE/"03-post.sql.readonly").read_text()
    if ":CAP_MD5:" in post: post=post.replace(":CAP_MD5:",cap_md5);(HERE/"03-post.sql.readonly").write_text(post)
    q.execute(post);check("POST_PASS",q.fetchone()[0]=="POST_PASS",cap_md5)
    try: q.execute(install);check("INSTALL_RERUN_REFUSED",False)
    except psycopg2.Error as e: check("INSTALL_RERUN_REFUSED","ALREADY_INSTALLED" in str(e))
    U=lambda:str(uuid.uuid4())
    A,F,actor,foreign_actor,noreserve=U(),U(),U(),U(),U()
    pa,po,item,prod,os_,st,st2,fst,fos=U(),U(),U(),U(),U(),U(),U(),U(),U()
    q.execute("INSERT INTO public.test_actor VALUES(%s,%s,true),(%s,%s,true),(%s,%s,false)",(actor,A,foreign_actor,F,noreserve,A))
    q.execute("INSERT INTO public.partner_accounts VALUES(%s,%s)",(pa,A));q.execute("INSERT INTO public.partner_orders VALUES(%s,%s)",(po,pa))
    q.execute("INSERT INTO public.ordens_servico VALUES(%s,%s,'b2b','pronto_entrega',%s,%s),(%s,%s,'b2b','pronto_entrega',%s,%s)",(os_,A,po,item,fos,F,po,item))
    q.execute("INSERT INTO public.estoque_produto VALUES(%s,%s,%s,'compra','disponivel',10,0,NULL),(%s,%s,%s,'compra','disponivel',4,0,NULL),(%s,%s,%s,'compra','disponivel',5,0,NULL)",(st,A,prod,st2,A,prod,fst,F,prod))
    def cap(uid,osid,stocks,cur=None):
        cur=cur or c.cursor();cur.execute("BEGIN");cur.execute("SET LOCAL ROLE authenticated");cur.execute("SELECT set_config('test.uid',%s,true)",(uid or "",))
        cur.execute("SELECT public.rpc_b2b_resale_delivery_capability_v1(%s,%s::uuid[])",(osid,stocks));v=cur.fetchone()[0];cur.execute("COMMIT");return v
    def items(v): return {i["stock_id"]:i for i in v["items"]}
    v=cap(actor,os_,[st]);check("PILOT_ABSENT_GATE_CLOSED",v["organization_id"]==A and not items(v)[st]["reserve"] and not items(v)[st]["delivery_create"],json.dumps(v))
    q.execute("UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true")
    v=cap(actor,os_,[st]);check("GATE_OPEN_NO_GRANT_CLOSED",not items(v)[st]["reserve"] and not items(v)[st]["delivery_create"])
    def grant(op,stock,uid=actor,org=A,valid="now()+interval '1 hour'"):
        q.execute(f"INSERT INTO platform_private.resale_pilot_allowlist_v1(gate,operation,actor_id,organization_id,partner_id,order_id,order_item_id,product_id,stock_id,valid_until) VALUES('b2b_resale',%s,%s,%s,%s,%s,%s,%s,%s,{valid}) RETURNING id",(op,uid,org,pa,po,item,prod,stock));return q.fetchone()[0]
    g1=grant("reserve",st)
    v=cap(actor,os_,[st,st2]);it=items(v)
    check("EXACT_GRANT_RESERVE_ONLY",it[st]["reserve"] and not it[st]["delivery_create"] and not it[st2]["reserve"],json.dumps(it))
    v=cap(noreserve,os_,[st]);check("ACTOR_WITHOUT_STOCK_PERMISSION",not items(v)[st]["reserve"])
    v=cap(foreign_actor,os_,[st]);check("FOREIGN_ACTOR_CLOSED_ENVELOPE",v["organization_id"] is None and v["items"]==[])
    v=cap(actor,fos,[fst]);check("FOREIGN_OS_CLOSED",v["organization_id"] is None)
    v=cap(actor,os_,[st,fst]);check("FOREIGN_STOCK_CLOSED",v["organization_id"] is None and v["items"]==[])
    v=cap(None,os_,[st]);check("NO_AUTH_CLOSED",v["organization_id"] is None)
    v=cap(actor,os_,[st,st]);check("DUPLICATE_STOCK_CLOSED",v["organization_id"] is None)
    g2=grant("delivery_create",st);v=cap(actor,os_,[st]);check("DELIVERY_CREATE_EXACT",items(v)[st]["delivery_create"])
    q.execute("UPDATE platform_private.resale_pilot_allowlist_v1 SET revoked_at=clock_timestamp() WHERE id=%s",(g2,))
    v=cap(actor,os_,[st]);check("REVOKED_DELIVERY_CLOSED",not items(v)[st]["delivery_create"] and items(v)[st]["reserve"])
    q.execute("UPDATE platform_private.resale_pilot_allowlist_v1 SET valid_until=valid_from+interval '1 millisecond' WHERE id=%s",(g1,));time.sleep(0.01)
    v=cap(actor,os_,[st]);check("EXPIRED_RESERVE_CLOSED",not items(v)[st]["reserve"])
    q.execute("UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false");grant("reserve",st)
    v=cap(actor,os_,[st]);check("GATE_OFF_OVERRIDES_GRANT",not items(v)[st]["reserve"])
    q.execute("UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true")
    # Timeout incerto: baseline, reserva em outra conexão ainda não confirmada, depois commit.
    base=items(cap(actor,os_,[st]))[st]["reserved_for_os"];check("BASELINE_ZERO",float(base)==0)
    w=conn();wc=w.cursor();wc.execute("BEGIN")
    wc.execute("INSERT INTO public.estoque_produto VALUES(%s,%s,%s,'compra','reservado',3,3,%s)",(U(),A,prod,os_));wc.execute("UPDATE public.estoque_produto SET quantidade=7 WHERE id=%s",(st,))
    mid=items(cap(actor,os_,[st]))[st]["reserved_for_os"];check("IN_FLIGHT_NOT_ADOPTED",float(mid)==0,"ainda incerto: sem nova reserva")
    q.execute("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.pid<>pg_backend_pid() AND l.mode='RowExclusiveLock'");check("WRITER_TX_OPEN",q.fetchone()[0]>=1)
    wc.execute("COMMIT")
    after=items(cap(actor,os_,[st]))[st]["reserved_for_os"];check("RECONCILE_DELTA_EQUALS_REQUEST",float(after)-float(base)==3,str(after))
    q.execute("INSERT INTO public.estoque_produto VALUES(%s,%s,%s,'compra','reservado',2,2,%s)",(U(),A,prod,os_))
    after2=items(cap(actor,os_,[st]))[st]["reserved_for_os"];check("PARTIAL_SECOND_RESERVATION_ACCUMULATES",float(after2)==5)
    q.execute("SELECT n_tup_ins+n_tup_upd+n_tup_del FROM pg_stat_xact_user_tables WHERE relname='estoque_produto'")
    q.execute("SELECT pg_stat_clear_snapshot()");q.execute("SELECT sum(n_tup_ins+n_tup_upd+n_tup_del) FROM pg_stat_user_tables");before_w=q.fetchone()[0]
    for _ in range(3): cap(actor,os_,[st,st2])
    time.sleep(0.6);q.execute("SELECT pg_stat_clear_snapshot()");q.execute("SELECT sum(n_tup_ins+n_tup_upd+n_tup_del) FROM pg_stat_user_tables");check("CAPABILITY_WRITES_NOTHING",q.fetchone()[0]==before_w)
    q.execute("SELECT has_function_privilege('anon','public.rpc_b2b_resale_delivery_capability_v1(uuid,uuid[])','EXECUTE'),has_function_privilege('authenticated','platform_private.resale_pilot_scope_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE'),has_function_privilege('authenticated','public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb)','EXECUTE')")
    check("ACL_ANON_HELPER_WRITER_CLOSED",q.fetchone()==(False,False,False))
    q.execute("UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false")
    q.execute((HERE/"04-rollback-deny.sql.review").read_text())
    try: cap(actor,os_,[st]);check("ROLLBACK_REVOKES",False)
    except psycopg2.Error as e: check("ROLLBACK_REVOKES","permission denied" in str(e)); c.rollback() if not c.autocommit else None
    q=c.cursor();q.execute("SELECT count(*) FROM platform_private.resale_pilot_allowlist_v1");check("ROLLBACK_PRESERVES_HISTORY",q.fetchone()[0]==4)
finally:
    sh("pg_ctl","-D",str(d/"db"),"-m","fast","stop");shutil.rmtree(d,ignore_errors=True)
out={"seams":SEAMS,"results":R,"failed":fail,"files":{f:hashlib.sha256((HERE/f).read_bytes()).hexdigest() for f in ["01-pre.sql.readonly","02-install.sql.review","03-post.sql.readonly","04-rollback-deny.sql.review"]}}
(HERE/"evidence").mkdir(exist_ok=True);(HERE/"evidence/db-results.json").write_text(json.dumps(out,indent=1,ensure_ascii=False))
print(f"TOTAL {len(R)-fail}/{len(R)}");sys.exit(1 if fail else 0)
