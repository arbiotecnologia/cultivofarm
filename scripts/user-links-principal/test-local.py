"""PostgreSQL descartável via socket /tmp; nunca conecta ao hosted.
Harness v3: guards reais (cf_user_guards_v1, sensitive/tenant/h15, enforce),
roles Admin/Produtor/Consultor, trigger AFTER STATEMENT candidato v3
(idempotência com detecção de trabalho, sem pg_trigger_depth), casos multirow,
FK cascade, writer aninhado de provisionamento, empate created_at, claims
Admin autenticado (negação existente documentada) e concorrência com duas
conexões. valid_from NOT NULL DEFAULT now() espelha o live. Restante UNVERIFIED."""
from pathlib import Path
import os, subprocess, tempfile, shutil, time
ROOT=Path(__file__).resolve().parents[2]
tmp=Path(tempfile.mkdtemp(prefix='links-principal-v3-',dir='/tmp'));tmp.chmod(0o777)
prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
base=['psql','-X','-h',str(tmp),'-p','55498','-U','postgres','-v','ON_ERROR_STOP=1','-qAt']
def run(sql):
 r=subprocess.run(base,input=sql,text=True,capture_output=True)
 if r.returncode:raise AssertionError(r.stderr)
 return r.stdout.strip()
def runerr(sql):
 r=subprocess.run(base,input=sql,text=True,capture_output=True)
 assert r.returncode!=0,'esperava erro e comando passou: '+sql[:120]
 return r.stderr
checks=0
def check(sql,want):
 global checks
 got=run(sql);assert got==want,(got,want);checks+=1
ADMIN='00000000-0000-4000-8000-0000000000a0'
PROD='00000000-0000-4000-8000-0000000000a1'
PROD2='00000000-0000-4000-8000-0000000000a2'
CONS='00000000-0000-4000-8000-0000000000a3'
NEST='00000000-0000-4000-8000-0000000000a4'
C1='00000000-0000-4000-8000-0000000000b1'
C2='00000000-0000-4000-8000-0000000000b2'
C3='00000000-0000-4000-8000-0000000000b3'
C4='00000000-0000-4000-8000-0000000000b4'
def admin(sql):return f"BEGIN;SET LOCAL ROLE service_role;{sql};COMMIT;" # escritas de vínculo: contexto service/provisionamento (auth.uid() NULL), como no live
def asuser(u,sql):return f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{u}';{sql};COMMIT;"
try:
 subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55498','start'],check=True,capture_output=True)
 # ---- schema e guards com definições reais capturadas do live ----
 run(f'''CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA cf_user_guards_v1;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TYPE public.app_role AS ENUM('administrador','cliente_produtor','consultor_tecnico','superadmin');
 CREATE TABLE public.clientes(id uuid PRIMARY KEY);
 CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE,email text,ativo boolean DEFAULT true,
   cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,organization_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
   data_admissao date,observacoes_internas text,senha_provisoria boolean);
 CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
 CREATE TABLE public.user_clientes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
   principal boolean NOT NULL DEFAULT false,created_at timestamptz DEFAULT now(),is_active boolean NOT NULL DEFAULT true,
   revoked_at timestamptz,valid_from timestamptz NOT NULL DEFAULT now(),valid_until timestamptz,UNIQUE(user_id,cliente_id));
 CREATE UNIQUE INDEX uq_user_clientes_principal ON public.user_clientes(user_id) WHERE principal; -- índice LIVE: no máximo UM principal por usuário; múltiplos principal=true no mesmo comando negam 23505
 CREATE TABLE public.partner_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),partner_id uuid,user_id uuid,created_at timestamptz DEFAULT now(),papel text);
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY DEFAULT true,revision bigint NOT NULL DEFAULT 0,CHECK(singleton));
 INSERT INTO cf_user_guards_v1.state(singleton) VALUES(true);
 CREATE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
   $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r)$$;
 CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now(); RETURN NEW; END$$;
 CREATE FUNCTION cf_user_guards_v1.acquire_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
 BEGIN
  IF TG_LEVEL<>'STATEMENT' OR TG_RELID NOT IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass,'auth.users'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
  IF current_setting('role',true) IN ('anon','authenticated') AND auth.uid() IS NULL THEN RAISE EXCEPTION 'user_edit_forbidden' USING ERRCODE='42501'; END IF;
  UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
  RETURN NULL;
 END $f$;
 CREATE FUNCTION cf_user_guards_v1.advance_stamp() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
 BEGIN NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond'); RETURN NEW; END $f$;
 CREATE FUNCTION cf_user_guards_v1.require_admin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
 BEGIN
  IF TG_LEVEL<>'STATEMENT' OR TG_RELID NOT IN ('public.profiles'::regclass,'public.user_roles'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r USING(user_id) WHERE p.ativo IS TRUE AND r.role='administrador') THEN RAISE EXCEPTION 'user_last_active_admin' USING ERRCODE='PT409'; END IF;
  RETURN NULL;
 END $f$;
 CREATE FUNCTION cf_user_guards_v1.touch_related_profiles() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
 DECLARE old_id uuid; new_id uuid; item uuid;
 BEGIN
  IF TG_LEVEL<>'ROW' OR TG_RELID NOT IN ('public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
  IF TG_OP<>'DELETE' THEN old_id:=OLD.user_id; END IF;
  IF TG_OP<>'DELETE' THEN new_id:=NEW.user_id; END IF;
  FOR item IN SELECT DISTINCT x FROM unnest(ARRAY[old_id,new_id]) x WHERE x IS NOT NULL ORDER BY x LOOP UPDATE public.profiles SET updated_at=updated_at WHERE user_id=item; END LOOP;
  RETURN NULL;
 END $f$;
 CREATE FUNCTION public.guard_profile_sensitive_fields() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
 BEGIN IF current_user IN ('postgres','service_role','supabase_auth_admin') THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(),'administrador'::public.app_role) THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN IF NEW.ativo IS DISTINCT FROM true OR NEW.cliente_id IS NOT NULL OR NEW.organization_id IS NOT NULL OR NEW.data_admissao IS NOT NULL OR NEW.observacoes_internas IS NOT NULL THEN RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501'; END IF;
  ELSE IF OLD.ativo IS NOT TRUE OR ROW(NEW.id,NEW.user_id,NEW.email,NEW.ativo,NEW.cliente_id,NEW.organization_id,NEW.created_at,NEW.data_admissao,NEW.observacoes_internas) IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.email,OLD.ativo,OLD.cliente_id,OLD.organization_id,OLD.created_at,OLD.data_admissao,OLD.observacoes_internas) THEN RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501'; END IF; END IF;
  RETURN NEW; END; $f$;
 CREATE FUNCTION public.guard_profile_tenant_fields() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
 BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.senha_provisoria IS DISTINCT FROM OLD.senha_provisoria OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN RAISE EXCEPTION 'profile_protected_fields' USING ERRCODE='42501'; END IF;
  IF auth.uid()=OLD.user_id AND NEW.ativo IS DISTINCT FROM OLD.ativo THEN RAISE EXCEPTION 'profile_protected_fields' USING ERRCODE='42501'; END IF;
  RETURN NEW; END; $f$;
 CREATE FUNCTION public.h15_profile_organization_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='pg_catalog','public' AS $f$
 BEGIN
  IF current_setting('role',true) IN ('authenticated','anon') THEN
   IF TG_OP='INSERT' THEN IF NEW.organization_id IS NOT NULL THEN RAISE EXCEPTION 'H15_ORGANIZATION_PROVISIONING_REQUIRED' USING ERRCODE='42501'; END IF;
   ELSIF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'H15_ORGANIZATION_PROVISIONING_REQUIRED' USING ERRCODE='42501'; END IF;
  END IF; RETURN NEW; END; $f$;
 CREATE FUNCTION public.enforce_cliente_id_for_produtor() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $f$
 DECLARE v_user uuid; v_role app_role; v_count int;
 BEGIN
  IF TG_TABLE_NAME='user_roles' THEN
   IF NEW.role='cliente_produtor' THEN
    SELECT count(*) INTO v_count FROM public.user_clientes WHERE user_id=NEW.user_id;
    IF v_count=0 THEN RAISE EXCEPTION 'Para a função "Produtor (Portal)" é obrigatório vincular o usuário a pelo menos um cliente.' USING ERRCODE='check_violation'; END IF;
   END IF; RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='user_clientes' THEN
   v_user:=COALESCE(NEW.user_id,OLD.user_id);
   SELECT role INTO v_role FROM public.user_roles WHERE user_id=v_user AND role='cliente_produtor' LIMIT 1;
   IF v_role IS NOT NULL THEN
    IF TG_OP='DELETE' THEN SELECT count(*) INTO v_count FROM public.user_clientes WHERE user_id=v_user AND id<>OLD.id;
    ELSE SELECT count(*) INTO v_count FROM public.user_clientes WHERE user_id=v_user; END IF;
    IF v_count=0 THEN RAISE EXCEPTION 'Este usuário é Produtor e precisa permanecer vinculado a pelo menos um cliente.' USING ERRCODE='check_violation'; END IF;
   END IF; RETURN COALESCE(NEW,OLD);
  END IF; RETURN COALESCE(NEW,OLD);
 END $f$;
 CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
 CREATE TRIGGER guard_profile_sensitive_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_sensitive_fields();
 CREATE TRIGGER trg_guard_profile_tenant_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_tenant_fields();
 CREATE TRIGGER h15_profile_organization_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.h15_profile_organization_guard();
 CREATE TRIGGER trg_profiles_enforce_cliente BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_cliente_id_for_produtor();
 CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
 CREATE TRIGGER z99_cf_profile_stamp BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.advance_stamp();
 CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
 CREATE TRIGGER trg_user_roles_enforce_cliente BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.enforce_cliente_id_for_produtor();
 CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();
 CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
 CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();
 GRANT USAGE ON SCHEMA auth TO authenticated; GRANT USAGE ON SCHEMA cf_user_guards_v1 TO authenticated;
 GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
 GRANT SELECT,UPDATE ON cf_user_guards_v1.state TO authenticated;
 GRANT SELECT,UPDATE ON cf_user_guards_v1.state TO service_role;
 INSERT INTO public.clientes VALUES ('{C1}'),('{C2}'),('{C3}'),('{C4}');
 INSERT INTO public.profiles(user_id,email) VALUES ('{ADMIN}','admin@t'),('{PROD}','p1@t'),('{PROD2}','p2@t'),('{CONS}','c@t'),('{NEST}','n@t');
 INSERT INTO public.user_roles VALUES ('{ADMIN}','administrador'),('{CONS}','consultor_tecnico');
 CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();
 CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();
 ''')
 # ---- instala candidato v3 (função + triggers STATEMENT) ----
 candidate=(ROOT/'scripts/user-links-principal/candidate.sql.review').read_text()
 candidate=candidate[candidate.index('CREATE OR REPLACE FUNCTION'):]
 # espelha o estado live: função baseline + trigger ROW antes da troca para STATEMENT
 baseline=(ROOT/'scripts/user-links-principal/rollback.sql.review').read_text()
 run(baseline[baseline.index('CREATE OR REPLACE FUNCTION'):baseline.index('DROP TRIGGER')])
 run("CREATE TRIGGER trg_user_clientes_sync AFTER INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH ROW EXECUTE FUNCTION public.sync_user_cliente_principal()")
 run(candidate)
 # ---- 1) fluxo service/provisionamento: vínculo vigente vira principal e sincroniza profile ----
 run(admin(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal,created_at) VALUES ('{PROD}','{C1}',true,now()-interval '2 days')"))
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{PROD}'",C1)
 # ---- 2) role produtor exige vínculo (enforce real); consultor não ----
 runerr(admin(f"INSERT INTO public.user_roles VALUES ('{PROD2}','cliente_produtor')"))
 run(admin(f"INSERT INTO public.user_roles VALUES ('{PROD}','cliente_produtor')"))
 checks+=2
 # ---- 3) multirow CASE: C1 (principal) revogado e C2 vigente no MESMO comando ----
 run(admin(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal,created_at) VALUES ('{PROD}','{C2}',false,now()-interval '1 day')"))
 run(admin(f"""UPDATE public.user_clientes SET
   is_active=CASE WHEN cliente_id='{C1}' THEN false ELSE true END,
   revoked_at=CASE WHEN cliente_id='{C1}' THEN now() ELSE NULL END
  WHERE user_id='{PROD}' AND cliente_id IN ('{C1}','{C2}')"""))
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{PROD}' AND principal",C2)
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{PROD}'",C2)
 # ---- 4) multirow: UPDATE principal=true em DUAS linhas num só comando ----
 run(admin(f"UPDATE public.user_clientes SET is_active=true,revoked_at=NULL WHERE user_id='{PROD}' AND cliente_id='{C1}'"))
 run(admin(f"UPDATE public.user_clientes SET principal=true WHERE user_id='{PROD}' AND cliente_id IN ('{C1}','{C2}')"))
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{PROD}' AND principal",'1')
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{PROD}' AND principal",C1) # created_at mais antigo vence
 # ---- 5) INSERT multirow num só comando ----
 run(admin(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal,created_at) VALUES ('{PROD2}','{C2}',false,now()-interval '1 day'),('{PROD2}','{C3}',false,now())"))
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{PROD2}' AND principal",C2)
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{PROD2}'",C2)
 # ---- 6) UPDATE de user_id reconcilia usuário antigo E novo ----
 run(admin(f"UPDATE public.user_clientes SET user_id='{PROD2}' WHERE user_id='{PROD}' AND cliente_id='{C1}'"))
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{PROD}' AND principal",C2)
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{PROD2}' AND principal",'1')
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{PROD}'",C2)
 run(admin(f"UPDATE public.user_clientes SET user_id='{PROD}' WHERE user_id='{PROD2}' AND cliente_id='{C1}'"))
 # ---- 7) futuro/expirado nunca elegidos; sem vigente -> profile NULL ----
 run(admin(f"UPDATE public.user_clientes SET is_active=false,revoked_at=now() WHERE user_id='{PROD}'"))
 run(admin(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal,valid_from) VALUES ('{PROD}','{C3}',false,now()+interval '1 day') ON CONFLICT (user_id,cliente_id) DO UPDATE SET valid_from=now()+interval '1 day',is_active=true,revoked_at=NULL"))
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{PROD}' AND principal",'0')
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{PROD}'",'')
 # ---- 8) negativo: autenticado não-admin não escreve vínculo (contenção existente) ----
 run(admin(f"UPDATE public.user_clientes SET is_active=true,revoked_at=NULL,valid_from=now()-interval '1 hour' WHERE user_id='{PROD}' AND cliente_id IN ('{C1}','{C2}')"))
 runerr(asuser(PROD,f"UPDATE public.user_clientes SET principal=true WHERE user_id='{PROD}' AND cliente_id='{C2}'")) # troca principal vigente: sync tenta profile e guard de tenant nega
 checks+=1
 # ---- 8b) negativo: Admin AUTENTICADO também é negado na escrita de vínculo ----
 # Negação existente e preservada: a sincronização de profiles.cliente_id é
 # bloqueada para qualquer autenticado pelo guard de tenant (auth.uid() não NULL).
 # Escritas de vínculo exigem contexto service/provisionamento, como no live.
 runerr(asuser(ADMIN,f"UPDATE public.user_clientes SET principal=true WHERE user_id='{PROD}' AND cliente_id='{C2}'"))
 checks+=1
 # ---- 9) negativo: sem uid (anon) bloqueado pelo gate ----
 runerr(f"BEGIN;SET LOCAL ROLE authenticated;UPDATE public.user_clientes SET principal=false WHERE user_id='{PROD}';COMMIT;")
 checks+=1
 # ---- 10) require_admin real: não remove último admin ativo ----
 runerr(admin("DELETE FROM public.user_roles WHERE role='administrador'"))
 checks+=1
 # ---- 11) concorrência: duas conexões trocando principal em loop ----
 run(admin(f"UPDATE public.user_clientes SET is_active=true,revoked_at=NULL,valid_from=now()-interval '1 hour' WHERE user_id='{PROD}' AND cliente_id IN ('{C1}','{C2}')"))
 swap=f"UPDATE public.user_clientes SET principal=(cliente_id='{{C}}') WHERE user_id='{PROD}' AND cliente_id IN ('{C1}','{C2}');"
 body=''.join("BEGIN;SET LOCAL ROLE service_role;"+swap.replace('{C}',C1 if i%2 else C2)+"COMMIT;" for i in range(20))
 procs=[subprocess.Popen(base[:-1],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True) for _ in range(2)]
 for p in procs: p.stdin.write(body); p.stdin.close()
 for p in procs:
  err=p.stderr.read(); assert p.wait()==0,'concorrência falhou: '+err
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{PROD}' AND principal AND is_active AND revoked_at IS NULL",'1')
 check(f"SELECT p.cliente_id=uc.cliente_id FROM public.profiles p JOIN public.user_clientes uc ON uc.user_id=p.user_id AND uc.principal WHERE p.user_id='{PROD}'",'t')
 # ---- 12) rollback transacional não persiste ----
 run(f"BEGIN;SET LOCAL ROLE service_role;UPDATE public.user_clientes SET is_active=false,revoked_at=now() WHERE user_id='{PROD}';ROLLBACK;")
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{PROD}' AND principal",'1')
 # ---- 13) consultor sem vínculos intacto ----
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{CONS}'",'0')
 # ---- 14) FK cascade: DELETE do cliente remove vínculos e reelege principal ----
 # PROD2 tem C2 (principal) e C3; apagar C2 cascateia o vínculo, dispara o
 # trigger DELETE statement e C3 deve ser eleito; profile segue coerente.
 run(admin(f"DELETE FROM public.clientes WHERE id='{C2}'"))
 check(f"SELECT count(*) FROM public.user_clientes WHERE cliente_id='{C2}'",'0')
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{PROD2}' AND principal",C3)
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{PROD2}'",C3)
 # ---- 15) writer aninhado: trigger de provisionamento insere vínculo DURANTE a reconciliação ----
 # Simula provisionamento: ao nascer o 1º vínculo de um usuário, um trigger
 # externo insere um 2º vínculo no mesmo comando. Sem pg_trigger_depth, a
 # passagem extra NÃO é suprimida e o estado final converge.
 run(f'''CREATE FUNCTION public.prov_nested_writer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $f$
 BEGIN
  IF (SELECT count(*) FROM public.user_clientes WHERE user_id=NEW.user_id)=1 THEN
   INSERT INTO public.user_clientes(user_id,cliente_id,principal) VALUES (NEW.user_id,'{C4}',false);
  END IF; RETURN NULL;
 END $f$;
 CREATE TRIGGER z95_prov_nested AFTER INSERT ON public.user_clientes FOR EACH ROW EXECUTE FUNCTION public.prov_nested_writer()''')
 run(admin(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal) VALUES ('{NEST}','{C3}',true)"))
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{NEST}'",'2')
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{NEST}' AND principal",'1')
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{NEST}' AND principal",C3)
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{NEST}'",C3)
 # ---- 16) DELETE multirow: remove principal e outra linha; remanescente eleito ----
 run(admin(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal) VALUES ('{NEST}','{C1}',false)"))
 run(admin(f"DELETE FROM public.user_clientes WHERE user_id='{NEST}' AND cliente_id IN ('{C3}','{C4}')"))
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{NEST}' AND principal",C1)
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{NEST}'",C1)
 # ---- 17) empate created_at: desempate determinístico por id ----
 TIE='2026-01-01 00:00:00+00'
 run(admin(f"UPDATE public.user_clientes SET principal=false WHERE user_id='{NEST}'"))
 run(admin(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal,created_at) VALUES ('{NEST}','{C3}',false,'{TIE}')"))
 run(admin(f"UPDATE public.user_clientes SET created_at='{TIE}' WHERE user_id='{NEST}'"))
 run(admin(f"UPDATE public.user_clientes SET principal=true WHERE user_id='{NEST}' AND cliente_id IN ('{C1}','{C3}')"))
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{NEST}' AND principal",'1')
 # vencedor deve ser exatamente o determinístico (created_at ASC, id ASC)
 tie=run(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{NEST}' AND principal")
 expect=run(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{NEST}' AND cliente_id IN ('{C1}','{C3}') ORDER BY created_at ASC, id ASC LIMIT 1")
 assert tie==expect,(tie,expect);checks+=1
 # ---- 18) expiração temporal SEM DML: nenhum trigger dispara com a passagem do
 # tempo (por desenho); leituras passam pelo resolver canônico, que filtra
 # valid_until. Aqui provamos que o predicado de vigência exclui o expirado e
 # que o profile NÃO é reescrito sozinho (sem falso principal novo).
 run(admin(f"UPDATE public.user_clientes SET valid_until=now()+interval '2 seconds' WHERE user_id='{NEST}' AND principal"))
 time.sleep(3)
 check(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{NEST}' AND principal AND is_active AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>=now())",'0')
 # próximo DML qualquer reconcilia: rebaixa o expirado e elege vigente
 run(admin(f"UPDATE public.user_clientes SET valid_from=now()-interval '1 hour' WHERE user_id='{NEST}' AND cliente_id='{C1}'"))
 check(f"SELECT cliente_id FROM public.user_clientes WHERE user_id='{NEST}' AND principal",C1)
 check(f"SELECT cliente_id FROM public.profiles WHERE user_id='{NEST}'",C1)
 print(f'{checks} checks PASS — PostgreSQL isolado, guards reais, FK cascade, writer aninhado, 2 conexões; não hosted')
 print('UNVERIFIED: ensaio hosted BEGIN/ROLLBACK, RLS/policies completas, schema fiscal integral, guard_superadmin_role_assignment')
finally:
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True)
 shutil.rmtree(tmp,ignore_errors=True)
