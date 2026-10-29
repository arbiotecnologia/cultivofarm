"""Read-only verification of manifest bytes in an explicit committed Git tree."""
import hashlib
import pathlib
import subprocess
import sys

if len(sys.argv) != 2:
    raise SystemExit('Uso: python3 check-git-tree.py <commit>')
commit = sys.argv[1]
manifest = pathlib.Path(__file__).with_name('SHA256SUMS.versioned')
tree = set(subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', commit], text=True).splitlines())
failures = []
count = 0
for line in manifest.read_text().splitlines():
    expected, path = line.split('  ', 1)
    count += 1
    if path not in tree:
        failures.append((path, 'ABSENT_FROM_COMMIT'))
        continue
    contents = subprocess.check_output(['git', 'show', f'{commit}:{path}'])
    if hashlib.sha256(contents).hexdigest() != expected:
        failures.append((path, 'COMMITTED_BYTES_MISMATCH'))
print(f'commit={commit} entries={count} failures={len(failures)}')
for path, reason in failures:
    print(reason, path)
raise SystemExit(1 if failures else 0)