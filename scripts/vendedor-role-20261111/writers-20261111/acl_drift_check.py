"""Prova no espelho que o PRE final (bytes exatos) passa com ACL real em ordem textual diferente e falha com membro extra/grant option. Nunca hospedado."""
import sys,json,hashlib;from pathlib import Path;H=Path(__file__).resolve().parent;sys.path.insert(0,str(H))
import mirror_db,catalog_reconcile as C
d=mirror_db.DB(55771)
for f in ['02a-install-enum.sql.review','02b-install.sql.review']: d.sql((H.parent/f).read_text())
C.reconcile(d);C.align_acl(d)
pre=(H/'01c-pre-writers.sql.readonly').read_text();sha=hashlib.sha256(pre.encode()).hexdigest()
run=lambda x: d.raw(x+"SET app.expected_ref='swzpzcwiasxmjutrmvkm';\n"+pre)
S='public.get_partner_catalog_secure(uuid)';G='platform_private.b2b_internal_assert_origin(jsonb,uuid,uuid)'
res={}
r=run('');res['pre_pass_base']=r.returncode==0 and 'VENDW_PRE_PASS' in r.stdout
# mesma ACL como conjunto, ordem textual diferente (revoga e regrava authenticated antes de service_role)
d.sql(f"REVOKE EXECUTE ON FUNCTION {S} FROM service_role; GRANT EXECUTE ON FUNCTION {S} TO service_role;")
res['ordem_textual']=d.last(f"select proacl::text from pg_proc where oid='{S}'::regprocedure")
r=run('');res['pre_pass_ordem_diferente']=r.returncode==0
r=run(f"BEGIN; GRANT EXECUTE ON FUNCTION {S} TO anon;\n");res['pre_falha_membro_extra']=r.returncode!=0 and 'VENDW_PRE_ACL_DRIFT' in r.stderr
r=run(f"BEGIN; GRANT EXECUTE ON FUNCTION {G} TO service_role WITH GRANT OPTION;\n");res['pre_falha_grant_option']=r.returncode!=0 and 'VENDW_PRE_ACL_DRIFT' in r.stderr
r=run(f"BEGIN; REVOKE EXECUTE ON FUNCTION {G} FROM service_role;\n");res['pre_falha_membro_ausente']=r.returncode!=0 and 'VENDW_PRE_ACL_DRIFT' in r.stderr
d2=d.body(S).replace("PERFORM platform_private.b2b_partner_catalog_reader(p_partner_id);","PERFORM 1;")
r=d.raw("BEGIN;\n"+d2+";\nSET app.expected_ref='swzpzcwiasxmjutrmvkm';\n"+pre);res['pre_falha_catalogo_antigo_sem_leitor']=r.returncode!=0 and 'VENDW_PRE_DRIFT:public.get_partner_catalog_secure' in r.stderr
out=dict(pre_sha256=sha,results=res,all_pass=all(v for k,v in res.items() if k!='ordem_textual'))
(H/'evidence/acl-drift-check.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n');print(json.dumps(out,indent=1))
