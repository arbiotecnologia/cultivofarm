"""Decode all compact UTF-8 parts locally; verify every byte before writing an empty destination."""
from pathlib import Path, PurePosixPath
import base64, gzip, hashlib, json, sys

def digest(data):
    return hashlib.sha256(data).hexdigest()

def materialize(manifest_path, destination):
    manifest_path, destination = Path(manifest_path), Path(destination)
    m = json.loads(manifest_path.read_text(encoding='utf-8'))
    if m.get('format') != 'cultivofarm-path-content-gzip-base64-v1':
        raise ValueError('unknown_format')
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        raise ValueError('destination_not_empty')
    encoded = b''
    for part in m['parts']:
        name = part['path']
        if PurePosixPath(name).name != name or '\\' in name:
            raise ValueError('invalid_part_path')
        data = (manifest_path.parent / name).read_bytes()
        if len(data) != part['bytes'] or digest(data) != part['sha256']:
            raise ValueError('part_hash_mismatch:' + name)
        encoded += data
    if digest(encoded) != m['base64_sha256']:
        raise ValueError('base64_hash_mismatch')
    compressed = base64.b64decode(encoded, validate=True)
    if digest(compressed) != m['gzip_sha256']:
        raise ValueError('gzip_hash_mismatch')
    raw = gzip.decompress(compressed)
    if len(raw) != m['json_bytes'] or digest(raw) != m['json_sha256']:
        raise ValueError('json_hash_mismatch')
    contents = json.loads(raw.decode('utf-8'))
    if set(contents) != set(m['files_sha256']) or len(contents) != m['file_count']:
        raise ValueError('inventory_mismatch')
    binary = set(m['binary_assets_base64'])
    if not binary.issubset(contents):
        raise ValueError('binary_inventory_mismatch')
    verified = {}
    for rel, content in contents.items():
        path = PurePosixPath(rel)
        if path.is_absolute() or str(path) != rel or '..' in path.parts or '\\' in rel or not path.parts:
            raise ValueError('unsafe_source_path')
        if any(p in ('.git', 'node_modules', 'dist', 'build') or p.startswith('.env') for p in path.parts):
            raise ValueError('excluded_source_path')
        if not isinstance(content, str):
            raise ValueError('invalid_content')
        data = base64.b64decode(content, validate=True) if rel in binary else content.encode('utf-8')
        if digest(data) != m['files_sha256'][rel]:
            raise ValueError('source_hash_mismatch:' + rel)
        verified[rel] = data
    # No partial output on a corrupted manifest/part/content.
    for rel, data in verified.items():
        target = destination / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return len(verified)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: python3 materialize.py snapshot/manifest.json empty-checkout')
    print(f'{materialize(sys.argv[1], sys.argv[2])} arquivos materializados; hashes verificados; checker não executado.')