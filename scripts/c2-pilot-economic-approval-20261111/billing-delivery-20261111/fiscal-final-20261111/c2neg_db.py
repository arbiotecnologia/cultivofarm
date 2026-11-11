import subprocess,os
PRIV=["setpriv","--reuid=1000","--regid=1000","--clear-groups"]
B=[p for p in os.listdir('/nix/store') if p.endswith('-postgresql-17.11')][0]
PSQL=PRIV+[f'/nix/store/{B}/bin/psql','-X','-h','/tmp/felig','-p','55901','-U','postgres','-qAt','-v','ON_ERROR_STOP=1']
class DB:
    def __init__(s,db='c2'): s.db=db;s.restore_errors=[]
    def psql(s): return PSQL+[s.db]
    def raw(s,sql): return subprocess.run(s.psql(),input=sql,capture_output=True,text=True,timeout=180)
    def sql(s,sql):
        r=s.raw(sql)
        if r.returncode: raise RuntimeError(r.stderr[-3000:])
        return r.stdout.strip()
    def last(s,sql): return (s.sql(sql).splitlines() or [''])[-1]
    def md5(s,sig): return s.last(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure));")
    def body(s,sig): return s.sql(f"SELECT pg_get_functiondef('{sig}'::regprocedure);")
