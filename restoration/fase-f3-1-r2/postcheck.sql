-- =====================================================================
-- FASE F3.1-R2 — POSTCHECK ESTRUTURAL + COMPORTAMENTAL + ACL (T54)
-- STAGING ikaauvsflpmamgxmkhoq. Producao PROIBIDA.
-- Executa em transacao unica REVERTIDA: nao altera dados reais.
-- Uso: psql "$STAGING_DSN" -X -v ON_ERROR_STOP=1 -f postcheck.sql
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

DO $g$
DECLARE v text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD: ambiente nao identificado';
  END IF;
  SELECT project_ref INTO v FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'GUARD: somente staging ikaauvsflpmamgxmkhoq (ref=%)', left(coalesce(v,'?'),4)||'****';
  END IF;
END $g$;

CREATE TEMP TABLE _r2_gates(id text primary key, ok boolean, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.gate(p_id text, p_ok boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO _r2_gates VALUES (p_id, p_ok, p_detail);
  IF NOT p_ok THEN RAISE EXCEPTION 'GATE % FAIL: %', p_id, p_detail; END IF;
END $$;

-- ---------------------------------------------------------------- R2-01..05
-- Estrutural: helper existe, SECURITY DEFINER, search_path fixo, sem grants.
DO $$
DECLARE d text; a aclitem[];
BEGIN
  SELECT pg_get_functiondef(p.oid), p.proacl INTO d, a
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_fiscal_assert_environment_homologation';

  PERFORM pg_temp.gate('R2-01', d IS NOT NULL, 'helper presente');
  PERFORM pg_temp.gate('R2-02', d LIKE '%SECURITY DEFINER%' AND d LIKE '%search_path%', 'definer + search_path fixo');
  PERFORM pg_temp.gate('R2-03', a IS NOT NULL, 'ACL explicita (nao default PUBLIC)');
  PERFORM pg_temp.gate('R2-04',
    NOT has_function_privilege('anon','public.fn_fiscal_assert_environment_homologation()','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.fn_fiscal_assert_environment_homologation()','EXECUTE'),
    'sem EXECUTE para anon/authenticated');
  PERFORM pg_temp.gate('R2-05',
    NOT EXISTS (SELECT 1 FROM aclexplode(a) x WHERE x.grantee = 0),
    'sem EXECUTE para PUBLIC (grantee=0)');
END $$;

-- ---------------------------------------------------------------- R2-06..10
-- Comportamental: ausencia, multiplicidade, NULL/invalido, tpAmb=1, tpAmb=2.
-- Todas as mutacoes ocorrem dentro desta transacao revertida.
DO $$
DECLARE err text; v_id uuid;
BEGIN
  -- (06) ausencia de emitente ativo -> FISCAL_EMITTER_NOT_CONFIGURED
  UPDATE public.company_fiscal_settings SET is_active = false WHERE is_active;
  BEGIN
    PERFORM public.fn_fiscal_assert_environment_homologation();
    err := '<sem erro>';
  EXCEPTION WHEN OTHERS THEN err := SQLERRM;
  END;
  PERFORM pg_temp.gate('R2-06', err LIKE 'FISCAL_EMITTER_NOT_CONFIGURED:%', coalesce(left(err,80),''));
END $$;

DO $$
DECLARE err text; src public.company_fiscal_settings%ROWTYPE;
BEGIN
  -- reativa exatamente um emitente com tpAmb=2 (fixture na transacao)
  SELECT * INTO src FROM public.company_fiscal_settings ORDER BY updated_at DESC LIMIT 1;
  UPDATE public.company_fiscal_settings
     SET is_active = true, nfe_environment_code = '2'
   WHERE id = src.id;
  BEGIN
    PERFORM public.fn_fiscal_assert_environment_homologation();
    err := '<sem erro>';
  EXCEPTION WHEN OTHERS THEN err := SQLERRM;
  END;
  -- (10) tpAmb=2 e' o unico caso aceito
  PERFORM pg_temp.gate('R2-10', err = '<sem erro>', coalesce(left(err,120),''));

  -- (08) tpAmb NULL -> FISCAL_ENVIRONMENT_INVALID
  UPDATE public.company_fiscal_settings SET nfe_environment_code = NULL WHERE id = src.id;
  BEGIN PERFORM public.fn_fiscal_assert_environment_homologation(); err := '<sem erro>';
  EXCEPTION WHEN OTHERS THEN err := SQLERRM; END;
  PERFORM pg_temp.gate('R2-08a', err LIKE 'FISCAL_ENVIRONMENT_INVALID:%', coalesce(left(err,80),''));

  -- (08b) tpAmb fora do dominio -> FISCAL_ENVIRONMENT_INVALID
  UPDATE public.company_fiscal_settings SET nfe_environment_code = '9' WHERE id = src.id;
  BEGIN PERFORM public.fn_fiscal_assert_environment_homologation(); err := '<sem erro>';
  EXCEPTION WHEN OTHERS THEN err := SQLERRM; END;
  PERFORM pg_temp.gate('R2-08b', err LIKE 'FISCAL_ENVIRONMENT_INVALID:%', coalesce(left(err,80),''));

  -- (09) tpAmb=1 -> FISCAL_PRODUCTION_BLOCKED
  UPDATE public.company_fiscal_settings SET nfe_environment_code = '1' WHERE id = src.id;
  BEGIN PERFORM public.fn_fiscal_assert_environment_homologation(); err := '<sem erro>';
  EXCEPTION WHEN OTHERS THEN err := SQLERRM; END;
  PERFORM pg_temp.gate('R2-09', err LIKE 'FISCAL_PRODUCTION_BLOCKED:%', coalesce(left(err,80),''));
END $$;

DO $$
DECLARE err text; src public.company_fiscal_settings%ROWTYPE; n integer;
BEGIN
  -- (07) multiplicidade -> FISCAL_EMITTER_AMBIGUOUS
  SELECT count(*) INTO n FROM public.company_fiscal_settings;
  SELECT * INTO src FROM public.company_fiscal_settings WHERE is_active LIMIT 1;
  UPDATE public.company_fiscal_settings SET nfe_environment_code = '2' WHERE id = src.id;
  IF n > 1 THEN
    UPDATE public.company_fiscal_settings SET is_active = true;
  ELSE
    INSERT INTO public.company_fiscal_settings (id, is_active, nfe_environment_code)
    VALUES (gen_random_uuid(), true, '2');
  END IF;
  BEGIN PERFORM public.fn_fiscal_assert_environment_homologation(); err := '<sem erro>';
  EXCEPTION WHEN OTHERS THEN err := SQLERRM; END;
  PERFORM pg_temp.gate('R2-07', err LIKE 'FISCAL_EMITTER_AMBIGUOUS:%', coalesce(left(err,80),''));
END $$;

-- ---------------------------------------------------------------- T54 (R2-11..13)
-- Prova de ACL por catalogo: proacl/aclexplode + information_schema.
DO $$
DECLARE bad text;
BEGIN
  -- PUBLIC efetivo: proacl NULL (default = PUBLIC EXECUTE) ou grantee=0.
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'rpc_fiscal%'
     AND (p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0));
  PERFORM pg_temp.gate('R2-11', bad IS NULL, 'PUBLIC com EXECUTE em: '||coalesce(bad,''));

  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'rpc_fiscal%'
     AND EXISTS (SELECT 1 FROM aclexplode(p.proacl) x
                  WHERE x.grantee = 'anon'::regrole::oid AND x.privilege_type='EXECUTE');
  PERFORM pg_temp.gate('R2-12', bad IS NULL, 'anon com EXECUTE em: '||coalesce(bad,''));

  -- information_schema.routine_privileges como segunda fonte independente.
  SELECT string_agg(DISTINCT rp.routine_name, ', ') INTO bad
    FROM information_schema.routine_privileges rp
   WHERE rp.specific_schema='public'
     AND rp.routine_name LIKE 'rpc_fiscal%'
     AND rp.grantee IN ('PUBLIC','anon')
     AND rp.privilege_type='EXECUTE';
  PERFORM pg_temp.gate('R2-13', bad IS NULL, 'routine_privileges PUBLIC/anon: '||coalesce(bad,''));

  -- funcoes de trigger fiscais tambem sem PUBLIC/anon
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_type t ON t.oid=p.prorettype
   WHERE n.nspname='public' AND t.typname='trigger' AND p.proname LIKE 'tg_fiscal%'
     AND (p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x
                      WHERE x.grantee IN (0, 'anon'::regrole::oid)));
  PERFORM pg_temp.gate('R2-14', bad IS NULL, 'tg_fiscal com PUBLIC/anon: '||coalesce(bad,''));
END $$;

-- ---------------------------------------------------------------- R2-15
-- Integridade: nenhum trigger fiscal desabilitado.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND NOT t.tgisinternal AND t.tgenabled = 'D';
  PERFORM pg_temp.gate('R2-15', n = 0, 'triggers desabilitados='||n);
END $$;

SELECT id, ok, detail FROM _r2_gates ORDER BY id;
SELECT count(*) FILTER (WHERE ok) AS pass, count(*) FILTER (WHERE NOT ok) AS fail, count(*) AS total FROM _r2_gates;

ROLLBACK;
