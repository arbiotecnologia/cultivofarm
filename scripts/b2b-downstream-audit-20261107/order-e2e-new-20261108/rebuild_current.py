#!/usr/bin/env python3
"""New source-traced disposable composition; never recovery or hosted transport."""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
PG = next(Path('/nix/store').glob('*-postgresql-17.11/bin'))
OUT = H / 'evidence'
OUT.mkdir(exist_ok=True)


def next_attempt() -> Path:
    numbers = []
    for path in OUT.glob('attempt-*'):
        match = re.fullmatch(r'attempt-(\d+)', path.name)
        if match:
            numbers.append(int(match.group(1)))
    return OUT / f"attempt-{max(numbers, default=0) + 1:02d}"


def main():
    # Each run writes only to a new directory. Previous root files, attempts,
    # stdout/stderr and exit codes are never moved or reused as current proof.
    attempt = next_attempt()
    attempt.mkdir()
    work = Path(tempfile.mkdtemp(prefix='new-order-e2e-', dir='/tmp'))
    mirror = work / 'project'
    mirror.mkdir()
    shutil.copytree(ROOT / 'scripts', mirror / 'scripts')
    sources = []
    for path in sorted((ROOT / 'scripts').rglob('*')):
        if path.is_file() and 'order-e2e-new-20261108/evidence' not in str(path) and path.suffix in ('.py', '.json', '.review', '.readonly', '.sql'):
            sources.append({
                'file': str(path.relative_to(ROOT)),
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            })
    (attempt / 'source-manifest.json').write_text(json.dumps({
        'kind': 'NEW_RECONSTRUCTION_NOT_RECOVERY',
        'baseline': 'current corrected LIVE capture; exact source bytes below',
        'sources': sources,
    }, indent=2) + '\n')
    (attempt / 'workspace.json').write_text(json.dumps({
        'workspace': str(work),
        'mirror': str(mirror),
        'output': str(attempt),
    }) + '\n')
    env = {
        **os.environ,
        'PATH': str(PG) + ':' + os.environ['PATH'],
        'NEW_E2E_OUT': str(attempt),
    }
    runner = mirror / 'scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/compose_current.py'
    try:
        result = subprocess.run(
            [sys.executable, str(runner)], cwd=mirror, env=env,
            text=True, capture_output=True, timeout=540,
        )
        stdout, stderr, exitcode = result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout or ''
        stderr = error.stderr or ''
        if isinstance(stdout, bytes):
            stdout = stdout.decode(errors='replace')
        if isinstance(stderr, bytes):
            stderr = stderr.decode(errors='replace')
        stderr += '\nLOCAL_REHEARSAL_TIMEOUT_540S\n'
        exitcode = 124
    (attempt / 'run.stdout.txt').write_text(stdout)
    (attempt / 'run.stderr.txt').write_text(stderr)
    (attempt / 'run.exitcode').write_text(str(exitcode) + '\n')
    print(json.dumps({'attempt': str(attempt), 'workspace': str(work), 'exitcode': exitcode}, indent=2))
    print(stdout[-4500:])
    print(stderr[-2500:])
    return exitcode


if __name__ == '__main__':
    sys.exit(main())
