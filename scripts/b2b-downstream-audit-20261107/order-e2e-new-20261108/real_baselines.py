#!/usr/bin/env python3
"""Baselines reais reconciliadas no PG descartável; não é candidato de instalação.

Cadastro: captura integral aplicada externamente em 08/11/2026.
Recebíveis: ACL e dez gatilhos relatados em d6cd95c0, com a guarda canônica
integral extraída pelo gerador B4 já revisado. Nenhuma captura histórica muda.
"""
import hashlib
import json
from pathlib import Path

CANONICAL_REF = "swzpzcwiasxmjutrmvkm"
OLD_REGISTRATION_MD5 = "756e5d24883fa387054b4385a232cfcf"


def _acl_md5(relname):
    return f"""(SELECT md5(string_agg(v.entry,'|' ORDER BY v.entry)) FROM (
      SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END||'='||a.privilege_type||CASE WHEN a.is_grantable THEN '*' ELSE '' END||'/'||a.grantor::regrole::text entry
      FROM pg_class c,aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid='{relname}'::regclass) v)"""


def snapshot(B):
    text = B.last(f"""SELECT jsonb_build_object(
      'receivable',(SELECT jsonb_build_object(
        'owner',pg_get_userbyid(c.relowner),'acl',coalesce(c.relacl::text,''),
        'acl_md5',{_acl_md5('public.accounts_receivable')},
        'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
        'trigger_md5',(SELECT md5(string_agg(t.tgname||'|'||pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text,'^' ORDER BY t.tgname)) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
        'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled::text) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
      ) FROM pg_class c WHERE c.oid='public.accounts_receivable'::regclass),
      'downstream_guard',(SELECT jsonb_build_object('md5',md5(pg_get_functiondef(p.oid)),'owner',r.rolname,'acl',coalesce(p.proacl::text,'')) FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure('platform_private.delivery_no_downstream_20261030()')),
      'registration',(SELECT jsonb_build_object(
        'default_md5',md5(pg_get_functiondef('public.tg_create_default_pfs()'::regprocedure)),
        'default_owner',pg_get_userbyid(p.proowner),'default_acl',coalesce(p.proacl::text,''),
        'fence_md5',md5(pg_get_functiondef('platform_private.c2p1_settings_fence()'::regprocedure))
      ) FROM pg_proc p WHERE p.oid='public.tg_create_default_pfs()'::regprocedure),
      'registration_triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled::text) ORDER BY t.tgname),'[]'::jsonb)
        FROM pg_trigger t WHERE t.tgrelid IN ('public.partner_accounts'::regclass,'public.partner_financial_settings'::regclass)
          AND t.tgname IN ('trg_create_default_pfs','c2p1_settings_fence') AND NOT t.tgisinternal)
    )::text;""")
    return json.loads(text)


def install(B, out, root):
    root = Path(root)
    registration_path = root / "scripts/b2b-downstream-audit-20261107/registration-deferred-20261108/canonical-readonly.json"
    money_path = root / "scripts/financial-installments-initial-20261024/receivable-semantics-live-20261028.json"
    baseline_path = root / "scripts/b2b-downstream-audit-20261107/b4/review-d6cd95c0/current_receivable_baseline.py"
    registration = json.loads(registration_path.read_text())
    money = json.loads(money_path.read_text())
    assert registration["project_ref"] == CANONICAL_REF and money["ref"] == CANONICAL_REF
    current_ar = B.load("new_current_receivable_baseline", baseline_path) if hasattr(B, "load") else None
    if current_ar is None:
        import importlib.util
        spec = importlib.util.spec_from_file_location("new_current_receivable_baseline", baseline_path)
        current_ar = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(current_ar)

    before = snapshot(B)
    registration_defs = {x["signature"]: x for x in registration["functions"]}
    default = registration_defs["public.tg_create_default_pfs()"]
    fence = registration_defs["platform_private.c2p1_settings_fence()"]
    assert before["registration"]["default_md5"] in (OLD_REGISTRATION_MD5, default["definition_md5"]), before
    assert before["registration"]["fence_md5"] == fence["definition_md5"], before
    # Somente a baseline antiga conhecida é substituída pela captura integral atual.
    if before["registration"]["default_md5"] == OLD_REGISTRATION_MD5:
        B.sql(default["definition"])
    B.sql("REVOKE ALL ON FUNCTION public.tg_create_default_pfs() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.tg_create_default_pfs() TO service_role;")

    historical = next(t for t in money["tables"] if t["name"] == "accounts_receivable")
    expected = current_ar.table_metadata(historical)
    shape = lambda rows: sorted(({"name": x["name"], "definition": x["definition"], "enabled": x["enabled"]} for x in rows), key=lambda x: x["name"])
    before_triggers = shape(before["receivable"]["triggers"])
    historical_triggers = shape(historical["triggers"])
    if before["receivable"]["trigger_md5"] != current_ar.TRIGGERS_MD5:
        assert before_triggers == historical_triggers, {"before": before_triggers, "expected_nine": historical_triggers}
        assert B.last("SELECT to_regprocedure('platform_private.delivery_no_downstream_20261030()') IS NULL;") == "t"
        current_ar.restore(B.sql)
    else:
        # O checkpoint revisto já pode conter o décimo gatilho. Não recriar nem
        # substituir a guarda: somente a composição exata é aceita.
        assert before_triggers == shape(expected["triggers"]), before_triggers
        assert before["downstream_guard"] and before["downstream_guard"]["md5"] == current_ar.FUNCTION_MD5, before
        B.sql("REVOKE ALL ON public.accounts_receivable FROM anon,authenticated,service_role; GRANT DELETE,INSERT,MAINTAIN,SELECT,UPDATE ON public.accounts_receivable TO anon,authenticated; GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON public.accounts_receivable TO postgres,service_role;")

    after = snapshot(B)
    assert set(after["receivable"]["acl"].strip("{}").split(",")) == set(current_ar.ACL.strip("{}").split(",")), after["receivable"]["acl"]
    assert after["receivable"]["acl_md5"] == current_ar.ACL_MD5, after
    assert after["receivable"]["trigger_md5"] == current_ar.TRIGGERS_MD5, after
    assert shape(after["receivable"]["triggers"]) == shape(expected["triggers"]), after
    assert after["receivable"]["rls"] is True and after["receivable"]["force_rls"] is False
    assert after["downstream_guard"]["md5"] == current_ar.FUNCTION_MD5, after
    assert after["downstream_guard"]["owner"] == "postgres" and after["downstream_guard"]["acl"] == "{postgres=X/postgres}", after
    assert after["registration"]["default_md5"] == default["definition_md5"], after
    assert after["registration"]["fence_md5"] == fence["definition_md5"], after
    assert after["registration"]["default_owner"] == default["owner"] and after["registration"]["default_acl"] == default["acl"], after
    actual_registration_triggers = sorted(after["registration_triggers"], key=lambda x: x["name"])
    expected_registration_triggers = sorted((dict(name="trg_create_default_pfs" if "trg_create_default_pfs" in x["definition"] else "c2p1_settings_fence", **x) for x in registration["triggers"]), key=lambda x: x["name"])
    assert actual_registration_triggers == expected_registration_triggers, {"actual": actual_registration_triggers, "expected": expected_registration_triggers}

    evidence = {
        "status": "LOCAL_REAL_BASELINES_COMPOSED_NOT_HOSTED",
        "canonical_ref": CANONICAL_REF,
        "before": before,
        "after": after,
        "expected": {"acl_md5": current_ar.ACL_MD5, "trigger_md5": current_ar.TRIGGERS_MD5,
                     "guard_md5": current_ar.FUNCTION_MD5, "registration_md5": default["definition_md5"],
                     "settings_fence_md5": fence["definition_md5"]},
        "sources": {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in (registration_path, money_path, baseline_path, current_ar.SOURCE)},
        "candidate_change": False,
        "hosted": False,
    }
    (out / "real-baselines.json").write_text(json.dumps(evidence, indent=2) + "\n")
    return evidence


def negative_controls(B, Q, out):
    # A cerca real deve negar antes de qualquer configuração implícita ou ticket inventado.
    settings = B.run_raw(f"RESET ROLE;SET request.jwt.claim.sub='{Q.UADM}';SET request.jwt.claims='{{\"sub\":\"{Q.UADM}\",\"iat\":1}}';INSERT INTO public.partner_financial_settings(partner_id) VALUES('00000000-0000-0000-0000-000000000099');")
    assert settings.returncode != 0 and "C2P1_SETTINGS_WRITE_CLOSED" in settings.stderr, settings.stderr
    receivable_id = B.last("SELECT id FROM public.accounts_receivable ORDER BY id LIMIT 1;")
    assert receivable_id, "REAL_RECEIVABLE_SENTINEL_REQUIRED"
    operations = {}
    for operation, statement in (
        ("UPDATE", f"UPDATE public.accounts_receivable SET description=description WHERE id='{receivable_id}'"),
        ("DELETE", f"DELETE FROM public.accounts_receivable WHERE id='{receivable_id}'"),
        ("INSERT", f"INSERT INTO public.accounts_receivable SELECT * FROM public.accounts_receivable WHERE id='{receivable_id}'"),
    ):
        result = B.run_raw(f"RESET ROLE;SET request.jwt.claim.sub='{Q.UADM}';BEGIN;INSERT INTO platform_private.delivery_context_20261030(txid,actor,organization_id,action) VALUES(txid_current(),'{Q.UADM}','{Q.A}','test');{statement};ROLLBACK;")
        assert result.returncode != 0 and "DELIVERY_DOWNSTREAM_FORBIDDEN" in result.stderr, (operation, result.stdout, result.stderr)
        operations[operation] = {"returncode": result.returncode, "stderr": result.stderr}
    evidence = {"status": "PASS", "settings_direct_write": {"returncode": settings.returncode, "stderr": settings.stderr},
                "delivery_receivable_denials": operations, "transaction_rollback": True, "hosted": False}
    (out / "real-baseline-negatives.json").write_text(json.dumps(evidence, indent=2) + "\n")
    return evidence


def assert_current(B, out, name, root):
    root = Path(root)
    current_ar = B.load("new_current_receivable_baseline_post", root / "scripts/b2b-downstream-audit-20261107/b4/review-d6cd95c0/current_receivable_baseline.py") if hasattr(B, "load") else None
    if current_ar is None:
        import importlib.util
        path = root / "scripts/b2b-downstream-audit-20261107/b4/review-d6cd95c0/current_receivable_baseline.py"
        spec = importlib.util.spec_from_file_location("new_current_receivable_baseline_post", path)
        current_ar = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(current_ar)
    current = snapshot(B)
    assert current["receivable"]["acl_md5"] == current_ar.ACL_MD5, current
    assert current["receivable"]["trigger_md5"] == current_ar.TRIGGERS_MD5, current
    assert current["downstream_guard"]["md5"] == current_ar.FUNCTION_MD5, current
    assert current["registration"]["default_md5"] == "76bd832ba608662d84f1641f8a3b8226", current
    assert current["registration"]["fence_md5"] == "f87cc2894dc551d242c2586f17e2cdd4", current
    (out / name).write_text(json.dumps({"status": "PASS", "snapshot": current, "hosted": False}, indent=2) + "\n")
    return current
