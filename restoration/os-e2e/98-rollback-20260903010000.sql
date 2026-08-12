-- =====================================================================
-- ROLLBACK INCREMENTAL — 20260903010000 (fix de cepas text[])
-- Restaura o builder na definicao original de 20260903000000.
-- Nao remove snapshots, numeracao nem constraints.
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq.
-- ATENCAO: apos este rollback o builder volta a falhar em etiquetas cujo
-- campo cepas seja text[] — preservacao deliberada do comportamento antigo.
-- =====================================================================
\set ON_ERROR_STOP on

DO $guard$
BEGIN
  PERFORM public.fn_os_assert_staging_exato();
END
$guard$;

CREATE OR REPLACE FUNCTION public.fn_comprovante_entrega_montar_v1(p_entrega_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  e            public.entregas%ROWTYPE;
  v_emitente   jsonb;
  v_destino    jsonb;
  v_os         jsonb;
  v_itens      jsonb;
  v_transporte jsonb;
  v_receb      jsonb;
BEGIN
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
    FROM public.company_fiscal_settings cs
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

  SELECT jsonb_build_object(
           'os_id', o.id,
           'numero_os', o.numero_os,
           'origem', coalesce(o.origem, 'manual'),
           'tipo', 'ordem_servico'
         )
    INTO v_os
    FROM public.ordens_servico o
   WHERE o.id = e.ordem_servico_id;

  -- Itens: caminho canonico por etiqueta
  SELECT jsonb_agg(item ORDER BY item->>'lote')
    INTO v_itens
    FROM (
      SELECT jsonb_build_object(
               'produto', coalesce(pe.produto_nome, pr.nome),
               'microrganismo', coalesce(pe.cepas, m.nome_cientifico, m.nome),
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

  -- Fallback: vinculo direto da entrega (fluxo classico produto_id/lote_id)
  IF v_itens IS NULL OR jsonb_array_length(v_itens) = 0 THEN
    SELECT jsonb_build_array(jsonb_build_object(
             'produto', pr.nome,
             'microrganismo', coalesce(m.nome_cientifico, m.nome),
             'lote', l.codigo_lote,
             'fabricacao', l.data_producao,
             'validade', ep.validade,
             'embalagem', env.tipo_embalagem,
             'quantidade', e.quantidade_entregue,
             'volume_unitario_ml', coalesce(
               env.volume_por_unidade,
               CASE WHEN coalesce(e.quantidade_entregue, 0) > 0
                    THEN round(e.volume_entregue_ml / e.quantidade_entregue, 2) END),
             'volume_total_ml', coalesce(
               e.volume_entregue_ml,
               env.volume_por_unidade * e.quantidade_entregue)
           ))
      INTO v_itens
      FROM public.entregas e2
      LEFT JOIN public.produtos pr ON pr.id = coalesce(e.produto_id, (SELECT l2.produto_id FROM public.lotes l2 WHERE l2.id = e.lote_id))
      LEFT JOIN public.lotes l ON l.id = e.lote_id
      LEFT JOIN public.microrganismos m ON m.id = l.microrganismo_id
      LEFT JOIN public.estoque_produto ep ON ep.id = e.estoque_produto_id
      LEFT JOIN LATERAL (
        SELECT en.tipo_embalagem, en.volume_por_unidade
          FROM public.envase en
         WHERE en.lote_id = e.lote_id
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
$fn$;

REVOKE ALL ON FUNCTION public.fn_comprovante_entrega_montar_v1(uuid) FROM PUBLIC, anon, authenticated;
