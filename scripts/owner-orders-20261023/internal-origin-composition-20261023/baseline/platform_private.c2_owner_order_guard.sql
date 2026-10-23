CREATE OR REPLACE FUNCTION platform_private.c2_owner_order_guard(_uid uuid, _partner uuid, _plan uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Internos e superadmin seguem as regras existentes da função chamadora.
  IF public.is_platform_superadmin(_uid)
     OR public.has_role(_uid,'administrador'::public.app_role) OR public.has_role(_uid,'financeiro'::public.app_role)
     OR public.has_role(_uid,'gestor_comercial'::public.app_role) THEN
    RETURN;
  END IF;
  -- Parceiro com organização própria (fornecedor legado): comportamento inalterado.
  IF EXISTS (SELECT 1 FROM public.organizations o WHERE o.partner_account_id = _partner) THEN RETURN; END IF;
  IF NOT platform_private.c2_owner_order_create_allowed(_uid,_partner) THEN
    RAISE EXCEPTION 'C2_OWNER_ORDER_CLOSED' USING ERRCODE='42501';
  END IF;
  IF _plan IS NULL OR NOT platform_private.c2_owner_plan_assigned(_partner,_plan) THEN
    RAISE EXCEPTION 'plan_not_assigned' USING ERRCODE='42501';
  END IF;
END $function$
