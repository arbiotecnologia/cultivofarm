-- Subfase 1C — Smoke reproduzível: _comunicacao_expand_event
-- Eventos reais certificados: administrative_important_update, produto_pronto_retirada, produto_pronto_aplicacao.
-- Ambiente: staging ikaauvsflpmamgxmkhoq. Produção proibida.
-- Segurança: BEGIN ... ROLLBACK. Zero I/O de rede. Zero side-effect após rollback.
-- Requisitos: executar com psql como service_role (o expander foi REVOKE ALL de PUBLIC/anon/authenticated).
--
-- REGRA DE DECISÃO — LEIA ANTES DE EXECUTAR:
--   Este smoke NÃO valida comportamento apenas pelo fato de _comunicacao_expand_event retornar jsonb não-nulo.
--   Retornar `{}` ou lista vazia significa "nenhuma regra/destinatário resolvido" e NÃO prova que o expander
--   está correto para o event_key. A regra é:
--     - Se não houver regra `enabled=true` para o event_key em `comunicacao_regras`, ou não houver
--       fixture compatível em `ordens_servico_onfarm` (para produto_pronto_*) / origem admin (para
--       administrative_important_update), o smoke deve **abortar com HARNESS_FAIL** — permanece NO-GO.
--     - Só passa quando a chamada resolve pelo menos 1 recipient/outbox esperado dentro da transação
--       (revertida imediatamente pelo ROLLBACK).
--   Enquanto a plataforma corrente não expuser psql/service_role, este arquivo permanece como plano de
--   execução humana e o gate 1D permanece **NO-GO**.

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

-- S2) Preflight: só faz sentido rodar o smoke se houver ao menos uma regra habilitada
--     para cada event_key ou uma fixture real que possa ser resolvida.
--     Preflight HARD-FAIL: se todos os 3 event_keys tiverem 0 regras habilitadas, o smoke aborta.
DO $preflight$
DECLARE
  v_reg int;
BEGIN
  SELECT count(*) INTO v_reg
    FROM public.comunicacao_regras
   WHERE enabled = true
     AND event_key IN ('administrative_important_update',
                       'produto_pronto_retirada',
                       'produto_pronto_aplicacao');

  IF v_reg = 0 THEN
    RAISE EXCEPTION 'HARNESS_FAIL_PREFLIGHT_no_enabled_rules: nenhum dos event_keys de smoke possui regra enabled=true — retornos vazios do expander não são evidência de correção; gate permanece NO-GO';
  END IF;
END $preflight$;

-- S3) Chamadas reais ao expander com asserts que exigem PELO MENOS 1 recipient/outbox,
--     não apenas jsonb não-nulo. Se v_res for objeto/lista vazia, o assert falha.
DO $smoke$
DECLARE
  v_res jsonb;
  v_osf uuid := (SELECT id FROM public.ordens_servico_onfarm ORDER BY created_at DESC LIMIT 1);

BEGIN
  IF v_osf IS NULL THEN
    RAISE EXCEPTION 'HARNESS_FAIL_PREFLIGHT_no_ordens_servico_onfarm: sem fixture compatível — gate NO-GO';
  END IF;

  -- administrative_important_update
  v_res := public._comunicacao_expand_event(
    gen_random_uuid(),
    'administrative_important_update',
    'administrative_broadcast',
    gen_random_uuid(),
    jsonb_build_object('titulo','Smoke','mensagem','Smoke real','severity','info')
  );
  RAISE NOTICE 'expand administrative_important_update -> %', v_res::text;
  IF v_res IS NULL
     OR (jsonb_typeof(v_res) = 'object' AND v_res = '{}'::jsonb)
     OR (jsonb_typeof(v_res) = 'array'  AND jsonb_array_length(v_res) = 0) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_administrative_important_update: retorno NULL/vazio não prova comportamento';
  END IF;

  -- produto_pronto_retirada (event_key real certificado)
  v_res := public._comunicacao_expand_event(
    gen_random_uuid(),
    'produto_pronto_retirada',
    'ordens_servico_onfarm',
    v_osf,
    jsonb_build_object('numero','SMOKE-1')
  );
  RAISE NOTICE 'expand produto_pronto_retirada -> %', v_res::text;
  IF v_res IS NULL
     OR (jsonb_typeof(v_res) = 'object' AND v_res = '{}'::jsonb)
     OR (jsonb_typeof(v_res) = 'array'  AND jsonb_array_length(v_res) = 0) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_produto_pronto_retirada: retorno NULL/vazio não prova comportamento';
  END IF;

  -- produto_pronto_aplicacao (event_key real certificado)
  v_res := public._comunicacao_expand_event(
    gen_random_uuid(),
    'produto_pronto_aplicacao',
    'ordens_servico_onfarm',
    v_osf,
    jsonb_build_object('numero','SMOKE-2')
  );
  RAISE NOTICE 'expand produto_pronto_aplicacao -> %', v_res::text;
  IF v_res IS NULL
     OR (jsonb_typeof(v_res) = 'object' AND v_res = '{}'::jsonb)
     OR (jsonb_typeof(v_res) = 'array'  AND jsonb_array_length(v_res) = 0) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_produto_pronto_aplicacao: retorno NULL/vazio não prova comportamento';
  END IF;
END $smoke$;

-- S4) Zero resíduo: o expander é read-only por design; contagens devem permanecer iguais.
SELECT
  (SELECT count(*) FROM public.comunicacao_events)              - (SELECT events FROM _pre_counts) AS delta_events,   -- esperado 0
  (SELECT count(*) FROM public.comunicacao_outbox)              - (SELECT outbox FROM _pre_counts) AS delta_outbox,   -- esperado 0
  (SELECT count(*) FROM public.comunicacao_notifications_inapp) - (SELECT inapp  FROM _pre_counts) AS delta_inapp;    -- esperado 0

ROLLBACK;
