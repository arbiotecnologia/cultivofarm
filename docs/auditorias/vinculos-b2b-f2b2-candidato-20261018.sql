-- EXPERIMENTO REVISÁVEL F2-B2, NÃO EXECUTAR EM BANCO HOSPEDADO.
-- Ref canônico obrigatório swzpzcwiasxmjutrmvkm, verificação externa; GUC não comprova destino.
-- Sem autorização/proveniência, preflight SEMPRE aborta. Não remover barreira sem nova revisão.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE f record; digest text;
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'F2B2_EXECUTOR_NOT_REVIEWED'; END IF;
 SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure('public.sync_puc_to_ptc_fn()');
 IF NOT FOUND OR md5(pg_get_functiondef(f.oid)) IS DISTINCT FROM '4dc955897950bf70ee8e1072bbae1ff2'
 OR f.proowner <> 'postgres'::regrole OR NOT f.prosecdef OR f.provolatile <> 'v'
 OR f.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
 OR (SELECT array_agg(x::text ORDER BY x::text) FROM unnest(f.proacl) x)
 IS DISTINCT FROM ARRAY['postgres=X/postgres','service_role=X/postgres']::text[]
 THEN RAISE EXCEPTION 'F2B2_BASELINE_DRIFT'; END IF;
 IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace=f.pronamespace AND p.proname=f.proname)<>1
 THEN RAISE EXCEPTION 'F2B2_OVERLOAD_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_user_clients'::regclass
 AND tgname='trg_sync_puc_to_ptc' AND tgfoid=f.oid AND tgtype=21 AND tgenabled='O')
 THEN RAISE EXCEPTION 'F2B2_TRIGGER_DRIFT'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.validate_partner_user_client_fn()')))
 IS DISTINCT FROM 'dcafec82ec7147ab67ce17ab934d3619' THEN RAISE EXCEPTION 'F2B2_VALIDATOR_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='partner_user_clients'
 AND policyname='bf02_assignment_contract_containment' AND permissive='RESTRICTIVE' AND cmd='ALL'
 AND qual='false' AND with_check='false' AND roles=ARRAY['anon','authenticated']::name[])
 THEN RAISE EXCEPTION 'F2B2_CONTAINMENT_DRIFT'; END IF;
 SELECT md5(string_agg(schemaname||'.'||tablename||':'||policyname||':'||roles::text||':'||cmd||':'||permissive||':'||coalesce(qual,'')||':'||coalesce(with_check,''),E'\n' ORDER BY schemaname,tablename,policyname)) INTO digest
 FROM pg_policies WHERE tablename IN ('partner_user_clients','partner_technician_clients');
 IF digest IS DISTINCT FROM '04715951097eb34ad7e8f735f663d15a' THEN RAISE EXCEPTION 'F2B2_POLICY_DRIFT'; END IF;
 -- Não autorizar por postgres/service_role: executores privilegiados não são contrato de ator.
 RAISE EXCEPTION 'F2B2_ACTOR_AND_PROJECTION_PROVENANCE_UNPROVEN';
END $preflight$;
-- BEGIN LOCAL CANDIDATE
CREATE OR REPLACE FUNCTION public.sync_puc_to_ptc_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE should_project boolean;
BEGIN
  -- Não transfere identidade nem desativa outro parceiro como efeito lateral.
  IF TG_OP = 'UPDATE' AND (NEW.partner_id IS DISTINCT FROM OLD.partner_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='F2B2_ASSIGNMENT_IDENTITY_IMMUTABLE';
  END IF;
  should_project := NEW.active IS TRUE AND NEW.assignment_type = 'tecnico'
    AND NEW.user_role = 'parceiro_b2b_tecnico'
    AND public.has_role(NEW.user_id,'parceiro_b2b_tecnico'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.partner_users pu JOIN public.partner_accounts pa ON pa.id=pu.partner_id
      WHERE pu.user_id=NEW.user_id AND pu.partner_id=NEW.partner_id
        AND pu.revoked_at IS NULL AND pu.valid_from <= now()
        AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
        AND pa.commercial_owner_organization_id IS NOT NULL
        AND pu.tenant_id=pa.commercial_owner_organization_id
    );
  IF should_project IS TRUE THEN
    INSERT INTO public.partner_technician_clients (partner_id, technician_user_id, cliente_id, assigned_by, active, notes)
    VALUES (NEW.partner_id, NEW.user_id, NEW.cliente_id, NEW.assigned_by, true, NEW.notes)
    ON CONFLICT (partner_id, technician_user_id, cliente_id)
    DO UPDATE SET active = EXCLUDED.active, updated_at = now(), notes = EXCLUDED.notes
    WHERE partner_technician_clients.active IS DISTINCT FROM EXCLUDED.active
       OR partner_technician_clients.notes IS DISTINCT FROM EXCLUDED.notes;
  ELSE
    -- Desativação somente: NÃO consulta elegibilidade do alvo para autorizar cleanup.
    -- Chave não prova propriedade exclusiva da projeção: execução segue NO-GO.
    UPDATE public.partner_technician_clients SET active=false, updated_at=now()
    WHERE partner_id=NEW.partner_id AND technician_user_id=NEW.user_id
      AND cliente_id=NEW.cliente_id AND active IS TRUE;
  END IF;
  RETURN NEW;
END;
$function$;
-- END LOCAL CANDIDATE
COMMIT;
