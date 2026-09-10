-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260729015203_motor_b2b_fase0_2_drop_evidence_table.sql
-- SHA-256 orig: 7c717be73595fc60de3103d5d5f19f12281aa4018dec89a0ba0ece8b2ca391b3
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-sql.py
-- Transformação: 1 bloco(s) DO de guarda removido(s); guarda canônica de promoção prefixada
--
-- A guarda de homologação foi REMOVIDA e substituída pela guarda canônica de
-- promoção. O runner valida o ref do alvo por canal externo (API/DSN) e só
-- então executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela
-- marcadora de homologação é consultada em produção.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- STAGING_GUARD normalizado (portatil / forward-only):
-- recusa apenas ambiente comprovadamente de PRODUCAO. Em banco novo (marker ausente)
-- a migration segue adiante, tornando o replay reprodutivel fora deste projeto.
-- [guarda de homologação removida pelo gerador de promoção]


DROP TABLE IF EXISTS public._motor_b2b_fase0_2_evidence;