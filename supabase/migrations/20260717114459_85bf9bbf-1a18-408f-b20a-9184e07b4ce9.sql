
-- Fase 12.8 · Fase 3 · Correção 5: helper de presença robusto por participante

CREATE OR REPLACE FUNCTION public.has_completed_visit_presence(p_registro_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_participantes integer;
  v_completos integer;
BEGIN
  IF p_registro_id IS NULL THEN
    RETURN false;
  END IF;

  -- Participantes: técnicos com pelo menos um evento válido (não inconsistente)
  SELECT COUNT(DISTINCT consultor_id) INTO v_total_participantes
    FROM public.visitas_checkin
    WHERE registro_consultor_id = p_registro_id
      AND status <> 'inconsistente'::public.status_checkin;

  IF v_total_participantes = 0 THEN
    RETURN false;
  END IF;

  -- Ciclo completo por participante:
  --  (a) existe ao menos uma entrada (tipo <> checkout) válida;
  --  (b) último evento (ordem determinística) é checkout;
  --  (c) o checkout ocorre após a última entrada;
  --  (d) não há evento ativo posterior ao checkout.
  WITH eventos AS (
    SELECT
      consultor_id,
      tipo_checkin,
      data_hora_checkin,
      created_at,
      id,
      status
    FROM public.visitas_checkin
    WHERE registro_consultor_id = p_registro_id
      AND status <> 'inconsistente'::public.status_checkin
  ),
  ultimo AS (
    SELECT DISTINCT ON (consultor_id)
      consultor_id, tipo_checkin, data_hora_checkin
    FROM eventos
    ORDER BY consultor_id,
             data_hora_checkin DESC,
             created_at DESC,
             id DESC
  ),
  ultima_entrada AS (
    SELECT consultor_id, MAX(data_hora_checkin) AS dt_entrada
    FROM eventos
    WHERE tipo_checkin <> 'checkout'::public.tipo_checkin
    GROUP BY consultor_id
  )
  SELECT COUNT(*) INTO v_completos
    FROM ultimo u
    JOIN ultima_entrada e ON e.consultor_id = u.consultor_id
    WHERE u.tipo_checkin = 'checkout'::public.tipo_checkin
      AND u.data_hora_checkin > e.dt_entrada;

  RETURN v_completos = v_total_participantes;
END;
$$;

REVOKE ALL ON FUNCTION public.has_completed_visit_presence(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_completed_visit_presence(uuid) TO service_role;
