"""Disposable socket only. No URL, credential or hosted connection is accepted."""
import subprocess
from pathlib import Path

PG = next(Path('/nix/store').glob('*-postgresql-17.11/bin'))
PSQL = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups', str(PG / 'psql'), '-X', '-h', '/tmp/felig', '-p', '55901', '-U', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1']


class DB:
    def __init__(self, db='c2'):
        self.db = db

    def psql(self):
        return PSQL + [self.db]

    def raw(self, sql):
        return subprocess.run(self.psql(), input=sql, capture_output=True, text=True, timeout=180)

    def sql(self, sql):
        result = self.raw(sql)
        if result.returncode:
            raise RuntimeError(result.stderr[-3000:])
        return result.stdout.strip()

    def last(self, sql):
        return (self.sql(sql).splitlines() or [''])[-1]

    def body(self, signature):
        return self.sql(f"SELECT pg_get_functiondef('{signature}'::regprocedure)")