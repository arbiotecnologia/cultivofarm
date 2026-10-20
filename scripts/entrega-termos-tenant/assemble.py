#!/usr/bin/env python3
"""Monta candidate.sql.review / rollback.sql.review / preflight / postflight a partir das
definições LIVE capturadas (baseline/). Fora de supabase/migrations: nada é aplicado aqui."""
import pathlib, json
H = pathlib.Path(__file__).parent
B = {n: (H / "baseline" / f"{n}.sql").read_text().rstrip("\n") for n in
     ["rpc_entrega_gerar_termo_v1", "rpc_entrega_assinar_termo_v1", "rpc_entrega_cancelar_termo_v1",
      "rpc_entrega_registrar_pdf_termo_v1"]}

# md5(pg_get_functiondef) LIVE lidos em 19/10/2026 23:45 UTC (somente leitura, ref swzpzcwiasxmjutrmvkm).
LIVE = {
    "public.rpc_entrega_gerar_termo_v1(uuid,text)": "90d3bd16e7629970a8733ee77da71e2f",
    "public.rpc_entrega_assinar_termo_v1(uuid,jsonb,text)": "01c59220d0c975addcde29d5945a7ae0",
    "public.rpc_entrega_cancelar_termo_v1(uuid,text)": "ee9f7c2c46e07fcba5e8c516d3934700",
    "public.rpc_entrega_registrar_pdf_termo_v1(uuid,text,text)": "bba1d160952c3ff34b5c36e720384698",
    "public.fn_entrega_build_snapshot_v1(uuid)": "8894facf7a2ccb32ceebb79f3d4a29be",
    "public.fn_entrega_cobertura_v1(uuid)": "7a9c3bb2c9bde5e4556af89818ef8534",
    "platform_private.h15_actor_organization()": "64e10608403238a41a9baf92857ca881",
    "public.is_delivery_staff(uuid)": "aa500abecc84ca8c901753c519f36fa1",
}
ACL_BASE = "postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres"
ACL_SERVICE = "postgres=X/postgres,service_role=X/postgres"
# Baseline contido: migration termo_pdf_registration_acl_containment (23:52 UTC 19/10) já revogou TRUNCATE e EXECUTE do registrar.
TABLE_ACL_BASE = "postgres=arwdDxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres"
TABLE_ACL_POST = "postgres=arwdDxtm/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres"
BASE_POLICY_QUAL = ("(is_delivery_staff(( SELECT auth.uid() AS uid)) OR is_financial_staff(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1\n"
                    "   FROM entregas e\n  WHERE ((e.id = entrega_termos.entrega_id) AND (e.cliente_id = ANY (get_cliente_ids_for_user(( SELECT auth.uid() AS uid))))))))")

GUARD = "  -- Tenant explícito: ator canônico ativo/pronto (h15) e entrega+cliente da mesma empresa.\n"
def sub(text, old, new):
    assert text.count(old) == 1, old
    return text.replace(old, new)

gerar = sub(B["rpc_entrega_gerar_termo_v1"],
    "  PERFORM pg_advisory_xact_lock(hashtextextended('entrega_termo:' || p_entrega_id::text, 0));\n",
    "  PERFORM pg_advisory_xact_lock(hashtextextended('entrega_termo:' || p_entrega_id::text, 0));\n" + GUARD +
    "  IF NOT public.is_delivery_staff(v_uid) OR NOT platform_private.entrega_termo_tenant_ok(p_entrega_id) THEN\n"
    "    RAISE EXCEPTION 'sem_permissao';\n  END IF;\n")
assinar = sub(B["rpc_entrega_assinar_termo_v1"],
    "  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_encontrado'; END IF;\n\n  PERFORM pg_advisory_xact_lock",
    "  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_encontrado'; END IF;\n" + GUARD +
    "  IF NOT platform_private.entrega_termo_tenant_ok(v_t.entrega_id) THEN RAISE EXCEPTION 'termo_nao_encontrado'; END IF;\n\n  PERFORM pg_advisory_xact_lock")
assinar = sub(assinar,
    "  SELECT * INTO v_t FROM public.entrega_termos WHERE id = p_termo_id FOR UPDATE;\n",
    "  SELECT * INTO v_t FROM public.entrega_termos WHERE id = p_termo_id FOR UPDATE;\n"
    "  -- Revalida após os locks (perfil/papel/empresa podem ter mudado durante a espera).\n"
    "  IF NOT FOUND OR NOT public.is_delivery_staff(v_uid)\n"
    "     OR NOT platform_private.entrega_termo_tenant_ok(v_t.entrega_id) THEN\n"
    "    RAISE EXCEPTION 'termo_nao_encontrado';\n  END IF;\n")
cancelar = sub(B["rpc_entrega_cancelar_termo_v1"],
    "  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_encontrado'; END IF;\n",
    "  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_encontrado'; END IF;\n" + GUARD +
    "  IF NOT platform_private.entrega_termo_tenant_ok(v_t.entrega_id) THEN RAISE EXCEPTION 'termo_nao_encontrado'; END IF;\n"
    "  -- Revalida o papel após o lock da linha.\n"
    "  IF NOT (public.has_role(v_uid,'administrador'::public.app_role)\n"
    "          OR public.has_role(v_uid,'gestor'::public.app_role)\n"
    "          OR public.has_role(v_uid,'administrativo'::public.app_role)) THEN\n"
    "    RAISE EXCEPTION 'sem_permissao';\n  END IF;\n")

HELPER = """CREATE FUNCTION platform_private.entrega_termo_tenant_ok(p_entrega_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p_entrega_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.entregas e
      JOIN public.clientes c ON c.id = e.cliente_id
     WHERE e.id = p_entrega_id
       AND e.organization_id IS NOT NULL
       AND c.organization_id = e.organization_id
       AND e.organization_id = platform_private.h15_actor_organization());
$function$"""
# Predicado único (DEFINER): empresa do ator = empresa da entrega = empresa do cliente, sem depender da RLS de entregas
# (que não inclui operador_onfarm). Retorna só boolean do próprio escopo; cross-tenant/inexistente = false (sem oráculo).
POLICY_EXPR = "platform_private.entrega_termo_tenant_ok(entrega_id)"
HELPER_ACL = "postgres=X/postgres,authenticated=X/postgres"

def fn_md5_check(sig, md5, label):
    return (f"  IF md5(pg_get_functiondef('{sig}'::regprocedure)) <> '{md5}' THEN\n"
            f"    RAISE EXCEPTION '{label}: drift em {sig}'; END IF;\n")
def acl_check(sig, acl, label):
    return (f"  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = '{sig}'::regprocedure), ','), '') <> '{acl}' THEN\n"
            f"    RAISE EXCEPTION '{label}: ACL inesperada em {sig}'; END IF;\n")

def state_checks(label, md5s, fn_acl, table_acl, candidate):
    s = (f"DO $chk$\nBEGIN\n"
         f"  IF current_database() <> 'postgres' THEN RAISE EXCEPTION '{label}: banco inesperado'; END IF;\n")
    for sig, m in md5s.items(): s += fn_md5_check(sig, m, label)
    for sig, a in fn_acl.items(): s += acl_check(sig, a, label)
    s += (f"  IF coalesce(array_to_string((SELECT relacl FROM pg_class WHERE oid = 'public.entrega_termos'::regclass), ','), '') <> '{table_acl}' THEN\n"
          f"    RAISE EXCEPTION '{label}: ACL da tabela inesperada'; END IF;\n"
          f"  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.entrega_termos'::regclass) THEN\n"
          f"    RAISE EXCEPTION '{label}: RLS desligada'; END IF;\n"
          f"  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='entrega_termos' AND policyname='entrega_termos_select'\n"
          f"      AND cmd='SELECT' AND permissive='PERMISSIVE' AND qual = $q${BASE_POLICY_QUAL}$q$) <> 1 THEN\n"
          f"    RAISE EXCEPTION '{label}: policy entrega_termos_select divergente'; END IF;\n")
    n = 2 if candidate else 1
    s += (f"  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='entrega_termos') <> {n} THEN\n"
          f"    RAISE EXCEPTION '{label}: conjunto de policies inesperado'; END IF;\n")
    s += ("  IF NOT has_schema_privilege('authenticated','platform_private','USAGE') THEN\n"
          f"    RAISE EXCEPTION '{label}: USAGE platform_private ausente'; END IF;\n")
    if candidate:
        s += ("  IF (SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='entrega_termos' AND policyname='entrega_termos_tenant_isolation')\n"
              "     IS DISTINCT FROM 'platform_private.entrega_termo_tenant_ok(entrega_id)' THEN\n"
              f"    RAISE EXCEPTION '{label}: predicado da policy restritiva divergente'; END IF;\n")
        s += ("  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='entrega_termos'\n"
              "      AND policyname='entrega_termos_tenant_isolation' AND permissive='RESTRICTIVE' AND cmd='ALL'\n"
              "      AND roles = '{authenticated}'::name[]) <> 1 THEN\n"
              f"    RAISE EXCEPTION '{label}: policy restritiva ausente'; END IF;\n"
              "  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'platform_private.entrega_termo_tenant_ok(uuid)'::regprocedure), ','), '') <> '" + HELPER_ACL + "' THEN\n"
              f"    RAISE EXCEPTION '{label}: ACL do helper inesperada'; END IF;\n"
              "  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'platform_private.entrega_termo_tenant_ok(uuid)'::regprocedure) IS NOT TRUE\n"
              "     OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'platform_private.entrega_termo_tenant_ok(uuid)'::regprocedure) <> 'postgres' THEN\n"
              f"    RAISE EXCEPTION '{label}: helper inesperado'; END IF;\n")
    else:
        s += ("  IF to_regprocedure('platform_private.entrega_termo_tenant_ok(uuid)') IS NOT NULL THEN\n"
              f"    RAISE EXCEPTION '{label}: helper já existe'; END IF;\n")
    for f in ["rpc_entrega_gerar_termo_v1", "rpc_entrega_assinar_termo_v1", "rpc_entrega_cancelar_termo_v1",
              "rpc_entrega_registrar_pdf_termo_v1", "fn_entrega_build_snapshot_v1", "fn_entrega_cobertura_v1"]:
        s += (f"  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='{f}'\n"
              f"      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION '{label}: {f} sobrecarga/dono/definer'; END IF;\n")
    return s + "END $chk$;\n"

def run(text): return text + ";\n"
SIGS3 = ["public.rpc_entrega_gerar_termo_v1(uuid,text)", "public.rpc_entrega_assinar_termo_v1(uuid,jsonb,text)",
         "public.rpc_entrega_cancelar_termo_v1(uuid,text)"]
REGISTRAR = "public.rpc_entrega_registrar_pdf_termo_v1(uuid,text,text)"  # já service-only em produção; rollback NÃO regrava
SERVICE_ONLY = [REGISTRAR, "public.fn_entrega_build_snapshot_v1(uuid)", "public.fn_entrega_cobertura_v1(uuid)"]
REOPENABLE = [x for x in SERVICE_ONLY if x != REGISTRAR]
PRE_ACL = {**{s: ACL_BASE for s in SIGS3 + REOPENABLE}, REGISTRAR: ACL_SERVICE}
POST_ACL = {**{s: ACL_BASE for s in SIGS3}, **{s: ACL_SERVICE for s in SERVICE_ONLY}}

def build(live_md5=LIVE, post_md5=None):
    pre = state_checks("PREFLIGHT", live_md5, PRE_ACL, TABLE_ACL_BASE, False)
    cand = ("-- entrega_termos: isolamento por empresa (REST/RPC). Candidata .review: NÃO está em supabase/migrations.\n"
            "-- Projeto canônico obrigatório: swzpzcwiasxmjutrmvkm.\n" + pre +
            run(HELPER) +
            "REVOKE ALL ON FUNCTION platform_private.entrega_termo_tenant_ok(uuid) FROM PUBLIC, anon, authenticated, service_role;\n" +
            "GRANT EXECUTE ON FUNCTION platform_private.entrega_termo_tenant_ok(uuid) TO authenticated;\n" +
            run(gerar) + run(assinar) + run(cancelar) +
            "".join(f"REVOKE EXECUTE ON FUNCTION {s} FROM PUBLIC, anon, authenticated;\n" for s in SERVICE_ONLY) +
            "REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.entrega_termos FROM authenticated;\n"
            f"CREATE POLICY entrega_termos_tenant_isolation ON public.entrega_termos AS RESTRICTIVE FOR ALL TO authenticated\n"
            f"  USING ({POLICY_EXPR})\n  WITH CHECK ({POLICY_EXPR});\n")
    post = None
    if post_md5:
        post = state_checks("POSTFLIGHT", {**live_md5, **post_md5}, POST_ACL, TABLE_ACL_POST, True)
        cand += post
    rb_pre = state_checks("ROLLBACK-PRE", {**live_md5, **(post_md5 or {})}, POST_ACL, TABLE_ACL_POST, True) if post_md5 else ""
    rb = ("-- ROLLBACK: restaura definições/ACL baseline EXATAS. ATENÇÃO: reabre a exposição entre empresas.\n" + rb_pre +
          "DROP POLICY entrega_termos_tenant_isolation ON public.entrega_termos;\n" +
          run(B["rpc_entrega_gerar_termo_v1"]) + run(B["rpc_entrega_assinar_termo_v1"]) + run(B["rpc_entrega_cancelar_termo_v1"]) +
          "DROP FUNCTION platform_private.entrega_termo_tenant_ok(uuid);\n" +
          "-- Não regrava EXECUTE do registrar nem TRUNCATE (contenção aplicada em produção antes desta candidata).\n" +
          "".join(f"GRANT EXECUTE ON FUNCTION {s} TO authenticated;\n" for s in REOPENABLE) +
          "GRANT REFERENCES, TRIGGER, MAINTAIN ON TABLE public.entrega_termos TO authenticated;\n" +
          state_checks("ROLLBACK-POST", live_md5, PRE_ACL, TABLE_ACL_BASE, False))
    return pre, cand, post, rb

if __name__ == "__main__":
    post = json.loads((H / "post-hashes.json").read_text()) if (H / "post-hashes.json").exists() else None
    pre, cand, postsql, rb = build(post_md5=post)
    (H / "preflight-readonly.sql").write_text(pre)
    (H / "candidate.sql.review").write_text(cand)
    if postsql: (H / "postflight-readonly.sql").write_text(postsql)
    (H / "rollback.sql.review").write_text(rb)
    (H / "candidate-functions").mkdir(exist_ok=True)
    for n, t in [("rpc_entrega_gerar_termo_v1", gerar), ("rpc_entrega_assinar_termo_v1", assinar),
                 ("rpc_entrega_cancelar_termo_v1", cancelar), ("entrega_termo_tenant_ok", HELPER)]:
        (H / "candidate-functions" / f"{n}.sql").write_text(t + "\n")
    print("assembled", "with postflight" if post else "(sem post-hashes: rode test-local.py)")
