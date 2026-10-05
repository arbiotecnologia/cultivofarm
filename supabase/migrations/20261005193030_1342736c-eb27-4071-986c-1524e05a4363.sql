CREATE OR REPLACE FUNCTION platform_private.onboarding_validar(_d jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  spec jsonb := '{"razao_social":200,"nome_fantasia":200,"cnpj":18,"inscricao_estadual":20,"regime_tributario":40,"cep":9,"logradouro":200,"numero":20,"bairro":120,"cidade":120,"uf":2,"telefone":20,"email_contato":255,"responsavel_nome":160,"responsavel_cargo":120,"fuso_horario":64,"idioma":10}'::jsonb;
  regimes constant text[] := ARRAY['simples_nacional','mei','lucro_presumido','lucro_real','imune_isenta','outros'];
  fusos constant text[] := ARRAY['America/Sao_Paulo','America/Manaus','America/Cuiaba','America/Campo_Grande','America/Rio_Branco','America/Noronha'];
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
      IF k = 'uf' AND s !~ '^[A-Za-z]{2}$' THEN RAISE EXCEPTION 'org_invalid: UF inválida'; END IF;
      IF k = 'cep' AND s !~ '^\d{5}-?\d{3}$' THEN RAISE EXCEPTION 'org_invalid: CEP inválido'; END IF;
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
END $$;

CREATE OR REPLACE FUNCTION public.org_onboarding_complete()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_org uuid; r record; d jsonb; v_cnpj text;
BEGIN
  v_org := public._org_admin_org();
  IF v_org IS NULL THEN RAISE EXCEPTION 'org_forbidden: apenas administrador da empresa' USING errcode='42501'; END IF;
  SELECT * INTO r FROM public.organizations WHERE id = v_org FOR UPDATE;
  IF r.status = 'ativa' THEN RETURN jsonb_build_object('status','ativa','idempotent',true); END IF;
  IF r.status <> 'onboarding' THEN RAISE EXCEPTION 'org_invalid: empresa não está em onboarding'; END IF;
  d := platform_private.onboarding_validar(r.onboarding_dados);
  IF coalesce(d->>'razao_social','') = '' OR coalesce(d->>'cep','') = '' OR coalesce(d->>'logradouro','') = ''
     OR coalesce(d->>'cidade','') = '' OR coalesce(d->>'uf','') = '' OR coalesce(d->>'telefone','') = ''
     OR coalesce(d->>'responsavel_nome','') = '' OR coalesce(d->>'fuso_horario','') = ''
     OR coalesce((d->>'confirmado')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'org_invalid: cadastro incompleto'; END IF;
  v_cnpj := platform_private.cnpj_normalizar(coalesce(nullif(d->>'cnpj',''), r.cnpj));
  IF v_cnpj IS NULL OR NOT platform_private.cnpj_valido(v_cnpj) THEN RAISE EXCEPTION 'org_invalid: CNPJ inválido (dígitos verificadores)'; END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE cnpj_normalizado = v_cnpj AND id <> v_org) THEN RAISE EXCEPTION 'org_duplicate: CNPJ já cadastrado' USING errcode='23505'; END IF;
  PERFORM platform_private.issue_ticket('org_write', v_org);
  UPDATE public.organizations
     SET razao_social = d->>'razao_social',
         nome_fantasia = coalesce(nullif(d->>'nome_fantasia',''), nome_fantasia),
         cnpj = v_cnpj,
         cnpj_normalizado = v_cnpj,
         email_corporativo = nullif(d->>'email_contato',''),
         fuso_horario = d->>'fuso_horario',
         onboarding_dados = d,
         onboarding_concluido_em = now(),
         updated_at = now()
   WHERE id = v_org;
  PERFORM public._org_set_status(v_org, 'ativa', 'onboarding concluído');
  RETURN jsonb_build_object('status','ativa','idempotent',false);
END $$;
REVOKE ALL ON FUNCTION public.org_onboarding_complete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_onboarding_complete() TO authenticated, service_role;