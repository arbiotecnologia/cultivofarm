create table if not exists public.organization_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  feature_id uuid not null references public.saas_features(id) on delete restrict,
  mode text not null check (mode in ('GRANT','REVOKE')),
  limit_value numeric null check (limit_value is null or limit_value >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz null,
  reason text not null check (length(btrim(reason)) >= 5),
  created_by uuid null,
  ended_at timestamptz null,
  ended_by uuid null,
  end_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ofo_period_chk check (ends_at is null or ends_at > starts_at)
);
create index if not exists ofo_org_idx on public.organization_feature_overrides(organization_id);
create index if not exists ofo_feature_idx on public.organization_feature_overrides(feature_id);
create unique index if not exists ofo_one_open_per_feature
  on public.organization_feature_overrides(organization_id, feature_id) where ended_at is null;

grant select on public.organization_feature_overrides to authenticated;
grant all on public.organization_feature_overrides to service_role;
alter table public.organization_feature_overrides enable row level security;
drop policy if exists "Superadmin le exceções" on public.organization_feature_overrides;
create policy "Superadmin le exceções" on public.organization_feature_overrides
  for select to authenticated using (public.is_platform_superadmin(auth.uid()));

-- Imutabilidade: sem delete; update só para encerrar (uma vez)
create or replace function public.ofo_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'override_imutavel: exceções não podem ser apagadas';
  end if;
  if old.ended_at is not null then
    raise exception 'override_imutavel: exceção já encerrada';
  end if;
  if new.organization_id <> old.organization_id or new.feature_id <> old.feature_id
     or new.mode <> old.mode or new.limit_value is distinct from old.limit_value
     or new.starts_at <> old.starts_at or new.ends_at is distinct from old.ends_at
     or new.reason <> old.reason or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at or new.ended_at is null then
    raise exception 'override_imutavel: somente encerramento é permitido';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ofo_guard_trg on public.organization_feature_overrides;
create trigger ofo_guard_trg before update or delete on public.organization_feature_overrides
  for each row execute function public.ofo_guard();

-- RPCs de plataforma
create or replace function public.platform_set_feature_override(
  _organization_id uuid, _feature_key text, _mode text, _reason text,
  _ends_at timestamptz default null, _limit_value numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_feature uuid; v_id uuid;
begin
  if auth.uid() is null or not public.is_platform_superadmin(auth.uid()) then
    raise exception 'platform_forbidden: apenas superadmin' using errcode = '42501';
  end if;
  if _mode not in ('GRANT','REVOKE') then raise exception 'platform_invalid: modo inválido'; end if;
  if _reason is null or length(btrim(_reason)) < 5 then raise exception 'platform_invalid: motivo obrigatório'; end if;
  if not exists (select 1 from public.organizations o where o.id = _organization_id) then
    raise exception 'platform_invalid: empresa inexistente'; end if;
  select f.id into v_feature from public.saas_features f where f.key = _feature_key;
  if v_feature is null then raise exception 'platform_invalid: funcionalidade inexistente'; end if;
  if _ends_at is not null and _ends_at <= now() then raise exception 'platform_invalid: prazo no passado'; end if;
  if exists (select 1 from public.organization_feature_overrides x
             where x.organization_id = _organization_id and x.feature_id = v_feature and x.ended_at is null) then
    raise exception 'platform_conflict: já existe exceção aberta para esta funcionalidade';
  end if;
  insert into public.organization_feature_overrides(organization_id, feature_id, mode, limit_value, ends_at, reason, created_by)
  values (_organization_id, v_feature, _mode, _limit_value, _ends_at, btrim(_reason), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.platform_end_feature_override(_override_id uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_platform_superadmin(auth.uid()) then
    raise exception 'platform_forbidden: apenas superadmin' using errcode = '42501';
  end if;
  if _reason is null or length(btrim(_reason)) < 5 then raise exception 'platform_invalid: motivo obrigatório'; end if;
  update public.organization_feature_overrides
     set ended_at = now(), ended_by = auth.uid(), end_reason = btrim(_reason)
   where id = _override_id and ended_at is null;
  if not found then raise exception 'platform_invalid: exceção inexistente ou já encerrada'; end if;
end $$;

create or replace function public.platform_change_subscription(
  _organization_id uuid, _plan_key text, _status text, _reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_plan uuid; v_id uuid;
begin
  if auth.uid() is null or not public.is_platform_superadmin(auth.uid()) then
    raise exception 'platform_forbidden: apenas superadmin' using errcode = '42501';
  end if;
  if _reason is null or length(btrim(_reason)) < 5 then raise exception 'platform_invalid: motivo obrigatório'; end if;
  if _status not in ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED') then
    raise exception 'platform_invalid: situação inválida'; end if;
  select p.id into v_plan from public.saas_plans p where p.key = _plan_key and p.active;
  if v_plan is null then raise exception 'platform_invalid: plano inexistente ou inativo'; end if;
  perform set_config('app.saas_change_reason', btrim(_reason), true);
  select s.id into v_id from public.organization_subscriptions s
   where s.organization_id = _organization_id and s.status in ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')
   order by s.started_at desc limit 1 for update;
  if v_id is null then
    if not exists (select 1 from public.organizations o where o.id = _organization_id) then
      raise exception 'platform_invalid: empresa inexistente'; end if;
    insert into public.organization_subscriptions(organization_id, plan_id, status, started_at, created_by)
    values (_organization_id, v_plan, _status, now(), auth.uid()) returning id into v_id;
  else
    update public.organization_subscriptions
       set plan_id = v_plan, status = _status,
           suspended_at = case when _status = 'SUSPENDED' then now() else suspended_at end,
           cancelled_at = case when _status = 'CANCELLED' then now() else cancelled_at end
     where id = v_id;
  end if;
  return v_id;
end $$;

-- Verificação de acesso: empresa ativa + exceções vigentes
create or replace function public.get_my_entitlements()
returns table (module_key text, feature_key text, limit_value numeric, config jsonb)
language sql stable security definer set search_path = '' as $$
  with my_org as (
    select pr.organization_id
    from public.profiles pr
    join public.organizations o on o.id = pr.organization_id and o.ativo
    where pr.user_id = auth.uid() and pr.ativo and pr.organization_id is not null
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
  ov as (
    select x.feature_id, x.mode, x.limit_value from public.organization_feature_overrides x
    where x.organization_id = (select organization_id from my_org)
      and x.ended_at is null and x.starts_at <= now() and (x.ends_at is null or x.ends_at > now())
  ),
  base as (
    select pf.feature_id, pf.limit_value, pf.config from my_sub
    join public.saas_plan_features pf on pf.plan_id = my_sub.plan_id and pf.enabled
  ),
  eff as (
    select b.feature_id, coalesce(o.limit_value, b.limit_value) as limit_value, b.config
      from base b left join ov o on o.feature_id = b.feature_id
     where coalesce(o.mode, 'GRANT') <> 'REVOKE'
    union all
    select o.feature_id, o.limit_value, null::jsonb from ov o
     where o.mode = 'GRANT' and exists (select 1 from my_sub)
       and not exists (select 1 from base b where b.feature_id = o.feature_id)
  )
  select m.key, f.key, eff.limit_value, eff.config
  from eff
  join public.saas_features f on f.id = eff.feature_id and f.active
  join public.saas_modules m on m.id = f.module_id and m.active;
$$;

revoke execute on function public.platform_set_feature_override(uuid,text,text,text,timestamptz,numeric) from public, anon;
revoke execute on function public.platform_end_feature_override(uuid,text) from public, anon;
revoke execute on function public.platform_change_subscription(uuid,text,text,text) from public, anon;
revoke execute on function public.ofo_guard() from public, anon, authenticated;
grant execute on function public.platform_set_feature_override(uuid,text,text,text,timestamptz,numeric) to authenticated;
grant execute on function public.platform_end_feature_override(uuid,text) to authenticated;
grant execute on function public.platform_change_subscription(uuid,text,text,text) to authenticated;
revoke execute on function public.get_my_entitlements() from public, anon;
grant execute on function public.get_my_entitlements() to authenticated;