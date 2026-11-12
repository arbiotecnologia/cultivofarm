#!/usr/bin/env bash
set -euo pipefail
# Requires exact historical r12 dump built in /tmp/r12; socket local, never TCP.
OUT=${1:?output directory}; mkdir -p "$OUT"
bash scripts/c2-pilot-economic-approval-20261111/billing-delivery-20261111/fiscal-final-20261111/prep_restore.sh "$OUT" > "$OUT/restore-output.txt" 2>&1
python3 - <<'PY'
import sys
sys.path.insert(0,'/tmp/c2neg');import db
d=db.DB();h='scripts/b2b-cancellation-policy-20261112/'
d.sql(open(h+'01-pre.sql.readonly').read());d.sql(open(h+'02-install.sql.review').read())
# S-FEATURE: existing fixture lacks fiscal feature. Configuration input only, guards unchanged.
d.sql("INSERT INTO saas_features(module_id,key,name) SELECT id,'emissao_nfe_nfse','LOCAL FISCAL FEATURE' FROM saas_modules LIMIT 1; INSERT INTO organization_feature_overrides(organization_id,feature_id,mode,reason,created_by) SELECT '00000000-0000-0000-0000-000000000001',id,'GRANT','LOCAL ONLY INPUT','00000000-0000-0000-0000-000000000024' FROM saas_features WHERE key='emissao_nfe_nfse'")
d.sql('UPDATE platform_private.b2b_cancel_policy_gate_v1 SET enabled=true')
d.sql("INSERT INTO platform_private.b2b_cancel_policy_allowlist_v1(actor_id,organization_id,invoice_id,order_id,valid_until) SELECT '00000000-0000-0000-0000-000000000029',organization_id,id,partner_order_id,now()+interval '4 hours' FROM fiscal_invoices WHERE id='00000000-0000-0000-0000-000000000900'")
PY