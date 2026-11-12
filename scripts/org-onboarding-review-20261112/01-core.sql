-- Onboarding com revisão obrigatória + contenção da Central Fiscal.
-- Pacote revisável: instalar SOMENTE após 00-preflight.sql (pins MD5 do LIVE capturado em 12/11/2026).
-- Não faz backfill: organizações 'ativa' permanecem ativas; nenhuma linha existente é alterada.

-- 1) Novo estado 'aguardando_revisao' (deny-only para os módulos: não é 'ativa').
ALTER TABLE public.organizations DROP CONSTRAINT organizations_status_chk;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_status_chk CHECK (status = ANY (ARRAY[
  'rascunho','aguardando_ativacao','onboarding','aguardando_revisao','ativa','suspensa','cancelada']));

CREATE OR REPLACE FUNCTION public.org_status_transition_ok(_de text, _para text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT (_de, _para) IN (
    ('rascunho','aguardando_ativacao'),('rascunho','cancelada'),
    ('aguardando_ativacao','onboarding'),('aguardando_ativacao','rascunho'),('aguardando_ativacao','cancelada'),
    ('onboarding','ativa'),('onboarding','aguardando_revisao'),('onboarding','cancelada'),('onboarding','suspensa'),
    ('aguardando_revisao','ativa'),('aguardando_revisao','cancelada'),
    ('ativa','suspensa'),('ativa','cancelada'),('ativa','aguardando_revisao'),
    ('suspensa','ativa'),('suspensa','cancelada'))
$function$;

CREATE OR REPLACE FUNCTION public._org_set_status(_org uuid, _para text, _motivo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_de text;
BEGIN
  SELECT status INTO v_de FROM public.organizations WHERE id = _org FOR UPDATE;
  IF v_de IS NULL THEN RAISE EXCEPTION 'org_invalid: empresa inexistente'; END IF;
  IF v_de = _para THEN RETURN; END IF;
  IF NOT public.org_status_transition_ok(v_de, _para) THEN
    RAISE EXCEPTION 'org_invalid: transição % -> % não permitida', v_de, _para; END IF;
  PERFORM platform_private.issue_ticket('org_write', _org);
  UPDATE public.organizations SET status = _para,
    ativo = (_para IN ('ativa','onboarding','aguardando_ativacao','rascunho','aguardando_revisao')),
    ativada_em = CASE WHEN _para='ativa' THEN coalesce(ativada_em, now()) ELSE ativada_em END,
    updated_at = now()
   WHERE id = _org;
  INSERT INTO public.organization_status_audit(organization_id,status_anterior,status_novo,ator_id,motivo)
  VALUES (_org, v_de, _para, auth.uid(), left(_motivo, 300));
END $function$;

-- 2) Evidência server-side da consulta de CNPJ (gravada só pela Edge com service_role) e fila de revisão.
CREATE TABLE IF NOT EXISTS platform_private.organization_cnpj_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  cnpj_normalizado text NOT NULL,
  razao_social text,
  situacao_cadastral text,
  fonte text NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  dados jsonb NOT NULL,
  consultado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_cnpj_evidence_org_idx
  ON platform_private.organization_cnpj_evidence (organization_id, cnpj_normalizado, consultado_em DESC);

CREATE TABLE IF NOT EXISTS platform_private.organization_onboarding_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  origem text NOT NULL CHECK (origem IN ('onboarding','remessa_plataforma')),
  motivo_codigo text NOT NULL,
  evidencia_id uuid REFERENCES platform_private.organization_cnpj_evidence(id),
  observacao text,
  submetido_por uuid,
  submetido_em timestamptz NOT NULL DEFAULT now(),
  decisao text CHECK (decisao IN ('aprovada','rejeitada')),
  decidido_por uuid,
  decidido_em timestamptz,
  decisao_motivo text,
  CHECK ((decisao IS NULL) = (decidido_em IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_onboarding_reviews_one_open
  ON platform_private.organization_onboarding_reviews (organization_id) WHERE decisao IS NULL;
REVOKE ALL ON platform_private.organization_cnpj_evidence, platform_private.organization_onboarding_reviews FROM PUBLIC, anon, authenticated;
ALTER TABLE platform_private.organization_cnpj_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.organization_onboarding_reviews ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION platform_private.razao_norm(_s text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT regexp_replace(upper(translate(btrim(coalesce(_s,'')),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^A-Z0-9]+', '', 'g')
$function$;

-- Escrita exclusiva do servidor (Edge onboarding-cnpj-lookup com service_role). Organização vem do
-- org_onboarding_state executado com o JWT do usuário; aqui revalida-se que o ator é admin dessa org.
CREATE OR REPLACE FUNCTION public.svc_onboarding_record_cnpj_evidence(_org uuid, _actor uuid, _dados jsonb, _fonte text, _payload_sha256 text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_status text; v_cnpj text; v_id uuid;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'svc_forbidden' USING errcode='42501'; END IF;
  SELECT status INTO v_status FROM public.organizations WHERE id = _org FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('aguardando_ativacao','onboarding') THEN
    RAISE EXCEPTION 'org_invalid: empresa fora do onboarding'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = _actor AND p.organization_id = _org)
     OR NOT platform_private.has_role(_actor, 'administrador'::public.app_role)
     OR public.is_platform_superadmin(_actor) THEN
    RAISE EXCEPTION 'org_forbidden: ator não é administrador da empresa' USING errcode='42501'; END IF;
  IF _dados IS NULL OR jsonb_typeof(_dados) <> 'object' OR length(_dados::text) > 16000 THEN
    RAISE EXCEPTION 'org_invalid: evidência inválida'; END IF;
  v_cnpj := platform_private.cnpj_normalizar(_dados->>'cnpj');
  IF v_cnpj IS NULL OR NOT platform_private.cnpj_valido(v_cnpj) THEN RAISE EXCEPTION 'org_invalid: CNPJ da evidência inválido'; END IF;
  INSERT INTO platform_private.organization_cnpj_evidence(organization_id, actor_id, cnpj_normalizado, razao_social,
     situacao_cadastral, fonte, payload_sha256, dados)
  VALUES (_org, _actor, v_cnpj, left(_dados->>'razao_social',200), upper(left(_dados->>'situacao_cadastral',40)),
     left(coalesce(_fonte,'desconhecida'),120), lower(_payload_sha256), _dados)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION platform_private.onboarding_evidence_summary(_org uuid, _cnpj text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('id', e.id, 'cnpj', e.cnpj_normalizado, 'razao_social', e.razao_social,
    'situacao_cadastral', e.situacao_cadastral, 'fonte', e.fonte, 'consultado_em', e.consultado_em,
    'vigente', e.consultado_em >= now() - interval '7 days')
    FROM platform_private.organization_cnpj_evidence e
   WHERE e.organization_id = _org AND e.cnpj_normalizado = platform_private.cnpj_normalizar(_cnpj)
   ORDER BY e.consultado_em DESC LIMIT 1
$function$;

-- 3) Conclusão: ativa só com evidência server-side vigente, ATIVA e coerente; demais casos -> revisão.
CREATE OR REPLACE FUNCTION public.org_onboarding_complete()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_org uuid; r record; d jsonb; v_cnpj text; e record; v_motivo text;
BEGIN
  v_org := public._org_admin_org();
  IF v_org IS NULL THEN RAISE EXCEPTION 'org_forbidden: apenas administrador da empresa' USING errcode='42501'; END IF;
  SELECT * INTO r FROM public.organizations WHERE id = v_org FOR UPDATE;
  IF r.status = 'ativa' THEN RETURN jsonb_build_object('status','ativa','idempotent',true); END IF;
  IF r.status = 'aguardando_revisao' THEN RETURN jsonb_build_object('status','aguardando_revisao','idempotent',true); END IF;
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
         cnpj = v_cnpj, cnpj_normalizado = v_cnpj,
         email_corporativo = nullif(d->>'email_contato',''),
         fuso_horario = d->>'fuso_horario',
         onboarding_dados = d, onboarding_concluido_em = now(), updated_at = now()
   WHERE id = v_org;
  SELECT * INTO e FROM platform_private.organization_cnpj_evidence
   WHERE organization_id = v_org AND cnpj_normalizado = v_cnpj ORDER BY consultado_em DESC LIMIT 1;
  v_motivo := CASE
    WHEN e.id IS NULL THEN 'sem_evidencia_servidor'
    WHEN e.consultado_em < now() - interval '7 days' THEN 'evidencia_expirada'
    WHEN coalesce(e.situacao_cadastral,'') <> 'ATIVA' THEN 'situacao_cadastral_nao_ativa'
    WHEN platform_private.razao_norm(e.razao_social) = '' OR platform_private.razao_norm(e.razao_social) <> platform_private.razao_norm(d->>'razao_social') THEN 'razao_social_divergente'
    ELSE NULL END;
  IF v_motivo IS NULL THEN
    PERFORM public._org_set_status(v_org, 'ativa', 'onboarding concluído; CNPJ verificado no servidor (evidência '||e.id||')');
    RETURN jsonb_build_object('status','ativa','idempotent',false,'verificado',true);
  END IF;
  INSERT INTO platform_private.organization_onboarding_reviews(organization_id, origem, motivo_codigo, evidencia_id, submetido_por)
  VALUES (v_org, 'onboarding', v_motivo, e.id, auth.uid());
  PERFORM public._org_set_status(v_org, 'aguardando_revisao', 'onboarding concluído; revisão obrigatória: '||v_motivo);
  RETURN jsonb_build_object('status','aguardando_revisao','idempotent',false,'motivo',v_motivo);
END $function$;

CREATE OR REPLACE FUNCTION public.org_onboarding_state()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_org uuid; r record; v_plan text; v_admin boolean; v_rev jsonb;
  pend constant text[] := ARRAY['aguardando_ativacao','onboarding','rascunho','aguardando_revisao'];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'org_forbidden' USING errcode='42501'; END IF;
  SELECT organization_id INTO v_org FROM public.profiles WHERE user_id = auth.uid();
  IF v_org IS NULL THEN RETURN jsonb_build_object('required', false); END IF;
  SELECT id, status, nome, razao_social, nome_fantasia, cnpj, email_corporativo, fuso_horario, onboarding_dados
    INTO r FROM public.organizations WHERE id = v_org;
  v_admin := coalesce(public._org_admin_org() = v_org, false);
  IF NOT v_admin THEN
    RETURN jsonb_build_object('required', r.status = ANY(pend), 'review_pending', r.status = 'aguardando_revisao',
      'blocked', r.status IN ('suspensa','cancelada'), 'is_admin', false, 'status', r.status);
  END IF;
  SELECT pl.name INTO v_plan FROM public.organization_subscriptions s JOIN public.saas_plans pl ON pl.id=s.plan_id
   WHERE s.organization_id=v_org AND s.status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED') LIMIT 1;
  SELECT jsonb_build_object('origem', v.origem, 'motivo_codigo', v.motivo_codigo, 'submetido_em', v.submetido_em)
    INTO v_rev FROM platform_private.organization_onboarding_reviews v
   WHERE v.organization_id = v_org AND v.decisao IS NULL LIMIT 1;
  RETURN jsonb_build_object(
    'required', r.status = ANY(pend), 'review_pending', r.status = 'aguardando_revisao', 'review', v_rev,
    'blocked', r.status IN ('suspensa','cancelada'), 'is_admin', true,
    'organization_id', r.id, 'status', r.status, 'nome', r.nome, 'razao_social', r.razao_social,
    'nome_fantasia', r.nome_fantasia, 'cnpj', r.cnpj, 'email_corporativo', r.email_corporativo,
    'fuso_horario', r.fuso_horario, 'dados', r.onboarding_dados, 'plano', v_plan,
    'evidencia', platform_private.onboarding_evidence_summary(r.id, coalesce(nullif(r.onboarding_dados->>'cnpj',''), r.cnpj)));
END $function$;

-- 4) Plataforma: status genérico não ativa nem remete à revisão; fila/aprovação/remessa dedicadas e auditadas.
CREATE OR REPLACE FUNCTION public.platform_set_organization_status(_org uuid, _status text, _motivo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_de text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING errcode='42501'; END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 5 THEN RAISE EXCEPTION 'platform_invalid: motivo obrigatório'; END IF;
  SELECT status INTO v_de FROM public.organizations WHERE id = _org FOR UPDATE;
  IF _status = 'ativa' AND v_de = 'onboarding' THEN
    RAISE EXCEPTION 'platform_invalid: ativação ocorre ao concluir onboarding'; END IF;
  IF _status = 'aguardando_revisao' THEN
    RAISE EXCEPTION 'platform_invalid: use a ação Remeter à revisão'; END IF;
  IF v_de = 'aguardando_revisao' AND _status IS DISTINCT FROM 'cancelada' THEN
    RAISE EXCEPTION 'platform_invalid: empresa em revisão só é liberada pela aprovação da revisão'; END IF;
  PERFORM public._org_set_status(_org, _status, btrim(_motivo));
  IF v_de = 'aguardando_revisao' AND _status = 'cancelada' THEN
    UPDATE platform_private.organization_onboarding_reviews
       SET decisao='rejeitada', decidido_por=auth.uid(), decidido_em=now(), decisao_motivo=left(btrim(_motivo),500)
     WHERE organization_id=_org AND decisao IS NULL;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.platform_list_onboarding_reviews(_org uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING errcode='42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'review_id', v.id, 'organization_id', o.id, 'nome', o.nome, 'razao_social', o.razao_social,
      'cnpj', o.cnpj, 'status', o.status, 'origem', v.origem, 'motivo_codigo', v.motivo_codigo,
      'observacao', v.observacao, 'submetido_em', v.submetido_em,
      'dados', jsonb_build_object('razao_social', o.onboarding_dados->>'razao_social', 'cidade', o.onboarding_dados->>'cidade',
                                   'uf', o.onboarding_dados->>'uf', 'responsavel_nome', o.onboarding_dados->>'responsavel_nome'),
      'evidencia', platform_private.onboarding_evidence_summary(o.id, o.cnpj)) ORDER BY v.submetido_em)
    FROM platform_private.organization_onboarding_reviews v JOIN public.organizations o ON o.id = v.organization_id
   WHERE v.decisao IS NULL AND (_org IS NULL OR v.organization_id = _org)), '[]'::jsonb);
END $function$;

CREATE OR REPLACE FUNCTION public.platform_approve_onboarding_review(_org uuid, _motivo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_st text; rv record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING errcode='42501'; END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 5 THEN RAISE EXCEPTION 'platform_invalid: motivo obrigatório'; END IF;
  SELECT status INTO v_st FROM public.organizations WHERE id = _org FOR UPDATE;
  IF v_st IS NULL THEN RAISE EXCEPTION 'platform_invalid: empresa inexistente'; END IF;
  SELECT * INTO rv FROM platform_private.organization_onboarding_reviews
   WHERE organization_id = _org ORDER BY submetido_em DESC LIMIT 1 FOR UPDATE;
  IF v_st = 'ativa' AND rv.decisao = 'aprovada' THEN
    RETURN jsonb_build_object('status','ativa','idempotent',true,'review_id',rv.id); END IF;
  IF v_st <> 'aguardando_revisao' OR rv.id IS NULL OR rv.decisao IS NOT NULL THEN
    RAISE EXCEPTION 'platform_conflict: empresa sem revisão pendente' USING errcode='PT409'; END IF;
  UPDATE platform_private.organization_onboarding_reviews
     SET decisao='aprovada', decidido_por=auth.uid(), decidido_em=now(), decisao_motivo=left(btrim(_motivo),500)
   WHERE id = rv.id;
  PERFORM public._org_set_status(_org, 'ativa', 'revisão de cadastro aprovada: '||btrim(_motivo));
  RETURN jsonb_build_object('status','ativa','idempotent',false,'review_id',rv.id);
END $function$;

CREATE OR REPLACE FUNCTION public.platform_return_organization_to_review(_org uuid, _motivo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_st text; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING errcode='42501'; END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 5 THEN RAISE EXCEPTION 'platform_invalid: motivo obrigatório'; END IF;
  SELECT status INTO v_st FROM public.organizations WHERE id = _org FOR UPDATE;
  IF v_st IS NULL THEN RAISE EXCEPTION 'platform_invalid: empresa inexistente'; END IF;
  IF v_st = 'aguardando_revisao' THEN
    SELECT id INTO v_id FROM platform_private.organization_onboarding_reviews WHERE organization_id=_org AND decisao IS NULL;
    IF v_id IS NOT NULL THEN RETURN jsonb_build_object('status','aguardando_revisao','idempotent',true,'review_id',v_id); END IF;
  END IF;
  IF v_st <> 'ativa' THEN RAISE EXCEPTION 'platform_invalid: somente empresa ativa pode ser remetida à revisão'; END IF;
  INSERT INTO platform_private.organization_onboarding_reviews(organization_id, origem, motivo_codigo, observacao, submetido_por)
  VALUES (_org, 'remessa_plataforma', 'remessa_manual_plataforma', left(btrim(_motivo),500), auth.uid()) RETURNING id INTO v_id;
  PERFORM public._org_set_status(_org, 'aguardando_revisao', 'remetida à revisão: '||btrim(_motivo));
  RETURN jsonb_build_object('status','aguardando_revisao','idempotent',false,'review_id',v_id);
END $function$;

-- 5) Contenção da Central Fiscal: deny-only para empresas ainda não liberadas.
CREATE OR REPLACE FUNCTION platform_private.fiscal_org_released(_org uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = _org
     AND o.status IN ('rascunho','aguardando_ativacao','onboarding','aguardando_revisao'))
$function$;
CREATE OR REPLACE FUNCTION platform_private.fiscal_company_released(_cs uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT NOT EXISTS (SELECT 1 FROM public.company_fiscal_settings c JOIN public.organizations o ON o.id = c.organization_id
     WHERE c.id = _cs AND o.status IN ('rascunho','aguardando_ativacao','onboarding','aguardando_revisao'))
$function$;
CREATE OR REPLACE FUNCTION platform_private.fiscal_require_released_org()
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_superadmin(auth.uid()) THEN RETURN; END IF;
  SELECT organization_id INTO v_org FROM public.profiles WHERE user_id = auth.uid();
  IF v_org IS NOT NULL AND NOT platform_private.fiscal_org_released(v_org) THEN
    RAISE EXCEPTION 'ORG_REVIEW_PENDING: Central Fiscal indisponível até a liberação da empresa' USING errcode='42501'; END IF;
END $function$;
CREATE OR REPLACE FUNCTION platform_private.fiscal_release_write_gate()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE rw jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END); ok boolean;
BEGIN
  IF TG_TABLE_NAME IN ('fiscal_certificates') THEN ok := platform_private.fiscal_company_released((rw->>'company_settings_id')::uuid);
  ELSIF TG_TABLE_NAME = 'fiscal_document_series' THEN ok := platform_private.fiscal_company_released((rw->>'company_id')::uuid);
  ELSE ok := platform_private.fiscal_org_released((rw->>'organization_id')::uuid); END IF;
  IF NOT ok THEN RAISE EXCEPTION 'ORG_REVIEW_PENDING: Central Fiscal indisponível até a liberação da empresa' USING errcode='42501'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;
REVOKE ALL ON FUNCTION platform_private.fiscal_release_write_gate(), platform_private.fiscal_require_released_org(),
  platform_private.onboarding_evidence_summary(uuid,text), platform_private.razao_norm(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform_private.fiscal_org_released(uuid), platform_private.fiscal_company_released(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.fiscal_org_released(uuid), platform_private.fiscal_company_released(uuid) TO authenticated, service_role;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['company_fiscal_settings','company_fiscal_pis_cofins_history','fiscal_certificates',
                           'fiscal_document_series','fiscal_invoices','fiscal_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS a00_fiscal_release_gate ON public.%I', t);
    EXECUTE format('CREATE TRIGGER a00_fiscal_release_gate BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION platform_private.fiscal_release_write_gate()', t);
    EXECUTE format('DROP POLICY IF EXISTS fiscal_release_containment ON public.%I', t);
    EXECUTE format('CREATE POLICY fiscal_release_containment ON public.%I AS RESTRICTIVE FOR ALL TO public USING (%s) WITH CHECK (%s)', t,
      CASE t WHEN 'fiscal_certificates' THEN 'platform_private.fiscal_company_released(company_settings_id)'
             WHEN 'fiscal_document_series' THEN 'platform_private.fiscal_company_released(company_id)'
             ELSE 'platform_private.fiscal_org_released(organization_id)' END,
      CASE t WHEN 'fiscal_certificates' THEN 'platform_private.fiscal_company_released(company_settings_id)'
             WHEN 'fiscal_document_series' THEN 'platform_private.fiscal_company_released(company_id)'
             ELSE 'platform_private.fiscal_org_released(organization_id)' END);
  END LOOP;
END $$;

-- 6) ACL: mínimos necessários.
REVOKE ALL ON FUNCTION public.svc_onboarding_record_cnpj_evidence(uuid,uuid,jsonb,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svc_onboarding_record_cnpj_evidence(uuid,uuid,jsonb,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.platform_list_onboarding_reviews(uuid), public.platform_approve_onboarding_review(uuid,text),
  public.platform_return_organization_to_review(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_onboarding_reviews(uuid), public.platform_approve_onboarding_review(uuid,text),
  public.platform_return_organization_to_review(uuid,text) TO authenticated, service_role;
