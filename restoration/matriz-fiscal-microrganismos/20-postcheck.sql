-- ============================================================================
-- MATRIZ FISCAL MESTRE v1.0 - POSTCHECK (somente leitura)
-- Uso: psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f 20-postcheck.sql
-- Falha (exception) se qualquer invariante de bloqueio for violada.
-- ============================================================================
\set QUIET on

WITH codigos AS (
  SELECT unnest(ARRAY['BAC-1','BAC-2','BAC-3','BAC-4','BAC-5','BAC-6','BAC-7','BAC-8','BAC-9',
                      'BAC-10','BAC-11','BAC-12','BAC-13','BAC-14','BAC-15','BAC-16','BAC-17',
                      'FUN-1','FUN-2','FUN-3','FUN-4','FUN-5','FUN-6','FUN-7','FUN-8','FUN-9',
                      'CON-1']) AS codigo
)
SELECT g.gate, g.valor, g.esperado,
       CASE WHEN g.valor = g.esperado THEN 'PASS' ELSE 'FAIL' END AS resultado
FROM (
  SELECT 'G01 microrganismos da matriz' AS gate,
         (SELECT count(*) FROM public.microrganismos x JOIN codigos c ON c.codigo = x.codigo) AS valor, 27 AS esperado
  UNION ALL SELECT 'G02 perfis ativos DRAFT da carga',
         (SELECT count(*) FROM public.microorganism_fiscal_profiles
           WHERE is_active AND profile_status = 'DRAFT'
             AND accounting_notes LIKE '%[MATRIZ_FISCAL_MESTRE_V1]%'), 27
  UNION ALL SELECT 'G03 perfis VALIDATED (deve ser 0)',
         (SELECT count(*) FROM public.microorganism_fiscal_profiles WHERE profile_status = 'VALIDATED'), 0
  UNION ALL SELECT 'G04 validacao contabil preenchida (deve ser 0)',
         (SELECT count(*) FROM public.microorganism_fiscal_profiles
           WHERE accounting_validated_at IS NOT NULL OR accounting_validated_by IS NOT NULL), 0
  UNION ALL SELECT 'G05 dossies DRAFT',
         (SELECT count(*) FROM public.microorganism_regulatory_dossiers
           WHERE status = 'DRAFT' AND deleted_at IS NULL), 27
  UNION ALL SELECT 'G06 dossies fora de DRAFT (deve ser 0)',
         (SELECT count(*) FROM public.microorganism_regulatory_dossiers
           WHERE status <> 'DRAFT' AND deleted_at IS NULL), 0
  UNION ALL SELECT 'G07 revisoes aprovadas (deve ser 0)',
         (SELECT count(*) FROM public.microorganism_regulatory_dossiers
           WHERE 'APPROVED' IN (technical_review_status, regulatory_review_status, fiscal_review_status)), 0
  UNION ALL SELECT 'G08 published_ncm/cest (deve ser 0)',
         (SELECT count(*) FROM public.microorganism_regulatory_dossiers
           WHERE published_ncm IS NOT NULL OR published_cest IS NOT NULL), 0
  UNION ALL SELECT 'G09 candidatos NCM da carga (27 + 1 alternativo)',
         (SELECT count(*) FROM public.microorganism_ncm_candidates
           WHERE justification LIKE '[MATRIZ_FISCAL_MESTRE_V1]%'), 28
  UNION ALL SELECT 'G10 candidatos aprovados (deve ser 0)',
         (SELECT count(*) FROM public.microorganism_ncm_candidates WHERE status = 'APPROVED'), 0
  UNION ALL SELECT 'G11 apresentacoes 1 L da carga',
         (SELECT count(*) FROM public.microorganism_regulatory_presentations
           WHERE origin_note = 'MATRIZ_FISCAL_MESTRE_V1' AND volume_ml = 1000), 27
  UNION ALL SELECT 'G12 apresentacoes sem GTIN declarado (deve ser 0)',
         (SELECT count(*) FROM public.microorganism_regulatory_presentations
           WHERE origin_note = 'MATRIZ_FISCAL_MESTRE_V1'
             AND (gtin_absent IS NOT TRUE OR nullif(btrim(coalesce(gtin_absent_reason,'')),'') IS NULL)), 0
  UNION ALL SELECT 'G13 checklist decidido (deve ser 0)',
         (SELECT count(*) FROM public.microorganism_regulatory_checklist WHERE state <> 'PENDING'), 0
  UNION ALL SELECT 'G14 CSOSN preenchido em Lucro Presumido (deve ser 0)',
         (SELECT count(*) FROM public.microorganism_fiscal_profiles
           WHERE accounting_notes LIKE '%[MATRIZ_FISCAL_MESTRE_V1]%'
             AND nullif(btrim(coalesce(icms_csosn,'')),'') IS NOT NULL), 0
  UNION ALL SELECT 'G15 CEST preenchido (deve ser 0)',
         (SELECT count(*) FROM public.microorganism_fiscal_profiles
           WHERE accounting_notes LIKE '%[MATRIZ_FISCAL_MESTRE_V1]%'
             AND nullif(btrim(coalesce(cest,'')),'') IS NOT NULL), 0
  UNION ALL SELECT 'G16 residuo BAC-27 ativo (deve ser 0)',
         (SELECT count(*) FROM public.microrganismos
           WHERE codigo = 'BAC-27' AND (ativo IS TRUE OR b2b_enabled IS TRUE)), 0
  UNION ALL SELECT 'G17 emitente produtivo (deve ser 0)',
         (SELECT count(*) FROM public.company_fiscal_settings
           WHERE coalesce(production_enabled,false) IS TRUE
              OR upper(coalesce(fiscal_environment,'')) = 'PRODUCTION'
              OR coalesce(nfe_environment_code,'') = '1'), 0
  UNION ALL SELECT 'G18 itens da matriz prontos para faturar (deve ser 0)',
         (SELECT count(*) FROM public.microrganismos x
            JOIN codigos c ON c.codigo = x.codigo
            JOIN public.microorganism_fiscal_profiles p
              ON p.microorganism_id = x.id AND p.is_active
           WHERE p.profile_status = 'VALIDATED' AND p.accounting_validated_at IS NOT NULL), 0
) g
ORDER BY g.gate;
