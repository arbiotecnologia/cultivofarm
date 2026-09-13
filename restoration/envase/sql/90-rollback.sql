-- ROLLBACK EXATO do hardening de Envase (20260913060000_envase_hardening.sql).
--
-- ATENÇÃO: executar este script REABRE O RISCO. Ele devolve a escrita direta em
-- public.envase a anon e authenticated (contornando a RPC canônica), retira as
-- constraints de integridade, permite quantidade/volume nulos e recria o gatilho
-- trg_envase_avanca_os, que avança a OS para pronto_entrega já no primeiro INSERT,
-- inclusive quando o envase é parcial. Use SOMENTE em incidente, por decisão
-- explícita e com nova homologação em seguida.
--
-- Compatível com o SQL Editor (sem metacomandos psql). Não altera RLS nem policies.
-- Restaura exatamente o estado anterior documentado.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE public.envase IN ACCESS EXCLUSIVE MODE;

-- 1. Constraints (nomes exatos do estado aplicado).
ALTER TABLE public.envase DROP CONSTRAINT IF EXISTS envase_embalagem_volume_coerente;
ALTER TABLE public.envase DROP CONSTRAINT IF EXISTS envase_volume_valido;
ALTER TABLE public.envase DROP CONSTRAINT IF EXISTS envase_quantidade_positiva;

-- 2. Obrigatoriedade das colunas.
ALTER TABLE public.envase ALTER COLUMN quantidade DROP NOT NULL;
ALTER TABLE public.envase ALTER COLUMN volume_por_unidade DROP NOT NULL;

-- 3. Gatilho legado de avanço automático da OS.
DO $t$
BEGIN
  IF to_regprocedure('public.fn_envase_avanca_os()') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_ENVASE_FUNCAO_AUSENTE: public.fn_envase_avanca_os() não existe';
  END IF;
END $t$;

DROP TRIGGER IF EXISTS trg_envase_avanca_os ON public.envase;
CREATE TRIGGER trg_envase_avanca_os
  AFTER INSERT ON public.envase
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_envase_avanca_os();

-- 4. Grants anteriores (escrita direta reaberta — este é o risco).
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.envase TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.envase TO authenticated;

COMMIT;
