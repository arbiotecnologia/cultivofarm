#!/usr/bin/env python3
"""Stage only clean source in /tmp; never replace the running app or read secrets."""
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = Path(__file__).resolve().parent
DEST = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/fiscal-xml-validation").resolve()
if not str(DEST).startswith("/tmp/") or DEST.exists():
    raise SystemExit("Destination must be a new directory under /tmp")
DEST.mkdir(parents=True)
skip = shutil.ignore_patterns(".git", "node_modules", "dist", ".env", ".env.*", "*.tsbuildinfo", "AGENTS.md")
for folder in ("src", "public"):
    shutil.copytree(ROOT / folder, DEST / folder, ignore=skip)
for name in ("package.json", "bun.lock", "index.html", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "vite.config.ts", "vitest.config.ts", "tailwind.config.ts", "postcss.config.js"):
    shutil.copy2(ROOT / name, DEST / name)
# All transitive local Edge dependencies and static XSD assets (LOCAL only).
functions = DEST / "supabase/functions"
functions.mkdir(parents=True)
for folder in ("fiscal-xml-engine", "_shared"):
    shutil.copytree(ROOT / "supabase/functions" / folder, functions / folder, ignore=skip)
shutil.copy2(ROOT / "supabase/config.toml", DEST / "supabase/config.LOCAL.toml")
shutil.copytree(PACKAGE, DEST / "scripts/fiscal-xml-download-blob-20261021", ignore=skip)
shutil.copy2(PACKAGE / "edge/index.ts.review", functions / "fiscal-xml-engine/index.ts")
shutil.copy2(PACKAGE / "edge/rollback-deny.index.ts.review", functions / "fiscal-xml-engine/rollback-deny.ts")
for name, target in (("useFiscalXmlEngine.ts", "src/hooks/useFiscalXmlEngine.ts"), ("GeracaoXmlNfeSecao.tsx", "src/components/fiscal/GeracaoXmlNfeSecao.tsx")):
    shutil.copy2(PACKAGE / "frontend-candidate" / (name + ".review"), DEST / target)
shutil.copy2(PACKAGE / "frontend-candidate/fiscalXmlAuthenticatedDownload.test.tsx.review", DEST / "src/test/fiscal/fiscalXmlAuthenticatedDownload.test.tsx")
# Resolutions below are explicit LOCAL review dependencies, not asserted LIVE.
(DEST / "deno.json").write_text(json.dumps({"nodeModulesDir": "auto", "imports": {
    "npm:@supabase/supabase-js@2": "npm:@supabase/supabase-js@2.110.8",
    "npm:node-forge@1": "npm:node-forge@1.3.1"
}}, indent=2) + "\n")
rows = []
for file in sorted(DEST.rglob("*")):
    if file.is_file():
        rows.append(f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.relative_to(DEST)}")
(DEST / "SOURCE.SHA256SUMS").write_text("\n".join(rows) + "\n")
print(f"Clean candidate validation source staged: {DEST}; {len(rows)} source files")