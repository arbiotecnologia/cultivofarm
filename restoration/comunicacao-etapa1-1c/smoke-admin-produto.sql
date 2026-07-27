-- Subfase 1C — Smoke reproduzível: _comunicacao_expand_event
-- Eventos: administrative_important_update e produto_pronto_retirada / produto_pronto_aplicacao.
-- Ambiente: staging ikaauvsflpmamgxmkhoq. Produção proibida.
-- Segurança: BEGIN ... ROLLBACK. Zero I/O de rede. Zero side-effect após rollback.
-- Requisitos: executar com psql como service_role (o expander foi REVOKE ALL de PUBLIC/anon/authenticated).
--
-- O que este smoke prova (sem tocar runtime, sem habilitar regras):
--   S1) A assinatura instalada é exatamente
--       (_event_id uuid, _event_key text, _source_type text, _source_id uuid, _payload jsonb) RETURNS jsonb.
--   S2) A função responde com jsonb bem-formado para administrative_important_update.
--   S3) A função responde com jsonb bem-formado para produto_pronto_retirada e _para_retirada.
--   S4) Após ROLLBACK, nenhuma linha nova em comunicacao_events / comunicacao_outbox / comunicacao_notifications_inapp.
--   S5) Nenhuma regra enabled=true para esses event_keys (evita entrega mesmo em flags OFF).
--
-- IMPORTANTE: este arquivo NÃO invoca _comunicacao_publish_system_event nem cria eventos reais.
-- Ele apenas chama o expander diretamente com um payload sintético, dentro de sentinel rollback.

BEGIN;

-- Baseline determinístico
CREATE TEMP TABLE _pre_counts ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.comunicacao_events)                 AS events,
  (SELECT count(*) FROM public.comunicacao_outbox)                 AS outbox,
  (SELECT count(*) FROM public.comunicacao_notifications_inapp)    AS inapp;

-- S1) Assinatura real instalada
SELECT
  p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
  pg_catalog.pg_get_function_result(p.oid)             AS returns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='_comunicacao_expand_event';
-- Esperado: (_event_id uuid, _event_key text, _source_type text, _source_id uuid, _payload jsonb) / jsonb

-- S5) Nenhuma regra habilitada para os event_keys deste smoke
SELECT event_key, count(*) FILTER (WHERE enabled) AS enabled_count
  FROM public.comunicacao_regras
 WHERE event_key IN ('administrative_important_update',
                     'produto_pronto_retirada',
                     'produto_pronto_aplicacao')
 GROUP BY event_key;
-- Esperado: enabled_count = 0 em todas (ou nenhuma linha).

-- S2/S3) Chamadas sintéticas ao expander. IDs fictícios em uuid_generate_v4 — o expander é read-only.
DO $smoke$
DECLARE
  v_evt uuid := gen_random_uuid();
  v_src uuid := gen_random_uuid();
  v_res jsonb;
BEGIN
  -- administrative_important_update
  v_res := public._comunicacao_expand_event(
    v_evt,
    'administrative_important_update',
    'administrative_broadcast',
    v_src,
    jsonb_build_object('titulo','Smoke','mensagem','Smoke read-only','severity','info')
  );
  RAISE NOTICE 'expand administrative_important_update -> %', v_res::text;
  IF v_res IS NULL OR jsonb_typeof(v_res) NOT IN ('object','array') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_admin_important_update: retorno inválido';
  END IF;

  -- produto_pronto_retirada
  v_res := public._comunicacao_expand_event(
    gen_random_uuid(),
    'produto_pronto_retirada',
    'ordens_servico_onfarm',
    gen_random_uuid(),
    jsonb_build_object('numero','SMOKE-1','produto','test')
  );
  RAISE NOTICE 'expand produto_pronto_retirada -> %', v_res::text;
  IF v_res IS NULL OR jsonb_typeof(v_res) NOT IN ('object','array') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_produto_entrega: retorno inválido';
  END IF;

  -- produto_pronto_aplicacao
  v_res := public._comunicacao_expand_event(
    gen_random_uuid(),
    'produto_pronto_aplicacao',
    'ordens_servico_onfarm',
    gen_random_uuid(),
    jsonb_build_object('numero','SMOKE-2','produto','test')
  );
  RAISE NOTICE 'expand produto_pronto_aplicacao -> %', v_res::text;
  IF v_res IS NULL OR jsonb_typeof(v_res) NOT IN ('object','array') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_produto_retirada: retorno inválido';
  END IF;
END $smoke$;

-- S4) Zero resíduo: contagens pós devem ser idênticas às pré (expander é read-only por design,
-- e nada mais foi chamado — publisher/resolver não são invocados aqui).
SELECT
  (SELECT count(*) FROM public.comunicacao_events)              - (SELECT events FROM _pre_counts) AS delta_events,   -- esperado 0
  (SELECT count(*) FROM public.comunicacao_outbox)              - (SELECT outbox FROM _pre_counts) AS delta_outbox,   -- esperado 0
  (SELECT count(*) FROM public.comunicacao_notifications_inapp) - (SELECT inapp  FROM _pre_counts) AS delta_inapp;    -- esperado 0

ROLLBACK;
