#!/usr/bin/env python3
"""Regressão PG17 das FKs owner e dos artefatos finais; descartável apenas."""
import hashlib
import importlib.util
import json
import os
import sys
import traceback
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
FROZEN = Path(sys.argv[1]).resolve()
OVERLAY = Path(sys.argv[2]).resolve()
PACKAGE = Path(sys.argv[3]).resolve()
OUT = Path(sys.argv[4]).resolve()
PRE = "25-owner-fk-pre.sql.readonly"
INSTALL = "26-owner-fk-install.sql.review"
POST = "27-owner-fk-post.sql.readonly"
PRE30 = "30-physical-pre-after-confirmation-send.sql.readonly"
INSTALL31 = "31-physical-install.sql.review"
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
    assert all(path.is_relative_to(Path("/tmp")) for path in (FROZEN, OVERLAY, PACKAGE, OUT))
    checks, raw, final_artifacts, supporting_artifacts = [], [], [], []
    report = {
        "status": "FAIL",
        "kind": "DISPOSABLE_OWNER_FK_INTEGRITY_NOT_HOSTED",
        "hosted": False,
        "checks": checks,
        "raw": raw,
        "final_artifacts": final_artifacts,
        "supporting_artifacts": supporting_artifacts,
        "authenticated_real_proof": "NOT_RUN",
    }

    def ok(name, detail=None):
        row = {"name": name, "status": "PASS"}
        if detail is not None:
            row["detail"] = detail
        checks.append(row)
        print("PASS", name, flush=True)

    def execute(path, destination, expected=0):
        completed = B.run_raw(path.read_text())
        row = {"file": path.name, "sha256": sha(path), "returncode": completed.returncode}
        destination.append(row)
        if completed.returncode != expected:
            row["stdout_tail"] = completed.stdout[-3000:]
            row["stderr_tail"] = completed.stderr[-6000:]
            raise AssertionError(f"ARTIFACT_FAILED:{path.name}\n{completed.stderr[-6000:]}")
        return completed

    def expect_error(name, path_or_sql, message, code=None):
        statement = path_or_sql.read_text() if isinstance(path_or_sql, Path) else path_or_sql
        completed = B.run_raw(statement)
        raw.append({"case": name, "returncode": completed.returncode,
                    "stdout_tail": completed.stdout[-2000:], "stderr_tail": completed.stderr[-4000:]})
        good = completed.returncode != 0 and message in completed.stderr
        if code:
            good = good and f"ERROR:  {code}:" in completed.stderr
        assert good, f"{name}\n{completed.stdout[-1500:]}\n{completed.stderr[-4000:]}"
        ok(name)
        return completed

    try:
        physical = ROOT / "scripts/b2b-downstream-audit-20261107/physical/finished-product"
        B = load("owner_fk_finished", physical / "test_after.py").B
        sys.modules[B.C.__name__] = B.C
        pg17 = next(Path("/nix/store").glob("*-postgresql-17.11/bin"))
        os.environ["PATH"] = str(pg17) + ":" + os.environ["PATH"]
        restored = B.restore.restore()
        assert not any(restored.values()), restored
        B.C.prepare_checkpoint(Path("/tmp/owner-fk-confirmation-checkpoint.sql"))
        B.current_catalog.apply(B.run_raw, B.last, B.ok, B.T.A)
        commercial = load("owner_fk_commercial", H / "commercial.py")
        work = OUT.parent / "commercial-work"
        work.mkdir(parents=True, exist_ok=True)
        commercial.apply(B, load, ROOT, work)
        plan_dir = ROOT / "scripts/commercial-plans-tenant-20261108"
        plan_ref = "SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';"
        B.sql(plan_ref + (plan_dir / "01-pre.sql.readonly").read_text())
        B.sql(plan_ref + (plan_dir / "02-install.sql.review").read_text())
        B.sql(plan_ref + (plan_dir / "03-post.sql.readonly").read_text())
        ok("baseline POSPLANOS descartável restaurada sem destino hospedado")

        for name in (
            "00-production-pre-posplans.sql.readonly",
            "11-confirmation-install.sql.review",
            "12-confirmation-post.sql.readonly",
            "20-send-pre.sql.readonly",
            "21-send-install.sql.review",
            "22-send-post.sql.readonly",
        ):
            execute(FROZEN / name, supporting_artifacts)
        ok("pré-requisitos locais 00/11/12/20/21/22; nenhuma operação hospedada")

        current_scope = load("owner_fk_current_scope", H / "current_scope.py")

        def relation_security():
            actual = {}
            for name in current_scope.SECURITY_RELATIONS:
                actual[name] = json.loads(B.last(f"""SELECT jsonb_build_object(
                  'acl',coalesce((SELECT string_agg(a::text,',' ORDER BY a::text COLLATE "C") FROM unnest(c.relacl) a),''),
                  'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner))
                  FROM pg_class c WHERE c.oid='{name}'::regclass;"""))
            return actual

        relations_before = relation_security()
        history_before = json.loads(B.last("""SELECT jsonb_build_object(
          'deliveries',(SELECT count(*) FROM public.entregas),
          'movements',(SELECT count(*) FROM public.estoque_movimentacoes),
          'os',(SELECT count(*) FROM public.ordens_servico),
          'packagings',(SELECT count(*) FROM public.product_packagings),
          'sale_units',(SELECT count(*) FROM public.product_sale_units));"""))
        plans_before = B.last("SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) FROM public.commercial_payment_plans p;")

        for table, name in TARGETS:
            assert B.last(f"""SELECT count(*) FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
              JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
              AND c.relname='{table}' AND x.conname='{name}';""") == "1"
            B.sql(f"ALTER TABLE ONLY public.{table} DROP CONSTRAINT {name};")
        ok("ambiente descartável reconciliado com as duas FKs ausentes na captura real")
        expect_error("PRE30 reprova a ausência real sem afrouxar o guard", OVERLAY / PRE30,
                     "FINISHED_PRE_CATALOG_CONSTRAINT_DRIFT product_packagings.product_packagings_owner_organization_id_fkey")
        report["pre30_constraint_failure_reproduced"] = True
        execute(PACKAGE / PRE, final_artifacts)
        ok("PRE25 final aceita estrutura reconciliada e zero órfãos")

        orphan_scenarios = []
        for table, name in TARGETS:
            row = json.loads(B.last(f"""SELECT jsonb_build_object('id',id,'owner',owner_organization_id)
              FROM (SELECT {'product_id::text AS id' if table == 'product_sale_units' else 'id::text AS id'},owner_organization_id
              FROM public.{table} ORDER BY 1 LIMIT 1) selected;"""))
            key = "product_id" if table == "product_sale_units" else "id"
            orphan = "00000000-0000-4000-8000-00000000f666"
            assert orphan != row["owner"]
            B.sql(f"UPDATE public.{table} SET owner_organization_id='{orphan}' WHERE {key}='{row['id']}';")
            try:
                expect_error(f"PRE25 nega órfão em {table}", PACKAGE / PRE,
                             f"OWNER_FK_ORPHANS_PRESENT public.{table} count=1", "23503")
                expect_error(f"INSTALL26 aborta sem criar FKs com órfão em {table}", PACKAGE / INSTALL,
                             f"OWNER_FK_ORPHANS_PRESENT public.{table} count=1", "23503")
                for other_table, other_name in TARGETS:
                    assert B.last(f"""SELECT count(*) FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
                      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
                      AND c.relname='{other_table}' AND x.conname='{other_name}';""") == "0"
                orphan_scenarios.append(table)
            finally:
                B.sql(f"UPDATE public.{table} SET owner_organization_id='{row['owner']}' WHERE {key}='{row['id']}';")
        report["orphan_scenarios"] = orphan_scenarios
        ok("ambos os cenários de órfãos foram negados sem limpeza ou instalação parcial")

        execute(PACKAGE / INSTALL, final_artifacts)
        execute(PACKAGE / POST, final_artifacts)
        definitions = json.loads(B.last("""SELECT coalesce(jsonb_agg(jsonb_build_object(
          'name',x.conname,'definition',pg_get_constraintdef(x.oid),'validated',x.convalidated) ORDER BY x.conname),'[]'::jsonb)
          FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND x.conname IN
          ('product_packagings_owner_organization_id_fkey','product_sale_units_owner_organization_id_fkey');"""))
        assert definitions == [
            {"name": "product_packagings_owner_organization_id_fkey", "definition": "FOREIGN KEY (owner_organization_id) REFERENCES organizations(id)", "validated": True},
            {"name": "product_sale_units_owner_organization_id_fkey", "definition": "FOREIGN KEY (owner_organization_id) REFERENCES organizations(id)", "validated": True},
        ], definitions
        report["both_fks_validated"] = True
        ok("INSTALL26 e POST27 finais criaram somente as duas FKs exatas e validadas")

        for table, name in TARGETS:
            row = json.loads(B.last(f"""SELECT jsonb_build_object('id',id) FROM
              (SELECT {'product_id::text AS id' if table == 'product_sale_units' else 'id::text AS id'}
              FROM public.{table} ORDER BY 1 LIMIT 1) selected;"""))
            key = "product_id" if table == "product_sale_units" else "id"
            expect_error(f"FK instalada impede owner inexistente em {table}",
                         f"UPDATE public.{table} SET owner_organization_id='00000000-0000-4000-8000-00000000f666' WHERE {key}='{row['id']}';",
                         name, "23503")
        report["both_fks_enforced"] = True
        expect_error("reexecução de INSTALL26 falha fechado sem duplicar objetos", PACKAGE / INSTALL,
                     "OWNER_FK_PRE_ALREADY_INSTALLED product_packagings.product_packagings_owner_organization_id_fkey")

        # Mesma ACL real relatada, em ordem diversa: o overlay ACL já corrigido deve aceitar.
        B.sql("""REVOKE ALL ON public.estoque_movimentacoes FROM anon,authenticated,service_role;
          GRANT ALL ON public.estoque_movimentacoes TO service_role;
          GRANT SELECT ON public.estoque_movimentacoes TO authenticated;""")
        execute(OVERLAY / PRE30, final_artifacts)
        execute(OVERLAY / INSTALL31, final_artifacts)
        execute(FROZEN / "32-physical-post.sql.readonly", supporting_artifacts)
        execute(FROZEN / "93-physical-rollback-deny.sql.review", supporting_artifacts)
        ok("PRE30/INSTALL31 finais, POST32 e rollback93 passaram após a correção de integridade")
        execute(PACKAGE / POST, supporting_artifacts)
        ok("rollback deny-only preserva as duas FKs e POST27 continua PASS")

        denied_writer = B.run_raw("RESET ROLE;SET ROLE authenticated;SELECT public.rpc_finished_product_purchase_entry_v1(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);")
        assert denied_writer.returncode != 0 and "permission denied" in denied_writer.stderr
        assert B.last("SELECT enabled FROM platform_private.finished_product_gate_v1 WHERE singleton;") == "f"
        ok("writer de compra e gate permanecem fechados após rollback")

        relations_after = relation_security()
        history_after = json.loads(B.last("""SELECT jsonb_build_object(
          'deliveries',(SELECT count(*) FROM public.entregas),
          'movements',(SELECT count(*) FROM public.estoque_movimentacoes),
          'os',(SELECT count(*) FROM public.ordens_servico),
          'packagings',(SELECT count(*) FROM public.product_packagings),
          'sale_units',(SELECT count(*) FROM public.product_sale_units));"""))
        plans_after = B.last("SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) FROM public.commercial_payment_plans p;")
        assert relations_after == relations_before, "RELATION_SECURITY_DRIFT"
        assert history_after == history_before and plans_after == plans_before
        assert sha(OVERLAY / PRE30) == "bfc9718efe58008d6d6891d7e3464f5e032cd3d9628416daf5e0ef46828d0e48"
        assert sha(OVERLAY / INSTALL31) == "3af1e8dd9fb80c1d1c37679ca926cdf64758f94755f260fcf9b2b5165b15aebb"
        report.update({
            "status": "PASS",
            "postgresql_version": B.last("SHOW server_version;"),
            "acl_overlay_unmodified": True,
            "relation_security_pins": len(relations_before),
            "relation_security_preserved": True,
            "history_before": history_before,
            "history_after": history_after,
            "plans_before_md5": plans_before,
            "plans_after_md5": plans_after,
            "data_cleanup": False,
            "grants_or_revokes_in_candidate": False,
            "gates_activated": False,
            "live_orphan_counts": "NOT_RUN; PRE25 final exige zero na execução real",
            "synthetic_seams": [
                "Auth/claims e papéis SQL somente no PostgreSQL descartável",
                "duas FKs removidas somente no descartável para reproduzir a captura real",
                "órfãos temporários restaurados sem qualquer efeito hospedado",
                "artefatos 00/11/12/20/21/22/32/93 executados apenas como composição local",
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
