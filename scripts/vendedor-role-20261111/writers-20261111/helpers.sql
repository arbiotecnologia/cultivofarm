-- SELLER_PORTFOLIO_V1 helpers. Não alteram b2b_internal_commercial_actor, c2_internal_order_target_reason nem fn_cc_can_prepare.
CREATE FUNCTION platform_private.seller_commercial_actor() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  -- Vendedor exclusivo: papel real ativo, sem papéis de aprovação/financeiro/externos, sem vínculo externo vigente.
  SELECT auth.uid() IS NOT NULL AND public.h15_actor_organization() IS NOT NULL
    AND platform_private.platform_actor_access_ready(auth.uid())
    AND public.has_role(auth.uid(),'vendedor'::public.app_role)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid()
          AND r.role::text IN ('administrador','gestor_comercial','financeiro','parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor'))
    AND NOT EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.user_id=auth.uid() AND pu.revoked_at IS NULL)
    AND platform_private.seller_actor_org('vendedor'::public.app_role) IS NOT DISTINCT FROM public.h15_actor_organization()
$f$;
CREATE FUNCTION platform_private.seller_commercial_target_reason(_uid uuid, _partner uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE s record; org uuid;
BEGIN
  -- NULL = permitido. Nunca autoriza sozinho: chamadores precisam negar.
  IF _uid IS NULL OR auth.uid() IS DISTINCT FROM _uid THEN RETURN 'auth_required'; END IF;
  IF platform_private.seller_commercial_actor() IS NOT TRUE THEN RETURN 'actor_not_allowed'; END IF;
  SELECT * INTO s FROM platform_private.b2b_actor_scope(_uid);
  IF s.profile_ok IS NOT TRUE THEN RETURN 'inactive_scope'; END IF;
  IF NOT public._saas_user_has_feature(_uid,'pedidos_b2b') THEN RETURN 'feature_disabled'; END IF;
  org := public.h15_actor_organization();
  IF org IS NULL THEN RETURN 'actor_not_allowed'; END IF;
  IF _partner IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_accounts p
       WHERE p.id=_partner AND p.ativo IS TRUE AND p.deleted_at IS NULL AND p.commercial_owner_organization_id=org
         AND (p.client_id IS NULL OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id=p.client_id AND c.organization_id=org))) THEN
    RETURN 'target_outside_portfolio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM platform_private.seller_portfolio_assignments a
       WHERE a.organization_id=org AND a.seller_user_id=_uid AND a.partner_id=_partner AND a.revoked_at IS NULL) THEN
    RETURN 'not_assigned';
  END IF;
  RETURN NULL;
END $f$;
CREATE FUNCTION platform_private.seller_portfolio_lock(_uid uuid, _partner uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
  -- Trava a atribuição vigente; revogação concorrente espera este commit ou vence antes, e então negamos.
  PERFORM 1 FROM platform_private.seller_portfolio_assignments a
    WHERE a.organization_id=public.h15_actor_organization() AND a.seller_user_id=_uid AND a.partner_id=_partner AND a.revoked_at IS NULL
    FOR SHARE;
  IF NOT FOUND OR platform_private.seller_commercial_target_reason(_uid,_partner) IS NOT NULL THEN
    RAISE EXCEPTION 'SELLER_PORTFOLIO_REVOKED' USING ERRCODE='42501';
  END IF;
END $f$;
REVOKE ALL ON FUNCTION platform_private.seller_commercial_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform_private.seller_commercial_target_reason(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform_private.seller_portfolio_lock(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- Capacidade: distingue bloqueio fiscal (emitente) de ausência funcional. Sem escrita.
CREATE OR REPLACE FUNCTION public.seller_portfolio_capability_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE uid uuid := auth.uid(); org uuid; r text; n integer; validated boolean; fiscal text := NULL; cat boolean; partners jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  r := platform_private.seller_commercial_target_reason(uid, NULL);
  IF r IS NOT NULL THEN
    RETURN jsonb_build_object('contract','seller_portfolio_capability_v1','version',2,'ready',false,
      'reason',CASE WHEN r='actor_not_allowed' THEN 'not_seller' ELSE r END,
      'order_create',false,'quote_respond',false,'fiscal_block',NULL,'partners','[]'::jsonb);
  END IF;
  org := public.h15_actor_organization();
  -- Mesmo predicado do emitente usado pelo gatilho interno; leitura sem lock.
  SELECT count(*), bool_and(c.configuration_status='VALIDATED' AND c.accounting_validated_at IS NOT NULL
           AND nullif(btrim(c.legal_name),'') IS NOT NULL AND nullif(btrim(c.cnpj),'') IS NOT NULL)
    INTO n, validated FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active IS TRUE;
  IF n<>1 THEN fiscal := 'issuer_ambiguous'; ELSIF validated IS NOT TRUE THEN fiscal := 'issuer_not_validated'; END IF;
  cat := EXISTS (SELECT 1 FROM platform_private.b2b_actor_scope(uid) x WHERE x.has_catalog IS TRUE);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('partner_id',p.id,'razao_social',p.razao_social,
           'order_create', fiscal IS NULL AND cat) ORDER BY p.razao_social, p.id),'[]'::jsonb)
    INTO partners FROM public.partner_accounts p
   WHERE p.commercial_owner_organization_id=org
     AND platform_private.seller_commercial_target_reason(uid,p.id) IS NULL;
  RETURN jsonb_build_object('contract','seller_portfolio_capability_v1','version',2,'ready',true,'organization_id',org,
    'reason',CASE WHEN jsonb_array_length(partners)=0 THEN 'no_partner_in_scope' WHEN NOT cat THEN 'catalog_feature_disabled' ELSE fiscal END,
    'fiscal_block',fiscal,
    'order_create', jsonb_array_length(partners)>0 AND fiscal IS NULL AND cat,
    'quote_respond', jsonb_array_length(partners)>0,
    'partners',partners);
END $f$;
REVOKE ALL ON FUNCTION public.seller_portfolio_capability_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_portfolio_capability_v1() TO authenticated;

-- Pedidos e cotações da carteira própria (leitura). Sem preço interno de terceiros; só pedidos de parceiros atribuídos.
CREATE FUNCTION public.seller_portfolio_orders_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE uid uuid := auth.uid(); org uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF platform_private.seller_commercial_target_reason(uid, NULL) IS NOT NULL THEN RAISE EXCEPTION 'SELLER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  org := public.h15_actor_organization();
  RETURN jsonb_build_object('contract','seller_portfolio_orders_v1','orders',COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id',o.id,'numero',o.numero,'partner_id',o.partner_id,'razao_social',p.razao_social,
      'status',o.status,'total',o.total,'created_at',o.created_at,'created_by_me',o.created_by=uid,
      'items',CASE WHEN o.status='aguardando_cotacao' THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'quantidade',i.quantidade,
          'product_id',i.product_id,'microrganismo_id',i.microrganismo_id,'produto_nome_snapshot',i.produto_nome_snapshot,'unidade_medida',i.unidade_medida,'volume_ml',i.volume_ml) ORDER BY i.id)
        FROM public.partner_order_items i WHERE i.order_id=o.id),'[]'::jsonb) ELSE '[]'::jsonb END)
      ORDER BY o.created_at DESC, o.id)
    FROM public.partner_orders o JOIN public.partner_accounts p ON p.id=o.partner_id
   WHERE p.commercial_owner_organization_id=org
     AND platform_private.seller_commercial_target_reason(uid,o.partner_id) IS NULL),'[]'::jsonb));
END $f$;
REVOKE ALL ON FUNCTION public.seller_portfolio_orders_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_portfolio_orders_v1() TO authenticated;

-- Visão do administrador para atribuir carteira pela interface: vendedores, parceiros e atribuições da PRÓPRIA empresa.
CREATE FUNCTION public.admin_seller_portfolio_overview_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_org uuid := platform_private.seller_actor_org('administrador'::public.app_role);
BEGIN
  IF v_org IS NULL OR v_org IS DISTINCT FROM public.h15_actor_organization() THEN RAISE EXCEPTION 'SELLER_PORTFOLIO_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('contract','admin_seller_portfolio_overview_v1','organization_id',v_org,
    'sellers',COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',pr.user_id,'nome',pr.nome) ORDER BY pr.nome, pr.user_id)
      FROM public.profiles pr WHERE pr.organization_id=v_org AND pr.ativo IS TRUE
       AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=pr.user_id AND r.role='vendedor'::public.app_role)),'[]'::jsonb),
    'partners',COALESCE((SELECT jsonb_agg(jsonb_build_object('partner_id',p.id,'razao_social',p.razao_social) ORDER BY p.razao_social, p.id)
      FROM public.partner_accounts p WHERE p.commercial_owner_organization_id=v_org AND p.ativo IS TRUE AND p.deleted_at IS NULL),'[]'::jsonb),
    'assignments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'seller_user_id',a.seller_user_id,'partner_id',a.partner_id,
        'assigned_at',a.assigned_at,'reason',a.reason,'revoked_at',a.revoked_at,'revoke_reason',a.revoke_reason,
        'seller_active',EXISTS(SELECT 1 FROM public.profiles sp WHERE sp.user_id=a.seller_user_id AND sp.organization_id=v_org AND sp.ativo IS TRUE)
          AND EXISTS(SELECT 1 FROM public.user_roles sr WHERE sr.user_id=a.seller_user_id AND sr.role='vendedor'::public.app_role),
        'partner_active',EXISTS(SELECT 1 FROM public.partner_accounts pp WHERE pp.id=a.partner_id AND pp.ativo IS TRUE AND pp.deleted_at IS NULL)) ORDER BY a.assigned_at DESC, a.id)
      FROM platform_private.seller_portfolio_assignments a WHERE a.organization_id=v_org),'[]'::jsonb));
END $f$;
REVOKE ALL ON FUNCTION public.admin_seller_portfolio_overview_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_seller_portfolio_overview_v1() TO authenticated;

-- Despachante dedicado da resposta de cotação. Não vendedor: chama o validador compartilhado LIVE, inalterado.
-- Vendedor exclusivo: só o pedido informado, mesma linhagem gravada, mesmas checagens estruturais e carteira vigente.
-- Não usa ticket nem cria autoridade reaproveitável por outro escritor da transação.
CREATE FUNCTION platform_private.seller_quote_origin_dispatch(p_order uuid, s jsonb, partner uuid, client uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE uid uuid := auth.uid(); o record; p public.partner_accounts; org uuid; r text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF platform_private.seller_commercial_actor() IS NOT TRUE THEN
    PERFORM platform_private.c2_external_origin_assert(s,partner,client);
    RETURN;
  END IF;
  SELECT po.partner_id, po.cliente_id, po.c2_external_origin_snapshot AS snap, po.status::text AS status INTO o
    FROM public.partner_orders po WHERE po.id=p_order;
  IF NOT FOUND OR o.partner_id IS DISTINCT FROM partner OR o.cliente_id IS DISTINCT FROM client OR o.snap IS DISTINCT FROM s THEN
    RAISE EXCEPTION 'SELLER_QUOTE_ORIGIN_DENIED' USING ERRCODE='42501';
  END IF;
  -- Só cotação pendente, ou replay do próprio recibo deste vendedor para este pedido.
  IF o.status <> 'aguardando_cotacao' AND NOT EXISTS (SELECT 1 FROM platform_private.b2b_quote_response_receipts rr
       WHERE rr.order_id=p_order AND rr.actor_id=uid) THEN
    RAISE EXCEPTION 'SELLER_QUOTE_STATE_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO p FROM public.partner_accounts WHERE id=partner FOR SHARE;
  org := p.commercial_owner_organization_id;
  IF NOT FOUND OR p.ativo IS NOT TRUE OR p.deleted_at IS NOT NULL OR org IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.organizations og WHERE og.id=org AND og.ativo AND og.status='ativa')
   OR EXISTS(SELECT 1 FROM public.organizations og WHERE og.partner_account_id=partner)
   OR NOT platform_private.c2_external_origin_contract_valid(s)
   OR s->>'organization_id' IS DISTINCT FROM org::text OR s->>'partner_id' IS DISTINCT FROM partner::text
  THEN RAISE EXCEPTION 'C2_EXTERNAL_ORIGIN_DENIED' USING ERRCODE='42501'; END IF;
  IF client IS DISTINCT FROM p.client_id OR (client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=client AND c.organization_id=org))
  THEN RAISE EXCEPTION 'C2_EXTERNAL_CLIENT_DENIED' USING ERRCODE='42501'; END IF;
  IF public.h15_actor_organization() IS DISTINCT FROM org THEN RAISE EXCEPTION 'C2_SELLER_TARGET_DENIED:tenant' USING ERRCODE='42501'; END IF;
  r := platform_private.seller_commercial_target_reason(uid, partner);
  IF r IS NOT NULL THEN RAISE EXCEPTION 'C2_SELLER_TARGET_DENIED:%', r USING ERRCODE='42501'; END IF;
END $f$;
REVOKE ALL ON FUNCTION platform_private.seller_quote_origin_dispatch(uuid,jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated;
