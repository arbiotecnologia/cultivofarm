-- ============================================================================
-- PREPARADO — NÃO APLICADO
-- RPC atômica de reagendamento da Agenda Técnica.
--
-- Motivo: hoje o front-end atualiza `portal_solicitacoes` e grava
-- `visitas_logs` em duas chamadas separadas. Mesmo com a ordem corrigida
-- (update -> log -> sync externo), o log continua sendo best-effort.
-- Esta RPC coloca as duas escritas na mesma transação, com autenticação,
-- autorização por perfil/atribuição e validação de data/horário no servidor.
--
-- Aplicar apenas de forma coordenada (migration forward-only). Após aplicar
-- e regenerar os tipos, trocar o corpo de `moveMutation` em
-- src/pages/AgendaTecnica.tsx por:
--   supabase.rpc("rpc_reagendar_visita_v1", {
--     p_solicitacao_id: id, p_nova_data: newDate.toISOString(),
--   })
-- mantendo a sincronização externa best-effort somente após sucesso.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_reagendar_visita_v1(
  p_solicitacao_id uuid,
  p_nova_data timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_sol public.portal_solicitacoes%ROWTYPE;
  v_hora numeric;
  v_is_manager boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;

  IF p_nova_data IS NULL THEN
    RAISE EXCEPTION 'DATA_INVALIDA' USING ERRCODE = '22007';
  END IF;

  -- Faixa da agenda: 07:00 às 19:00 no fuso operacional.
  v_hora := EXTRACT(HOUR FROM (p_nova_data AT TIME ZONE 'America/Sao_Paulo'))
          + EXTRACT(MINUTE FROM (p_nova_data AT TIME ZONE 'America/Sao_Paulo')) / 60.0;
  IF v_hora < 7 OR v_hora > 19 THEN
    RAISE EXCEPTION 'HORARIO_FORA_DA_AGENDA' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sol
  FROM public.portal_solicitacoes
  WHERE id = p_solicitacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOLICITACAO_NAO_ENCONTRADA' USING ERRCODE = 'P0002';
  END IF;

  IF v_sol.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'STATUS_NAO_REAGENDAVEL' USING ERRCODE = '23514';
  END IF;

  v_is_manager := public.has_role(v_uid, 'administrador') OR public.has_role(v_uid, 'gestor');

  IF NOT v_is_manager AND v_sol.consultor_atribuido IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_REAGENDAR' USING ERRCODE = '42501';
  END IF;

  UPDATE public.portal_solicitacoes
     SET data_prevista_atendimento = p_nova_data,
         confirmacao_produtor = 'pendente',
         updated_at = now()
   WHERE id = p_solicitacao_id;

  INSERT INTO public.visitas_logs (solicitacao_id, acao, descricao, usuario_id)
  VALUES (
    p_solicitacao_id,
    'reagendamento',
    'Reagendado via agenda para ' || to_char(p_nova_data AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    v_uid
  );

  RETURN jsonb_build_object(
    'solicitacao_id', p_solicitacao_id,
    'data_prevista_atendimento', p_nova_data,
    'confirmacao_produtor', 'pendente'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_reagendar_visita_v1(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reagendar_visita_v1(uuid, timestamptz) TO authenticated, service_role;

COMMIT;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.rpc_reagendar_visita_v1(uuid, timestamptz);
