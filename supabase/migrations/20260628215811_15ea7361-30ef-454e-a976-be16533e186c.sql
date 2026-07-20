
CREATE TABLE public.partner_order_sla_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fase text NOT NULL UNIQUE CHECK (fase IN ('planejamento','em_producao','produzido','cq','envase','entrega')),
  prazo_horas integer NOT NULL CHECK (prazo_horas > 0),
  ativo boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_order_sla_config TO authenticated;
GRANT ALL ON public.partner_order_sla_config TO service_role;

ALTER TABLE public.partner_order_sla_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sla_select_staff" ON public.partner_order_sla_config
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'administrador') OR
    public.has_role(auth.uid(),'gestor') OR
    public.has_role(auth.uid(),'gestor_comercial') OR
    public.has_role(auth.uid(),'producao') OR
    public.has_role(auth.uid(),'administrativo')
  );

CREATE POLICY "sla_modify_admin" ON public.partner_order_sla_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER trg_sla_config_updated_at
  BEFORE UPDATE ON public.partner_order_sla_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.partner_order_sla_config (fase, prazo_horas) VALUES
  ('planejamento', 24),('em_producao', 72),('produzido', 24),
  ('cq', 24),('envase', 24),('entrega', 72)
ON CONFLICT (fase) DO NOTHING;

CREATE OR REPLACE FUNCTION public.partner_order_sla_status(p_order_id uuid)
RETURNS TABLE(fase text, fase_inicio timestamptz, horas_decorridas numeric, prazo_horas integer, atrasada boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order RECORD; v_planning RECORD; v_fase text; v_inicio timestamptz;
BEGIN
  SELECT po.id, po.status, po.approved_at INTO v_order
    FROM partner_orders po WHERE po.id = p_order_id;
  IF NOT FOUND OR v_order.approved_at IS NULL THEN RETURN; END IF;

  SELECT pp.status, pp.updated_at INTO v_planning
    FROM production_planning pp WHERE pp.partner_order_id = p_order_id
    ORDER BY pp.created_at DESC LIMIT 1;

  IF v_planning.status = 'entregue' THEN RETURN; END IF;
  IF v_planning.status = 'produzido' THEN v_fase := 'entrega';
  ELSIF v_planning.status = 'em_producao' THEN v_fase := 'em_producao';
  ELSE v_fase := 'planejamento';
  END IF;

  SELECT MAX(event_at) INTO v_inicio
    FROM production_timeline_events
    WHERE partner_order_id = p_order_id
      AND event_type = CASE v_fase
        WHEN 'planejamento' THEN 'planejamento_criado'
        WHEN 'em_producao' THEN 'producao_iniciada'
        WHEN 'entrega' THEN 'envase_concluido'
        ELSE event_type END;

  IF v_inicio IS NULL THEN
    v_inicio := COALESCE(v_planning.updated_at, v_order.approved_at);
  END IF;

  RETURN QUERY
  SELECT v_fase, v_inicio,
         EXTRACT(EPOCH FROM (now() - v_inicio))/3600.0,
         c.prazo_horas,
         c.ativo AND EXTRACT(EPOCH FROM (now() - v_inicio))/3600.0 > c.prazo_horas
    FROM partner_order_sla_config c WHERE c.fase = v_fase;
END; $$;

GRANT EXECUTE ON FUNCTION public.partner_order_sla_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_partner_order_sla()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; s RECORD; v_dedupe text;
BEGIN
  FOR r IN
    SELECT po.id, po.numero, pa.nome_fantasia AS partner_nome
      FROM partner_orders po
      JOIN partner_accounts pa ON pa.id = po.partner_id
     WHERE po.status = 'aprovado' AND po.approved_at IS NOT NULL
  LOOP
    SELECT * INTO s FROM partner_order_sla_status(r.id);
    IF NOT FOUND OR NOT s.atrasada THEN CONTINUE; END IF;
    v_dedupe := 'sla_b2b:' || r.id || ':' || s.fase;
    INSERT INTO alertas_operacionais (
      tipo, origem, titulo, descricao, gravidade, status,
      referencia_tabela, referencia_id, chave_dedupe, metadata
    ) VALUES (
      'sla_pedido_b2b','sistema',
      'SLA estourado · ' || r.numero,
      'Pedido ' || r.numero || ' (' || r.partner_nome || ') está há ' ||
        ROUND(s.horas_decorridas,1) || 'h na fase ' || s.fase ||
        ' (limite ' || s.prazo_horas || 'h).',
      'alta','aberto','partner_orders', r.id, v_dedupe,
      jsonb_build_object('fase', s.fase, 'horas', s.horas_decorridas, 'prazo', s.prazo_horas)
    ) ON CONFLICT (chave_dedupe) DO NOTHING;
  END LOOP;
END; $$;

DO $$ BEGIN
  PERFORM cron.unschedule('check-partner-order-sla');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('check-partner-order-sla','*/30 * * * *',
  $cron$ SELECT public.check_partner_order_sla(); $cron$);
