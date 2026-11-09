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
SEAMS = []   # filled as (description, sql) when the reduced harness schema lacks a LIVE column/object


def sql():
    s = SRC.read_text()
    a = s.index("DO $$\nDECLARE sig text; expected text; BEGIN")
    b = s.index("END $$;", a) + len("END $$;")
    s = s[:a] + "-- [mirror] PRE pin block of cc1f6cc skipped: it pins hosted B3-era bodies; verified separately by LIVE md5 after install\n" + s[b:]
    seam = "\n".join(x[1] for x in SEAMS)
    return s.replace("BEGIN;\n", "BEGIN;\n" + seam + "\n", 1)
