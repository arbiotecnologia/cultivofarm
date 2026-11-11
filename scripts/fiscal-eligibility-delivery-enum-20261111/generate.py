#!/usr/bin/env python3
"""Gera 01-pre/02-install/03-post/04-rollback para fn_fiscal_invoice_eligibility(text,uuid).
Entrada: live-capture/eligibility-2arg.sql (pg_get_functiondef capturado) e live-capture/pins.json.
Altera SOMENTE três âncoras exatas (enum status_entrega comparado como texto). Nunca editar à mão os arquivos gerados.
Uso: python3 generate.py [--verify]"""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;CAP=H/'live-capture'
REF='swzpzcwiasxmjutrmvkm'
SIG2='public.fn_fiscal_invoice_eligibility(text,uuid)';SIG3='public.fn_fiscal_invoice_eligibility(text,uuid,uuid)'
ANCHORS=[("coalesce(ent.status,'') = 'cancelada'","coalesce(ent.status::text,'') = 'cancelada'"),
         ("coalesce(ent.status,'') = ANY (public.fn_fiscal_billing_allowed_delivery_status())","coalesce(ent.status::text,'') = ANY (public.fn_fiscal_billing_allowed_delivery_status())"),
         ("'Entrega nao concluida/aceita. Status atual: '||coalesce(ent.status,'-')","'Entrega nao concluida/aceita. Status atual: '||coalesce(ent.status::text,'-')")]
ANCHORS+=[('  allowed text[];\nBEGIN\n  PERFORM public.h15_require_staff();\n', '  allowed text[];\n  v_actor_org uuid;\n  v_owner_org uuid;\nBEGIN\n  PERFORM public.h15_require_staff();\n  v_actor_org := public.h15_actor_organization();\n'), ("    SELECT * INTO po FROM public.partner_orders WHERE id = _source_id;\n    IF NOT FOUND THEN\n      reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_NOT_FOUND','severity','BLOCK','message','Pedido inexistente.');\n    ELSE\n", "    SELECT * INTO po FROM public.partner_orders WHERE id = _source_id;\n    IF po.id IS NOT NULL THEN\n      SELECT pa.commercial_owner_organization_id INTO v_owner_org FROM public.partner_accounts pa WHERE pa.id = po.partner_id;\n    END IF;\n    -- Escopo vendedor: inexistente e de outra empresa respondem igual, sem IDs.\n    IF po.id IS NULL OR v_owner_org IS NULL OR v_owner_org IS DISTINCT FROM v_actor_org THEN\n      RETURN jsonb_build_object('eligible',false,'reasons',jsonb_build_array(jsonb_build_object('code','FISCAL_ORDER_NOT_FOUND','severity','BLOCK','message','Pedido inexistente.')),'sourceType',_source_type,'orderId',NULL::uuid,'debtorPartnerId',NULL::uuid,'has_canceled_history',false);\n    ELSE\n"), ("    SELECT * INTO ent FROM public.entregas WHERE id = _source_id;\n    IF NOT FOUND THEN\n      reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_NOT_FOUND','severity','BLOCK','message','Entrega inexistente.');\n    ELSE\n", "    SELECT * INTO ent FROM public.entregas WHERE id = _source_id;\n    -- Escopo vendedor: inexistente e de outra empresa respondem igual, sem IDs.\n    IF ent.id IS NULL OR ent.organization_id IS NULL OR ent.organization_id IS DISTINCT FROM v_actor_org THEN\n      RETURN jsonb_build_object('eligible',false,'reasons',jsonb_build_array(jsonb_build_object('code','FISCAL_DELIVERY_NOT_FOUND','severity','BLOCK','message','Entrega inexistente.')),'sourceType',_source_type,'orderId',NULL::uuid,'debtorPartnerId',NULL::uuid,'has_canceled_history',false);\n    ELSE\n"), ('        SELECT partner_id, status::text INTO v_debtor, st FROM public.partner_orders WHERE id = ent.partner_order_id;\n', "        SELECT o.partner_id, o.status::text, pa.commercial_owner_organization_id INTO v_debtor, st, v_owner_org\n          FROM public.partner_orders o LEFT JOIN public.partner_accounts pa ON pa.id = o.partner_id WHERE o.id = ent.partner_order_id;\n        IF v_owner_org IS NULL OR v_owner_org IS DISTINCT FROM ent.organization_id THEN\n          -- Pedido vinculado ausente/de outra empresa: nega sem expor seus IDs.\n          reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_TENANT_MISMATCH','severity','BLOCK',\n            'message','Entrega e pedido vinculado nao pertencem a mesma empresa vendedora.');\n          v_order_id := NULL; v_debtor := NULL; st := NULL;\n        END IF;\n")]
md5=lambda s:hashlib.md5(s.encode()).hexdigest()
live=(CAP/'eligibility-2arg.sql').read_text();pins=json.loads((CAP/'pins.json').read_text())
assert md5(live)==pins['live_md5_2arg'],'LIVE_CAPTURE_MD5_MISMATCH'
cand=live
for a,b in ANCHORS:
    assert cand.count(a)==1,('ANCHOR_COUNT',a,cand.count(a));cand=cand.replace(a,b)
assert 'coalesce(ent.status,' not in cand
CMD5=md5(cand)
def q(s): return "$cap$"+s+"$cap$"
def pin_block(code,md5_2,md5_3=None):
    return f"""DO $pin$
DECLARE r record;
BEGIN
  IF current_setting('fiscal_elig_fix.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION '{code}_PROJECT_REF_REQUIRED'; END IF;
  SELECT md5(pg_get_functiondef(p.oid)) m, pg_get_userbyid(p.proowner) o, coalesce(p.proacl::text,'') a, p.prosecdef d, coalesce(p.proconfig::text,'') c INTO r FROM pg_proc p WHERE p.oid='{SIG2}'::regprocedure;
  IF r.m IS DISTINCT FROM '{md5_2}' THEN RAISE EXCEPTION '{code}_BODY_DRIFT_2ARG %',r.m; END IF;
  IF r.o IS DISTINCT FROM '{pins['owner_2arg']}' OR r.a IS DISTINCT FROM '{pins['acl_2arg']}' OR r.d IS DISTINCT FROM {str(pins['secdef_2arg']).lower()} OR r.c IS DISTINCT FROM '{pins['config_2arg']}' THEN RAISE EXCEPTION '{code}_META_DRIFT_2ARG % % % %',r.o,r.a,r.d,r.c; END IF;
  SELECT md5(pg_get_functiondef(p.oid)) m, coalesce(p.proacl::text,'') a INTO r FROM pg_proc p WHERE p.oid='{SIG3}'::regprocedure;
  IF r.m IS DISTINCT FROM '{pins['live_md5_3arg']}' OR r.a IS DISTINCT FROM '{pins['acl_3arg']}' THEN RAISE EXCEPTION '{code}_3ARG_DRIFT % %',r.m,r.a; END IF;
  IF (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid='public.status_entrega'::regtype)::text IS DISTINCT FROM '{pins['status_entrega_labels']}' THEN RAISE EXCEPTION '{code}_ENUM_DRIFT'; END IF;
END $pin$;
"""
def swap(code,frm,to_body):
    return ("BEGIN;\n"+pin_block(code,frm)+to_body.rstrip().rstrip(';')+";\n"+
      f"""DO $chk$ BEGIN
  IF (SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid='{SIG2}'::regprocedure) IS DISTINCT FROM '{pins['acl_2arg']}' THEN RAISE EXCEPTION '{code}_ACL_CHANGED'; END IF;
END $chk$;
"""+pin_block(code+'_AFTER',md5(to_body))+"COMMIT;\n")
out={'01-pre.sql.readonly':"BEGIN READ ONLY;\n"+pin_block('FELIG_PRE',pins['live_md5_2arg'])+"SELECT 'FELIG_PRE_OK';\nROLLBACK;\n",
     '02-install.sql.review':swap('FELIG_INSTALL',pins['live_md5_2arg'],cand),
     '03-post.sql.readonly':"BEGIN READ ONLY;\n"+pin_block('FELIG_POST',CMD5)+"SELECT 'FELIG_POST_OK';\nROLLBACK;\n",
     '04-rollback.sql.review':swap('FELIG_ROLLBACK',CMD5,live)}
manifest={'live_md5_2arg':pins['live_md5_2arg'],'candidate_md5_2arg':CMD5,'live_md5_3arg_untouched':pins['live_md5_3arg'],'anchors':len(ANCHORS)}
if '--verify' in sys.argv:
    for n,b in out.items(): assert (H/n).read_text()==b,('DRIFT',n)
    assert json.loads((H/'candidate-md5.json').read_text())==manifest;print('VERIFY_OK');sys.exit()
for n,b in out.items():(H/n).write_text(b)
(H/'candidate.sql').write_text(cand);(H/'candidate-md5.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
