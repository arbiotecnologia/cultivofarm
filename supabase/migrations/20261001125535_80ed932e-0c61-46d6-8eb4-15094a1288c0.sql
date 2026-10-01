CREATE OR REPLACE FUNCTION platform_private.conclude_provisional_password_server(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_jwt_role text;
BEGIN
  v_jwt_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'role'),
    '');
  IF v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'platform_forbidden: uso restrito ao backend da plataforma' USING ERRCODE='42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: usuário ausente' USING ERRCODE='22023';
  END IF;

  UPDATE public.profiles
     SET senha_provisoria = false, updated_at = now()
   WHERE user_id = p_user_id AND senha_provisoria IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_primeiro_acesso_nao_pendente' USING ERRCODE='22023';
  END IF;

  UPDATE public.platform_org_admin_invites
     SET status = 'ativo', concluido_em = now()
   WHERE user_id = p_user_id AND status = 'pendente';

  DELETE FROM platform_private.provisional_password_state WHERE user_id = p_user_id;

  RETURN true;
END $function$;

REVOKE ALL ON FUNCTION platform_private.conclude_provisional_password_server(uuid) FROM PUBLIC, anon, authenticated;