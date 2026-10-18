-- PRÉ-PROVA pelo auditor APÓS candidata instalada em ambiente autorizado.
-- Não executada pelo agente. Zero DML de domínio; nenhuma alteração de dados reais.
-- Claims sintéticas != JWT validado, login, RLS real, paridade ou certificação de revogação.
-- Executor comprova swzpzcwiasxmjutrmvkm fora do SQL; PostgreSQL não prova o ref.
BEGIN;
SET LOCAL statement_timeout='30s';
DO $test$
DECLARE u uuid; pid uuid; papel text; other_u uuid;
BEGIN
 IF (SELECT count(*) FROM public.partner_users WHERE revoked_at IS NULL)<>1
 THEN RAISE EXCEPTION 'F2B_FIXTURE_NOT_EXACTLY_ONE_ACTIVE'; END IF;
 SELECT pu.user_id,pu.partner_id,pu.papel INTO u,pid,papel
 FROM public.partner_users pu JOIN public.partner_accounts pa ON pa.id=pu.partner_id
 JOIN public.profiles p ON p.user_id=pu.user_id
 WHERE pu.revoked_at IS NULL AND pu.tenant_id=pa.commercial_owner_organization_id
 AND p.organization_id=pu.tenant_id AND p.ativo AND pa.ativo AND pa.deleted_at IS NULL;
 IF u IS NULL THEN RAISE EXCEPTION 'F2B_VALID_FIXTURE_UNAVAILABLE'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 IF public.get_user_partner_id() IS DISTINCT FROM pid
 OR public.get_partner_papel(u) IS DISTINCT FROM papel
 THEN RAISE EXCEPTION 'F2B_EXISTING_LINK_REGRESSION'; END IF;
 other_u:=gen_random_uuid();
 IF public.get_partner_papel(other_u) IS NOT NULL THEN RAISE EXCEPTION 'F2B_IMPERSONATION'; END IF;
 IF has_function_privilege('anon','public.get_user_partner_id()','EXECUTE')
 OR has_function_privilege('anon','public.get_partner_papel(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'F2B_ANON_ACL'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 IF public.get_user_partner_id() IS NOT NULL OR public.get_partner_papel(u) IS NOT NULL
 THEN RAISE EXCEPTION 'F2B_NO_ACTOR'; END IF;
 RAISE NOTICE 'PREPROVA: actual eligible link preserved, self-only and anon ACL checked; NOT REAL RLS';
END $test$;
ROLLBACK;
-- Revogado/inativo/owner NULL/2+ exigem fixtures ISOLADAS, jamais UPDATE em usuários reais.
-- UNIQUE(user_id) fica intacta. Não remover UNIQUE em produção para fabricar 2+.
