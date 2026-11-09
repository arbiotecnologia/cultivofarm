#!/usr/bin/env python3
"""Integrated PG17 disposable run for 81 rev2 inside the REAL-writer harness of b2b-payment-condition-v1-rebase-20261106.

The frozen packages are copied to a temporary mirror; only the mirror copy of test-local-pg.py gets one injected line
(hook call right before its B3 rollback section) and its evidence outputs are redirected into the mirror. Nothing under
scripts/ except this package's evidence directory is written. No hosted connection.
"""
import hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, time

PKG = pathlib.Path(__file__).resolve().parent
ROOT = PKG.parents[4]
DIRS = ["b2b-payment-condition-v1-rebase-20261106", "b2b-solid-packaging-order-20261106", "financial-price-generator-20261029",
        "owner-orders-20261023", "b2b-cart-catalog-fence-20261106"]
MARK = "        # ---------- rollback deny-only transacional ----------\n"


def main(attempt):
    ev = PKG / "evidence" / f"attempt-{attempt:02d}"
    if ev.exists():
        raise SystemExit(f"{ev} exists; never overwrite evidence")
    ev.mkdir(parents=True)
    mirror = pathlib.Path(tempfile.mkdtemp(prefix="ccr2-mirror-", dir="/tmp"))
    for d in DIRS:
        shutil.copytree(ROOT / "scripts" / d, mirror / "scripts" / d)
    src_hashes = {f"scripts/{d}/test-local-pg.py": hashlib.sha256((ROOT / "scripts" / d / "test-local-pg.py").read_bytes()).hexdigest()
                  for d in DIRS[:2]}
    t = mirror / "scripts" / DIRS[0] / "test-local-pg.py"
    s = t.read_text()
    assert s.count(MARK) == 1
    s = s.replace(MARK, f"        import sys as _s; _s.path.insert(0, {str(PKG)!r}); import ccr2_hook; ccr2_hook.run(globals() | locals())\n" + MARK)
    t.write_text(s)
    (mirror / "patch.diff").write_text(subprocess.run(["diff", "-u", str(ROOT / "scripts" / DIRS[0] / "test-local-pg.py"), str(t)],
                                                      capture_output=True, text=True).stdout)
    t0 = time.time()
    try:
        os.environ["CCR2_EVIDENCE"] = str(ev.resolve()); os.chmod(ev, 0o777)
        r = subprocess.run([sys.executable, str(t)], capture_output=True, text=True, timeout=580, cwd=str(mirror))
        rc, so, se = r.returncode, r.stdout, r.stderr
    except subprocess.TimeoutExpired as e:
        rc, so, se = "TIMEOUT", (e.stdout or b"").decode() if isinstance(e.stdout, bytes) else (e.stdout or ""), "TIMEOUT 580s"
    (ev / "stdout.txt").write_text(so); (ev / "stderr.txt").write_text(se); (ev / "exitcode").write_text(str(rc) + "\n")
    shutil.copy(mirror / "patch.diff", ev / "harness-patch.diff")
    hev = mirror / "scripts" / DIRS[0] / "evidence-local-pg.json"
    if hev.exists():
        d = json.loads(hev.read_text())
        shutil.copy(hev, ev / "harness-evidence.json")
        ccr = [c for c in d["checks"] if c["name"].startswith("CCR2")]
        (ev / "ccr2-checks.json").write_text(json.dumps({"passed": sum(c["ok"] for c in ccr), "total": len(ccr), "checks": ccr}, indent=2, ensure_ascii=False) + "\n")
    if (PKG / "pins.json").exists():
        shutil.copy(PKG / "pins.json", ev / "pins.json")
    (ev / "run.json").write_text(json.dumps({"exit": rc, "seconds": round(time.time() - t0, 1), "pg": subprocess.run(["postgres", "-V"], capture_output=True, text=True).stdout.strip(),
        "frozen_sources_sha256": src_hashes, "kind": "DISPOSABLE_PG_REAL_WRITERS_DECLARED_SEAMS_NOT_HOSTED_PROOF"}, indent=2) + "\n")
    print(rc, ev)


if __name__ == "__main__":
    main(int(sys.argv[1]))
