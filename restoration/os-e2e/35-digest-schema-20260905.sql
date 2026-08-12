-- =====================================================================
-- HARNESS 35 — Hardening de schema do digest() (20260905000000)
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq.
-- Executa em transacao e SEMPRE termina em ROLLBACK: nao persiste nada.
-- Objetivo: provar que as rotinas que falhavam com
--   "function digest(text, unknown) does not exist" voltaram a executar.
-- =====================================================================
\set ON_ERROR_STOP on

BEGIN;

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b5c2ebd4-7cdf-4647-a585-6ec49f1b583a","role":"authenticated"}';

-- Gate 1 — inventario do catalogo: nenhuma funcao de public com digest() cru.
SELECT 'gate1_inventario_catalogo' AS gate,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || string_agg(p.oid::regprocedure::text, ', ') END AS resultado
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc ~ '(^|[^.a-zA-Z_])digest\s*\(';

-- Gate 2 — pgcrypto instalado e alcancavel via schema qualificado.
SELECT 'gate2_pgcrypto_qualificado' AS gate,
       CASE WHEN length(encode(extensions.digest('ar-bio', 'sha256'), 'hex')) = 64
            THEN 'PASS' ELSE 'FAIL' END AS resultado;

-- Gate 3 — geracao de formulario de entrega (caminho que estava quebrado).
WITH alvo AS (
  SELECT id FROM public.entregas WHERE status::text <> 'cancelada'
  ORDER BY created_at DESC LIMIT 1
)
SELECT 'gate3_rpc_gerar_formulario_entrega' AS gate,
       CASE WHEN (public.rpc_gerar_formulario_entrega(alvo.id) ->> 'success') = 'true'
            THEN 'PASS' ELSE 'FAIL' END AS resultado
FROM alvo;

-- Gate 4 — coleta de assinatura digital (recalcula validation_hash).
WITH alvo AS (
  SELECT id FROM public.entregas WHERE status::text <> 'cancelada'
  ORDER BY created_at DESC LIMIT 1
)
SELECT 'gate4_rpc_coletar_assinatura_digital' AS gate,
       CASE WHEN (public.rpc_coletar_assinatura_digital_entrega(
                    alvo.id,
                    jsonb_build_object(
                      'recebedor_nome', 'HARNESS 35',
                      'assinatura_hash', encode(extensions.digest('harness35', 'sha256'), 'hex')
                    )
                  ) ->> 'success') = 'true'
            THEN 'PASS' ELSE 'FAIL' END AS resultado
FROM alvo;

-- Gate 5 — confirmacao de recebimento (recalcula validation_hash).
WITH alvo AS (
  SELECT id FROM public.entregas WHERE status::text <> 'cancelada'
  ORDER BY created_at DESC LIMIT 1
)
SELECT 'gate5_rpc_confirmar_recebimento' AS gate,
       CASE WHEN (public.rpc_confirmar_recebimento_entrega(
                    alvo.id, jsonb_build_object('ressalvas', 'harness 35')
                  ) ->> 'success') = 'true'
            THEN 'PASS' ELSE 'FAIL' END AS resultado
FROM alvo;

-- Gate 6 — hash de validacao gravado tem 64 hex (sha256 integro).
SELECT 'gate6_validation_hash_sha256' AS gate,
       CASE WHEN bool_and(validation_hash ~ '^[0-9a-f]{64}$')
            THEN 'PASS' ELSE 'FAIL' END AS resultado
FROM public.entrega_comprovantes
WHERE validation_hash IS NOT NULL;

ROLLBACK;
