-- Edição cadastral segura de empresa pelo Platform Superadmin.
CREATE TABLE IF NOT EXISTS public.organization_profile_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  actor_user_id uuid NOT NULL,
  origin text NOT NULL DEFAULT 'platform_rpc',
  reason text NOT NULL,
  idempotency_key uuid NOT NULL UNIQUE,
  old_values jsonb NOT NULL,
  new_values jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_profile_audit_org_idx ON public.organization_profile_audit(organization_id, created_at DESC);
REVOKE ALL ON public.organization_profile_audit FROM PUBLIC, anon;
GRANT SELECT ON public.organization_profile_audit TO authenticated;
GRANT ALL ON public.organization_profile_audit TO service_role;
ALTER TABLE public.organization_profile_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Superadmin le auditoria cadastral" ON public.organization_profile_audit;
CREATE POLICY "Superadmin le auditoria cadastral" ON public.organization_profile_audit
  FOR SELECT TO authenticated USING (public.is_platform_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.organization_profile_audit_no_mutation()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $$ BEGIN RAISE EXCEPTION 'audit_immutable: auditoria cadastral não pode ser alterada'; END $$;
DROP TRIGGER IF EXISTS organization_profile_audit_no_mutation ON public.organization_profile_audit;
CREATE TRIGGER organization_profile_audit_no_mutation BEFORE UPDATE OR DELETE ON public.organization_profile_audit
  FOR EACH ROW EXECUTE FUNCTION public.organization_profile_audit_no_mutation();

CREATE OR REPLACE FUNCTION public.platform_update_organization_profile(
  _org uuid, _razao_social text, _nome_fantasia text, _email text,
  _motivo text, _expected_updated_at timestamptz, _idempotency_key uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  o public.organizations%ROWTYPE; a public.organization_profile_audit%ROWTYPE;
  v_razao text; v_fant text; v_email text; v_motivo text; v_old jsonb; v_new jsonb;
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

  SELECT * INTO o FROM public.organizations WHERE id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: empresa inexistente' USING ERRCODE='22023'; END IF;

  SELECT * INTO a FROM public.organization_profile_audit WHERE idempotency_key=_idempotency_key;
  IF FOUND THEN
    IF a.organization_id=_org AND a.reason=v_motivo
       AND a.new_values->>'razao_social' IS NOT DISTINCT FROM v_razao
       AND a.new_values->>'nome_fantasia' IS NOT DISTINCT FROM v_fant
       AND a.new_values->>'email_corporativo' IS NOT DISTINCT FROM v_email THEN
      RETURN jsonb_build_object('organization_id',_org,'updated_at',o.updated_at,'idempotent',true);
    END IF;
    RAISE EXCEPTION 'platform_conflict: chave idempotente já usada com outro conteúdo' USING ERRCODE='40001';
  END IF;

  IF _expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'platform_conflict: a empresa foi alterada por outra pessoa; recarregue antes de salvar' USING ERRCODE='40001';
  END IF;

  v_old := jsonb_build_object('razao_social',o.razao_social,'nome',o.nome,'nome_fantasia',o.nome_fantasia,'email_corporativo',o.email_corporativo,'updated_at',o.updated_at);
  IF o.razao_social IS NOT DISTINCT FROM v_razao AND o.nome IS NOT DISTINCT FROM v_razao
     AND o.nome_fantasia IS NOT DISTINCT FROM v_fant AND o.email_corporativo IS NOT DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'platform_invalid: nenhuma alteração para salvar' USING ERRCODE='22023';
  END IF;

  PERFORM platform_private.issue_ticket('org_write', _org);
  UPDATE public.organizations SET razao_social=v_razao, nome=v_razao, nome_fantasia=v_fant,
    email_corporativo=v_email, updated_at=now() WHERE id=_org RETURNING * INTO o;
  v_new := jsonb_build_object('razao_social',o.razao_social,'nome',o.nome,'nome_fantasia',o.nome_fantasia,'email_corporativo',o.email_corporativo,'updated_at',o.updated_at);
  INSERT INTO public.organization_profile_audit(organization_id,actor_user_id,origin,reason,idempotency_key,old_values,new_values)
  VALUES (_org, auth.uid(), 'platform_rpc', v_motivo, _idempotency_key, v_old, v_new);
  RETURN jsonb_build_object('organization_id',_org,'updated_at',o.updated_at,'idempotent',false);
END $$;
REVOKE ALL ON FUNCTION public.platform_update_organization_profile(uuid,text,text,text,text,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_organization_profile(uuid,text,text,text,text,timestamptz,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.organization_profile_audit_no_mutation() FROM PUBLIC, anon, authenticated;