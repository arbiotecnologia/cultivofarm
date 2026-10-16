"""PostgreSQL descartável via socket /tmp; nunca conecta ao hosted.
Testa baseline live vs candidato de sync_user_cliente_principal."""
from pathlib import Path
import os, subprocess, tempfile, shutil
ROOT=Path(__file__).resolve().parents[2]
tmp=Path(tempfile.mkdtemp(prefix='links-principal-',dir='/tmp'));tmp.chmod(0o777)
prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
base=['psql','-X','-h',str(tmp),'-p','55497','-U','postgres','-v','ON_ERROR_STOP=1','-qAt']
def run(sql):
 r=subprocess.run(base,input=sql,text=True,capture_output=True)
 if r.returncode:raise AssertionError(r.stderr)
 return r.stdout.strip()
checks=0
def check(sql,want):
 global checks
 got=run(sql);assert got==want,(got,want);checks+=1
U1='00000000-0000-4000-8000-000000000001' # produtor
U2='00000000-0000-4000-8000-00000000000a' # consultor
C1='00000000-0000-4000-8000-000000000002'
C2='00000000-0000-4000-8000-000000000003'
C3='00000000-0000-4000-8000-000000000004'
try:
 subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55497','start'],check=True,capture_output=True)
 run(f'''CREATE TYPE public.app_role AS ENUM('administrador','cliente_produtor','consultor_tecnico');
 CREATE TABLE public.clientes(id uuid PRIMARY KEY);
 CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE,cliente_id uuid REFERENCES public.clientes(id));
 CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
 CREATE TABLE public.user_clientes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
   principal boolean DEFAULT false,created_at timestamptz DEFAULT now(),is_active boolean DEFAULT true,
   revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz,UNIQUE(user_id,cliente_id));
 INSERT INTO public.clientes VALUES ('{C1}'),('{C2}'),('{C3}');
 INSERT INTO public.profiles(user_id) VALUES ('{U1}'),('{U2}');''')
 baseline=(ROOT/'scripts/user-links-principal/rollback.sql.review').read_text()
 baseline=baseline[baseline.index('CREATE OR REPLACE FUNCTION'):]
 run(baseline)
 run('CREATE TRIGGER trg_user_clientes_sync AFTER INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH ROW EXECUTE FUNCTION public.sync_user_cliente_principal()')
 # --- BASELINE: comportamento atual (documenta o defeito, sem PASS falso) ---
 run(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal,created_at) VALUES ('{U1}','{C1}',true,now()-interval '2 days')")
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{U1}'",C1)
 # baseline elege principal revogado (defeito conhecido)
 run(f"UPDATE public.user_clientes SET is_active=false,revoked_at=now() WHERE user_id='{U1}' AND cliente_id='{C1}'")
 run(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal,created_at) VALUES ('{U1}','{C2}',false,now()-interval '1 day')")
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{U1}' AND principal",C1) # baseline aponta histórico
 # --- CANDIDATO ---
 run('DROP TRIGGER trg_user_clientes_sync ON public.user_clientes')
 run("TRUNCATE public.user_clientes; UPDATE public.profiles SET cliente_id=NULL")
 candidate=(ROOT/'scripts/user-links-principal/candidate.sql.review').read_text()
 candidate=candidate[candidate.index('CREATE OR REPLACE FUNCTION'):]
 run(candidate)
 run('CREATE TRIGGER trg_user_clientes_sync AFTER INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH ROW EXECUTE FUNCTION public.sync_user_cliente_principal()')
 # 1) vínculo vigente vira principal e sincroniza profile
 run(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal,created_at) VALUES ('{U1}','{C1}',true,now()-interval '2 days')")
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{U1}'",C1)
 # 2) revogar o principal reelege o vigente mais antigo e atualiza profile
 run(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal,created_at) VALUES ('{U1}','{C2}',false,now()-interval '1 day')")
 run(f"UPDATE public.user_clientes SET is_active=false,revoked_at=now() WHERE user_id='{U1}' AND cliente_id='{C1}'")
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{U1}' AND principal",C2)
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{U1}'",C2)
 # 3) vínculo futuro não é elegido; profile não aponta para ele
 run(f"UPDATE public.user_clientes SET is_active=false,revoked_at=now() WHERE user_id='{U1}' AND cliente_id='{C2}'")
 run(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal,created_at,valid_from) VALUES ('{U1}','{C3}',false,now(),now()+interval '1 day')")
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{U1}' AND principal",'0')
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{U1}'",'')
 # 4) expirado também não é elegido
 run(f"UPDATE public.user_clientes SET valid_from=now()-interval '2 days',valid_until=now()-interval '1 day' WHERE user_id='{U1}' AND cliente_id='{C3}'")
 run(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal,created_at) VALUES ('{U1}','{C1}',false,now()) ON CONFLICT (user_id,cliente_id) DO UPDATE SET is_active=true,revoked_at=NULL")
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{U1}' AND principal",C1)
 # 5) reativação de par histórico (mesma id, UNIQUE) funciona e vira elegível
 run(f"UPDATE public.user_clientes SET is_active=false,revoked_at=now() WHERE user_id='{U1}' AND cliente_id='{C1}'")
 run(f"UPDATE public.user_clientes SET is_active=true,revoked_at=NULL WHERE user_id='{U1}' AND cliente_id='{C2}'")
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{U1}' AND principal",C2)
 # 6) marcar principal vigente desmarca os demais (exatamente um)
 run(f"UPDATE public.user_clientes SET principal=true WHERE user_id='{U1}' AND cliente_id='{C1}' AND false") # no-op guard
 run(f"UPDATE public.user_clientes SET is_active=true,revoked_at=NULL,principal=true WHERE user_id='{U1}' AND cliente_id='{C1}'")
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{U1}' AND principal",'1')
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{U1}' AND principal",C1)
 # 7) sem nenhuma ligação vigente: nenhum principal, profile NULL (sem fallback histórico)
 run(f"UPDATE public.user_clientes SET is_active=false,revoked_at=now() WHERE user_id='{U1}'")
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{U1}' AND principal",'0')
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{U1}'",'')
 # 8) consultor sem vínculos permanece intacto
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{U2}'",'0')
 # 9) convergência: trigger não recursa infinito (cada caso acima já prova término; confirma estado estável)
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{U1}' AND principal AND is_active AND revoked_at IS NULL",'0')
 # 10) DELETE do principal vigente reelege outro vigente
 run(f"UPDATE public.user_clientes SET is_active=true,revoked_at=NULL WHERE user_id='{U1}' AND cliente_id IN ('{C1}','{C2}')")
 run(f"UPDATE public.user_clientes SET principal=true WHERE user_id='{U1}' AND cliente_id='{C2}'")
 run(f"DELETE FROM public.user_clientes WHERE user_id='{U1}' AND cliente_id='{C2}'")
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{U1}' AND principal",C1)
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{U1}'",C1)
 # 11) rollback transacional: nada persiste
 run(f"BEGIN;UPDATE public.user_clientes SET is_active=false,revoked_at=now() WHERE user_id='{U1}';ROLLBACK;")
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{U1}' AND principal",C1)
 print(f'{checks} checks PASS — PostgreSQL isolado; schema reduzido; não hosted')
finally:
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True)
 shutil.rmtree(tmp,ignore_errors=True)
