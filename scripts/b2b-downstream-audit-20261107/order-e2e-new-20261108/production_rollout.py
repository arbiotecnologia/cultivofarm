#!/usr/bin/env python3
"""Assemble review-only POSPLANOS rollout from fresh disposable evidence; no hosted I/O."""
import hashlib
import json
import os
import shutil
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
E = Path(os.environ.get('NEW_E2E_OUT', str(H / 'evidence')))
OUT = H / 'production-rollout-posplans-20261108'
REF = 'swzpzcwiasxmjutrmvkm'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


def pre_from_install(install, candidate):
    install_text = Path(install).read_text()
    candidate_text = Path(candidate).read_text()
    assert install_text.endswith(candidate_text), (install, 'candidate suffix drift')
    return install_text[:-len(candidate_text)].rstrip() + '\n'


def main():
    checks = json.loads((E/'checks.json').read_text())
    assert (E/'run.exitcode').read_text().strip() == '0' and checks and all(x['status'] == 'PASS' for x in checks)
    assert sha(E/'logistics/candidate.sql.review') == '8ad4def8d4ae3c2e86518f2d82bf57f053cee66b0d7e165b84472cb586812c20'
    physical = E/'physical-finished-product'
    assert (E/'current-catalog-baseline.json').is_file()
    assert (E/'current-catalog-posplans.json').is_file()
    OUT.mkdir(exist_ok=True)
    delivery = E/'delivery-confirmation'
    send = E/'delivery-send'
    for required in [delivery, send]:
        assert required.is_dir(), f'missing fresh artifact directory: {required}'

    plan_post = (ROOT/'scripts/commercial-plans-tenant-20261108/03-post.sql.readonly').read_text()
    assert sha(ROOT/'scripts/commercial-plans-tenant-20261108/03-post.sql.readonly') == '033312331dd757c72c625f027d24176efa33931c8881ab002122a4e56867e894'
    initial = f"""-- PRE POSPLANOS gerado somente de capturas/evidência local; auditor executa READ ONLY.
BEGIN READ ONLY;
SET LOCAL commercial_plans.review_project_ref='{REF}';
{plan_post}
DO $$BEGIN
 IF (SELECT count(*) FROM public.commercial_payment_plans) IS DISTINCT FROM 6::bigint
 OR (SELECT count(*) FROM public.commercial_payment_plan_assignments) IS DISTINCT FROM 4::bigint
 OR (SELECT count(*) FROM public.partner_orders) IS DISTINCT FROM 9::bigint
 OR (SELECT count(*) FROM public.accounts_receivable) IS DISTINCT FROM 10::bigint
 OR (SELECT count(*) FROM public.fiscal_invoices) IS DISTINCT FROM 5::bigint
 THEN RAISE EXCEPTION 'PRODUCTION_POSPLANOS_COUNT_DRIFT_RECAPTURE_REQUIRED'; END IF;
END$$;
{(delivery/'preflight.sql.review').read_text()}
-- Pins LIVE relatados pelo auditor em 08/11/2026: dependências existentes, não candidatos.
DO $$DECLARE p oid;BEGIN
 p:=to_regprocedure('public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)');
 IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM 'a4d47ccf5d116141ed46e9de9ea7eeaa'
 THEN RAISE EXCEPTION 'PRODUCTION_LIVE_DELIVERY_SHORT_OVERLOAD_DRIFT'; END IF;
 p:=to_regprocedure('public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)');
 IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM '97d476cc795d75b829f305f1e64d4e62'
 THEN RAISE EXCEPTION 'PRODUCTION_LIVE_DELIVERY_ITEMS_OVERLOAD_DRIFT'; END IF;
 p:=to_regprocedure('public.rpc_programar_os_v1(uuid,text,date)');
 IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM 'e374f0ba1698b37523b890dc91682eaf'
 THEN RAISE EXCEPTION 'PRODUCTION_LIVE_BIOLOGICAL_OS_DRIFT'; END IF;
END$$;
-- A confirmação candidata está ausente por pronome, inclusive em qualquer overload.
-- Os callers/helpers de revenda também não podem existir sob outra assinatura.
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE (n.nspname='public' AND p.proname IN ('rpc_entrega_confirmar_manual_v1','rpc_b2b_resale_os_create_v1','rpc_b2b_resale_os_availability_v1'))
      OR (n.nspname='platform_private' AND p.proname='b2b_resale_os_create_v1'))
 OR to_regclass('platform_private.b2b_resale_logistics_gate_v1') IS NOT NULL
 OR to_regclass('platform_private.b2b_resale_os_requests_v1') IS NOT NULL
 OR to_regclass('platform_private.finished_product_gate_v1') IS NOT NULL
 THEN RAISE EXCEPTION 'PRODUCTION_REPORTED_ABSENCE_DRIFT_RECAPTURE_REQUIRED'; END IF;
END$$;
-- Inventário completo dos nomes relevantes para anexar à evidência READ ONLY.
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),md5(pg_get_functiondef(p.oid)),pg_get_userbyid(p.proowner),p.proacl::text
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.proname IN ('rpc_entrega_confirmar_manual_v1','rpc_entrega_enviar_manual_v1','rpc_cockpit_criar_entrega_v1','rpc_programar_os_v1','rpc_b2b_resale_os_create_v1','rpc_b2b_resale_os_availability_v1','b2b_resale_os_create_v1')
 ORDER BY 1,2,3;
ROLLBACK;
"""
    for fragment in (
      "p.proname IN ('rpc_entrega_confirmar_manual_v1','rpc_b2b_resale_os_create_v1','rpc_b2b_resale_os_availability_v1')",
      "'a4d47ccf5d116141ed46e9de9ea7eeaa'",
      "'97d476cc795d75b829f305f1e64d4e62'",
      "'e374f0ba1698b37523b890dc91682eaf'",
    ):
      assert fragment in initial, ('production PRE missing LIVE pin', fragment)
    assert "to_regprocedure('public.rpc_entrega_confirmar_manual_v1(" not in initial
    (OUT/'00-production-pre-posplans.sql.readonly').write_text(initial)

    artifacts = {
      '11-confirmation-install.sql.review': delivery/'install.sql.review',
      '12-confirmation-post.sql.readonly': delivery/'postflight.sql.review',
      '91-confirmation-rollback-deny.sql.review': delivery/'rollback.sql.review',
      '20-send-pre.sql.readonly': send/'preflight.sql.review',
      '21-send-install.sql.review': send/'install.sql.review',
      '22-send-post.sql.readonly': send/'postflight.sql.review',
      '92-send-rollback-deny.sql.review': send/'rollback.sql.review',
      '31-physical-install.sql.review': physical/'install.sql.review',
      '32-physical-post.sql.readonly': physical/'postflight.sql.review',
      '93-physical-rollback-deny.sql.review': physical/'rollback.sql.review',
      '41-logistics-install.sql.review': E/'logistics/install.sql.review',
      '42-logistics-post.sql.readonly': E/'logistics/postflight.sql.review',
      '94-logistics-rollback-deny.sql.review': E/'logistics/rollback.sql.review',
      '50-endpoint-reader-pre.sql.readonly': E/'os-endpoint/01-pre.sql.readonly',
      '51-endpoint-reader-install.sql.review': E/'os-endpoint/02-install.sql.review',
      '52-endpoint-reader-post.sql.readonly': E/'os-endpoint/03-post.sql.readonly',
      '90-endpoint-reader-rollback-deny.sql.review': E/'os-endpoint/04-rollback-deny.sql.review',
    }
    for target, source in artifacts.items(): copy(source, OUT/target)
    (OUT/'30-physical-pre-after-confirmation-send.sql.readonly').write_text(
      'BEGIN READ ONLY;\n'+pre_from_install(physical/'install.sql.review',physical/'candidate.sql.review')+'ROLLBACK;\n')
    (OUT/'40-logistics-pre-after-physical.sql.readonly').write_text(
      'BEGIN READ ONLY;\n'+pre_from_install(E/'logistics/install.sql.review',E/'logistics/candidate.sql.review')+'ROLLBACK;\n')
    files = {p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(OUT.iterdir()) if p.is_file() and p.name!='manifest.json'}
    manifest = {
      'status':'REVIEW_ONLY_INACTIVE_NOT_APPROVED', 'production_ref':REF,
      'baseline':'POSPLANOS + catálogo exclusivo atual; plan cc1f6cc already installed; never reinstall or roll it back',
      'current_catalog_evidence':{'pre':sha(E/'current-catalog-baseline.json'),'post_plans':sha(E/'current-catalog-posplans.json'),'function_pins':9,'tenant_guards':6,'restricted_relation_acls':8},
      'previous_failed_pre':'CONFIRM_PRE_DRIFT em 4f68d404; pacote anterior preservado e não reutilizado como baseline',
      'hosted_io':False,'gates':'all closed after every install and rollback',
      'live_readonly_reported_2026_11_08':{
        'rpc_entrega_confirmar_manual_v1':'ABSENT_BY_PRONAME_ANY_OVERLOAD',
        'rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)':'a4d47ccf5d116141ed46e9de9ea7eeaa',
        'rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)':'97d476cc795d75b829f305f1e64d4e62',
        'rpc_programar_os_v1(uuid,text,date)':'e374f0ba1698b37523b890dc91682eaf',
        'resale_os_and_gates':'ABSENT',
      },
      'order':['00 production PRE','11/12 confirmation closed','20/21/22 send closed','30/31/32 physical gate OFF','40/41/42 resale logistics gate OFF','50/51/52 public reader+OS endpoint gate OFF'],
      'excluded':['commercial plan reinstall/rollback','B4','fiscal bridge','NF/NFS-e','receivables','payments','communication','frontend publication','automatic gate activation'],
      'rollback_order':['90 endpoint+reader','94 logistics','93 physical','92 send','91 confirmation'],
      'files':files,
    }
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'out':str(OUT),'files':len(files),'manifest_sha256':sha(OUT/'manifest.json')},indent=2))


if __name__ == '__main__': main()
