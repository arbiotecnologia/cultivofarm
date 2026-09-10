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
