#!/usr/bin/env python3
"""PG17 regression for the PRE40/INSTALL41/POST42 function-ACL overlay.

Disposable only. Reproduces the real service_role EXECUTE grant on
platform_private.b2b_internal_order_snapshot_guard() (origin migration
20261008192025), proves the frozen PRE40 rejects it, the overlay accepts only
that exact set, and runs the remaining frozen 50-62 and rollbacks in one
composition so later dependencies are checked together.

argv: FROZEN OWNER_FK_PKG ACL30_PKG OVERLAY OUT
"""
import hashlib
import importlib.util
import json
import os
import sys
import traceback
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
FROZEN, FKPKG, ACL30, OVERLAY, OUT = (Path(x).resolve() for x in sys.argv[1:6])
PRE40 = "40-logistics-pre-after-physical.sql.readonly"
INSTALL41 = "41-logistics-install.sql.review"
POST42 = "42-logistics-post.sql.readonly"
SIG = "platform_private.b2b_internal_order_snapshot_guard()"
REAL_ACL = "{postgres=X/postgres,service_role=X/postgres}"
TARGETS = (
    ("product_packagings", "product_packagings_owner_organization_id_fkey"),
    ("product_sale_units", "product_sale_units_owner_organization_id_fkey"),
)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    assert ROOT.is_relative_to(Path("/tmp")), "TEMP_MIRROR_REQUIRED"
    assert all(p.is_relative_to(Path("/tmp")) for p in (FROZEN, FKPKG, ACL30, OVERLAY, OUT))
    checks, raw, final_artifacts, supporting = [], [], [], []
    report = {
        "status": "FAIL",
        "kind": "DISPOSABLE_LOGISTICS_FUNCTION_ACL_OVERLAY_NOT_HOSTED",
        "hosted": False,
        "verification_runner_sha256": sha(Path(__file__).resolve()),
        "checks": checks, "raw": raw,
        "final_artifacts": final_artifacts, "supporting_artifacts": supporting,
        "authenticated_real_proof": "NOT_RUN",
    }

    def ok(name, detail=None):
        row = {"name": name, "status": "PASS"}
        if detail is not None:
            row["detail"] = detail
        checks.append(row)
        print("PASS", name, flush=True)

    def execute(path, dest):
        c = B.run_raw(path.read_text())
        row = {"file": path.name, "package": path.parent.name, "sha256": sha(path), "returncode": c.returncode}
        dest.append(row)
        if c.returncode != 0:
            row["stderr_tail"] = c.stderr[-6000:]
            raise AssertionError(f"ARTIFACT_FAILED:{path.parent.name}/{path.name}\n{c.stderr[-6000:]}")

    def expect_error(name, sql, message):
        c = B.run_raw(sql)
        raw.append({"case": name, "returncode": c.returncode, "stderr_tail": c.stderr[-3000:]})
        assert c.returncode != 0 and message in c.stderr, (name, c.stderr[-3000:])
        ok(name)

    def acl():
        return B.last(f"SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid=to_regprocedure('{SIG}');")

    try:
        physical = ROOT / "scripts/b2b-downstream-audit-20261107/physical/finished-product"
        B = load("logacl_finished", physical / "test_after.py").B
        sys.modules[B.C.__name__] = B.C
        pg17 = next(Path("/nix/store").glob("*-postgresql-17.11/bin"))
        os.environ["PATH"] = str(pg17) + ":" + os.environ["PATH"]
        restored = B.restore.restore()
        assert not any(restored.values()), restored
        B.C.prepare_checkpoint(OUT.parent / "logacl-checkpoint.sql")
        B.current_catalog.apply(B.run_raw, B.last, B.ok, B.T.A)
        commercial = load("logacl_commercial", H / "commercial.py")
        work = OUT.parent / "commercial-work"
        work.mkdir(parents=True, exist_ok=True)
        commercial.apply(B, load, ROOT, work)
        plan_dir = ROOT / "scripts/commercial-plans-tenant-20261108"
        plan_ref = "SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';"
        for n in ("01-pre.sql.readonly", "02-install.sql.review", "03-post.sql.readonly"):
            B.sql(plan_ref + (plan_dir / n).read_text())
        ok("baseline POSPLANOS descartável restaurada sem destino hospedado")

        for n in ("00-production-pre-posplans.sql.readonly", "11-confirmation-install.sql.review",
                  "12-confirmation-post.sql.readonly", "20-send-pre.sql.readonly",
                  "21-send-install.sql.review", "22-send-post.sql.readonly"):
            execute(FROZEN / n, supporting)
        ok("pré-requisitos locais 00/11/12/20/21/22 (produção: já instalados; não reinstalar)")

        # Reconciliação de catálogo idêntica à do runner d8dd aprovado (somente descartável).
        capture = json.loads((H / "reconciliation-posplans-20261108/live-catalog-owner-fk-20261109.capture.json").read_text())
        shape = next(r for r in capture["columns"] if r["relation"] == "product_sale_units" and r["name"] == "forma_fisica")
        B.sql("ALTER TABLE ONLY public.product_packagings ALTER COLUMN peso_liquido_kg TYPE numeric(12,3) USING peso_liquido_kg::numeric(12,3);")
        B.sql(f"""ALTER TABLE ONLY public.product_sale_units DROP COLUMN forma_fisica,
          ADD COLUMN forma_fisica text GENERATED ALWAYS AS ({shape['default']}) STORED;""")
        assert B.last("""SELECT attgenerated||'|'||attidentity FROM pg_attribute
          WHERE attrelid='public.product_sale_units'::regclass AND attname='forma_fisica';""") == "s|"
        B.sql("""SET session_replication_role=replica;
          UPDATE public.catalogo_volumes SET preco_brl=0
          WHERE medida='embalagem' AND volume_ml IS NULL AND item_tipo='produto'
            AND preco_brl<>0 AND rotulo IS NOT NULL AND btrim(rotulo)<>'';
          SET session_replication_role=origin;""")
        measure = next(r for r in capture["constraints"] if r["relation"] == "catalogo_volumes" and r["name"] == "catalogo_volumes_medida_shape")
        B.sql(f"ALTER TABLE ONLY public.catalogo_volumes ADD CONSTRAINT catalogo_volumes_medida_shape {measure['definition']};")
        for table, name in TARGETS:
            B.sql(f"ALTER TABLE ONLY public.{table} DROP CONSTRAINT {name};")
        for n in ("25-owner-fk-pre.sql.readonly", "26-owner-fk-install.sql.review", "27-owner-fk-post.sql.readonly"):
            execute(FKPKG / n, supporting)
        B.sql("""REVOKE ALL ON public.estoque_movimentacoes FROM anon,authenticated,service_role;
          GRANT ALL ON public.estoque_movimentacoes TO service_role;
          GRANT SELECT ON public.estoque_movimentacoes TO authenticated;""")
        execute(ACL30 / "30-physical-pre-after-confirmation-send.sql.readonly", supporting)
        execute(ACL30 / "31-physical-install.sql.review", supporting)
        execute(FROZEN / "32-physical-post.sql.readonly", supporting)
        ok("estado local equivalente ao relatado: 11/21/26/31 instalados, POST12/22/27/32 PASS (produção: não reinstalar)")

        current_scope = load("logacl_current_scope", H / "current_scope.py")

        def relation_security():
            return {n: json.loads(B.last(f"""SELECT jsonb_build_object(
              'acl',coalesce((SELECT string_agg(a::text,',' ORDER BY a::text COLLATE "C") FROM unnest(c.relacl) a),''),
              'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner))
              FROM pg_class c WHERE c.oid='{n}'::regclass;""")) for n in current_scope.SECURITY_RELATIONS}

        relations_before = relation_security()
        history_q = """SELECT jsonb_build_object('deliveries',(SELECT count(*) FROM public.entregas),
          'movements',(SELECT count(*) FROM public.estoque_movimentacoes),'os',(SELECT count(*) FROM public.ordens_servico),
          'partner_orders',(SELECT count(*) FROM public.partner_orders),
          'receivables',(SELECT count(*) FROM public.accounts_receivable));"""
        history_before = json.loads(B.last(history_q))
        plans_q = "SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) FROM public.commercial_payment_plans p;"
        plans_before = B.last(plans_q)

        # Fixture antiga não reproduzia o GRANT da migration de origem.
        fixture_acl_before = acl()
        report["fixture_acl_before"] = fixture_acl_before
        assert fixture_acl_before == "{postgres=X/postgres}", fixture_acl_before
        assert B.last(f"SELECT md5(pg_get_functiondef(to_regprocedure('{SIG}')));") == "9cad2aaa995277b913f8b40816fea504"

        def reset_real():
            B.sql(f"REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC,anon,authenticated,service_role;"
                  f"GRANT EXECUTE ON FUNCTION {SIG} TO service_role;")
            assert acl() == REAL_ACL, acl()

        reset_real()
        report["fixture_acl_reconciled"] = {"after": REAL_ACL, "origin": "supabase/migrations/20261008192025 GRANT EXECUTE ... TO service_role"}
        expect_error("REPRODUZIDO: PRE40 congelado rejeita a ACL real com service_role",
                     (FROZEN / PRE40).read_text(), f"B2B_RESALE_PRE_ACL_DRIFT {SIG}")

        gen = load("logacl_generator", H / "logistics_acl_overlay.py")
        guard = gen.guard_sql("B2B_RESALE_PRE_ACL_DRIFT", REAL_ACL)
        msg = f"B2B_RESALE_PRE_ACL_DRIFT {SIG}"
        B.sql(guard)
        ok("guard do overlay aceita exatamente a ACL real")
        cases = {
            "service_role ausente": f"REVOKE EXECUTE ON FUNCTION {SIG} FROM service_role;",
            "authenticated extra": f"GRANT EXECUTE ON FUNCTION {SIG} TO authenticated;",
            "anon extra": f"GRANT EXECUTE ON FUNCTION {SIG} TO anon;",
            "PUBLIC extra": f"GRANT EXECUTE ON FUNCTION {SIG} TO PUBLIC;",
            "grant option service_role": f"GRANT EXECUTE ON FUNCTION {SIG} TO service_role WITH GRANT OPTION;",
            "role cliente nova": f"DO $x$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='logacl_client') THEN CREATE ROLE logacl_client NOLOGIN; END IF; END$x$;GRANT EXECUTE ON FUNCTION {SIG} TO logacl_client;",
        }
        for label, statement in cases.items():
            reset_real()
            B.sql(statement)
            expect_error(f"negado: {label}", guard, msg)
        # Grantor diferente: mesmo grantee/privilégio, outro concedente.
        reset_real()
        B.sql(f"""DO $x$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='logacl_grantor') THEN CREATE ROLE logacl_grantor NOLOGIN; END IF; END$x$;
          GRANT USAGE ON SCHEMA platform_private TO logacl_grantor;
          REVOKE EXECUTE ON FUNCTION {SIG} FROM service_role;
          GRANT EXECUTE ON FUNCTION {SIG} TO logacl_grantor WITH GRANT OPTION;
          SET ROLE logacl_grantor; GRANT EXECUTE ON FUNCTION {SIG} TO service_role; RESET ROLE;
          REVOKE EXECUTE ON FUNCTION {SIG} FROM logacl_grantor CASCADE;
          GRANT EXECUTE ON FUNCTION {SIG} TO logacl_grantor WITH GRANT OPTION;
          SET ROLE logacl_grantor; GRANT EXECUTE ON FUNCTION {SIG} TO service_role; RESET ROLE;""")
        assert "service_role=X/logacl_grantor" in acl(), acl()
        expect_error("negado: grantor diferente", guard, msg)
        reset_real()
        B.sql(f"REVOKE ALL ON FUNCTION {SIG} FROM logacl_grantor CASCADE;REVOKE USAGE ON SCHEMA platform_private FROM logacl_grantor;")
        reset_real()
        # Ordem diferente do mesmo conjunto: postgres concedido por último.
        B.sql(f"REVOKE ALL ON FUNCTION {SIG} FROM postgres;GRANT EXECUTE ON FUNCTION {SIG} TO postgres;")
        report["reordered_acl"] = acl()
        B.sql(guard)
        ok("mesmo conjunto em outra ordem textual aceito", report["reordered_acl"])
        reset_real()

        execute(OVERLAY / PRE40, final_artifacts)
        execute(OVERLAY / INSTALL41, final_artifacts)
        assert acl() == REAL_ACL, "INSTALL41_CHANGED_GUARD_ACL"
        execute(OVERLAY / POST42, final_artifacts)
        ok("PRE40/INSTALL41/POST42 do overlay passaram; CREATE OR REPLACE preservou a ACL real")
        expect_error("POST42 congelado rejeitaria a ACL real (confirma necessidade do overlay)",
                     (FROZEN / POST42).read_text(), f"B2B_RESALE_POST_ACL_DRIFT {SIG}")
        expect_error("reexecução de INSTALL41 falha fechado", (OVERLAY / INSTALL41).read_text(), "B2B_RESALE_PRE_")
        assert B.last("SELECT enabled FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton;") == "f"

        for n in ("50-endpoint-reader-pre.sql.readonly", "51-endpoint-reader-install.sql.review",
                  "52-endpoint-reader-post.sql.readonly", "60-pilot-containment-pre.sql.readonly",
                  "61-pilot-containment-install.sql.review", "62-pilot-containment-post.sql.readonly"):
            execute(FROZEN / n, supporting)
        ok("etapas congeladas 50-62 passam juntas sobre o overlay 40-42 (sem falha serial local)")

        negatives = {}
        for label, call in {
            "send": "public.rpc_entrega_enviar_manual_v1(NULL,NULL,NULL)",
            "confirmation": "public.rpc_entrega_confirmar_manual_v1(NULL,NULL,NULL,NULL)",
            "os_writer": "public.rpc_b2b_resale_os_create_v1(NULL,NULL,NULL,NULL)",
            "os_reader": "public.rpc_b2b_resale_os_availability_v1(NULL)",
            "purchase_writer": "public.rpc_finished_product_purchase_entry_v1(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)",
            "snapshot_guard": f"{SIG.replace('()', '')}()",
        }.items():
            c = B.run_raw(f"RESET ROLE;SET ROLE authenticated;SELECT {call};")
            assert c.returncode != 0 and "permission denied" in c.stderr, (label, c.stderr[-1500:])
            negatives[label] = "permission denied"
        ok("cliente authenticated negado em writers, leitor e guard", negatives)

        for n in ("89-pilot-containment-rollback-deny.sql.review", "90-endpoint-reader-rollback-deny.sql.review",
                  "94-logistics-rollback-deny.sql.review", "93-physical-rollback-deny.sql.review",
                  "92-send-rollback-deny.sql.review", "91-confirmation-rollback-deny.sql.review"):
            execute(FROZEN / n, supporting)
        assert acl() == REAL_ACL, "ROLLBACK_CHANGED_GUARD_ACL"
        ok("rollbacks deny-only 89/90/94/93/92/91 passaram e preservaram a permissão service_role real")

        closed = json.loads(B.last("""SELECT jsonb_build_object(
          'logistics_gate',(SELECT enabled FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton),
          'physical_gate',(SELECT enabled FROM platform_private.finished_product_gate_v1 WHERE singleton),
          'os_writer',has_function_privilege('authenticated','public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)','EXECUTE'),
          'purchase_writer',has_function_privilege('authenticated','public.rpc_finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date)','EXECUTE'),
          'send_writer',has_function_privilege('authenticated','public.rpc_entrega_enviar_manual_v1(uuid,timestamptz,text)','EXECUTE'),
          'confirm_writer',has_function_privilege('authenticated','public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb)','EXECUTE'));"""))
        assert all(v is False for v in closed.values()), closed
        assert relation_security() == relations_before, "RELATION_SECURITY_DRIFT"
        history_after = json.loads(B.last(history_q))
        assert history_after == history_before and B.last(plans_q) == plans_before
        ok("gates/writers fechados, segurança de relações, histórico e planos preservados")

        report.update({
            "status": "PASS",
            "postgresql_version": B.last("SHOW server_version;"),
            "closed": closed,
            "authenticated_negative": negatives,
            "relation_security_pins": len(relations_before),
            "history_before": history_before, "history_after": history_after,
            "plans_md5": plans_before,
            "gates_activated": False,
            "synthetic_seams": [
                "Auth/claims e papéis SQL somente no PostgreSQL descartável",
                "GRANT EXECUTE service_role no guard reproduz a migration de origem 20261008192025 somente no descartável",
                "reconciliação de catálogo/FK idêntica ao runner d8dd aprovado, somente no descartável",
                "11/21/26/31 executados localmente apenas para compor o estado relatado; produção não os reinstala",
                "roles logacl_client/logacl_grantor existem só no descartável para testes negativos",
            ],
        })
        return 0
    except Exception:
        report["error"] = traceback.format_exc()
        return 1
    finally:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    sys.exit(main())
