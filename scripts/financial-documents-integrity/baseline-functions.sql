-- Exact live bodies captured SELECT-only on swzpzcwiasxmjutrmvkm, 2026-10-19.
CREATE OR REPLACE FUNCTION platform_private.platform_actor_access_ready(p_user uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE)
 AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_user AND (i.access_operation_status='processing' OR (i.access_valid_after IS NOT NULL AND auth.uid()=p_user AND to_timestamp(COALESCE((auth.jwt()->>'iat')::bigint,0))<=i.access_valid_after)));
$function$;
CREATE OR REPLACE FUNCTION platform_private.h15_actor_organization()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id);
$function$;
CREATE OR REPLACE FUNCTION platform_private.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id));
$function$;
CREATE OR REPLACE FUNCTION public.h15_actor_organization()
 RETURNS uuid LANGUAGE sql STABLE SET search_path TO ''
AS $function$ SELECT platform_private.h15_actor_organization(); $function$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO ''
AS $function$ SELECT platform_private.has_role(_user_id,_role); $function$;
CREATE OR REPLACE FUNCTION public.fn_authz_uid_scope_ok(_uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NULL
      OR (_uid IS NOT NULL AND _uid = auth.uid())
      OR public.has_role(auth.uid(), 'administrador'::app_role);
$function$;
CREATE OR REPLACE FUNCTION public.is_financial_staff(_uid uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.fn_authz_uid_scope_ok(_uid) THEN
    RETURN false;
  END IF;
  RETURN has_role(_uid, 'administrador'::app_role)
      OR has_role(_uid, 'gestor'::app_role)
      OR has_role(_uid, 'financeiro'::app_role);
END;
$function$;
CREATE OR REPLACE FUNCTION public.storage1_path_strict(p_name text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$ SELECT p_name IS NOT NULL AND length(p_name) BETWEEN 1 AND 1024 AND p_name !~ '(^/|/$|//|\\|%|[[:cntrl:]])' AND p_name !~ '(^|/)\.{1,2}(/|$)'; $function$;
CREATE OR REPLACE FUNCTION public.guard_tenant_organization_id()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  v_org := public.h15_actor_organization();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'tenant_context_required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.organization_id IS NULL THEN
    NEW.organization_id := v_org;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'tenant_scope_violation' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'tenant_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_financial_document_soft_delete(p_document_id uuid, p_reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_reason text; v_active boolean; v_rows integer;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão não autenticada' USING ERRCODE='42501'; END IF;
 IF NOT public.is_financial_staff(v_uid) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL THEN RAISE EXCEPTION 'Documento inválido' USING ERRCODE='22023'; END IF;
 v_reason:=btrim(coalesce(p_reason,''));
 IF length(v_reason)=0 THEN RAISE EXCEPTION 'Motivo da exclusão é obrigatório' USING ERRCODE='22023'; END IF;
 IF length(v_reason)>500 THEN RAISE EXCEPTION 'Motivo excede 500 caracteres' USING ERRCODE='22023'; END IF;
 SELECT (deleted_at IS NULL) INTO v_active FROM public.financial_documents WHERE id=p_document_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento não encontrado' USING ERRCODE='P0002'; END IF;
 IF NOT v_active THEN RAISE EXCEPTION 'Documento já removido' USING ERRCODE='40001'; END IF;
 UPDATE public.financial_documents SET deleted_at=now(),deleted_by=v_uid,delete_reason=v_reason WHERE id=p_document_id AND deleted_at IS NULL;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'Conflito concorrente ao remover documento' USING ERRCODE='40001'; END IF;
 RETURN p_document_id;
END; $function$;
CREATE OR REPLACE FUNCTION public.financial_storage_object_permitted(_bucket text, _name text)
 RETURNS boolean LANGUAGE plpgsql STABLE SET search_path TO ''
AS $function$
DECLARE v_org uuid; v_parts text[]; v_owner_type text; v_owner_id uuid;
BEGIN
  IF NOT public.storage1_path_strict(_name) THEN RETURN false; END IF;
  v_org := public.h15_actor_organization();
  IF v_org IS NULL OR NOT public.is_financial_staff(auth.uid()) THEN RETURN false; END IF;
  v_parts := storage.foldername(_name);
  IF _bucket IN ('financial-reports','financial-receipts') THEN
    RETURN array_length(v_parts,1) >= 1 AND v_parts[1] = v_org::text;
  END IF;
  IF _bucket <> 'financial-docs' OR array_length(v_parts,1) < 2 THEN RETURN false; END IF;
  v_owner_type := v_parts[1];
  BEGIN
  IF NOT public.storage1_path_strict(_name) THEN RETURN false; END IF; v_owner_id := v_parts[2]::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
  RETURN CASE v_owner_type
    WHEN 'RECEIVABLE' THEN EXISTS(SELECT 1 FROM public.accounts_receivable x WHERE x.id=v_owner_id AND x.organization_id=v_org)
    WHEN 'PAYABLE' THEN EXISTS(SELECT 1 FROM public.accounts_payable x WHERE x.id=v_owner_id AND x.organization_id=v_org)
    WHEN 'PAYMENT_RECEIVABLE' THEN EXISTS(SELECT 1 FROM public.receivable_payments x WHERE x.id=v_owner_id AND x.organization_id=v_org)
    WHEN 'PAYMENT_PAYABLE' THEN EXISTS(SELECT 1 FROM public.payable_payments x WHERE x.id=v_owner_id AND x.organization_id=v_org)
    WHEN 'FISCAL_INVOICE' THEN EXISTS(SELECT 1 FROM public.fiscal_invoices x WHERE x.id=v_owner_id AND x.organization_id=v_org)
    ELSE false END;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_audit_financial_documents()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
    VALUES ('financial_documents', NEW.id, 'FINANCIAL_DOCUMENT_UPLOADED', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, old_data, performed_by)
    VALUES ('financial_documents', OLD.id, 'FINANCIAL_DOCUMENT_DELETED', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_financial_audit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb; v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN v_old := to_jsonb(OLD);
  ELSIF TG_OP = 'DELETE' THEN v_old := to_jsonb(OLD);
  END IF;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES (TG_TABLE_NAME, COALESCE((NEW).id, (OLD).id), TG_OP, v_old, v_new, auth.uid());

  RETURN COALESCE(NEW, OLD);
END $function$;