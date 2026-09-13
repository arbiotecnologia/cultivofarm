-- ROLLBACK do hardening de Envase (20260913060000_envase_hardening.sql).
-- Uso apenas em incidente: reverte constraints e grants. NÃO recria o gatilho legado
-- trg_envase_avanca_os, que avançava a OS para pronto_entrega mesmo em envase parcial;
-- sua recriação exigiria decisão explícita e nova homologação.
-- Compatível com o SQL Editor: sem metacomandos psql. Não altera RLS nem policies.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.envase DROP CONSTRAINT IF EXISTS envase_embalagem_volume_coerente;
ALTER TABLE public.envase DROP CONSTRAINT IF EXISTS envase_volume_unitario_positivo;
ALTER TABLE public.envase DROP CONSTRAINT IF EXISTS envase_quantidade_positiva;

-- Restauração do acesso anterior (somente se houver decisão de reverter a ACL).
-- Mantido comentado de propósito: reabrir escrita direta na tabela derruba a
-- exigência de passar pela RPC canônica.
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.envase TO authenticated;
-- GRANT SELECT ON TABLE public.envase TO anon;

COMMIT;
