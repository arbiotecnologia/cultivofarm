-- H7O — Inventário SOMENTE LEITURA das funções SECURITY DEFINER em public executáveis por authenticated.
-- Saída: TSV (uma linha por assinatura) com evidências de catálogo:
--   consumidores via pg_depend (policies/views/triggers/constraints/defaults/índices/event triggers),
--   callers por corpo (outras funções que referenciam o nome), separados por tipo de segurança,
--   jobs pg_cron que referenciam o nome, mecanismos de autorização presentes no corpo (linhas reais),
--   volatilidade, DML no corpo, search_path fixo, ACL anon/authenticated/public.
-- Executar via restoration/os-e2e/staging-psql.sh -tAF $'\t' -f <este arquivo>
with target as (
  select p.oid, p.proname,
         p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as sig,
         p.prosrc, p.provolatile, p.proconfig, p.prorettype, p.prokind,
         pg_get_userbyid(p.proowner) as owner
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join pg_depend e on e.objid = p.oid and e.deptype = 'e'
  where n.nspname = 'public' and e.objid is null
    and p.prosecdef
    and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
),
dep as (
  select t.oid as fn_oid,
         string_agg(distinct
           case d.classid
             when 'pg_rewrite'::regclass then 'view:' || (select c.relnamespace::regnamespace||'.'||c.relname from pg_rewrite r join pg_class c on c.oid = r.ev_class where r.oid = d.objid)
             when 'pg_policy'::regclass  then 'policy:' || (select c.relnamespace::regnamespace||'.'||c.relname||'/'||pol.polname from pg_policy pol join pg_class c on c.oid = pol.polrelid where pol.oid = d.objid)
             when 'pg_trigger'::regclass then 'trigger:' || (select c.relnamespace::regnamespace||'.'||c.relname||'/'||tg.tgname from pg_trigger tg join pg_class c on c.oid = tg.tgrelid where tg.oid = d.objid)
             when 'pg_constraint'::regclass then 'constraint:' || (select c.relnamespace::regnamespace||'.'||c.relname||'/'||co.conname from pg_constraint co join pg_class c on c.oid = co.conrelid where co.oid = d.objid)
             when 'pg_attrdef'::regclass then 'default:' || (select c.relnamespace::regnamespace||'.'||c.relname||'.'||a.attname from pg_attrdef ad join pg_class c on c.oid = ad.adrelid join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum where ad.oid = d.objid)
             when 'pg_class'::regclass then 'index:' || (select c.relnamespace::regnamespace||'.'||c.relname from pg_class c where c.oid = d.objid)
             when 'pg_event_trigger'::regclass then 'event_trigger:' || (select evtname from pg_event_trigger where oid = d.objid)
             when 'pg_proc'::regclass then 'proc:' || (select proname from pg_proc where oid = d.objid)
             else d.classid::regclass::text
           end, ' ; ') as dep_consumers
  from target t
  join pg_depend d on d.refclassid = 'pg_proc'::regclass and d.refobjid = t.oid and d.deptype in ('n','a')
  group by t.oid
),
callers as (
  select t.oid as fn_oid,
         string_agg(distinct case when f.prosecdef then f.proname end, ',') filter (where f.prosecdef and f.prorettype <> 'trigger'::regtype) as callers_definer,
         string_agg(distinct case when not f.prosecdef and f.prorettype <> 'trigger'::regtype then fn.nspname||'.'||f.proname end, ',') as callers_invoker,
         string_agg(distinct case when f.prorettype = 'trigger'::regtype then f.proname||(case when f.prosecdef then '[DEF]' else '[INV]' end) end, ',') as callers_trigger,
         string_agg(distinct case when f.prorettype = 'trigger'::regtype and not f.prosecdef and (has_function_privilege('authenticated', f.oid, 'EXECUTE')) then f.proname end, ',') as callers_trigger_invoker,
         count(distinct f.oid) as n_callers
  from target t
  join pg_proc f on f.oid <> t.oid and f.prosrc ~ ('\m' || t.proname || '\s*\(')
  join pg_namespace fn on fn.oid = f.pronamespace
  where fn.nspname not in ('pg_catalog','information_schema')
  group by t.oid
),
cronref as (
  select t.oid as fn_oid, string_agg(distinct j.jobname, ',') as cron_jobs
  from target t join cron.job j on j.command ~ ('\m' || t.proname || '\s*\(')
  group by t.oid
),
guards as (
  select t.oid as fn_oid,
         string_agg(distinct left(btrim(l), 140), ' || ') as guard_lines,
         count(*) as n_guard_lines
  from target t, unnest(string_to_array(t.prosrc, E'\n')) l
  where l ~* 'has_role\(|auth\.uid\(\)|auth\.jwt\(\)|get_user_partner_id|is_executivo|get_cliente_ids?_for_user|permission_denied|42501|_require_admin|_assert_|is_active_visit_participant|is_visit_responsible|pg_trigger_depth|request\.jwt|_portal_cliente_user_has_link|fn_onfarm_scope|get_partner_papel|fn_b2b_assert|fn_h6_assert|fn_fin_assert|fn_fiscal_assert|_comunicacao_require|rls_deny|can_checkout|insufficient_privilege|acesso negado|not authorized|nao autorizado|não autorizado'
    and l !~* '^\s*--'
  group by t.oid
)
select
  t.sig,
  case when t.prorettype = 'trigger'::regtype then 'trigger' else t.prokind::text end as kind,
  t.owner,
  case when has_function_privilege('anon', t.oid, 'EXECUTE') then 'anon' else '-' end as acl_anon,
  case when has_function_privilege('authenticated', t.oid, 'EXECUTE') then 'authenticated' else '-' end as acl_auth,
  case when has_function_privilege('public', t.oid, 'EXECUTE') then 'PUBLIC' else '-' end as acl_public,
  coalesce(array_to_string(t.proconfig, ','), '') as proconfig,
  t.provolatile,
  case when t.prosrc ~* '\m(insert|update|delete|truncate|refresh materialized)\M' then 'DML' else 'read' end as dml,
  coalesce(d.dep_consumers, '') as dep_consumers,
  coalesce(c.callers_definer, '') as callers_definer,
  coalesce(c.callers_invoker, '') as callers_invoker,
  coalesce(c.callers_trigger, '') as callers_trigger,
  coalesce(c.callers_trigger_invoker, '') as callers_trigger_invoker_exposed,
  coalesce(c.n_callers, 0) as n_callers,
  coalesce(cr.cron_jobs, '') as cron_jobs,
  coalesce(g.n_guard_lines, 0) as n_guard_lines,
  coalesce(replace(replace(replace(g.guard_lines, E'\t', ' '), E'\n', ' '), E'\r', ' '), '') as guard_lines,
  md5(t.prosrc) as body_md5
from target t
left join dep d on d.fn_oid = t.oid
left join callers c on c.fn_oid = t.oid
left join cronref cr on cr.fn_oid = t.oid
left join guards g on g.fn_oid = t.oid
order by t.sig;
