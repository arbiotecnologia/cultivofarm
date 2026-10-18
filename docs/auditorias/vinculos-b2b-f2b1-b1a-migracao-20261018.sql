-- F2-B1 2026-10-18 | SOMENTE REVISÃO. Nada executado hosted.
-- Ref obrigatório swzpzcwiasxmjutrmvkm; confirmar externamente, não por GUC/database.
-- B1a: contrato ATOR x ALVO NÃO provado; nenhum helper público novo/alterado.
-- Instalação segura bloqueada; não remover esta barreira por flag/GUC.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $gate$
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'F2B1_EXECUTOR_NOT_REVIEWED'; END IF;
 IF to_regprocedure('public.validate_partner_user_client_fn()') IS NULL OR to_regprocedure('public.sync_puc_to_ptc_fn()') IS NULL
 THEN RAISE EXCEPTION 'F2B1_ASSIGNMENT_BASELINE_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.validate_partner_user_client_fn()'::regprocedure))<>'dcafec82ec7147ab67ce17ab934d3619'
 OR md5(pg_get_functiondef('public.sync_puc_to_ptc_fn()'::regprocedure))<>'4dc955897950bf70ee8e1072bbae1ff2'
 THEN RAISE EXCEPTION 'F2B1_ASSIGNMENT_BASELINE_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='partner_user_clients' AND policyname='bf02_assignment_contract_containment' AND permissive='RESTRICTIVE' AND qual='false' AND with_check='false')
 THEN RAISE EXCEPTION 'F2B1_CONTAINMENT_DRIFT'; END IF;
 RAISE EXCEPTION 'F2B1_ACTOR_TARGET_WRITER_CONTRACT_UNPROVEN';
END $gate$;
COMMIT;
-- Proposta não executável: writer existente autoriza auth.uid() no tenant/parceiro,
-- locks/CAS/idempotência/auditoria; core privado apenas valida alvo por par vigente.
-- Desativação de atribuição antiga não exige alvo elegível, mas exige ator autorizado,
-- identidade/par/cliente imutáveis e bloqueio a qualquer ativação lateral.
-- Sincronização PUC→PTC deve desativar registro anterior mesmo após role change.
-- Revogar vínculo não altera roles se houver outro vigente; jamais transfere carteira.
