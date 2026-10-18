-- ROLLBACK da ENTREGA OPERACIONAL 1 (somente se a candidata foi instalada).
-- Restaura o corpo baseline exato (md5 c610786fc9f6d6a44453b9e63c91e974), verificado
-- por pós-condição. Nunca DROP; CREATE OR REPLACE preserva owner/ACL/dependências.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $rollback$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.can_user_access_cliente(uuid,uuid)'::regprocedure)
    INTO v_definition;
  -- Só reverte se o corpo instalado contém as marcas da candidata (não reverte drift desconhecido).
  IF position('pu.revoked_at IS NULL' IN v_definition) = 0
     OR position('pu2.revoked_at IS NULL' IN v_definition) = 0
     OR position('pu3.revoked_at IS NULL' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'entrega1_rollback_refuse_unknown_body';
  END IF;
END
$rollback$;

CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_user_id uuid, _cliente_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _cliente_id IS NULL THEN
    RETURN false;
  END IF;

  IF COALESCE(public.has_role(_user_id,'administrador'::app_role), false)
     OR COALESCE(public.has_role(_user_id,'gestor_comercial'::app_role), false)
     OR COALESCE(public.has_role(_user_id,'gestor'::app_role), false)
  THEN
    RETURN true;
  END IF;

  -- HARDENING: papéis técnicos exigem carteira ativa e vigente.
  IF COALESCE(public.has_role(_user_id,'tecnico_agronomo'::app_role), false)
     OR COALESCE(public.has_role(_user_id,'consultor_tecnico'::app_role), false)
  THEN
    RETURN COALESCE(
      public.has_active_user_cliente_access(
        _user_id, _cliente_id, ARRAY['read','execute','manage']
      ), false);
  END IF;

  IF COALESCE(public.has_role(_user_id,'parceiro_b2b'::app_role), false) THEN
    RETURN COALESCE((EXISTS (
      SELECT 1 FROM public.partner_clients pc
      JOIN public.partner_users pu ON pu.partner_id = pc.partner_id
      WHERE pu.user_id = _user_id AND pc.cliente_id = _cliente_id AND pc.active = true
    )), false);
  END IF;

  IF COALESCE(public.has_role(_user_id,'parceiro_b2b_tecnico'::app_role), false) THEN
    RETURN COALESCE((EXISTS (
      SELECT 1 FROM public.partner_user_clients puc
      WHERE puc.user_id = _user_id AND puc.cliente_id = _cliente_id AND puc.active = true
    ) OR EXISTS (
      SELECT 1 FROM public.partner_technician_clients ptc
      WHERE ptc.technician_user_id = _user_id AND ptc.cliente_id = _cliente_id AND ptc.active = true
    )), false);
  END IF;

  RETURN COALESCE((EXISTS (
    SELECT 1 FROM public.user_clientes uc
    WHERE uc.user_id = _user_id
      AND uc.cliente_id = _cliente_id
      AND uc.is_active = true
      AND uc.revoked_at IS NULL
      AND (uc.valid_from IS NULL OR uc.valid_from <= now())
      AND (uc.valid_until IS NULL OR uc.valid_until >= now())
  )), false);
END;
$function$;

DO $post$
BEGIN
  IF md5(pg_get_functiondef('public.can_user_access_cliente(uuid,uuid)'::regprocedure))
     IS DISTINCT FROM 'c610786fc9f6d6a44453b9e63c91e974' THEN
    RAISE EXCEPTION 'entrega1_rollback_postcondition_failed';
  END IF;
END
$post$;

COMMIT;
