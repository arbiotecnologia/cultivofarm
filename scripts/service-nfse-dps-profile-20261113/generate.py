"""Gera a migração candidata a partir do corpo versionado (MD5 = captura LIVE)."""
import hashlib, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "supabase/migrations/20261113154235_39f65997-aa0a-417f-afe1-8b7ce572ac60.sql"
LIVE_MD5 = "811e98cc47f27c802918e9731da71d5d"
s = SRC.read_text()
i = s.index("create or replace function public.rpc_service_billing_create_draft_v1")
body = s[i:].split(" as $$", 1)[1].split("$$;", 1)[0]
assert hashlib.md5(body.encode()).hexdigest() == LIVE_MD5, "drift"

def rep(b, old, new):
    assert b.count(old) == 1, old[:60]
    return b.replace(old, new)

nb = rep(body, "  v_invoice uuid;\n", "  v_invoice uuid;\n  v_dps jsonb;\n")
nb = rep(nb, "  select case when upper(coalesce(fiscal_environment,'')) in",
         "  v_dps := platform_private.service_nfse_dps_snapshot_v1(v_org, (select array_agg(distinct service_id) from public.service_engagements where id = any(v_ids)));\n\n  select case when upper(coalesce(fiscal_environment,'')) in")
nb = rep(nb, "      'customer_id', v_customer, 'issue_date', current_date::text,\n",
         "      'customer_id', v_customer, 'issue_date', current_date::text,\n      'fiscal_profile_snapshot', case when v_dps is null then '{}'::jsonb else jsonb_build_object('nfse_dps', v_dps) end,\n")
new_md5 = hashlib.md5(nb.encode()).hexdigest()

tpl = (pathlib.Path(__file__).parent / "migration.template.sql").read_text()
out = tpl.replace("{{BILLING_BODY}}", nb).replace("{{LIVE_MD5}}", LIVE_MD5).replace("{{NEW_MD5}}", new_md5)
(pathlib.Path(__file__).parent / "migration/20261113190000_service_nfse_dps_profile.sql").write_text(out)
print("ok", new_md5)
