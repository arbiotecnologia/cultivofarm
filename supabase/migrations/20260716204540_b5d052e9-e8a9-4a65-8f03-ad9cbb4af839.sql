
-- =========================================================
-- FASE 12.11 — IMMUTABILITY TRIGGER FOR TECHNICAL VISITS
-- =========================================================

-- 1) Trigger function for registros_consultor
CREATE OR REPLACE FUNCTION public.enforce_visit_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Only enforce on visitas
  IF COALESCE(OLD.natureza_registro, 'ocorrencia'::natureza_registro_consultor)
     <> 'visita'::natureza_registro_consultor THEN
    -- still bump version for consistency
    NEW.version := COALESCE(OLD.version, 1) + 1;
    RETURN NEW;
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'administrador'::app_role);

  -- If previous status was 'finalizado', lock most fields
  IF OLD.status = 'finalizado'::status_registro_consultor THEN
    -- Allowed transitions from finalizado:
    --  - finalizado -> convertido_os  (OS generation)
    --  - admin can perform any change
    IF NOT v_is_admin THEN
      IF NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status <> 'convertido_os'::status_registro_consultor THEN
        RAISE EXCEPTION 'Visita finalizada é imutável (registro %). Transição de status não permitida: % -> %',
          OLD.id, OLD.status, NEW.status
          USING ERRCODE = 'check_violation';
      END IF;

      -- Block edits to core visit fields
      IF NEW.cliente_id       IS DISTINCT FROM OLD.cliente_id
      OR NEW.fazenda_id       IS DISTINCT FROM OLD.fazenda_id
      OR NEW.talhao_id        IS DISTINCT FROM OLD.talhao_id
      OR NEW.cultura_id       IS DISTINCT FROM OLD.cultura_id
      OR NEW.data_visita      IS DISTINCT FROM OLD.data_visita
      OR NEW.hora_inicio      IS DISTINCT FROM OLD.hora_inicio
      OR NEW.hora_fim         IS DISTINCT FROM OLD.hora_fim
      OR NEW.observacoes      IS DISTINCT FROM OLD.observacoes
      OR NEW.consultor_responsavel IS DISTINCT FROM OLD.consultor_responsavel
      OR NEW.natureza_registro     IS DISTINCT FROM OLD.natureza_registro
      OR NEW.finalized_at     IS DISTINCT FROM OLD.finalized_at
      OR NEW.finalized_by     IS DISTINCT FROM OLD.finalized_by THEN
        RAISE EXCEPTION 'Visita finalizada é imutável (registro %). Campos protegidos não podem ser alterados.',
          OLD.id USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- Auto-increment version
  NEW.version := COALESCE(OLD.version, 1) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_visit_immutability ON public.registros_consultor;
CREATE TRIGGER trg_enforce_visit_immutability
BEFORE UPDATE ON public.registros_consultor
FOR EACH ROW
EXECUTE FUNCTION public.enforce_visit_immutability();

-- 2) Trigger for visita_diagnosticos: block insert/update/delete
--    when parent visit is finalized (except admin)
CREATE OR REPLACE FUNCTION public.enforce_diagnostico_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status status_registro_consultor;
  v_natureza natureza_registro_consultor;
  v_registro_id uuid;
  v_is_admin boolean;
BEGIN
  v_registro_id := COALESCE(NEW.registro_id, OLD.registro_id);

  SELECT status, COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor)
    INTO v_status, v_natureza
    FROM public.registros_consultor
   WHERE id = v_registro_id;

  IF v_natureza <> 'visita'::natureza_registro_consultor THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'administrador'::app_role);

  IF v_status = 'finalizado'::status_registro_consultor AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Diagnósticos da visita % são imutáveis (visita finalizada).', v_registro_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_diagnostico_immutability ON public.visita_diagnosticos;
CREATE TRIGGER trg_enforce_diagnostico_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.visita_diagnosticos
FOR EACH ROW
EXECUTE FUNCTION public.enforce_diagnostico_immutability();

-- 3) Trigger for visitas_checkin: block edits on finalized visit
CREATE OR REPLACE FUNCTION public.enforce_checkin_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status status_registro_consultor;
  v_natureza natureza_registro_consultor;
  v_registro_id uuid;
  v_is_admin boolean;
BEGIN
  v_registro_id := COALESCE(NEW.registro_consultor_id, OLD.registro_consultor_id);
  IF v_registro_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT status, COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor)
    INTO v_status, v_natureza
    FROM public.registros_consultor
   WHERE id = v_registro_id;

  IF v_natureza <> 'visita'::natureza_registro_consultor THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'administrador'::app_role);

  -- Only block UPDATE/DELETE on finalized (INSERT is allowed for the
  -- finish RPC which fires within the same transaction before status flips)
  IF TG_OP IN ('UPDATE','DELETE')
     AND v_status = 'finalizado'::status_registro_consultor
     AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Check-ins da visita % são imutáveis (visita finalizada).', v_registro_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_checkin_immutability ON public.visitas_checkin;
CREATE TRIGGER trg_enforce_checkin_immutability
BEFORE UPDATE OR DELETE ON public.visitas_checkin
FOR EACH ROW
EXECUTE FUNCTION public.enforce_checkin_immutability();

COMMENT ON FUNCTION public.enforce_visit_immutability() IS
  'Fase 12.11: Torna visitas finalizadas imutáveis, exceto transição finalizado -> convertido_os e admin.';
COMMENT ON FUNCTION public.enforce_diagnostico_immutability() IS
  'Fase 12.11: Impede alterações em diagnósticos de visitas finalizadas.';
COMMENT ON FUNCTION public.enforce_checkin_immutability() IS
  'Fase 12.11: Impede alterações em check-ins de visitas finalizadas.';
