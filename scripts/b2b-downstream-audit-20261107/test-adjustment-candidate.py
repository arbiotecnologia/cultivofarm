#!/usr/bin/env python3
"""Valida o ajuste em PostgreSQL descartável, sem rede/hosted.

Todos os 38 gatilhos reais ficam ativos nas chamadas. Wrappers, núcleos privados,
readiness, escopo, feature e gatilhos de Auth/SaaS usam os corpos capturados, com
owner/ACL reproduzidos. O esquema e os dados são sintéticos: não provam JWT/RLS nem
elegibilidade de qualquer administrador vendedor hospedado. O positivo interno comum
usa exclusivamente organizations.partner_account_id com o owner comercial coerente;
partner_users único não é tratado como elevação de admin/financeiro/comercial.
A fixture legada pausa gatilhos somente na preparação e os religa antes das RPCs.
"""
import hashlib
import importlib.util
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import threading
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
B3_DIR = ROOT / "scripts/b2b-payment-condition-v1-rebase-20261106"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


B = load("b3h_candidate", B3_DIR / "test-local-pg.py")
G = load("adjustment_generator", HERE / "generate-adjustment-fix.py")
SP = B.SP
SP.PORT = "55472"
EVIDENCE = HERE / "review-31430566/scope-live-1638/adjustment-candidate.json"
UFIN, UGC = B.UFIN, B.UGC
UCUMUL = "20000000-0000-0000-0000-000000000031"

LOAD_ORDER = [
    "platform_private.platform_actor_access_ready(uuid)",
    "platform_private.entitlements_for_user(uuid)",
    "platform_private.has_role(uuid,public.app_role)",
    "public.has_role(uuid,public.app_role)",
    "public.is_platform_superadmin(uuid)",
    "public.is_valid_b2b_partner_user(uuid,uuid)",
    "platform_private.b2b_actor_scope(uuid)",
    "platform_private.b2b_phase1_partner_visible(uuid,boolean)",
    "public.b2b_phase1_partner_visible(uuid,boolean)",
    "platform_private.b2b_phase1_order_visible(uuid)",
    "public.b2b_phase1_order_visible(uuid)",
    "public._saas_user_has_feature(uuid,text)",
    "public._saas_trg_require_feature()",
    "platform_private.c2_accounting_pending_guard()",
]

MODULE = "20000000-0000-0000-0000-000000000001"
FEATURE_ORDER = "20000000-0000-0000-0000-000000000002"
FEATURE_CATALOG = "20000000-0000-0000-0000-000000000003"
PLAN = "20000000-0000-0000-0000-000000000010"
PLAN_VERSION = "20000000-0000-0000-0000-000000000011"
SUB_A = "20000000-0000-0000-0000-000000000020"
SUB_F = "20000000-0000-0000-0000-000000000021"
MISSING_ORDER = "20000000-0000-0000-0000-000000000099"

REAL_AUTH_SCHEMA = f"""
ALTER TABLE public.profiles
  ADD COLUMN senha_provisoria boolean NOT NULL DEFAULT false,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.partner_users
  ADD COLUMN valid_from timestamptz DEFAULT now(),
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN tenant_id uuid;
CREATE TABLE public.platform_org_admin_invites(
  user_id uuid,
  access_operation_status text,
  access_valid_after timestamptz
);
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'sub', NULLIF(current_setting('request.jwt.claim.sub',true),''),
    'iat', NULLIF(current_setting('request.jwt.claim.iat',true),'')
  )
$$;
-- A guarda externa REAL exige que nenhuma organização aponte para o parceiro na criação.
-- O vínculo organização-parceiro do controle legado é aplicado só depois das fixtures externas.
UPDATE public.organizations SET partner_account_id=NULL WHERE id IN ('{SP.A}','{SP.F}');
INSERT INTO public.user_roles VALUES ('{SP.USUP}','superadmin');
UPDATE public.partner_users pu SET tenant_id=pa.commercial_owner_organization_id,
  valid_from=now()-interval '1 day', revoked_at=NULL
  FROM public.partner_accounts pa WHERE pa.id=pu.partner_id;
-- Atores internos comuns: nenhum é superadmin nem recebe papel externo para forçar escopo.
INSERT INTO public.profiles(user_id,organization_id,ativo,senha_provisoria,created_at) VALUES
  ('{UFIN}','{SP.A}',true,false,now()),
  ('{UGC}','{SP.A}',true,false,now()),
  ('{UCUMUL}','{SP.A}',true,false,now());
INSERT INTO public.user_roles VALUES
  ('{UFIN}','financeiro'), ('{UGC}','gestor_comercial'),
  ('{UCUMUL}','administrador'), ('{UCUMUL}','parceiro_b2b');
-- Controle negativo: partner_users único não transforma o cumulativo em vendedor interno,
-- pois is_valid_b2b_partner_user rejeita papel administrativo na composição capturada.
INSERT INTO public.partner_users(user_id,partner_id,tenant_id,valid_from,revoked_at) VALUES
  ('{UCUMUL}','{SP.P}','{SP.A}',now()-interval '1 day',NULL);

CREATE TYPE public.saas_subscription_status AS ENUM ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED');
CREATE TABLE public.saas_modules(id uuid PRIMARY KEY, key text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE public.saas_features(id uuid PRIMARY KEY, module_id uuid NOT NULL, key text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE public.saas_plan_versions(
  id uuid PRIMARY KEY, plan_id uuid NOT NULL, status text NOT NULL,
  effective_from timestamptz, effective_to timestamptz
);
CREATE TABLE public.saas_plan_version_features(
  plan_version_id uuid NOT NULL, feature_id uuid NOT NULL, enabled boolean NOT NULL,
  limit_value numeric, config jsonb, PRIMARY KEY(plan_version_id,feature_id)
);
CREATE TABLE public.organization_subscriptions(
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, plan_version_id uuid,
  status public.saas_subscription_status NOT NULL, trial_ends_at timestamptz,
  cancel_at timestamptz, started_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.organization_feature_overrides(
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, feature_id uuid NOT NULL,
  mode text NOT NULL, limit_value numeric, starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz, ended_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.saas_modules VALUES ('{MODULE}','comercial',true);
INSERT INTO public.saas_features VALUES
  ('{FEATURE_ORDER}','{MODULE}','pedidos_b2b',true),
  ('{FEATURE_CATALOG}','{MODULE}','catalogo_precos',true);
INSERT INTO public.saas_plan_versions VALUES
  ('{PLAN_VERSION}','{PLAN}','PUBLISHED',now()-interval '1 day',NULL);
INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled,config) VALUES
  ('{PLAN_VERSION}','{FEATURE_ORDER}',true,'{{}}'),
  ('{PLAN_VERSION}','{FEATURE_CATALOG}',true,'{{}}');
INSERT INTO public.organization_subscriptions(id,organization_id,plan_version_id,status) VALUES
  ('{SUB_A}','{SP.A}','{PLAN_VERSION}','ACTIVE'),
  ('{SUB_F}','{SP.F}','{PLAN_VERSION}','ACTIVE');
"""


def main():
    checks = []

    def check(name, ok, detail=None):
        row = {"name": name, "ok": bool(ok)}
        if detail is not None:
            row["detail"] = str(detail)[:1800]
        checks.append(row)

    tmp = B.boot()
    work = pathlib.Path(tempfile.mkdtemp(prefix="b2b-adjustment-review-", dir="/tmp"))
    work.chmod(0o777)
    try:
        psql = SP.psql
        generated = G.build()
        pins = json.loads(generated["adjustment-pins.json"])
        check(
            "gerador determinístico: capturas/candidato/01–04/pins byte a byte",
            all((HERE / name).read_text() == text for name, text in generated.items()),
        )
        review_files = [generated[n] for n in ("01-pre.sql.readonly", "02-install.sql.review", "03-post.sql.readonly", "04-rollback-deny.sql.review")]
        check("nenhum artefato executa GRANT ou substitui pin temporário", pins["temporary_pin_substitution"] is False and all("GRANT " not in text for text in review_files))
        check(
            "todos os pinos públicos/privados estão no PRE/POST/install/rollback",
            all(meta["md5"] in text and meta["owner"] in text and meta["acl_md5"] in text for text in review_files for meta in pins["dependencies"].values()),
        )

        def runfile(path):
            return subprocess.run(
                SP.su() + ["psql", "-X", "-q", "-t", "-A", "-h", SP.SOCK[0], "-p", SP.PORT, "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-f", str(path)],
                capture_output=True,
                text=True,
            )

        def apply_captured_acl(reg, acl):
            psql(f"REVOKE ALL ON FUNCTION {reg} FROM PUBLIC, anon, authenticated, service_role;")
            for entry in G.acl_entries(acl):
                if entry["grantee"] == "postgres":
                    continue
                target = "PUBLIC" if entry["grantee"] == "PUBLIC" else entry["grantee"]
                psql(f"GRANT EXECUTE ON FUNCTION {reg} TO {target};")

        psql(REAL_AUTH_SCHEMA)
        for reg in LOAD_ORDER:
            meta = pins["dependencies"][reg]
            # Os stubs têm parâmetros com nomes diferentes; trigger functions permanecem no lugar.
            if reg not in ("public._saas_trg_require_feature()", "platform_private.c2_accounting_pending_guard()"):
                psql(f"DROP FUNCTION IF EXISTS {reg};")
            psql(generated[meta["capture"]].rstrip() + ";\n")
            apply_captured_acl(reg, meta["acl"])
        actual_dependencies = {}
        for reg, meta in pins["dependencies"].items():
            actual = psql(f"SELECT md5(pg_get_functiondef('{reg}'::regprocedure))").stdout.strip()
            actual_dependencies[reg] = actual
            check(f"corpo real capturado executado: {reg}", actual == meta["md5"], {"actual": actual, "expected": meta["md5"]})

        request_capture = generated["captured/public.request_b2b_payment_terms_adjustment_secure.f9bf8f54.local-20261030.sql"]
        psql(request_capture.rstrip() + ";\n")
        apply_captured_acl(G.SIG, pins["request_acl"])

        r = runfile(HERE / "01-pre.sql.readonly")
        check("01 PRE_OK com corpos/owners/ACLs reais, sem localização", r.returncode == 0 and "PRE_OK" in r.stdout, r.stderr)

        bad = work / "bad-install.sql"
        bad.write_text((HERE / "02-install.sql.review").read_text().replace(G.BASE_MD5, "0" * 32, 1))
        bad.chmod(0o644)
        r = runfile(bad)
        check("pin divergente do writer aborta sem trocar a função", r.returncode != 0 and "ADJUSTMENT_FUNCTION_PIN_DRIFT" in r.stderr and psql(f"SELECT md5(pg_get_functiondef('{G.SIG}'::regprocedure))").stdout.strip() == G.BASE_MD5, r.stderr)

        bad_private = work / "bad-private-install.sql"
        bad_private.write_text((HERE / "02-install.sql.review").read_text().replace(G.PRIVATE_VISIBLE_MD5, "0" * 32, 1))
        bad_private.chmod(0o644)
        r = runfile(bad_private)
        check("pin privado divergente aborta antes da troca", r.returncode != 0 and "ADJUSTMENT_DEPENDENCY_PIN_DRIFT" in r.stderr and psql(f"SELECT md5(pg_get_functiondef('{G.SIG}'::regprocedure))").stdout.strip() == G.BASE_MD5, r.stderr)

        private_role = "platform_private.has_role(uuid,public.app_role)"
        psql(f"ALTER FUNCTION {private_role} OWNER TO authenticated;")
        r = runfile(HERE / "01-pre.sql.readonly")
        check("owner divergente de núcleo privado é detectado", r.returncode != 0 and "ADJUSTMENT_OWNER_DRIFT" in r.stderr, r.stderr)
        psql(f"ALTER FUNCTION {private_role} OWNER TO postgres;")
        psql(f"REVOKE EXECUTE ON FUNCTION {private_role} FROM authenticated;")
        r = runfile(HERE / "01-pre.sql.readonly")
        check("ACL divergente de núcleo privado é detectada", r.returncode != 0 and "ADJUSTMENT_ACL_DRIFT" in r.stderr, r.stderr)
        psql(f"GRANT EXECUTE ON FUNCTION {private_role} TO authenticated;")
        r = runfile(HERE / "01-pre.sql.readonly")
        check("owner/ACL restaurados ao estado capturado voltam a passar no PRE", r.returncode == 0, r.stderr)

        r = runfile(HERE / "02-install.sql.review")
        check("02 instala o candidato transacionalmente sem GRANT", r.returncode == 0, r.stderr)
        candidate_md5 = psql(f"SELECT md5(pg_get_functiondef('{G.SIG}'::regprocedure))").stdout.strip()
        expected_candidate_md5 = pins["candidate_md5"]
        check("candidato executado tem o MD5 gerado", candidate_md5 == expected_candidate_md5, {"actual": candidate_md5, "expected": expected_candidate_md5})
        r = runfile(HERE / "03-post.sql.readonly")
        check("03 POST_OK confirma wrappers, privados, owners e ACLs", r.returncode == 0 and "POST_OK" in r.stdout, r.stderr)
        r = runfile(HERE / "02-install.sql.review")
        check("rerun sobre o candidato aborta pelo pin da baseline", r.returncode != 0, r.stderr)

        trigger_defs = (ROOT / "scripts/b2b-solid-packaging-order-20261106/captured/triggers/_triggerdefs.live-20261106.sql").read_text()
        expected = re.findall(r"CREATE (?:CONSTRAINT )?TRIGGER (\w+) .*? ON (public\.\w+)", trigger_defs)

        def triggers_ok():
            rows = psql("SELECT t.tgname||'|'||c.relnamespace::regnamespace::text||'.'||c.relname||'|'||t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal ORDER BY 1").stdout.strip().splitlines()
            actual = {(r.split("|")[0], r.split("|")[1]): r.split("|")[2] for r in rows}
            return len(expected) == 38 and all(actual.get((name, table)) not in (None, "D") for name, table in expected)

        check("TODOS os 38 gatilhos reais habilitados após instalar", triggers_ok())

        def state(order_id):
            queries = {
                "order": f"SELECT to_jsonb(o)::text FROM public.partner_orders o WHERE id='{order_id}'",
                "terms": f"SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text FROM public.partner_order_payment_terms t WHERE partner_order_id='{order_id}'",
                "audit": f"SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb)::text FROM public.partner_order_audit_logs a WHERE order_id='{order_id}'",
                "notifications": "SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY n.id),'[]'::jsonb)::text FROM public.notificacoes_operacionais n",
            }
            return {key: psql(query).stdout.strip() for key, query in queries.items()}

        def request(uid, order_id, note):
            target = "NULL::uuid" if order_id is None else f"'{order_id}'"
            return SP.as_user(uid, f"SELECT public.request_b2b_payment_terms_adjustment_secure({target},'{note}')::text;")

        before = state(MISSING_ORDER)
        r = request(SP.UADM, MISSING_ORDER, "TESTE pedido ausente")
        check("pedido inexistente nega como escopo, sem payment_terms_not_defined permissivo", r.returncode != 0 and "b2b_phase1_scope_denied" in r.stderr and "payment_terms_not_defined" not in r.stderr, r.stderr)
        check("pedido inexistente não produz efeitos nem oráculo de dados", state(MISSING_ORDER) == before)
        r = request(SP.UADM, None, "TESTE pedido nulo")
        check("pedido NULL também é negado fail-closed", r.returncode != 0 and "b2b_phase1_scope_denied" in r.stderr, r.stderr)

        # Pendência contábil: pedido externo REAL e financial/terms já pending.
        psql(f"UPDATE public.commercial_payment_plans SET requires_financial_approval=true WHERE id='{SP.PLD}'")
        pending, pending_error = B.out(B.legacy(SP.UB, SP.PLD, [B.L(1)], "TESTE-AJUSTE-PENDING-CANDIDATE"))
        check("fixture de pendência criada pelo writer canônico com guards reais", pending is not None, pending_error or pending)
        if pending is None:
            raise RuntimeError(f"fixture pendente indisponível: {pending_error}")
        before = state(pending["id"])
        r = request(SP.USUP, pending["id"], "TESTE negado")
        check("C2_ACCOUNTING_PENDING nega pending→pending", r.returncode != 0 and "C2_ACCOUNTING_PENDING" in r.stderr, r.stderr)
        check("negação contábil preserva pedido/termos/auditoria/notificações", state(pending["id"]) == before)

        # Origem externa validada: escopo nega antes do gatilho de origem.
        settings_id = "10000000-0000-0000-0000-000000000003"
        psql(f"""INSERT INTO public.company_fiscal_settings(id,organization_id,is_active,configuration_status,accounting_validated_at,legal_name,cnpj,configuration_version)
                 VALUES ('{settings_id}','{SP.A}',true,'VALIDATED',now(),'EMPRESA FICTICIA TESTE','00000000000000',1);""")
        validated, validated_error = B.out(B.legacy(SP.UB, SP.PLD, [B.L(1)], "TESTE-AJUSTE-VALIDATED-CANDIDATE"))
        check("fixture validada criada pelo writer canônico com guards reais", validated is not None, validated_error or validated)
        if validated is None:
            raise RuntimeError(f"fixture validada indisponível: {validated_error}")
        before = state(validated["id"])
        r = request(SP.UADMF, validated["id"], "TESTE estrangeiro")
        check("admin estrangeiro negado pelo escopo real no pedido validado", r.returncode != 0 and "b2b_phase1_scope_denied" in r.stderr, r.stderr)
        check("negação de escopo validado preserva estado integral", state(validated["id"]) == before)
        r = request(SP.USUP, validated["id"], "TESTE positivo validado")
        check("superadmin cumulativo com papel administrativo solicita ajuste validado sem ampliar escopo", r.returncode == 0 and "adjustment_requested" in r.stdout, r.stderr)

        # Fixture legada sem origem; preparação explícita, todos os gatilhos religados antes das chamadas.
        legacy_id = "10000000-0000-0000-0000-000000000001"
        terms_id = "10000000-0000-0000-0000-000000000002"
        psql(f"""BEGIN;
                 ALTER TABLE public.partner_orders DISABLE TRIGGER USER; ALTER TABLE public.partner_order_payment_terms DISABLE TRIGGER USER;
                 INSERT INTO public.partner_orders(id,partner_id,status,total,created_by,payment_terms_id,requires_financial_approval,financial_approval_status,payment_condition_status)
                 VALUES ('{legacy_id}','{SP.P}','em_analise_comercial',100,'{SP.UB}','{terms_id}',true,'pending','pending');
                 INSERT INTO public.partner_order_payment_terms
                 SELECT (jsonb_populate_record(NULL::public.partner_order_payment_terms,
                       to_jsonb(src)||jsonb_build_object('id','{terms_id}'::uuid,'partner_order_id','{legacy_id}'::uuid,'approval_status','pending'))).*
                 FROM public.partner_order_payment_terms src WHERE src.partner_order_id='{validated['id']}';
                 ALTER TABLE public.partner_orders ENABLE TRIGGER USER; ALTER TABLE public.partner_order_payment_terms ENABLE TRIGGER USER; COMMIT;""")
        psql(f"UPDATE public.organizations SET partner_account_id='{SP.P}' WHERE id='{SP.A}'")
        check("TODOS os gatilhos reais religados antes das chamadas legadas", triggers_ok())
        before = state(legacy_id)
        r = request(SP.UADMF, legacy_id, "TESTE legado estrangeiro")
        check("admin estrangeiro negado no legado sem snapshot pelo escopo real", r.returncode != 0 and "b2b_phase1_scope_denied" in r.stderr, r.stderr)
        check("negação legada preserva estado integral", state(legacy_id) == before)

        def during_lock(label, mutation, token, restore):
            before = state(legacy_id)
            blocker_result = {}
            caller_result = {}

            def blocker():
                blocker_result["r"] = psql(f"BEGIN; SELECT 1 FROM public.partner_orders WHERE id='{legacy_id}' FOR UPDATE; SELECT pg_sleep(1.5); COMMIT;", check=False)

            def caller():
                time.sleep(0.25)
                caller_result["r"] = request(SP.UADM, legacy_id, "TESTE " + label)

            first = threading.Thread(target=blocker)
            second = threading.Thread(target=caller)
            first.start(); second.start()
            time.sleep(0.65)
            psql(mutation)
            first.join(8); second.join(8)
            revoked = caller_result.get("r")
            check(f"revogação durante lock: {label} é negada", revoked is not None and revoked.returncode != 0 and token in revoked.stderr, revoked.stderr if revoked is not None else "sem retorno")
            check(f"revogação durante lock: {label} preserva todo o estado", state(legacy_id) == before)
            psql(restore)

        during_lock(
            "papel administrativo",
            f"DELETE FROM public.user_roles WHERE user_id='{SP.UADM}' AND role='administrador'",
            "unauthorized",
            f"INSERT INTO public.user_roles VALUES ('{SP.UADM}','administrador')",
        )
        during_lock(
            "perfil inativado",
            f"UPDATE public.profiles SET ativo=false WHERE user_id='{SP.UADM}'",
            "b2b_phase1_scope_denied",
            f"UPDATE public.profiles SET ativo=true WHERE user_id='{SP.UADM}'",
        )
        during_lock(
            "vínculo organização-parceiro removido",
            f"UPDATE public.organizations SET partner_account_id=NULL WHERE id='{SP.A}'",
            "b2b_phase1_scope_denied",
            f"UPDATE public.organizations SET partner_account_id='{SP.P}' WHERE id='{SP.A}'",
        )
        during_lock(
            "lease de primeiro acesso reaberto",
            f"INSERT INTO public.platform_org_admin_invites(user_id,access_operation_status,access_valid_after) VALUES ('{SP.UADM}','completed',now()+interval '1 hour')",
            "unauthorized",
            f"DELETE FROM public.platform_org_admin_invites WHERE user_id='{SP.UADM}'",
        )
        during_lock(
            "feature pedidos_b2b revogada",
            f"UPDATE public.saas_plan_version_features SET enabled=false WHERE plan_version_id='{PLAN_VERSION}' AND feature_id='{FEATURE_ORDER}'",
            "saas_feature_not_entitled",
            f"UPDATE public.saas_plan_version_features SET enabled=true WHERE plan_version_id='{PLAN_VERSION}' AND feature_id='{FEATURE_ORDER}'",
        )
        check(
            "feature restaurada pelo resolvedor real de entitlements",
            psql(f"SELECT public._saas_user_has_feature('{SP.UADM}','pedidos_b2b')").stdout.strip() == "t",
        )

        # Controle positivo legado no escopo efetivamente autorizado, sem alterar economia/snapshots.
        r = request(SP.UADM, legacy_id, "TESTE positivo legado")
        check("mesmo tenant ainda solicita ajuste no legado", r.returncode == 0 and "adjustment_requested" in r.stdout, r.stderr)
        r = request(SP.UB, legacy_id, "TESTE comprador")
        check("comprador sem papel financeiro continua negado", r.returncode != 0 and "unauthorized" in r.stderr, r.stderr)

        # Rollback restritivo: pin errado não altera; correto só revoga cliente.
        bad_rb = work / "bad-rollback.sql"
        bad_rb.write_text((HERE / "04-rollback-deny.sql.review").read_text().replace(expected_candidate_md5, "0" * 32, 1))
        bad_rb.chmod(0o644)
        r = runfile(bad_rb)
        check("rollback com pin divergente aborta sem revogar", r.returncode != 0 and psql(f"SELECT has_function_privilege('authenticated','{G.SIG}','EXECUTE')").stdout.strip() == "t", r.stderr)
        r = runfile(HERE / "04-rollback-deny.sql.review")
        check("04 rollback deny-only conclui", r.returncode == 0, r.stderr)
        after_rb = state(legacy_id)
        r = request(SP.UADM, legacy_id, "TESTE apos rollback")
        check("rollback nega EXECUTE ao cliente sem restaurar corpo vulnerável", r.returncode != 0 and "permission denied" in r.stderr and psql(f"SELECT md5(pg_get_functiondef('{G.SIG}'::regprocedure))").stdout.strip() == expected_candidate_md5, r.stderr)
        check("rollback não apaga nem reescreve histórico", state(legacy_id) == after_rb)
        check("TODOS os 38 gatilhos continuam habilitados no fim", triggers_ok())
        check("B3 não foi instalado nem modificado nesta bateria", psql("SELECT to_regclass('platform_private.b2b_condition_versions') IS NULL").stdout.strip() == "t")

        report = {
            "kind": "DISPOSABLE_PG_CANDIDATE_REAL_AUTH_SCOPING_ALL_REAL_TRIGGERS_NOT_HOSTED_PROOF",
            "review": "31430566",
            "status": "INACTIVE_NOT_APPROVED",
            "source": str(G.SOURCE.relative_to(ROOT)),
            "live_source_still_requires_auditor_confirmation": True,
            "auditor_reported_live_md5": {
                "public.b2b_phase1_order_visible(uuid)": G.VISIBLE_MD5,
                "platform_private.b2b_phase1_order_visible(uuid)": G.PRIVATE_VISIBLE_MD5,
                "public.has_role(uuid,public.app_role)": G.ROLE_MD5,
                "platform_private.has_role(uuid,public.app_role)": G.PRIVATE_ROLE_MD5,
            },
            "baseline_md5": G.BASE_MD5,
            "candidate_md5": expected_candidate_md5,
            "supersedes_candidate_md5": "55996e9496ffb123504adaeaa502c81f",
            "historical_minimal_evidence": "evidence/adjustment-candidate-minimal-29.json",
            "dependencies": pins["dependencies"],
            "actual_dependency_md5": actual_dependencies,
            "temporary_pin_substitution": False,
            "real_trigger_count": len(expected),
            "b3_installed_or_modified": False,
            "synthetic_seams": [
                "Auth por GUC local; auth.jwt sintético apenas para transportar sub/iat ao corpo real de readiness",
                "esquema mínimo e fixtures de assinatura/feature; resolvedores e gatilhos SaaS são corpos reais capturados",
                "vínculo organização-parceiro e partner_users montados em schema reduzido; não provam vínculos hospedados",
                "demais dependências de segundo nível B2/B3",
                "fixture legada mínima com gatilhos pausados só na preparação e todos religados antes das RPCs",
                "sem JWT/RLS/PostgREST/Storage e sem leitura/escrita hosted",
            ],
            "passed": sum(c["ok"] for c in checks),
            "total": len(checks),
            "checks": checks,
        }
    finally:
        subprocess.run(SP.su() + ["pg_ctl", "-D", str(tmp / "d"), "-m", "fast", "stop"], capture_output=True)
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"{report['passed']}/{report['total']}")
    for row in checks:
        print(("PASS" if row["ok"] else "FAIL"), row["name"], row.get("detail", ""))
    return 0 if report["passed"] == report["total"] else 1


if __name__ == "__main__":
    sys.exit(main())
