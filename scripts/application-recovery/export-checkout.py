"""Recoverable source archive, no credentials, dependencies, build output or Git metadata."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[2]
H=Path(__file__).resolve().parent
paths=list((ROOT/'src').rglob('*'))
paths += [ROOT/name for name in ['AGENTS.md','package.json','bun.lock','tsconfig.json','tsconfig.app.json','tsconfig.node.json','vite.config.ts','vitest.config.ts','tailwind.config.ts','postcss.config.js','components.json','index.html']]
paths=[p for p in paths if p.is_file() and not p.is_symlink() and p.name not in ('.env','.env.local')]
files={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}
(H/'checkout-inputs.json').write_text(json.dumps(files,indent=2)+'\n')
out=Path('/tmp/application-recovery-checkout.zip')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for rel in files:z.write(ROOT/rel,rel)
 z.write(H/'checkout-inputs.json','checkout-inputs.json')
 z.write(H/'typecheck-independent.md','typecheck-independent.md')
with zipfile.ZipFile(out) as z:
 assert not any(any(part in ('.git','node_modules','dist','build','.env') for part in Path(n).parts) for n in z.namelist())
 for rel,digest in files.items():assert hashlib.sha256(z.read(rel)).hexdigest()==digest
print(json.dumps(dict(path=str(out),sha256=hashlib.sha256(out.read_bytes()).hexdigest(),source_files=len(files),entries_checked=True)))