-- H7O P3 — Rate-limit server-side para a RPC pública rpc_validar_comprovante_entrega(uuid) (executável por anon).
-- Escopo: staging ikaauvsflpmamgxmkhoq. Idempotente e reversível
-- (restoration/homologacao-h7/h7o-rollbacks/rollback-20260930020000.sql).
--
-- Desenho:
--   * Estrutura em schema `private` (não exposto pela Data API; anon sem USAGE). Nenhum grant a anon/authenticated.
--   * Contadores de janela fixa por escopo: token (HMAC do token), origin (HMAC do IP de origem lido de
--     request.headers) e global. Nunca armazena token nem IP em claro: apenas HMAC-SHA256 com pepper
--     gerado no banco (extensions.gen_random_bytes) e inacessível às roles da aplicação.
--   * Verificação ANTES de qualquer consulta ao token → resposta idêntica para token existente ou não
--     (anti-enumeração) com `retry_after_seconds`. Contrato de resposta para chamadas não limitadas é preservado.
--   * Auditoria agregada: hits/blocked/first_seen/last_seen por bucket. Limpeza inline (janelas antigas do
--     mesmo bucket) + poda diária idempotente via pg_cron (se disponível).
--   * A estrutura existente public.communication_provider_settings_rate_limit é por user_id (autenticado) e
--     restrita a service_role — não serve para tráfego anônimo; o padrão (upsert por janela) é reaproveitado.
--
-- Pré-condição fail-fast.
DO $pre$
BEGIN
  IF to_regprocedure('public.rpc_validar_comprovante_entrega(uuid)') IS NULL THEN
    RAISE EXCEPTION 'H7O P3 ABORT: rpc_validar_comprovante_entrega(uuid) ausente';
  END IF;
  IF to_regprocedure('extensions.hmac(bytea,bytea,text)') IS NULL
     OR to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL THEN
    RAISE EXCEPTION 'H7O P3 ABORT: pgcrypto (extensions.hmac/gen_random_bytes) indisponível';
  END IF;
  IF to_regclass('public.entrega_comprovantes') IS NULL THEN
    RAISE EXCEPTION 'H7O P3 ABORT: public.entrega_comprovantes ausente';
  END IF;
END
$pre$;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;

-- 1) Pepper (segredo gerado no banco; nunca versionado; sem grants às roles da aplicação).
CREATE TABLE IF NOT EXISTS private.public_validation_rate_pepper (
  id          smallint PRIMARY KEY CHECK (id = 1),
  pepper      bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.public_validation_rate_pepper (id, pepper)
SELECT 1, extensions.gen_random_bytes(32)
WHERE NOT EXISTS (SELECT 1 FROM private.public_validation_rate_pepper WHERE id = 1);

-- 2) Política de limites (ajustável por ops sem redeploy; sem grants às roles da aplicação).
CREATE TABLE IF NOT EXISTS private.public_validation_rate_policy (
  scope           text PRIMARY KEY CHECK (scope IN ('token','origin','global')),
  max_hits        integer NOT NULL CHECK (max_hits > 0),
  window_seconds  integer NOT NULL CHECK (window_seconds > 0),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.public_validation_rate_policy (scope, max_hits, window_seconds) VALUES
  ('token',  10,  60),
  ('origin', 30,  60),
  ('global', 600, 60)
ON CONFLICT (scope) DO NOTHING;

-- 3) Contadores por janela fixa (somente hashes).
CREATE TABLE IF NOT EXISTS private.public_validation_rate_counters (
  scope         text NOT NULL,
  bucket_hash   bytea NOT NULL,
  window_start  timestamptz NOT NULL,
  hits          integer NOT NULL DEFAULT 0,
  blocked       integer NOT NULL DEFAULT 0,
  first_seen    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, bucket_hash, window_start)
);
CREATE INDEX IF NOT EXISTS public_validation_rate_counters_window_idx
  ON private.public_validation_rate_counters (window_start);

ALTER TABLE private.public_validation_rate_pepper   ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.public_validation_rate_policy   ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.public_validation_rate_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.public_validation_rate_pepper   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.public_validation_rate_policy   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.public_validation_rate_counters FROM PUBLIC, anon, authenticated;

-- 4) Verificador (SECURITY DEFINER, search_path vazio, sem EXECUTE para roles da aplicação).
CREATE OR REPLACE FUNCTION private.fn_public_validation_rate_check(p_token uuid)
RETURNS TABLE(allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_pepper       bytea;
  v_headers      jsonb;
  v_origin       text;
  v_now          timestamptz := pg_catalog.clock_timestamp();
  v_allowed      boolean := true;
  v_retry        integer := 0;
  v_retry_scope  integer;
  v_value        text;
  v_bucket       bytea;
  v_ws           timestamptz;
  v_hits         integer;
  r              record;
BEGIN
  SELECT p.pepper INTO v_pepper FROM private.public_validation_rate_pepper p WHERE p.id = 1;
  IF v_pepper IS NULL THEN
    -- fail-closed: sem pepper não há como contabilizar com privacidade.
    RAISE EXCEPTION 'rate_limit_not_initialized' USING ERRCODE = '55000';
  END IF;

  BEGIN
    v_headers := nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  v_origin := coalesce(
    nullif(pg_catalog.btrim(pg_catalog.split_part(v_headers->>'cf-connecting-ip', ',', 1)), ''),
    nullif(pg_catalog.btrim(pg_catalog.split_part(v_headers->>'x-forwarded-for', ',', 1)), ''),
    nullif(pg_catalog.btrim(v_headers->>'x-real-ip'), ''),
    'unknown');

  FOR r IN
    SELECT pol.scope, pol.max_hits, pol.window_seconds
      FROM private.public_validation_rate_policy pol
     ORDER BY pol.scope
  LOOP
    v_value := CASE r.scope
                 WHEN 'token'  THEN 'token:'  || coalesce(p_token::text, '')
                 WHEN 'origin' THEN 'origin:' || v_origin
                 ELSE 'global'
               END;
    v_bucket := extensions.hmac(pg_catalog.convert_to(v_value, 'utf8'), v_pepper, 'sha256');
    v_ws := pg_catalog.to_timestamp(
              pg_catalog.floor(extract(epoch FROM v_now) / r.window_seconds) * r.window_seconds);

    INSERT INTO private.public_validation_rate_counters AS c
           (scope, bucket_hash, window_start, hits, first_seen, last_seen)
    VALUES (r.scope, v_bucket, v_ws, 1, v_now, v_now)
    ON CONFLICT (scope, bucket_hash, window_start)
    DO UPDATE SET hits = c.hits + 1, last_seen = v_now
    RETURNING c.hits INTO v_hits;

    IF v_hits > r.max_hits THEN
      v_allowed := false;
      UPDATE private.public_validation_rate_counters c
         SET blocked = c.blocked + 1
       WHERE c.scope = r.scope AND c.bucket_hash = v_bucket AND c.window_start = v_ws;
      v_retry_scope := greatest(1,
        pg_catalog.ceil(extract(epoch FROM
          (v_ws + pg_catalog.make_interval(secs => r.window_seconds) - v_now)))::integer);
      v_retry := greatest(v_retry, v_retry_scope);
    END IF;

    -- housekeeping barato: descarta janelas anteriores do mesmo bucket (limita linhas por bucket).
    DELETE FROM private.public_validation_rate_counters c
     WHERE c.scope = r.scope AND c.bucket_hash = v_bucket AND c.window_start < v_ws;
  END LOOP;

  allowed := v_allowed;
  retry_after_seconds := v_retry;
  RETURN NEXT;
END
$fn$;

-- 5) Poda (idempotente).
CREATE OR REPLACE FUNCTION private.fn_public_validation_rate_prune(p_keep interval DEFAULT interval '1 day')
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM private.public_validation_rate_counters c
   WHERE c.window_start < pg_catalog.clock_timestamp() - p_keep;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$fn$;

REVOKE ALL ON FUNCTION private.fn_public_validation_rate_check(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.fn_public_validation_rate_prune(interval) FROM PUBLIC, anon, authenticated;

-- 6) Job de poda diário (idempotente; só se pg_cron existir).
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'h7o-prune-public-validation-rate-limit') THEN
      PERFORM cron.schedule('h7o-prune-public-validation-rate-limit', '25 3 * * *',
                            'SELECT private.fn_public_validation_rate_prune();');
    END IF;
  END IF;
END
$cron$;

-- 7) RPC pública: verificação de rate-limit ANTES da consulta ao token; restante do corpo inalterado.
CREATE OR REPLACE FUNCTION public.rpc_validar_comprovante_entrega(p_validation_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_comp public.entrega_comprovantes%ROWTYPE;
  v_msg text;
  v_allowed boolean;
  v_retry integer;
BEGIN
  -- H7O: rate-limit server-side (token/origem/global) antes de qualquer leitura — resposta idêntica
  -- para token existente ou inexistente (anti-enumeração).
  SELECT rl.allowed, rl.retry_after_seconds
    INTO v_allowed, v_retry
    FROM private.fn_public_validation_rate_check(p_validation_token) rl;
  IF NOT COALESCE(v_allowed, false) THEN
    RETURN jsonb_build_object(
      'valido', false,
      'mensagem', 'Muitas tentativas de validação. Aguarde alguns instantes e tente novamente.',
      'retry_after_seconds', COALESCE(v_retry, 60)
    );
  END IF;

  SELECT * INTO v_comp FROM public.entrega_comprovantes WHERE validation_token = p_validation_token;
  IF NOT FOUND OR NOT v_comp.validation_public_enabled THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Comprovante não encontrado ou indisponível.');
  END IF;
  IF v_comp.validation_expires_at IS NOT NULL AND v_comp.validation_expires_at < now() THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Comprovante expirado.');
  END IF;
  IF v_comp.status IN ('cancelado','rejeitado') THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Comprovante cancelado.');
  END IF;

  v_msg := CASE v_comp.assinatura_tipo
    WHEN 'dispensada' THEN 'Comprovante registrado com dispensa formal de assinatura no sistema AR Bio.'
    WHEN 'digital_tela' THEN 'Comprovante registrado com assinatura digital operacional no sistema AR Bio.'
    WHEN 'fisica_anexada' THEN 'Comprovante registrado com formulário físico assinado no sistema AR Bio.'
    ELSE 'Comprovante de entrega registrado no sistema AR Bio.'
  END;

  RETURN jsonb_build_object(
    'valido', true,
    'status', v_comp.status,
    'assinatura_tipo', v_comp.assinatura_tipo,
    'possui_ressalvas', COALESCE(v_comp.possui_ressalvas, false),
    'numero_formulario', v_comp.numero_formulario,
    'data_confirmacao', v_comp.confirmado_em,
    'data_assinatura', v_comp.data_assinatura,
    'validation_hash', v_comp.validation_hash,
    'mensagem', v_msg
  );
END $function$;

-- ACL da RPC pública inalterada (anon/authenticated/service_role) — pública por design (QR do comprovante).

-- Pós-condição fail-fast.
DO $post$
DECLARE v_bad text := '';
BEGIN
  IF has_table_privilege('anon', 'private.public_validation_rate_counters', 'SELECT')
     OR has_table_privilege('authenticated', 'private.public_validation_rate_counters', 'SELECT')
     OR has_table_privilege('anon', 'private.public_validation_rate_pepper', 'SELECT')
     OR has_table_privilege('authenticated', 'private.public_validation_rate_pepper', 'SELECT')
     OR has_table_privilege('anon', 'private.public_validation_rate_policy', 'SELECT')
     OR has_table_privilege('authenticated', 'private.public_validation_rate_policy', 'SELECT') THEN
    v_bad := v_bad || ' tabelas_private_expostas';
  END IF;
  IF has_function_privilege('anon', 'private.fn_public_validation_rate_check(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.fn_public_validation_rate_check(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'private.fn_public_validation_rate_prune(interval)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.fn_public_validation_rate_prune(interval)', 'EXECUTE') THEN
    v_bad := v_bad || ' funcoes_private_expostas';
  END IF;
  IF NOT has_function_privilege('anon', 'public.rpc_validar_comprovante_entrega(uuid)', 'EXECUTE') THEN
    v_bad := v_bad || ' rpc_publica_perdeu_anon';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.rpc_validar_comprovante_entrega(uuid)'::regprocedure
                    AND prosrc LIKE '%fn_public_validation_rate_check%') THEN
    v_bad := v_bad || ' rpc_sem_rate_limit';
  END IF;
  IF (SELECT count(*) FROM private.public_validation_rate_policy) <> 3 THEN
    v_bad := v_bad || ' policy_incompleta';
  END IF;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'H7O P3 ABORT: pós-condição violada:%', v_bad;
  END IF;
END
$post$;
