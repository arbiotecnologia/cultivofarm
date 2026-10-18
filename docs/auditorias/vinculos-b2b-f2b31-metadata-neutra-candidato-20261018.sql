-- PROPOSTA REVISÁVEL, NÃO EXECUTADA. Não é autorização para o agente instalar.
-- Revisão externa: comprovar endpoint/ref, anexar backup/manifesto e aprovação explícita
-- SOMENTE do estágio neutro; preencher os DOIS literais NULL abaixo em cópia revisada.
-- Atestação administrativa, NÃO mecanismo de autenticação ou bypass de RLS.
-- O arquivo original recusa execução; não remover testes de drift/contagens.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=public;
DO $approval$
DECLARE reviewed_ref text := NULL; review_receipt text := NULL;
BEGIN
 IF reviewed_ref IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm'
 OR review_receipt IS NULL OR length(btrim(review_receipt))<8 THEN
  RAISE EXCEPTION 'F2B31_EXTERNAL_REVIEW_REQUIRED' USING ERRCODE='42501';
 END IF;
END $approval$;
LOCK TABLE public.partner_user_clients,public.partner_technician_clients IN ACCESS EXCLUSIVE MODE;
DO $drift$
DECLARE h text; entries bigint;
BEGIN
WITH manifest AS (
 SELECT 'function:'||p.oid::regprocedure::text AS key,
 pg_get_functiondef(p.oid)||'|'||pg_get_userbyid(p.proowner)||'|'||coalesce(p.proacl::text,'NULL') AS value
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prokind='f' AND (p.prosrc ~ '\mpartner_technician_clients\M|\mpartner_user_clients\M'
 OR (n.nspname='public' AND p.proname IN ('validate_partner_user_client_fn','assign_b2b_user_client_secure',
 'unassign_b2b_user_client_secure','get_b2b_partner_clients_for_assignment_secure'))
 OR (n.nspname='platform_private' AND p.proname='b2b_commercial_context'))
 UNION ALL SELECT 'policy:'||schemaname||'.'||tablename||'.'||policyname,
 permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'NULL')||'|'||coalesce(with_check,'NULL')
 FROM pg_policies WHERE tablename IN ('partner_user_clients','partner_technician_clients')
 OR (coalesce(qual,'')||coalesce(with_check,'')) ~ '\m(get_user_partner_id|get_partner_papel|get_b2b_user_role_for_partner|is_valid_b2b_partner_user|partner_user_clients|partner_technician_clients)\M'
 UNION ALL SELECT 'trigger:'||c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients') AND NOT t.tgisinternal
 UNION ALL SELECT 'constraint:'||c.relname||'.'||k.conname,pg_get_constraintdef(k.oid)
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients')
 UNION ALL SELECT 'table:'||c.relname,c.relrowsecurity::text||'|'||c.relforcerowsecurity::text||'|'||coalesce(c.relacl::text,'NULL')
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients')
)
SELECT md5(string_agg(key||'='||value,E'\n' ORDER BY key)),count(*) INTO h,entries FROM manifest;
 IF h IS DISTINCT FROM '97e96aa537418f63d7a9b32574dbf7cc' OR entries<>59 THEN
  RAISE EXCEPTION 'F2B31_BASELINE_DRIFT';
 END IF;
END $drift$;
DO $preflight$
BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
 AND table_name='partner_technician_clients' AND column_name IN ('grant_origin','source_puc_id')) THEN
  RAISE EXCEPTION 'F2B31_METADATA_PRESENT_OR_PARTIAL_DRIFT';
 END IF;
 IF EXISTS(SELECT 1 FROM public.partner_user_clients) OR EXISTS(SELECT 1 FROM public.partner_technician_clients) THEN
  RAISE EXCEPTION 'F2B31_NONEMPTY_REQUIRES_NEW_REVIEW';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE prokind='f' AND prosrc ~ '\m(grant_origin|source_puc_id)\M')
 OR EXISTS(SELECT 1 FROM pg_policies WHERE (coalesce(qual,'')||coalesce(with_check,'')) ~ '\m(grant_origin|source_puc_id)\M') THEN
  RAISE EXCEPTION 'F2B31_METADATA_ALREADY_CONSUMED';
 END IF;
END $preflight$;
-- BEGIN LOCAL SCHEMA
-- Metadata NÃO CONFIÁVEL: nenhum consumidor pode usar isto para acesso ou cleanup.
-- Sem DEFAULT, backfill, CHECK de origem, FK, índice ou alteração de PUC.
ALTER TABLE public.partner_technician_clients ADD COLUMN grant_origin text NULL,
 ADD COLUMN source_puc_id uuid NULL;
COMMENT ON COLUMN public.partner_technician_clients.grant_origin IS
 'B3.1 UNTRUSTED staging metadata; NULL by default. Client writable under existing ACL. Never use for authorization, cleanup, proof of provenance or auditing. No backfill.';
COMMENT ON COLUMN public.partner_technician_clients.source_puc_id IS
 'B3.1 UNTRUSTED proposed source, not a foreign key or stable receipt. May be orphaned/spoofed. No authorization or cleanup use until separate server-owned contract/cutover.';
-- END LOCAL SCHEMA
DO $drift$
DECLARE h text; entries bigint;
BEGIN
WITH manifest AS (
 SELECT 'function:'||p.oid::regprocedure::text AS key,
 pg_get_functiondef(p.oid)||'|'||pg_get_userbyid(p.proowner)||'|'||coalesce(p.proacl::text,'NULL') AS value
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prokind='f' AND (p.prosrc ~ '\mpartner_technician_clients\M|\mpartner_user_clients\M'
 OR (n.nspname='public' AND p.proname IN ('validate_partner_user_client_fn','assign_b2b_user_client_secure',
 'unassign_b2b_user_client_secure','get_b2b_partner_clients_for_assignment_secure'))
 OR (n.nspname='platform_private' AND p.proname='b2b_commercial_context'))
 UNION ALL SELECT 'policy:'||schemaname||'.'||tablename||'.'||policyname,
 permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'NULL')||'|'||coalesce(with_check,'NULL')
 FROM pg_policies WHERE tablename IN ('partner_user_clients','partner_technician_clients')
 OR (coalesce(qual,'')||coalesce(with_check,'')) ~ '\m(get_user_partner_id|get_partner_papel|get_b2b_user_role_for_partner|is_valid_b2b_partner_user|partner_user_clients|partner_technician_clients)\M'
 UNION ALL SELECT 'trigger:'||c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients') AND NOT t.tgisinternal
 UNION ALL SELECT 'constraint:'||c.relname||'.'||k.conname,pg_get_constraintdef(k.oid)
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients')
 UNION ALL SELECT 'table:'||c.relname,c.relrowsecurity::text||'|'||c.relforcerowsecurity::text||'|'||coalesce(c.relacl::text,'NULL')
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients')
)
SELECT md5(string_agg(key||'='||value,E'\n' ORDER BY key)),count(*) INTO h,entries FROM manifest;
 IF h IS DISTINCT FROM '97e96aa537418f63d7a9b32574dbf7cc' OR entries<>59 THEN
  RAISE EXCEPTION 'F2B31_BASELINE_DRIFT';
 END IF;
END $drift$;
COMMIT;
