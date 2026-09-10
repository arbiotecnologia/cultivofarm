-- ============================================================================
-- P0d — HARDENING PREVENTIVO DE VIEWS (ONDA P1) — CRIADO, NÃO EXECUTADO
-- Version 20261102000000 (posterior a 20261101000000).
--
-- Motivo: leitura autorizada somente-leitura em produção confirmou que as três
-- views abaixo estão SEM `security_invoker` (`reloptions` NULL):
--   * public.vw_esteira_laboratorio        (advisor ERROR security_definer_view)
--   * public.vw_fluxo_visita_tecnica       (advisor ERROR security_definer_view)
--   * public._src_vw_esteira_laboratorio   (interna; anon_select=false,
--                                           authenticated_select=false)
-- As duas primeiras são corrigidas por 20260904130615 dentro do pacote. A
-- terceira não é coberta por nenhuma migration histórica: este artefato fecha
-- a lacuna de forma preventiva, na mesma onda P1.
--
-- Não concede acesso novo: nenhum GRANT. Os REVOKE atuais são preservados —
-- este script não altera ACL de forma alguma.
-- ============================================================================
\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- --------------------------------------------------------------------------
-- Guarda canônica de promoção: só executa no alvo de produção.
-- --------------------------------------------------------------------------
DO $guard$
BEGIN
  IF current_setting('promocao.target_ref', true) IS DISTINCT FROM 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ALVO_INVALIDO: promocao.target_ref ausente ou diferente do alvo de producao.';
  END IF;
END
$guard$;

-- --------------------------------------------------------------------------
-- PRECHECK fail-closed: as 3 views devem existir e ser relkind='v'.
-- --------------------------------------------------------------------------
DO $pre$
DECLARE
  v_faltando text;
BEGIN
  SELECT string_agg(x.nome, ', ' ORDER BY x.nome) INTO v_faltando
  FROM (VALUES ('vw_esteira_laboratorio'),
               ('vw_fluxo_visita_tecnica'),
               ('_src_vw_esteira_laboratorio')) AS x(nome)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = x.nome AND c.relkind = 'v'
  );

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK_FALHOU: view(s) ausente(s) ou nao sao view: %', v_faltando;
  END IF;
END
$pre$;

-- --------------------------------------------------------------------------
-- Captura do baseline de reloptions para rollback real (dentro da transação).
-- --------------------------------------------------------------------------
INSERT INTO public.promocao_rollback_baseline (chave, conteudo, md5_conteudo)
SELECT 'views_security_invoker_20261102000000',
       coalesce(string_agg(c.relname || '=' ||
         coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                   WHERE option_name = 'security_invoker'), 'unset'), E'\n' ORDER BY c.relname), ''),
       md5(coalesce(string_agg(c.relname || '=' ||
         coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                   WHERE option_name = 'security_invoker'), 'unset'), E'\n' ORDER BY c.relname), ''))
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
  AND c.relname IN ('vw_esteira_laboratorio','vw_fluxo_visita_tecnica','_src_vw_esteira_laboratorio')
ON CONFLICT (chave) DO NOTHING;

-- --------------------------------------------------------------------------
-- Hardening idempotente. Nenhum GRANT, nenhum REVOKE alterado.
-- --------------------------------------------------------------------------
ALTER VIEW public.vw_esteira_laboratorio      SET (security_invoker = true);
ALTER VIEW public.vw_fluxo_visita_tecnica     SET (security_invoker = true);
ALTER VIEW public._src_vw_esteira_laboratorio SET (security_invoker = true);

-- --------------------------------------------------------------------------
-- PÓS-CHECK: 3/3 com security_invoker = true, dentro da mesma transação.
-- --------------------------------------------------------------------------
DO $post$
DECLARE
  v_ok int;
BEGIN
  SELECT count(*) INTO v_ok
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND c.relname IN ('vw_esteira_laboratorio','vw_fluxo_visita_tecnica','_src_vw_esteira_laboratorio')
    AND 'security_invoker=true' = ANY (coalesce(c.reloptions, '{}'));

  IF v_ok <> 3 THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: % de 3 views com security_invoker=true', v_ok;
  END IF;
END
$post$;

-- --------------------------------------------------------------------------
-- PÓS-CHECK de ACL: nenhum acesso novo para anon/authenticated.
-- --------------------------------------------------------------------------
DO $acl$
DECLARE
  v_exposta text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_exposta
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = '_src_vw_esteira_laboratorio'
    AND (has_table_privilege('anon', c.oid, 'SELECT')
      OR has_table_privilege('authenticated', c.oid, 'SELECT'));

  IF v_exposta IS NOT NULL THEN
    RAISE EXCEPTION 'POSTCHECK_ACL_FALHOU: acesso indevido concedido a %', v_exposta;
  END IF;
END
$acl$;

COMMIT;

-- Após o COMMIT, rodar o Security Advisor de produção: exigir ZERO ERROR
-- `security_definer_view`.
