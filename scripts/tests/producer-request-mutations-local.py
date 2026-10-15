"""Full portal_solicitacoes shape/constraints, all nine policies and five real triggers.
Isolated PostgreSQL only. Auth/readiness and communication sink are reduced, NOT JWT/GoTrue.
No hosted connections, real accounts or external delivery. Run with python3.
"""
from pathlib import Path
import os, re, subprocess, tempfile, shutil
ROOT = Path(__file__).resolve().parents[2]
U='11111111-1111-4111-8111-111111111111'
T='22222222-2222-4222-8222-222222222222'
F='33333333-3333-4333-8333-333333333333'
C='aaaaaaaa-0000-4000-8000-000000000001'
S='aaaaaaaa-0000-4000-8000-000000000002'
X='bbbbbbbb-0000-4000-8000-000000000001'
O='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
Q='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

def function(path, name):
    text=(ROOT/path).read_text()
    m=re.search(r'CREATE OR REPLACE FUNCTION public\.'+name+r'\(.*?AS (\$\w*\$)(.*?)\1;',text,re.S|re.I)
    assert m, name
    return m.group(0)

def main():
    tmp=Path(tempfile.mkdtemp(prefix='producer-request-',dir='/tmp')); tmp.chmod(0o777)
    prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
    checks=0
    try:
        subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
        subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55506','start'],check=True,capture_output=True)
        def run(sql, denied=False):
            nonlocal checks
            r=subprocess.run(['psql','-X','-h',str(tmp),'-p','55506','-U','postgres','-qAt','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True)
            if denied:
                assert r.returncode!=0 and ('DENIED' in r.stderr or 'row-level security' in r.stderr or 'permission denied' in r.stderr),r.stderr
                checks+=1
            else:
                assert r.returncode==0,r.stderr
            return r.stdout.strip()
        def check(sql, expected):
            nonlocal checks
            result=run(sql); assert result==str(expected),(sql,result,expected); checks+=1
        def session(sql, actor=U, role='authenticated', ready='true'):
            return f"SET request.actor='{actor}'; SET request.ready='{ready}'; SET ROLE {role};"+sql
        schema=f"""
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TYPE app_role AS ENUM ('administrador','gestor','consultor_tecnico','tecnico_agronomo','aplicador','cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico');
CREATE TABLE profiles(user_id uuid PRIMARY KEY,organization_id uuid,ativo boolean,cliente_id uuid);
CREATE TABLE user_roles(user_id uuid,role app_role);
CREATE TABLE clientes(id uuid PRIMARY KEY,organization_id uuid,status_cliente text,nome text);
CREATE TABLE fazendas(id uuid PRIMARY KEY,cliente_id uuid,organization_id uuid);
CREATE TABLE talhoes(id uuid PRIMARY KEY,fazenda_id uuid,organization_id uuid);
CREATE TABLE registros_consultor(id uuid PRIMARY KEY);
CREATE TABLE user_clientes(user_id uuid,cliente_id uuid,is_active boolean,revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz,access_level text);
CREATE SEQUENCE public.solicitacoes_numero_seq;
CREATE TABLE portal_solicitacoes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
 user_id uuid NOT NULL, fazenda_id uuid REFERENCES fazendas(id),talhao_id uuid REFERENCES talhoes(id),
 tipo_demanda text NOT NULL,descricao text,urgencia text NOT NULL DEFAULT 'media',status text NOT NULL DEFAULT 'pendente',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 solicitante_nome text,solicitante_contato text,audio_inicial_url text,fotos_iniciais text[] DEFAULT '{{}}',
 consultor_atribuido uuid,numero_solicitacao text UNIQUE,origem_solicitacao text DEFAULT 'portal_produtor',
 data_prevista_atendimento timestamptz,created_by uuid,confirmacao_produtor text DEFAULT 'pendente',
 external_event_id text,duracao_estimada integer,registro_origem_id uuid REFERENCES registros_consultor(id),
 audio_inicial_path text,fotos_paths text[]);
GRANT SELECT,INSERT,UPDATE,DELETE ON portal_solicitacoes TO authenticated;
GRANT ALL ON portal_solicitacoes TO service_role;
GRANT USAGE,SELECT ON SEQUENCE solicitacoes_numero_seq TO authenticated,service_role;
ALTER TABLE portal_solicitacoes ENABLE ROW LEVEL SECURITY;
CREATE TABLE notificacoes_operacionais(usuario_id uuid,tipo text,titulo text,mensagem text,link text);
CREATE TABLE local_event_sink(event_key text,source_id uuid,payload jsonb);
CREATE FUNCTION _comunicacao_publish_system_event(text,text,uuid,jsonb,text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN INSERT INTO public.local_event_sink VALUES($1,$3,$4); RETURN '{{}}'::jsonb; END $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.actor',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('iat',extract(epoch from now())::bigint) $$;
CREATE FUNCTION platform_private.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT organization_id FROM public.profiles WHERE user_id=auth.uid() AND ativo AND current_setting('request.ready',true)='true' $$;
CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1=auth.uid() AND platform_private.h15_actor_organization() IS NOT NULL $$;
CREATE FUNCTION public.fn_authz_uid_scope_ok(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1=auth.uid() AND platform_private.h15_actor_organization() IS NOT NULL $$;
CREATE FUNCTION public.get_cliente_ids_for_user(_user_id uuid) RETURNS uuid[] LANGUAGE sql SECURITY DEFINER SET search_path='public' AS $$
SELECT CASE WHEN public.fn_authz_uid_scope_ok(_user_id) THEN ARRAY(
 SELECT uc.cliente_id FROM public.user_clientes uc WHERE uc.user_id=_user_id AND uc.is_active=true AND uc.revoked_at IS NULL
 AND (uc.valid_from IS NULL OR uc.valid_from<=now()) AND (uc.valid_until IS NULL OR uc.valid_until>=now())
 UNION SELECT pr.cliente_id FROM public.profiles pr WHERE pr.user_id=_user_id AND pr.cliente_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.user_clientes uc2 WHERE uc2.user_id=pr.user_id AND uc2.cliente_id=pr.cliente_id
 AND uc2.is_active=true AND uc2.revoked_at IS NULL AND (uc2.valid_from IS NULL OR uc2.valid_from<=now())
 AND (uc2.valid_until IS NULL OR uc2.valid_until>=now()))) ELSE ARRAY[]::uuid[] END $$;
GRANT USAGE ON SCHEMA auth,platform_private TO authenticated,service_role;
INSERT INTO profiles VALUES('{U}','{O}',true,NULL),('{T}','{O}',true,NULL),('{F}','{Q}',true,NULL);
INSERT INTO user_roles VALUES('{U}','cliente_produtor'),('{T}','consultor_tecnico'),('{F}','consultor_tecnico');
INSERT INTO clientes VALUES('{C}','{O}','ativo','fixture'),('{S}','{O}','ativo','sibling'),('{X}','{Q}','ativo','foreign');
INSERT INTO user_clientes VALUES('{U}','{C}',true,NULL,NULL,NULL,'read'),('{T}','{C}',true,NULL,NULL,NULL,'manage');
"""
        for name in ['technical_actor_ready','technical_refs_in_actor_tenant']:
            schema+=function('scripts/rbac-audit/technical-tenant-containment.sql',name)
        # All nine hosted policies; no permissive-alone shortcuts.
        policies=[('Admins can manage all requests','ALL',"platform_private.has_role(auth.uid(),'administrador')",None),
          ('Authenticated can read all requests','SELECT',"platform_private.has_role(auth.uid(),'administrador') OR platform_private.has_role(auth.uid(),'gestor')",None),
          ('Consultants can view their assigned requests','SELECT',"consultor_atribuido=auth.uid() AND (platform_private.has_role(auth.uid(),'consultor_tecnico') OR platform_private.has_role(auth.uid(),'tecnico_agronomo') OR platform_private.has_role(auth.uid(),'aplicador'))",None),
          ('Creators can view own requests','SELECT','created_by=auth.uid() OR user_id=auth.uid()',None),
          ('Portal users can insert own requests','INSERT',None,'cliente_id=ANY(get_cliente_ids_for_user(auth.uid()))'),
          ('Portal users can read own requests','SELECT','cliente_id=ANY(get_cliente_ids_for_user(auth.uid()))',None),
          ('Portal users can update own requests','UPDATE','cliente_id=ANY(get_cliente_ids_for_user(auth.uid()))','cliente_id=ANY(get_cliente_ids_for_user(auth.uid()))'),
          ('Staff can create requests','INSERT',None,"platform_private.has_role(auth.uid(),'administrador') OR platform_private.has_role(auth.uid(),'gestor') OR platform_private.has_role(auth.uid(),'consultor_tecnico') OR platform_private.has_role(auth.uid(),'tecnico_agronomo')")]
        for name,cmd,using,with_check in policies:
            schema+=f'CREATE POLICY "{name}" ON portal_solicitacoes FOR {cmd} TO authenticated'+(f' USING ({using})' if using else '')+(f' WITH CHECK ({with_check})' if with_check else '')+';'
        schema+='CREATE POLICY technical_request_tenant_isolation ON portal_solicitacoes AS RESTRICTIVE FOR ALL TO authenticated USING (technical_refs_in_actor_tenant(cliente_id,fazenda_id,talhao_id)) WITH CHECK (technical_refs_in_actor_tenant(cliente_id,fazenda_id,talhao_id));'
        bodies=[('supabase/migrations/20260424003948_da57af29-f7a5-4251-b278-6232b44a8910.sql','gen_numero_solicitacao','trg_gen_numero_solicitacao','BEFORE INSERT'),
          ('supabase/migrations/20260424003948_da57af29-f7a5-4251-b278-6232b44a8910.sql','notify_consultor_atribuido_op','trg_notify_consultor_atribuido_op','AFTER INSERT OR UPDATE OF consultor_atribuido'),
          ('supabase/migrations/20260509165453_3960ae13-d347-40ed-bf70-4b4e10d744a1.sql','notify_consultor_on_confirmacao_produtor','trg_notify_consultor_confirmacao','AFTER UPDATE'),
          ('supabase/migrations/20260509170020_a6234f99-d47f-4fd2-95fa-eea3be9cca68.sql','validate_retorno_tecnico_consistency','trigger_validate_retorno_tecnico','BEFORE INSERT OR UPDATE'),
          ('supabase/migrations/20260727202956_28d27adb-74ef-4044-b066-4f0c543f44df.sql','_comunicacao_trg_portal_solicitacao','trg_comunicacao_solicitacao','AFTER INSERT OR UPDATE')]
        for path,name,trigger,event in bodies:
            schema+=function(path,name)+f'ALTER FUNCTION public.{name}() SET search_path=public,extensions;'
            schema+=f'CREATE TRIGGER {trigger} {event} ON portal_solicitacoes FOR EACH ROW EXECUTE FUNCTION {name}();'
        run(schema)
        check("SELECT count(*) FROM information_schema.columns WHERE table_name='portal_solicitacoes'",26)
        check("SELECT count(*) FROM pg_constraint WHERE conrelid='portal_solicitacoes'::regclass",6)
        check("SELECT count(*) FROM pg_policies WHERE tablename='portal_solicitacoes'",9)
        check("SELECT count(*) FROM pg_trigger WHERE tgrelid='portal_solicitacoes'::regclass AND NOT tgisinternal",5)
        insert=f"INSERT INTO portal_solicitacoes(cliente_id,user_id,tipo_demanda) VALUES('{C}','{U}','Praga');"
        # BEFORE: functional exploit, foreign recipient notified; isolated rollback preserves fixtures.
        check(session(f"BEGIN; INSERT INTO portal_solicitacoes(cliente_id,user_id,created_by,tipo_demanda,status,consultor_atribuido) VALUES('{C}','{F}','{F}','Praga','atribuida','{F}'); RESET ROLE; SELECT count(*) FROM notificacoes_operacionais WHERE usuario_id='{F}'; ROLLBACK;"),1)
        run(session(insert))
        rid=run('SELECT id FROM portal_solicitacoes LIMIT 1')
        check(session(f"BEGIN; UPDATE portal_solicitacoes SET user_id='{F}',status='concluida',consultor_atribuido='{F}' WHERE id='{rid}'; RESET ROLE; SELECT count(*) FROM notificacoes_operacionais WHERE usuario_id='{F}'; ROLLBACK;"),1)
        original=run("SELECT string_agg(tgname||pg_get_functiondef(tgfoid),E'\n' ORDER BY tgname) FROM pg_trigger WHERE tgrelid='portal_solicitacoes'::regclass AND NOT tgisinternal")
        run((ROOT/'scripts/rbac-audit/proposed-producer-request-mutations.sql').read_text())
        check("SELECT has_function_privilege('authenticated','producer_request_mutation_guard()','EXECUTE')",'f')
        check("SELECT string_agg(tgname||pg_get_functiondef(tgfoid),E'\n' ORDER BY tgname) FROM pg_trigger WHERE tgrelid='portal_solicitacoes'::regclass AND NOT tgisinternal AND tgname<>'a00_producer_request_mutation_guard'",original)
        run(session(insert))
        check(f"SELECT count(*) FROM portal_solicitacoes WHERE created_by='{U}'",1)
        # Every operational INSERT field individually denied, before notifications/events/numbers.
        fields={'user_id':f"'{F}'",'created_by':f"'{F}'",'status':"'atribuida'",'consultor_atribuido':f"'{F}'",'origem_solicitacao':"'interno'",'data_prevista_atendimento':"now()+interval '1 day'",'duracao_estimada':'120','registro_origem_id':f"'{F}'",'external_event_id':"'forged'",'confirmacao_produtor':"'confirmada'",'numero_solicitacao':"'FORGED'",'tipo_demanda':"'retorno_tecnico'"}
        before=run('SELECT count(*)||\':\'||(SELECT count(*) FROM local_event_sink)||\':\'||(SELECT last_value FROM solicitacoes_numero_seq) FROM notificacoes_operacionais')
        for field,value in fields.items():
            cols={'cliente_id':f"'{C}'",'user_id':f"'{U}'",'tipo_demanda':"'Praga'",field:value}
            run(session(f"INSERT INTO portal_solicitacoes({','.join(cols)}) VALUES({','.join(cols.values())});"),True)
        check('SELECT count(*)||\':\'||(SELECT count(*) FROM local_event_sink)||\':\'||(SELECT last_value FROM solicitacoes_numero_seq) FROM notificacoes_operacionais',before)
        for field,value in {**fields,'cliente_id':f"'{S}'",'id':f"'{F}'",'descricao':"'mutated'",'created_at':"now()-interval '1 day'",'fotos_paths':"ARRAY['forged']"}.items():
            run(session(f"UPDATE portal_solicitacoes SET {field}={value} WHERE id='{rid}';"),True)
        # Legitimate internally scheduled return; author remains internal, confirmation is client action.
        ret=run(session(f"INSERT INTO portal_solicitacoes(cliente_id,user_id,created_by,tipo_demanda,consultor_atribuido,data_prevista_atendimento,duracao_estimada,descricao,status,origem_solicitacao) VALUES('{C}','{T}','{T}','retorno_tecnico','{T}',now()+interval '2 days',120,'Retorno legítimo','atribuida','interno') RETURNING id;",T))
        for value in ['confirmada','confirmada','remarcacao_solicitada']:
            run(session(f"UPDATE portal_solicitacoes SET confirmacao_produtor='{value}' WHERE id='{ret}';"))
        check(f"SELECT count(*) FROM notificacoes_operacionais WHERE usuario_id='{T}' AND tipo='confirmacao_retorno'",2)
        check(f"SELECT created_by='{T}' AND user_id='{T}' AND status='atribuida' FROM portal_solicitacoes WHERE id='{ret}'",'t')
        for value in ["NULL","'pendente'","'inventada'"]:
            run(session(f"UPDATE portal_solicitacoes SET confirmacao_produtor={value} WHERE id='{ret}';"),True)
        for client in [S,X]:
            run(session(insert.replace(C,client)),True)
        run(session(insert,ready='false'),True)
        run(session(insert,role='anon'),True)
        # Both client revocation and technical recipient revocation fence updates.
        run(f"UPDATE user_clientes SET revoked_at=now() WHERE user_id='{T}';")
        run(session(f"UPDATE portal_solicitacoes SET confirmacao_produtor='confirmada' WHERE id='{ret}';"),True)
        run(f"UPDATE user_clientes SET revoked_at=NULL WHERE user_id='{T}'; UPDATE profiles SET ativo=false WHERE user_id='{T}';")
        run(session(f"UPDATE portal_solicitacoes SET confirmacao_produtor='confirmada' WHERE id='{ret}';"),True)
        run(f"UPDATE profiles SET ativo=true WHERE user_id='{T}'; UPDATE clientes SET status_cliente='inativo' WHERE id='{C}';")
        run(session(insert),True)
        run(f"UPDATE clientes SET status_cliente='ativo' WHERE id='{C}'; UPDATE user_clientes SET revoked_at=now() WHERE user_id='{U}';")
        run(session(insert),True)
        check(session(f"WITH q AS (UPDATE portal_solicitacoes SET confirmacao_produtor='confirmada' WHERE id='{ret}' RETURNING id) SELECT count(*) FROM q"),0)
        run(f"UPDATE user_clientes SET revoked_at=NULL WHERE user_id='{U}';")
        # Retained foreign assignment never dispatches confirmation, even on an owned client.
        run(f"UPDATE portal_solicitacoes SET consultor_atribuido='{F}' WHERE id='{ret}';")
        run(session(f"UPDATE portal_solicitacoes SET confirmacao_produtor='confirmada' WHERE id='{ret}';"),True)
        # Internals keep current policies, not new grants; rollback denies only producer writes.
        run((ROOT/'scripts/rbac-audit/rollback-producer-request-mutations.sql').read_text())
        run(session(insert),True)
        run(session(insert.replace(U,T),T))
        check("SELECT count(*) FROM pg_trigger WHERE tgrelid='portal_solicitacoes'::regclass AND NOT tgisinternal",5)
        print(f'{checks} assertions PASS; full target table/constraints/policies/five triggers; Auth and publisher reduced; no JWT/hosted proof.')
    finally:
        subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'stop','-m','immediate'],capture_output=True)
        shutil.rmtree(tmp)

if __name__=='__main__': main()