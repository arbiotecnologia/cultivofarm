-- ===== S2: entitlement engine (somente leitura, fail-closed) =====
create or replace function public.get_my_entitlements()
returns table (module_key text, feature_key text, limit_value numeric, config jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with my_org as (
    select pr.organization_id
    from public.profiles pr
    where pr.user_id = auth.uid()
      and pr.ativo
      and pr.organization_id is not null
    order by pr.created_at
    limit 1
  ),
  my_sub as (
    select s.plan_id
    from public.organization_subscriptions s
    where s.organization_id = (select organization_id from my_org)
      and s.status in ('TRIAL','ACTIVE','PAST_DUE')
      and not (s.status = 'TRIAL' and s.trial_ends_at is not null and s.trial_ends_at <= now())
      and (s.cancel_at is null or s.cancel_at > now())
    order by s.started_at desc
    limit 1
  )
  select m.key, f.key, pf.limit_value, pf.config
  from my_sub
  join public.saas_plan_features pf on pf.plan_id = my_sub.plan_id and pf.enabled
  join public.saas_features f on f.id = pf.feature_id and f.active
  join public.saas_modules m on m.id = f.module_id and m.active;
$$;

create or replace function public.saas_has_feature(_feature_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.get_my_entitlements() e
    where e.feature_key = _feature_key
  )
$$;

revoke execute on function public.get_my_entitlements() from public, anon;
revoke execute on function public.saas_has_feature(text) from public, anon;
grant execute on function public.get_my_entitlements() to authenticated;
grant execute on function public.saas_has_feature(text) to authenticated;