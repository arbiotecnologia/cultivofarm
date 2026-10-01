-- Harness server-side do fluxo Nova Empresa/onboarding. Sempre termina em ROLLBACK.
-- Uso: substituir :ADMIN e :COMUM (usuário não admin da mesma org) e executar.
BEGIN;
SELECT set_config('t.res', '', true);

CREATE OR REPLACE FUNCTION pg_temp.ok(_n text, _sql text, _expect text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _sql;
    PERFORM set_config('t.res', current_setting('t.res') || _n || '=' ||
      CASE WHEN _expect = 'ok' THEN 'PASS' ELSE 'FAIL(sem erro)' END || E'\n', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('t.res', current_setting('t.res') || _n || '=' ||
      CASE WHEN _expect <> 'ok' AND SQLERRM ILIKE '%' || _expect || '%' THEN 'PASS'
           ELSE 'FAIL(' || left(SQLERRM, 80) || ')' END || E'\n', true);
  END;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(text,text,text) TO authenticated;

-- Funções puras (como dono)
SELECT pg_temp.ok('transicao_rascunho_ativa_bloqueada',
  $q$ DO $d$ BEGIN IF public.org_status_transition_ok('rascunho','ativa') THEN RAISE EXCEPTION 'aceitou'; END IF; END $d$ $q$, 'ok');
SELECT pg_temp.ok('cnpj_dv_valido', $q$ DO $d$ BEGIN IF NOT platform_private.cnpj_valido('11.222.333/0001-81') THEN RAISE EXCEPTION 'x'; END IF; END $d$ $q$, 'ok');
SELECT pg_temp.ok('cnpj_dv_invalido', $q$ DO $d$ BEGIN IF platform_private.cnpj_valido('11.222.333/0001-82') THEN RAISE EXCEPTION 'x'; END IF; END $d$ $q$, 'ok');

-- Usuário autenticado qualquer (não superadmin, sem perfil)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
SELECT pg_temp.ok('nao_superadmin_cria_empresa', $q$ SELECT public.platform_create_organization('X','', '11222333000181','a@b.co','basico',false) $q$, 'apenas superadmin');
SELECT pg_temp.ok('nao_superadmin_muda_status', $q$ SELECT public.platform_set_organization_status(gen_random_uuid(),'suspensa','motivo teste') $q$, 'apenas superadmin');
SELECT pg_temp.ok('insert_direto_org', $q$ INSERT INTO public.organizations(nome,status) VALUES ('hack','ativa') $q$, 'permission denied');
SELECT pg_temp.ok('interno_set_status', $q$ SELECT public._org_set_status(gen_random_uuid(),'ativa','x') $q$, 'permission denied');
SELECT pg_temp.ok('interno_admin_org', $q$ SELECT public._org_admin_org() $q$, 'permission denied');
SELECT pg_temp.ok('interno_ticket', $q$ SELECT platform_private.issue_ticket('org_write', gen_random_uuid()) $q$, 'permission denied');
SELECT pg_temp.ok('interno_validar', $q$ SELECT platform_private.onboarding_validar('{}') $q$, 'permission denied');
SELECT pg_temp.ok('sem_admin_salva_onboarding', $q$ SELECT public.org_onboarding_save('{}') $q$, 'apenas administrador');

-- Administrador de empresa
SELECT set_config('request.jwt.claims', json_build_object('sub', :'ADMIN', 'role','authenticated')::text, true);
SELECT pg_temp.ok('admin_update_direto', $q$ UPDATE public.organizations SET status='ativa' $q$, 'permission denied');
SELECT pg_temp.ok('admin_insert_direto', $q$ INSERT INTO public.organizations(nome) VALUES ('x') $q$, 'permission denied');
SELECT pg_temp.ok('payload_chave_extra', $q$ SELECT public.org_onboarding_save('{"organization_id":"x"}') $q$, 'campo não permitido');
SELECT pg_temp.ok('payload_oversize', $q$ SELECT public.org_onboarding_save(jsonb_build_object('razao_social', repeat('a', 300))) $q$, 'muito longo');
SELECT pg_temp.ok('payload_cnpj_dv', $q$ SELECT public.org_onboarding_save('{"cnpj":"11.222.333/0001-82"}') $q$, 'dígitos verificadores');
SELECT pg_temp.ok('payload_tipo', $q$ SELECT public.org_onboarding_save('{"uf":{"a":1}}') $q$, 'deve ser texto');
SELECT pg_temp.ok('ativacao_idempotente', $q$ DO $d$ BEGIN IF NOT (public.org_onboarding_complete()->>'idempotent')::boolean THEN RAISE EXCEPTION 'nao idempotente'; END IF; END $d$ $q$, 'ok');
SELECT pg_temp.ok('cross_tenant_select', $q$ DO $d$ BEGIN IF (SELECT count(*) FROM public.organizations o WHERE o.id <> (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())) > 0 THEN RAISE EXCEPTION 've outra org'; END IF; END $d$ $q$, 'ok');

-- Usuário comum da mesma organização
SELECT set_config('request.jwt.claims', json_build_object('sub', :'COMUM', 'role','authenticated')::text, true);
SELECT pg_temp.ok('comum_sem_dados', $q$ DO $d$ BEGIN IF public.org_onboarding_state() ? 'dados' OR public.org_onboarding_state() ? 'cnpj' THEN RAISE EXCEPTION 'vazou'; END IF; END $d$ $q$, 'ok');

RESET ROLE;
SELECT current_setting('t.res') AS resultado;
ROLLBACK;
