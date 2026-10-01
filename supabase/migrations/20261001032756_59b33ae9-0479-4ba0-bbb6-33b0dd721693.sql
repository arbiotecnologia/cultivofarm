ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativa',
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS nome_fantasia text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS cnpj_normalizado text,
  ADD COLUMN IF NOT EXISTS email_corporativo text,
  ADD COLUMN IF NOT EXISTS onboarding_dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fuso_horario text,
  ADD COLUMN IF NOT EXISTS onboarding_concluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS ativada_em timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organizations_status_chk') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_status_chk
      CHECK (status IN ('rascunho','aguardando_ativacao','onboarding','ativa','suspensa','cancelada'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_cnpj_normalizado
  ON public.organizations (cnpj_normalizado) WHERE cnpj_normalizado IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.organization_status_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  status_anterior text,
  status_novo text NOT NULL,
  ator_id uuid,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.organization_status_audit FROM anon, authenticated;
GRANT SELECT ON public.organization_status_audit TO authenticated;
GRANT ALL ON public.organization_status_audit TO service_role;
ALTER TABLE public.organization_status_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_status_audit_superadmin_read ON public.organization_status_audit;
CREATE POLICY org_status_audit_superadmin_read ON public.organization_status_audit
  FOR SELECT TO authenticated USING (public.is_platform_superadmin(auth.uid()));

-- Guarda: status, identidade fiscal e id só mudam via RPC (flag transacional)
CREATE OR REPLACE FUNCTION public.organizations_guard_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE ok boolean := coalesce(current_setting('app.org_status_rpc', true), '') = 'on';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id THEN RAISE EXCEPTION 'org_invalid: id imutável' USING errcode='42501'; END IF;
    IF NOT ok AND (NEW.status IS DISTINCT FROM OLD.status
        OR NEW.cnpj_normalizado IS DISTINCT FROM OLD.cnpj_normalizado
        OR NEW.onboarding_dados IS DISTINCT FROM OLD.onboarding_dados
        OR NEW.onboarding_concluido_em IS DISTINCT FROM OLD.onboarding_concluido_em
        OR NEW.ativada_em IS DISTINCT FROM OLD.ativada_em) THEN
      RAISE EXCEPTION 'org_forbidden: alteração apenas via fluxo do servidor' USING errcode='42501';
    END IF;
  ELSIF TG_OP = 'INSERT' AND NOT ok AND NEW.status <> 'ativa' THEN
    RAISE EXCEPTION 'org_forbidden: criação apenas via plataforma' USING errcode='42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_organizations_guard_status ON public.organizations;
CREATE TRIGGER trg_organizations_guard_status BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_guard_status();

CREATE OR REPLACE FUNCTION public.org_status_transition_ok(_de text, _para text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT (_de, _para) IN (
    ('rascunho','aguardando_ativacao'),('rascunho','cancelada'),
    ('aguardando_ativacao','onboarding'),('aguardando_ativacao','rascunho'),('aguardando_ativacao','cancelada'),
    ('onboarding','ativa'),('onboarding','cancelada'),('onboarding','suspensa'),
    ('ativa','suspensa'),('ativa','cancelada'),
    ('suspensa','ativa'),('suspensa','cancelada'))
$$;

CREATE OR REPLACE FUNCTION public._org_set_status(_org uuid, _para text, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_de text;
BEGIN
  SELECT status INTO v_de FROM public.organizations WHERE id = _org FOR UPDATE;
  IF v_de IS NULL THEN RAISE EXCEPTION 'org_invalid: empresa inexistente'; END IF;
  IF v_de = _para THEN RETURN; END IF;
  IF NOT public.org_status_transition_ok(v_de, _para) THEN
    RAISE EXCEPTION 'org_invalid: transição % -> % não permitida', v_de, _para;
  END IF;
  PERFORM set_config('app.org_status_rpc','on', true);
  UPDATE public.organizations SET status = _para,
    ativo = (_para IN ('ativa','onboarding','aguardando_ativacao','rascunho')),
    ativada_em = CASE WHEN _para='ativa' THEN coalesce(ativada_em, now()) ELSE ativada_em END,
    updated_at = now()
   WHERE id = _org;
  INSERT INTO public.organization_status_audit(organization_id,status_anterior,status_novo,ator_id,motivo)
  VALUES (_org, v_de, _para, auth.uid(), left(_motivo, 300));
  PERFORM set_config('app.org_status_rpc','off', true);
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
  IF _email IS NULL OR btrim(_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(_email) > 255 THEN
    RAISE EXCEPTION 'platform_invalid: e-mail corporativo inválido'; END IF;
  v_cnpj := nullif(regexp_replace(coalesce(_cnpj,''), '\D', '', 'g'), '');
  IF v_cnpj IS NOT NULL AND length(v_cnpj) <> 14 THEN
    RAISE EXCEPTION 'platform_invalid: CNPJ deve ter 14 dígitos'; END IF;
  IF v_cnpj IS NULL AND NOT coalesce(_rascunho,false) THEN
    RAISE EXCEPTION 'platform_invalid: sem CNPJ, crie como rascunho'; END IF;
  IF v_cnpj IS NOT NULL AND EXISTS (SELECT 1 FROM public.organizations WHERE cnpj_normalizado = v_cnpj) THEN
    RAISE EXCEPTION 'platform_duplicate: CNPJ já cadastrado' USING errcode='23505'; END IF;
  SELECT id INTO v_plan FROM public.saas_plans WHERE key = _plan_key AND active;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'platform_invalid: plano inexistente ou inativo'; END IF;
  v_status := CASE WHEN coalesce(_rascunho,false) THEN 'rascunho' ELSE 'aguardando_ativacao' END;
  PERFORM set_config('app.org_status_rpc','on', true);
  INSERT INTO public.organizations(nome, razao_social, nome_fantasia, cnpj, cnpj_normalizado, email_corporativo, status, ativo)
  VALUES (btrim(_nome), btrim(_nome), nullif(btrim(coalesce(_nome_fantasia,'')),''), v_cnpj, v_cnpj, lower(btrim(_email)), v_status, true)
  RETURNING id INTO v_id;
  PERFORM set_config('app.org_status_rpc','off', true);
  INSERT INTO public.organization_subscriptions(organization_id, plan_id, status, started_at, created_by)
  VALUES (v_id, v_plan, 'TRIAL', now(), auth.uid());
  INSERT INTO public.organization_status_audit(organization_id,status_anterior,status_novo,ator_id,motivo)
  VALUES (v_id, NULL, v_status, auth.uid(), 'criação pela plataforma');
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.platform_set_organization_status(_org uuid, _status text, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING errcode='42501'; END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 5 THEN RAISE EXCEPTION 'platform_invalid: motivo obrigatório'; END IF;
  IF _status = 'ativa' AND EXISTS (SELECT 1 FROM public.organizations WHERE id=_org AND status='onboarding') THEN
    RAISE EXCEPTION 'platform_invalid: ativação ocorre ao concluir onboarding'; END IF;
  PERFORM public._org_set_status(_org, _status, btrim(_motivo));
END $$;

-- Organização do administrador chamador (via profiles + user_roles; nunca user_metadata)
CREATE OR REPLACE FUNCTION public._org_admin_org()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.organization_id FROM public.profiles p
   WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
     AND public.has_role(auth.uid(), 'administrador'::public.app_role)
     AND NOT public.is_platform_superadmin(auth.uid())
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION public._org_admin_org() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.org_onboarding_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; r record; v_plan text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'org_forbidden' USING errcode='42501'; END IF;
  SELECT organization_id INTO v_org FROM public.profiles WHERE user_id = auth.uid();
  IF v_org IS NULL THEN RETURN jsonb_build_object('required', false); END IF;
  SELECT * INTO r FROM public.organizations WHERE id = v_org;
  SELECT pl.name INTO v_plan FROM public.organization_subscriptions s JOIN public.saas_plans pl ON pl.id=s.plan_id
   WHERE s.organization_id=v_org AND s.status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED') LIMIT 1;
  RETURN jsonb_build_object(
    'required', r.status IN ('aguardando_ativacao','onboarding','rascunho'),
    'blocked', r.status IN ('suspensa','cancelada'),
    'is_admin', public._org_admin_org() = v_org,
    'organization_id', r.id, 'status', r.status, 'nome', r.nome, 'razao_social', r.razao_social,
    'nome_fantasia', r.nome_fantasia, 'cnpj', r.cnpj, 'email_corporativo', r.email_corporativo,
    'fuso_horario', r.fuso_horario, 'dados', r.onboarding_dados, 'plano', v_plan);
END $$;

CREATE OR REPLACE FUNCTION public.org_onboarding_save(_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; v_status text; v_clean jsonb;
BEGIN
  v_org := public._org_admin_org();
  IF v_org IS NULL THEN RAISE EXCEPTION 'org_forbidden: apenas administrador da empresa' USING errcode='42501'; END IF;
  IF jsonb_typeof(_dados) <> 'object' OR length(_dados::text) > 20000 THEN RAISE EXCEPTION 'org_invalid: dados inválidos'; END IF;
  -- organization_id/status enviados pelo cliente são descartados
  v_clean := _dados - 'organization_id' - 'status' - 'id' - 'cnpj_normalizado';
  SELECT status INTO v_status FROM public.organizations WHERE id = v_org FOR UPDATE;
  IF v_status NOT IN ('aguardando_ativacao','onboarding') THEN
    RAISE EXCEPTION 'org_invalid: empresa não está em onboarding'; END IF;
  IF v_status = 'aguardando_ativacao' THEN PERFORM public._org_set_status(v_org,'onboarding','início do onboarding'); END IF;
  PERFORM set_config('app.org_status_rpc','on', true);
  UPDATE public.organizations SET onboarding_dados = onboarding_dados || v_clean, updated_at = now() WHERE id = v_org;
  PERFORM set_config('app.org_status_rpc','off', true);
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
  d := r.onboarding_dados;
  IF coalesce(btrim(d->>'razao_social'),'') = '' OR coalesce(btrim(d->>'cep'),'') = ''
     OR coalesce(btrim(d->>'logradouro'),'') = '' OR coalesce(btrim(d->>'cidade'),'') = ''
     OR coalesce(btrim(d->>'uf'),'') !~ '^[A-Za-z]{2}$' OR coalesce(btrim(d->>'telefone'),'') = ''
     OR coalesce(btrim(d->>'responsavel_nome'),'') = '' OR coalesce(btrim(d->>'fuso_horario'),'') = ''
     OR coalesce((d->>'confirmado')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'org_invalid: cadastro incompleto';
  END IF;
  v_cnpj := nullif(regexp_replace(coalesce(d->>'cnpj', r.cnpj, ''), '\D','','g'),'');
  IF v_cnpj IS NULL OR length(v_cnpj) <> 14 THEN RAISE EXCEPTION 'org_invalid: CNPJ obrigatório (14 dígitos)'; END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE cnpj_normalizado = v_cnpj AND id <> v_org) THEN
    RAISE EXCEPTION 'org_duplicate: CNPJ já cadastrado' USING errcode='23505'; END IF;
  PERFORM set_config('app.org_status_rpc','on', true);
  UPDATE public.organizations SET razao_social = btrim(d->>'razao_social'),
    nome_fantasia = coalesce(nullif(btrim(d->>'nome_fantasia'),''), nome_fantasia),
    cnpj = v_cnpj, cnpj_normalizado = v_cnpj, fuso_horario = btrim(d->>'fuso_horario'),
    onboarding_concluido_em = now() WHERE id = v_org;
  PERFORM public._org_set_status(v_org, 'ativa', 'onboarding concluído');
  RETURN jsonb_build_object('status','ativa','idempotent',false);
END $$;

REVOKE ALL ON FUNCTION public.platform_create_organization(text,text,text,text,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_organization_status(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_onboarding_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_onboarding_save(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_onboarding_complete() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_status_transition_ok(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_organization(text,text,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_organization_status(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_onboarding_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_onboarding_save(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_onboarding_complete() TO authenticated;

-- Administrador comum só gerencia a própria organização (antes: todas)
DROP POLICY IF EXISTS organizations_admin_manage ON public.organizations;
CREATE POLICY organizations_admin_manage ON public.organizations FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'administrador'::app_role) AND id = (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(),'administrador'::app_role) AND id = (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()));