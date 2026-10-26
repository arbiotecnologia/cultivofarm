"""Assemble review-only SQL for the accounting-pending external request evolution.
Never connects to any database. Builds on the reviewed b5 package (final-integrated-manual-20261024)
byte-for-byte and fails closed if any patch anchor is not found exactly once."""
import json, sys
from pathlib import Path
D = Path(__file__).resolve().parent
B5 = D.parent / 'credit-numeric-20261024/final-integrated-manual-20261024/origin'
ROOT = Path('/dev-server')
E = json.loads((D / 'expected.json').read_text())
b5 = (B5 / 'candidate.sql.review').read_text()
b5_post = (B5 / 'postflight.sql').read_text()
OWNER_A = '007bb519-cba0-4704-be2c-cb93ad010048'

def once(hay, needle, label):
    n = hay.count(needle)
    if n != 1: sys.exit(f'ANCHOR_{label}: found {n}')

def fn(sig_start):
    i = b5.index(sig_start); k = b5.index('$function$', i); j = b5.index('$function$', k + 10) + len('$function$')
    return b5[i:j]

# 1) Install-time accounting gate is replaced by per-order honest pending state (see guard patch).
g0 = b5.index('DO $accounting_gate$'); g1 = b5.index('END $accounting_gate$;') + len('END $accounting_gate$;\n')
body = b5[:g0] + '-- Install-time owner A gate removed: accounting readiness is enforced per order (C2_ACCOUNTING_PENDING) below.\n' + b5[g1:]
assert body.rstrip().endswith('COMMIT;')
body = body.rstrip()[:-len('COMMIT;')]

# 2) Snapshot guard: external create records honest pending origin when issuer is not validated.
guard = fn('CREATE OR REPLACE FUNCTION platform_private.b2b_internal_order_snapshot_guard()')
ext0 = guard.index("IF TG_OP='INSERT' AND platform_private.has_ticket('c2_external_order_create',NEW.partner_id) THEN")
ext1 = guard.index('  PERFORM platform_private.c2_external_origin_assert(NEW.c2_external_origin_snapshot,NEW.partner_id,NEW.cliente_id);', ext0)
seg = guard[ext0:ext1]
a0 = seg.index("  IF candidate_count<>1 THEN RAISE EXCEPTION 'B2B_INTERNAL_ISSUER_AMBIGUOUS'")
v1 = seg.index("  NEW.c2_external_origin_snapshot:=jsonb_build_object('contract','C2_EXTERNAL_ORDER_ORIGIN_V1'")
v1_line = seg[v1:]
assert v1_line.count('\n') == 1
new_seg = seg[:a0] + """  IF candidate_count>1 THEN RAISE EXCEPTION 'B2B_INTERNAL_ISSUER_AMBIGUOUS' USING ERRCODE='42501'; END IF;
  IF candidate_count=1 THEN SELECT * INTO cs FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active FOR SHARE; END IF;
  IF candidate_count=1 AND cs.configuration_status='VALIDATED' AND cs.accounting_validated_at IS NOT NULL AND nullif(btrim(cs.legal_name),'') IS NOT NULL AND nullif(btrim(cs.cnpj),'') IS NOT NULL THEN
""" + '  ' + v1_line + """  ELSE
   -- C2_ACCOUNTING_PENDING_V1: honest non-fiscal request; no issuer identity/attestation is copied or invented.
   NEW.c2_external_origin_snapshot:=jsonb_build_object('contract','C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1','schema_version','1','organization_id',org,'creditor_organization_id',org,'actor_user_id',uid,'partner_id',NEW.partner_id,'issuer_state',CASE WHEN candidate_count=0 THEN 'NOT_CONFIGURED' ELSE coalesce(cs.configuration_status,'UNKNOWN') END,'company_settings_id',cs.id,'accounting_validated',false);
  END IF;
"""
guard_p = guard.replace(seg, new_seg, 1)
imm_old = "  IF NEW.c2_external_origin_snapshot IS DISTINCT FROM OLD.c2_external_origin_snapshot OR NEW.internal_origin_snapshot"
once(guard_p, imm_old, 'IMMUTABLE')
guard_p = guard_p.replace(imm_old, "  IF (NEW.c2_external_origin_snapshot IS DISTINCT FROM OLD.c2_external_origin_snapshot AND NOT platform_private.c2_accounting_promotion_ok(OLD.c2_external_origin_snapshot,NEW.c2_external_origin_snapshot,NEW.id)) OR NEW.internal_origin_snapshot")
ast_old = "  PERFORM platform_private.c2_external_origin_assert(OLD.c2_external_origin_snapshot,OLD.partner_id,OLD.cliente_id);"
once(guard_p, ast_old, 'UPDATE_ASSERT')
guard_p = guard_p.replace(ast_old, ast_old + "\n  PERFORM platform_private.c2_external_origin_assert(NEW.c2_external_origin_snapshot,NEW.partner_id,NEW.cliente_id);")

# 3) Origin assert accepts exactly two server contracts.
ast = fn('CREATE FUNCTION platform_private.c2_external_origin_assert(s jsonb, partner uuid, client uuid)')
c_old = " OR s->>'contract' IS DISTINCT FROM 'C2_EXTERNAL_ORDER_ORIGIN_V1'\n OR NOT platform_private.b2b_internal_origin_valid(s)\n"
once(ast, c_old, 'ASSERT_CONTRACT')
ast_p = ast.replace(c_old, " OR NOT platform_private.c2_external_origin_contract_valid(s)\n").replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION', 1)

# 4) Approval and billing deny pending requests explicitly before any write.
appr = fn('CREATE OR REPLACE FUNCTION public.approve_partner_order(p_order_id uuid')
nf = "  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;\n"
once(appr, nf, 'APPROVE')
PENDING_CHECK = "IF EXISTS(SELECT 1 FROM public.partner_orders WHERE id={id} AND c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1') THEN RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501'; END IF;"
appr_p = appr.replace(nf, nf + '  ' + PENDING_CHECK.format(id='p_order_id') + '\n')
# 4b) Single credit lock domain (review 8cad/38): approve used hashtext(...) (int4) while create and the
# canonical credit trigger use hashtextextended(...,0) (int8) -> different advisory keys, so approve evaluated
# exposure without serializing against create. Use the canonical key and re-validate authority after a wait.
LOCK_OLD = "  PERFORM pg_advisory_xact_lock(hashtext('b2b_credit:' || v_pid::text));\n"
once(appr_p, LOCK_OLD, 'APPROVE_CREDIT_LOCK')
LOCK_NEW = """  -- C2 single credit lock domain: same bigint key as create_partner_order_secure and tg_partner_orders_credit_guard.
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || v_pid::text, 0));
  -- Re-validate authority after a possible wait (READ COMMITTED: each statement sees revocations committed meanwhile).
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT (public.b2b_phase1_order_visible(p_order_id) OR EXISTS (SELECT 1 FROM public.partner_orders po WHERE po.id=p_order_id
      AND platform_private.c2p1_settings_allowed(po.partner_id,true))) THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;
"""
appr_p = appr_p.replace(LOCK_OLD, LOCK_NEW, 1)
assert "hashtext('b2b_credit:" not in appr_p
# 4c) approve_b2b_credit (captured LIVE 1d5ba930, review e1e9aa2f): exposure-neutral transition
# (aguardando_aprovacao_credito and em_analise_comercial are both counted in v_pending), so no credit lock is
# required; but authority was only checked BEFORE the row-lock wait. Re-validate after FOR UPDATE and deny
# pending-accounting explicitly before any write. Scope stays b2b_phase1_order_visible only (not widened).
LIVE_ABC_MD5 = '1d5ba930634e165750352e9f44fa844f'
abc = (D / 'src/live-approve_b2b_credit.sql').read_text().strip()
abc_nf = "  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;\n"
once(abc, abc_nf, 'ABC_NOTFOUND')
abc_p = abc.replace(abc_nf, abc_nf + """  -- Re-validate authority after the row-lock wait (READ COMMITTED sees revocations committed meanwhile).
  IF NOT public.b2b_phase1_order_visible(p_partner_order_id) THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor')
          OR public.has_role(v_uid,'financeiro')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  """ + PENDING_CHECK.format(id='p_partner_order_id') + "\n", 1)
gen = fn('CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure(p_partner_order_id uuid)')
d_old = " IF EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_partner_order_id AND internal_origin_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;\n"
once(gen, d_old, 'GENERATE')
auth_end = "    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';\n  END IF;\n"
once(gen, auth_end, 'GENERATE_AUTH')
gen_p = gen.replace(d_old, '', 1).replace(auth_end, auth_end + ' ' + d_old.strip() + '\n ' + PENDING_CHECK.format(id='p_partner_order_id') + '\n', 1)

# 5) Reviewed v4 owner writer (replaces LIVE SELECT false).
old = (ROOT / 'scripts/owner-orders-20261023/candidate.sql.review').read_text()
w0 = old.index('CREATE FUNCTION platform_private.c2_owner_order_create_allowed'); w1 = old.index('END $function$', w0) + len('END $function$')
writer = old[w0:w1].replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION', 1)

new_fns = (D / 'src/new-functions.sql').read_text()
overlay = '\n-- ===== C2_ACCOUNTING_PENDING_V1 overlay (same transaction) =====\n' + '\n'.join([
    ast_p + ';', guard_p + ';', appr_p + ';', gen_p + ';', writer + ';', abc_p + ';',
    'ALTER FUNCTION platform_private.c2_owner_order_create_allowed(uuid,uuid) OWNER TO postgres;',
    'REVOKE ALL ON FUNCTION platform_private.c2_owner_order_create_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated;',
    new_fns])
(D / 'src/patched-bodies.sql').write_text('\n'.join([ast_p, guard_p, appr_p, gen_p, writer, abc_p]) + '\n')

def proc(sig, md5, label):
    return f"IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='{sig}'::regprocedure AND md5(pg_get_functiondef(oid))='{md5}' AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION '{label}:{sig}'; END IF;"
post = "DO $c2ap_post$ BEGIN\n " + "\n ".join([proc(k, v, 'C2AP_POST_DRIFT') for k, v in E['candidate'].items()] + [
    "IF has_function_privilege('authenticated','platform_private.c2_owner_order_create_allowed(uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','platform_private.c2_accounting_promotion_ok(jsonb,jsonb,uuid)','EXECUTE') OR has_function_privilege('authenticated','platform_private.c2_external_origin_contract_valid(jsonb)','EXECUTE') OR has_function_privilege('authenticated','platform_private.c2_accounting_pending_guard()','EXECUTE') OR has_function_privilege('anon','public.c2_promote_accounting_pending_order_v1(uuid,timestamptz)','EXECUTE') OR has_function_privilege('anon','platform_private.c2_promote_accounting_pending_order_core(uuid,timestamptz)','EXECUTE') OR (SELECT prosecdef FROM pg_proc WHERE oid='public.c2_promote_accounting_pending_order_v1(uuid,timestamptz)'::regprocedure) OR NOT (SELECT prosecdef FROM pg_proc WHERE oid='platform_private.c2_promote_accounting_pending_order_core(uuid,timestamptz)'::regprocedure) OR NOT has_function_privilege('authenticated','public.c2_promote_accounting_pending_order_v1(uuid,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'C2AP_POST_ACL'; END IF;",
    "IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_orders'::regclass AND tgname='zz_c2_accounting_pending' AND tgenabled='O') THEN RAISE EXCEPTION 'C2AP_POST_TRIGGER'; END IF;"]) + "\nEND $c2ap_post$;\n"
head = "-- REVIEW ONLY / INACTIVE. Never apply without independent review and owner-run release.\n-- Composes the reviewed b5 package (minus install-time accounting gate) + C2_ACCOUNTING_PENDING_V1 in ONE transaction.\n-- Opens only the canonical external request; approval, billing, NF and delivery stay closed while the issuer is not validated.\n"
(D / 'candidate.sql.review').write_text(head + body + overlay + '\n' + post + 'COMMIT;\n')
# Preflight = b5 structural preflight verbatim (READ ONLY; LIVE writer false a0417d is part of it).
(D / 'preflight.sql').write_text(head + (B5 / 'preflight.sql').read_text())
# Postflight = b5 postflight with the five overlaid hashes substituted + own POST.
pf = b5_post
for k, v in E['b5_to_candidate'].items():
    if pf.count(k) != 1: sys.exit(f'POSTFLIGHT_ANCHOR {k}: {pf.count(k)}')
    pf = pf.replace(k, v)
old_cnt = "'public.partner_orders'::regclass))<>48 THEN RAISE EXCEPTION 'origin_unexpected_trigger'"
if pf.count(old_cnt) != 1: sys.exit('POSTFLIGHT_TRIGGER_ANCHOR')
pf = pf.replace(old_cnt, "'public.partner_orders'::regclass))<>49 THEN RAISE EXCEPTION 'origin_unexpected_trigger'")  # +zz_c2_accounting_pending
pf = pf.rstrip()
assert pf.endswith('COMMIT;')
(D / 'postflight.sql').write_text(head + pf[:-len('COMMIT;')] + post + "SELECT 'C2AP_POSTFLIGHT_PASS';\nCOMMIT;\n")
# Rollback: restore exact b5 bodies + LIVE writer false, drop overlay objects. Orders/snapshots preserved.
live_writer = (B5 / 'baseline/platform_private.c2_owner_order_create_allowed.sql').read_text().strip()
rb_pre = "DO $c2ap_rb_pre$ BEGIN\n " + "\n ".join(proc(k, v, 'C2AP_ROLLBACK_PRE_DRIFT') for k, v in E['candidate'].items()) + "\nEND $c2ap_rb_pre$;\n"
rb_post = "DO $c2ap_rb_post$ BEGIN\n " + "\n ".join([proc(k, v, 'C2AP_ROLLBACK_POST_DRIFT') for k, v in E['b5_hashes'].items()] + [proc('public.approve_b2b_credit(uuid,text)', LIVE_ABC_MD5, 'C2AP_ROLLBACK_POST_DRIFT'), "IF (SELECT proacl::text FROM pg_proc WHERE oid='public.approve_b2b_credit(uuid,text)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' THEN RAISE EXCEPTION 'C2AP_ROLLBACK_POST_ACL:approve_b2b_credit'; END IF;",
    "IF to_regprocedure('public.c2_promote_accounting_pending_order_v1(uuid,timestamptz)') IS NOT NULL OR to_regprocedure('platform_private.c2_promote_accounting_pending_order_core(uuid,timestamptz)') IS NOT NULL OR to_regprocedure('platform_private.c2_accounting_pending_guard()') IS NOT NULL THEN RAISE EXCEPTION 'C2AP_ROLLBACK_PRESENT'; END IF;"]) + "\nEND $c2ap_rb_post$;\n"
(D / 'rollback.sql.review').write_text(head + "-- Rollback: writer back to LIVE false; b5 bodies restored byte-exact; pending requests stay as immutable history (frozen: b5 assert rejects the pending contract on any update).\nBEGIN;\nSET LOCAL lock_timeout='5s';\n" + rb_pre +
    "DROP TRIGGER zz_c2_accounting_pending ON public.partner_orders;\n" +
    '\n'.join([ast + ';'.replace('', ''), guard + ';', appr + ';', gen + ';']).replace('CREATE FUNCTION platform_private.c2_external_origin_assert', 'CREATE OR REPLACE FUNCTION platform_private.c2_external_origin_assert', 1) +
    "\n" + abc + ";\n" + live_writer + ";\nALTER FUNCTION platform_private.c2_owner_order_create_allowed(uuid,uuid) OWNER TO postgres;\n" +
    "DROP FUNCTION public.c2_promote_accounting_pending_order_v1(uuid,timestamptz);\nDROP FUNCTION platform_private.c2_promote_accounting_pending_order_core(uuid,timestamptz);\nDROP FUNCTION platform_private.c2_accounting_pending_guard();\nDROP FUNCTION platform_private.c2_accounting_promotion_ok(jsonb,jsonb,uuid);\nDROP FUNCTION platform_private.c2_external_origin_contract_valid(jsonb);\n" + rb_post + "COMMIT;\n")
exec(compile((D/'src/rebase_30dc.py').read_text(),'rebase_30dc.py','exec'))
# LIVE pin for approve_b2b_credit in PRE (READ ONLY), candidate pre-DDL and restore-live pre; restore-live restores it.
ABC_PRE = "DO $c2ap_abc_pre$ BEGIN\n " + proc('public.approve_b2b_credit(uuid,text)', LIVE_ABC_MD5, 'C2AP_ABC_PRE_DRIFT') + "\n IF (SELECT proacl::text FROM pg_proc WHERE oid='public.approve_b2b_credit(uuid,text)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' THEN RAISE EXCEPTION 'C2AP_ABC_PRE_ACL'; END IF;\nEND $c2ap_abc_pre$;\n"
for name, after in [('preflight.sql', 'BEGIN READ ONLY;\n'), ('candidate.sql.review', 'BEGIN;\n')]:
    t = (D / name).read_text(); assert t.count(after) >= 1, name; k = t.index(after) + len(after); (D / name).write_text(t[:k] + ABC_PRE + t[k:])
t = (D / 'restore-live.sql.review').read_text()
a1 = "DROP TRIGGER zz_c2_accounting_pending ON public.partner_orders;\n"; assert t.count(a1) == 1
t = t.replace(a1, a1 + abc + ";\n", 1)
a2 = "DO $c2ap_restore_post$ BEGIN\n "; assert t.count(a2) == 1
t = t.replace(a2, a2 + proc('public.approve_b2b_credit(uuid,text)', LIVE_ABC_MD5, 'C2AP_RESTORE_POST_DRIFT') + "\n ", 1)
(D / 'restore-live.sql.review').write_text(t)
# Audit diff regenerated from the FINAL assembled bodies (never hand-edited).
import difflib
def _final(sig_start):
    t=(D/'candidate.sql.review').read_text(); i=t.rindex(sig_start); k=t.index('$function$',i); j=t.index('$function$',k+10)+len('$function$'); return t[i:j]
pairs=[('platform_private.c2_external_origin_assert',ast,'CREATE OR REPLACE FUNCTION platform_private.c2_external_origin_assert('),
 ('platform_private.b2b_internal_order_snapshot_guard',guard,'CREATE OR REPLACE FUNCTION platform_private.b2b_internal_order_snapshot_guard()'),
 ('public.approve_partner_order',appr,'CREATE OR REPLACE FUNCTION public.approve_partner_order(p_order_id uuid'),
 ('public.generate_b2b_receivable_secure',gen,'CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure(p_partner_order_id uuid)'),
 ('platform_private.c2_owner_order_create_allowed',live_writer,'CREATE OR REPLACE FUNCTION platform_private.c2_owner_order_create_allowed'),
 ('public.approve_b2b_credit',abc,'CREATE OR REPLACE FUNCTION public.approve_b2b_credit(')]
out=[]
for name,before,anchor in pairs:
    after=_final(anchor)
    out+=difflib.unified_diff((before.strip()+'\n').splitlines(True),(after.strip()+'\n').splitlines(True),(f'live/{name}' if name in ('public.approve_b2b_credit','platform_private.c2_owner_order_create_allowed') else f'b5/{name}'),f'candidate/{name}')
out+=difflib.unified_diff([],new_fns.splitlines(True),'/dev/null','candidate/src/new-functions.sql')
(D/'overlay.diff').write_text(''.join(out))
print('assembled')
