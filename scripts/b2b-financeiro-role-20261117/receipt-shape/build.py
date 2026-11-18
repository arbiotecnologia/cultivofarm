#!/usr/bin/env python3
"""Receipt-only review delta. No hosted execution; frozen catalog input."""
import hashlib, json
from pathlib import Path
H = Path(__file__).resolve().parent
assert hashlib.sha256((H/'captured/catalog.json').read_bytes()).hexdigest() == '492643dac7006e445e899677f1e8d71d80f3ecf529a6373775a54025b66c4240', 'CAPTURE_DRIFT'
C = json.loads((H/'captured/catalog.json').read_text())
assert C['ref'] == 'swzpzcwiasxmjutrmvkm'
OLD = next(c['definition'] for c in C['constraints'] if c['name']=='c2_receipt_roles_shape')
EXPR = OLD[7:-1]
REPARSED = "CHECK (((external_roles IS NULL) OR ((cardinality(external_roles) >= 1) AND (cardinality(external_roles) <= 3) AND (array_position(external_roles, NULL::app_role) IS NULL) AND (external_roles <@ ARRAY['parceiro_b2b'::app_role, 'parceiro_b2b_tecnico'::app_role, 'cliente_produtor'::app_role]))))"
NEW_EXPR = f"({EXPR} OR (external_roles = ARRAY['parceiro_b2b_financeiro']::public.app_role[]))"
# Canonical pg_get_constraintdef output confirmed by the disposable regression.
NEW = "CHECK (((external_roles IS NULL) OR ((cardinality(external_roles) >= 1) AND (cardinality(external_roles) <= 3) AND (array_position(external_roles, NULL::app_role) IS NULL) AND (external_roles <@ ARRAY['parceiro_b2b'::app_role, 'parceiro_b2b_tecnico'::app_role, 'cliente_produtor'::app_role])) OR (external_roles = ARRAY['parceiro_b2b_financeiro'::app_role])))"
def lit(s): return "'"+s.replace("'","''")+"'"
def guard(accepted):
    return f"""DO $guard$ DECLARE d text; valid boolean; BEGIN
 IF current_setting('app.expected_ref',true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN
 RAISE EXCEPTION 'B2B_FIN_RECEIPT_REF_UNPROVEN'; END IF;
 SELECT pg_get_constraintdef(oid),convalidated INTO d,valid FROM pg_constraint
 WHERE conrelid='platform_private.b2b_provisioning_receipts'::regclass AND conname='c2_receipt_roles_shape' AND contype='c';
 IF valid IS DISTINCT FROM true OR d IS NULL OR d NOT IN ({','.join(lit(s) for s in accepted)}) THEN
 RAISE EXCEPTION 'B2B_FIN_RECEIPT_DRIFT'; END IF;
END $guard$;
"""
def replace(expr):
    return f"ALTER TABLE platform_private.b2b_provisioning_receipts DROP CONSTRAINT c2_receipt_roles_shape;\nALTER TABLE platform_private.b2b_provisioning_receipts ADD CONSTRAINT c2_receipt_roles_shape CHECK ({expr});\n"
header="-- REVIEW ONLY: root validates the actual connected ref; SET app.expected_ref is a safety pin, NOT proof of connection or authorization.\n-- No data/ACL/RLS/function changes. All existing rows validated transactionally.\n"
files={
 '01-pre.sql.readonly': header+'BEGIN READ ONLY;\n'+guard([OLD,REPARSED,NEW])+"SELECT 'PRE_RECEIPT_PASS',pg_get_constraintdef(oid),md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='platform_private.b2b_provisioning_receipts'::regclass AND conname='c2_receipt_roles_shape';\nROLLBACK;\n",
 '02-install.sql.review':header+"BEGIN;\nSET LOCAL lock_timeout='3s';\nLOCK TABLE platform_private.b2b_provisioning_receipts IN ACCESS EXCLUSIVE MODE;\n"+guard([OLD,REPARSED,NEW])+f"DO $install$ BEGIN IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='platform_private.b2b_provisioning_receipts'::regclass AND conname='c2_receipt_roles_shape') IN ({lit(OLD)},{lit(REPARSED)}) THEN\n"+replace(NEW_EXPR)+"END IF; END $install$;\n"+guard([NEW])+"COMMIT;\n",
 '03-post.sql.readonly':header+'BEGIN READ ONLY;\n'+guard([NEW])+"SELECT 'POST_RECEIPT_PASS';\nROLLBACK;\n",
 '04-rollback.sql.review':header+"BEGIN;\nSET LOCAL lock_timeout='3s';\nLOCK TABLE platform_private.b2b_provisioning_receipts IN ACCESS EXCLUSIVE MODE;\n"+guard([OLD,REPARSED,NEW])+f"DO $rollback$ BEGIN IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='platform_private.b2b_provisioning_receipts'::regclass AND conname='c2_receipt_roles_shape')={lit(NEW)} THEN\nIF EXISTS(SELECT 1 FROM platform_private.b2b_provisioning_receipts WHERE external_roles=ARRAY['parceiro_b2b_financeiro']::public.app_role[]) THEN RAISE EXCEPTION 'B2B_FIN_RECEIPT_ROLLBACK_HISTORY_PRESERVED'; END IF;\n"+replace(EXPR)+"END IF; END $rollback$;\n"+guard([OLD,REPARSED])+"COMMIT;\n",
 '05-post-rollback.sql.readonly':header+'BEGIN READ ONLY;\n'+guard([OLD,REPARSED])+"SELECT 'POST_RECEIPT_ROLLBACK_PASS';\nROLLBACK;\n"
}
for n,s in files.items(): (H/n).write_text(s)
(H/'pins.json').write_text(json.dumps({'ref':C['ref'],'legacy':OLD,'legacy_reparsed':REPARSED,'candidate':NEW,'legacy_md5':hashlib.md5(OLD.encode()).hexdigest(),'candidate_md5':hashlib.md5(NEW.encode()).hexdigest()},indent=2)+'\n')
(H/'SHA256SUMS').write_text(''.join(f'{hashlib.sha256((H/n).read_bytes()).hexdigest()}  {n}\n' for n in sorted(files)))