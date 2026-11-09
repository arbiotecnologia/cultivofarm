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
AUDITOR_REPORT = H / "reconciliation-posplans-20261108/live-owner-fk-reconciliation-20261109.auditor-report.json"


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
        "verification_runner_sha256": sha(Path(__file__).resolve()),
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
        B.C.prepare_checkpoint(OUT.parent / "owner-fk-confirmation-checkpoint.sql")
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
        capture = json.loads((H / "reconciliation-posplans-20261108/live-catalog-owner-fk-20261109.capture.json").read_text())
        auditor_report = json.loads(AUDITOR_REPORT.read_text())
        reported_shape = auditor_report["reported_column_shapes"]["product_sale_units.forma_fisica"]
        assert reported_shape["generated"] == "s" and reported_shape["identity"] == ""

        def actual_catalog():
            columns = json.loads(B.last("""SELECT coalesce(jsonb_agg(jsonb_build_object(
              'relation',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
              'default',pg_get_expr(d.adbin,d.adrelid),'notnull',a.attnotnull,
              'generated',a.attgenerated,'identity',a.attidentity) ORDER BY c.relname,a.attname),'[]'::jsonb)
              FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
              LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
              WHERE n.nspname='public' AND c.relname IN ('produtos','catalogo_volumes','product_packagings','product_sale_units')
              AND a.attnum>0 AND NOT a.attisdropped;"""))
            constraints = json.loads(B.last("""SELECT coalesce(jsonb_agg(jsonb_build_object(
              'relation',c.relname,'name',x.conname,'definition',pg_get_constraintdef(x.oid),
              'validated',x.convalidated) ORDER BY c.relname,x.conname),'[]'::jsonb)
              FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relname IN ('produtos','catalogo_volumes','product_packagings','product_sale_units');"""))
            return {"columns": columns, "constraints": constraints}

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

        before_reconcile = actual_catalog()
        weight_before = next(row for row in before_reconcile["columns"]
                             if row["relation"] == "product_packagings" and row["name"] == "peso_liquido_kg")
        assert weight_before["type"] == "numeric", weight_before
        shape_before = next(row for row in before_reconcile["columns"]
                            if row["relation"] == "product_sale_units" and row["name"] == "forma_fisica")
        shape_expected = next(row for row in capture["columns"]
                              if row["relation"] == "product_sale_units" and row["name"] == "forma_fisica")
        assert shape_before["default"] is None and shape_expected["default"], shape_before
        B.sql("ALTER TABLE ONLY public.product_packagings ALTER COLUMN peso_liquido_kg TYPE numeric(12,3) USING peso_liquido_kg::numeric(12,3);")
        B.sql(f"""ALTER TABLE ONLY public.product_sale_units
          DROP COLUMN forma_fisica,
          ADD COLUMN forma_fisica text GENERATED ALWAYS AS ({shape_expected['default']}) STORED;""")
        report["fixture_column_reconciliation"] = [
            {"relation": "product_packagings", "column": "peso_liquido_kg", "before": weight_before["type"], "after": "numeric(12,3)"},
            {"relation": "product_sale_units", "column": "forma_fisica", "before": "regular column without expression", "after": "GENERATED ALWAYS AS captured expression STORED"},
        ]
        measure_constraint = next(row for row in capture["constraints"]
                                  if row["relation"] == "catalogo_volumes" and row["name"] == "catalogo_volumes_medida_shape")
        assert not any(row["relation"] == "catalogo_volumes" and row["name"] == "catalogo_volumes_medida_shape"
                       for row in before_reconcile["constraints"])
        invalid_measure_rows = json.loads(B.last("""SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id',id,'medida',medida,'volume_ml',volume_ml,'item_tipo',item_tipo,'preco_brl',preco_brl,'rotulo',rotulo)
          ORDER BY id),'[]'::jsonb) FROM public.catalogo_volumes
          WHERE ((medida='volume' AND volume_ml IS NOT NULL AND volume_ml>0)
            OR (medida='embalagem' AND volume_ml IS NULL AND item_tipo='produto' AND preco_brl=0
                AND rotulo IS NOT NULL AND btrim(rotulo)<>'')) IS NOT TRUE;"""))
        assert invalid_measure_rows and all(
            row["medida"] == "embalagem" and row["volume_ml"] is None and row["item_tipo"] == "produto"
            and row["rotulo"] and row["preco_brl"] != 0 for row in invalid_measure_rows
        ), invalid_measure_rows
        # Fixture B3 antiga usava 0,01 como sentinel de preço legado. A captura real
        # exige zero na apresentação; catalogo_precos_embalagem permanece intacta.
        B.sql("""SET session_replication_role=replica;
          UPDATE public.catalogo_volumes SET preco_brl=0
          WHERE medida='embalagem' AND volume_ml IS NULL AND item_tipo='produto'
            AND preco_brl<>0 AND rotulo IS NOT NULL AND btrim(rotulo)<>'';
          SET session_replication_role=origin;""")
        assert B.last("""SELECT count(*) FROM public.catalogo_volumes
          WHERE ((medida='volume' AND volume_ml IS NOT NULL AND volume_ml>0)
            OR (medida='embalagem' AND volume_ml IS NULL AND item_tipo='produto' AND preco_brl=0
                AND rotulo IS NOT NULL AND btrim(rotulo)<>'')) IS NOT TRUE;""") == "0"
        report["fixture_row_reconciliation"] = {
            "operation": "UPDATE synthetic legacy packaging price sentinel to zero; no rows deleted; separate packaging prices untouched",
            "before": invalid_measure_rows,
        }
        B.sql(f"ALTER TABLE ONLY public.catalogo_volumes ADD CONSTRAINT catalogo_volumes_medida_shape {measure_constraint['definition']};")
        report["fixture_constraint_reconciliation"] = [measure_constraint]
        for table, name in TARGETS:
            assert B.last(f"""SELECT count(*) FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
              JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
              AND c.relname='{table}' AND x.conname='{name}';""") == "1"
            B.sql(f"ALTER TABLE ONLY public.{table} DROP CONSTRAINT {name};")
        reconciled = actual_catalog()
        actual_columns = {(row["relation"], row["name"]): row for row in reconciled["columns"]}
        expected_columns = {(row["relation"], row["name"]): row for row in capture["columns"]}
        column_drift = [key for key in sorted(expected_columns)
                        if any(actual_columns.get(key, {}).get(field) != expected_columns[key].get(field)
                               for field in ("type", "default", "notnull"))]
        extra_columns = sorted(set(actual_columns) - set(expected_columns))
        assert extra_columns == [("produtos", "oculto")], extra_columns
        assert not column_drift, {"column_drift": column_drift}
        report["capture_scope_extra_columns"] = extra_columns
        actual_constraints = {(row["relation"], row["name"]): row for row in reconciled["constraints"]}
        target_keys = {(table, name) for table, name in TARGETS}
        constraint_drift = []
        for expected in capture["constraints"]:
            key = (expected["relation"], expected["name"])
            actual = actual_constraints.get(key)
            if actual is None or any(actual.get(field) != expected.get(field)
                                     for field in ("definition", "validated")):
                constraint_drift.append({"key": key, "actual": actual, "expected": expected})
        assert not constraint_drift and not target_keys.intersection(actual_constraints), constraint_drift
        ok("ambiente descartável reconciliado com numeric(12,3), coluna gerada, constraint de medida, 57 colunas, 24 constraints e duas FKs ausentes")
        expect_error("PRE30 reprova a ausência real sem afrouxar o guard", OVERLAY / PRE30,
                     "FINISHED_PRE_CATALOG_CONSTRAINT_DRIFT product_packagings.product_packagings_owner_organization_id_fkey")
        report["pre30_constraint_failure_reproduced"] = True
        execute(PACKAGE / PRE, final_artifacts)
        disposable_counts = {}
        for table, _name in TARGETS:
            counts = json.loads(B.last(f"""SELECT jsonb_build_object(
              'total',(SELECT count(*) FROM public.{table}),
              'owner_null',(SELECT count(*) FROM public.{table} WHERE owner_organization_id IS NULL),
              'orphan_owner',(SELECT count(*) FROM public.{table} child
                LEFT JOIN public.organizations parent ON parent.id=child.owner_organization_id
                WHERE child.owner_organization_id IS NOT NULL AND parent.id IS NULL),
              'owner_product_mismatch',(SELECT count(*) FROM public.{table} child
                JOIN public.produtos product ON product.id=child.product_id
                WHERE product.owner_organization_id IS DISTINCT FROM child.owner_organization_id));"""))
            assert counts["owner_null"] == counts["orphan_owner"] == counts["owner_product_mismatch"] == 0, counts
            disposable_counts[table] = counts
        report["disposable_counts_before"] = disposable_counts
        ok("PRE25 final aceita estrutura reconciliada e mede os quatro contadores com zero divergências")

        orphan_scenarios = []
        for table, name in TARGETS:
            row = json.loads(B.last(f"""SELECT jsonb_build_object('id',id,'owner',owner_organization_id)
              FROM (SELECT {'product_id::text AS id' if table == 'product_sale_units' else 'id::text AS id'},owner_organization_id
              FROM public.{table} ORDER BY 1 LIMIT 1) selected;"""))
            key = "product_id" if table == "product_sale_units" else "id"
            orphan = "00000000-0000-4000-8000-00000000f666"
            assert orphan != row["owner"]
            B.sql(f"SET session_replication_role=replica;UPDATE public.{table} SET owner_organization_id='{orphan}' WHERE {key}='{row['id']}';SET session_replication_role=origin;")
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
                B.sql(f"SET session_replication_role=replica;UPDATE public.{table} SET owner_organization_id='{row['owner']}' WHERE {key}='{row['id']}';SET session_replication_role=origin;")
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
                         f"""BEGIN;ALTER TABLE ONLY public.{table} DISABLE TRIGGER USER;
                         UPDATE public.{table} SET owner_organization_id='00000000-0000-4000-8000-00000000f666' WHERE {key}='{row['id']}';COMMIT;""",
                         name, "23503")
        report["both_fks_enforced"] = True
        expect_error("reexecução de INSTALL26 falha fechado sem duplicar objetos", PACKAGE / INSTALL,
                     "OWNER_FK_PRE_ALREADY_INSTALLED product_packagings.product_packagings_owner_organization_id_fkey")

        # Mesma ACL real relatada, em ordem diversa: o overlay ACL já corrigido deve aceitar.
        B.sql("""REVOKE ALL ON public.estoque_movimentacoes FROM anon,authenticated,service_role;
          GRANT ALL ON public.estoque_movimentacoes TO service_role;
          GRANT SELECT ON public.estoque_movimentacoes TO authenticated;""")
        execute(OVERLAY / PRE30, final_artifacts)

        # Complementa as cinco negações da suíte ACL: duplicata, vazio e NULL.
        # A expressão é exatamente a mesma usada pelos dez guards gerados.
        acl_generator = load("owner_fk_acl_generator", physical / "assemble.py")
        overlay_origin = json.loads((OVERLAY / "origin.json").read_text())
        expected_acl = next(row["expected_acl"] for row in overlay_origin["relations"]
                            if row["relation"] == "public.estoque_movimentacoes")
        expected_expression = f"{acl_generator.lit(expected_acl)}::aclitem[]"
        acl_entries = expected_acl.strip("{}").split(",")
        acl_cases = {
            "duplicate": "ARRAY[" + ",".join(acl_generator.lit(item) + "::aclitem" for item in acl_entries + [acl_entries[0]]) + "]::aclitem[]",
            "empty": "'{}'::aclitem[]",
            "null": "NULL::aclitem[]",
        }
        for case, actual_expression in acl_cases.items():
            statement = f"""DO $$DECLARE actual jsonb;expected jsonb;BEGIN
 SELECT {acl_generator.acl_items_sql(actual_expression)},{acl_generator.acl_items_sql(expected_expression)} INTO actual,expected;
 IF actual IS NOT DISTINCT FROM expected THEN RAISE EXCEPTION 'ACL_CASE_WAS_ACCEPTED {case}';END IF;
 RAISE EXCEPTION 'FINISHED_PRE_RELATION_DRIFT public.estoque_movimentacoes';
END$$;"""
            expect_error(f"ACL {case} rejeitada pela normalização exata", statement,
                         "FINISHED_PRE_RELATION_DRIFT public.estoque_movimentacoes")
        report["acl_local_additional_cases"] = sorted(acl_cases)
        report["acl_local_coverage"] = {
            "previous_overlay_suite": "12/12: ordem + privilégio/grant option/role ausente/role extra/grantor",
            "this_suite": "3/3: duplicata/vazio/NULL",
            "categories": 9,
        }

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
        auditor_report = json.loads(AUDITOR_REPORT.read_text())
        assert auditor_report["kind"] == "AUDITOR_REPORTED_READONLY_EVIDENCE"
        assert auditor_report["project_ref"] == "swzpzcwiasxmjutrmvkm"
        assert auditor_report["agent_hosted_io"] is False
        assert auditor_report["acl_normalization_regressions"]["count"] == 9
        assert auditor_report["acl_normalization_regressions"]["status"] == "PASS_REPORTED_BY_AUDITOR"
        assert set(auditor_report["owner_fk_counts"]) == {table for table, _name in TARGETS}
        for counts in auditor_report["owner_fk_counts"].values():
            assert counts["total"] == 1
            assert counts["owner_null"] == counts["orphan_owner"] == counts["owner_product_mismatch"] == 0
        report.update({
            "status": "PASS",
            "postgresql_version": B.last("SHOW server_version;"),
            "acl_overlay_unmodified": True,
            "auditor_reported_readonly_evidence": {
                "path": str(AUDITOR_REPORT.relative_to(ROOT)),
                "sha256": sha(AUDITOR_REPORT),
                "owner_fk_counts": auditor_report["owner_fk_counts"],
                "acl_normalization_regressions": auditor_report["acl_normalization_regressions"],
            },
            "relation_security_pins": len(relations_before),
            "relation_security_preserved": True,
            "history_before": history_before,
            "history_after": history_after,
            "plans_before_md5": plans_before,
            "plans_after_md5": plans_after,
            "data_cleanup": False,
            "grants_or_revokes_in_candidate": False,
            "gates_activated": False,
            "agent_hosted_orphan_measurement": "NOT_RUN; contagens reais são relato READ ONLY independente do auditor",
            "fresh_orphan_measurement_required": "PRE25/INSTALL26/POST27 medem novamente e exigem zero owner nulo/órfão",
            "synthetic_seams": [
                "Auth/claims e papéis SQL somente no PostgreSQL descartável",
                "product_packagings.peso_liquido_kg ajustado de numeric para numeric(12,3) somente no descartável",
                "product_sale_units.forma_fisica é recriada como coluna gerada STORED com a expressão capturada somente no descartável; produtos.oculto permanece fora do escopo do PRE",
                "catalogo_volumes_medida_shape adicionada com a definição capturada somente no descartável; leitura de constraints usa pg_get_constraintdef(oid), como o PRE",
                "somente na fixture B3 antiga, preco_brl=0,01 de apresentações foi reconciliado para zero sem apagar linhas; catalogo_precos_embalagem e dados reais permanecem intocados",
                "duas FKs removidas somente no descartável para reproduzir a captura real",
                "órfãos temporários com session_replication_role=replica somente na fixture e restaurados",
                "sonda de enforcement usa DISABLE TRIGGER USER dentro de transação abortada no descartável; gatilhos internos da FK permanecem ativos e writers finais usam triggers habilitados",
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
