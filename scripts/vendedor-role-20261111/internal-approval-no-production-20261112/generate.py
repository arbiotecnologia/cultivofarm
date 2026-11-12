#!/usr/bin/env python3
"""Gera 01f/02f/03f/04f para approve_partner_order a partir do espelho composto descartável (+02e). Nunca hospedado."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;W=H.parent/'writers-20261111';E=H.parent/'gestor-capability-reader-20261112'
sys.path.insert(0,str(W));sys.path.insert(0,str(E))
import mirror_db, generate as G
SIG='public.approve_partner_order(uuid,text,date)';LIVE='0d3b85049e3b3b799ba81b4cb95be0da'
A1="ready_for_production = CASE WHEN c2_external_origin_snapshot IS NOT NULL THEN false ELSE true END, updated_at = now()"
B1="ready_for_production = (c2_external_origin_snapshot IS NULL AND internal_origin_snapshot IS NULL), updated_at = now()"
A2="(v_final_ready IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_order_id AND c2_external_origin_snapshot IS NOT NULL AND internal_economic_snapshot IS NOT NULL))"
B2=("(v_final_ready IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_order_id AND status='aprovado' AND ready_for_production IS FALSE"
    " AND (c2_external_origin_snapshot IS NOT NULL OR internal_origin_snapshot IS NOT NULL) AND internal_economic_snapshot IS NOT NULL"
    " AND internal_economic_snapshot->>'schema_version'='1' AND internal_economic_snapshot->'origin' IS NOT DISTINCT FROM COALESCE(internal_origin_snapshot,c2_external_origin_snapshot)"
    " AND internal_economic_snapshot->>'sealed_by'=v_uid::text))"
    " OR (v_final_ready IS TRUE AND EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_order_id AND (c2_external_origin_snapshot IS NOT NULL OR internal_origin_snapshot IS NOT NULL)))")
A3="WHERE id=p_order_id AND c2_external_origin_snapshot IS NOT NULL)\n            THEN 'Seu pedido recebeu aprovação comercial. Planejamento de produção ainda não liberado.'"
B3="WHERE id=p_order_id AND (c2_external_origin_snapshot IS NOT NULL OR internal_origin_snapshot IS NOT NULL))\n            THEN 'Seu pedido recebeu aprovação comercial. Planejamento de produção ainda não liberado.'"
ACL_SQL=G.ACL_SQL
def prepare(d):
    G.prepare(d)
    b=(E/'02e-install.sql.review').read_bytes();assert hashlib.sha256(b).hexdigest()==json.loads((E/'manifest.json').read_text())['files']['02e-install.sql.review']
    r=d.raw("SET app.expected_ref='swzpzcwiasxmjutrmvkm';"+b.decode())
    if r.returncode: raise RuntimeError(r.stderr[-800:])
    assert d.md5(G.SIG)==json.loads((E/'manifest.json').read_text())['candidate']
def main():
    d=mirror_db.DB(55811);prepare(d)
    assert d.md5(SIG)==LIVE,d.md5(SIG)
    body=d.body(SIG);acl=d.last("SELECT "+ACL_SQL(SIG)+";")
    cand=body
    for a,b in [(A1,B1),(A2,B2),(A3,B3)]:
        assert cand.count(a)==1,a[:60];cand=cand.replace(a,b)
    d.sql(cand+";");cmd5=d.md5(SIG);assert d.last("SELECT "+ACL_SQL(SIG)+";")==acl
    gcap=json.loads((E/'manifest.json').read_text())['candidate']
    pin=lambda tag,s,m:f" IF md5(pg_get_functiondef('{s}'::regprocedure)) IS DISTINCT FROM '{m}' THEN RAISE EXCEPTION '{tag}:{s}'; END IF;\n"
    aclp=lambda tag,s,a:f" IF {ACL_SQL(s)} IS DISTINCT FROM '{a}' THEN RAISE EXCEPTION '{tag}:{s}'; END IF;\n"
    ref=" IF current_setting('app.expected_ref',true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'IAP_PRE_REF_UNPROVEN'; END IF;\n"
    guard='platform_private.b2b_internal_order_snapshot_guard()';gmd5=d.md5(guard)
    pre=ref+pin('IAP_PRE_DRIFT',SIG,LIVE)+pin('IAP_PRE_GCAP',G.SIG,gcap)+pin('IAP_PRE_GUARD',guard,gmd5)+aclp('IAP_PRE_ACL',SIG,acl)
    files={
     '01f-pre.sql.readonly':"-- READ ONLY. SET app.expected_ref='swzpzcwiasxmjutrmvkm' antes. Exige 02e instalado. Falha fechada.\nDO $pre$ BEGIN\n"+pre+" RAISE NOTICE 'IAP_PRE_PASS';\nEND $pre$;\nSELECT 'IAP_PRE_PASS';\n",
     '02f-install.sql.review':"-- REVIEW ONLY. approve_partner_order: origem interna/externa aprova sem liberar produção; ACL preservada.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nDO $pre$ BEGIN\n"+pre+"END $pre$;\n"+cand+";\nDO $post$ BEGIN\n"+pin('IAP_POST_DRIFT',SIG,cmd5)+aclp('IAP_POST_ACL',SIG,acl)+"END $post$;\nCOMMIT;\n",
     '03f-post.sql.readonly':"-- READ ONLY.\nDO $p$ BEGIN\n"+pin('IAP_POST_DRIFT',SIG,cmd5)+pin('IAP_POST_GUARD',guard,gmd5)+aclp('IAP_POST_ACL',SIG,acl)+"END $p$;\nSELECT 'IAP_POST_PASS';\n",
     '04f-rollback.sql.review':"-- REVIEW ONLY. Reinstala o corpo LIVE "+LIVE[:8]+" só se encontrar o candidato; pedidos/aprovações preservados.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nDO $rb$ BEGIN\n"+pin('IAP_RB_DRIFT',SIG,cmd5)+"END $rb$;\n"+body+";\nDO $p$ BEGIN\n"+pin('IAP_RB_FAIL',SIG,LIVE)+aclp('IAP_RB_ACL',SIG,acl)+"END $p$;\nCOMMIT;\n"}
    for n,t in files.items(): (H/n).write_text(t)
    man=dict(sig=SIG,live=LIVE,candidate=cmd5,acl=acl,requires_02e=gcap,guard=guard,guard_md5=gmd5,files={n:hashlib.sha256((H/n).read_bytes()).hexdigest() for n in files})
    (H/'manifest.json').write_text(json.dumps(man,indent=2)+'\n');print(json.dumps(man,indent=1))
if __name__=='__main__':main()
