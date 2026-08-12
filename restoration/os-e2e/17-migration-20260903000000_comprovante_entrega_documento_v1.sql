-- =====================================================================
-- 20260903000000_comprovante_entrega_documento_v1
-- Fase 2 — Regra documental ROMANEIO x COMPROVANTE + snapshot imutavel
-- Ambiente: SOMENTE staging ikaauvsflpmamgxmkhoq (guard fail-closed)
-- Reuso: public.entregas, public.entrega_comprovantes (metadata jsonb)
-- Nao cria tabela paralela de entrega nem de documento.
-- =====================================================================

DO $guard$
BEGIN
  PERFORM public.fn_os_assert_staging_exato();
END
$guard$;

-- ---------------------------------------------------------------------
-- 1) Hardening de ACL: anon nunca toca documentos de entrega
-- ---------------------------------------------------------------------
REVOKE ALL ON public.entrega_comprovantes FROM anon;
REVOKE ALL ON public.entrega_termos FROM anon;

-- ---------------------------------------------------------------------
-- 2) Numeracao legivel do comprovante definitivo: CE-YYYY-000123
--    (documentos antigos preservam numero_formulario AR-ENT-xxxxxx)
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.comprovante_entrega_seq
  AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;

REVOKE ALL ON SEQUENCE public.comprovante_entrega_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.comprovante_entrega_seq FROM anon;

-- ---------------------------------------------------------------------
-- 3) Construtor canonico do conteudo do documento
--    Fonte unica: emitente + destinatario + OS + itens + transporte +
--    recebimento. Itens: caminho etiquetas quando existir, senao o
--    vinculo direto produto_id/lote_id da entrega.
-- ---------------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.fn_comprovante_entrega_montar_v1(uuid) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------
-- 4) Motor server-side canonico do documento
--    - entrega nao confirmada  => doc_tipo = 'romaneio'
--    - entrega 'entregue' com recebedor explicito => 'comprovante'
--    - snapshot congelado uma unica vez em entrega_comprovantes.metadata
--    - reemissao nao reescreve conteudo; apenas contabiliza e audita
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_comprovante_entrega_data(
  p_entrega_id uuid,
  p_reemissao  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $rpc$
DECLARE
  v_uid       uuid := auth.uid();
  e           public.entregas%ROWTYPE;
  v_conteudo  jsonb;
  v_snapshot  jsonb;
  v_comp      public.entrega_comprovantes%ROWTYPE;
  v_doc_tipo  text;
  v_receb     text;
  v_numero    text;
  v_hash      text;
  v_reemissoes int := 0;
  v_congelado boolean := false;
  v_item      jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_UNAUTHENTICATED';
  END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN
    RAISE EXCEPTION 'COMPROVANTE_FORBIDDEN';
  END IF;
  IF p_entrega_id IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_PARAMS_INVALIDOS';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('comprovante_entrega:' || p_entrega_id::text));

  SELECT * INTO e FROM public.entregas WHERE id = p_entrega_id FOR UPDATE;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_ENTREGA_NAO_ENCONTRADA';
  END IF;
  IF e.status = 'cancelada' THEN
    RAISE EXCEPTION 'COMPROVANTE_ENTREGA_CANCELADA';
  END IF;

  v_receb := nullif(btrim(coalesce(e.recebido_por_nome, e.recebedor_nome, '')), '');
  v_doc_tipo := CASE
                  WHEN e.status = 'entregue' AND v_receb IS NOT NULL THEN 'comprovante'
                  ELSE 'romaneio'
                END;

  v_conteudo := public.fn_comprovante_entrega_montar_v1(p_entrega_id);

  -- Documento operacional: sempre montado do estado atual, sem congelar.
  IF v_doc_tipo = 'romaneio' THEN
    RETURN jsonb_build_object(
      'doc_tipo', 'romaneio',
      'titulo', 'Romaneio de Entrega',
      'definitivo', false,
      'numero_documento', 'RM-' || upper(substr(replace(e.id::text, '-', ''), 1, 8)),
      'emitido_em', now(),
      'conteudo', v_conteudo,
      'aviso', 'Documento operacional. Nao comprova o recebimento fisico.'
    );
  END IF;

  -- Comprovante definitivo: exige produto e lote em todos os itens.
  IF jsonb_array_length(v_conteudo->'itens') = 0 THEN
    RAISE EXCEPTION 'COMPROVANTE_SEM_ITENS';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_conteudo->'itens') LOOP
    IF nullif(btrim(coalesce(v_item->>'produto', '')), '') IS NULL THEN
      RAISE EXCEPTION 'COMPROVANTE_PRODUTO_OBRIGATORIO';
    END IF;
    IF nullif(btrim(coalesce(v_item->>'lote', '')), '') IS NULL THEN
      RAISE EXCEPTION 'COMPROVANTE_LOTE_OBRIGATORIO';
    END IF;
    IF coalesce((v_item->>'quantidade')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'COMPROVANTE_QUANTIDADE_OBRIGATORIA';
    END IF;
  END LOOP;
  IF (v_conteudo->'destinatario'->>'cliente_id') IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_CLIENTE_OBRIGATORIO';
  END IF;
  IF (v_conteudo->'recebimento'->>'confirmado_em') IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_CONFIRMACAO_SEM_DATA';
  END IF;

  SELECT * INTO v_comp
    FROM public.entrega_comprovantes
   WHERE entrega_id = p_entrega_id
     AND metadata ? 'comprovante_snapshot_v1'
   ORDER BY gerado_em DESC
   LIMIT 1;

  IF v_comp.id IS NOT NULL THEN
    -- Ja congelado: conteudo canonico imutavel.
    v_congelado := true;
    v_snapshot  := v_comp.metadata->'comprovante_snapshot_v1';
    v_numero    := coalesce(v_comp.metadata->>'comprovante_numero', v_comp.numero_formulario);
    v_hash      := v_comp.metadata->>'comprovante_snapshot_hash';
    v_reemissoes := coalesce((v_comp.metadata->>'comprovante_reemissoes')::int, 0);
  ELSE
    -- Primeiro congelamento: reutiliza a linha do formulario quando houver.
    SELECT * INTO v_comp
      FROM public.entrega_comprovantes
     WHERE entrega_id = p_entrega_id
     ORDER BY gerado_em DESC
     LIMIT 1;

    v_numero := 'CE-' || to_char(now(), 'YYYY') || '-'
             || lpad(nextval('public.comprovante_entrega_seq')::text, 6, '0');
    v_snapshot := v_conteudo || jsonb_build_object(
      'congelado_em', now(),
      'congelado_por', v_uid,
      'numero_documento', v_numero
    );
    v_hash := encode(digest(v_snapshot::text, 'sha256'), 'hex');

    IF v_comp.id IS NULL THEN
      INSERT INTO public.entrega_comprovantes (
        entrega_id, numero_formulario, tipo, status,
        validation_token, gerado_por, metadata
      ) VALUES (
        p_entrega_id, v_numero, 'comprovante_entrega', 'confirmado',
        gen_random_uuid(), v_uid,
        jsonb_build_object(
          'comprovante_snapshot_v1', v_snapshot,
          'comprovante_snapshot_hash', v_hash,
          'comprovante_numero', v_numero,
          'comprovante_reemissoes', 0
        )
      ) RETURNING * INTO v_comp;
    ELSE
      UPDATE public.entrega_comprovantes
         SET metadata = metadata || jsonb_build_object(
               'comprovante_snapshot_v1', v_snapshot,
               'comprovante_snapshot_hash', v_hash,
               'comprovante_numero', v_numero,
               'comprovante_reemissoes', 0
             ),
             updated_at = now()
       WHERE id = v_comp.id
       RETURNING * INTO v_comp;
    END IF;

    INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
    VALUES ('entrega', p_entrega_id, 'DELIVERY_RECEIPT_SNAPSHOT_FROZEN',
            jsonb_build_object('comprovante_id', v_comp.id, 'numero', v_numero, 'hash', v_hash), v_uid);
  END IF;

  -- Reemissao: nunca reescreve o snapshot; apenas registra.
  IF p_reemissao AND v_congelado THEN
    v_reemissoes := v_reemissoes + 1;
    UPDATE public.entrega_comprovantes
       SET metadata = metadata || jsonb_build_object(
             'comprovante_reemissoes', v_reemissoes,
             'comprovante_ultima_reemissao_em', now(),
             'comprovante_ultima_reemissao_por', v_uid),
           updated_at = now()
     WHERE id = v_comp.id;

    INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
    VALUES ('entrega', p_entrega_id, 'DELIVERY_RECEIPT_REISSUED',
            jsonb_build_object('comprovante_id', v_comp.id, 'reemissao', v_reemissoes), v_uid);
  END IF;

  RETURN jsonb_build_object(
    'doc_tipo', 'comprovante',
    'titulo', 'Comprovante de Entrega',
    'definitivo', true,
    'numero_documento', v_numero,
    'comprovante_id', v_comp.id,
    'snapshot_hash', v_hash,
    'reemissoes', v_reemissoes,
    'emitido_em', now(),
    'conteudo', v_snapshot,
    'aviso', 'Este documento comprova exclusivamente a entrega fisica dos produtos nele relacionados. '
          || 'Nao substitui documento fiscal, receituario agronomico, prescricao tecnica ou laudo tecnico '
          || 'quando legalmente exigiveis.'
  );
END
$rpc$;

REVOKE ALL ON FUNCTION public.rpc_get_comprovante_entrega_data(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_comprovante_entrega_data(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.rpc_get_comprovante_entrega_data(uuid, boolean) IS
  'Motor canonico do documento de entrega. Romaneio antes da confirmacao fisica; '
  'Comprovante definitivo (snapshot JSONB imutavel em entrega_comprovantes.metadata) apos '
  'confirmacao com recebedor explicito. Reemissao nao altera conteudo canonico.';
