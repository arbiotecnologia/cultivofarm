-- FASE H8-D — Healthcheck de OBSERVABILIDADE da HOMOLOGAÇÃO (staging ikaauvsflpmamgxmkhoq).
--
-- Contrato:
--   * ESTRITAMENTE read-only: executado dentro de "BEGIN READ ONLY" pelo h8d-healthcheck.sh.
--     Não contém DDL, DML, nem chamada a função que escreva dados de negócio.
--   * Nunca seleciona conteúdo de payload, token, DSN, chave, senha, certificado,
--     CPF/CNPJ, e-mail, telefone ou XML fiscal. Somente contagens, idades e flags booleanas.
--   * Nunca usa SELECT *; todas as leituras são agregadas ou com LIMIT explícito.
--   * Cada linha devolve: categoria, sinal, status (OK|WARN|CRITICAL|UNKNOWN), medida,
--     limiar aplicado e orientação de resposta.
--
-- Status UNKNOWN é usado quando não há volume/baseline suficiente para decidir —
-- nunca é convertido em OK silencioso.

WITH
-- ─────────────────────────────── IDENTIDADE ───────────────────────────────
ledger AS (
  SELECT count(*)::bigint AS n FROM supabase_migrations.schema_migrations
),
sig_ledger AS (
  SELECT 'identidade' AS categoria, 'ledger_migrations' AS sinal,
         CASE WHEN n = 658 THEN 'OK' ELSE 'CRITICAL' END AS status,
         n::text AS medida, '= 658 (congelado em H8-C)' AS limiar,
         'Drift de ledger: comparar com h7p-repo-only-manifest.json e o runbook 04-h8d, seção 7.2. Não aplicar nada antes de identificar a origem.' AS resposta
  FROM ledger
),
repo_only AS (
  SELECT count(*)::bigint AS n
  FROM supabase_migrations.schema_migrations m
  WHERE m.version IN (
    SELECT version FROM (VALUES ('20260825000000'),('20260916000000'),('20260917000000'),('20260927000000')) AS t(version)
  )
),
sig_repo_only AS (
  SELECT 'identidade', 'repo_only_destrutivas_aplicadas',
         CASE WHEN n = 0 THEN 'OK' ELSE 'CRITICAL' END,
         n::text, '= 0 (as 4 destrutivas são permanentemente bloqueadas)',
         'Migration bloqueada aplicada indevidamente: acionar procedimento 7.3 do runbook. Não reverter por conta própria.'
  FROM repo_only
),
-- ─────────────────────────────── CRON ───────────────────────────────
cron_tot AS (
  SELECT count(*)::bigint AS total, count(*) FILTER (WHERE active)::bigint AS ativos FROM cron.job
),
sig_cron_inv AS (
  SELECT 'cron', 'jobs_ativos',
         CASE WHEN total = 6 AND ativos = 6 THEN 'OK'
              WHEN ativos < total THEN 'CRITICAL' ELSE 'WARN' END,
         ativos || '/' || total, '6 de 6 ativos (inventário H8-D)',
         'Job inativo ou novo job não inventariado: seção 7.4 do runbook (cron parado).'
  FROM cron_tot
),
cron_runs AS (
  SELECT j.jobname,
         max(d.end_time) AS ultima,
         (array_agg(d.status ORDER BY d.end_time DESC NULLS LAST))[1] AS ultimo_status,
         count(*) FILTER (WHERE d.status <> 'succeeded' AND d.start_time > now() - interval '24 hours')::bigint AS falhas_24h
  FROM cron.job j LEFT JOIN cron.job_run_details d ON d.jobid = j.jobid
  GROUP BY j.jobname
),
sig_cron_fail AS (
  SELECT 'cron', 'falhas_24h',
         CASE WHEN sum(falhas_24h) = 0 THEN 'OK'
              WHEN sum(falhas_24h) <= 2 THEN 'WARN' ELSE 'CRITICAL' END,
         sum(falhas_24h)::text, '0 falhas em 24h; 1–2 = WARN; >2 = CRITICAL',
         'Ler cron.job_run_details do job afetado (sem copiar payload) e seguir 7.4 do runbook.'
  FROM cron_runs
),
sig_cron_stale AS (
  SELECT 'cron', 'execucao_mais_antiga',
         CASE WHEN count(*) FILTER (WHERE ultima IS NULL) = (SELECT total FROM cron_tot) THEN 'UNKNOWN'
              WHEN max(EXTRACT(epoch FROM now() - ultima)/3600) IS NULL THEN 'UNKNOWN'
              WHEN max(EXTRACT(epoch FROM now() - ultima)/3600) > 26 THEN 'WARN' ELSE 'OK' END,
         coalesce(round(max(EXTRACT(epoch FROM now() - ultima)/3600))::text || 'h', 'sem histórico'),
         '<= 26h desde a última execução bem-sucedida de qualquer job (o mais lento roda 1x/dia)',
         'Sem histórico = UNKNOWN: cron.job_run_details é podado; coletar baseline por 48h antes de escalar.'
  FROM cron_runs
),
-- ─────────────────────── OUTBOX / COMUNICAÇÃO ───────────────────────
ob AS (
  SELECT
    count(*) FILTER (WHERE status = 'pending')::bigint      AS pendentes,
    count(*) FILTER (WHERE status = 'processing')::bigint   AS processando,
    count(*) FILTER (WHERE status = 'failed')::bigint       AS falhos,
    count(*) FILTER (WHERE status = 'dead_letter')::bigint  AS mortos,
    count(*) FILTER (WHERE status = 'pending' AND attempts >= 3)::bigint AS retry_alto,
    count(*) FILTER (WHERE status = 'processing'
                       AND lease_expires_at IS NOT NULL
                       AND lease_expires_at < now())::bigint AS leases_expirados,
    round(EXTRACT(epoch FROM now() - min(created_at) FILTER (WHERE status IN ('pending','processing')))/60)::bigint AS idade_min
  FROM public.comunicacao_outbox
),
sig_ob_pend AS (
  SELECT 'comunicacao', 'outbox_backlog',
         CASE WHEN pendentes + processando = 0 THEN 'OK'
              WHEN pendentes + processando <= 50 THEN 'WARN' ELSE 'CRITICAL' END,
         (pendentes + processando)::text,
         '0 com entrega desligada; 1–50 = WARN; >50 = CRITICAL',
         'Flags de entrega estão OFF em homologação: backlog crescente indica produtor ativo sem consumidor. Seção 7.5 do runbook.'
  FROM ob
),
sig_ob_idade AS (
  SELECT 'comunicacao', 'outbox_item_mais_antigo_min',
         CASE WHEN idade_min IS NULL THEN 'UNKNOWN'
              WHEN idade_min > 1440 THEN 'CRITICAL'
              WHEN idade_min > 60 THEN 'WARN' ELSE 'OK' END,
         coalesce(idade_min::text, 'fila vazia'),
         '<= 60min = OK; <= 1440min = WARN; acima = CRITICAL',
         'Fila vazia = UNKNOWN (sem baseline). Com backlog: verificar process-communication-outbox e leases expirados.'
  FROM ob
),
sig_ob_dead AS (
  SELECT 'comunicacao', 'outbox_dead_letter',
         CASE WHEN mortos = 0 THEN 'OK' WHEN mortos <= 5 THEN 'WARN' ELSE 'CRITICAL' END,
         mortos::text, '0 = OK; 1–5 = WARN; >5 = CRITICAL',
         'Reprocessar somente via fluxo de replay auditado (comunicacao_dlq_replay_audit). Nunca editar linhas manualmente.'
  FROM ob
),
sig_ob_lease AS (
  SELECT 'comunicacao', 'outbox_leases_expirados',
         CASE WHEN leases_expirados = 0 THEN 'OK' WHEN leases_expirados <= 3 THEN 'WARN' ELSE 'CRITICAL' END,
         leases_expirados::text, '0 = OK; 1–3 = WARN; >3 = CRITICAL',
         'Lease expirado indica worker morto no meio do lote; o próprio motor reclama o lease. Escalar se persistir por 2 ciclos.'
  FROM ob
),
sig_ob_retry AS (
  SELECT 'comunicacao', 'outbox_retry_alto',
         CASE WHEN retry_alto = 0 THEN 'OK' WHEN retry_alto <= 5 THEN 'WARN' ELSE 'CRITICAL' END,
         retry_alto::text, 'itens pendentes com >= 3 tentativas: 0 = OK; <= 5 = WARN',
         'Retry crescente com provedor OFF sugere erro determinístico de template/destinatário. Ver comunicacao_audit_log.'
  FROM ob
),
sig_ev AS (
  SELECT 'comunicacao', 'eventos_nao_processados',
         CASE WHEN count(*) FILTER (WHERE status <> 'processed') = 0 THEN 'OK'
              WHEN count(*) FILTER (WHERE status <> 'processed') <= 10 THEN 'WARN' ELSE 'CRITICAL' END,
         count(*) FILTER (WHERE status <> 'processed')::text || '/' || count(*)::text,
         '0 eventos fora de processed',
         'Evento preso indica falha na expansão transacional (rpc_publish_communication_event_v2). Seção 7.5.'
  FROM public.comunicacao_eventos
),
-- ─────────────────────── RATE LIMIT PÚBLICO ───────────────────────
rl AS (
  SELECT count(*)::bigint AS chaves,
         coalesce(max(hits), 0)::bigint AS pico
  FROM private.public_validation_rate_counters
),
sig_rl AS (
  SELECT 'superficie_publica', 'rate_limit_validacao_publica',
         CASE WHEN chaves = 0 THEN 'OK'
              WHEN pico >= (SELECT coalesce(max(max_hits), 0) FROM private.public_validation_rate_policy) THEN 'WARN'
              ELSE 'OK' END,
         chaves::text || ' chave(s) na janela, pico ' || pico::text,
         'pico < max_hits da política vigente em private.public_validation_rate_policy',
         'Pico no teto = possível abuso das 2 RPCs anon. Chaves são hash com pepper privado: nunca desidentificar. Seção 7.7.'
  FROM rl
),
sig_rl_priv AS (
  SELECT 'superficie_publica', 'rate_limit_sem_data_api',
         CASE WHEN count(*) = 0 THEN 'OK' ELSE 'CRITICAL' END,
         count(*)::text || ' grant(s) indevido(s)',
         'nenhum GRANT a anon/authenticated em private.public_validation_rate_*',
         'Exposição do rate limit pela Data API quebra a proteção anti-abuso: revogar imediatamente (rollback H7O P3).'
  FROM information_schema.role_table_grants
  WHERE table_schema = 'private' AND table_name LIKE 'public_validation_rate%'
    AND grantee IN ('anon', 'authenticated')
),
sig_anon AS (
  SELECT 'superficie_publica', 'rpcs_executaveis_por_anon',
         CASE WHEN count(*) = 2 THEN 'OK' ELSE 'CRITICAL' END,
         count(*)::text, '= 2 (por desenho, validadas em H7O)',
         'Qualquer variação exige revisão imediata: comparar com o inventário H7O antes de revogar.'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
),
-- ─────────────────────── RLS / RPC INVARIANTES ───────────────────────
sig_secdef AS (
  SELECT 'rls_rpc', 'security_definer_sem_search_path',
         CASE WHEN count(*) = 0 THEN 'OK' ELSE 'CRITICAL' END,
         count(*)::text, '= 0',
         'SECURITY DEFINER sem search_path fixo é vetor de escalada: corrigir na mesma janela (regressão RLS, seção 7.9).'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
),
sig_secdef_n AS (
  SELECT 'rls_rpc', 'security_definer_total',
         CASE WHEN count(*) = 648 THEN 'OK' ELSE 'WARN' END,
         count(*)::text, '= 648 (baseline H8-C)',
         'Variação legítima só após migration aprovada; caso contrário investigar criação fora do fluxo.'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
),
tbl_rls AS (
  SELECT count(*) FILTER (WHERE NOT c.relrowsecurity)::bigint AS sem_rls,
         count(*) FILTER (WHERE c.relrowsecurity AND NOT EXISTS (
             SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid))::bigint AS fail_closed
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
),
sig_rls_off AS (
  SELECT 'rls_rpc', 'tabelas_publicas_sem_rls',
         CASE WHEN sem_rls = 0 THEN 'OK' ELSE 'CRITICAL' END,
         sem_rls::text, '= 0',
         'Tabela em public sem RLS fica aberta pela Data API: habilitar RLS na mesma janela.'
  FROM tbl_rls
),
sig_rls_fc AS (
  SELECT 'rls_rpc', 'tabelas_rls_fail_closed',
         CASE WHEN fail_closed = 7 THEN 'OK' ELSE 'WARN' END,
         fail_closed::text, '= 7 (baseline; RLS ligada e sem policy = negado por padrão)',
         'Aumento = tabela nova sem policy (esperado mas precisa de decisão). Redução = policy nova: revisar antes de aceitar.'
  FROM tbl_rls
),
sig_views AS (
  SELECT 'rls_rpc', 'views_security_invoker',
         CASE WHEN count(*) FILTER (WHERE NOT inv) <= 1 THEN 'OK' ELSE 'CRITICAL' END,
         count(*) FILTER (WHERE inv)::text || '/' || count(*)::text,
         '23 de 24 invoker; 1 interna sem grants',
         'View definer exposta pela Data API burla RLS: reaplicar H7O P4 (security_invoker).'
  FROM (
    SELECT coalesce((SELECT true FROM unnest(c.reloptions) o
                       WHERE o IN ('security_invoker=true', 'security_invoker=on')), false) AS inv
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
  ) v
),
-- ─────────────────────── FISCAL (somente configuração) ───────────────────────
fiscal AS (
  SELECT upper(coalesce(fiscal_environment::text, 'UNKNOWN')) AS amb,
         coalesce(nfe_environment_code::text, '?')            AS tpamb,
         coalesce(production_enabled, false)                  AS prod,
         upper(coalesce(configuration_status::text, 'UNKNOWN')) AS cfg,
         upper(coalesce(nfe_readiness_status::text, 'UNKNOWN')) AS readiness
  FROM public.company_fiscal_settings
  WHERE is_active LIMIT 1
),
sig_fiscal AS (
  SELECT 'fiscal', 'ambiente_homologacao',
         CASE WHEN amb = 'HOMOLOGATION' AND tpamb = '2' AND prod = false THEN 'OK' ELSE 'CRITICAL' END,
         amb || '|tpAmb=' || tpamb || '|producao=' || prod::text,
         'HOMOLOGATION | tpAmb=2 | production_enabled=false',
         'Qualquer desvio é tentativa de emissão fora de homologação: bloquear e acionar 7.10 do runbook. Produção segue NO-GO.'
  FROM fiscal
),
sig_fiscal_ready AS (
  SELECT 'fiscal', 'readiness_esperada',
         CASE WHEN cfg = 'DRAFT' AND readiness = 'NOT_READY' THEN 'OK' ELSE 'WARN' END,
         cfg || '|' || readiness, 'DRAFT | NOT_READY (B3 aberto)',
         'READY sem credenciamento SEFAZ e validação contábil (B3) não é aceitável em H8. Confirmar origem da mudança.'
  FROM fiscal
),
-- ─────────────────────── STORAGE (somente contagens) ───────────────────────
sig_bucket AS (
  SELECT 'storage', 'buckets_publicos',
         CASE WHEN count(*) FILTER (WHERE public) = 1 THEN 'OK' ELSE 'CRITICAL' END,
         count(*) FILTER (WHERE public)::text || '/' || count(*)::text,
         'apenas 1 bucket público (logos); demais privados',
         'Bucket sensível público expõe documentos fiscais/financeiros: privar imediatamente (7.8).'
  FROM storage.buckets
),
sig_obj_pol AS (
  SELECT 'storage', 'policies_storage_objects',
         CASE WHEN count(*) = 0 THEN 'CRITICAL' ELSE 'OK' END,
         count(*)::text, '> 0 policies em storage.objects',
         'Sem policy, todo acesso a arquivo privado depende só da service role: revisar antes de qualquer teste de upload.'
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'storage' AND c.relname = 'objects'
),
-- ─────────────────────── AUTH (sem PII) ───────────────────────
auth_agg AS (
  SELECT count(*)::bigint AS usuarios,
         count(*) FILTER (WHERE u.last_sign_in_at IS NULL)::bigint AS nunca_logaram,
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id))::bigint AS sem_perfil,
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id))::bigint AS sem_papel
  FROM auth.users u
),
sig_auth_perfil AS (
  SELECT 'auth', 'usuarios_sem_perfil',
         CASE WHEN sem_perfil <= 4 THEN 'OK' WHEN sem_perfil <= 8 THEN 'WARN' ELSE 'CRITICAL' END,
         sem_perfil::text || '/' || usuarios::text,
         '<= 4 (baseline medido em H8-D: contas técnicas de homologação); <= 8 = WARN',
         'Usuário sem profile trava o roteamento de portal. Criar perfil pelo fluxo administrativo, nunca por INSERT manual.'
  FROM auth_agg
),
sig_auth_papel AS (
  SELECT 'auth', 'usuarios_sem_papel',
         CASE WHEN sem_papel <= 4 THEN 'OK' WHEN sem_papel <= 8 THEN 'WARN' ELSE 'CRITICAL' END,
         sem_papel::text || '/' || usuarios::text,
         '<= 4 (baseline medido em H8-D: contas técnicas de homologação); <= 8 = WARN',
         'Sem papel, todas as policies negam: atribuir via fluxo administrativo (user_roles é a única fonte de papel).'
  FROM auth_agg
),
-- ─────────────────────── BANCO ───────────────────────
sig_conn AS (
  SELECT 'banco', 'conexoes_em_uso',
         CASE WHEN count(*)::float / greatest(current_setting('max_connections')::int, 1) > 0.85 THEN 'CRITICAL'
              WHEN count(*)::float / greatest(current_setting('max_connections')::int, 1) > 0.7 THEN 'WARN'
              ELSE 'OK' END,
         count(*)::text || '/' || current_setting('max_connections'),
         '<= 70% do max_connections',
         'Saturação sustentada em homologação costuma ser worker preso: identificar por state/wait_event, sem encerrar sessão de terceiros.'
  FROM pg_stat_activity
),
sig_lock AS (
  SELECT 'banco', 'locks_longos',
         CASE WHEN count(*) = 0 THEN 'OK' WHEN count(*) <= 2 THEN 'WARN' ELSE 'CRITICAL' END,
         count(*)::text, '0 sessões bloqueadas há mais de 5 minutos',
         'Lock longo durante migration = risco de janela travada: diagnosticar por pg_blocking_pids antes de qualquer cancelamento.'
  FROM pg_stat_activity
  WHERE wait_event_type = 'Lock' AND state <> 'idle' AND now() - query_start > interval '5 minutes'
),
sig_idx_dup AS (
  SELECT 'banco', 'indices_duplicados_conhecidos',
         'UNKNOWN', '1 (Advisor oficial H8-A)',
         'medido pelo Advisor, não pelo catálogo',
         'Advisor é a fonte oficial de duplicate_index/unused_index; este healthcheck não recalcula. Rodar Advisor no ritual semanal.'
)
SELECT categoria, sinal, status, medida, limiar, resposta FROM (
  SELECT * FROM sig_ledger
  UNION ALL SELECT * FROM sig_repo_only
  UNION ALL SELECT * FROM sig_cron_inv
  UNION ALL SELECT * FROM sig_cron_fail
  UNION ALL SELECT * FROM sig_cron_stale
  UNION ALL SELECT * FROM sig_ob_pend
  UNION ALL SELECT * FROM sig_ob_idade
  UNION ALL SELECT * FROM sig_ob_dead
  UNION ALL SELECT * FROM sig_ob_lease
  UNION ALL SELECT * FROM sig_ob_retry
  UNION ALL SELECT * FROM sig_ev
  UNION ALL SELECT * FROM sig_rl
  UNION ALL SELECT * FROM sig_rl_priv
  UNION ALL SELECT * FROM sig_anon
  UNION ALL SELECT * FROM sig_secdef
  UNION ALL SELECT * FROM sig_secdef_n
  UNION ALL SELECT * FROM sig_rls_off
  UNION ALL SELECT * FROM sig_rls_fc
  UNION ALL SELECT * FROM sig_views
  UNION ALL SELECT * FROM sig_fiscal
  UNION ALL SELECT * FROM sig_fiscal_ready
  UNION ALL SELECT * FROM sig_bucket
  UNION ALL SELECT * FROM sig_obj_pol
  UNION ALL SELECT * FROM sig_auth_perfil
  UNION ALL SELECT * FROM sig_auth_papel
  UNION ALL SELECT * FROM sig_conn
  UNION ALL SELECT * FROM sig_lock
  UNION ALL SELECT * FROM sig_idx_dup
) s
ORDER BY categoria, sinal;
