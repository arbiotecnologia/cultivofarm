-- =============================================================================
-- Subfase 1C — Harness estrutural
-- Ambiente: staging ikaauvsflpmamgxmkhoq. READ-ONLY (sem side-effects).
-- Executado como um único SELECT retornando 15 booleans (todos true = PASS).
-- =============================================================================
-- Como executar (via ferramenta supabase--read_query ou psql):
--   SELECT ... (bloco abaixo)
-- Resultado esperado: {h1..h15} = true.
--
-- Motivo do harness ser puramente estrutural nesta 1C:
--   `portal_solicitacoes.cliente_id` e `user_id` têm FKs obrigatórias a
--   `public.clientes` e `auth.users`. Criar fixtures reais para testes
--   funcionais fim-a-fim (destinatários resolvidos) exigiria fabricar linhas
--   em `auth.users`, o que só é seguro via API do GoTrue e está fora do escopo
--   desta subfase (não podemos tocar em `auth.*`). Os testes funcionais das
--   estratégias `source_cliente`, `assigned_consultant` e do isolamento
--   cross-tenant serão executados na 1D (assinatura do módulo já instalada),
--   junto com o primeiro seed de fixtures autorizado. A migration 1C garante
--   estrutura + comportamento das funções via lógica isolada (fail-closed
--   por default nos IFs), e o harness abaixo verifica todas as invariantes
--   observáveis sem side-effects.
-- =============================================================================

WITH
t_inapp AS (
  SELECT count(*) AS n FROM public.comunicacao_templates
  WHERE chave LIKE 'solic\_%' ESCAPE '\'
    AND canal='in_app' AND status='active' AND versao=1
),
t_email AS (
  SELECT count(*) AS n FROM public.comunicacao_templates
  WHERE chave LIKE 'solic\_%' ESCAPE '\' AND canal='email' AND status='draft'
),
t_wa AS (
  SELECT count(*) AS n FROM public.comunicacao_templates
  WHERE chave LIKE 'solic\_%' ESCAPE '\' AND canal='whatsapp' AND status='draft'
),
t_vars_ok AS (
  SELECT count(*) AS n FROM public.comunicacao_templates
  WHERE chave LIKE 'solic\_%' ESCAPE '\'
    AND variaveis @> '["numero","solicitacao_id"]'::jsonb
),
r_total AS (
  SELECT count(*) FILTER (WHERE enabled=false) AS n_off, count(*) AS n_tot
  FROM public.comunicacao_regras WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\'
),
r_dist AS (
  SELECT
    count(*) FILTER (WHERE estrategia='source_cliente') AS sc,
    count(*) FILTER (WHERE estrategia='assigned_consultant') AS ac,
    count(*) FILTER (WHERE estrategia='by_role' AND perfil='administrador'::public.app_role) AS admin,
    count(*) FILTER (WHERE estrategia='by_role' AND perfil<>'administrador'::public.app_role) AS by_role_outros
  FROM public.comunicacao_regras WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\'
),
r_orphan AS (
  SELECT count(*) AS n FROM public.comunicacao_regras r
  WHERE r.event_key LIKE 'solicitacao\_%' ESCAPE '\'
    AND NOT EXISTS (
      SELECT 1 FROM public.comunicacao_templates t
       WHERE t.chave=r.template_chave AND t.canal=r.canal
    )
),
c_chk AS (
  SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
  WHERE conname='comunicacao_regras_estrategia_chk'
),
g_resolver AS (
  SELECT
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
    has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_,
    has_function_privilege('public',        p.oid, 'EXECUTE') AS pub
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='_comunicacao_resolve_recipients_v2'
),
g_snapshot AS (
  SELECT
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
    has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_,
    has_function_privilege('public',        p.oid, 'EXECUTE') AS pub
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='_comunicacao_build_snapshot_v2'
),
idx_check AS (
  SELECT count(*) AS n FROM pg_indexes
  WHERE schemaname='public' AND tablename='comunicacao_regras'
    AND indexname IN (
      'ux_comunicacao_regras_evt_canal_estr_tpl_np',
      'ux_comunicacao_regras_evt_canal_estr_perfil_tpl_wp'
    )
),
t_total AS (
  SELECT count(*) AS n FROM public.comunicacao_templates
  WHERE chave LIKE 'solic\_%' ESCAPE '\'
),
outbox_check AS (
  SELECT count(*) AS n FROM public.comunicacao_outbox o
  JOIN public.comunicacao_regras r ON r.id=o.rule_id
  WHERE r.event_key LIKE 'solicitacao\_%' ESCAPE '\'
),
uc_isolation AS (
  SELECT count(*) AS n FROM public.comunicacao_regras
  WHERE event_key='solicitacao_urgencia_critica'
    AND estrategia='by_role'
    AND perfil<>'administrador'::public.app_role
),
t_active_pairs AS (
  SELECT count(DISTINCT (chave,canal)) AS n FROM public.comunicacao_templates
  WHERE chave LIKE 'solic\_%' ESCAPE '\' AND status='active'
),
t_pii AS (
  SELECT count(*) AS n FROM public.comunicacao_templates
  WHERE chave LIKE 'solic\_%' ESCAPE '\'
    AND (
      corpo ~ 'descricao|telefone|audio|foto|external_event_id|solicitante_contato'
      OR COALESCE(assunto,'') ~ 'descricao|telefone|audio|foto|external_event_id|solicitante_contato'
    )
)
SELECT
  (SELECT n FROM t_inapp)=11                                                 AS h1_inapp_active,
  (SELECT n FROM t_email)=11                                                 AS h2_email_draft,
  (SELECT n FROM t_wa)=4                                                     AS h3_whatsapp_draft,
  (SELECT n FROM t_vars_ok)=26                                               AS h4_variaveis_allowlist,
  (SELECT n_off FROM r_total)=11 AND (SELECT n_tot FROM r_total)=11          AS h5_regras_all_disabled,
  (SELECT sc FROM r_dist)=7
    AND (SELECT ac FROM r_dist)=2
    AND (SELECT admin FROM r_dist)=2
    AND (SELECT by_role_outros FROM r_dist)=0                                AS h6_distribuicao,
  (SELECT n FROM r_orphan)=0                                                 AS h7_sem_orfa,
  (SELECT def FROM c_chk) LIKE '%source_cliente%'
    AND (SELECT def FROM c_chk) LIKE '%assigned_consultant%'                 AS h8_check_estendido,
  (SELECT authed FROM g_resolver)=false
    AND (SELECT anon_ FROM g_resolver)=false
    AND (SELECT pub FROM g_resolver)=false                                   AS h9a_resolver_revoked,
  (SELECT authed FROM g_snapshot)=false
    AND (SELECT anon_ FROM g_snapshot)=false
    AND (SELECT pub FROM g_snapshot)=false                                   AS h9b_snapshot_revoked,
  (SELECT n FROM idx_check)=2                                                AS h10_indices_idempotencia,
  (SELECT n FROM t_total)=26                                                 AS h11_templates_totais,
  (SELECT n FROM outbox_check)=0                                             AS h12_outbox_zero,
  (SELECT n FROM uc_isolation)=0                                             AS h13_uc_apenas_admin,
  (SELECT n FROM t_active_pairs)=11                                          AS h14_ativos_por_par,
  (SELECT n FROM t_pii)=0                                                    AS h15_sem_pii;
