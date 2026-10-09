"""Isolated PostgreSQL: real RPC bodies/policies; reduced DDL, simulated Auth, no remote writes."""
from pathlib import Path
import os, subprocess, tempfile, re
ROOT=Path(__file__).resolve().parents[2]

def main():
    tmp=Path(tempfile.mkdtemp(prefix='technical-rls-',dir='/tmp'));tmp.chmod(0o777)
    prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
    started=False
    try:
        subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
        subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55487','start'],check=True,capture_output=True);started=True
        sql=(ROOT/'scripts/tests/technical-tenant-local.sql').read_text()
        baseline=(ROOT/'supabase/migrations/20260805040000_visita_canonica_failclosed.sql').read_text()
        funcs='\n'.join(re.search(r'CREATE OR REPLACE FUNCTION public\.'+name+r'\(.*?\$function\$;',baseline,re.S)[0] for name in ['rpc_listar_atendimentos_tecnicos_v1','rpc_resumo_atendimentos_tecnicos_v1','rpc_criar_visita_idempotente','rpc_iniciar_atendimento_solicitacao_v1'])
        sql=sql.replace('-- BASELINE_RPCS',funcs).replace('-- CANDIDATE',(ROOT/'scripts/rbac-audit/technical-tenant-containment.sql').read_text())
        f=tmp/'proof.sql';f.write_text(sql);f.chmod(0o644)
        run=subprocess.run(['psql','-h',str(tmp),'-p','55487','-U','postgres','-v','ON_ERROR_STOP=1','-f',str(f)],capture_output=True,text=True)
        if run.returncode: raise RuntimeError(run.stderr[-7000:])
        print(run.stderr)
    finally:
        if started: subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'stop','-m','immediate'],capture_output=True)
        import shutil
        shutil.rmtree(tmp)
if __name__=='__main__':main()
