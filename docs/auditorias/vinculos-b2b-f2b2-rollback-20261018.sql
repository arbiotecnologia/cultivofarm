-- Revisão somente; restaura BUG baseline, não reativa PTC nem desfaz dados.
-- Exige decisão explícita e containment mantida. Ref externo swzpzcwiasxmjutrmvkm.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $rollback$
DECLARE f record;
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'F2B2_EXECUTOR_NOT_REVIEWED'; END IF;
 SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure('public.sync_puc_to_ptc_fn()');
 IF NOT FOUND OR f.proowner <> 'postgres'::regrole OR NOT f.prosecdef OR f.provolatile <> 'v'
 OR f.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
 OR (SELECT array_agg(x::text ORDER BY x::text) FROM unnest(f.proacl) x)
 IS DISTINCT FROM ARRAY['postgres=X/postgres','service_role=X/postgres']::text[]
 OR f.prosrc IS DISTINCT FROM $expected$
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
$expected$
 THEN RAISE EXCEPTION 'F2B2_ROLLBACK_DRIFT'; END IF;
END $rollback$;
CREATE OR REPLACE FUNCTION public.sync_puc_to_ptc_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.assignment_type = 'tecnico'
     AND (NEW.user_role = 'parceiro_b2b_tecnico' OR public.has_role(NEW.user_id, 'parceiro_b2b_tecnico'::app_role))
  THEN
    INSERT INTO public.partner_technician_clients (partner_id, technician_user_id, cliente_id, assigned_by, active, notes)
    VALUES (NEW.partner_id, NEW.user_id, NEW.cliente_id, NEW.assigned_by, NEW.active, NEW.notes)
    ON CONFLICT (partner_id, technician_user_id, cliente_id)
    DO UPDATE SET active = EXCLUDED.active, updated_at = now(), notes = EXCLUDED.notes;
  END IF;
  RETURN NEW;
END;
$function$;
DO $verify$ BEGIN
 IF md5(pg_get_functiondef('public.sync_puc_to_ptc_fn()'::regprocedure))<>'4dc955897950bf70ee8e1072bbae1ff2'
 THEN RAISE EXCEPTION 'F2B2_ROLLBACK_NOT_EXACT'; END IF;
END $verify$;
COMMIT;
