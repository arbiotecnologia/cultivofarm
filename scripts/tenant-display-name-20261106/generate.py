#!/usr/bin/env python3
"""Gera 01-04 de TENANT_DISPLAY_NAME_V1 a partir das capturas read-only de produção (06/11, ref swzpzcwiasxmjutrmvkm).
Nunca editar 01-04 à mão. Não executa nada hospedado."""
import hashlib, pathlib

HERE = pathlib.Path(__file__).resolve().parent
CAP = HERE / "captured"
def cap(name, md5):
    b = (CAP / name).read_bytes(); assert hashlib.md5(b).hexdigest() == md5, name; return b.decode()

PINS = {
    "platform_private.h15_actor_organization()": "64e10608403238a41a9baf92857ca881",
    "platform_private.platform_actor_access_ready(uuid)": "048249c0c2106c3761e26eacb8d0de84",
    "platform_private.b2b_commercial_partner_projection()": "ebd6bf6f252676ba21445427a7057588",
    "public.get_my_commercial_partner_projection()": "730a17482e07d1bc350edfaea907cd1f",
}
ACL = "postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres"
PROJ_SIG = "platform_private.b2b_commercial_partner_projection()"
PROJ = cap("platform_private.b2b_commercial_partner_projection.ebd6bf6f.live-20261106.sql", PINS[PROJ_SIG])
ANCHOR = " RETURN result||jsonb_build_object('finance_capabilities',"
SELLER = (" RETURN result||jsonb_build_object('seller',(SELECT jsonb_build_object('organization_id',o.id,'name',"
          "COALESCE(NULLIF(btrim(o.nome_fantasia),''),NULLIF(btrim(o.nome),''),NULLIF(btrim(o.razao_social),''))) "
          "FROM public.organizations o WHERE permitted AND o.ativo IS TRUE "
          "AND o.id=(c->>'commercial_owner_organization_id')::uuid))||jsonb_build_object('finance_capabilities',")
assert PROJ.count(ANCHOR) == 1
NEW_PROJ = PROJ.replace(ANCHOR, SELLER)

DISPLAY_FN = """CREATE FUNCTION public.tenant_display_name_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_org uuid; v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  -- Guard canônico de sessão ativa: perfil ativo, sem senha provisória/convite em processamento, organização ativa.
  v_org := platform_private.h15_actor_organization();
  IF v_org IS NULL THEN RAISE EXCEPTION 'tenant_display_forbidden' USING ERRCODE = '42501'; END IF;
  -- Somente nome de exibição: sem CNPJ, e-mail, status, plano ou dados de onboarding.
  SELECT COALESCE(NULLIF(btrim(o.nome_fantasia), ''), NULLIF(btrim(o.nome), ''), NULLIF(btrim(o.razao_social), ''))
    INTO v_name FROM public.organizations o WHERE o.id = v_org AND o.ativo IS TRUE;
  RETURN jsonb_build_object('contract', 'TENANT_DISPLAY_NAME_V1', 'organization_id', v_org, 'name', v_name);
END $function$;
"""

def pin_block(tag):
    cond = "\n  OR ".join(f"md5(pg_get_functiondef('{s}'::regprocedure)) <> '{m}'" for s, m in PINS.items())
    return f"""DO $pre$
BEGIN
  IF {cond}
  THEN RAISE EXCEPTION '{tag}: corpo divergente da captura 06/11'; END IF;
  IF (SELECT coalesce(array_to_string(proacl, ','), '') FROM pg_proc WHERE oid = '{PROJ_SIG}'::regprocedure) <> '{ACL}'
  THEN RAISE EXCEPTION '{tag}: ACL da projeção divergente'; END IF;
  IF to_regprocedure('public.tenant_display_name_v1()') IS NOT NULL THEN RAISE EXCEPTION '{tag}: tenant_display_name_v1 já existe'; END IF;
END $pre$;
"""

def lit(s):
    tag = "$cap$"; assert tag not in s; return tag + s + tag

PRE = "-- READ ONLY. Confirmar antes que o projeto conectado é swzpzcwiasxmjutrmvkm.\nSELECT\n" + ",\n".join(
    f"  md5(pg_get_functiondef('{s}'::regprocedure)) = '{m}' AS pin_{i}" for i, (s, m) in enumerate(PINS.items())) + \
    f",\n  (SELECT coalesce(array_to_string(proacl, ','), '') FROM pg_proc WHERE oid = '{PROJ_SIG}'::regprocedure) = '{ACL}' AS proj_acl_ok," \
    "\n  to_regprocedure('public.tenant_display_name_v1()') IS NULL AS target_absent;\n"

INSTALL = f"""-- TENANT_DISPLAY_NAME_V1 — nome de exibição do tenant ativo + nome do vendedor na projeção B2B já autorizada.
-- REVISÃO: não aplicar sem 01-pre aprovado no ref swzpzcwiasxmjutrmvkm. Gerado por generate.py; não editar.
-- Não altera org_onboarding_state, RLS, tabelas, guards nem ACL existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
{pin_block('PRE_DRIFT')}
{DISPLAY_FN}
REVOKE ALL ON FUNCTION public.tenant_display_name_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_display_name_v1() TO authenticated;

-- Projeção B2B: um único acréscimo 'seller' (nome do commercial_owner) somente quando a cadeia B2B já permitiu.
DO $delta$
DECLARE v text := pg_get_functiondef('{PROJ_SIG}'::regprocedure);
BEGIN
  IF (length(v) - length(replace(v, {lit(ANCHOR)}, ''))) / length({lit(ANCHOR)}) <> 1 THEN RAISE EXCEPTION 'DELTA_ANCHOR'; END IF;
  EXECUTE replace(v, {lit(ANCHOR)}, {lit(SELLER)});
END $delta$;

DO $post$
BEGIN
  IF md5(pg_get_functiondef('{PROJ_SIG}'::regprocedure)) <> '{hashlib.md5(NEW_PROJ.encode()).hexdigest()}' THEN RAISE EXCEPTION 'POST_DRIFT: projeção'; END IF;
  IF (SELECT coalesce(array_to_string(proacl, ','), '') FROM pg_proc WHERE oid = '{PROJ_SIG}'::regprocedure) <> '{ACL}' THEN RAISE EXCEPTION 'POST_DRIFT: ACL'; END IF;
END $post$;
COMMIT;
"""

POST = f"""-- READ ONLY após instalação.
SELECT
  md5(pg_get_functiondef('{PROJ_SIG}'::regprocedure)) = '{hashlib.md5(NEW_PROJ.encode()).hexdigest()}' AS projection_post_pin,
  (SELECT coalesce(array_to_string(proacl, ','), '') FROM pg_proc WHERE oid = '{PROJ_SIG}'::regprocedure) = '{ACL}' AS projection_acl_unchanged,
  md5(pg_get_functiondef('public.get_my_commercial_partner_projection()'::regprocedure)) = '{PINS['public.get_my_commercial_partner_projection()']}' AS wrapper_unchanged,
  md5(pg_get_functiondef('platform_private.h15_actor_organization()'::regprocedure)) = '{PINS['platform_private.h15_actor_organization()']}' AS guard_unchanged,
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.tenant_display_name_v1()'::regprocedure) AS display_definer,
  NOT has_function_privilege('anon', 'public.tenant_display_name_v1()', 'EXECUTE') AS display_anon_denied,
  has_function_privilege('authenticated', 'public.tenant_display_name_v1()', 'EXECUTE') AS display_authenticated_ok;
"""

ROLLBACK = f"""-- Rollback deny-only: restaura o corpo EXATO capturado da projeção e troca tenant_display_name_v1 por negação sem EXECUTE.
BEGIN;
DO $rb$
BEGIN
  EXECUTE {lit(PROJ)};
  IF md5(pg_get_functiondef('{PROJ_SIG}'::regprocedure)) <> '{PINS[PROJ_SIG]}' THEN RAISE EXCEPTION 'ROLLBACK_DRIFT'; END IF;
END $rb$;
CREATE OR REPLACE FUNCTION public.tenant_display_name_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ BEGIN RAISE EXCEPTION 'tenant_display_disabled' USING ERRCODE = '42501'; END $function$;
REVOKE ALL ON FUNCTION public.tenant_display_name_v1() FROM PUBLIC, anon, authenticated;
COMMIT;
"""

if __name__ == "__main__":
    for n, t in [("01-pre.sql.readonly", PRE), ("02-install.sql.review", INSTALL), ("03-post.sql.readonly", POST), ("04-rollback-deny.sql.review", ROLLBACK)]:
        (HERE / n).write_text(t)
    print("ok", hashlib.md5(NEW_PROJ.encode()).hexdigest())
