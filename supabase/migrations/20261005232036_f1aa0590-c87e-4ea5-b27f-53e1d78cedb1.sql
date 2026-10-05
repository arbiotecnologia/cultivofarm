BEGIN;

CREATE OR REPLACE FUNCTION public.platform_create_organization(_nome text,_nome_fantasia text,_cnpj text,_email text,_plan_key text,_rascunho boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_id uuid; v_cnpj text; v_plan uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING errcode='42501'; END IF;
  IF _nome IS NULL OR length(btrim(_nome))<2 OR length(_nome)>200 THEN RAISE EXCEPTION 'platform_invalid: nome/razão social obrigatório' USING ERRCODE='22023'; END IF;
  IF length(coalesce(_nome_fantasia,''))>200 THEN RAISE EXCEPTION 'platform_invalid: nome fantasia muito longo' USING ERRCODE='22023'; END IF;
  IF _email IS NULL OR length(_email)>255 OR btrim(_email)!~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'platform_invalid: e-mail corporativo inválido' USING ERRCODE='22023'; END IF;
  v_cnpj:=platform_private.cnpj_normalizar(_cnpj); IF v_cnpj IS NOT NULL AND NOT platform_private.cnpj_valido(v_cnpj) THEN RAISE EXCEPTION 'platform_invalid: CNPJ inválido (dígitos verificadores)' USING ERRCODE='22023'; END IF;
  IF v_cnpj IS NULL AND NOT coalesce(_rascunho,false) THEN RAISE EXCEPTION 'platform_invalid: sem CNPJ, crie como rascunho' USING ERRCODE='22023'; END IF;
  IF v_cnpj IS NOT NULL AND EXISTS(SELECT 1 FROM public.organizations WHERE cnpj_normalizado=v_cnpj) THEN RAISE EXCEPTION 'platform_duplicate: CNPJ já cadastrado' USING errcode='23505'; END IF;
  SELECT p.id INTO v_plan FROM public.saas_plans p WHERE p.key=_plan_key AND p.active; IF v_plan IS NULL THEN RAISE EXCEPTION 'platform_invalid: plano inexistente ou inativo' USING ERRCODE='22023'; END IF;
  v_status:=CASE WHEN coalesce(_rascunho,false) THEN 'rascunho' ELSE 'aguardando_ativacao' END;
  PERFORM platform_private.issue_ticket('org_create','00000000-0000-0000-0000-000000000000'::uuid);
  INSERT INTO public.organizations(nome,razao_social,nome_fantasia,cnpj,cnpj_normalizado,email_corporativo,status,ativo) VALUES(btrim(_nome),btrim(_nome),nullif(btrim(coalesce(_nome_fantasia,'')),''),v_cnpj,v_cnpj,lower(btrim(_email)),v_status,true) RETURNING id INTO v_id;
  INSERT INTO public.organization_status_audit(organization_id,status_anterior,status_novo,ator_id,motivo) VALUES(v_id,NULL,v_status,auth.uid(),'criação pela plataforma'); RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_create_organization(text,text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_organization(text,text,text,text,text,boolean) TO authenticated;

COMMIT;