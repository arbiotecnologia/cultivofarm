-- SOMENTE LEITURA; preparado, não executado pelo agente.
-- Antes de executar, operador deve comprovar ref EXATO swzpzcwiasxmjutrmvkm.
-- SQL de catálogo sozinho não comprova project ref; destino desconhecido = STOP.
-- PostgreSQL 17+ (privilégio MAINTAIN). Erro/NULL/check false = NO-GO.
-- Nenhuma RPC é chamada; nenhuma linha de aplicação é lida ou alterada.
BEGIN TRANSACTION READ ONLY;

-- Matriz efetiva de tabela: inclui grants herdados e PUBLIC.
WITH roles(role_name) AS (VALUES ('anon'), ('authenticated'), ('postgres'), ('service_role')),
privileges(privilege) AS (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN'))
SELECT role_name, privilege,
  has_table_privilege(role_name, 'public.visitas_campo', privilege) AS effective,
  has_table_privilege(role_name, 'public.visitas_campo', privilege)
    IS NOT DISTINCT FROM (privilege='SELECT' OR role_name IN ('postgres','service_role')) AS ok
FROM roles CROSS JOIN privileges ORDER BY role_name, privilege;

-- Matriz efetiva de coluna: grants de tabela OU de coluna, incluindo herança.
WITH roles(role_name) AS (VALUES ('anon'), ('authenticated'), ('postgres'), ('service_role')),
privileges(privilege) AS (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES'))
SELECT role_name, a.attname AS column_name, privilege,
  has_column_privilege(role_name, a.attrelid, a.attnum, privilege) AS effective,
  has_column_privilege(role_name, a.attrelid, a.attnum, privilege)
    IS NOT DISTINCT FROM (privilege='SELECT' OR role_name IN ('postgres','service_role')) AS ok
FROM pg_attribute a CROSS JOIN roles CROSS JOIN privileges
WHERE a.attrelid='public.visitas_campo'::regclass AND a.attnum>0 AND NOT a.attisdropped
ORDER BY role_name, a.attnum, privilege;

-- PUBLIC não é um papel: conferir também ACLs explícitas de tabela/colunas.
SELECT 'public_table_no_write' AS check_name, NOT EXISTS (
  SELECT 1 FROM pg_class c CROSS JOIN LATERAL
    aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
  WHERE c.oid='public.visitas_campo'::regclass AND acl.grantee=0
    AND acl.privilege_type <> 'SELECT') AS ok
UNION ALL SELECT 'public_column_no_write', NOT EXISTS (
  SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) acl
  WHERE a.attrelid='public.visitas_campo'::regclass AND a.attnum>0 AND NOT a.attisdropped
    AND acl.grantee=0 AND acl.privilege_type <> 'SELECT');

-- ACL bruta para auditoria; não é substituto da matriz efetiva.
SELECT pg_get_userbyid(relowner) AS owner, relacl, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE oid='public.visitas_campo'::regclass;
SELECT attname, attacl FROM pg_attribute
WHERE attrelid='public.visitas_campo'::regclass AND attnum>0 AND NOT attisdropped
ORDER BY attnum;

-- EXECUTE preservado: catálogo, não homologação HTTP/JWT/RLS.
WITH roles(role_name, expected) AS (VALUES
  ('anon',false), ('authenticated',true), ('postgres',true), ('service_role',true))
SELECT role_name, has_function_privilege(role_name,
  'public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)', 'EXECUTE') AS effective,
  has_function_privilege(role_name,
  'public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)', 'EXECUTE')
    IS NOT DISTINCT FROM expected AS ok FROM roles;

SELECT 'rpc_owner_definer_config_acl' AS check_name,
  pg_get_userbyid(proowner)='postgres' AND prosecdef
  AND proconfig::text='{search_path=public,lock_timeout=3s}'
  AND proacl::text='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' AS ok,
  md5(pg_get_functiondef(oid)) AS observed_hash
FROM pg_proc WHERE oid='public.rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)'::regprocedure;
SELECT 'rls_enabled' AS check_name, relrowsecurity AS ok
FROM pg_class WHERE oid='public.visitas_campo'::regclass;
SELECT 'policies_preserved' AS check_name,
  md5(string_agg(polname::text||':'||polcmd::text||':'||polpermissive::text||':'||
    coalesce(pg_get_expr(polqual,polrelid),'')||':'||
    coalesce(pg_get_expr(polwithcheck,polrelid),''), E'\n' ORDER BY polname))
    IS NOT DISTINCT FROM '644e3004ce3f33e709c35b98341b82bf' AS ok
FROM pg_policy WHERE polrelid='public.visitas_campo'::regclass;
SELECT 'guard_insert_update' AS check_name,
  count(*)=1 AND coalesce(bool_and(tgtype & 4 = 4 AND tgtype & 16 = 16 AND tgtype & 2 = 2),false) AS ok
FROM pg_trigger WHERE tgrelid='public.visitas_campo'::regclass
  AND tgname='trg_visitas_campo_guard' AND NOT tgisinternal;
-- Corpo atual observado, sem inventar hash LIVE não fornecido nesta reconciliação.
SELECT oid, md5(pg_get_functiondef(oid)) AS observed_hash, proconfig, proacl
FROM pg_proc WHERE oid='public.visitas_campo_guard()'::regprocedure;
ROLLBACK;