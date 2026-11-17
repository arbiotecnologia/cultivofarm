#!/usr/bin/env python3
"""Gera 02b-install.sql.review a partir dos corpos LIVE capturados (md5 pinados).
Cada substituição precisa casar exatamente uma vez; qualquer drift aborta. Não acessa banco."""
import hashlib, json, pathlib, sys
H = pathlib.Path(__file__).resolve().parent
C = H / "captured"
PINS = json.loads((H / "pins.json").read_text())

def body(name):
    t = (C / f"{name}.sql").read_text()
    sig, md5 = PINS[name]
    if hashlib.md5(t.encode()).hexdigest() != md5: sys.exit(f"DRIFT {name}")
    return t

def sub(t, old, new, name):
    if t.count(old) != 1: sys.exit(f"ANCHOR {name}: {old[:60]!r} x{t.count(old)}")
    return t.replace(old, new)

DELTA = ["platform_private.b2b_own_obligations_owner", "platform_private.external_provisioning_scope", "admin_provision_user_profile_v1", "b2b_finish_provisioning", "fn_b2b_credit_exposure", "rpc_partner_message_counters", "platform_private.b2b_credit_balances"]
FIN = "'parceiro_b2b_financeiro'"
out = []
# 1. Guardião de obrigações próprias: ramo financeiro exclusivo, gestor preservado verbatim.
t = body("platform_private.b2b_own_obligations_owner")
t = sub(t, """ IF u IS NULL OR NOT platform_private.platform_actor_access_ready(u)
  OR NOT public.has_role(u,'parceiro_b2b') THEN
  RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.is_valid_b2b_partner_user(u,p_partner_id) THEN
 RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;""",
""" IF u IS NULL OR NOT platform_private.platform_actor_access_ready(u) THEN
  RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;
 -- B2B_FINANCE_ROLE_V1: gestor segue o validador canônico; financeiro externo exige papel exclusivo,
 -- vínculo papel='financeiro' vigente e parceiro derivado do servidor (nunca do argumento).
 IF public.has_role(u,'parceiro_b2b') THEN
  IF NOT public.is_valid_b2b_partner_user(u,p_partner_id) THEN
  RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;
 ELSIF p_partner_id IS NULL OR platform_private.b2b_finance_actor_partner() IS DISTINCT FROM p_partner_id THEN
  RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;""", "owner")
out.append(t.rstrip() + ";\n")
# 2. Provisionamento: allowlist, parceiro obrigatório, exclusividade do financeiro.
t = body("platform_private.external_provisioning_scope")
t = sub(t, "r NOT IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor')) THEN RAISE EXCEPTION 'c2_invalid_roles' USING ERRCODE='22023'; END IF;",
 f"r NOT IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor',{FIN})) THEN RAISE EXCEPTION 'c2_invalid_roles' USING ERRCODE='22023'; END IF;\n IF {FIN}=ANY(p_roles) AND cardinality(p_roles)<>1 THEN RAISE EXCEPTION 'c2_finance_role_exclusive' USING ERRCODE='22023'; END IF;", "scope1")
t = sub(t, "IF NOT ('parceiro_b2b'=ANY(p_roles) OR 'parceiro_b2b_tecnico'=ANY(p_roles)) THEN",
 f"IF NOT ('parceiro_b2b'=ANY(p_roles) OR 'parceiro_b2b_tecnico'=ANY(p_roles) OR {FIN}=ANY(p_roles)) THEN", "scope2")
out.append(t.rstrip() + ";\n")
t = body("admin_provision_user_profile_v1")
t = sub(t, "WHERE r IN ('parceiro_b2b'::public.app_role, 'parceiro_b2b_tecnico'::public.app_role);",
 "WHERE r IN ('parceiro_b2b'::public.app_role, 'parceiro_b2b_tecnico'::public.app_role, 'parceiro_b2b_financeiro'::public.app_role);", "prov1")
t = sub(t, "IF p_partner_id IS NULL OR p_partner_papel NOT IN ('gestor', 'tecnico') THEN",
 "IF p_partner_id IS NULL OR p_partner_papel IS NULL OR p_partner_papel NOT IN ('gestor', 'tecnico', 'financeiro')\n       OR (('parceiro_b2b_financeiro'::public.app_role = ANY(p_roles)) IS DISTINCT FROM (p_partner_papel = 'financeiro'))\n       OR ('parceiro_b2b_financeiro'::public.app_role = ANY(p_roles) AND v_role_count <> 1) THEN", "prov2")
out.append(t.rstrip() + ";\n")
t = body("b2b_finish_provisioning")
t = sub(t, "WHEN 'parceiro_b2b'=ANY(rs) THEN 'gestor' ELSE 'tecnico' END);",
 "WHEN 'parceiro_b2b'=ANY(rs) THEN 'gestor' WHEN 'parceiro_b2b_financeiro'=ANY(rs) THEN 'financeiro' ELSE 'tecnico' END);", "finish")
out.append(t.rstrip() + ";\n")
# 5. Crédito: corpo canônico vira núcleo privado SEM a checagem de ator (mesma fórmula, byte a byte);
#    a função pública mantém assinatura/ACL e reexecuta a MESMA checagem antes de delegar.
src = body("fn_b2b_credit_exposure")
core = sub(src, "CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure(", "CREATE OR REPLACE FUNCTION platform_private.b2b_credit_exposure_core(", "core1")
core = sub(core, "  PERFORM platform_private.b2b_integration_actor(p_partner_id);\n", "", "core2")
# Balanços chamam b2b_integration_actor (c2_order_actor_scope) por conta própria: o núcleo de exposição
# usa o núcleo de balanços com a organização dona do parceiro (a wrapper pública já provou ator=dono).
core = sub(core, "platform_private.b2b_credit_balances(p_partner_id,p_exclude_order_id)",
 "platform_private.b2b_credit_balances_core(p_partner_id,p_exclude_order_id,(SELECT pa.commercial_owner_organization_id FROM public.partner_accounts pa WHERE pa.id=p_partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL))", "core3")
bal = body("platform_private.b2b_credit_balances")
bc = sub(bal, "FUNCTION platform_private.b2b_credit_balances(p_partner uuid, p_exclude uuid DEFAULT NULL::uuid)", "FUNCTION platform_private.b2b_credit_balances_core(p_partner uuid, p_exclude uuid, p_org uuid)", "bal1")
bc = sub(bc, "DECLARE org uuid:=platform_private.b2b_integration_actor(p_partner);", "DECLARE org uuid:=p_org;", "bal2")
bc = sub(bc, "BEGIN\n IF platform_private.b2b_credit_config_block(p_partner)", """BEGIN
 IF org IS NULL OR org IS DISTINCT FROM (SELECT pa.commercial_owner_organization_id FROM public.partner_accounts pa
   WHERE pa.id=p_partner AND pa.ativo IS TRUE AND pa.deleted_at IS NULL) THEN RAISE EXCEPTION 'B2B_TENANT_DENIED' USING ERRCODE='42501'; END IF;
 IF platform_private.b2b_credit_config_block(p_partner)""", "bal3")
out.append(bc.rstrip() + ";\n")
out.append(bal[:bal.index("DECLARE")] + """BEGIN
 -- B2B_FINANCE_ROLE_V1: autorização canônica inalterada; cálculo no núcleo único.
 RETURN platform_private.b2b_credit_balances_core(p_partner,p_exclude,platform_private.b2b_integration_actor(p_partner));
END $function$;\n""")
out.append(core.rstrip() + ";\n")
hdr = src[:src.index("DECLARE")]
out.append(hdr + """BEGIN
  -- B2B_FINANCE_ROLE_V1: autorização canônica inalterada; cálculo delegado ao núcleo único.
  PERFORM platform_private.b2b_integration_actor(p_partner_id);
  RETURN platform_private.b2b_credit_exposure_core(p_partner_id, p_new_order_amount, p_exclude_order_id);
END $function$;\n""")
# 6. Contadores de mensagens: fechados ao portador do papel financeiro (antes de qualquer leitura).
t = body("rpc_partner_message_counters")
t = sub(t, "BEGIN\n  IF NOT (public.has_role(", "BEGIN\n  IF platform_private.b2b_finance_role_holder() THEN\n    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';\n  END IF;\n  IF NOT (public.has_role(", "counters")
out.append(t.rstrip() + ";\n")
out_main = out; out = []
# 7. Transição canônica de acesso (Editar Usuário): alvo 'b2b_finance', papel+vínculo juntos, CAS de vínculo.
t = body("platform_private.user_admin_change_access_type_core")
t = sub(t, "p_cliente_id uuid, p_idempotency_key uuid, p_reason text)", "p_cliente_id uuid, p_idempotency_key uuid, p_reason text, p_partner_id uuid, p_expected_link_version integer)", "at0")
t = sub(t, "ARRAY['cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico']::public.app_role[];",
 "ARRAY['cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico','parceiro_b2b_financeiro']::public.app_role[];\n  c_fin constant public.app_role[] := ARRAY['parceiro_b2b_financeiro']::public.app_role[];\n  v_link_n int := 0; v_link_ver int; v_link_partner uuid;", "at1")
t = sub(t, "p_target NOT IN ('internal','b2b','producer')", "p_target NOT IN ('internal','b2b','producer','b2b_finance')", "at2")
t = sub(t, "p_cliente_id, btrim(p_reason)));", "p_cliente_id, btrim(p_reason), p_partner_id, p_expected_link_version));", "at3")
t = sub(t, "    WHEN 'b2b' THEN IF NOT (v_add <@ c_b2b) THEN RAISE EXCEPTION 'b2b_roles_required' USING ERRCODE='22023'; END IF;",
 "    WHEN 'b2b' THEN IF NOT (v_add <@ c_b2b) THEN RAISE EXCEPTION 'b2b_roles_required' USING ERRCODE='22023'; END IF;\n    WHEN 'b2b_finance' THEN IF NOT (v_add <@ c_fin) THEN RAISE EXCEPTION 'b2b_finance_roles_required' USING ERRCODE='22023'; END IF;", "at4")
t = sub(t, "v_allowed := CASE p_target WHEN 'internal' THEN c_internal WHEN 'b2b' THEN c_b2b ELSE", "v_allowed := CASE p_target WHEN 'internal' THEN c_internal WHEN 'b2b' THEN c_b2b WHEN 'b2b_finance' THEN c_fin ELSE", "at5")
t = sub(t, "  IF p_target = 'b2b' AND NOT EXISTS (SELECT 1 FROM public.partner_users pu", """  -- B2B_FINANCE_ROLE_V1: exclusivo, vínculo único com CAS observado (revalidado após o lock).
  IF p_target = 'b2b_finance' AND v_final IS DISTINCT FROM c_fin THEN RAISE EXCEPTION 'b2b_finance_role_exclusive' USING ERRCODE='22023'; END IF;
  IF p_target <> 'b2b_finance' AND p_partner_id IS NOT NULL THEN RAISE EXCEPTION 'partner_not_allowed' USING ERRCODE='22023'; END IF;
  IF p_target = 'b2b_finance' OR 'parceiro_b2b_financeiro' = ANY(v_current) THEN
    SELECT count(*), max(pu.version), (array_agg(pu.partner_id))[1] INTO v_link_n, v_link_ver, v_link_partner
      FROM public.partner_users pu WHERE pu.user_id = p_user_id AND pu.revoked_at IS NULL;
    IF v_link_n > 1 THEN RAISE EXCEPTION 'partner_link_ambiguous' USING ERRCODE='PT409'; END IF;
    IF v_link_ver IS DISTINCT FROM p_expected_link_version THEN RAISE EXCEPTION 'partner_link_conflict' USING ERRCODE='PT409'; END IF;
    IF v_link_n = 1 AND NOT EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.user_id = p_user_id AND pu.revoked_at IS NULL AND pu.tenant_id = v_org) THEN
      RAISE EXCEPTION 'partner_link_foreign' USING ERRCODE='42501'; END IF;
  ELSIF p_expected_link_version IS NOT NULL THEN RAISE EXCEPTION 'link_version_not_allowed' USING ERRCODE='22023';
  END IF;
  IF p_target = 'b2b_finance' THEN
    IF v_link_n = 0 AND p_partner_id IS NULL THEN RAISE EXCEPTION 'partner_required' USING ERRCODE='22023'; END IF;
    IF v_link_n = 1 AND p_partner_id IS NOT NULL AND p_partner_id IS DISTINCT FROM v_link_partner THEN RAISE EXCEPTION 'partner_link_change_unsupported' USING ERRCODE='22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.partner_accounts pa WHERE pa.id = COALESCE(v_link_partner, p_partner_id)
        AND pa.commercial_owner_organization_id = v_org AND pa.ativo AND pa.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'partner_link_required' USING ERRCODE='22023'; END IF;
  END IF;
  IF p_target = 'b2b' AND NOT EXISTS (SELECT 1 FROM public.partner_users pu""", "at6")
t = sub(t, "v_end_all := p_target IN ('producer','b2b')", "v_end_all := p_target IN ('producer','b2b','b2b_finance')", "at7")
t = sub(t, "  IF v_remove && c_b2b AND NOT (v_final && c_b2b) THEN", """  IF p_target = 'b2b_finance' THEN
    IF v_link_n = 0 THEN
      INSERT INTO public.partner_users(partner_id, user_id, papel, tenant_id) VALUES (p_partner_id, p_user_id, 'financeiro', v_org);
    ELSE
      UPDATE public.partner_users SET papel = 'financeiro' WHERE user_id = p_user_id AND revoked_at IS NULL AND tenant_id = v_org AND papel <> 'financeiro';
    END IF;
  ELSIF p_target = 'b2b' AND 'parceiro_b2b_financeiro' = ANY(v_remove) THEN
    UPDATE public.partner_users SET papel = CASE WHEN 'parceiro_b2b' = ANY(v_final) THEN 'gestor' ELSE 'tecnico' END
     WHERE user_id = p_user_id AND revoked_at IS NULL AND tenant_id = v_org;
  END IF;
  IF v_remove && (c_b2b || c_fin) AND NOT (v_final && (c_b2b || c_fin)) THEN""", "at8")
out.append("DROP FUNCTION platform_private.user_admin_change_access_type_core(uuid,bigint,uuid,text,public.app_role[],public.app_role[],uuid,uuid,text);\n" + t.rstrip() + ";\n")
t = body("tenant_admin_user_access_exec_v1")
t = sub(t, "k NOT IN ('user_id','target','roles','remove_roles','cliente_id','idempotency_key','reason')", "k NOT IN ('user_id','target','roles','remove_roles','cliente_id','idempotency_key','reason','partner_id','expected_link_version')", "ex1")
t = sub(t, "NULLIF(a->>'cliente_id','')::uuid, (a->>'idempotency_key')::uuid, a->>'reason');", "NULLIF(a->>'cliente_id','')::uuid, (a->>'idempotency_key')::uuid, a->>'reason',\n      NULLIF(a->>'partner_id','')::uuid, (a->>'expected_link_version')::integer);", "ex2")
out.append(t.rstrip() + ";\n")
out_c = out; out = out_main
DELTA_C = ["platform_private.user_admin_change_access_type_core", "tenant_admin_user_access_exec_v1"]
hdr_c = """-- B2B_FINANCE_ROLE_V1 02c — transição canônica de acesso (Editar Usuário). Gerado por build.py; não editar.
-- Requer 02b aplicado e o pacote user-edit-access-email-links-20261117 instalado (corpos pinados abaixo).
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ DECLARE k text; v text; pins jsonb := '""" + json.dumps({k: PINS[k] for k in DELTA_C}) + """';
BEGIN
  IF current_setting('app.expected_ref', true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'B2B_FIN_02C_REF_UNPROVEN'; END IF;
  IF to_regprocedure('public.b2b_finance_capability_v1()') IS NULL THEN RAISE EXCEPTION 'B2B_FIN_02C_REQUIRES_02B'; END IF;
  FOR k, v IN SELECT key, value->>1 FROM jsonb_each(pins) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE p.prokind='f' AND (n.nspname||'.'||p.proname = k OR (n.nspname='public' AND p.proname=k)) AND md5(pg_get_functiondef(p.oid)) = v) THEN
      RAISE EXCEPTION 'B2B_FIN_02C_DRIFT:%', k; END IF;
  END LOOP;
END $$;
"""
LINK_READER = """-- Leitura da versão observada do vínculo (CAS do painel): só administrador do tenant do alvo; nenhum vínculo de outro tenant.
CREATE FUNCTION public.tenant_admin_partner_link_v1(p_user_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE org uuid := public.h15_actor_organization(); n int; r record;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR NOT platform_private.is_tenant_admin_for_user(p_user_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO n FROM public.partner_users WHERE user_id=p_user_id AND revoked_at IS NULL;
 SELECT pu.partner_id, pu.papel, pu.version INTO r FROM public.partner_users pu WHERE pu.user_id=p_user_id AND pu.revoked_at IS NULL AND pu.tenant_id=org LIMIT 1;
 RETURN jsonb_build_object('contract','PARTNER_LINK_V1','ambiguous', n>1, 'foreign', n=1 AND r.partner_id IS NULL,
  'link', CASE WHEN n=1 AND r.partner_id IS NOT NULL THEN jsonb_build_object('partner_id',r.partner_id,'papel',r.papel,'version',r.version) END);
END $function$;
REVOKE ALL ON FUNCTION public.tenant_admin_partner_link_v1(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_admin_partner_link_v1(uuid) TO authenticated;
"""
(H / "02c-install-access-transition.sql.review").write_text(hdr_c + "\n".join(out_c) + LINK_READER +
 "REVOKE ALL ON FUNCTION platform_private.user_admin_change_access_type_core(uuid,bigint,uuid,text,public.app_role[],public.app_role[],uuid,uuid,text,uuid,integer) FROM PUBLIC, anon, authenticated, service_role;\nCOMMIT;\n")
(H / "04c-rollback-access-transition.sql.review").write_text("""-- Reversão do 02c: recusa se houver vínculo/papel financeiro; restaura corpos LIVE verbatim.
BEGIN;
DO $$ BEGIN
  IF current_setting('app.expected_ref', true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'B2B_FIN_RB_REF_UNPROVEN'; END IF;
END $$;
""" + "".join(body(n).rstrip() + ";\n" for n in DELTA_C) +
 "REVOKE ALL ON FUNCTION platform_private.user_admin_change_access_type_core(uuid,bigint,uuid,text,public.app_role[],public.app_role[],uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;\n"
 "DROP FUNCTION platform_private.user_admin_change_access_type_core(uuid,bigint,uuid,text,public.app_role[],public.app_role[],uuid,uuid,text,uuid,integer);\nDROP FUNCTION public.tenant_admin_partner_link_v1(uuid);\nCOMMIT;\n")
tpl = (H / "02b-install.template.sql").read_text()
res = tpl.replace("-- @@CAPTURED_DELTAS@@\n", "\n".join(out))
(H / "02b-install.sql.review").write_text(res)
pins = json.dumps({k: v for k, v in PINS.items() if k in DELTA or k == "platform_private.b2b_credit_config_block"})
pre = (H / "01-pre.template.sql").read_text().replace("@@PINS@@", pins)
(H / "01-pre.sql.readonly").write_text(pre)
rb = (H / "04-rollback.template.sql").read_text().replace("-- @@CAPTURED_ORIGINALS@@\n", "".join(body(n).rstrip() + ";\n" for n in DELTA) + "DROP FUNCTION platform_private.b2b_credit_exposure_core(uuid,numeric,uuid);\nDROP FUNCTION platform_private.b2b_credit_balances_core(uuid,uuid,uuid);\n")
(H / "04-rollback.sql.review").write_text(rb)
print("OK", hashlib.sha256(res.encode()).hexdigest())
