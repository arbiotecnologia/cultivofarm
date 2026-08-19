-- =====================================================================
-- H6c-003 — o guard de faturamento passa a cumprir a própria regra também
--            na entrega INTEGRAL (sem conferência por item).
-- Ambiente: staging ikaauvsflpmamgxmkhoq. Incremental, forward-only.
--
-- Antes: com v_conf = 0 o guard devolvia modo 'legado' e NÃO comparava
-- p_total com o valor canônico. Só fn_generate_receivable_from_entrega
-- validava a paridade, de modo que outro chamador do guard ficaria sem
-- proteção. Agora, se fn_entrega_valor_faturavel_v1 resolver um valor,
-- o guard rejeita p_total acima OU abaixo do canônico além de R$ 0,01.
-- Sem valor canônico resolvível, o modo legado/manual é preservado e o
-- guard não inventa preço.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_entrega_guard_faturamento_v1(p_entrega_id uuid, p_total numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_r public.entrega_reconciliacoes%ROWTYPE;
  v_conf int;
  v_canon jsonb;
  v_max numeric;
  v_canon_valor numeric;
BEGIN
  SELECT count(*)::int INTO v_conf
    FROM public.entrega_conferencia_itens WHERE entrega_id = p_entrega_id;

  v_canon := public.fn_entrega_valor_faturavel_v1(p_entrega_id);

  -- H6C-001: condição comercial pendente/rejeitada/não vinculada bloqueia o
  -- faturamento em qualquer modo, inclusive o manual.
  IF (v_canon->>'origem') = 'bloqueado' THEN
    RAISE EXCEPTION 'condicao_b2b_bloqueada: %', COALESCE(v_canon->>'motivo','indefinido')
      USING ERRCODE='check_violation';
  END IF;

  v_canon_valor := NULLIF(v_canon->>'valor','')::numeric;

  IF v_conf = 0 THEN
    -- H6c-003: entrega integral também é comparada ao canônico, quando existir.
    IF v_canon_valor IS NOT NULL AND p_total IS NOT NULL
       AND abs(p_total - v_canon_valor) > 0.01 THEN
      RAISE EXCEPTION 'valor_divergente_do_canonico: informado=%, canonico=%',
        round(p_total,2), round(v_canon_valor,2) USING ERRCODE='check_violation';
    END IF;
    IF v_canon_valor IS NULL THEN
      -- sem fonte histórica confiável: fluxo legado/manual, o guard não arbitra preço.
      RETURN jsonb_build_object('modo','legado','ratio_aceito',1,'canonico',v_canon);
    END IF;
    RETURN jsonb_build_object('modo','integral_canonico','ratio_aceito',1,
                              'valor_faturavel_max', round(v_canon_valor,2),
                              'canonico', v_canon);
  END IF;

  SELECT * INTO v_r FROM public.entrega_reconciliacoes
   WHERE entrega_id = p_entrega_id AND status = 'reconciliada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entrega_nao_reconciliada: conclua a conferencia e a reconciliacao antes de faturar'
      USING ERRCODE='check_violation';
  END IF;
  IF NOT v_r.faturavel THEN
    RAISE EXCEPTION 'entrega_nao_faturavel: todos os itens foram recusados'
      USING ERRCODE='check_violation';
  END IF;

  v_max := COALESCE(v_r.valor_faturavel_max, v_canon_valor);
  IF v_max IS NOT NULL AND p_total > v_max + 0.01 THEN
    RAISE EXCEPTION 'valor_acima_do_aceito' USING ERRCODE='check_violation';
  END IF;

  RETURN jsonb_build_object('modo', 'reconciliado', 'reconciliacao_id', v_r.id,
                            'ratio_aceito', v_r.ratio_aceito,
                            'valor_faturavel_max', v_max, 'canonico', v_canon);
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) TO authenticated, service_role;
