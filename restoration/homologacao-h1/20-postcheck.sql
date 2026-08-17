-- Postcheck H1 — somente leitura.
\echo '== 1. Policies permissivas (qual=true) nas tabelas alvo =='
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('aplicacao_emails','aplicacao_evidencias_vinculos','arquivos',
                    'registros_consultor_status_log','solicitacoes_timeline','organizations')
order by tablename, cmd, policyname;

\echo '== 2. Funcoes SECURITY DEFINER ainda executaveis por anon =='
select p.proname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;

\echo '== 3. rpc_notificar_gestor presente e sem anon =='
select p.oid::regprocedure::text as sig,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='rpc_notificar_gestor';

\echo '== 4. Helpers novos criados =='
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in
 ('is_operational_staff','can_user_access_aplicacao','can_user_manage_aplicacao',
  'can_user_access_registro_consultor','can_user_access_solicitacao','can_user_access_arquivo')
order by 1;

\echo '== 5. RLS habilitada nas tabelas alvo =='
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('aplicacao_emails','aplicacao_evidencias_vinculos','arquivos',
  'registros_consultor_status_log','solicitacoes_timeline','organizations')
order by 1;
