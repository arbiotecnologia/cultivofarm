CREATE OR REPLACE FUNCTION public.fn_entrega_build_snapshot_v1(p_entrega_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sessao_invalida' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(public.is_delivery_staff(auth.uid()), false) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'template_versao', 'termo-entrega-v1',
    'gerado_em', now(),
    'entrega', to_jsonb(e),
    'cliente', (SELECT to_jsonb(c) FROM public.clientes c WHERE c.id = e.cliente_id),
    'ordem_servico', (SELECT to_jsonb(o) FROM public.ordens_servico o WHERE o.id = e.ordem_servico_id),
    'ordem_servico_onfarm', (SELECT to_jsonb(o) FROM public.ordens_servico_onfarm o WHERE o.id = e.ordem_servico_onfarm_id),
    'pedido_b2b', (SELECT to_jsonb(po) FROM public.partner_orders po WHERE po.id = e.partner_order_id),
    'comprovante', (SELECT to_jsonb(cp) FROM public.entrega_comprovantes cp WHERE cp.id = e.comprovante_id),
    'entregador', jsonb_build_object(
      'motorista', e.motorista, 'documento', e.motorista_documento,
      'telefone', e.motorista_telefone, 'veiculo', e.veiculo,
      'placa', e.veiculo_placa, 'tipo', e.veiculo_tipo),
    'destino', jsonb_build_object(
      'destinatario', e.destinatario_nome, 'telefone', e.destinatario_telefone,
      'logradouro', e.endereco_logradouro, 'numero', e.endereco_numero,
      'complemento', e.endereco_complemento, 'bairro', e.endereco_bairro,
      'cidade', e.endereco_cidade, 'uf', e.endereco_uf, 'cep', e.endereco_cep,
      'referencia', e.endereco_referencia, 'origem', e.endereco_origem),
    'recebedor', jsonb_build_object(
      'nome', e.recebedor_nome, 'documento', e.recebedor_documento,
      'cargo', e.recebedor_cargo, 'telefone', e.recebedor_telefone),
    'itens', coalesce((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'etiqueta', to_jsonb(pe),
        'embalagem', (SELECT to_jsonb(eb) FROM public.estoque_embalagens eb WHERE eb.id = pe.embalagem_id),
        'lote', (SELECT to_jsonb(l) FROM public.lotes l WHERE l.id = pe.lote_id),
        'produto', (SELECT to_jsonb(pr) FROM public.produtos pr WHERE pr.id = pe.produto_id),
        'conferencia', (SELECT to_jsonb(ci) FROM public.entrega_conferencia_itens ci
                        WHERE ci.entrega_id = p_entrega_id AND ci.etiqueta_id = pe.id)
      )) ORDER BY pe.id)
      FROM public.entrega_etiquetas ee
      JOIN public.produto_etiquetas pe ON pe.id = ee.etiqueta_id
      WHERE ee.entrega_id = p_entrega_id AND ee.ativo
    ), '[]'::jsonb),
    'checklist', coalesce((SELECT jsonb_agg(to_jsonb(ck) ORDER BY ck.id)
                           FROM public.entrega_checklist ck WHERE ck.entrega_id = p_entrega_id), '[]'::jsonb),
    'ocorrencias', coalesce((SELECT jsonb_agg(to_jsonb(oc) ORDER BY oc.id)
                             FROM public.entrega_ocorrencias oc WHERE oc.entrega_id = p_entrega_id), '[]'::jsonb),
    'divergencias', coalesce((
      SELECT jsonb_agg(jsonb_build_object('etiqueta_id', ci.etiqueta_id, 'status', ci.status,
                                          'quantidade', ci.quantidade, 'motivo', ci.motivo) ORDER BY ci.id)
      FROM public.entrega_conferencia_itens ci
      WHERE ci.entrega_id = p_entrega_id AND ci.status <> 'aceito'), '[]'::jsonb)
  ))
  INTO v
  FROM public.entregas e
  WHERE e.id = p_entrega_id;

  IF v IS NULL THEN
    RAISE EXCEPTION 'entrega_nao_encontrada' USING ERRCODE = 'raise_exception';
  END IF;
  RETURN v;
END $function$
