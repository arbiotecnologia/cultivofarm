#!/usr/bin/env python3
"""PG17 disposable regression for the reader SELECT po.* overlay (70/71/72/95).

Composes the reported production state locally (11/21/26/31 + logistics overlay
40-42 + frozen 50-62), then proves on an isolated fixture:
  * live 61 body (md5 d426...) positive path returns the exact order row fields;
  * foreign-tenant order is denied (B2B_RESALE_ORDER_SCOPE_DENIED);
  * live body FAILS under plpgsql.extra_errors=strict_multi_assignment;
  * overlay passes the same positive/negative cases, also under strict mode;
  * owner/ACL/header preserved, rerun fails closed, rollback 95 restores exact body.
Never hosted. argv: FROZEN OWNER_FK_PKG ACL30_PKG LOGACL_PKG OVERLAY OUT
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
FROZEN, FKPKG, ACL30, LOGACL, OVERLAY, OUT = (Path(x).resolve() for x in sys.argv[1:7])
SIG = "public.rpc_b2b_resale_os_availability_v1(uuid)"
ACL = "{postgres=X/postgres,authenticated=X/postgres}"
TARGETS = (("product_packagings", "product_packagings_owner_organization_id_fkey"),
           ("product_sale_units", "product_sale_units_owner_organization_id_fkey"))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    assert ROOT.is_relative_to(Path("/tmp")), "TEMP_MIRROR_REQUIRED"
    checks, raw, final_artifacts, supporting = [], [], [], []
    report = {"status": "FAIL", "kind": "DISPOSABLE_READER_ROWTYPE_OVERLAY_NOT_HOSTED", "hosted": False,
              "verification_runner_sha256": sha(Path(__file__).resolve()), "checks": checks, "raw": raw,
              "final_artifacts": final_artifacts, "supporting_artifacts": supporting,
              "authenticated_real_proof": "NOT_RUN"}

    def ok(name, detail=None):
        checks.append({"name": name, "status": "PASS", **({"detail": detail} if detail is not None else {})})
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
        assert c.returncode != 0 and message in c.stderr, (name, c.stdout[-1500:], c.stderr[-3000:])
        ok(name)

    try:
        physical = ROOT / "scripts/b2b-downstream-audit-20261107/physical/finished-product"
        B = load("rrt_finished", physical / "test_after.py").B
        sys.modules[B.C.__name__] = B.C
        pg17 = next(Path("/nix/store").glob("*-postgresql-17.11/bin"))
        os.environ["PATH"] = str(pg17) + ":" + os.environ["PATH"]
        restored = B.restore.restore()
        assert not any(restored.values()), restored
        B.C.prepare_checkpoint(OUT.parent / "rrt-checkpoint.sql")
        B.current_catalog.apply(B.run_raw, B.last, B.ok, B.T.A)
        commercial = load("rrt_commercial", H / "commercial.py")
        work = OUT.parent / "commercial-work"
        work.mkdir(parents=True, exist_ok=True)
        commercial.apply(B, load, ROOT, work)
        plan_dir = ROOT / "scripts/commercial-plans-tenant-20261108"
        plan_ref = "SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';"
        for n in ("01-pre.sql.readonly", "02-install.sql.review", "03-post.sql.readonly"):
            B.sql(plan_ref + (plan_dir / n).read_text())
        for n in ("00-production-pre-posplans.sql.readonly", "11-confirmation-install.sql.review",
                  "12-confirmation-post.sql.readonly", "20-send-pre.sql.readonly",
                  "21-send-install.sql.review", "22-send-post.sql.readonly"):
            execute(FROZEN / n, supporting)
        capture = json.loads((H / "reconciliation-posplans-20261108/live-catalog-owner-fk-20261109.capture.json").read_text())
        shape = next(r for r in capture["columns"] if r["relation"] == "product_sale_units" and r["name"] == "forma_fisica")
        B.sql("ALTER TABLE ONLY public.product_packagings ALTER COLUMN peso_liquido_kg TYPE numeric(12,3) USING peso_liquido_kg::numeric(12,3);")
        B.sql(f"ALTER TABLE ONLY public.product_sale_units DROP COLUMN forma_fisica, ADD COLUMN forma_fisica text GENERATED ALWAYS AS ({shape['default']}) STORED;")
        B.sql("""SET session_replication_role=replica;
          UPDATE public.catalogo_volumes SET preco_brl=0 WHERE medida='embalagem' AND volume_ml IS NULL AND item_tipo='produto'
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
        guard = "platform_private.b2b_internal_order_snapshot_guard()"
        B.sql(f"REVOKE ALL ON FUNCTION {guard} FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION {guard} TO service_role;")
        for n in ("40-logistics-pre-after-physical.sql.readonly", "41-logistics-install.sql.review", "42-logistics-post.sql.readonly"):
            execute(LOGACL / n, supporting)
        for n in ("50-endpoint-reader-pre.sql.readonly", "51-endpoint-reader-install.sql.review", "52-endpoint-reader-post.sql.readonly",
                  "60-pilot-containment-pre.sql.readonly", "61-pilot-containment-install.sql.review", "62-pilot-containment-post.sql.readonly"):
            execute(FROZEN / n, supporting)
        ok("estado local equivalente ao relatado: 11/21/26/31/41/51/61 com POST PASS (produção: não reinstalar)")

        md5 = lambda: B.last(f"SELECT md5(pg_get_functiondef(to_regprocedure('{SIG}')));")
        acl = lambda: B.last(f"SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid=to_regprocedure('{SIG}');")
        assert md5() == "d426e0758d03a143f8014cbb6590fb49" and acl() == ACL, (md5(), acl())
        ok("corpo vivo 61 reproduzido (md5 d426e075…, ACL real)")

        # Fixture isolada: dois tenants, parceiro e pedido em cada um, item quimico do tenant A.
        T = B.T
        U, A, Bo = T.U, T.A, T.B
        PA, PB, OA, OB, IA, PRD = [T.u(n) for n in range(9101, 9107)]
        snap = lambda org, partner: json.dumps({"contract": "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1", "schema_version": "1",
            "organization_id": org, "creditor_organization_id": org, "actor_user_id": U, "partner_id": partner,
            "accounting_validated": False, "issuer_state": "MG"})
        B.sql("SET session_replication_role=replica;" + f"""
          INSERT INTO public.partner_accounts(id,razao_social,cnpj,commercial_owner_organization_id,ativo)
            VALUES('{PA}','LOCAL ROWTYPE A','00000000000191','{A}',true),('{PB}','LOCAL ROWTYPE B','00000000000272','{Bo}',true);
          INSERT INTO public.produtos(id,nome,tipo,codigo,familia_catalogo,owner_organization_id,ativo)
            VALUES('{PRD}','LOCAL ROWTYPE QUIMICO','inseticida','RRT-1','quimico','{A}',true);
          INSERT INTO public.partner_orders(id,partner_id,numero,status,receivable_generated,payment_condition_status,
            financial_approval_status,c2_external_origin_snapshot,internal_economic_snapshot,internal_origin_snapshot,ready_for_production)
            VALUES('{OA}','{PA}','RRT-A','aprovado',false,'defined','approved','{snap(A, PA)}'::jsonb,'{{}}'::jsonb,NULL,false),
                  ('{OB}','{PB}','RRT-B','aprovado',false,'defined','approved','{snap(Bo, PB)}'::jsonb,'{{}}'::jsonb,NULL,false);
          INSERT INTO public.partner_order_items(id,order_id,product_id,quantidade,unidade_medida,packaging_id_snapshot,
            packaging_version_snapshot,packaging_unidade_conteudo_snapshot,preco_unitario,subtotal)
            VALUES('{IA}','{OA}','{PRD}',2,'unidade','{PRD}',1,'kg',0,0);
          SET session_replication_role=origin;""")
        expected_updated = B.last(f"SELECT to_jsonb(updated_at)#>>'{{}}' FROM public.partner_orders WHERE id='{OA}';")
        report["fixture"] = {"actor": U, "tenant": A, "foreign_tenant": Bo, "order": OA, "foreign_order": OB, "item": IA}
        read = lambda order, strict=False: (T.actor(U) + ("SET plpgsql.extra_errors='strict_multi_assignment';" if strict else "")
                                            + f"SELECT public.rpc_b2b_resale_os_availability_v1('{order}');")

        def positive(label, strict=False):
            r = json.loads(B.last(read(OA, strict)))
            assert r["contract"] == "B2B_RESALE_OS_AVAILABILITY_V1" and r["order_id"] == OA, r
            assert r["actor_id"] == U and r["organization_id"] == A, r
            assert r["observed_updated_at"] is not None and r["available"] in (False, None), r
            assert [i["order_item_id"] for i in r["items"]] == [IA] and r["items"][0]["os_id"] is None, r
            ok(label, r)
            return r

        before = positive("corpo vivo: caminho positivo devolve pedido/ator/tenant/item corretos (gate OFF)")
        expect_error("corpo vivo: pedido de outro tenant negado", read(OB), "B2B_RESALE_ORDER_SCOPE_DENIED")
        expect_error("corpo vivo: strict_multi_assignment reproduz a fragilidade", read(OA, True), "number of source and target fields")

        execute(OVERLAY / "70-reader-rowtype-pre.sql.readonly", final_artifacts)
        execute(OVERLAY / "71-reader-rowtype-install.sql.review", final_artifacts)
        execute(OVERLAY / "72-reader-rowtype-post.sql.readonly", final_artifacts)
        new_md5 = md5()
        report["new_body_md5"] = new_md5
        assert acl() == ACL and B.last(f"SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('{SIG}');") == "postgres"
        assert "SELECT po.* INTO v_order" in B.last(f"SELECT pg_get_functiondef(to_regprocedure('{SIG}'));".replace("SELECT pg", "SELECT pg"))
        ok("70/71/72 passaram; owner/ACL preservados, sem GRANT/REVOKE", {"new_md5": new_md5})
        after = positive("overlay: caminho positivo idêntico")
        assert {k: v for k, v in after.items()} == before, (before, after)
        positive("overlay: positivo também com strict_multi_assignment", strict=True)
        expect_error("overlay: pedido de outro tenant negado", read(OB), "B2B_RESALE_ORDER_SCOPE_DENIED")
        expect_error("overlay: tenant negado também em strict", read(OB, True), "B2B_RESALE_ORDER_SCOPE_DENIED")
        expect_error("overlay: ator anônimo negado", f"RESET ROLE;SET ROLE anon;SELECT public.rpc_b2b_resale_os_availability_v1('{OA}');", "permission denied")
        expect_error("reexecução de 71 falha fechado", (OVERLAY / "71-reader-rowtype-install.sql.review").read_text(), "READER_ROWTYPE_PRE_BODY_DRIFT")
        expect_error("POST62 congelado deixa de valer após 71 (substituído por POST72)", (FROZEN / "62-pilot-containment-post.sql.readonly").read_text(), "PILOT_POST_DRIFT " + SIG)
        B.sql(f"GRANT EXECUTE ON FUNCTION {SIG} TO anon;")
        expect_error("negado: ACL extra anon", (OVERLAY / "72-reader-rowtype-post.sql.readonly").read_text(), "READER_ROWTYPE_POST_ACL_DRIFT")
        B.sql(f"REVOKE EXECUTE ON FUNCTION {SIG} FROM anon;GRANT EXECUTE ON FUNCTION {SIG} TO authenticated WITH GRANT OPTION;")
        expect_error("negado: grant option authenticated", (OVERLAY / "72-reader-rowtype-post.sql.readonly").read_text(), "READER_ROWTYPE_POST_ACL_DRIFT")
        B.sql(f"REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION {SIG} FROM authenticated;")
        assert acl() == ACL, acl()
        B.sql("UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true WHERE singleton;")
        expect_error("negado: gate ligado", (OVERLAY / "72-reader-rowtype-post.sql.readonly").read_text(), "READER_ROWTYPE_GATE_NOT_OFF")
        B.sql("UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false WHERE singleton;")

        execute(OVERLAY / "95-reader-rowtype-rollback.sql.review", final_artifacts)
        assert md5() == "d426e0758d03a143f8014cbb6590fb49" and acl() == ACL
        execute(FROZEN / "62-pilot-containment-post.sql.readonly", supporting)
        ok("rollback 95 restaura o corpo exato d426e075… e POST62 congelado volta a passar")
        for n in ("70-reader-rowtype-pre.sql.readonly", "71-reader-rowtype-install.sql.review", "72-reader-rowtype-post.sql.readonly"):
            execute(OVERLAY / n, supporting)
        for n in ("89-pilot-containment-rollback-deny.sql.review", "90-endpoint-reader-rollback-deny.sql.review"):
            execute(FROZEN / n, supporting)
        expect_error("após 89/90, authenticated sem EXECUTE no leitor", read(OA), "permission denied")
        closed = json.loads(B.last("""SELECT jsonb_build_object(
          'logistics_gate',(SELECT enabled FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton),
          'physical_gate',(SELECT enabled FROM platform_private.finished_product_gate_v1 WHERE singleton),
          'pilot_grants',(SELECT count(*) FROM platform_private.resale_pilot_allowlist_v1));"""))
        assert closed == {"logistics_gate": False, "physical_gate": False, "pilot_grants": 0}, closed
        ok("reaplicação 70-72 e rollbacks congelados 89/90 compõem; gates OFF e allowlist vazia", closed)
        report.update({"status": "PASS", "postgresql_version": B.last("SHOW server_version;"), "closed": closed,
                       "synthetic_seams": ["Auth/claims e papéis SQL só no descartável",
                                           "fixture de parceiro/pedido/item inserida com session_replication_role=replica",
                                           "11/21/26/31/41/51/61 executados localmente só para compor o estado relatado"]})
        return 0
    except Exception:
        report["error"] = traceback.format_exc()
        return 1
    finally:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    sys.exit(main())
