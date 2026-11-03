CREATE OR REPLACE FUNCTION public.fn_comprovante_entrega_montar_v1(p_entrega_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  e            public.entregas%ROWTYPE;
  v_emitente   jsonb;
  v_destino    jsonb;
  v_os         jsonb;
  v_itens      jsonb;
  v_transporte jsonb;
  v_receb      jsonb;
BEGIN
  PERFORM public.h15_require_staff();

  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'COMPROVANTE_UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT coalesce(public.is_delivery_staff(auth.uid()),false) THEN RAISE EXCEPTION 'COMPROVANTE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO e FROM public.entregas WHERE id = p_entrega_id;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_ENTREGA_NAO_ENCONTRADA';
  END IF;

  SELECT jsonb_build_object(
           'razao_social', cs.legal_name,
           'nome_fantasia', cs.trade_name,
           'cnpj', cs.cnpj,
           'inscricao_estadual', cs.state_registration,
           'email', cs.fiscal_email,
           'telefone', cs.phone,
           'logradouro', cs.street,
           'numero', cs.number,
           'complemento', cs.complement,
           'bairro', cs.neighborhood,
           'cidade', cs.city,
           'uf', cs.state,
           'cep', cs.postal_code
         )
    INTO v_emitente
    FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) cs
   WHERE cs.is_active
   ORDER BY cs.updated_at DESC NULLS LAST
   LIMIT 1;

  SELECT jsonb_build_object(
           'cliente_id', c.id,
           'nome', coalesce(nullif(btrim(c.razao_social), ''), c.nome),
           'nome_fantasia', c.nome_fantasia,
           'cpf_cnpj', c.cpf_cnpj,
           'telefone', coalesce(nullif(btrim(c.telefone), ''), e.destinatario_telefone),
           'email', c.email,
           'cidade', coalesce(nullif(btrim(e.endereco_cidade), ''), c.endereco_municipio),
           'uf', coalesce(nullif(btrim(e.endereco_uf), ''), c.endereco_estado)
         )
    INTO v_destino
    FROM public.clientes c
   WHERE c.id = e.cliente_id;

  v_destino := coalesce(v_destino, '{}'::jsonb) || jsonb_build_object(
    'destinatario_nome', e.destinatario_nome,
    'local_entrega', nullif(btrim(concat_ws(', ',
        nullif(btrim(coalesce(e.endereco_logradouro, '')), ''),
        nullif(btrim(coalesce(e.endereco_numero, '')), ''),
        nullif(btrim(coalesce(e.endereco_bairro, '')), ''),
        nullif(btrim(coalesce(e.endereco_cidade, '')), ''),
        nullif(btrim(coalesce(e.endereco_uf, '')), ''))), '')
  );

  -- OS canonica: fluxo padrao (ordens_servico) ou fluxo On-Farm legitimo.
  SELECT jsonb_build_object(
           'os_id', o.id,
           'numero_os', o.numero_os,
           'origem', coalesce(o.origem, 'manual'),
           'tipo', 'ordem_servico'
         )
    INTO v_os
    FROM public.ordens_servico o
   WHERE o.id = e.ordem_servico_id;

  IF v_os IS NULL AND e.ordem_servico_onfarm_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'os_id', onf.id,
             'numero_os', onf.numero_os,
             'origem', 'on_farm',
             'tipo', 'ordem_servico_onfarm'
           )
      INTO v_os
      FROM public.ordens_servico_onfarm onf
     WHERE onf.id = e.ordem_servico_onfarm_id;
  END IF;

  -- Origem legitima adicional mapeada no dominio: entrega vinculada a pedido
  -- de parceiro (B2B) sem OS de laboratorio. Documentado em
  -- docs/auditorias/comprovante-entrega-fase2.md.
  IF v_os IS NULL AND e.partner_order_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'os_id', po.id,
             'numero_os', po.numero,
             'origem', 'pedido_parceiro',
             'tipo', 'partner_order'
           )
      INTO v_os
      FROM public.partner_orders po
     WHERE po.id = e.partner_order_id;
  END IF;

  -- Itens: caminho canonico por etiqueta
  SELECT jsonb_agg(item ORDER BY item->>'lote')
    INTO v_itens
    FROM (
      SELECT jsonb_build_object(
               'produto', coalesce(pe.produto_nome, pr.nome),
               'microrganismo', coalesce(array_to_string(pe.cepas, ', '), m.nome_cientifico, m.nome),
               'lote', coalesce(pe.lote_codigo, l.codigo_lote),
               'fabricacao', coalesce(pe.fabricado_em::date, l.data_producao),
               'validade', pe.validade_em::date,
               'embalagem', coalesce(eb.tipo_embalagem, pe.unidade),
               'quantidade', coalesce(pe.quantidade_embalagens, 1),
               'volume_unitario_ml', pe.volume,
               'volume_total_ml', coalesce(pe.volume, 0) * coalesce(pe.quantidade_embalagens, 1)
             ) AS item
        FROM public.entrega_etiquetas ee
        JOIN public.produto_etiquetas pe ON pe.id = ee.etiqueta_id
        LEFT JOIN public.produtos pr ON pr.id = pe.produto_id
        LEFT JOIN public.lotes l ON l.id = pe.lote_id
        LEFT JOIN public.microrganismos m ON m.id = l.microrganismo_id
        LEFT JOIN public.estoque_embalagens eb ON eb.id = pe.embalagem_id
       WHERE ee.entrega_id = p_entrega_id AND ee.ativo
    ) s;

  -- Fallback: vinculo direto da entrega (fluxo classico produto_id/lote_id).
  -- Referencias sempre por e2 (linha atual), sem depender da variavel PL/pgSQL.
  IF v_itens IS NULL OR jsonb_array_length(v_itens) = 0 THEN
    SELECT jsonb_build_array(jsonb_build_object(
             'produto', pr.nome,
             'microrganismo', coalesce(m.nome_cientifico, m.nome),
             'lote', l.codigo_lote,
             'fabricacao', l.data_producao,
             'validade', ep.validade,
             'embalagem', env.tipo_embalagem,
             'quantidade', e2.quantidade_entregue,
             'volume_unitario_ml', coalesce(
               env.volume_por_unidade,
               CASE WHEN coalesce(e2.quantidade_entregue, 0) > 0
                    THEN round(e2.volume_entregue_ml / e2.quantidade_entregue, 2) END),
             'volume_total_ml', coalesce(
               e2.volume_entregue_ml,
               env.volume_por_unidade * e2.quantidade_entregue)
           ))
      INTO v_itens
      FROM public.entregas e2
      LEFT JOIN public.produtos pr
             ON pr.id = coalesce(e2.produto_id,
                                 (SELECT l2.produto_id FROM public.lotes l2 WHERE l2.id = e2.lote_id))
      LEFT JOIN public.lotes l ON l.id = e2.lote_id
      LEFT JOIN public.microrganismos m ON m.id = l.microrganismo_id
      LEFT JOIN public.estoque_produto ep ON ep.id = e2.estoque_produto_id
      LEFT JOIN LATERAL (
        SELECT en.tipo_embalagem, en.volume_por_unidade
          FROM public.envase en
         WHERE en.lote_id = e2.lote_id
         ORDER BY en.data_envase DESC NULLS LAST
         LIMIT 1
      ) env ON true
     WHERE e2.id = p_entrega_id;
  END IF;

  v_transporte := jsonb_build_object(
    'modalidade', e.tipo_entrega,
    'motorista', e.motorista,
    'motorista_telefone', e.motorista_telefone,
    'veiculo', e.veiculo,
    'placa', e.veiculo_placa,
    'veiculo_tipo', e.veiculo_tipo,
    'data_saida', e.data_saida,
    'hora_saida_prevista', e.hora_saida_prevista
  );

  v_receb := jsonb_build_object(
    'recebido_por_nome', coalesce(nullif(btrim(coalesce(e.recebido_por_nome, '')), ''),
                                  nullif(btrim(coalesce(e.recebedor_nome, '')), '')),
    'documento', coalesce(e.recebido_por_documento, e.recebedor_documento),
    'cargo', coalesce(e.recebido_por_cargo, e.recebedor_cargo),
    'observacoes', e.observacoes_confirmacao,
    'confirmado_em', coalesce(e.confirmada_em, e.entregue_em, e.recebimento_confirmado_em),
    'confirmado_por', coalesce(e.confirmado_por, e.confirmada_por, e.recebimento_confirmado_por),
    'assinatura_tipo', e.assinatura_tipo
  );

  RETURN jsonb_build_object(
    'template_versao', 'comprovante-entrega-v1',
    'entrega_id', e.id,
    'entrega_status', e.status::text,
    'emitente', coalesce(v_emitente, '{}'::jsonb),
    'destinatario', coalesce(v_destino, '{}'::jsonb),
    'ordem_servico', v_os,
    'itens', coalesce(v_itens, '[]'::jsonb),
    'transporte', v_transporte,
    'recebimento', v_receb
  );
END
$function$
