"""Gera o delta revisável de writers do Vendedor a partir dos corpos reconstituídos (pg_get_functiondef no espelho).
Cada patch é âncora exata (contagem conferida). Nunca acessa banco hospedado. Saída: 02c-install-writers.sql.review,
03c-post-writers.sql.readonly, 04c-rollback-writers.sql.review, manifest.json."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;sys.path.insert(0,str(H))
SEL="(platform_private.seller_commercial_actor() IS TRUE AND platform_private.seller_commercial_target_reason({u},{p}) IS NULL)"
def P(u,p): return SEL.format(u=u,p=p)
PO="(SELECT po_v.partner_id FROM public.partner_orders po_v WHERE po_v.id=p_order_id)"
# (assinatura, md5 LIVE/reconstituído, auditor_confirmado, [(âncora, substituição, contagem)])
TARGETS=[
("platform_private.c2_order_actor_scope(uuid,uuid)","54c4327d63f48e39f598129ff9dd8f09",False,[
 ("    RETURN;\n  END IF;\n  IF public.has_role(_uid,'parceiro_b2b_tecnico'",
  "    RETURN;\n  END IF;\n  -- SELLER_PORTFOLIO_V1: vendedor exclusivo somente para parceiro atribuído explicitamente na própria empresa.\n  IF platform_private.seller_commercial_actor() IS TRUE AND auth.uid() IS NOT DISTINCT FROM _uid THEN\n    r := platform_private.seller_commercial_target_reason(_uid,_partner);\n    IF r IS NOT NULL OR _partner IS NULL THEN\n      RAISE EXCEPTION 'C2_SELLER_TARGET_DENIED:%', COALESCE(r,'target_required') USING ERRCODE='42501';\n    END IF;\n    RETURN;\n  END IF;\n  IF public.has_role(_uid,'parceiro_b2b_tecnico'",1)]),
("platform_private.c2_owner_order_guard(uuid,uuid,uuid)","01d6cb10289af56ecfdbb38e43646e3a",False,[
 ("     OR public.has_role(_uid,'gestor_comercial'::public.app_role) THEN\n    RETURN;",
  "     OR public.has_role(_uid,'gestor_comercial'::public.app_role)\n     OR "+P('_uid','_partner')+" THEN\n    RETURN;",1)]),
("platform_private.commercial_plan_partner_visible(uuid,uuid)","df00b1478d8214bc9a17d63d841b24c4",False,[
 ("   p.organization_id=platform_private.commercial_plan_actor_organization()\n",
  "   p.organization_id=platform_private.commercial_plan_actor_organization()\n   -- seller_portfolio_v1: vendedor exclusivo vê só planos publicados para parceiro atribuído da própria empresa.\n   OR ("+P('auth.uid()','p_partner_id')+" AND p.organization_id=public.h15_actor_organization() AND EXISTS(\n     SELECT 1 FROM public.commercial_payment_plan_assignments sa WHERE sa.plan_id=p.id AND sa.partner_id=p_partner_id AND sa.buyer_scope='partner' AND sa.status='published'\n     AND sa.valid_from<=CURRENT_DATE AND (sa.valid_until IS NULL OR sa.valid_until>=CURRENT_DATE)))\n",1)]),
("public.rpc_b2b_list_selectable_payment_plans()","5bceeda188eee7525172eadeed17f7c0",False,[
 ("  IF NOT (v_admin OR public.has_role(v_uid,'parceiro_b2b'::app_role)) THEN",
  "  IF NOT (v_admin OR public.has_role(v_uid,'parceiro_b2b'::app_role) OR platform_private.seller_commercial_actor() IS TRUE) THEN",1),
 ("    AND ((v_admin AND p.organization_id = v_org) OR platform_private.commercial_plan_buyer_visible(p.id, v_uid))",
  "    AND ((v_admin AND p.organization_id = v_org) OR platform_private.commercial_plan_buyer_visible(p.id, v_uid)\n      -- seller_portfolio_v1: somente planos publicados para parceiros da carteira própria.\n      OR (platform_private.seller_commercial_actor() IS TRUE AND p.organization_id = public.h15_actor_organization() AND EXISTS(\n        SELECT 1 FROM public.commercial_payment_plan_assignments sa WHERE sa.plan_id=p.id AND sa.buyer_scope='partner' AND sa.status='published'\n        AND sa.valid_from<=CURRENT_DATE AND (sa.valid_until IS NULL OR sa.valid_until>=CURRENT_DATE)\n        AND platform_private.seller_commercial_target_reason(v_uid, sa.partner_id) IS NULL)))",1)]),
("platform_private.c2_external_origin_assert(jsonb,uuid,uuid)","999e5e9fd9887595e252523fb2142726",False,[
 ("  IF public.h15_actor_organization() IS DISTINCT FROM org OR NOT platform_private.c2p1_settings_allowed(partner,true)\n",
  "  IF public.h15_actor_organization() IS DISTINCT FROM org OR NOT (platform_private.c2p1_settings_allowed(partner,true)\n     -- seller_portfolio_v1: só dentro da transação de resposta de cotação do vendedor (ticket txid) e com vínculo vigente.\n     OR (platform_private.has_ticket('seller_quote_respond',partner) AND "+P('uid','partner')+"))\n",1)]),
("public.get_partner_catalog_secure(uuid)","b5684d350603d1db77ab9f1db0f4b253",False,[
 ("                AND platform_private.c2_internal_order_target_reason(v_uid, p_partner_id) IS NULL) THEN",
  "                AND platform_private.c2_internal_order_target_reason(v_uid, p_partner_id) IS NULL)\n       AND NOT "+P('v_uid','p_partner_id')+" THEN",1),
 ("    ELSIF NOT (public.has_role(v_uid,'administrador'::app_role) OR public.has_role(v_uid,'gestor_comercial'::app_role)) THEN",
  "    ELSIF NOT (public.has_role(v_uid,'administrador'::app_role) OR public.has_role(v_uid,'gestor_comercial'::app_role)\n               OR "+P('v_uid','p_partner_id')+") THEN",1)]),
("platform_private.b2b_partner_catalog_reader(uuid)","bd985484b69c8fa6e63a920eff518369",False,[
 ("  v_internal := public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'gestor_comercial'::public.app_role) IS TRUE;",
  "  v_internal := public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'gestor_comercial'::public.app_role) IS TRUE\n    OR "+P('v_uid','p_partner_id')+";",1),
 ("    IF platform_private.b2b_internal_commercial_actor() IS NOT TRUE\n       OR platform_private.c2_internal_order_target_reason(v_uid, p_partner_id) IS NOT NULL THEN",
  "    IF NOT ((platform_private.b2b_internal_commercial_actor() IS TRUE\n       AND platform_private.c2_internal_order_target_reason(v_uid, p_partner_id) IS NULL)\n       OR "+P('v_uid','p_partner_id')+") THEN",1)]),
("platform_private.c2_partner_order_attempt_authz(uuid,uuid)","e15d9fccd42c67caf51b15122a61270d",False,[
 ("                OR public.has_role(p_uid,'gestor_comercial'::public.app_role);",
  "                OR public.has_role(p_uid,'gestor_comercial'::public.app_role)\n                OR "+P('p_uid','p_partner_id')+";",1)]),
("public.simulate_b2b_payment_condition_secure(uuid,uuid,jsonb,jsonb)","06ea0933992a05a0d2a7fb78c6881bcf",False,[
 ("  v_is_gestor  := has_role(v_uid,'gestor_comercial'::app_role);",
  "  v_is_gestor  := has_role(v_uid,'gestor_comercial'::app_role) OR "+P('v_uid','p_partner_id')+"; -- seller_portfolio_v1",1)]),
("public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)","6e81e29397a9bd633f2fe6ec364d8cf3",False,[
 ("  v_is_gestor  := has_role(v_uid,'gestor_comercial'::app_role);",
  "  v_is_gestor  := has_role(v_uid,'gestor_comercial'::app_role) OR "+P('v_uid','p_partner_id')+"; -- seller_portfolio_v1",1)]),
("public.create_partner_order_condition_secure(uuid,text,jsonb,date,uuid,text,text,jsonb)","e86385fefb25c68d9dd4d0fef6619f27",True,[
 ("  v_is_gestor       := has_role(v_uid,'gestor_comercial'::app_role);",
  "  v_is_gestor       := has_role(v_uid,'gestor_comercial'::app_role) OR "+P('v_uid','p_partner_id')+"; -- seller_portfolio_v1",1),
 ("  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || v_idem, 0));",
  "  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || v_idem, 0));\n  -- seller_portfolio_v1: vínculo travado (FOR SHARE) e revalidado após as esperas; revogação concorrente serializa.\n  IF platform_private.seller_commercial_actor() IS TRUE THEN PERFORM platform_private.seller_portfolio_lock(v_uid, p_partner_id); END IF;",1)]),
("public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)","fe82f5381d426136f2627803f3b0005d",True,[
 ("  v_is_gestor       := has_role(v_uid,'gestor_comercial'::app_role);",
  "  v_is_gestor       := has_role(v_uid,'gestor_comercial'::app_role) OR "+P('v_uid','p_partner_id')+"; -- seller_portfolio_v1",1),
 ("  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || v_idem, 0));",
  "  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || v_idem, 0));\n  -- seller_portfolio_v1: vínculo travado (FOR SHARE) e revalidado após as esperas; revogação concorrente serializa.\n  IF platform_private.seller_commercial_actor() IS TRUE THEN PERFORM platform_private.seller_portfolio_lock(v_uid, p_partner_id); END IF;",1)]),
("platform_private.b2b_internal_order_snapshot_guard()","1c342be2cdaf7bf458a3cd1aa15e7ba5",False,[
 ("  IF org IS NULL OR NOT public.fn_cc_can_prepare(uid) OR NOT public._saas_user_has_feature(uid,'pedidos_b2b') THEN RAISE EXCEPTION 'B2B_INTERNAL_ACTOR_DENIED'",
  "  IF org IS NULL OR NOT (public.fn_cc_can_prepare(uid) OR "+P('uid','NEW.partner_id')+") OR NOT public._saas_user_has_feature(uid,'pedidos_b2b') THEN RAISE EXCEPTION 'B2B_INTERNAL_ACTOR_DENIED'",1)]),
("platform_private.b2b_internal_assert_origin(jsonb,uuid,uuid)","6bbb61aa5899b18d13ac55d4f76f45e1",False,[
 (" IF org IS NULL OR NOT public.fn_cc_can_prepare(uid) OR",
  " IF org IS NULL OR NOT (public.fn_cc_can_prepare(uid) OR "+P('uid','partner')+") OR",1)]),
("public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)","97bcdb9884b54adb3bd4aae4915e32d0",True,[
 ("platform_private.b2b_owner_internal_partner_readable("+PO+")",
  "platform_private.b2b_owner_internal_partner_readable("+PO+") OR "+P('auth.uid()',PO),3),
 ("  v_is_gestor := has_role(v_uid,'gestor_comercial'::app_role);\n",
  "  v_is_gestor := has_role(v_uid,'gestor_comercial'::app_role) OR "+P('v_uid',PO)+"; -- seller_portfolio_v1\n",1),
 ("v_is_admin := has_role(v_uid,'administrador'::app_role); v_is_gestor := has_role(v_uid,'gestor_comercial'::app_role);",
  "v_is_admin := has_role(v_uid,'administrador'::app_role); v_is_gestor := has_role(v_uid,'gestor_comercial'::app_role) OR "+P('v_uid','v_order.partner_id')+";\n  -- seller_portfolio_v1: após FOR UPDATE do pedido, trava e revalida o vínculo da carteira.\n  IF platform_private.seller_commercial_actor() IS TRUE THEN\n    PERFORM platform_private.seller_portfolio_lock(v_uid, v_order.partner_id);\n  END IF;",1),
 ("  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;\n  -- Origem externa e interna",
  "  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;\n  -- seller_portfolio_v1: ticket txid só para o vendedor exclusivo; a origem externa ainda exige vínculo vigente da carteira.\n  IF platform_private.seller_commercial_actor() IS TRUE THEN\n    INSERT INTO platform_private.authz_tickets(txid,scope,target) SELECT txid_current(),'seller_quote_respond',po_t.partner_id FROM public.partner_orders po_t WHERE po_t.id=p_order_id;\n  END IF;\n  -- Origem externa e interna",1),
 ("      RETURN v_result;","      DELETE FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope='seller_quote_respond';\n      RETURN v_result;",1),
 ("  RETURN v_result;\nEND","  DELETE FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope='seller_quote_respond';\n  RETURN v_result;\nEND",1),
 ("    IF NOT (has_role(v_uid,'administrador'::app_role) OR has_role(v_uid,'gestor_comercial'::app_role)) THEN",
  "    IF NOT (has_role(v_uid,'administrador'::app_role) OR has_role(v_uid,'gestor_comercial'::app_role) OR "+P('v_uid','v_order.partner_id')+") THEN",1)]),
]
CAP=("public.c2_internal_order_entry_capability_v1()","e2619c71becfebf38c8d03562ff11ce2",True)
HELPERS=(H/'helpers.sql').read_text()
def lit(s):
    tag='$vend$';assert tag not in s;return tag+s+tag
def build(db):
    out={};patched={}
    for sig,m,conf,reps in TARGETS:
        assert db.md5(sig)==m,('BASE_DRIFT',sig,db.md5(sig))
        b=db.body(sig);orig=b
        for a,r,n in reps:
            assert b.count(a)==n,('ANCHOR',sig,a[:80],b.count(a));b=b.replace(a,r)
        patched[sig]=dict(orig=orig,new=b,live=m,auditor_confirmed=conf)
    return patched
def main():
    import mirror_db
    db=mirror_db.DB(55751)
    for f in ['02a-install-enum.sql.review','02b-install.sql.review']: db.sql((H.parent/f).read_text())
    pt=build(db)
    db.sql(HELPERS)
    for sig,v in pt.items(): db.sql(v['new'])
    for sig,v in pt.items(): v['candidate']=db.md5(sig)
    cat_new=pt['public.get_partner_catalog_secure(uuid)']['candidate']
    cb=db.body(CAP[0]);assert db.md5(CAP[0])==CAP[1];assert cb.count("'b5684d350603d1db77ab9f1db0f4b253'")==1
    cnew=cb.replace("'b5684d350603d1db77ab9f1db0f4b253'","'"+cat_new+"'");db.sql(cnew)
    pt[CAP[0]]=dict(orig=cb,new=cnew,live=CAP[1],auditor_confirmed=True,candidate=db.md5(CAP[0]))
    acl={sig:db.last(f"SELECT coalesce(proacl::text,'NULL')||'|'||pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{sig}'::regprocedure;") for sig in pt}
    newf=['platform_private.seller_commercial_actor()','platform_private.seller_commercial_target_reason(uuid,uuid)','platform_private.seller_portfolio_lock(uuid,uuid)','public.seller_portfolio_capability_v1()','public.seller_portfolio_orders_v1()','public.admin_seller_portfolio_overview_v1()']
    newm={s:db.md5(s) for s in newf}
    newacl={s:db.last(f"SELECT coalesce(proacl::text,'NULL') FROM pg_proc WHERE oid='{s}'::regprocedure;") for s in newf}
    # Prior seller capability (02b) pin for PRE/rollback.
    db2=mirror_db.DB(55752)
    for f in ['02a-install-enum.sql.review','02b-install.sql.review']: db2.sql((H.parent/f).read_text())
    cap02b=db2.md5('public.seller_portfolio_capability_v1()');cap02b_body=db2.body('public.seller_portfolio_capability_v1()')
    pre=["-- READ ONLY. Executar com SET app.expected_ref='swzpzcwiasxmjutrmvkm'. Falha fechada em qualquer divergência.",
         "DO $pre$ BEGIN",
         " IF current_setting('app.expected_ref',true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'VENDW_PRE_REF_UNPROVEN'; END IF;",
         " IF NOT EXISTS(SELECT 1 FROM pg_enum WHERE enumtypid='public.app_role'::regtype AND enumlabel='vendedor') THEN RAISE EXCEPTION 'VENDW_PRE_ENUM_MISSING'; END IF;",
         f" IF md5(pg_get_functiondef('public.seller_portfolio_capability_v1()'::regprocedure)) IS DISTINCT FROM '{cap02b}' THEN RAISE EXCEPTION 'VENDW_PRE_DRIFT:seller_portfolio_capability_v1'; END IF;"]
    for sig,v in pt.items():
        pre.append(f" IF md5(pg_get_functiondef('{sig}'::regprocedure)) IS DISTINCT FROM '{v['live']}' THEN RAISE EXCEPTION 'VENDW_PRE_DRIFT:{sig}'; END IF;")
        a,o=acl[sig].split('|');pre.append(f" IF (SELECT coalesce(proacl::text,'NULL')||'|'||pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{sig}'::regprocedure) IS DISTINCT FROM '{acl[sig]}' THEN RAISE EXCEPTION 'VENDW_PRE_ACL_DRIFT:{sig}'; END IF;")
    for s in newf[:3]+newf[4:]:
        pre.append(f" IF to_regprocedure('{s}') IS NOT NULL THEN RAISE EXCEPTION 'VENDW_PRE_ALREADY_PRESENT:{s}'; END IF;")
    pre.append("END $pre$;\nSELECT 'VENDW_PRE_PASS';")
    pre_sql='\n'.join(pre)+'\n'
    post=["-- READ ONLY","DO $post$ BEGIN"]
    for sig,v in pt.items():
        post.append(f" IF md5(pg_get_functiondef('{sig}'::regprocedure)) IS DISTINCT FROM '{v['candidate']}' THEN RAISE EXCEPTION 'VENDW_POST_DRIFT:{sig}'; END IF;")
        post.append(f" IF (SELECT coalesce(proacl::text,'NULL')||'|'||pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{sig}'::regprocedure) IS DISTINCT FROM '{acl[sig]}' THEN RAISE EXCEPTION 'VENDW_POST_ACL_DRIFT:{sig}'; END IF;")
    for s in newf:
        post.append(f" IF md5(pg_get_functiondef('{s}'::regprocedure)) IS DISTINCT FROM '{newm[s]}' THEN RAISE EXCEPTION 'VENDW_POST_DRIFT:{s}'; END IF;")
        post.append(f" IF (SELECT coalesce(proacl::text,'NULL') FROM pg_proc WHERE oid='{s}'::regprocedure) IS DISTINCT FROM '{newacl[s]}' THEN RAISE EXCEPTION 'VENDW_POST_ACL_DRIFT:{s}'; END IF;")
    post.append(" IF md5(pg_get_functiondef('platform_private.b2b_internal_commercial_actor()'::regprocedure)) IS DISTINCT FROM '6555396c4f8fe914177d2ccfc3891279' THEN RAISE EXCEPTION 'VENDW_POST_SHARED_HELPER_CHANGED'; END IF;")
    post.append(" IF md5(pg_get_functiondef('platform_private.c2_internal_order_target_reason(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '07d7c9002cbfe17497c9ee4a92d5a928' THEN RAISE EXCEPTION 'VENDW_POST_SHARED_HELPER_CHANGED'; END IF;")
    post.append(" IF md5(pg_get_functiondef('public.fn_cc_can_prepare(uuid)'::regprocedure)) IS DISTINCT FROM '"+db.md5('public.fn_cc_can_prepare(uuid)')+"' THEN RAISE EXCEPTION 'VENDW_POST_SHARED_HELPER_CHANGED'; END IF;")
    post.append("END $post$;\nSELECT 'VENDW_POST_PASS';")
    post_sql='\n'.join(post)+'\n'
    inst=["-- REVIEW ONLY / INATIVO. Aplicar somente pelo auditor após VENDW_PRE_PASS no ref swzpzcwiasxmjutrmvkm.","BEGIN;","SET LOCAL lock_timeout='5s';",pre_sql.replace("SELECT 'VENDW_PRE_PASS';",""),HELPERS]
    for sig,v in pt.items(): inst.append(v['new'].rstrip()+';')
    inst.append(post_sql.replace("SELECT 'VENDW_POST_PASS';",""));inst.append("COMMIT;")
    install_sql='\n'.join(inst)+'\n'
    rb=["-- REVIEW ONLY. Restaura corpos LIVE exatos somente se encontrar o candidato; recusa drift. Preserva pedidos, atribuições e auditoria.","BEGIN;","SET LOCAL lock_timeout='5s';","DO $rb$ BEGIN"]
    for sig,v in pt.items():
        rb.append(f" IF md5(pg_get_functiondef('{sig}'::regprocedure)) IS DISTINCT FROM '{v['candidate']}' THEN RAISE EXCEPTION 'VENDW_RB_DRIFT:{sig}'; END IF;")
    for s in newf: rb.append(f" IF md5(pg_get_functiondef('{s}'::regprocedure)) IS DISTINCT FROM '{newm[s]}' THEN RAISE EXCEPTION 'VENDW_RB_DRIFT:{s}'; END IF;")
    rb.append("END $rb$;")
    for sig,v in pt.items(): rb.append(v['orig'].rstrip()+';')
    rb.append(cap02b_body.rstrip()+';')
    rb.append("REVOKE ALL ON FUNCTION public.seller_portfolio_capability_v1() FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.seller_portfolio_capability_v1() TO authenticated;")
    rb.append("DROP FUNCTION public.admin_seller_portfolio_overview_v1();\nDROP FUNCTION public.seller_portfolio_orders_v1();\nDROP FUNCTION platform_private.seller_portfolio_lock(uuid,uuid);\nDROP FUNCTION platform_private.seller_commercial_target_reason(uuid,uuid);\nDROP FUNCTION platform_private.seller_commercial_actor();")
    rb.append("DO $rbp$ BEGIN")
    for sig,v in pt.items():
        rb.append(f" IF md5(pg_get_functiondef('{sig}'::regprocedure)) IS DISTINCT FROM '{v['live']}' THEN RAISE EXCEPTION 'VENDW_RB_POST:{sig}'; END IF;")
        rb.append(f" IF (SELECT coalesce(proacl::text,'NULL')||'|'||pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{sig}'::regprocedure) IS DISTINCT FROM '{acl[sig]}' THEN RAISE EXCEPTION 'VENDW_RB_ACL:{sig}'; END IF;")
    rb.append(f" IF md5(pg_get_functiondef('public.seller_portfolio_capability_v1()'::regprocedure)) IS DISTINCT FROM '{cap02b}' THEN RAISE EXCEPTION 'VENDW_RB_POST:seller_cap'; END IF;")
    rb.append("END $rbp$;\nCOMMIT;")
    rb_sql='\n'.join(rb)+'\n'
    files={'01c-pre-writers.sql.readonly':pre_sql,'02c-install-writers.sql.review':install_sql,'03c-post-writers.sql.readonly':post_sql,'04c-rollback-writers.sql.review':rb_sql}
    for n,t in files.items(): (H/n).write_text(t)
    man=dict(base='pg_get_functiondef no espelho composto (compose_current.py) restaurado; seis assinaturas conferem com MD5 do auditor',
      patched={s:dict(live=v['live'],candidate=v['candidate'],auditor_confirmed=v['auditor_confirmed'],acl=acl[s]) for s,v in pt.items()},
      new=newm,new_acl=newacl,seller_cap_02b=cap02b,shared_helpers_unchanged=['platform_private.b2b_internal_commercial_actor()','platform_private.c2_internal_order_target_reason(uuid,uuid)','public.fn_cc_can_prepare(uuid)'],
      files={n:hashlib.sha256(t.encode()).hexdigest() for n,t in files.items()},helpers_sha256=hashlib.sha256(HELPERS.encode()).hexdigest())
    (H/'manifest.json').write_text(json.dumps(man,indent=2,ensure_ascii=False)+'\n');print(json.dumps(man['files'],indent=1))
if __name__=='__main__':main()
