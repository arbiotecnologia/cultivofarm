-- B2B_FINANCE_ROLE_V1 — candidato INATIVO. Gerado por build.py; não editar à mão.
-- Executar somente após 01-pre (PRE_PASS) e 02a no ref swzpzcwiasxmjutrmvkm.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
  IF current_setting('app.expected_ref', true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN
    RAISE EXCEPTION 'B2B_FIN_INSTALL_REF_UNPROVEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='app_role' AND e.enumlabel='parceiro_b2b_financeiro') THEN
    RAISE EXCEPTION 'B2B_FIN_INSTALL_ENUM_MISSING'; END IF;
END $$;

-- 1. Vínculo canônico ganha papel próprio; gestor/técnico preservados.
ALTER TABLE public.partner_users DROP CONSTRAINT partner_users_papel_check;
ALTER TABLE public.partner_users ADD CONSTRAINT partner_users_papel_check
  CHECK (papel = ANY (ARRAY['gestor'::text, 'tecnico'::text, 'financeiro'::text]));

-- 2. Portador do papel (bruto, mesmo inativo) — usado só para FECHAR leituras diretas.
CREATE FUNCTION platform_private.b2b_finance_role_holder()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role='parceiro_b2b_financeiro'::public.app_role);
$function$;

-- 3. Ator financeiro externo: tudo derivado de registros canônicos, nenhum argumento.
CREATE FUNCTION platform_private.b2b_finance_actor_partner()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT pu.partner_id
 FROM public.partner_users pu
 JOIN public.profiles p ON p.user_id=pu.user_id
 JOIN public.organizations o ON o.id=p.organization_id
 JOIN public.partner_accounts pa ON pa.id=pu.partner_id
 JOIN public.organizations owner ON owner.id=pa.commercial_owner_organization_id
 WHERE pu.user_id=auth.uid()
   AND platform_private.platform_actor_access_ready(pu.user_id)
   AND public.has_role(pu.user_id,'parceiro_b2b_financeiro'::public.app_role)
   AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=pu.user_id AND r.role<>'parceiro_b2b_financeiro'::public.app_role)
   AND (SELECT count(*) FROM public.partner_users x WHERE x.user_id=pu.user_id)=1
   AND pu.papel='financeiro' AND pu.revoked_at IS NULL AND pu.valid_from<=now()
   AND p.ativo AND o.ativo AND o.status='ativa' AND owner.ativo AND owner.status='ativa'
   AND pa.ativo AND pa.deleted_at IS NULL
   AND p.organization_id=pu.tenant_id AND pu.tenant_id=owner.id
   AND (o.partner_account_id IS NULL OR o.partner_account_id=pa.id)
   AND public.h15_actor_organization()=owner.id;
$function$;

-- 4. Capacidade (somente leitura). Crédito BLOQUEADO: a calculadora canônica exige
--    c2_order_actor_scope, que também é a autoridade dos writers de pedido.
CREATE FUNCTION platform_private.b2b_finance_capability_core()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE u uuid:=auth.uid(); pid uuid; nome text;
BEGIN
 pid:=platform_private.b2b_finance_actor_partner();
 IF u IS NULL OR pid IS NULL THEN
  RETURN jsonb_build_object('contract','B2B_FINANCE_ROLE_V1','allowed',false,'reason','not_finance_actor'); END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='pedidos_b2b')
  OR NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='contas_receber') THEN
  RETURN jsonb_build_object('contract','B2B_FINANCE_ROLE_V1','allowed',false,'reason','not_entitled'); END IF;
 SELECT coalesce(nullif(btrim(pa.nome_fantasia),''),pa.razao_social) INTO nome FROM public.partner_accounts pa WHERE pa.id=pid;
 RETURN jsonb_build_object('contract','B2B_FINANCE_ROLE_V1','allowed',true,'partner_id',pid,'partner_name',nome,
  'obligations_read',true,'export',true,'credit_read',false,'credit_reason','canonical_calculator_blocked','writes',false);
END $function$;
CREATE FUNCTION public.b2b_finance_capability_v1()
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO ''
AS $function$ SELECT platform_private.b2b_finance_capability_core(); $function$;

-- 5. Leituras diretas sem papel (vínculo por partner_users) ficam fechadas ao financeiro.
CREATE POLICY b2b_finance_role_direct_closed ON public.partner_order_financial_links AS RESTRICTIVE
  FOR ALL TO authenticated USING (NOT (SELECT platform_private.b2b_finance_role_holder()))
  WITH CHECK (NOT (SELECT platform_private.b2b_finance_role_holder()));
CREATE POLICY b2b_finance_role_direct_closed ON public.partner_accounts AS RESTRICTIVE
  FOR ALL TO authenticated USING (NOT (SELECT platform_private.b2b_finance_role_holder()))
  WITH CHECK (NOT (SELECT platform_private.b2b_finance_role_holder()));

-- 6. Deltas mínimos sobre corpos LIVE capturados (md5 conferidos no PRE).
-- @@CAPTURED_DELTAS@@

-- 7. ACL mínima (padrão do projeto concede service_role a funções novas: revogar).
REVOKE ALL ON FUNCTION platform_private.b2b_finance_role_holder() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION platform_private.b2b_finance_role_holder() TO authenticated;
REVOKE ALL ON FUNCTION platform_private.b2b_finance_actor_partner() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION platform_private.b2b_finance_capability_core() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION platform_private.b2b_finance_capability_core() TO authenticated;
REVOKE ALL ON FUNCTION public.b2b_finance_capability_v1() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_finance_capability_v1() TO authenticated;
COMMIT;
