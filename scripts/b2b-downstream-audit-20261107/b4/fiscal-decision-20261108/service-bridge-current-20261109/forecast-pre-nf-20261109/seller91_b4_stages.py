#!/usr/bin/env python3
"""Generate B4 stages reconciled to the LIVE respond_b2b_order_quote_secure body.

Review cf7d5fb/214: production READONLY read respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)
LIVE md5 97bcdb98..., while the frozen canonical-composition-feb815603 stages pin 4926a99c... .
The frozen sources are history and are NOT modified. This generator writes NEW files with the
single pin replaced (exact counts, sha256 anchors on the sources), so the harness and the hosted
runbook execute exactly the delivered bytes — no ad hoc str.replace at run time.
The guard is not weakened: the pin is still an exact md5 equality, only the expected value
follows the reviewed LIVE body (same body as respond.seller91.sql, verified here by md5).
"""
from pathlib import Path
import hashlib
import json

H = Path(__file__).resolve().parent
ROOT = H.parents[5]
COMPOSED = ROOT / "scripts/b2b-downstream-audit-20261107/canonical-composition-feb815603"
SELLER91 = H.parent / "respond.seller91.sql"
OUT = H / "b4-seller91-current"
OLD = "4926a99c3fa3086b34ff25bb4b4038bb"
LIVE = "97bcdb9884b54adb3bd4aae4915e32d0"
SIG = "public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)"
SOURCES = {
    # source relative to COMPOSED: (sha256 of frozen source, expected pin count, output name)
    "stages/01-b4-pre-post-composition.sql.readonly": ("f495866d7628858360fa409247f929862360939091b216f289af9cf4e39d5464", 1, "01-b4-pre-seller91-live.sql.readonly"),
    "stages/02-b4-install-post-composition.sql.review": ("6500bf54b5df05c753e75ada0f6ed12948e81f0e86f274222a2eae481a681f54", 1, "02-b4-install-seller91-live.sql.review"),
    "03-post.sql.readonly": ("85b0736d03cc5b2a6a5347b2575e88241cfc40be0ba6be5808b77ea31957854d", 1, "03-composed-post-seller91-live.sql.readonly"),
}
# Files used unchanged (no respond pin inside): listed so the manifest is complete.
UNCHANGED = ["stages/03-b4-post.sql.readonly", "stages/04-bridge-install.sql.review", "04-rollback-deny.sql.review"]


def sha(b): return hashlib.sha256(b).hexdigest()


def build():
    seller = SELLER91.read_text()
    # pg_get_functiondef canonical form; equality proven post-install in every chain.
    assert hashlib.md5(seller.encode()).hexdigest() == LIVE, "SELLER91_SOURCE_NOT_LIVE_BODY"
    OUT.mkdir(exist_ok=True)
    report = {"signature": SIG, "frozen_pin": OLD, "live_pin": LIVE, "live_source": "production READONLY read by independent reviewer (cf7d5fb/214)",
              "body_source": str(SELLER91.relative_to(ROOT)), "body_sha256": sha(seller.encode()), "frozen_sources_modified": False,
              "files": [], "unchanged": []}
    for rel, (src_sha, count, out_name) in SOURCES.items():
        src = (COMPOSED / rel).read_bytes()
        assert sha(src) == src_sha, ("FROZEN_SOURCE_DRIFT", rel)
        text = src.decode()
        assert text.count(OLD) == count and text.count(LIVE) == 0, ("PIN_COUNT", rel, text.count(OLD))
        line = next(l for l in text.splitlines() if OLD in l)
        assert SIG.split("public.")[1].split("(")[0] in line, ("PIN_NOT_RESPOND", rel)
        new = text.replace(OLD, LIVE)
        diff = [(a, b) for a, b in zip(text.splitlines(), new.splitlines()) if a != b]
        assert len(diff) == count and len(text.splitlines()) == len(new.splitlines())
        (OUT / out_name).write_text(new)
        report["files"].append({"source": str((COMPOSED / rel).relative_to(ROOT)), "source_sha256": src_sha,
                                "output": str((OUT / out_name).relative_to(ROOT)), "output_sha256": sha(new.encode()),
                                "changed_lines": len(diff), "only_change": f"{OLD} -> {LIVE} in {SIG} md5 guard"})
    for rel in UNCHANGED:
        report["unchanged"].append({"path": str((COMPOSED / rel).relative_to(ROOT)), "sha256": sha((COMPOSED / rel).read_bytes())})
    (OUT / "reconciliation.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    print(json.dumps(build(), indent=2))
