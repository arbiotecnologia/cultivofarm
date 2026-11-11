"""Restaura em PostgreSQL descartável o dump do espelho composto (gerado por measure_live.py). Nunca hospedado."""
import atexit,os,subprocess,tempfile
from pathlib import Path
PG=next(Path('/nix/store').glob('*-postgresql-17.11/bin'))
DUMP=Path('/tmp/vendedor-mirror.dump')
PRIV=["setpriv","--reuid=1000","--regid=1000","--clear-groups"] if os.getuid()==0 else []
class DB:
    def __init__(s,port=55731):
        assert not os.environ.get('PGHOST'),'HOSTED_PG_ENV_REFUSED'
        s.root=Path(tempfile.mkdtemp(prefix='vend-pg-',dir='/tmp'));s.root.chmod(0o777);s.port=str(port)
        subprocess.run(PRIV+[str(PG/'initdb'),'-D',str(s.root/'d'),'-U','postgres','-A','trust'],check=True,capture_output=True)
        subprocess.run(PRIV+[str(PG/'pg_ctl'),'-D',str(s.root/'d'),'-l',str(s.root/'log'),'-o',f'-k {s.root} -h "" -p {s.port}','start','-w'],check=True,capture_output=True)
        atexit.register(lambda: subprocess.run(PRIV+[str(PG/'pg_ctl'),'-D',str(s.root/'d'),'-m','immediate','stop'],capture_output=True))
        roles="anon authenticated service_role authenticator dashboard_user supabase_auth_admin supabase_storage_admin supabase_admin pgbouncer supabase_realtime_admin supabase_replication_admin".split()
        s.sql(''.join(f"DO $$BEGIN CREATE ROLE {r} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END$$;" for r in roles))
        r=subprocess.run([str(PG/'pg_restore'),'-h',str(s.root),'-p',s.port,'-U','postgres','-d','postgres','--no-comments',str(DUMP)],capture_output=True,text=True)
        s.restore_errors=[l for l in r.stderr.splitlines() if 'ERROR' in l]
        # Produção: funções novas em public recebem EXECUTE para service_role por default privileges (verificado na instalação).
        s.sql("ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;")
    def psql(s): return [str(PG/'psql'),'-X','-h',str(s.root),'-p',s.port,'-U','postgres','-qAt','-v','ON_ERROR_STOP=1','postgres']
    def raw(s,sql): return subprocess.run(s.psql(),input=sql,capture_output=True,text=True,timeout=120)
    def sql(s,sql):
        r=s.raw(sql)
        if r.returncode: raise RuntimeError(r.stderr[-3000:])
        return r.stdout.strip()
    def last(s,sql): return (s.sql(sql).splitlines() or [''])[-1]
    def md5(s,sig): return s.last(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure));")
    def body(s,sig): return s.sql(f"SELECT pg_get_functiondef('{sig}'::regprocedure);")
