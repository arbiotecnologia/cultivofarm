"""Offline compact source export. No GitHub, environment reads or database operations."""
from pathlib import Path
import base64, gzip, hashlib, json, subprocess, re

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CONFIGS = ('tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'package.json', 'bun.lock',
           'vite.config.ts', 'vitest.config.ts', 'tailwind.config.ts', 'postcss.config.js',
           'components.json', 'index.html')
FORBIDDEN = {'.git', 'node_modules', 'dist', 'build', '__pycache__'}
PART_BYTES = 200_000

def digest(data):
    return hashlib.sha256(data).hexdigest()

def collect(root):
    files, binary, hashes = {}, [], {}
    candidates = list((root / 'src').rglob('*')) + [root / p for p in CONFIGS]
    # App tests import pure modules outside src. Include their transitive relative imports,
    # without exporting the whole database/Edge tree or unrelated migrations.
    pending = [p for p in candidates if p.is_file() and p.suffix in ('.ts', '.tsx', '.js', '.jsx')]
    scanned = set()
    while pending:
        source = pending.pop()
        if source in scanned:
            continue
        scanned.add(source)
        text = source.read_text(encoding='utf-8')
        for ref in re.findall(r'(?:from\s*|import\s*\(\s*|import\s*|require\s*\(\s*)[\'"]([^\'"]+)[\'"]', text):
            if not ref.startswith('.'):
                continue
            target = (source.parent / ref).resolve()
            if root.resolve() not in target.parents:
                raise ValueError('external_relative_import:' + source.relative_to(root).as_posix())
            options = [target] + [Path(str(target) + ext) for ext in ('.ts', '.tsx', '.js', '.jsx', '.json')]
            options += [target / ('index' + ext) for ext in ('.ts', '.tsx', '.js')]
            found = next((p for p in options if p.is_file()), None)
            if found is not None and found not in candidates:
                candidates.append(found)
                if found.suffix in ('.ts', '.tsx', '.js', '.jsx'):
                    pending.append(found)
    for path in sorted(set(candidates)):
        rel = path.relative_to(root).as_posix()
        if path.is_symlink():
            raise ValueError('symlink_forbidden:' + rel)
        if not path.is_file() or any(p in FORBIDDEN or p.startswith('.env') for p in Path(rel).parts):
            continue
        data = path.read_bytes()
        # Test sources contain explicitly invalid QUJD PEM placeholders. Preserve tests,
        # but refuse non-placeholder complete private-key material without printing it.
        for match in re.finditer(rb'-----BEGIN (?:RSA |ENCRYPTED )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA |ENCRYPTED )?PRIVATE KEY-----', data):
            body = match.group(1).replace(b'\\n', b'').replace(b'\\r', b'')
            body = re.sub(rb'\s+', b'', body)
            if body != b'QUJD':
                raise ValueError('private_key_forbidden:' + rel)
        hashes[rel] = digest(data)
        try:
            files[rel] = data.decode('utf-8')
        except UnicodeDecodeError:
            binary.append(rel)
            files[rel] = base64.b64encode(data).decode('ascii')
    for config in CONFIGS:
        if config not in files:
            raise ValueError('required_config_missing:' + config)
    return files, binary, hashes

def export(root, output, head):
    files, binary, hashes = collect(root)
    # JSON is precisely path -> content. Binary asset values use base64, identified by manifest.
    raw = json.dumps(files, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    compressed = gzip.compress(raw, mtime=0)
    encoded = base64.b64encode(compressed)
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError('output_not_empty')
    parts = []
    for index, offset in enumerate(range(0, len(encoded), PART_BYTES), 1):
        name = f'part-{index:03d}.utf8.txt'
        data = encoded[offset:offset + PART_BYTES]
        (output / name).write_bytes(data)
        parts.append({'path': name, 'bytes': len(data), 'sha256': digest(data)})
    manifest = {'format': 'cultivofarm-path-content-gzip-base64-v1', 'source_head': head,
                'source': 'current sandbox checkout; not GitHub main', 'encoding': 'UTF-8',
                'file_count': len(files), 'json_bytes': len(raw), 'json_sha256': digest(raw),
                'gzip_sha256': digest(compressed), 'base64_sha256': digest(encoded),
                'binary_assets_base64': binary, 'files_sha256': hashes, 'parts': parts,
                'typecheck': 'NOT EXECUTED; no app PASS claimed'}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return manifest

if __name__ == '__main__':
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    m = export(ROOT, HERE / 'snapshot', head)
    print(json.dumps({'files': m['file_count'], 'parts': len(m['parts']), 'source_head': head,
                      'manifest_sha256': digest((HERE / 'snapshot/manifest.json').read_bytes())}))