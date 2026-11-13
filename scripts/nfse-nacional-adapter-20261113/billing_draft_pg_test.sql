-- Teste PostgreSQL efetivo (réplica local descartável do esquema de produção
-- swzpzcwiasxmjutrmvkm, lido em modo somente leitura). Tudo em uma transação
-- com ROLLBACK final. Dados 100% sintéticos. Nunca executar contra produção.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = origin;
-- fixtures sintéticas
insert into auth.users(id,email) values ('00000000-0000-4000-8000-0000000000a1','qa-a@example.invalid'),('00000000-0000-4000-8000-0000000000b1','qa-b@example.invalid'),('00000000-0000-4000-8000-0000000000a2','qa-gestor@example.invalid');
insert into public.organizations(id,nome,ativo,status) values ('00000000-0000-4000-8000-00000000000a','QA ORG A',true,'ativa'),('00000000-0000-4000-8000-00000000000b','QA ORG B',true,'ativa');
insert into public.profiles(user_id,organization_id,ativo) values ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-00000000000a',true),('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-00000000000b',true),('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-00000000000a',true);
insert into public.user_roles(user_id,role) values ('00000000-0000-4000-8000-0000000000a1','administrador'),('00000000-0000-4000-8000-0000000000b1','administrador'),('00000000-0000-4000-8000-0000000000a2','gestor');
