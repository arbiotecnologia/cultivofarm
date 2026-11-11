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
