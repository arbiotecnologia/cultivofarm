"""Package-local deadlines/checkpoints; never changes captured SQL contracts."""
import atexit
import subprocess
import time

def configure(pg):
    calls=0
    started=time.monotonic()
    def sql(statement,ok=True):
        nonlocal calls
        calls+=1
        if calls==1 or calls%100==0:
            print(f'CHECKPOINT sql_calls={calls} elapsed={time.monotonic()-started:.1f}s',flush=True)
        try:
            r=subprocess.run(pg.psql(),input="SET lock_timeout='2s'; SET statement_timeout='30s';\n"+statement,capture_output=True,text=True,timeout=40)
        except subprocess.TimeoutExpired as e:
            raise AssertionError(f'LOCAL_SQL_PROCESS_TIMEOUT call={calls} limit=40s') from e
        if ok:
            assert r.returncode==0,r.stderr[-3000:]
            return r.stdout.strip()
        assert r.returncode!=0,'expected failure, got success: '+r.stdout[-500:]
        return r.stderr
    def start():
        print('CHECKPOINT initdb local',flush=True)
        subprocess.run(pg.prefix+['initdb','-D',str(pg.root/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True,timeout=30)
        subprocess.run(pg.prefix+['pg_ctl','-D',str(pg.root/'data'),'-l',str(pg.root/'server.log'),'-o',f'-k {pg.root} -h "" -p {pg.PORT}','start','-w'],check=True,capture_output=True,timeout=30)
        def stop():
            try:subprocess.run(pg.prefix+['pg_ctl','-D',str(pg.root/'data'),'-m','immediate','stop'],capture_output=True,timeout=15)
            except subprocess.TimeoutExpired:print('LOCAL_PG_STOP_TIMEOUT',flush=True)
        atexit.register(stop)
    pg.sql=sql
    pg.start=start