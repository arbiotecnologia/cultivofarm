-- H7O P4 — Reafirmação idempotente de security_invoker=true nas cinco views protegidas (H7N P0).
-- Escopo: staging ikaauvsflpmamgxmkhoq. Idempotente e reversível
-- (restoration/homologacao-h7/h7o-rollbacks/rollback-20260930030000.sql — apenas para ensaio; reverter
-- security_invoker reabre o achado ERROR do Security Advisor e NÃO deve ser feito fora de ensaio).
--
-- Motivo: migrations versionadas posteriores a H7N (20260908000000_h3_base_tecnica_catalogo_v1 e
-- 20260909000000_h3b_preco_canonico_fichas_v1) recriam vw_catalogo_ficha_produtos e
-- vw_catalogo_ficha_microrganismos com CREATE OR REPLACE VIEW sem WITH (security_invoker=true).
-- Em uma reconstrução completa (ordem cronológica) elas voltariam a SECURITY DEFINER; esta migration,
-- por ter número posterior, garante o estado final. O teste estático
-- src/test/security/protected-views-migration-order.static.test.ts falha se qualquer migration posterior
-- recriar/dropar essas views sem reafirmação subsequente.
--
-- Não altera colunas, grants ou corpo das views (mesmos contratos).
DO $views$
DECLARE
  v_views text[] := ARRAY[
    'vw_os_integridade_esteira',
    'vw_esteira_laboratorio',
    'vw_fluxo_visita_tecnica',
    'vw_catalogo_ficha_produtos',
    'vw_catalogo_ficha_microrganismos'
  ];
  v_name text;
  v_bad  text := '';
BEGIN
  FOREACH v_name IN ARRAY v_views LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = v_name AND c.relkind = 'v'
    ) THEN
      RAISE EXCEPTION 'H7O P4 ABORT: view protegida ausente: public.%', v_name;
    END IF;
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v_name);
  END LOOP;

  SELECT string_agg(c.relname, ',') INTO v_bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname = ANY (v_views)
     AND NOT EXISTS (
       SELECT 1 FROM unnest(coalesce(c.reloptions, '{}'::text[])) o
        WHERE lower(o) IN ('security_invoker=true','security_invoker=on')
     );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'H7O P4 ABORT: security_invoker não confirmado em: %', v_bad;
  END IF;

  -- Informativo (não bloqueante): anon não deve ter SELECT nas views protegidas (estado H7N).
  FOREACH v_name IN ARRAY v_views LOOP
    IF has_table_privilege('anon', format('public.%I', v_name), 'SELECT') THEN
      RAISE WARNING 'H7O P4: anon possui SELECT em public.% (revisar)', v_name;
    END IF;
  END LOOP;
END
$views$;
