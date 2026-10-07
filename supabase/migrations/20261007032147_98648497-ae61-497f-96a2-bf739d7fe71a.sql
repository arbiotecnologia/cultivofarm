-- Cadastro empresarial completo (Plataforma). Rollback: ver docs/auditorias/plataforma-aba-empresa-2026-10-07.md
CREATE OR REPLACE FUNCTION platform_private.onboarding_validar(_d jsonb)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $function$
DECLARE
  spec jsonb := '{"razao_social":200,"nome_fantasia":200,"cnpj":18,"inscricao_estadual":20,"regime_tributario":40,"cep":9,"logradouro":200,"numero":20,"complemento":120,"bairro":120,"cidade":120,"uf":2,"telefone":20,"email_contato":255,"responsavel_nome":160,"responsavel_cargo":120,"fuso_horario":64,"idioma":10}'::jsonb;
  regimes constant text[] := ARRAY['simples_nacional','mei','lucro_presumido','lucro_real','imune_isenta','outros'];
  fusos constant text[] := ARRAY['America/Sao_Paulo','America/Manaus','America/Cuiaba','America/Campo_Grande','America/Rio_Branco','America/Noronha'];
  ufs constant text[] := ARRAY['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  k text; v jsonb; s text; out jsonb := '{}'::jsonb;
BEGIN
  IF _d IS NULL OR jsonb_typeof(_d) <> 'object' THEN RAISE EXCEPTION 'org_invalid: dados inválidos'; END IF;
  IF length(_d::text) > 8000 THEN RAISE EXCEPTION 'org_invalid: dados muito grandes'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(_d) LOOP
    IF k = 'confirmado' THEN
      IF jsonb_typeof(v) <> 'boolean' THEN RAISE EXCEPTION 'org_invalid: confirmado inválido'; END IF;
      out := out || jsonb_build_object(k, v); CONTINUE;
    END IF;
    IF NOT spec ? k THEN RAISE EXCEPTION 'org_invalid: campo não permitido (%)', left(k, 40); END IF;
    IF jsonb_typeof(v) = 'null' THEN CONTINUE; END IF;
    IF jsonb_typeof(v) <> 'string' THEN RAISE EXCEPTION 'org_invalid: % deve ser texto', k; END IF;
    s := btrim(v #>> '{}');
    IF length(s) > (spec->>k)::int THEN RAISE EXCEPTION 'org_invalid: % muito longo', k; END IF;
    IF s ~ '[\x00-\x08\x0B\x0C\x0E-\x1F<>]' THEN RAISE EXCEPTION 'org_invalid: % contém caracteres inválidos', k; END IF;
    IF s <> '' THEN
      IF k = 'uf' AND NOT (upper(s) = ANY(ufs)) THEN RAISE EXCEPTION 'org_invalid: UF inválida'; END IF;
      IF k = 'cep' THEN IF s !~ '^\d{5}-?\d{3}$' THEN RAISE EXCEPTION 'org_invalid: CEP inválido'; END IF;
        s := regexp_replace(s,'\D','','g'); s := substr(s,1,5)||'-'||substr(s,6,3); END IF;
      IF k = 'telefone' THEN s := regexp_replace(s,'\D','','g'); IF s !~ '^\d{10,11}$' THEN RAISE EXCEPTION 'org_invalid: telefone inválido'; END IF; END IF;
      IF k = 'email_contato' THEN s := lower(s); IF s !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'org_invalid: e-mail inválido'; END IF; END IF;
      IF k = 'fuso_horario' AND NOT (s = ANY(fusos)) THEN RAISE EXCEPTION 'org_invalid: fuso horário inválido'; END IF;
      IF k = 'regime_tributario' AND NOT (s = ANY(regimes)) THEN RAISE EXCEPTION 'org_invalid: regime tributário inválido'; END IF;
      IF k = 'cnpj' AND NOT platform_private.cnpj_valido(s) THEN RAISE EXCEPTION 'org_invalid: CNPJ inválido (dígitos verificadores)'; END IF;
      IF k = 'uf' THEN s := upper(s); END IF;
    END IF;
    out := out || jsonb_build_object(k, s);
  END LOOP;
  RETURN out;
END $function$;

-- Subconjunto editável pela plataforma (anti mass-assignment).
CREATE OR REPLACE FUNCTION platform_private.org_cadastro_patch(_d jsonb)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $function$
DECLARE
  permitidos constant text[] := ARRAY['telefone','email_contato','responsavel_nome','responsavel_cargo','cep','logradouro','numero','complemento','bairro','cidade','uf','inscricao_estadual','fuso_horario'];
  k text;
BEGIN
  IF _d IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF jsonb_typeof(_d) <> 'object' THEN RAISE EXCEPTION 'platform_invalid: dados inválidos' USING ERRCODE='22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(_d) LOOP
    IF NOT (k = ANY(permitidos)) THEN RAISE EXCEPTION 'platform_invalid: campo não permitido (%)', left(k,40) USING ERRCODE='22023'; END IF;
  END LOOP;
  RETURN platform_private.onboarding_validar(_d);
END $function$;
REVOKE ALL ON FUNCTION platform_private.org_cadastro_patch(jsonb) FROM PUBLIC, anon;

DROP FUNCTION IF EXISTS public.platform_update_organization_profile(uuid,text,text,text,text,timestamptz,uuid);
DROP FUNCTION IF EXISTS platform_private.update_organization_profile_core(uuid,text,text,text,text,timestamptz,uuid);

CREATE FUNCTION platform_private.update_organization_profile_core(_org uuid, _razao_social text, _nome_fantasia text, _email text, _motivo text, _expected_updated_at timestamptz, _idempotency_key uuid, _dados jsonb DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  o public.organizations%ROWTYPE; a public.organization_profile_audit%ROWTYPE;
  v_razao text; v_fant text; v_email text; v_motivo text; v_old jsonb; v_new jsonb;
  v_patch jsonb; v_dold jsonb; v_dnew jsonb; v_fuso text; k text; v text;
  v_chg_old jsonb := '{}'::jsonb; v_chg_new jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  IF _idempotency_key IS NULL THEN RAISE EXCEPTION 'platform_invalid: chave idempotente obrigatória' USING ERRCODE='22023'; END IF;
  v_motivo := btrim(coalesce(_motivo,''));
  IF char_length(v_motivo) < 2 THEN RAISE EXCEPTION 'platform_invalid: motivo obrigatório (mínimo 2 caracteres)' USING ERRCODE='22023'; END IF;
  v_razao := regexp_replace(btrim(coalesce(_razao_social,'')), '\s+', ' ', 'g');
  v_fant  := nullif(regexp_replace(btrim(coalesce(_nome_fantasia,'')), '\s+', ' ', 'g'), '');
  v_email := lower(btrim(coalesce(_email,'')));
  IF char_length(v_razao) < 2 OR char_length(v_razao) > 200 THEN RAISE EXCEPTION 'platform_invalid: razão social inválida' USING ERRCODE='22023'; END IF;
  IF v_fant IS NOT NULL AND char_length(v_fant) > 200 THEN RAISE EXCEPTION 'platform_invalid: nome fantasia inválido' USING ERRCODE='22023'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 254 THEN RAISE EXCEPTION 'platform_invalid: e-mail inválido' USING ERRCODE='22023'; END IF;
  BEGIN
    v_patch := platform_private.org_cadastro_patch(_dados);
  EXCEPTION WHEN raise_exception THEN
    RAISE EXCEPTION 'platform_invalid: %', replace(SQLERRM,'org_invalid: ','') USING ERRCODE='22023';
  END;

  SELECT * INTO o FROM public.organizations WHERE id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: empresa inexistente' USING ERRCODE='22023'; END IF;

  SELECT * INTO a FROM public.organization_profile_audit WHERE idempotency_key=_idempotency_key;
  IF FOUND THEN
    IF a.organization_id=_org AND a.reason=v_motivo
       AND a.new_values->>'razao_social' IS NOT DISTINCT FROM v_razao
       AND a.new_values->>'nome_fantasia' IS NOT DISTINCT FROM v_fant
       AND a.new_values->>'email_corporativo' IS NOT DISTINCT FROM v_email
       AND coalesce(a.new_values->'dados_patch','{}'::jsonb) = v_patch THEN
      RETURN jsonb_build_object('organization_id',_org,'updated_at',o.updated_at,'idempotent',true);
    END IF;
    RAISE EXCEPTION 'platform_conflict: chave idempotente já usada com outro conteúdo' USING ERRCODE='40001';
  END IF;

  IF _expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'platform_conflict: a empresa foi alterada por outra pessoa; recarregue antes de salvar' USING ERRCODE='40001';
  END IF;

  -- Merge seguro: preserva chaves não enviadas/desconhecidas; '' remove só a chave enviada.
  v_dold := coalesce(o.onboarding_dados,'{}'::jsonb);
  v_dnew := v_dold;
  FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(v_patch) LOOP
    IF v = '' THEN v_dnew := v_dnew - k; ELSE v_dnew := v_dnew || jsonb_build_object(k, v); END IF;
    IF (v_dold->>k) IS DISTINCT FROM (v_dnew->>k) THEN
      v_chg_old := v_chg_old || jsonb_build_object(k, v_dold->k);
      v_chg_new := v_chg_new || jsonb_build_object(k, v_dnew->k);
    END IF;
  END LOOP;
  v_fuso := CASE WHEN v_patch ? 'fuso_horario' THEN nullif(v_patch->>'fuso_horario','') ELSE o.fuso_horario END;

  IF o.razao_social IS NOT DISTINCT FROM v_razao AND o.nome IS NOT DISTINCT FROM v_razao
     AND o.nome_fantasia IS NOT DISTINCT FROM v_fant AND o.email_corporativo IS NOT DISTINCT FROM v_email
     AND v_chg_new = '{}'::jsonb AND o.fuso_horario IS NOT DISTINCT FROM v_fuso THEN
    RAISE EXCEPTION 'platform_invalid: nenhuma alteração para salvar' USING ERRCODE='22023';
  END IF;

  v_old := jsonb_build_object('razao_social',o.razao_social,'nome',o.nome,'nome_fantasia',o.nome_fantasia,'email_corporativo',o.email_corporativo,'fuso_horario',o.fuso_horario,'dados',v_chg_old,'updated_at',o.updated_at);
  PERFORM platform_private.issue_ticket('org_write', _org);
  UPDATE public.organizations SET razao_social=v_razao, nome=v_razao, nome_fantasia=v_fant,
    email_corporativo=v_email, fuso_horario=v_fuso, onboarding_dados=v_dnew, updated_at=now()
   WHERE id=_org RETURNING * INTO o;
  v_new := jsonb_build_object('razao_social',o.razao_social,'nome',o.nome,'nome_fantasia',o.nome_fantasia,'email_corporativo',o.email_corporativo,'fuso_horario',o.fuso_horario,'dados',v_chg_new,'dados_patch',v_patch,'updated_at',o.updated_at);
  INSERT INTO public.organization_profile_audit(organization_id,actor_user_id,origin,reason,idempotency_key,old_values,new_values)
  VALUES (_org, auth.uid(), 'platform_rpc', v_motivo, _idempotency_key, v_old, v_new);
  RETURN jsonb_build_object('organization_id',_org,'updated_at',o.updated_at,'idempotent',false);
END $function$;
REVOKE ALL ON FUNCTION platform_private.update_organization_profile_core(uuid,text,text,text,text,timestamptz,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.update_organization_profile_core(uuid,text,text,text,text,timestamptz,uuid,jsonb) TO authenticated, service_role;

CREATE FUNCTION public.platform_update_organization_profile(_org uuid, _razao_social text, _nome_fantasia text, _email text, _motivo text, _expected_updated_at timestamptz, _idempotency_key uuid, _dados jsonb DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  RETURN platform_private.update_organization_profile_core(_org,_razao_social,_nome_fantasia,_email,_motivo,_expected_updated_at,_idempotency_key,_dados);
END $function$;
REVOKE ALL ON FUNCTION public.platform_update_organization_profile(uuid,text,text,text,text,timestamptz,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_organization_profile(uuid,text,text,text,text,timestamptz,uuid,jsonb) TO authenticated, service_role;

-- Criação: persiste contatos/endereço na mesma transação.
DROP FUNCTION IF EXISTS public.platform_create_organization(text,text,text,text,text,boolean);
CREATE FUNCTION public.platform_create_organization(_nome text, _nome_fantasia text, _cnpj text, _email text, _plan_key text, _rascunho boolean DEFAULT false, _dados jsonb DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_id uuid; v_cnpj text; v_plan uuid; v_status text; v_patch jsonb; v_dados jsonb := '{}'::jsonb; k text; v text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING errcode='42501'; END IF;
  IF _nome IS NULL OR length(btrim(_nome))<2 OR length(_nome)>200 THEN RAISE EXCEPTION 'platform_invalid: nome/razão social obrigatório' USING ERRCODE='22023'; END IF;
  IF length(coalesce(_nome_fantasia,''))>200 THEN RAISE EXCEPTION 'platform_invalid: nome fantasia muito longo' USING ERRCODE='22023'; END IF;
  IF _email IS NULL OR length(_email)>255 OR btrim(_email)!~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'platform_invalid: e-mail corporativo inválido' USING ERRCODE='22023'; END IF;
  v_cnpj:=platform_private.cnpj_normalizar(_cnpj); IF v_cnpj IS NOT NULL AND NOT platform_private.cnpj_valido(v_cnpj) THEN RAISE EXCEPTION 'platform_invalid: CNPJ inválido (dígitos verificadores)' USING ERRCODE='22023'; END IF;
  IF v_cnpj IS NULL AND NOT coalesce(_rascunho,false) THEN RAISE EXCEPTION 'platform_invalid: sem CNPJ, crie como rascunho' USING ERRCODE='22023'; END IF;
  BEGIN
    v_patch := platform_private.org_cadastro_patch(_dados);
  EXCEPTION WHEN raise_exception THEN
    RAISE EXCEPTION 'platform_invalid: %', replace(SQLERRM,'org_invalid: ','') USING ERRCODE='22023';
  END;
  FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(v_patch) LOOP
    IF v <> '' THEN v_dados := v_dados || jsonb_build_object(k, v); END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['telefone','cep','logradouro','numero','bairro','cidade','uf'] LOOP
    IF NOT v_dados ? k THEN RAISE EXCEPTION 'platform_invalid: % obrigatório', k USING ERRCODE='22023'; END IF;
  END LOOP;
  IF v_cnpj IS NOT NULL AND EXISTS(SELECT 1 FROM public.organizations WHERE cnpj_normalizado=v_cnpj) THEN RAISE EXCEPTION 'platform_duplicate: CNPJ já cadastrado' USING errcode='23505'; END IF;
  SELECT p.id INTO v_plan FROM public.saas_plans p WHERE p.key=_plan_key AND p.active; IF v_plan IS NULL THEN RAISE EXCEPTION 'platform_invalid: plano inexistente ou inativo' USING ERRCODE='22023'; END IF;
  v_status:=CASE WHEN coalesce(_rascunho,false) THEN 'rascunho' ELSE 'aguardando_ativacao' END;
  PERFORM platform_private.issue_ticket('org_create','00000000-0000-0000-0000-000000000000'::uuid);
  INSERT INTO public.organizations(nome,razao_social,nome_fantasia,cnpj,cnpj_normalizado,email_corporativo,status,ativo,onboarding_dados,fuso_horario)
  VALUES(btrim(_nome),btrim(_nome),nullif(btrim(coalesce(_nome_fantasia,'')),''),v_cnpj,v_cnpj,lower(btrim(_email)),v_status,true,v_dados,v_dados->>'fuso_horario') RETURNING id INTO v_id;
  INSERT INTO public.organization_status_audit(organization_id,status_anterior,status_novo,ator_id,motivo) VALUES(v_id,NULL,v_status,auth.uid(),'criação pela plataforma'); RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.platform_create_organization(text,text,text,text,text,boolean,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_organization(text,text,text,text,text,boolean,jsonb) TO authenticated, service_role;

-- Resumo fiscal mínimo (sem certificados, credenciais, séries ou configurações internas).
CREATE OR REPLACE FUNCTION platform_private.organization_fiscal_summary_core(_org uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE r record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  SELECT f.legal_name, f.cnpj, f.state_registration, f.municipal_registration, f.tax_regime, f.crt,
         f.primary_cnae, f.configuration_status, f.nfe_enabled, f.nfse_enabled, f.is_active, f.updated_at
    INTO r FROM public.company_fiscal_settings f
   WHERE f.organization_id = _org
   ORDER BY f.is_active DESC NULLS LAST, f.updated_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('configurado', false); END IF;
  RETURN jsonb_build_object('configurado', true, 'razao_social', r.legal_name, 'cnpj', r.cnpj,
    'inscricao_estadual', r.state_registration, 'inscricao_municipal', r.municipal_registration,
    'regime_tributario', r.tax_regime, 'crt', r.crt, 'cnae_principal', r.primary_cnae,
    'situacao', r.configuration_status, 'nfe_habilitada', r.nfe_enabled, 'nfse_habilitada', r.nfse_enabled,
    'ativo', r.is_active, 'atualizado_em', r.updated_at);
END $function$;
REVOKE ALL ON FUNCTION platform_private.organization_fiscal_summary_core(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.organization_fiscal_summary_core(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_get_organization_fiscal_summary(_org uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  RETURN platform_private.organization_fiscal_summary_core(_org);
END $function$;
REVOKE ALL ON FUNCTION public.platform_get_organization_fiscal_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_organization_fiscal_summary(uuid) TO authenticated, service_role;