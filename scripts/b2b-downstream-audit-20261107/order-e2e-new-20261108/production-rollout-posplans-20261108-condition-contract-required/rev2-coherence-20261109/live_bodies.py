"""Mirror-only reconciliation: install the CURRENT LIVE bodies (commercial-plans cc1f6cc 02-install) over the B3 harness.

Only the PRE pin block (which verifies the hosted ref/B3-era bodies) and the reviewed-ref GUC check are bypassed, and any
additional schema seams are listed explicitly in SEAMS. After install, md5(pg_get_functiondef) of the writers must equal the
LIVE values read by the auditor; otherwise the run is FAIL (never repinned).
"""
import pathlib, re
ROOT = pathlib.Path(__file__).resolve().parents[5]
SRC = ROOT / "scripts/commercial-plans-tenant-20261108/02-install.sql.review"
LIVE = {"public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)": "fe82f5381d426136f2627803f3b0005d",
        "public.create_partner_order_condition_secure(uuid,text,jsonb,date,uuid,text,text,jsonb)": "e86385fefb25c68d9dd4d0fef6619f27"}


def fn(path, name):
    """Copy a real function definition verbatim from the repo (never a stub)."""
    t = (ROOT / path).read_text(); a = t.index("CREATE OR REPLACE FUNCTION " + name + "(")
    tag = re.search(r"AS (\$[a-z_]*\$)", t[a:]).group(1); b = t.index(tag, t.index(tag, a) + len(tag)) + len(tag)
    return t[a:b] + ";"

# Reduced-harness schema seams: columns/objects that exist in LIVE (see cc1f6cc captures) but not in the B3 mirror.
# Columns only add structure; no grant, no data beyond deterministic backfill of the mirror's own synthetic rows.
# Other cc1f6cc bodies exercised by 81 tests; LIVE md5 not supplied by the auditor -> reported for comparison, never treated as pinned.
OTHER = ["public.respond_b2b_order_quote_secure(uuid,text,text,date,text,uuid,uuid)"]

SEAMS = [
 ("clientes.status_cliente", "ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS status_cliente text NOT NULL DEFAULT 'ativo';"),
 ("commercial_payment_plans.created_by/is_default/sort_order + code_key/uq_cpp_single_default (LIVE pre-cc1f6cc shape)",
  "ALTER TABLE public.commercial_payment_plans ADD COLUMN IF NOT EXISTS created_by uuid, ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;"
  " ALTER TABLE public.commercial_payment_plans ADD CONSTRAINT commercial_payment_plans_code_key UNIQUE(code);"
  " CREATE UNIQUE INDEX uq_cpp_single_default ON public.commercial_payment_plans(is_default) WHERE is_default;"),
 ("commercial_payment_plans.root_plan_id/superseded_by_id; assignments.id; partner_users.revoked_at",
  "ALTER TABLE public.commercial_payment_plans ADD COLUMN IF NOT EXISTS root_plan_id uuid, ADD COLUMN IF NOT EXISTS superseded_by_id uuid;"
  " ALTER TABLE public.commercial_payment_plan_assignments ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;"
  " ALTER TABLE public.partner_users ADD COLUMN IF NOT EXISTS revoked_at timestamptz;"),
 ("platform_private.c2p1_assignment_allowed/c2p1_item_allowed real bodies (owner-orders p1-isolation/core)",
  fn("scripts/owner-orders-20261023/p1-isolation/core.sql.review", "platform_private.c2p1_assignment_allowed") + "\n" +
  fn("scripts/owner-orders-20261023/p1-isolation/channels-core.sql.review", "platform_private.c2p1_item_allowed")),
 ("partner_users.tenant_id/valid_from (backfill = owner org of partner)",
  "ALTER TABLE public.partner_users ADD COLUMN IF NOT EXISTS tenant_id uuid, ADD COLUMN IF NOT EXISTS valid_from timestamptz;"
  " UPDATE public.partner_users pu SET tenant_id=pa.commercial_owner_organization_id FROM public.partner_accounts pa WHERE pa.id=pu.partner_id AND pu.tenant_id IS NULL;"),
 ("LIVE policies cppa_admin_read/cpr_internal_select (created closed; cc1f6cc ALTERs their predicate) and item_prices ids",
  "DO $m$ BEGIN"
  " IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='cppa_admin_read') THEN CREATE POLICY cppa_admin_read ON public.commercial_payment_plan_assignments FOR SELECT TO authenticated USING(false); END IF;"
  " IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='cpr_internal_select') THEN CREATE POLICY cpr_internal_select ON public.commercial_price_rules FOR SELECT TO authenticated USING(false); END IF;"
  " END $m$;"
  " ALTER TABLE public.commercial_condition_item_prices ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(), ADD COLUMN IF NOT EXISTS assignment_id uuid, ADD COLUMN IF NOT EXISTS plan_id uuid,"
  " ADD COLUMN IF NOT EXISTS buyer_scope text, ADD COLUMN IF NOT EXISTS partner_id uuid, ADD COLUMN IF NOT EXISTS customer_id uuid;"),
 ("platform_private.c2p1_snapshot_allowed real body (owner-orders p1-isolation/channels-core)",
  fn("scripts/owner-orders-20261023/p1-isolation/channels-core.sql.review", "platform_private.c2p1_snapshot_allowed")),
 ("public._cpp_validate_payload/_cpp_audit real bodies (migration 20260730014752)",
  fn("supabase/migrations/20260730014752_0e6b78a5-0b6c-49ec-a2cf-74be2f62905e.sql", "public._cpp_validate_payload") + "\n" +
  fn("supabase/migrations/20260730014752_0e6b78a5-0b6c-49ec-a2cf-74be2f62905e.sql", "public._cpp_audit")),
]


def sql():
    s = SRC.read_text()
    a = s.index("DO $$\nDECLARE sig text; expected text; BEGIN")
    b = s.index("END $$;", a) + len("END $$;")
    s = s[:a] + "-- [mirror] PRE pin block of cc1f6cc skipped: it pins hosted B3-era bodies; verified separately by LIVE md5 after install\n" + s[b:]
    seam = "\n".join(x[1] for x in SEAMS)
    return s.replace("BEGIN;\n", "BEGIN;\n" + seam + "\n", 1)
