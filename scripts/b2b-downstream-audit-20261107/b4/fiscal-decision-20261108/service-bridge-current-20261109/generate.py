#!/usr/bin/env python3
"""Gera etapa estrita REVIEW_ONLY sobre B4+ponte existentes. Nunca hosted."""
import hashlib
import json
import re
import runpy
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[4]
REF = "swzpzcwiasxmjutrmvkm"
B4DIR = ROOT / "scripts/b2b-downstream-audit-20261107/b4"
BRIDGEDIR = B4DIR / "fiscal-decision-20261108/service-bridge"
G = runpy.run_path(str(B4DIR / "generate-b4.py"))
BASELINE = runpy.run_path(str(B4DIR / "current_receivable_baseline.py"))
OLD_SCHEMA = ROOT / "scripts/financial-price-generator-20261029/integration/schema.sql.review"
SIG = "platform_private.b2b_integration_dependencies()"
DEPENDENCY = r"""CREATE OR REPLACE FUNCTION platform_private.b2b_integration_dependencies() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE p platform_private.b2b_fiscal_service_permits;
 d platform_private.b2b_authorized_documents;
 s platform_private.b2b_fiscal_invoice_snapshots;
 i public.fiscal_invoices;
 t public.fiscal_sefaz_transmissions;
 o public.partner_orders;
 permits integer;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'B2B_READ_COMMITTED_REQUIRED' USING ERRCODE='0A000';
 END IF;
 SELECT count(*) INTO permits FROM platform_private.b2b_fiscal_service_permits x
  WHERE x.transaction_id=txid_current();
 IF permits<>1 THEN
  RAISE EXCEPTION 'B2B_FISCAL_SERVICE_PERMIT_REQUIRED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO p FROM platform_private.b2b_fiscal_service_permits x
  WHERE x.transaction_id=txid_current();
 SELECT * INTO d FROM platform_private.b2b_authorized_documents x
  WHERE x.id=p.document_id AND x.id=p.invoice_id AND x.order_id=p.order_id
   AND x.organization_id=p.organization_id AND x.partner_id=p.partner_id AND x.state='AUTHORIZED';
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_FISCAL_DOCUMENT_NOT_PROVEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM platform_private.b2b_fiscal_invoice_snapshots x
  WHERE x.invoice_id=p.invoice_id AND x.source_digest=d.source_digest;
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_FISCAL_SNAPSHOT_NOT_PROVEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.fiscal_invoices x
  WHERE x.id=p.invoice_id AND x.partner_order_id=p.order_id AND x.debtor_partner_id=p.partner_id
   AND x.organization_id=p.organization_id AND x.normalized_status='AUTHORIZED'
   AND x.invoice_type='NFE' AND x.environment='HOMOLOGATION' AND x.authorized_at IS NOT NULL
   AND x.issue_date=d.issue_date AND coalesce(x.access_key,'')~'^[0-9]{44}$';
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_FISCAL_CONFIRMATION_UNPROVEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.partner_orders x WHERE x.id=p.order_id AND x.partner_id=p.partner_id;
 IF NOT FOUND OR NOT EXISTS(
   SELECT 1 FROM public.partner_accounts pa WHERE pa.id=p.partner_id
    AND pa.commercial_owner_organization_id=p.organization_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
 ) OR NOT EXISTS(
   SELECT 1 FROM public.company_fiscal_settings c WHERE c.id=i.company_settings_id
    AND c.organization_id=p.organization_id AND c.is_active IS TRUE
    AND c.configuration_status='VALIDATED' AND c.accounting_validated_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'B2B_FISCAL_ACCOUNTING_OR_TENANT_UNPROVEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.fiscal_sefaz_transmissions x
  WHERE x.id=s.transmission_id AND x.fiscal_invoice_id=p.invoice_id
   AND x.state='SUCCEEDED' AND x.outcome='AUTHORIZED'
   AND coalesce(x.protocol_c_stat,x.c_stat) IN ('100','150')
   AND x.ch_nfe=i.access_key AND x.n_prot=s.protocol AND x.ambiente_retorno='2';
 IF NOT FOUND OR NOT EXISTS(
   SELECT 1 FROM public.fiscal_xml_runs r WHERE r.fiscal_invoice_id=p.invoice_id
    AND r.signed_path IS NOT NULL AND (r.access_key IS NULL OR r.access_key=i.access_key)
 ) THEN RAISE EXCEPTION 'B2B_FISCAL_CONFIRMATION_UNPROVEN' USING ERRCODE='42501'; END IF;
 IF s.snapshot->>'access_key' IS DISTINCT FROM i.access_key
  OR s.snapshot->>'organization_id' IS DISTINCT FROM p.organization_id::text
  OR s.snapshot->>'partner_order_id' IS DISTINCT FROM p.order_id::text
  OR s.snapshot->>'debtor_partner_id' IS DISTINCT FROM p.partner_id::text
  OR s.snapshot->>'total_amount' IS DISTINCT FROM i.total_amount::text
 THEN RAISE EXCEPTION 'B2B_FISCAL_SNAPSHOT_DIVERGENCE' USING ERRCODE='PT409'; END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.b2b_integration_dependencies() FROM PUBLIC,anon,authenticated,service_role;
"""


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def old_dependency():
    text = OLD_SCHEMA.read_text()
    match = re.search(r"CREATE FUNCTION platform_private\.b2b_integration_dependencies\(\).*?END \$\$;", text, re.S)
    assert match
    raw = match.group()
    normalized = G["canonical_function"](raw)
    return normalized + ";", G["md5_def"](normalized)


def function_assert(sig, expected, code):
    return f" IF md5(pg_get_functiondef('{sig}'::regprocedure)) IS DISTINCT FROM '{expected}' THEN RAISE EXCEPTION '{code}:{sig}'; END IF;\n"


def metadata_assert(code):
    acl = BASELINE["ACL"]
    trigger_md5 = BASELINE["TRIGGERS_MD5"]
    return f""" IF (SELECT array_agg(x::text ORDER BY x::text) FROM pg_class c CROSS JOIN LATERAL unnest(coalesce(c.relacl,acldefault('r',c.relowner))) x WHERE c.oid='public.accounts_receivable'::regclass) IS DISTINCT FROM (SELECT array_agg(x::text ORDER BY x::text) FROM unnest('{acl}'::aclitem[]) x) THEN RAISE EXCEPTION '{code}:ACL'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.accounts_receivable'::regclass AND NOT tgisinternal)<>14 THEN RAISE EXCEPTION '{code}:TRIGGER_COUNT_WITH_CANDIDATES'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.accounts_receivable'::regclass AND NOT tgisinternal AND tgname NOT IN ('zz_b2b_shared_credit_guard','a01_b2b_fiscal_title_fence','a01_b2b_fiscal_title_identity','b2b_fiscal_created_by_guard'))<>10 THEN RAISE EXCEPTION '{code}:TRIGGER_COUNT'; END IF;
 IF (SELECT md5(string_agg(tgname||'|'||pg_get_triggerdef(oid)||'|'||tgenabled::text,'^' ORDER BY tgname)) FROM pg_trigger WHERE tgrelid='public.accounts_receivable'::regclass AND NOT tgisinternal AND tgname NOT IN ('zz_b2b_shared_credit_guard','a01_b2b_fiscal_title_fence','a01_b2b_fiscal_title_identity','b2b_fiscal_created_by_guard')) IS DISTINCT FROM '{trigger_md5}' THEN RAISE EXCEPTION '{code}:TRIGGERS'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.accounts_receivable'::regclass AND tgname='a00_delivery_no_downstream' AND tgenabled='O') THEN RAISE EXCEPTION '{code}:DELIVERY_DOWNSTREAM'; END IF;
 IF md5(pg_get_functiondef('platform_private.delivery_no_downstream_20261030()'::regprocedure)) IS DISTINCT FROM '{BASELINE['FUNCTION_MD5']}' THEN RAISE EXCEPTION '{code}:DELIVERY_BODY'; END IF;
"""


def build():
    capture_path = H / "capture-current.json"
    capture = json.loads(capture_path.read_text())
    assert capture["project_ref"] == REF and len(capture["pins"]) == 101
    b4pins = json.loads((B4DIR / "b4-pins.json").read_text())
    bridge_manifest = json.loads((BRIDGEDIR / "manifest.json").read_text())
    assert sha(B4DIR / "b4-candidate.sql.review") == bridge_manifest["b4_sha256"]
    assert sha(BRIDGEDIR / "02-install.sql.review") == bridge_manifest["outputs"]["02-install.sql.review"]
    old_body, old_md5 = old_dependency()
    new_md5 = G["md5_def"](G["canonical_function"](DEPENDENCY.split("REVOKE ALL ON FUNCTION", 1)[0].rstrip().removesuffix(";")))
    pre_pins = {
        "platform_private.b2b_integration_dependencies()": old_md5,
        "public.generate_b2b_receivable_secure(uuid)": "c49cc7ccedbcb28cba9b816b7e47c521",
        "public.generate_b2b_receivable_secure_impl(uuid)": b4pins["candidate_md5"]["public.generate_b2b_receivable_secure_impl(uuid)"],
        "public.tg_auto_b2b_receivable()": b4pins["candidate_md5"]["public.tg_auto_b2b_receivable()"],
        "public.cancel_b2b_receivable_secure(uuid,text)": "9935ddb807b0b3da89dfb7d18fea267e",
    }
    pre = "-- READ ONLY: exige B4+ponte e legado já reconciliado pelo B4.\nBEGIN READ ONLY;\n"
    pre += f"DO $p$ BEGIN\n IF current_setting('b2b_fiscal_bridge.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'B2B_FISCAL_REF_NOT_VERIFIED'; END IF;\n"
    for sig, pin in pre_pins.items():
        pre += function_assert(sig, pin, "B2B_STRICT_PRE_DRIFT")
    pre += metadata_assert("B2B_STRICT_PRE_DRIFT")
    pre += " IF to_regprocedure('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)') IS NULL OR NOT has_function_privilege('service_role','platform_private.b2b_fiscal_invoice_bridge_v1(uuid)','EXECUTE') OR has_function_privilege('authenticated','platform_private.b2b_fiscal_invoice_bridge_v1(uuid)','EXECUTE') THEN RAISE EXCEPTION 'B2B_STRICT_PRE_BRIDGE_ACL'; END IF;\n"
    pre += " IF (SELECT count(*) FROM pg_class WHERE oid IN ('platform_private.b2b_fiscal_service_permits'::regclass,'platform_private.b2b_fiscal_invoice_snapshots'::regclass) AND NOT relrowsecurity)<>0 THEN RAISE EXCEPTION 'B2B_STRICT_PRE_RLS'; END IF;\n"
    pre += "END $p$;\nROLLBACK;\n"
    post = "-- READ ONLY: dependência estrita, ACL privada e baseline preservados.\nBEGIN READ ONLY;\nDO $p$ BEGIN\n"
    post += function_assert(SIG, new_md5, "B2B_STRICT_POST_DRIFT")
    post += function_assert("public.generate_b2b_receivable_secure(uuid)", pre_pins["public.generate_b2b_receivable_secure(uuid)"], "B2B_STRICT_POST_LEGACY_WRAPPER")
    post += function_assert("public.generate_b2b_receivable_secure_impl(uuid)", pre_pins["public.generate_b2b_receivable_secure_impl(uuid)"], "B2B_STRICT_POST_LEGACY_IMPL")
    post += function_assert("public.tg_auto_b2b_receivable()", pre_pins["public.tg_auto_b2b_receivable()"], "B2B_STRICT_POST_LEGACY_TRIGGER")
    post += metadata_assert("B2B_STRICT_POST_DRIFT")
    post += " IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='platform_private.b2b_integration_dependencies()'::regprocedure AND pg_get_userbyid(proowner)='postgres' AND prosecdef AND proconfig=ARRAY['search_path=\"\"']) THEN RAISE EXCEPTION 'B2B_STRICT_POST_METADATA'; END IF;\n"
    post += " IF has_function_privilege('anon','platform_private.b2b_integration_dependencies()','EXECUTE') OR has_function_privilege('authenticated','platform_private.b2b_integration_dependencies()','EXECUTE') OR has_function_privilege('service_role','platform_private.b2b_integration_dependencies()','EXECUTE') THEN RAISE EXCEPTION 'B2B_STRICT_POST_ACL'; END IF;\n"
    post += "END $p$;\nROLLBACK;\n"
    install = "-- REVIEW_ONLY_INACTIVE_NOT_APPROVED; somente após B4+ponte.\nBEGIN;\nSET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='60s';\n"
    install += f"DO $p$ BEGIN IF current_setting('b2b_fiscal_bridge.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'B2B_FISCAL_REF_NOT_VERIFIED'; END IF;\n"
    for sig, pin in pre_pins.items():
        install += function_assert(sig, pin, "B2B_STRICT_INSTALL_PRE_DRIFT")
    install += metadata_assert("B2B_STRICT_INSTALL_PRE_DRIFT") + "END $p$;\n" + DEPENDENCY + post.replace("BEGIN READ ONLY;\n", "").replace("ROLLBACK;\n", "") + "COMMIT;\n"
    rollback = "-- DENY-ONLY: restaura somente a negação B4 e fecha entrypoints; preserva histórico.\nBEGIN;\n"
    rollback += f"DO $p$ BEGIN IF current_setting('b2b_fiscal_bridge.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'B2B_FISCAL_REF_NOT_VERIFIED'; END IF;\n" + function_assert(SIG, new_md5, "B2B_STRICT_ROLLBACK_DRIFT") + "END $p$;\n"
    rollback += old_body + "\nREVOKE ALL ON FUNCTION platform_private.b2b_integration_dependencies() FROM PUBLIC,anon,authenticated,service_role;\n"
    rollback += "REVOKE ALL ON FUNCTION platform_private.b2b_fiscal_invoice_bridge_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;\n"
    rollback += "REVOKE ALL ON FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamptz,text,text,uuid),public.rpc_fiscal_sefaz_transmit_record_v1(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;\n"
    rollback += "REVOKE EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) FROM PUBLIC,anon,authenticated;\n"
    rollback += function_assert(SIG, old_md5, "B2B_STRICT_ROLLBACK_NOT_CLOSED") + "COMMIT;\n"
    return {
        "01-pre.sql.readonly": pre,
        "02-install.sql.review": install,
        "03-post.sql.readonly": post,
        "04-rollback-deny.sql.review": rollback,
        "dependency.candidate.sql": DEPENDENCY,
        "dependency.before-deny.sql": old_body + "\n",
        "manifest.json": json.dumps({
            "project_ref": REF, "status": "REVIEW_ONLY_INACTIVE_NOT_APPROVED",
            "stage": "AFTER_B4_AND_SERVICE_BRIDGE_BEFORE_ANY_FISCAL_CALLBACK",
            "capture_sha256": sha(capture_path), "capture_pins": 101,
            "seller91_md5": "97bcdb9884b54adb3bd4aae4915e32d0",
            "b4_sha256": bridge_manifest["b4_sha256"], "bridge_sha256": bridge_manifest["outputs"]["02-install.sql.review"],
            "old_dependency_md5": old_md5, "candidate_dependency_md5": new_md5,
            "legacy_b4": pre_pins, "receivable_acl_md5": BASELINE["ACL_MD5"],
            "receivable_triggers_md5": BASELINE["TRIGGERS_MD5"],
            "cardinality": "ONE_TITLE_PER_CONFIRMED_FISCAL_DOCUMENT; MULTIPLE_PARTIAL_DOCUMENTS_ALLOWED; NO_UNIQUE_TITLE_PER_ORDER_REQUIREMENT",
            "always_allow_substitution": False, "hosted": False,
        }, indent=2, ensure_ascii=False) + "\n",
    }


def main():
    files = build()
    for name, text in files.items():
        (H / name).write_text(text)
    (H / "SHA256SUMS").write_text("".join(f"{hashlib.sha256(text.encode()).hexdigest()}  {name}\n" for name, text in sorted(files.items())))
    print(json.dumps({"files": len(files) + 1, "candidate_md5": json.loads(files["manifest.json"])["candidate_dependency_md5"]}, indent=2))


if __name__ == "__main__":
    main()
