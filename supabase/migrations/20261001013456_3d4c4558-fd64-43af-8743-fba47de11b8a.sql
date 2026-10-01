alter function public.platform_set_feature_override(uuid,text,text,text,timestamptz,numeric) security invoker;
alter function public.platform_end_feature_override(uuid,text) security invoker;
alter function public.platform_change_subscription(uuid,text,text,text) security invoker;

grant insert, update on public.organization_feature_overrides to authenticated;
drop policy if exists "Superadmin cria exceções" on public.organization_feature_overrides;
create policy "Superadmin cria exceções" on public.organization_feature_overrides
  for insert to authenticated with check (public.is_platform_superadmin(auth.uid()));
drop policy if exists "Superadmin encerra exceções" on public.organization_feature_overrides;
create policy "Superadmin encerra exceções" on public.organization_feature_overrides
  for update to authenticated using (public.is_platform_superadmin(auth.uid()))
  with check (public.is_platform_superadmin(auth.uid()));

grant insert, update on public.organization_subscriptions to authenticated;
drop policy if exists "Superadmin cria assinatura" on public.organization_subscriptions;
create policy "Superadmin cria assinatura" on public.organization_subscriptions
  for insert to authenticated with check (public.is_platform_superadmin(auth.uid()));
drop policy if exists "Superadmin altera assinatura" on public.organization_subscriptions;
create policy "Superadmin altera assinatura" on public.organization_subscriptions
  for update to authenticated using (public.is_platform_superadmin(auth.uid()))
  with check (public.is_platform_superadmin(auth.uid()));

create or replace function public.ofo_stamp_author()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := auth.uid();
  new.ended_at := null; new.ended_by := null; new.end_reason := null;
  new.created_at := now(); new.updated_at := now();
  return new;
end $$;
drop trigger if exists ofo_stamp_author_trg on public.organization_feature_overrides;
create trigger ofo_stamp_author_trg before insert on public.organization_feature_overrides
  for each row execute function public.ofo_stamp_author();

create or replace function public.ofo_stamp_end()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.ended_at is not null and old.ended_at is null then new.ended_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists ofo_stamp_end_trg on public.organization_feature_overrides;
create trigger ofo_stamp_end_trg before update on public.organization_feature_overrides
  for each row execute function public.ofo_stamp_end();
revoke execute on function public.ofo_stamp_author() from public, anon, authenticated;
revoke execute on function public.ofo_stamp_end() from public, anon, authenticated;