# Executed by assemble.py (never connects to a database).
# 1) Rebases every b5 pin of c2_order_actor_scope from the pre-30dc8243 body (6802c693...) to the LIVE body
#    installed by commercial_portfolio_catalog_entry_guarded (54c4327d...), and adds exact pins for the other
#    30dc8243 objects so PRE/candidate/POST/rollback all prove the commercial entry/catalog stays untouched.
# 2) Generates restore-live.sql.review: full return to the pre-implantation LIVE function set, ONLY when no row
#    carries c2_external_origin_snapshot (otherwise fail-closed; rollback.sql.review is then the only option and
#    it is partial containment, not baseline).
import re
OLD_SCOPE = '6802c693f459a92e70dade0c73d7faba'
NEW_SCOPE = '54c4327d63f48e39f598129ff9dd8f09'
C30 = json.loads((D.parent.parent / 'commercial-order-entry-20261024/expected.json').read_text())['candidate']
assert C30['platform_private.c2_order_actor_scope(uuid,uuid)'] == NEW_SCOPE
CAT_ACL = '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'

def pins30(label):
    out = []
    for sig, h in C30.items():
        out.append(f"IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='{sig}'::regprocedure AND md5(pg_get_functiondef(oid))='{h}' AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION '{label}:{sig}'; END IF;")
    out.append(f"IF (SELECT proacl::text FROM pg_proc WHERE oid='platform_private.c2_order_actor_scope(uuid,uuid)'::regprocedure) IS DISTINCT FROM '{{postgres=X/postgres}}' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.get_partner_catalog_secure(uuid)'::regprocedure) IS DISTINCT FROM '{CAT_ACL}' THEN RAISE EXCEPTION '{label}_ACL:30dc8243'; END IF;")
    out.append(f"IF has_function_privilege('authenticated','platform_private.c2_internal_order_target_reason(uuid,uuid)','EXECUTE') OR has_function_privilege('anon','public.c2_internal_order_entry_capability_v1()','EXECUTE') OR NOT has_function_privilege('authenticated','public.c2_internal_order_entry_capability_v1()','EXECUTE') THEN RAISE EXCEPTION '{label}_PRIV:30dc8243'; END IF;")
    return f"DO $c2ap_30dc_{label.lower()}$ BEGIN\n " + "\n ".join(out) + f"\nEND $c2ap_30dc_{label.lower()}$;\n"

def rebase(name, label, after):
    p = D / name; s = p.read_text()
    n = s.count(OLD_SCOPE)
    if name != 'rollback.sql.review' and n < 1: sys.exit(f'REBASE_ANCHOR {name}: {n}')
    s = s.replace(OLD_SCOPE, NEW_SCOPE)
    if s.count(after) < 1: sys.exit(f'REBASE_INSERT {name}')
    i = s.index(after) + len(after)
    p.write_text(s[:i] + pins30(label) + s[i:])

rebase('preflight.sql', 'C2AP_30DC_PRE_DRIFT', 'BEGIN READ ONLY;\n' if 'BEGIN READ ONLY;\n' in (D/'preflight.sql').read_text() else 'BEGIN;\n')
rebase('candidate.sql.review', 'C2AP_30DC_CAND_DRIFT', 'BEGIN;\n')
rebase('postflight.sql', 'C2AP_30DC_POST_DRIFT', 'BEGIN READ ONLY;\n' if 'BEGIN READ ONLY;\n' in (D/'postflight.sql').read_text() else 'BEGIN;\n')
rebase('rollback.sql.review', 'C2AP_30DC_RB_DRIFT', "SET LOCAL lock_timeout='5s';\n")

# ---- Full restoration to pre-implantation LIVE (fail-closed when pending/external history exists) ----
pre = (B5 / 'preflight.sql').read_text()
def live_md5(sig):
    m = re.search(re.escape(f"oid='{sig}'::regprocedure AND md5(pg_get_functiondef(oid))='") + r"([0-9a-f]{32})", pre)
    if not m: sys.exit(f'LIVE_PIN_MISSING {sig}')
    return m.group(1)
RESTORE = {
 'public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)': 'public.create_partner_order_secure.sql',
 'platform_private.b2b_internal_order_snapshot_guard()': 'platform_private.b2b_internal_order_snapshot_guard.sql',
 'platform_private.b2b_internal_child_snapshot_guard()': 'platform_private.b2b_internal_child_snapshot_guard.sql',
 'public.approve_partner_order(uuid,text,date)': 'public.approve_partner_order.sql',
 'public.generate_b2b_receivable_secure(uuid)': 'public.generate_b2b_receivable_secure.sql',
 'public.generate_b2b_receivable_secure_impl(uuid)': 'public.generate_b2b_receivable_secure_impl.sql',
 'public.fn_generate_receivable_installments()': 'public.fn_generate_receivable_installments.sql',
 'platform_private.c2_owner_order_create_allowed(uuid,uuid)': 'platform_private.c2_owner_order_create_allowed.sql',
}
LIVE = {k: live_md5(k) for k in RESTORE}
E['live_restore'] = LIVE
cand_pins = "\n ".join(proc(k, v, 'C2AP_RESTORE_PRE_DRIFT') for k, v in E['candidate'].items())
live_pins = "\n ".join(proc(k, v, 'C2AP_RESTORE_POST_DRIFT') for k, v in LIVE.items())
import re as _re
_b5a=(B5/'assemble.py').read_text()
_fin=_re.search(r"^FIN\s*=\s*(.+)$",_b5a,_re.M).group(1)
FIN=eval(_fin,{'Path':Path,'ROOT':ROOT,'H':B5,'D':B5,'OUT':B5})
# LIVE manual correction (e99d634) body is the deployed AR source, not the older b5 baseline file.
RESTORE['public.fn_generate_receivable_installments()']=FIN/'fn_generate_receivable_installments.sql.review'
bodies = "\n".join(((B5 / 'baseline' / f) if isinstance(f,str) else f).read_bytes().decode().strip() + ';' for f in RESTORE.values())
restore = head + """-- FULL RESTORE TO PRE-IMPLANTATION LIVE (function set + column) — REVIEW ONLY.
-- Fail-closed precondition: no partner_orders row carries c2_external_origin_snapshot (no pending/external history).
-- If history exists this script aborts BEFORE any DDL; use rollback.sql.review (partial containment) instead.
-- Preserves 30dc8243 (commercial entry/catalog) and the LIVE manual initial-installments correction byte-exact.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
LOCK TABLE public.partner_orders IN SHARE ROW EXCLUSIVE MODE;
""" + pins30('C2AP_30DC_RESTORE_PRE') + "DO $c2ap_restore_pre$ BEGIN\n " + cand_pins + """
 IF EXISTS(SELECT 1 FROM public.partner_orders WHERE c2_external_origin_snapshot IS NOT NULL) THEN
  RAISE EXCEPTION 'C2AP_FULL_RESTORE_BLOCKED_HISTORY: external/pending orders exist; only partial containment (rollback.sql.review) is possible without destroying history' USING ERRCODE='55000';
 END IF;
END $c2ap_restore_pre$;
DROP TRIGGER zz_c2_accounting_pending ON public.partner_orders;
DROP TRIGGER zz_c2_external_final_state ON public.partner_orders;
""" + bodies + """
DROP FUNCTION public.c2_promote_accounting_pending_order_v1(uuid,timestamptz);
DROP FUNCTION platform_private.c2_promote_accounting_pending_order_core(uuid,timestamptz);
DROP FUNCTION platform_private.c2_accounting_pending_guard();
DROP FUNCTION platform_private.c2_accounting_promotion_ok(jsonb,jsonb,uuid);
DROP FUNCTION platform_private.c2_external_final_state_guard();
DROP FUNCTION platform_private.c2_external_origin_assert(jsonb,uuid,uuid);
DROP FUNCTION platform_private.c2_external_origin_contract_valid(jsonb);
-- Column proven empty above (no data loss).
ALTER TABLE public.partner_orders DROP COLUMN c2_external_origin_snapshot;
DO $c2ap_restore_post$ BEGIN
 """ + live_pins + """
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.partner_orders'::regclass AND attname='c2_external_origin_snapshot' AND NOT attisdropped)
    OR to_regprocedure('platform_private.c2_external_origin_assert(jsonb,uuid,uuid)') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_orders'::regclass AND tgname IN ('zz_c2_accounting_pending','zz_c2_external_final_state'))
 THEN RAISE EXCEPTION 'C2AP_RESTORE_POST_RESIDUE'; END IF;
END $c2ap_restore_post$;
""" + pins30('C2AP_30DC_RESTORE_POST') + "COMMIT;\n"
(D / 'restore-live.sql.review').write_text(restore)
(D / 'expected.json').write_text(json.dumps(E, indent=1) + '\n')
