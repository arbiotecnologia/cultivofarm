-- =====================================================================
-- Fase C9 — Fixtures fiscais EXCLUSIVAS DE HOMOLOGAÇÃO
-- =====================================================================
-- Projeto canônico obrigatório: swzpzcwiasxmjutrmvkm
--
-- Características obrigatórias:
--   * Todas as regras usam rule_key com prefixo 'HML_' (identificação
--     inequívoca de fixture de homologação).
--   * Fundamento legal e justificativa declaram "AMBIENTE DE HOMOLOGAÇÃO
--     — SEM VALOR FISCAL".
--   * Bloqueio fail-closed: o script aborta se o marcador de ambiente
--     indicar produção ou se a emissão de produção estiver liberada.
--   * Execução padrão em transação com ROLLBACK ao final. Para persistir
--     em homologação, troque a última linha por COMMIT de forma
--     deliberada e registrada.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_ref text;
  v_prod boolean;
BEGIN
  SELECT current_setting('request.jwt.claims', true) INTO v_ref; -- no-op defensivo

  SELECT project_ref, production_emission_allowed
    INTO v_ref, v_prod
    FROM public.fiscal_environment_marker
   LIMIT 1;

  IF FOUND THEN
    IF v_ref IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN
      RAISE EXCEPTION 'Fixture bloqueada: projeto % não é o canônico', v_ref;
    END IF;
    IF COALESCE(v_prod, false) THEN
      RAISE EXCEPTION 'Fixture bloqueada: emissão de produção habilitada';
    END IF;
  END IF;
END $$;

-- Fonte oficial sintética de homologação -------------------------------
INSERT INTO public.fiscal_official_sources (source_key, authority, name, url, doc_version, consulted_at, notes, is_active)
SELECT 'HML_2026', 'HOMOLOGACAO',
       'HOMOLOGAÇÃO — fonte sintética sem valor fiscal',
       'https://homologacao.invalid/sem-valor-fiscal', 'HML-1', CURRENT_DATE,
       'AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.fiscal_official_sources WHERE source_key = 'HML_2026'
);

-- Regras de homologação -------------------------------------------------
WITH src AS (
  SELECT id FROM public.fiscal_official_sources WHERE source_key = 'HML_2026' LIMIT 1
), adm AS (
  SELECT ur.user_id FROM public.user_roles ur WHERE ur.role::text = 'administrador' LIMIT 1
)
INSERT INTO public.fiscal_tax_rules (
  rule_key, version, tax_kind, calc_mode, crt, origin_uf, destination_uf,
  cst, rate, base_reduction_mode, base_reduction_pct, legal_basis,
  legal_version, source_id, justification, priority, status,
  published_by, published_at
)
SELECT r.rule_key, 1, r.tax_kind, 'PERCENT', r.crt, 'SP', r.dest_uf,
       r.cst, r.rate, r.mode, r.red_pct,
       'AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL',
       'HML-1', src.id,
       'Fixture sintética de homologação, sem valor fiscal, criada para testes do motor de redução de base.',
       10, 'PUBLISHED', adm.user_id, now()
  FROM (VALUES
    ('HML_ICMS_SP_RED60', 'ICMS',   '3', 'SP', '20', 18.0::numeric, 'FIXED', 60.0::numeric),
    ('HML_ICMS_SP_PLENO', 'ICMS',   '3', 'SP', '00', 18.0,          'NONE',  NULL::numeric),
    ('HML_PIS_NAC',       'PIS',    NULL, NULL, '01',  1.65,        'NONE',  NULL),
    ('HML_COFINS_NAC',    'COFINS', NULL, NULL, '01',  7.60,        'NONE',  NULL)
  ) AS r(rule_key, tax_kind, crt, dest_uf, cst, rate, mode, red_pct)
  CROSS JOIN src CROSS JOIN adm
 WHERE NOT EXISTS (
   SELECT 1 FROM public.fiscal_tax_rules f WHERE f.rule_key = r.rule_key AND f.version = 1
 );

SELECT rule_key, tax_kind, cst, rate, base_reduction_mode, base_reduction_pct, status
  FROM public.fiscal_tax_rules
 WHERE rule_key LIKE 'HML\_%'
 ORDER BY rule_key;

-- ROLLBACK padrão: nada é persistido nesta execução.
ROLLBACK;
