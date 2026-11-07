CREATE OR REPLACE FUNCTION public._saas_trg_require_feature()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := TG_ARGV[0];
BEGIN
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id AND o.ativo IS TRUE
    WHERE p.user_id = v_uid AND p.ativo IS TRUE AND p.organization_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'saas_context_unavailable: usuário ativo e empresa são obrigatórios'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public._saas_user_has_feature(v_uid, v_key) THEN
    RAISE EXCEPTION 'saas_feature_not_entitled: funcionalidade não contratada ou assinatura indisponível'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$

