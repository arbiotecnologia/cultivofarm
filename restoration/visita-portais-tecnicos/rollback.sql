-- ============================================================================
-- ROLLBACK LÓGICO — Fluxo unificado de atendimento técnico
-- Ambiente: staging ikaauvsflpmamgxmkhoq (produção navfzbwgwzruipouyfnk PROIBIDA)
-- Forward-safe: remove apenas os objetos introduzidos pela fase.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.rpc_resumo_atendimentos_tecnicos_v1();
DROP FUNCTION IF EXISTS public.rpc_listar_atendimentos_tecnicos_v1(text,text,integer,integer);
DROP FUNCTION IF EXISTS public.rpc_iniciar_atendimento_solicitacao_v1(uuid,uuid);

-- Motor canônico: volta à assinatura anterior (11 argumentos)
DROP FUNCTION IF EXISTS public.rpc_criar_visita_idempotente(
  uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid,
  text,categoria_problema_consultor,nivel_pressao,numeric,urgencia_consultor,
  text,text,text,numeric,numeric,numeric,uuid);

-- ATENÇÃO: recriar a versão anterior a partir do backup de definição antes de
-- considerar o rollback concluído (o motor é usado pelo sync offline).

DROP INDEX IF EXISTS public.idx_registros_consultor_origem;
DROP INDEX IF EXISTS public.idx_registros_consultor_resp_status;
DROP INDEX IF EXISTS public.idx_portal_solicitacoes_consultor_status;

ALTER TABLE public.registros_consultor
  DROP CONSTRAINT IF EXISTS registros_consultor_origem_atendimento_chk;
ALTER TABLE public.registros_consultor
  DROP COLUMN IF EXISTS origem_atendimento;

COMMIT;
