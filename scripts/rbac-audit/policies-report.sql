-- Auditoria RBAC — relatório SOMENTE LEITURA de políticas e grants.
-- Complementa `run-rbac-audit.ts`: mostra, no banco, quais políticas de
-- INSERT/SELECT existem nas tabelas de lançamento auditadas e se há grants
-- indevidos para `anon`.
--
-- Executar no SQL Editor do ambiente auditado (staging ikaauvsflpmamgxmkhoq).
-- Não altera nada.

\echo '== 1. Tabelas auditadas sem RLS habilitada =='
select c.relname as tabela
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
  and c.relname in (
    'clientes','fazendas','talhoes','ordens_servico','lotes','controle_qualidade',
    'envase','entregas','aplicacoes','portal_solicitacoes','accounts_receivable',
    'accounts_payable','partner_orders','partner_simulations','estoque_produto',
    'registros_consultor','fiscal_invoices','commercial_campaigns','partner_accounts',
    'alertas_operacionais'
  )
order by 1;

\echo '== 2. Políticas por tabela/comando =='
select tablename as tabela, cmd as comando, policyname as politica, roles::text as papeis_pg
from pg_policies
where schemaname = 'public'
  and tablename in (
    'clientes','fazendas','talhoes','ordens_servico','lotes','controle_qualidade',
    'envase','portal_solicitacoes','accounts_receivable','partner_orders'
  )
order by tabela, comando, politica;

\echo '== 3. Tabelas auditadas SEM política de INSERT (lançamento impossível) =='
select t.tabela
from (values
  ('clientes'),('fazendas'),('talhoes'),('ordens_servico'),('lotes'),
  ('controle_qualidade'),('envase'),('portal_solicitacoes'),
  ('accounts_receivable'),('partner_orders')
) as t(tabela)
where not exists (
  select 1 from pg_policies p
  where p.schemaname = 'public' and p.tablename = t.tabela
    and p.cmd in ('INSERT','ALL')
);

\echo '== 4. Grants para anon em tabelas sensíveis =='
select table_name as tabela, privilege_type as privilegio
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name in (
    'clientes','fazendas','talhoes','ordens_servico','lotes','controle_qualidade',
    'envase','portal_solicitacoes','accounts_receivable','accounts_payable',
    'partner_orders','partner_accounts','fiscal_invoices','user_roles'
  )
order by 1, 2;

\echo '== 5. Papéis provisionados vs usuários de teste =='
select r.role::text as papel, count(distinct r.user_id) as usuarios
from public.user_roles r
group by 1
order by 1;
