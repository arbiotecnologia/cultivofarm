create or replace function public._saas_user_has_feature(_uid uuid, _feature_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  with my_org as (
    select pr.organization_id from public.profiles pr
    join public.organizations o on o.id = pr.organization_id and o.ativo
    where pr.user_id = _uid and pr.ativo and pr.organization_id is not null
    order by pr.created_at limit 1
  ),
  my_sub as (
    select s.plan_id from public.organization_subscriptions s
    where s.organization_id = (select organization_id from my_org)
      and s.status in ('TRIAL','ACTIVE','PAST_DUE')
      and not (s.status = 'TRIAL' and s.trial_ends_at is not null and s.trial_ends_at <= now())
      and (s.cancel_at is null or s.cancel_at > now())
    order by s.started_at desc limit 1
  ),
  feat as (
    select f.id from public.saas_features f join public.saas_modules m on m.id = f.module_id and m.active
    where f.key = _feature_key and f.active
  ),
  ov as (
    select x.mode from public.organization_feature_overrides x
    where x.organization_id = (select organization_id from my_org) and x.feature_id = (select id from feat)
      and x.ended_at is null and x.starts_at <= now() and (x.ends_at is null or x.ends_at > now())
    limit 1
  )
  select exists (select 1 from my_sub) and exists (select 1 from feat) and case
    when (select mode from ov) = 'REVOKE' then false
    when (select mode from ov) = 'GRANT' then true
    else exists (select 1 from public.saas_plan_features pf, my_sub
                 where pf.plan_id = my_sub.plan_id and pf.enabled and pf.feature_id = (select id from feat))
  end;
$$;
revoke execute on function public._saas_user_has_feature(uuid, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_fiscal_can_operate(_uid uuid DEFAULT auth.uid())
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT _uid IS NOT NULL AND public.fn_authz_uid_scope_ok(_uid) AND (
    public.has_role(_uid,'administrador'::app_role)
    OR public.has_role(_uid,'gestor'::app_role)
    OR public.has_role(_uid,'financeiro'::app_role))
    AND public._saas_user_has_feature(_uid, 'emissao_nfe_nfse');
$function$;

CREATE OR REPLACE FUNCTION public._comunicacao_require_admin()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_role text;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims',true)::jsonb->>'role', session_user);
  IF v_role = 'service_role' OR current_user = 'service_role' THEN RETURN; END IF;
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'administrador') THEN
    RAISE EXCEPTION 'apenas administrador' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public._saas_user_has_feature(auth.uid(), 'envios_automaticos') THEN
    RAISE EXCEPTION 'saas_feature_nao_contratada: envios automáticos não incluídos no plano' USING ERRCODE='insufficient_privilege';
  END IF;
END$function$;