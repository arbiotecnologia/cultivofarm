-- ============================================================================
-- P1 — CONVERGÊNCIA/LEDGER DE PROMOÇÃO — SCRIPT DE EXECUÇÃO MANUAL
-- version alvo: 20261101000000  (promocao_convergencia_ledger_v1)
-- Alvo autorizado: PRODUÇÃO Supabase ref `navfzbwgwzruipouyfnk`
--
-- ORIGEM BYTE A BYTE:
--   restoration/promocao-producao-h9/promotion-sql/20261101000000_promocao_convergencia_ledger_v1.sql
--   SHA-256 65de029be6e90ea2bd76008df22273d8323cbd3272f3589a601025f5d50d7137
--   rollback: restoration/promocao-producao-h9/rollback-sql/20261101000000_promocao_convergencia_ledger_v1_rollback.sql
--
-- Este arquivo NÃO altera o SQL de origem. Ele apenas o envolve em:
--   [GUARDA]    verificação de alvo fail-closed;
--   [PRECHECK]  leituras de identidade/ledger/estado;
--   [ORIGEM]    o corpo da migration, reproduzido integralmente;
--   [POSCHECK]  verificações após COMMIT;
--   [ROLLBACK]  bloco comentado, para uso deliberado;
--   [RUNBOOK]   ordem de execução e registro de ledger.
-- Tudo que não vem da origem está marcado com um destes rótulos.
--
-- NENHUM SQL FOI EXECUTADO PELO AMBIENTE QUE GEROU ESTE ARQUIVO.
-- ============================================================================

\set ON_ERROR_STOP on
\timing on

-- ---------------------------------------------------------------------------
-- [PRECHECK] 0. Identidade do alvo. Confira MANUALMENTE antes de prosseguir.
-- Esperado: current_database=postgres, current_user=postgres, PostgreSQL 17.6.
-- ---------------------------------------------------------------------------
SELECT current_database() AS banco,
       current_user       AS usuario,
       version()          AS versao,
       inet_server_addr() AS host_servidor;

-- ---------------------------------------------------------------------------
-- [PRECHECK] 1. Ledger antes da execução.
-- Esperado em produção pré-P1: total=490, ultima_versao=20260723000000.
-- ---------------------------------------------------------------------------
SELECT count(*) AS total_versoes, max(version) AS ultima_versao
FROM supabase_migrations.schema_migrations;

-- [PRECHECK] 1b. A version desta onda NÃO pode já estar no ledger.
-- Esperado: 0 linhas.
SELECT version FROM supabase_migrations.schema_migrations
WHERE version = '20261101000000';

-- [PRECHECK] 1c. Nenhuma version de backend estranho pode estar presente.
-- Esperado: 0 linhas.
SELECT version FROM supabase_migrations.schema_migrations
WHERE version LIKE '20260812%' ORDER BY 1;

-- ---------------------------------------------------------------------------
-- [PRECHECK] 2. Estado atual das duas tabelas de convergência.
-- Esperado pré-execução: 0 linhas (nenhuma existe ainda).
-- Se já existirem, a migration é idempotente e nada será recriado.
-- ---------------------------------------------------------------------------
SELECT c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('promocao_execucao_registro','promocao_rollback_baseline')
ORDER BY 1;

-- ============================================================================
-- [GUARDA] + [ORIGEM] — TRANSAÇÃO ÚNICA
-- A guarda de alvo é adição deste script; o corpo entre os marcadores
-- "INICIO ORIGEM" e "FIM ORIGEM" é o arquivo de origem, sem alteração.
-- ============================================================================
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk';

-- [GUARDA] fail-closed: aborta se o alvo declarado não for a produção autorizada.
DO $guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_ALVO: promocao.target_ref ausente ou diferente da producao autorizada.';
  END IF;
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'ABORT_ALVO: banco inesperado %.', current_database();
  END IF;
END
$guard$;

-- ------------------------- INICIO ORIGEM (byte a byte) ----------------------
-- ============================================================================
-- MIGRATION DE CONVERGÊNCIA DE PROMOÇÃO — v1  (CRIADA, NÃO EXECUTADA)
-- Version 20261101000000 (posterior a 20261026000000).
--
-- Local: mantida fora de supabase/migrations/ durante a P0c porque nesta fase é
-- proibido executar SQL ou alterar o ledger. No início da onda P1 ela é
-- promovida a arquivo de migration com ESTE conteúdo e ESTE nome, aplicada em
-- PRODUÇÃO e TAMBÉM em HOMOLOGAÇÃO, para que os dois ledgers avancem juntos.
--
-- Objetivo: registrar, de forma auditável e fechada, o par
--   origem histórica -> artefato derivado -> SHA-256 -> status -> onda ->
--   executor -> timestamp
-- de cada version aplicada durante a promoção, e guardar baselines capturados
-- dentro da transação (ex.: `command` anterior de um job de cron) para
-- rollback real.
--
-- REGRAS:
--   * Não escreve em supabase_migrations.schema_migrations.
--   * O registro do ledger é feito pelo caminho suportado, por version, DEPOIS
--     de o SQL ter executado com sucesso e de os postchecks terem passado:
--         supabase migration repair --status applied <version>
--   * Não contém credencial, segredo, ref de homologação, ref de sandbox nem
--     dado de fixture.
--   * Totalmente idempotente.
--   * Deny-by-default: RLS habilitada, zero policies, REVOKE de PUBLIC/anon/
--     authenticated; acesso apenas service_role/postgres.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.promocao_execucao_registro (
  id              bigserial PRIMARY KEY,
  version         text        NOT NULL,
  origem          text        NOT NULL,
  sha256_origem   text        NOT NULL
                  CHECK (sha256_origem ~ '^[0-9a-f]{64}$'),
  artefato        text,
  sha256_artefato text
                  CHECK (sha256_artefato IS NULL OR sha256_artefato ~ '^[0-9a-f]{64}$'),
  status          text        NOT NULL
                  CHECK (status IN ('APLICADA','NAO_APLICADA','JA_SATISFEITA','STAGING_ONLY','ABORTADA')),
  onda            text        NOT NULL,
  executor        text        NOT NULL DEFAULT current_user,
  observacao      text,
  executed_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promocao_execucao_registro_uq UNIQUE (version, sha256_origem, status)
);

CREATE TABLE IF NOT EXISTS public.promocao_rollback_baseline (
  chave         text PRIMARY KEY,
  conteudo      text        NOT NULL,
  md5_conteudo  text        NOT NULL,
  capturado_em  timestamptz NOT NULL DEFAULT now(),
  capturado_por text        NOT NULL DEFAULT current_user
);

REVOKE ALL ON public.promocao_execucao_registro FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.promocao_rollback_baseline FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.promocao_execucao_registro TO service_role;
GRANT ALL ON public.promocao_rollback_baseline TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.promocao_execucao_registro_id_seq TO service_role;

ALTER TABLE public.promocao_execucao_registro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promocao_rollback_baseline ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: nega anon e authenticated. service_role/postgres bypassam.

COMMENT ON TABLE public.promocao_execucao_registro IS
  'Auditoria de promoção H9: origem -> artefato -> SHA-256 -> status -> onda -> executor. Sem segredos.';
COMMENT ON TABLE public.promocao_rollback_baseline IS
  'Baselines capturados em transação durante a promoção (ex.: cron.job.command anterior) para rollback real. Sem segredos.';

-- ---------------------------------------------------------------------------
-- EVIDÊNCIA DE HASH — REGRA CRIPTOGRÁFICA
-- ---------------------------------------------------------------------------
-- Esta migration NÃO insere a própria linha. Motivo: o SHA-256 do arquivo não
-- pode ser embutido dentro do próprio arquivo (autorreferência), e é PROIBIDO
-- gravar qualquer outro digest (MD5, concatenação de MD5, etc.) em coluna
-- `sha256_*`. As colunas têm CHECK de formato hexadecimal de 64 caracteres,
-- mas o formato sozinho não prova o algoritmo: a garantia real é o runner.
--
-- Fluxo obrigatório, inclusive para esta version:
--   1. executar o SQL desta version;
--   2. rodar os postchecks da onda;
--   3. `supabase migration repair --status applied 20261101000000`;
--   4. só então o RUNNER insere a linha de auditoria, usando o SHA-256 final
--      já fixado em 10-manifesto-artefatos-promocao.csv:
--
--   INSERT INTO public.promocao_execucao_registro
--     (version, origem, sha256_origem, artefato, sha256_artefato, status, onda, observacao)
--   VALUES ('20261101000000', '<caminho do arquivo>', '<sha256_origem do manifesto>',
--           NULL, NULL, 'APLICADA', 'P1',
--           'Estrutura de convergência criada; registro inserido pelo runner após postcheck.');
--
-- Enquanto o runner não inserir, a tabela fica vazia e o status desta version
-- NÃO pode ser declarado APLICADA em nenhum relatório.
-- -------------------------- FIM ORIGEM (byte a byte) ------------------------

-- [POSCHECK-INTRA] Verificação dentro da própria transação: as duas tabelas
-- existem, com RLS ligada e sem nenhuma policy. Falha => ROLLBACK automático.
DO $post$
DECLARE
  v_tabelas int;
  v_sem_rls int;
  v_policies int;
BEGIN
  SELECT count(*) INTO v_tabelas
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
    AND c.relname IN ('promocao_execucao_registro','promocao_rollback_baseline');
  IF v_tabelas <> 2 THEN
    RAISE EXCEPTION 'ABORT_POSCHECK: esperado 2 tabelas de convergencia, encontrado %.', v_tabelas;
  END IF;

  SELECT count(*) INTO v_sem_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('promocao_execucao_registro','promocao_rollback_baseline')
    AND NOT c.relrowsecurity;
  IF v_sem_rls <> 0 THEN
    RAISE EXCEPTION 'ABORT_POSCHECK: % tabela(s) de convergencia sem RLS.', v_sem_rls;
  END IF;

  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('promocao_execucao_registro','promocao_rollback_baseline');
  IF v_policies <> 0 THEN
    RAISE EXCEPTION 'ABORT_POSCHECK: deny-by-default violado, % policy(ies) encontrada(s).', v_policies;
  END IF;

  IF has_table_privilege('anon','public.promocao_execucao_registro','SELECT')
     OR has_table_privilege('authenticated','public.promocao_execucao_registro','SELECT')
     OR has_table_privilege('anon','public.promocao_rollback_baseline','SELECT')
     OR has_table_privilege('authenticated','public.promocao_rollback_baseline','SELECT') THEN
    RAISE EXCEPTION 'ABORT_POSCHECK: acesso indevido concedido a anon/authenticated.';
  END IF;
END
$post$;

COMMIT;

-- ---------------------------------------------------------------------------
-- [POSCHECK] 3. Verificações após o COMMIT (somente leitura).
-- ---------------------------------------------------------------------------
-- 3a. Estrutura criada, RLS ligada. Esperado: 2 linhas, ambas com true.
SELECT c.relname, c.relrowsecurity AS rls_ligada
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('promocao_execucao_registro','promocao_rollback_baseline')
ORDER BY 1;

-- 3b. Nenhuma policy. Esperado: 0 linhas.
SELECT schemaname, tablename, policyname FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('promocao_execucao_registro','promocao_rollback_baseline');

-- 3c. Tabelas ainda vazias — o runner só insere depois do repair. Esperado: 0 e 0.
SELECT (SELECT count(*) FROM public.promocao_execucao_registro) AS registros,
       (SELECT count(*) FROM public.promocao_rollback_baseline)  AS baselines;

-- 3d. Ledger inalterado por esta transação: a migration NÃO escreve no ledger.
-- Esperado: mesmo total observado no PRECHECK 1 (490 / 20260723000000).
SELECT count(*) AS total_versoes, max(version) AS ultima_versao
FROM supabase_migrations.schema_migrations;

-- 3e. Evidência de hash honesta: nenhum valor pode ser digest não-SHA-256.
-- Esperado: 0 linhas (item 4i de 04-postchecks.sql).
SELECT version, sha256_origem
FROM public.promocao_execucao_registro
WHERE sha256_origem !~ '^[0-9a-f]{64}$'
   OR (sha256_artefato IS NOT NULL AND sha256_artefato !~ '^[0-9a-f]{64}$')
ORDER BY 1;

-- ============================================================================
-- [ROLLBACK] Reprodução byte a byte de
--   restoration/promocao-producao-h9/rollback-sql/
--     20261101000000_promocao_convergencia_ledger_v1_rollback.sql
-- NÃO executar junto com este script. Descomentar apenas em decisão explícita
-- de reversão, e somente enquanto AMBAS as tabelas estiverem vazias.
-- ============================================================================
-- -- Rollback forward-only da convergência de promoção (20261101000000).
-- -- A migration não insere linha própria: quem registra é o runner, após
-- -- postcheck. Logo, o rollback só é permitido com AMBAS as tabelas VAZIAS.
-- -- Havendo qualquer registro de promoção ou baseline capturado, PRESERVA tudo.
-- DO $rb$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM public.promocao_rollback_baseline) THEN
--     RAISE EXCEPTION 'ROLLBACK_RECUSADO: promocao_rollback_baseline contem baselines capturados.';
--   END IF;
--   IF EXISTS (SELECT 1 FROM public.promocao_execucao_registro) THEN
--     RAISE EXCEPTION 'ROLLBACK_RECUSADO: existem registros de promocao; historico preservado.';
--   END IF;
--
--   DROP TABLE public.promocao_rollback_baseline;
--   DROP TABLE public.promocao_execucao_registro;
-- END
-- $rb$;

-- ============================================================================
-- [RUNBOOK] ORDEM DE EXECUÇÃO NA MÁQUINA DO OPERADOR
-- ============================================================================
-- 1. Confirmar backup lógico pré-P1 disponível e íntegro (SHA256SUMS.txt).
-- 2. Conferir o SHA-256 do arquivo de origem antes de rodar qualquer coisa:
--      certutil -hashfile 20261101000000_promocao_convergencia_ledger_v1.sql SHA256
--    Esperado: 65de029be6e90ea2bd76008df22273d8323cbd3272f3589a601025f5d50d7137
--    Divergência de hash => ABORTAR.
-- 3. Conectar ao alvo autenticado de produção (pooler de sessão IPv4) e rodar
--    somente os blocos [PRECHECK]. Comparar com os valores esperados.
-- 4. Executar este arquivo inteiro com ON_ERROR_STOP; a transação aborta
--    sozinha se guarda ou pós-check interno falharem.
-- 5. Rodar `restoration/promocao-producao-h9/04-postchecks.sql` integral,
--    com atenção aos itens 4a–4i.
-- 6. Só depois de 5 passar: `supabase migration repair --status applied 20261101000000`.
-- 7. Só depois de 6: o runner insere a linha de auditoria com o SHA-256 real do
--    manifesto (modelo de INSERT reproduzido na seção ORIGEM acima).
-- 8. Repetir 3–7 em homologação `ikaauvsflpmamgxmkhoq`, para os dois ledgers
--    avançarem juntos.
-- 9. Arquivar todas as saídas em `restoration/promocao-producao-h9/evidencias/`.
-- 10. Registrar em seguida `20261102000000` (hardening de views, cujo efeito já
--     foi aplicado por script local equivalente), com observação explícita de
--     que o baseline de reloptions foi capturado APÓS o efeito.
-- 11. Nada de e-mail, WhatsApp, fiscal, webhook, deploy de Edge Function ou
--     publicação de frontend durante a onda.
-- FIM.
