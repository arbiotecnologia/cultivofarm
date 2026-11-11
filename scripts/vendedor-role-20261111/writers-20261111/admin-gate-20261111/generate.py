#!/usr/bin/env python3
"""Gera 01d/02d/03d/04d do gate administrativo da carteira a partir do estado 02b+02c medido no espelho descartável.
Pins: MD5 LIVE (pós-02c) e candidato, ACL por conjunto aclexplode+owner. Nunca conecta a banco hospedado."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;W=H.parent;sys.path.insert(0,str(W))
import mirror_db,catalog_reconcile as C
REPLACED=['public.admin_assign_seller_portfolio_v1(uuid,uuid,text)','public.admin_revoke_seller_portfolio_v1(uuid,text)',
          'public.admin_list_seller_portfolio_v1()','public.admin_seller_portfolio_overview_v1()']
NEW=['platform_private.seller_admin_actor_org()','platform_private.seller_assignee_eligible(uuid,uuid)']
REF="swzpzcwiasxmjutrmvkm"
def setup(port):
    d=mirror_db.DB(port)
    d.sql((W.parent/'02a-install-enum.sql.review').read_text());d.sql((W.parent/'02b-install.sql.review').read_text())
    C.reconcile(d);C.align_acl(d)
    r=d.raw("SET app.expected_ref='%s';"%REF+(W/'02c-install-writers.sql.review').read_text());assert r.returncode==0,r.stderr[-800:]
    return d
def ref(tag): return f" IF current_setting('app.expected_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'VENDA_{tag}_REF_UNPROVEN'; END IF;\n"
def pin(sig,m,tag): return f" IF md5(pg_get_functiondef('{sig}'::regprocedure)) IS DISTINCT FROM '{m}' THEN RAISE EXCEPTION 'VENDA_{tag}_DRIFT:{sig}'; END IF;\n"
def aclpin(sig,a,tag): return f" IF ({C.acl_set_sql(sig)}) IS DISTINCT FROM '{a}' THEN RAISE EXCEPTION 'VENDA_{tag}_ACL_DRIFT:{sig}'; END IF;\n"
def absent(sig,tag): return f" IF to_regprocedure('{sig}') IS NOT NULL THEN RAISE EXCEPTION 'VENDA_{tag}_ALREADY_PRESENT:{sig}'; END IF;\n"
def main():
    d=setup(55801)
    live={s:dict(md5=d.md5(s),acl=C.acl_set(d,s),body=d.body(s)) for s in REPLACED}
    for s in NEW: assert d.last(f"select to_regprocedure('{s}') is null")=='t'
    cand=(H/'candidate.sql').read_text()
    d.sql("BEGIN;"+cand+"COMMIT;")
    cm={s:dict(md5=d.md5(s),acl=C.acl_set(d,s)) for s in REPLACED+NEW}
    for s in REPLACED: assert cm[s]['acl']==live[s]['acl'],('ACL mudou com CREATE OR REPLACE',s)
    prechk="".join(pin(s,live[s]['md5'],'PRE')+aclpin(s,live[s]['acl'],'PRE') for s in REPLACED)+"".join(absent(s,'PRE') for s in NEW)
    postchk="".join(pin(s,cm[s]['md5'],'POST')+aclpin(s,cm[s]['acl'],'POST') for s in REPLACED+NEW)
    pre="-- READ ONLY. SET app.expected_ref='swzpzcwiasxmjutrmvkm' antes. Requer 02b+02c instalados e sem drift.\nDO $pre$ BEGIN\n"+ref('PRE')+prechk+" RAISE NOTICE 'VENDA_PRE_PASS';\nEND $pre$;\n"
    inst=("-- REVISÃO: aplicar só pelo auditor após VENDA_PRE_PASS. Transação única; recusa reexecução.\nBEGIN;\nSET LOCAL lock_timeout='3s';\nDO $pre$ BEGIN\n"+ref('PRE')+prechk+"END $pre$;\n"
          +cand+"DO $post$ BEGIN\n"+postchk+"END $post$;\nCOMMIT;\n")
    post="-- READ ONLY.\nDO $post$ BEGIN\n"+ref('POST')+postchk+" RAISE NOTICE 'VENDA_POST_PASS';\nEND $post$;\n"
    restore="".join(live[s]['body'].rstrip('\n')+";\n" for s in REPLACED)
    rb=("-- REVISÃO: deny-free rollback ao corpo 02b/02c medido. Só executa se o estado for exatamente o candidato.\nBEGIN;\nSET LOCAL lock_timeout='3s';\nDO $rb$ BEGIN\n"+ref('RB')
        +"".join(pin(s,cm[s]['md5'],'RB')+aclpin(s,cm[s]['acl'],'RB') for s in REPLACED+NEW)+"END $rb$;\n"
        +restore+"DROP FUNCTION platform_private.seller_assignee_eligible(uuid,uuid);\nDROP FUNCTION platform_private.seller_admin_actor_org();\n"
        +"DO $p$ BEGIN\n"+"".join(pin(s,live[s]['md5'],'RBPOST')+aclpin(s,live[s]['acl'],'RBPOST') for s in REPLACED)+"".join(absent(s,'RBPOST') for s in NEW)+"END $p$;\nCOMMIT;\n")
    files={'01d-pre-admin-gate.sql.readonly':pre,'02d-install-admin-gate.sql.review':inst,'03d-post-admin-gate.sql.readonly':post,'04d-rollback-admin-gate.sql.review':rb}
    for n,t in files.items(): (H/n).write_text(t)
    man=dict(base='02b+02c instalados no espelho composto (catálogo 6b56cfb1, ACL de produção)',
      live={s:dict(md5=live[s]['md5'],acl=live[s]['acl']) for s in REPLACED},candidate=cm,
      candidate_sql_sha256=hashlib.sha256((H/'candidate.sql').read_bytes()).hexdigest(),
      files={n:hashlib.sha256((H/n).read_bytes()).hexdigest() for n in files})
    (H/'manifest.json').write_text(json.dumps(man,indent=1,ensure_ascii=False)+"\n");print(json.dumps(man['files'],indent=1))
if __name__=='__main__': main()
