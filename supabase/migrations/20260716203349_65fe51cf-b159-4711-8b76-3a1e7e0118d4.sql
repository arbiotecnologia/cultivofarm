
-- =========================================================
-- FASE 12 · Fundação da Visita Técnica (estratégia A)
-- Sem novas tabelas. Apenas colunas e índices ausentes.
-- =========================================================

-- 1) Enum de nível de acesso técnico↔produtor
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_level_tecnico') THEN
    CREATE TYPE public.access_level_tecnico AS ENUM ('read','execute','manage');
  END IF;
END$$;

-- 2) Enum natureza do registro (visita vs. ocorrência)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'natureza_registro_consultor') THEN
    CREATE TYPE public.natureza_registro_consultor AS ENUM ('ocorrencia','visita');
  END IF;
END$$;

-- 3) user_clientes: campos de vínculo técnico
ALTER TABLE public.user_clientes
  ADD COLUMN IF NOT EXISTS is_active     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS access_level  public.access_level_tecnico NOT NULL DEFAULT 'execute',
  ADD COLUMN IF NOT EXISTS assigned_by   uuid,
  ADD COLUMN IF NOT EXISTS valid_from    timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_until   timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by    uuid;

-- Backfill seguro (idempotente)
UPDATE public.user_clientes
   SET is_active = true
 WHERE is_active IS NULL;

-- Índices de vínculo
CREATE INDEX IF NOT EXISTS idx_user_clientes_user_cliente_active
  ON public.user_clientes(user_id, cliente_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_clientes_cliente_active
  ON public.user_clientes(cliente_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_clientes_valid_until
  ON public.user_clientes(valid_until) WHERE valid_until IS NOT NULL;

-- 4) registros_consultor: natureza + campos de conclusão
ALTER TABLE public.registros_consultor
  ADD COLUMN IF NOT EXISTS natureza_registro public.natureza_registro_consultor NOT NULL DEFAULT 'ocorrencia',
  ADD COLUMN IF NOT EXISTS finalized_at      timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by      uuid,
  ADD COLUMN IF NOT EXISTS version           integer NOT NULL DEFAULT 1;

-- Backfill: registros já finalizados recebem finalized_at = updated_at
UPDATE public.registros_consultor
   SET finalized_at = updated_at
 WHERE status IN ('finalizado','aprovado','convertido_os','arquivado')
   AND finalized_at IS NULL;

-- 5) Índices operacionais
CREATE INDEX IF NOT EXISTS idx_registros_consultor_natureza_status
  ON public.registros_consultor(natureza_registro, status);

CREATE INDEX IF NOT EXISTS idx_registros_consultor_cliente_status
  ON public.registros_consultor(cliente_id, status);

CREATE INDEX IF NOT EXISTS idx_registros_consultor_consultor_status
  ON public.registros_consultor(consultor_responsavel, status);

CREATE INDEX IF NOT EXISTS idx_registros_consultor_solicitacao
  ON public.registros_consultor(solicitacao_id) WHERE solicitacao_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visita_diagnosticos_registro
  ON public.visita_diagnosticos(registro_id);

CREATE INDEX IF NOT EXISTS idx_ordens_onfarm_registro_origem
  ON public.ordens_servico_onfarm(registro_consultor_id) WHERE registro_consultor_id IS NOT NULL;
