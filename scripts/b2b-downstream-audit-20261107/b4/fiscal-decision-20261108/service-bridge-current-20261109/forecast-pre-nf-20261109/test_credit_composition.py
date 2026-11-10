#!/usr/bin/env python3
"""Static rule checks of the generated B4+forecast composition and fiscal wrappers.

Not database proof: the integrated disposable PostgreSQL run is the executed evidence.
Run: python3 test_credit_composition.py
"""
import hashlib
import json
import re
import sys
from pathlib import Path

H = Path(__file__).resolve().parent
sys.path.insert(0, str(H))
import wrappers_and_credit as W  # noqa: E402

ROOT = H.parents[5]
fails = []


def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


manifest = json.loads((H / "manifest.json").read_text())
comp = manifest["credit_composition"]
b4_body, _ = W.b4_credit_body(ROOT)
composed = (H / "credit-exposure.composed.sql").read_text()

check("B4 source body pinned to 44e8768f", hashlib.md5((b4_body + "\n").encode()).hexdigest() == W.B4_CREDIT_MD5)
check("composed body is B4 body plus only the forecast block", composed.rstrip("\n") == W.composed_credit(b4_body))
check("composed md5 pinned in manifest", hashlib.md5(composed.encode()).hexdigest() == comp["composed_md5"])
check("open titles still come only from B4 balances", "v_open:=(v_settings_json->>'saldo_em_aberto')::numeric;" in composed)
check("forecast never adds: committed is replaced by B4 residual delta", "v_committed:=v_committed-v_b4_residual+v_effective;" in composed and "v_committed:=v_committed+" not in composed)
check("canceled residual counts zero", "IF v_fc.state IN ('cancelado_antes_nf','cancelado_residual') THEN v_effective:=0;" in composed)
check("forecast must equal B4 residual otherwise (fail closed)", "CREDIT_FORECAST_RESIDUAL_DIVERGENCE" in composed)
check("tenant/partner conflict fails closed", "CREDIT_FORECAST_SCOPE_CONFLICT" in composed)

forecast_install = (H / "02-install.sql.review").read_text()
check("forecast stage 02 no longer redefines credit exposure", "CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure" not in forecast_install)
check("forecast rollback 04 no longer replaces credit exposure", "CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure" not in (H / "04-rollback-deny.sql.review").read_text())
pre09 = (H / "09-pre-credit-composition.sql.readonly").read_text()
check("09 PRE requires exact B4 body, not LIVE", W.B4_CREDIT_MD5 in pre09 and W.LIVE_CREDIT_MD5 not in pre09)
inst10 = (H / "10-install-credit-composition.sql.review").read_text()
check("10 install has exactly one credit definition", inst10.count("CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure(") == 1)
check("10 install grants nothing", not re.search(r"^\s*GRANT ", inst10, re.M))
rb12 = (H / "12-rollback-credit-composition-retain.sql.review").read_text()
check("12 rollback never restores B4/LIVE credit body", "CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure" not in rb12)
check("12 rollback restores only the stricter LIVE eligibility", rb12.count("CREATE OR REPLACE FUNCTION public.fn_b2b_order_billing_eligibility(") == 1 and W.ELIG_LIVE_MD5 in rb12)

elig = (H / "billing-eligibility.linked-terms.sql").read_text()
check("eligibility accepts only the exact linked approved child terms", "t.id = v_order.payment_terms_id AND t.partner_order_id = p_partner_order_id" in elig and "t.approved_by IS NOT NULL AND t.approved_at IS NOT NULL" in elig)
check("eligibility keeps header rejection blocking", "IF v_fin = 'rejected' THEN" in elig)

fiscal = (H / "06-install-fiscal-reconcile.sql.review").read_text()
check("wrappers granted to authenticated only", "GRANT EXECUTE ON FUNCTION public.rpc_b2b_forecast_fiscal_sync_v1(uuid,integer),public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text) TO authenticated;" in fiscal
      and "FROM PUBLIC,anon,service_role;" in fiscal)
check("no grant on private forecast helpers", not re.search(r"GRANT [^;]*platform_private\.b2b_financial_forecast", fiscal + forecast_install))
check("wrappers re-authorize after locks", W.SYNC.count("platform_private.c2p1_internal_actor(") == 2 and W.CANCEL.count("platform_private.c2p1_internal_actor(") == 2)
check("sync derives event from fiscal transmission, never from caller payload", "p_payload" not in W.SYNC and "FROM public.fiscal_sefaz_transmissions WHERE id=p_transmission_id FOR SHARE" in W.SYNC)
check("authorized return confirms only through H13 bridge", "'fiscal_confirmation','H13_BRIDGE_ONLY'" in W.SYNC)
check("cancel blocked while fiscal in flight or close pending", "B2B_FORECAST_FISCAL_IN_FLIGHT" in W.CANCEL and "B2B_FORECAST_FISCAL_RECONCILIATION_PENDING" in W.CANCEL)
check("cancel locks order before forecast", W.CANCEL.index("FROM public.partner_orders WHERE id=p_order FOR UPDATE") < W.CANCEL.index("FROM platform_private.b2b_financial_forecasts WHERE order_id=p_order FOR UPDATE"))
check("no RESET ROLE in wrapper SQL", "RESET ROLE" not in W.SYNC + W.CANCEL)

print(json.dumps({"failed": fails, "total_failed": len(fails)}))
sys.exit(1 if fails else 0)
