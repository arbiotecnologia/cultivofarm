#!/usr/bin/env python3
"""Clean isolated candidate assembly; no secrets, hosted operations or runtime edits."""
import shutil
import sys
from pathlib import Path
root = Path(__file__).resolve().parents[2]
package = Path(__file__).resolve().parent
dest = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/technical-attachment-validation').resolve()
if not str(dest).startswith('/tmp/') or dest.exists():
    raise SystemExit('Use a new directory under /tmp')
dest.mkdir()
skip = shutil.ignore_patterns('.git', 'node_modules', 'dist', '.env', '.env.*', '*.tsbuildinfo')
for directory in ('src', 'public', 'scripts', 'supabase', 'docs'):
    shutil.copytree(root / directory, dest / directory, ignore=skip)
for name in ('package.json', 'bun.lock', 'index.html', 'vite.config.ts', 'vitest.config.ts',
             'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'tailwind.config.ts', 'postcss.config.js'):
    shutil.copy2(root / name, dest / name)
for name in ('core.ts', 'transport.ts', 'index.ts.review'):
    target = dest / 'supabase/functions/download-technical-attachment' / name.replace('.review', '')
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(package / 'edge' / name, target)
shutil.copy2(package / 'frontend/loadTechnicalAttachment.ts', dest / 'src/lib/authz/loadTechnicalAttachment.ts')
shutil.copy2(package / 'frontend/authenticatedAttachment.ts.review', dest / 'src/lib/authz/authenticatedAttachment.ts')
print('Isolated candidate staged:', dest)