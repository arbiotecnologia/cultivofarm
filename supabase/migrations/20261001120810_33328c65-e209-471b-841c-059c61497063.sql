-- 1) Tickets de autorização por transação (schema privado, sem acesso de clientes)
CREATE SCHEMA IF NOT EXISTS platform_private;
REVOKE ALL ON SCHEMA platform_private FROM PUBLIC, anon;
CREATE TABLE IF NOT EXISTS platform_private.authz_tickets (
  txid bigint NOT NULL,
  scope text NOT NULL,
  target uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (txid, scope, target)
);
REVOKE ALL ON platform_private.authz_tickets FROM PUBLIC, anon, authenticated;
ALTER TABLE platform_private.authz_tickets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION platform_private.issue_ticket(_scope text, _target uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO platform_private.authz_tickets(txid, scope, target)
  VALUES (txid_current(), _scope, _target) ON CONFLICT DO NOTHING;
$$;
CREATE OR REPLACE FUNCTION platform_private.has_ticket(_scope text, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM platform_private.authz_tickets
                 WHERE txid = txid_current() AND scope = _scope AND target = _target);
$$;
REVOKE ALL ON FUNCTION platform_private.issue_ticket(text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform_private.has_ticket(text,uuid) FROM PUBLIC, anon, authenticated;

-- 2) Validação de CNPJ (numérico legado e alfanumérico RFB: ASCII-48, módulo 11)
CREATE OR REPLACE FUNCTION platform_private.cnpj_valido(_v text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v text := upper(regexp_replace(coalesce(_v,''), '[\s./-]', '', 'g'));
  w1 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2]; w2 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; r int; d1 int; d2 int; i int;
BEGIN
  IF v !~ '^[0-9A-Z]{12}[0-9]{2}$' THEN RETURN false; END IF;
  IF v ~ '^([0-9])\1{13}$' THEN RETURN false; END IF;
  s := 0; FOR i IN 1..12 LOOP s := s + (ascii(substr(v,i,1)) - 48) * w1[i]; END LOOP;
  r := s % 11; d1 := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
  s := 0; FOR i IN 1..12 LOOP s := s + (ascii(substr(v,i,1)) - 48) * w2[i]; END LOOP;
  s := s + d1 * w2[13];
  r := s % 11; d2 := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
  RETURN substr(v,13,2) = d1::text || d2::text;
END $$;
CREATE OR REPLACE FUNCTION platform_private.cnpj_normalizar(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT nullif(upper(regexp_replace(coalesce(_v,''), '[\s./-]', '', 'g')), '')
$$;
REVOKE ALL ON FUNCTION platform_private.cnpj_valido(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform_private.cnpj_normalizar(text) FROM PUBLIC, anon, authenticated;

-- 3) Clientes não escrevem organizations diretamente (inventário: nenhum uso legítimo no app;
--    todas as escritas ocorrem em RPCs SECURITY DEFINER).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.organizations FROM anon, authenticated, PUBLIC;
DROP POLICY IF EXISTS organizations_admin_manage ON public.organizations;

-- Guarda (defesa em profundidade): requisições da API exigem ticket da transação
CREATE OR REPLACE FUNCTION public.organizations_guard_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE via_api boolean := session_user = 'authenticator';
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'org_invalid: id imutável' USING errcode='42501'; END IF;
  IF NOT via_api THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT platform_private.has_ticket('org_create', '00000000-0000-0000-0000-000000000000'::uuid) THEN
      RAISE EXCEPTION 'org_forbidden: criação apenas via plataforma' USING errcode='42501'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.status, NEW.razao_social, NEW.nome_fantasia, NEW.cnpj, NEW.cnpj_normalizado, NEW.email_corporativo,
      NEW.fuso_horario, NEW.onboarding_dados, NEW.onboarding_concluido_em, NEW.ativada_em, NEW.nome)
     IS DISTINCT FROM
     (OLD.status, OLD.razao_social, OLD.nome_fantasia, OLD.cnpj, OLD.cnpj_normalizado, OLD.email_corporativo,
      OLD.fuso_horario, OLD.onboarding_dados, OLD.onboarding_concluido_em, OLD.ativada_em, OLD.nome)
     AND NOT platform_private.has_ticket('org_write', NEW.id) THEN
    RAISE EXCEPTION 'org_forbidden: alteração apenas via fluxo do servidor' USING errcode='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.organizations_guard_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_status_transition_ok(text,text) FROM PUBLIC, anon, authenticated;

-- 4) RPCs reescritas com ticket (GUC removido)
CREATE OR REPLACE FUNCTION public._org_set_status(_org uuid, _para text, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_de text;
BEGIN
  SELECT status INTO v_de FROM public.organizations WHERE id = _org FOR UPDATE;
  IF v_de IS NULL THEN RAISE EXCEPTION 'org_invalid: empresa inexistente'; END IF;
  IF v_de = _para THEN RETURN; END IF;
  IF NOT public.org_status_transition_ok(v_de, _para) THEN
    RAISE EXCEPTION 'org_invalid: transição % -> % não permitida', v_de, _para; END IF;
  PERFORM platform_private.issue_ticket('org_write', _org);
  UPDATE public.organizations SET status = _para,
    ativo = (_para IN ('ativa','onboarding','aguardando_ativacao','rascunho')),
    ativada_em = CASE WHEN _para='ativa' THEN coalesce(ativada_em, now()) ELSE ativada_em END,
    updated_at = now()
   WHERE id = _org;
  INSERT INTO public.organization_status_audit(organization_id,status_anterior,status_novo,ator_id,motivo)
  VALUES (_org, v_de, _para, auth.uid(), left(_motivo, 300));
END $$;
REVOKE ALL ON FUNCTION public._org_set_status(uuid,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_create_organization(
  _nome text, _nome_fantasia text, _cnpj text, _email text, _plan_key text, _rascunho boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_cnpj text; v_plan uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING errcode='42501'; END IF;
  IF _nome IS NULL OR length(btrim(_nome)) < 2 OR length(_nome) > 200 THEN
    RAISE EXCEPTION 'platform_invalid: nome/razão social obrigatório'; END IF;
  IF length(coalesce(_nome_fantasia,'')) > 200 THEN RAISE EXCEPTION 'platform_invalid: nome fantasia muito longo'; END IF;
  IF _email IS NULL OR length(_email) > 255 OR btrim(_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'platform_invalid: e-mail corporativo inválido'; END IF;
  v_cnpj := platform_private.cnpj_normalizar(_cnpj);
  IF v_cnpj IS NOT NULL AND NOT platform_private.cnpj_valido(v_cnpj) THEN
    RAISE EXCEPTION 'platform_invalid: CNPJ inválido (dígitos verificadores)'; END IF;
  IF v_cnpj IS NULL AND NOT coalesce(_rascunho,false) THEN
    RAISE EXCEPTION 'platform_invalid: sem CNPJ, crie como rascunho'; END IF;
  IF v_cnpj IS NOT NULL AND EXISTS (SELECT 1 FROM public.organizations WHERE cnpj_normalizado = v_cnpj) THEN
    RAISE EXCEPTION 'platform_duplicate: CNPJ já cadastrado' USING errcode='23505'; END IF;
  SELECT id INTO v_plan FROM public.saas_plans WHERE key = _plan_key AND active;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'platform_invalid: plano inexistente ou inativo'; END IF;
  v_status := CASE WHEN coalesce(_rascunho,false) THEN 'rascunho' ELSE 'aguardando_ativacao' END;
  PERFORM platform_private.issue_ticket('org_create', '00000000-0000-0000-0000-000000000000'::uuid);
  INSERT INTO public.organizations(nome, razao_social, nome_fantasia, cnpj, cnpj_normalizado, email_corporativo, status, ativo)
  VALUES (btrim(_nome), btrim(_nome), nullif(btrim(coalesce(_nome_fantasia,'')),''), v_cnpj, v_cnpj, lower(btrim(_email)), v_status, true)
  RETURNING id INTO v_id;
  INSERT INTO public.organization_subscriptions(organization_id, plan_id, status, started_at, created_by)
  VALUES (v_id, v_plan, 'TRIAL', now(), auth.uid());
  INSERT INTO public.organization_status_audit(organization_id,status_anterior,status_novo,ator_id,motivo)
  VALUES (v_id, NULL, v_status, auth.uid(), 'criação pela plataforma');
  RETURN v_id;
END $$;

-- Estado: usuário não administrador recebe apenas o mínimo
CREATE OR REPLACE FUNCTION public.org_onboarding_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; r record; v_plan text; v_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'org_forbidden' USING errcode='42501'; END IF;
  SELECT organization_id INTO v_org FROM public.profiles WHERE user_id = auth.uid();
  IF v_org IS NULL THEN RETURN jsonb_build_object('required', false); END IF;
  SELECT id, status, nome, razao_social, nome_fantasia, cnpj, email_corporativo, fuso_horario, onboarding_dados
    INTO r FROM public.organizations WHERE id = v_org;
  v_admin := coalesce(public._org_admin_org() = v_org, false);
  IF NOT v_admin THEN
    RETURN jsonb_build_object('required', r.status IN ('aguardando_ativacao','onboarding','rascunho'),
      'blocked', r.status IN ('suspensa','cancelada'), 'is_admin', false, 'status', r.status);
  END IF;
  SELECT pl.name INTO v_plan FROM public.organization_subscriptions s JOIN public.saas_plans pl ON pl.id=s.plan_id
   WHERE s.organization_id=v_org AND s.status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED') LIMIT 1;
  RETURN jsonb_build_object(
    'required', r.status IN ('aguardando_ativacao','onboarding','rascunho'),
    'blocked', r.status IN ('suspensa','cancelada'), 'is_admin', true,
    'organization_id', r.id, 'status', r.status, 'nome', r.nome, 'razao_social', r.razao_social,
    'nome_fantasia', r.nome_fantasia, 'cnpj', r.cnpj, 'email_corporativo', r.email_corporativo,
    'fuso_horario', r.fuso_horario, 'dados', r.onboarding_dados, 'plano', v_plan);
END $$;

-- Validação por campo (whitelist explícita)
CREATE OR REPLACE FUNCTION platform_private.onboarding_validar(_d jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  spec jsonb := '{"razao_social":200,"nome_fantasia":200,"cnpj":18,"inscricao_estadual":20,"regime_tributario":40,
    "cep":9,"logradouro":200,"numero":20,"bairro":120,"cidade":120,"uf":2,"telefone":20,"email_contato":255,
    "responsavel_nome":160,"responsavel_cargo":120,"fuso_horario":64,"idioma":10}'::jsonb;
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
      IF k = 'telefone' AND s !~ '^[0-9()+ -]{8,20}$' THEN RAISE EXCEPTION 'org_invalid: telefone inválido'; END IF;
      IF k = 'email_contato' AND s !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'org_invalid: e-mail inválido'; END IF;
      IF k = 'fuso_horario' AND s !~ '^[A-Za-z]+(/[A-Za-z_+-]+){1,2}$' THEN RAISE EXCEPTION 'org_invalid: fuso horário inválido'; END IF;
      IF k = 'cnpj' AND NOT platform_private.cnpj_valido(s) THEN RAISE EXCEPTION 'org_invalid: CNPJ inválido (dígitos verificadores)'; END IF;
      IF k = 'uf' THEN s := upper(s); END IF;
    END IF;
    out := out || jsonb_build_object(k, s);
  END LOOP;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION platform_private.onboarding_validar(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.org_onboarding_save(_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; v_status text; v_clean jsonb;
BEGIN
  v_org := public._org_admin_org();
  IF v_org IS NULL THEN RAISE EXCEPTION 'org_forbidden: apenas administrador da empresa' USING errcode='42501'; END IF;
  v_clean := platform_private.onboarding_validar(_dados);
  SELECT status INTO v_status FROM public.organizations WHERE id = v_org FOR UPDATE;
  IF v_status NOT IN ('aguardando_ativacao','onboarding') THEN
    RAISE EXCEPTION 'org_invalid: empresa não está em onboarding'; END IF;
  IF v_status = 'aguardando_ativacao' THEN PERFORM public._org_set_status(v_org,'onboarding','início do onboarding'); END IF;
  PERFORM platform_private.issue_ticket('org_write', v_org);
  UPDATE public.organizations SET onboarding_dados = onboarding_dados || v_clean, updated_at = now() WHERE id = v_org;
END $$;

CREATE OR REPLACE FUNCTION public.org_onboarding_complete()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
     OR coalesce((d->>'confirmado')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'org_invalid: cadastro incompleto'; END IF;
  v_cnpj := platform_private.cnpj_normalizar(coalesce(nullif(d->>'cnpj',''), r.cnpj));
  IF v_cnpj IS NULL OR NOT platform_private.cnpj_valido(v_cnpj) THEN
    RAISE EXCEPTION 'org_invalid: CNPJ inválido (dígitos verificadores)'; END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE cnpj_normalizado = v_cnpj AND id <> v_org) THEN
    RAISE EXCEPTION 'org_duplicate: CNPJ já cadastrado' USING errcode='23505'; END IF;
  PERFORM platform_private.issue_ticket('org_write', v_org);
  UPDATE public.organizations SET razao_social = d->>'razao_social',
    nome_fantasia = coalesce(nullif(d->>'nome_fantasia',''), nome_fantasia),
    cnpj = v_cnpj, cnpj_normalizado = v_cnpj, fuso_horario = d->>'fuso_horario',
    onboarding_concluido_em = now() WHERE id = v_org;
  PERFORM public._org_set_status(v_org, 'ativa', 'onboarding concluído');
  RETURN jsonb_build_object('status','ativa','idempotent',false);
END $$;

-- 5) Senha provisória: liberação exige ticket da RPC (além do guard existente)
CREATE OR REPLACE FUNCTION public.guard_profile_senha_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF session_user = 'authenticator'
     AND OLD.senha_provisoria IS TRUE AND NEW.senha_provisoria IS DISTINCT FROM TRUE
     AND NOT platform_private.has_ticket('pwd_conclude', NEW.user_id) THEN
    RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING errcode='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_profile_senha_ticket() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_profile_senha_ticket ON public.profiles;
CREATE TRIGGER guard_profile_senha_ticket BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_senha_ticket();

CREATE OR REPLACE FUNCTION platform_private.conclude_provisional_password()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_digest text; v_atual text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid AND senha_provisoria IS TRUE) THEN
    RETURN true;
  END IF;
  SELECT pwd_digest INTO v_digest FROM platform_private.provisional_password_state WHERE user_id = v_uid;
  SELECT md5(COALESCE(u.encrypted_password,'')) INTO v_atual FROM auth.users u WHERE u.id = v_uid;
  IF v_digest IS NULL OR v_atual IS NULL OR v_atual = v_digest OR v_atual = md5('') THEN
    RAISE EXCEPTION 'platform_senha_nao_alterada' USING ERRCODE='22023';
  END IF;
  PERFORM platform_private.issue_ticket('pwd_conclude', v_uid);
  PERFORM set_config('cf.concluir_senha','on', true);
  UPDATE public.profiles SET senha_provisoria = false, updated_at = now() WHERE user_id = v_uid;
  PERFORM set_config('cf.concluir_senha','off', true);
  UPDATE public.platform_org_admin_invites SET status='ativo', concluido_em=now()
   WHERE user_id = v_uid AND status='pendente';
  DELETE FROM platform_private.provisional_password_state WHERE user_id = v_uid;
  RETURN true;
END $$;
-- entrada pública é public.platform_conclude_provisional_password (invoker); interno sem PUBLIC/anon
REVOKE ALL ON FUNCTION platform_private.conclude_provisional_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.conclude_provisional_password() TO authenticated;

-- 6) Contato de suporte: configurado no app (sem valor inventado)