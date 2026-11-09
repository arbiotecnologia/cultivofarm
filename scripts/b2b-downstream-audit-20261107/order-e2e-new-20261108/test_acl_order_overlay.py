#!/usr/bin/env python3
"""PG17 regression for the separate ACL-order overlay; disposable only."""
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
OUT = Path(sys.argv[3]).resolve()
PRE = "30-physical-pre-after-confirmation-send.sql.readonly"
INSTALL = "31-physical-install.sql.review"
POST = "32-physical-post.sql.readonly"
ROLLBACK = "93-physical-rollback-deny.sql.review"
TARGET = "public.estoque_movimentacoes"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    assert ROOT.is_relative_to(Path("/tmp")), "TEMP_MIRROR_REQUIRED"
    assert FROZEN.is_relative_to(Path("/tmp")) and OVERLAY.is_relative_to(Path("/tmp"))
    assert OUT != OVERLAY and not OUT.is_relative_to(OVERLAY)
    checks = []
    raw = []
    final_artifacts = []
    supporting_artifacts = []
    report = {
        "status": "FAIL",
        "kind": "DISPOSABLE_ACL_ORDER_OVERLAY_NOT_HOSTED",
        "hosted": False,
        "package_label": "ad87",
        "frozen_manifest_sha256": sha(FROZEN / "manifest.json"),
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
            row["stdout_tail"] = completed.stdout[-2000:]
            row["stderr_tail"] = completed.stderr[-5000:]
            raise AssertionError(f"ARTIFACT_FAILED:{path.name}\n{completed.stderr[-5000:]}")
        return completed

    try:
        physical = ROOT / "scripts/b2b-downstream-audit-20261107/physical/finished-product"
        generator, _ = load("acl_overlay_finished_generator", physical / "assemble.py"), None
        B = load("acl_overlay_finished", physical / "test_after.py").B
        sys.modules[B.C.__name__] = B.C
        pg17 = next(Path("/nix/store").glob("*-postgresql-17.11/bin"))
        os.environ["PATH"] = str(pg17) + ":" + os.environ["PATH"]
        restored = B.restore.restore()
        assert not any(restored.values()), restored
        B.C.prepare_checkpoint(Path("/tmp/acl-overlay-order-checkpoint.sql"))
        B.current_catalog.apply(B.run_raw, B.last, B.ok, B.T.A)

        commercial = load("acl_overlay_commercial", H / "commercial.py")
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
        ok("pré-requisitos locais 00/11/12/20/21/22 preservados; nenhuma reinstalação hospedada")

        current_scope = load("acl_overlay_current_scope", H / "current_scope.py")

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
          'os',(SELECT count(*) FROM public.ordens_servico));"""))
        plans_before = B.last("SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) FROM public.commercial_payment_plans p;")
        origin = json.loads((OVERLAY / "origin.json").read_text())
        target_entry = next(row for row in origin["relations"] if row["relation"] == TARGET)
        expected_acl = target_entry["expected_acl"]
        target_schema, target_name = TARGET.split(".")
        target_relation = {
            "schema": target_schema,
            "name": target_name,
            "owner": target_entry["owner"],
            "acl": expected_acl,
        }
        target_guard = generator.relation_pin(target_relation)

        def actual_acl(relation=TARGET):
            schema, name = relation.split(".")
            return B.last(f"""SELECT coalesce(c.relacl::text,'') FROM pg_class c
              JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='{schema}' AND c.relname='{name}';""")

        def reset_target_acl():
            B.sql("""REVOKE ALL ON public.estoque_movimentacoes FROM anon,authenticated,service_role;
              GRANT ALL ON public.estoque_movimentacoes TO service_role;
              GRANT SELECT ON public.estoque_movimentacoes TO authenticated;""")

        reset_target_acl()
        observed_acl = actual_acl()
        assert observed_acl == "{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}", observed_acl
        assert observed_acl != expected_acl
        assert sorted(observed_acl.strip("{}").split(",")) == sorted(expected_acl.strip("{}").split(","))
        old = B.run_raw((FROZEN / PRE).read_text())
        raw.append({"case": "legacy_order_false_positive", "returncode": old.returncode, "stderr_tail": old.stderr[-3000:]})
        assert old.returncode != 0 and "FINISHED_PRE_RELATION_DRIFT public.estoque_movimentacoes" in old.stderr
        ok("REPRODUZIDO: PRE30 antigo rejeitou somente a ordem textual da ACL", observed_acl)

        execute(OVERLAY / PRE, final_artifacts)
        ok("PRE30 corrigido aceita o mesmo conjunto em ordem diferente")

        def denied(name, statement, relation=TARGET):
            completed = B.run_raw(statement)
            raw.append({"case": name, "returncode": completed.returncode, "stderr_tail": completed.stderr[-3000:]})
            assert completed.returncode != 0 and f"FINISHED_PRE_RELATION_DRIFT {relation}" in completed.stderr, (name, completed.stderr[-3000:])
            ok(name)

        reset_target_acl()
        B.sql("REVOKE ALL ON public.estoque_movimentacoes FROM authenticated;")
        denied("ACL ausente continua negada", target_guard)

        reset_target_acl()
        B.sql("GRANT SELECT ON public.estoque_movimentacoes TO anon;")
        denied("ACL extra continua negada", target_guard)

        reset_target_acl()
        B.sql("GRANT INSERT ON public.estoque_movimentacoes TO authenticated;")
        denied("privilégio ampliado continua negado", target_guard)

        reset_target_acl()
        B.sql("GRANT SELECT ON public.estoque_movimentacoes TO authenticated WITH GRANT OPTION;")
        denied("grant option ampliada continua negada", target_guard)

        B.sql("""CREATE ROLE acl_guard_grantor NOLOGIN;
          CREATE TABLE public.acl_grantor_probe(id integer);
          GRANT ALL ON public.acl_grantor_probe TO postgres;
          GRANT SELECT ON public.acl_grantor_probe TO acl_guard_grantor WITH GRANT OPTION;
          SET ROLE acl_guard_grantor;
          GRANT SELECT ON public.acl_grantor_probe TO authenticated;
          RESET ROLE;""")
        grantor_expected = {
            "schema": "public",
            "name": "acl_grantor_probe",
            "owner": "postgres",
            "acl": "{postgres=arwdDxtm/postgres,acl_guard_grantor=r*/postgres,authenticated=r/postgres}",
        }
        denied("grantor diferente continua negado", generator.relation_pin(grantor_expected), "public.acl_grantor_probe")

        reset_target_acl()
        final_artifacts.clear()
        execute(OVERLAY / PRE, final_artifacts)
        execute(OVERLAY / INSTALL, final_artifacts)
        execute(FROZEN / POST, supporting_artifacts)
        execute(FROZEN / ROLLBACK, supporting_artifacts)
        ok("30/31 finais, POST32 e rollback93 executados byte a byte no PostgreSQL descartável")

        denied_writer = B.run_raw("RESET ROLE;SET ROLE authenticated;SELECT public.rpc_finished_product_purchase_entry_v1(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);")
        assert denied_writer.returncode != 0 and "permission denied" in denied_writer.stderr
        assert B.last("SELECT enabled FROM platform_private.finished_product_gate_v1 WHERE singleton;") == "f"
        ok("writer de compra e gate permanecem fechados após rollback")

        relations_after = relation_security()
        history_after = json.loads(B.last("""SELECT jsonb_build_object(
          'deliveries',(SELECT count(*) FROM public.entregas),
          'movements',(SELECT count(*) FROM public.estoque_movimentacoes),
          'os',(SELECT count(*) FROM public.ordens_servico));"""))
        plans_after = B.last("SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) FROM public.commercial_payment_plans p;")
        assert relations_after == relations_before, "RELATION_SECURITY_DRIFT"
        assert history_after == history_before and plans_after == plans_before
        ok("18 pins de segurança, histórico e planos preservados")

        old_pre = (FROZEN / PRE).read_text()
        old_install = (FROZEN / INSTALL).read_text()
        frozen_pre_body = old_pre[len("BEGIN READ ONLY;\n"):-len("ROLLBACK;\n")]
        old_candidate = old_install[len(frozen_pre_body) + 1:]
        assert (OVERLAY / INSTALL).read_text().endswith(old_candidate)
        report.update({
            "status": "PASS",
            "postgresql_version": B.last("SHOW server_version;"),
            "guards_changed": 10,
            "ddl_candidate_byte_identical": True,
            "ddl_candidate_sha256": hashlib.sha256(old_candidate.encode()).hexdigest(),
            "observed_reordered_acl": observed_acl,
            "expected_acl": expected_acl,
            "relation_security_pins": len(relations_before),
            "relation_security_preserved": True,
            "history_before": history_before,
            "history_after": history_after,
            "plans_before_md5": plans_before,
            "plans_after_md5": plans_after,
            "gates_activated": False,
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
