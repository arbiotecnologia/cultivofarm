-- CANDIDATO ATÔMICO 19:35: INSERT aberta + gerador compatível. NÃO APLICADO / SEM LIBERAÇÃO.
BEGIN;
-- Transação única após revisão independente; sem GRANT, sem mudanças de RLS.
-- NÃO aplicar programar juntamente: suas lacunas continuam bloqueadoras.
CREATE TEMP TABLE approval_existing_baseline ON COMMIT DROP AS
SELECT oid, proacl, proowner, pg_get_functiondef(oid) definition FROM pg_proc
WHERE oid IN ('public.generate_production_orders_from_partner(uuid)'::regprocedure,
 'public.check_os_status_transition()'::regprocedure,
 'public.rpc_programar_os_v1(uuid,text,date)'::regprocedure,
 'public.fn_sync_os_classica_downstream()'::regprocedure,
 'public.sync_os_onfarm_downstream()'::regprocedure);
DO $pre$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
 IF md5(pg_get_functiondef('public.check_os_status_transition()'::regprocedure)) IS DISTINCT FROM '496a214d87fc831a53b2f16d3524ddea'
 OR md5(pg_get_functiondef('public.rpc_programar_os_v1(uuid,text,date)'::regprocedure)) IS DISTINCT FROM 'a42d6b07f51e6dacf41096f6cefb8163'
 OR md5(pg_get_functiondef('public.rpc_converter_visita_em_os(uuid,text)'::regprocedure)) IS DISTINCT FROM 'b112888e28d8a5727df713e0ae7bcd1b'
 OR md5(pg_get_functiondef('public.generate_production_orders_from_partner(uuid)'::regprocedure)) IS DISTINCT FROM '8f7acca4a7179ebf6e4e3ea100e8ea90'
 OR md5(pg_get_functiondef('private.h7n_esteira_laboratorio()'::regprocedure)) IS DISTINCT FROM 'bad38b5200629cc887767e62b7a46e40'
 OR md5(pg_get_functiondef('public.fn_sync_os_classica_downstream()'::regprocedure)) IS DISTINCT FROM '06e64b76968f91e19f03b24363ac610a'
 OR md5(pg_get_functiondef('public.sync_os_onfarm_downstream()'::regprocedure)) IS DISTINCT FROM 'f5ba706828f4c157a55a8d594b5c1848'
 OR md5(pg_get_functiondef('public.technical_actor_ready(uuid)'::regprocedure)) IS DISTINCT FROM 'b5d0994b6eb976b14122cd2a1ec798cf'
 OR md5(pg_get_functiondef('platform_private.h15_actor_organization()'::regprocedure)) IS DISTINCT FROM '64e10608403238a41a9baf92857ca881'
 OR md5(pg_get_functiondef('public._saas_user_has_feature(uuid,text)'::regprocedure)) IS DISTINCT FROM '501dd958e117d2df8a4d38f6bcbeed04'
 OR md5(pg_get_functiondef('platform_private.lab_item_is_manufacturable(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '853595394240e8f2a61ac2d621118271' THEN RAISE EXCEPTION 'APPROVAL_BODY_DRIFT'; END IF;
 IF (SELECT md5(string_agg(t.tgrelid::regclass::text||':'||t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\n' ORDER BY t.tgrelid::regclass::text,t.tgname)) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.ordens_servico'::regclass,'public.ordens_servico_onfarm'::regclass,'public.programacao_producao'::regclass)) IS DISTINCT FROM '7f00df0799ad242031f0279373091034' THEN RAISE EXCEPTION 'APPROVAL_TRIGGER_DRIFT'; END IF;
 IF (SELECT md5(string_agg(table_name||':'||column_name||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,''),E'\n' ORDER BY table_name,ordinal_position)) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ordens_servico','ordens_servico_onfarm','programacao_producao','laboratorio_esteira_eventos')) IS DISTINCT FROM '65c9714925862453043e64da5bf2cbdb' THEN RAISE EXCEPTION 'APPROVAL_SCHEMA_DRIFT'; END IF;
 IF (SELECT md5(string_agg(tablename||':'||policyname||':'||permissive||':'||roles::text||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,''),E'\n' ORDER BY tablename,policyname)) FROM pg_policies WHERE schemaname='public' AND tablename IN ('ordens_servico','ordens_servico_onfarm','programacao_producao')) IS DISTINCT FROM '7d292abeaf7cd90cb82e70b596de0acf' THEN RAISE EXCEPTION 'APPROVAL_RLS_DRIFT'; END IF;
 IF to_regprocedure('public.rpc_aprovar_os_v1(uuid,text)') IS NOT NULL OR to_regprocedure('private.assert_os_approval_scope(uuid,text)') IS NOT NULL OR to_regprocedure('private.guard_os_separate_approval()') IS NOT NULL THEN RAISE EXCEPTION 'APPROVAL_CANDIDATE_ALREADY_PRESENT'; END IF;
 IF has_function_privilege('authenticated','public.rpc_programar_os_v1(uuid,text,date)','EXECUTE') OR has_function_privilege('anon','public.rpc_programar_os_v1(uuid,text,date)','EXECUTE') THEN RAISE EXCEPTION 'PROGRAMAR_NOT_CLOSED'; END IF;
 -- Compatibilidade atômica: somente os dois INSERT do gerador passam a aberta.
 -- Publicadores/trigger INSERT existentes permanecem; aprovação B2B segue negada.
 IF md5(pg_get_functiondef('public.rpc_planejamento_publicar_v1(uuid,text)'::regprocedure)) IS DISTINCT FROM '5fe54a19d909a12a1fb310bc97b7b2e7'
 OR md5(pg_get_functiondef('public.publish_planning_to_lab(uuid)'::regprocedure)) IS DISTINCT FROM '0e6783b42c0016084682cd17bff5dd46'
 OR md5(pg_get_functiondef('public.fn_create_programacao_on_os_classica_insert()'::regprocedure)) IS DISTINCT FROM '27b31332cebda532e2d99d9547f9b67c' THEN RAISE EXCEPTION 'GENERATOR_DEPENDENCY_DRIFT'; END IF;
 IF (SELECT md5(string_agg(t.tgrelid::regclass::text||':'||t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\n' ORDER BY t.tgrelid::regclass::text,t.tgname)) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.production_order_link'::regclass,'public.production_planning'::regclass,'public.partner_orders'::regclass)) IS DISTINCT FROM 'd5b90a25dccb410b1f6e8676b20a498d' THEN RAISE EXCEPTION 'GENERATOR_TRIGGER_DRIFT'; END IF;
 IF (SELECT string_agg(enumlabel,',' ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid='public.status_os'::regtype) IS DISTINCT FROM 'aberta,aprovada,programada,em_producao,em_cq,envase,aguardando_reserva,pronto_entrega,entregue,finalizada'
 OR (SELECT string_agg(enumlabel,',' ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid='public.status_os_onfarm'::regtype) IS DISTINCT FROM 'aberta,aprovada,programada,em_producao,em_cq,envase,aguardando_reserva,pronto_entrega,entregue,finalizada,cancelada' THEN RAISE EXCEPTION 'APPROVAL_ENUM_DRIFT'; END IF;
END $pre$;

CREATE OR REPLACE FUNCTION private.assert_os_approval_scope(p_os_id uuid,p_origin text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 v_uid uuid:=auth.uid(); v_org uuid; v_os record; v_pp public.programacao_producao%ROWTYPE;
BEGIN
 v_org:=platform_private.h15_actor_organization();
 -- Alçada antes de lookup/status/replay. NULL não é permissão.
 IF v_uid IS NULL OR v_org IS NULL OR public.technical_actor_ready(v_uid) IS NOT TRUE
 OR public._saas_user_has_feature(v_uid,'ordens_producao') IS NOT TRUE
 OR (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor')) IS NOT TRUE
 OR p_os_id IS NULL OR p_origin NOT IN ('manual','onfarm') OR p_origin IS NULL THEN
 RAISE EXCEPTION 'OS_APPROVAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.h7n_esteira_laboratorio() s WHERE s.os_id=p_os_id AND s.origem_os=p_origin) THEN RAISE EXCEPTION 'OS_APPROVAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 -- Mesmo ordenamento do caminho direto: lock da OS antes dos filhos, sem advisory invertido.
 IF p_origin='manual' THEN
 SELECT o.id,o.cliente_id,o.fazenda_id,o.talhao_id,o.produto_id,o.microrganismo_id,o.origem,o.partner_order_id,o.partner_order_item_id INTO v_os FROM public.ordens_servico o WHERE id=p_os_id FOR UPDATE;
 ELSE
 SELECT o.id,o.cliente_id,o.fazenda_id,o.talhao_id,o.produto_id,o.microrganismo_id,'onfarm'::text origem,NULL::uuid partner_order_id,NULL::uuid partner_order_item_id INTO v_os FROM public.ordens_servico_onfarm o WHERE id=p_os_id FOR UPDATE;
 END IF;
 IF v_os.id IS NULL THEN RAISE EXCEPTION 'OS_APPROVAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR SHARE;
 PERFORM 1 FROM public.organizations WHERE id=v_org FOR SHARE;
 PERFORM 1 FROM public.clientes WHERE id=v_os.cliente_id FOR SHARE;
 PERFORM 1 FROM public.fazendas WHERE id=v_os.fazenda_id FOR SHARE;
 PERFORM 1 FROM public.talhoes WHERE id=v_os.talhao_id FOR SHARE;
 PERFORM 1 FROM public.produtos WHERE id=v_os.produto_id FOR SHARE;
 PERFORM 1 FROM public.microrganismos WHERE id=v_os.microrganismo_id FOR SHARE;
 PERFORM 1 FROM public.programacao_producao WHERE ordem_servico_id=p_os_id OR ordem_servico_onfarm_id=p_os_id ORDER BY id FOR UPDATE;
 IF platform_private.h15_actor_organization() IS DISTINCT FROM v_org OR public.technical_actor_ready(v_uid) IS NOT TRUE
 OR public._saas_user_has_feature(v_uid,'ordens_producao') IS NOT TRUE
 OR (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor')) IS NOT TRUE
 OR NOT EXISTS(SELECT 1 FROM private.h7n_esteira_laboratorio() s WHERE s.os_id=p_os_id AND s.origem_os=p_origin) THEN RAISE EXCEPTION 'OS_APPROVAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 -- Efeitos comerciais/planejamento ainda não homologados: não autorizar por alias.
 IF v_os.origem='b2b' OR v_os.partner_order_id IS NOT NULL OR v_os.partner_order_item_id IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.production_order_link WHERE ordem_servico_id=p_os_id)
 OR platform_private.lab_item_is_manufacturable(v_os.produto_id,v_os.microrganismo_id) IS NOT TRUE THEN RAISE EXCEPTION 'OS_APPROVAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 -- Aprovação não cria programação nem inventa data. Ausência exige revisão do fluxo atual.
 IF (SELECT count(*) FROM public.programacao_producao WHERE ordem_servico_id=p_os_id OR ordem_servico_onfarm_id=p_os_id)<>1 THEN RAISE EXCEPTION 'OS_APPROVAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_pp FROM public.programacao_producao WHERE ordem_servico_id=p_os_id OR ordem_servico_onfarm_id=p_os_id;
 IF v_pp.organization_id IS DISTINCT FROM v_org OR v_pp.status::text IS DISTINCT FROM 'aguardando'
 OR v_pp.produto_id IS DISTINCT FROM v_os.produto_id OR v_pp.microrganismo_id IS DISTINCT FROM v_os.microrganismo_id
 OR NOT (((p_origin='manual' AND v_pp.ordem_servico_id=p_os_id AND v_pp.ordem_servico_onfarm_id IS NULL)
 OR (p_origin='onfarm' AND v_pp.ordem_servico_onfarm_id=p_os_id AND v_pp.ordem_servico_id IS NULL)) IS TRUE)
 OR (v_pp.responsavel_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.id=v_pp.responsavel_id AND pr.organization_id=v_org AND pr.ativo IS TRUE))
 OR EXISTS(SELECT 1 FROM public.lotes WHERE programacao_id=v_pp.id) THEN RAISE EXCEPTION 'OS_APPROVAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN v_org;
END $function$;
REVOKE ALL ON FUNCTION private.assert_os_approval_scope(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_os_separate_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_origin text; v_org uuid;
BEGIN
 IF TG_OP='INSERT' THEN
 -- Criação normal exclusivamente aberta, inclusive pelo serviço/DEFINER.
 -- NULL e qualquer estado avançado não podem saltar a aprovação humana.
 -- Sem whitelist service_role, flags GUC ou reparo de históricos.
 IF NEW.status::text IS DISTINCT FROM 'aberta' THEN RAISE EXCEPTION 'OS_APPROVAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
 END IF;
 IF NEW.status::text IS DISTINCT FROM 'aprovada' THEN RETURN NEW; END IF;
 v_origin:=CASE TG_TABLE_NAME WHEN 'ordens_servico' THEN 'manual' WHEN 'ordens_servico_onfarm' THEN 'onfarm' END;
 IF TG_WHEN='BEFORE' THEN
 -- Um único UPDATE não pode substituir a identidade/referências e aprovar o estado anterior.
 IF (to_jsonb(NEW)-ARRAY['status','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at']) THEN RAISE EXCEPTION 'OS_APPROVAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 v_org:=private.assert_os_approval_scope(OLD.id,v_origin);
 RETURN NEW;
 END IF;
 IF OLD.status::text='aberta' THEN
 v_org:=private.assert_os_approval_scope(NEW.id,v_origin);
 INSERT INTO public.laboratorio_esteira_eventos(os_id,origem_os,programacao_id,etapa_anterior,etapa_nova,acao,usuario_id,observacao)
 SELECT NEW.id,v_origin,pp.id,'aberta','aprovada','aprovar_os',auth.uid(),jsonb_build_object(
 'organization_id',v_org,'before',jsonb_build_object('status',OLD.status,'volume',OLD.volume_total_ml,'data_os',to_jsonb(OLD)->'data_programada'),
 'after',jsonb_build_object('status',NEW.status,'volume',NEW.volume_total_ml,'data_os',to_jsonb(NEW)->'data_programada'),
 'programacao',jsonb_build_object('id',pp.id,'status',pp.status,'data',pp.data_programada,'volume',pp.volume_necessario),
 'actor',auth.uid(),'at',clock_timestamp(),'manufacturing_started',false,'commercial_completed',false)::text
 FROM public.programacao_producao pp WHERE pp.ordem_servico_id=NEW.id OR pp.ordem_servico_onfarm_id=NEW.id;
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION private.guard_os_separate_approval() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER aa_guard_separate_approval BEFORE INSERT OR UPDATE OF status ON public.ordens_servico FOR EACH ROW EXECUTE FUNCTION private.guard_os_separate_approval();
CREATE TRIGGER aa_guard_separate_approval BEFORE INSERT OR UPDATE OF status ON public.ordens_servico_onfarm FOR EACH ROW EXECUTE FUNCTION private.guard_os_separate_approval();
CREATE TRIGGER zz_audit_separate_approval AFTER UPDATE OF status ON public.ordens_servico FOR EACH ROW EXECUTE FUNCTION private.guard_os_separate_approval();
CREATE TRIGGER zz_audit_separate_approval AFTER UPDATE OF status ON public.ordens_servico_onfarm FOR EACH ROW EXECUTE FUNCTION private.guard_os_separate_approval();

-- Menor extensão no fluxo OS existente: somente aprovação, sem data/volume/produção/rota.
CREATE OR REPLACE FUNCTION public.rpc_aprovar_os_v1(p_os_id uuid,p_origem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_origin text; v_status text; v_org uuid;
BEGIN
 -- Normalização não consulta dados. Alias inválido/inexistente negado igualmente.
 BEGIN v_origin:=public.fn_cockpit_norm_origem(p_origem); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'OS_APPROVAL_SCOPE_DENIED' USING ERRCODE='42501'; END;
 IF v_origin='b2b' THEN v_origin:='manual'; END IF;
 v_org:=private.assert_os_approval_scope(p_os_id,v_origin);
 IF v_origin='manual' THEN SELECT status::text INTO v_status FROM public.ordens_servico WHERE id=p_os_id;
 ELSE SELECT status::text INTO v_status FROM public.ordens_servico_onfarm WHERE id=p_os_id; END IF;
 IF v_status='aprovada' THEN RETURN jsonb_build_object('success',true,'replay',true,'status','aprovada'); END IF;
 IF v_status IS DISTINCT FROM 'aberta' THEN RETURN jsonb_build_object('success',false,'message','Somente OS aberta pode ser aprovada separadamente.'); END IF;
 IF v_origin='manual' THEN UPDATE public.ordens_servico SET status='aprovada' WHERE id=p_os_id;
 ELSE UPDATE public.ordens_servico_onfarm SET status='aprovada' WHERE id=p_os_id; END IF;
 PERFORM private.assert_os_approval_scope(p_os_id,v_origin);
 RETURN jsonb_build_object('success',true,'replay',false,'status','aprovada','message','OS aprovada; programação e fabricação não iniciadas.');
END $function$;
REVOKE ALL ON FUNCTION public.rpc_aprovar_os_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
-- Dois literais de status somente; volumes, autoria, locks, snapshots e links preservados.
CREATE OR REPLACE FUNCTION public.generate_production_orders_from_partner(p_partner_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_planning_id uuid;
  v_partner_id uuid;
  v_order_numero text;
  v_order_status text;
  v_ready boolean;
  v_partner_nome text;
  v_grp RECORD;
  v_item RECORD;
  v_os_id uuid;
  v_numero text;
  v_count int := 0;
  v_nonlab_count int := 0;
  v_uid uuid := auth.uid();
  v_ids uuid[] := ARRAY[]::uuid[];
  v_anchor_item_id uuid;
BEGIN
 IF NOT platform_private.lab_partner_order_authorized(p_partner_order_id) THEN
  RAISE EXCEPTION 'LAB_PARTNER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_partner_order_id AND internal_origin_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;

  -- H5-B01: serializa geração concorrente por pedido (idempotência de resultado)
  PERFORM pg_advisory_xact_lock(hashtext('generate_production_orders_from_partner:' || p_partner_order_id::text));

  SELECT po.partner_id, po.numero, po.status::text, po.ready_for_production
    INTO v_partner_id, v_order_numero, v_order_status, v_ready
  FROM public.partner_orders po
  WHERE po.id = p_partner_order_id;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Pedido B2B não encontrado';
  END IF;

  IF v_order_status IN ('cancelado','reprovado','faturado','entregue') THEN
    RAISE EXCEPTION 'Pedido B2B não pode gerar produção (status: %)', v_order_status;
  END IF;

  -- Fase 7: bloqueia produção enquanto aprovação financeira exigida está pendente/rejeitada
   IF EXISTS (
     SELECT 1 FROM public.partner_orders po2
     WHERE po2.id = p_partner_order_id
       AND po2.requires_financial_approval = true
       AND po2.financial_approval_status IN ('pending','rejected')
   ) THEN
     RAISE EXCEPTION 'financial_approval_required_before_production';
   END IF;

   IF v_order_status <> 'aprovado' OR v_ready IS NOT TRUE THEN
    RAISE EXCEPTION 'Pedido B2B ainda não está aprovado para produção.';
  END IF;

  SELECT id INTO v_planning_id FROM public.production_planning WHERE partner_order_id = p_partner_order_id;
  IF v_planning_id IS NULL THEN
    RAISE EXCEPTION 'Planejamento não encontrado para o pedido %', p_partner_order_id;
  END IF;

  SELECT COALESCE(nome_fantasia, razao_social) INTO v_partner_nome FROM public.partner_accounts WHERE id = v_partner_id;

  SELECT count(*) INTO v_nonlab_count FROM public.partner_order_items poi
   WHERE poi.order_id=p_partner_order_id
     AND NOT platform_private.lab_item_is_manufacturable(poi.product_id,poi.microrganismo_id);

  FOR v_grp IN
    WITH itens AS (
      SELECT poi.id,
             poi.product_id,
             poi.quantidade,
             COALESCE(poi.unidade_medida,'unidade') AS unidade_medida,
             poi.preco_tabela_snapshot,
             poi.preco_unitario,
             poi.produto_nome_snapshot,
             poi.produto_codigo_snapshot,
             poi.created_at,
             cv.volume_ml AS vasilhame_volume_ml
      FROM public.partner_order_items poi
      LEFT JOIN LATERAL (
        SELECT cv2.volume_ml
          FROM public.catalogo_volumes cv2
         WHERE cv2.item_tipo = 'produto'
           AND cv2.produto_id = poi.product_id
           AND cv2.ativo = true
         ORDER BY (cv2.preco_brl = COALESCE(poi.preco_tabela_snapshot, poi.preco_unitario)) DESC,
                  ABS(cv2.preco_brl - COALESCE(poi.preco_tabela_snapshot, poi.preco_unitario)) ASC
         LIMIT 1
      ) cv ON true
      WHERE poi.order_id = p_partner_order_id
        AND poi.product_id IS NOT NULL
        AND platform_private.lab_item_is_manufacturable(poi.product_id,poi.microrganismo_id)
        AND COALESCE(poi.unidade_medida,'unidade') <> 'hectare'
        AND NOT EXISTS (
          SELECT 1 FROM public.production_order_link l WHERE l.partner_order_item_id = poi.id
        )
    )
    SELECT product_id,
           MIN(produto_nome_snapshot) AS produto_nome,
           MIN(produto_codigo_snapshot) AS produto_codigo,
           SUM(
             CASE unidade_medida
               WHEN 'ml'    THEN quantidade
               WHEN 'litro' THEN quantidade * 1000
               WHEN 'unidade' THEN quantidade * vasilhame_volume_ml
               WHEN 'dose'    THEN quantidade * vasilhame_volume_ml
               ELSE NULL
             END
           ) AS volume_total_ml,
           bool_or(
             unidade_medida IN ('unidade','dose') AND vasilhame_volume_ml IS NULL
           ) AS faltou_vasilhame,
           array_agg(id ORDER BY created_at, id) AS item_ids,
           (array_agg(id ORDER BY created_at, id))[1] AS anchor_id
    FROM itens
    GROUP BY product_id
  LOOP
    IF v_grp.faltou_vasilhame THEN
      RAISE EXCEPTION 'Produto % (%) está em unidade/dose mas não tem vasilhame ativo no catálogo. Configure o vasilhame antes de gerar produção.',
        COALESCE(v_grp.produto_nome,'?'), COALESCE(v_grp.produto_codigo,'?');
    END IF;

    IF v_grp.volume_total_ml IS NULL OR v_grp.volume_total_ml <= 0 THEN
      RAISE EXCEPTION 'Não foi possível calcular o volume do produto % (%).',
        COALESCE(v_grp.produto_nome,'?'), COALESCE(v_grp.produto_codigo,'?');
    END IF;

    v_anchor_item_id := v_grp.anchor_id;
    v_numero := 'OS-B2B-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    INSERT INTO public.ordens_servico (
      cliente_id, fazenda_id, talhao_id, produto_id, volume_total_ml, area_hectares,
      prioridade, status, tipo_item, numero_os,
      partner_order_id, partner_order_item_id, origem
    ) VALUES (
      NULL, NULL, NULL, v_grp.product_id, v_grp.volume_total_ml, NULL,
      'media','aberta','produto', v_numero,
      p_partner_order_id, v_anchor_item_id, 'b2b'
    ) RETURNING id INTO v_os_id;

    INSERT INTO public.production_order_link (
      partner_order_id, partner_order_item_id, planning_id, ordem_servico_id, created_by
    )
    SELECT p_partner_order_id, unnest(v_grp.item_ids), v_planning_id, v_os_id, v_uid;

    v_ids := array_append(v_ids, v_os_id);
    v_count := v_count + 1;
  END LOOP;

  FOR v_item IN
    SELECT poi.* FROM public.partner_order_items poi
    WHERE poi.order_id = p_partner_order_id
      AND platform_private.lab_item_is_manufacturable(poi.product_id,poi.microrganismo_id)
      AND NOT EXISTS (SELECT 1 FROM public.production_order_link l WHERE l.partner_order_item_id = poi.id)
      AND (
        poi.product_id IS NULL
        OR COALESCE(poi.unidade_medida,'unidade') = 'hectare'
      )
  LOOP
    v_numero := 'OS-B2B-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    INSERT INTO public.ordens_servico (
      cliente_id, fazenda_id, talhao_id, produto_id, microrganismo_id, volume_total_ml, area_hectares,
      prioridade, status, tipo_item, numero_os,
      partner_order_id, partner_order_item_id, origem
    ) VALUES (
      NULL, NULL, NULL, v_item.product_id, v_item.microrganismo_id, NULL,
      CASE WHEN COALESCE(v_item.unidade_medida,'unidade') = 'hectare' THEN v_item.quantidade ELSE NULL END,
      'media','aberta',
      CASE WHEN v_item.product_id IS NULL THEN 'microrganismo' ELSE 'produto' END,
      v_numero,
      p_partner_order_id, v_item.id, 'b2b'
    ) RETURNING id INTO v_os_id;

    INSERT INTO public.production_order_link (
      partner_order_id, partner_order_item_id, planning_id, ordem_servico_id, created_by
    ) VALUES (p_partner_order_id, v_item.id, v_planning_id, v_os_id, v_uid);

    v_ids := array_append(v_ids, v_os_id);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'os_created', 0, 'planning_id', v_planning_id,
                              'non_lab_items',v_nonlab_count, 'message', 'Nenhuma nova OS biológica gerada; itens não laboratoriais permanecem no pedido.');
  END IF;

  UPDATE public.production_planning
     SET status = 'planejado', updated_at = now()
   WHERE id = v_planning_id AND status = 'aguardando_planejamento';

  INSERT INTO public.production_timeline_events (partner_order_id, event_type, actor_id, meta)
  VALUES (p_partner_order_id, 'op_gerada', v_uid, jsonb_build_object('os_count', v_count, 'planning_id', v_planning_id));

  INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (
    p_partner_order_id, v_partner_id, v_uid, 'op_gerada',
    jsonb_build_object(
      'planning_id', v_planning_id,
      'os_count', v_count,
      'ordens_servico_ids', to_jsonb(v_ids),
      'created_at', now()
    )
  );

  RETURN jsonb_build_object('ok', true, 'os_created', v_count, 'planning_id', v_planning_id, 'ordens_servico_ids', to_jsonb(v_ids), 'non_lab_items',v_nonlab_count);
END
$function$;
DO $post$
BEGIN
 IF EXISTS(SELECT 1 FROM approval_existing_baseline b JOIN pg_proc p ON p.oid=b.oid WHERE p.proacl IS DISTINCT FROM b.proacl OR p.proowner IS DISTINCT FROM b.proowner OR (p.oid <> 'public.generate_production_orders_from_partner(uuid)'::regprocedure AND pg_get_functiondef(p.oid) IS DISTINCT FROM b.definition)) THEN RAISE EXCEPTION 'EXISTING_CONTRACT_CHANGED'; END IF;
 IF md5(pg_get_functiondef('public.generate_production_orders_from_partner(uuid)'::regprocedure)) IS DISTINCT FROM '2c75352712438df1558a3f5453e67da0' THEN RAISE EXCEPTION 'GENERATOR_AFTER_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid IN ('private.assert_os_approval_scope(uuid,text)'::regprocedure,'private.guard_os_separate_approval()'::regprocedure,'public.rpc_aprovar_os_v1(uuid,text)'::regprocedure) AND EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
 OR has_function_privilege('authenticated','public.rpc_aprovar_os_v1(uuid,text)','EXECUTE') OR has_function_privilege('anon','public.rpc_aprovar_os_v1(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'APPROVAL_NOT_CLOSED'; END IF;
END $post$;
-- Rollback seguro: ROLLBACK integral antes COMMIT. Depois, manter guards fechados
-- até correção substitutiva revisada; NÃO remover proteção expondo UPDATE existente.
-- Não alterar grants, owner, RLS, check_os_status_transition ou dados históricos.
-- Revisão deve executar preflight/pós-condições na mesma transação; padrão seguro NÃO aplica.
ROLLBACK;
