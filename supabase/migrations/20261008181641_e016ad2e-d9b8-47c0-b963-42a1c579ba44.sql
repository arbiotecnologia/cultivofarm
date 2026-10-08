DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') OR EXISTS (SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref<>'swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'canonical_project_required'; END IF; END $$;
ALTER TABLE public.partner_accounts ADD COLUMN IF NOT EXISTS commercial_owner_organization_id uuid REFERENCES public.organizations(id);
COMMENT ON COLUMN public.partner_accounts.commercial_owner_organization_id IS 'Commercial registering organization, server-derived; distinct from the partner own tenant. No bulk legacy backfill.';
CREATE OR REPLACE FUNCTION public.guard_commercial_partner_registration() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE v_org uuid; v_owner uuid;
BEGIN
 v_org := public.h15_actor_organization();
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT (public.has_role(auth.uid(),'administrador'::public.app_role) OR public.has_role(auth.uid(),'gestor_comercial'::public.app_role)) THEN RAISE EXCEPTION 'cadastro_context_required' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.commercial_owner_organization_id IS NOT NULL AND NEW.commercial_owner_organization_id IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'cadastro_owner_denied' USING ERRCODE='42501'; END IF;
  NEW.commercial_owner_organization_id:=v_org;
  NEW.created_by:=auth.uid(); NEW.codigo:='PARC-'||NEW.id::text;
 ELSE
  v_owner:=OLD.commercial_owner_organization_id;
  IF v_owner IS NULL THEN SELECT c.organization_id INTO v_owner FROM public.clientes c WHERE c.id=OLD.client_id; END IF;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'cadastro_owner_denied' USING ERRCODE='42501'; END IF;
  IF NEW.commercial_owner_organization_id IS DISTINCT FROM OLD.commercial_owner_organization_id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.id IS DISTINCT FROM OLD.id OR NEW.codigo IS DISTINCT FROM OLD.codigo THEN RAISE EXCEPTION 'cadastro_identity_immutable' USING ERRCODE='42501'; END IF;
  -- Individual edit with proven OLD client ownership, never a bulk legacy backfill.
  NEW.commercial_owner_organization_id:=v_owner;
 END IF;
 IF NEW.client_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=NEW.client_id AND c.organization_id=v_org) THEN RAISE EXCEPTION 'cadastro_client_scope_required' USING ERRCODE='42501'; END IF;
 IF NEW.consultor_responsavel IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.consultor_responsavel AND p.ativo IS TRUE AND p.organization_id=v_org) THEN RAISE EXCEPTION 'cadastro_consultant_scope_denied' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(NEW.razao_social,'')))<2 OR length(NEW.razao_social)>200 THEN RAISE EXCEPTION 'cadastro_invalid_name' USING ERRCODE='22023'; END IF;
 IF NEW.desconto_padrao IS NULL OR NEW.desconto_padrao::text IN ('NaN','Infinity','-Infinity') OR NEW.desconto_padrao<0 OR NEW.desconto_padrao>100
 OR (NEW.comissao_percentual IS NOT NULL AND (NEW.comissao_percentual::text IN ('NaN','Infinity','-Infinity') OR NEW.comissao_percentual<0 OR NEW.comissao_percentual>100))
 OR (NEW.limite_credito_brl IS NOT NULL AND (NEW.limite_credito_brl::text IN ('NaN','Infinity','-Infinity') OR NEW.limite_credito_brl<0))
 OR (NEW.meta_mensal_brl IS NOT NULL AND (NEW.meta_mensal_brl::text IN ('NaN','Infinity','-Infinity') OR NEW.meta_mensal_brl<0)) OR NEW.prazo_pagamento_padrao_dias<0 THEN RAISE EXCEPTION 'cadastro_invalid_commercial_values' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $function$;
DROP POLICY IF EXISTS d51_5_partner_accounts_tenant_guard ON public.partner_accounts;
CREATE POLICY d51_5_partner_accounts_tenant_guard ON public.partner_accounts AS RESTRICTIVE FOR ALL TO authenticated
USING (id=public.get_user_partner_id() OR (commercial_owner_organization_id=public.h15_actor_organization() AND (client_id IS NULL OR EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=partner_accounts.client_id AND c.organization_id=commercial_owner_organization_id))) OR (commercial_owner_organization_id IS NULL AND EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=partner_accounts.client_id AND c.organization_id=public.h15_actor_organization())))
WITH CHECK (commercial_owner_organization_id=public.h15_actor_organization() AND (client_id IS NULL OR EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=partner_accounts.client_id AND c.organization_id=commercial_owner_organization_id)));
-- Rollback: retain explicit ownership and containment; do not drop the column after new registrations. A reviewed successor may require client_id for future writes without deleting registrations.
