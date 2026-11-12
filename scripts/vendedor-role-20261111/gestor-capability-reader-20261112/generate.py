#!/usr/bin/env python3
"""Gera 01e/02e/03e/04e a partir do espelho composto descartável (02b+catálogo 6b56cfb1+02c+02d). Nunca hospedado."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;W=H.parent/'writers-20261111';sys.path.insert(0,str(W))
import mirror_db, catalog_reconcile as C
SIG="public.c2_internal_order_entry_capability_v1()";LIVE='e2619c71becfebf38c8d03562ff11ce2'
OLD="'b5684d350603d1db77ab9f1db0f4b253'";READER='public.get_partner_catalog_secure(uuid)';NEW_READER='66899286c74a3a2c662abf5a0b275d5a'
ACL_SQL=lambda s:f"(SELECT coalesce((SELECT string_agg(x,',' ORDER BY x) FROM (SELECT format('%s>%s:%s:%s',pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) x FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) q),'')||'|'||pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid='{s}'::regprocedure)"
def prepare(d):
    d.sql((H.parent/'02a-install-enum.sql.review').read_text());d.sql((H.parent/'02b-install.sql.review').read_text())
    C.reconcile(d);C.align_acl(d)
    for f in ['writers-20261111/02c-install-writers.sql.review','writers-20261111/admin-gate-20261111/02d-install-admin-gate.sql.review']:
        r=d.raw("SET app.expected_ref='swzpzcwiasxmjutrmvkm';"+(H.parent/f).read_text())
        if r.returncode: raise RuntimeError(f+r.stderr[-800:])
def main():
    d=mirror_db.DB(55791);prepare(d)
    assert d.md5(SIG)==LIVE and d.md5(READER)==NEW_READER,(d.md5(SIG),d.md5(READER))
    body=d.body(SIG);assert body.count(OLD)==1
    acl=d.last("SELECT "+ACL_SQL(SIG)+";")
    cand=body.replace(OLD,f"'{NEW_READER}'")
    d.sql(cand+";");cmd5=d.md5(SIG);assert d.last("SELECT "+ACL_SQL(SIG)+";")==acl
    pin=lambda tag,s,m:f" IF md5(pg_get_functiondef('{s}'::regprocedure)) IS DISTINCT FROM '{m}' THEN RAISE EXCEPTION '{tag}:{s}'; END IF;\n"
    aclp=lambda tag,s,a:f" IF {ACL_SQL(s)} IS DISTINCT FROM '{a}' THEN RAISE EXCEPTION '{tag}:{s}'; END IF;\n"
    ref=" IF current_setting('app.expected_ref',true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'GCAP_PRE_REF_UNPROVEN'; END IF;\n"
    pre=ref+pin('GCAP_PRE_DRIFT',SIG,LIVE)+pin('GCAP_PRE_READER',READER,NEW_READER)+aclp('GCAP_PRE_ACL',SIG,acl)
    files={
     '01e-pre.sql.readonly':"-- READ ONLY. SET app.expected_ref='swzpzcwiasxmjutrmvkm' antes. Falha fechada.\nDO $pre$ BEGIN\n"+pre+" RAISE NOTICE 'GCAP_PRE_PASS';\nEND $pre$;\nSELECT 'GCAP_PRE_PASS';\n",
     '02e-install.sql.review':"-- REVIEW ONLY. Troca somente o pin do leitor de catálogo (b5684d35 -> "+NEW_READER[:8]+"). ACL preservada por CREATE OR REPLACE.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nDO $pre$ BEGIN\n"+pre+"END $pre$;\n"+cand+";\nDO $post$ BEGIN\n"+pin('GCAP_POST_DRIFT',SIG,cmd5)+aclp('GCAP_POST_ACL',SIG,acl)+"END $post$;\nCOMMIT;\n",
     '03e-post.sql.readonly':"-- READ ONLY.\nDO $p$ BEGIN\n"+pin('GCAP_POST_DRIFT',SIG,cmd5)+pin('GCAP_POST_READER',READER,NEW_READER)+aclp('GCAP_POST_ACL',SIG,acl)+"END $p$;\nSELECT 'GCAP_POST_PASS';\n",
     '04e-rollback.sql.review':"-- REVIEW ONLY. Reinstala o corpo LIVE e2619c71 só se encontrar o candidato.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nDO $rb$ BEGIN\n"+pin('GCAP_RB_DRIFT',SIG,cmd5)+"END $rb$;\n"+body+";\nDO $p$ BEGIN\n"+pin('GCAP_RB_FAIL',SIG,LIVE)+aclp('GCAP_RB_ACL',SIG,acl)+"END $p$;\nCOMMIT;\n"}
    for n,t in files.items(): (H/n).write_text(t)
    man=dict(sig=SIG,live=LIVE,candidate=cmd5,acl=acl,reader=READER,reader_pinned_old='b5684d350603d1db77ab9f1db0f4b253',reader_pinned_new=NEW_READER,
      files={n:hashlib.sha256((H/n).read_bytes()).hexdigest() for n in files})
    (H/'manifest.json').write_text(json.dumps(man,indent=2)+'\n');print(json.dumps(man,indent=1))
if __name__=='__main__':main()
