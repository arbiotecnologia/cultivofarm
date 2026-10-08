DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'canonical_project_required'; END IF; END $$;

CREATE OR REPLACE FUNCTION public.guard_commercial_partner_registration()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
 v_org := public.h15_actor_organization();
 IF auth.uid() IS NULL OR v_org IS NULL THEN RAISE EXCEPTION 'cadastro_context_required' USING ERRCODE='42501'; END IF;
 IF NEW.client_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=NEW.client_id AND c.organization_id=v_org) THEN RAISE EXCEPTION 'cadastro_client_scope_required' USING ERRCODE='42501'; END IF;
 IF NEW.consultor_responsavel IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.consultor_responsavel AND p.ativo IS TRUE AND p.organization_id=v_org) THEN RAISE EXCEPTION 'cadastro_consultant_scope_denied' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  NEW.created_by:=auth.uid();
  NEW.codigo:='PARC-'||NEW.id::text;
 ELSE
  IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.id IS DISTINCT FROM OLD.id OR NEW.codigo IS DISTINCT FROM OLD.codigo THEN RAISE EXCEPTION 'cadastro_identity_immutable' USING ERRCODE='42501'; END IF;
 END IF;
 IF length(trim(coalesce(NEW.razao_social,'')))<2 OR length(NEW.razao_social)>200 THEN RAISE EXCEPTION 'cadastro_invalid_name' USING ERRCODE='22023'; END IF;
 IF NEW.desconto_padrao IS NULL OR NEW.desconto_padrao::text IN ('NaN','Infinity','-Infinity') OR NEW.desconto_padrao<0 OR NEW.desconto_padrao>100
 OR (NEW.comissao_percentual IS NOT NULL AND (NEW.comissao_percentual::text IN ('NaN','Infinity','-Infinity') OR NEW.comissao_percentual<0 OR NEW.comissao_percentual>100))
 OR (NEW.limite_credito_brl IS NOT NULL AND (NEW.limite_credito_brl::text IN ('NaN','Infinity','-Infinity') OR NEW.limite_credito_brl<0))
 OR (NEW.meta_mensal_brl IS NOT NULL AND (NEW.meta_mensal_brl::text IN ('NaN','Infinity','-Infinity') OR NEW.meta_mensal_brl<0))
 OR NEW.prazo_pagamento_padrao_dias<0 THEN RAISE EXCEPTION 'cadastro_invalid_commercial_values' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_commercial_partner_registration() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS commercial_partner_registration_guard ON public.partner_accounts;
CREATE TRIGGER commercial_partner_registration_guard BEFORE INSERT OR UPDATE ON public.partner_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_partner_registration();

DO $$ DECLARE constraint_name text; BEGIN
 IF EXISTS(SELECT 1 FROM public.clientes WHERE organization_id IS NOT NULL AND nullif(trim(cpf_cnpj),'') IS NOT NULL GROUP BY organization_id,upper(regexp_replace(cpf_cnpj,'[[:space:]./-]','','g')) HAVING count(*)>1) THEN RAISE EXCEPTION 'cadastro_document_conflicts_require_review'; END IF;
 FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid='public.clientes'::regclass AND contype='u' AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.clientes'::regclass AND attname='cpf_cnpj')]::smallint[] LOOP
 EXECUTE format('ALTER TABLE public.clientes DROP CONSTRAINT %I',constraint_name);
 END LOOP;
END $$;
DROP INDEX IF EXISTS public.clientes_cpf_cnpj_unique;
CREATE UNIQUE INDEX IF NOT EXISTS clientes_tenant_document_unique ON public.clientes(organization_id,upper(regexp_replace(cpf_cnpj,'[[:space:]./-]','','g'))) WHERE organization_id IS NOT NULL AND nullif(trim(cpf_cnpj),'') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.check_cliente_dependencies(_cliente_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_org uuid:=public.h15_actor_organization();
BEGIN
 IF v_uid IS NULL OR v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=_cliente_id AND c.organization_id=v_org) OR NOT(public.is_operational_staff(v_uid) OR public.can_user_access_cliente(v_uid,_cliente_id)) THEN RAISE EXCEPTION 'cadastro_client_scope_denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'fazendas',(SELECT count(*) FROM public.fazendas WHERE cliente_id=_cliente_id),
 'talhoes',(SELECT count(*) FROM public.talhoes t JOIN public.fazendas f ON f.id=t.fazenda_id WHERE f.cliente_id=_cliente_id),
 'ordens_servico',(SELECT count(*) FROM public.ordens_servico WHERE cliente_id=_cliente_id),
 'ordens_servico_onfarm',(SELECT count(*) FROM public.ordens_servico_onfarm WHERE cliente_id=_cliente_id),
 'registros_consultor',(SELECT count(*) FROM public.registros_consultor WHERE cliente_id=_cliente_id),
 'portal_solicitacoes',(SELECT count(*) FROM public.portal_solicitacoes WHERE cliente_id=_cliente_id),
 'entregas',(SELECT count(*) FROM public.entregas WHERE cliente_id=_cliente_id),
 'usuarios',(SELECT count(*) FROM public.profiles WHERE cliente_id=_cliente_id),
 'parceiros',(SELECT count(*) FROM public.partner_accounts WHERE client_id=_cliente_id),
 'documentos',(SELECT count(*) FROM public.cliente_documentos WHERE cliente_id=_cliente_id));
END $$;
REVOKE ALL ON FUNCTION public.check_cliente_dependencies(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.check_cliente_dependencies(uuid) TO authenticated,service_role;