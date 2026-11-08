#!/usr/bin/env python3
"""Regression 6667a8d6: real disposable stack, no hosted transport or Auth."""
import hashlib
import importlib.util
import json
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("purchase_supplier_regression", HERE / "test_after.py")
A = importlib.util.module_from_spec(spec)
spec.loader.exec_module(A)
B = A.B


def main():
    status = 1
    try:
        B.restore_checkpoint()
        baseline = json.loads((HERE / "baseline.json").read_text())
        B.sql((HERE / "install.sql.review").read_text())
        assert B.last("SELECT pg_get_indexdef('public.lotes_codigo_lote_key'::regclass);") == "CREATE UNIQUE INDEX lotes_codigo_lote_key ON public.lotes USING btree (codigo_lote)"
        B.ok("UNIQUE global codigo_lote continua instalada sem alteração")
        # Capture POST for exactly this generated source, not an older candidate.
        signatures = [x["signature"] for x in baseline["functions"] + baseline["dependency_functions"]] + A.NEW_FUNCTIONS
        values = ",".join("('" + x + "')" for x in signatures)
        functions = json.loads(B.last(f"SELECT jsonb_agg(jsonb_build_object('signature',v.signature,'md5',md5(pg_get_functiondef(p.oid)),'owner',r.rolname,'acl',coalesce(p.proacl::text,'')) ORDER BY v.signature) FROM (VALUES {values}) v(signature) JOIN pg_proc p ON p.oid=to_regprocedure(v.signature) JOIN pg_roles r ON r.oid=p.proowner;"))
        assert len(functions) == len(signatures)
        (HERE / "evidence/post-install-functions.json").write_text(json.dumps({"source": "disposable_post_install", "candidate_sha256": hashlib.sha256((HERE / "candidate.sql.review").read_bytes()).hexdigest(), "functions": functions}, indent=2) + "\n")
        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=true WHERE singleton;")
        arbio = A.catalog_item("quimico", "kg", 25)
        fsf = A.catalog_item("quimico", "kg", 25, owner=B.T.B)
        external = "FORN-LOTE-COMPARTILHADO-2026"
        first = json.loads(B.last(A.purchase(arbio, 2, "supplier-lot-arbio-001", supplier_lot=external)))
        other = json.loads(B.last(A.purchase(fsf, 2, "supplier-lot-fsf-001", actor=B.T.V, supplier_lot=external)))
        assert first["lote_id"] != other["lote_id"]
        assert B.last(f"SELECT count(DISTINCT codigo_lote)=2 AND count(DISTINCT organization_id)=2 FROM public.lotes WHERE id IN ('{first['lote_id']}','{other['lote_id']}');") == "t"
        B.ok("ARBio/FSF sintéticos recebem mesmo lote externo com códigos internos distintos")
        second = json.loads(B.last(A.purchase(arbio, 3, "supplier-lot-arbio-002", supplier_lot=external)))
        assert second["lote_id"] != first["lote_id"]
        B.ok("mesmo tenant/produto/apresentação aceita recebimento diferente do mesmo lote externo")
        presentation = A.catalog_item("quimico", "kg", 10)
        # Fixture: segunda apresentação do MESMO produto canônico.
        B.sql(f"SET session_replication_role=replica;UPDATE public.catalogo_volumes SET produto_id='{arbio['product']}' WHERE id='{presentation['packaging']}';UPDATE public.product_packagings SET product_id='{arbio['product']}' WHERE id='{presentation['packaging']}';SET session_replication_role=origin;")
        presentation["product"] = arbio["product"]
        third = json.loads(B.last(A.purchase(presentation, 4, "supplier-lot-arbio-003", supplier_lot=external)))
        assert third["conteudo_por_unidade"] == 10 and third["quantidade_conteudo"] == 40
        ids = [first["lote_id"], other["lote_id"], second["lote_id"], third["lote_id"]]
        id_sql = ",".join("'" + x + "'" for x in ids)
        assert B.last(f"SELECT count(*)=4 AND count(DISTINCT codigo_lote)=4 AND bool_and(codigo_lote='BUY-'||id::text) AND bool_and(observacoes_tecnicas::jsonb->>'lote_fornecedor'='{external}') FROM public.lotes WHERE id IN ({id_sql});") == "t"
        B.ok("apresentações distintas preservam conteúdo e referência externa exata; código é UUID servidor")
        assert B.last(f"SELECT count(*)=4 AND bool_and(metadata->>'lote_fornecedor'='{external}') FROM public.estoque_movimentacoes WHERE lote_id IN ({id_sql}) AND acao='entrada';") == "t"
        B.ok("quatro recebimentos têm exatamente quatro entradas com lote fornecedor intacto no ledger")
        replay = json.loads(B.last(A.purchase(arbio, 2, "supplier-lot-arbio-001", supplier_lot=external)))
        assert replay["replay"] is True
        for key in ("lote_id", "estoque_produto_id", "movimentacao_id"):
            assert replay[key] == first[key]
        B.ok("mesma chave/payload retorna mesmos IDs sem gerar outro lote")
        before = B.last("SELECT jsonb_build_array((SELECT count(*) FROM public.lotes),(SELECT count(*) FROM public.estoque_produto),(SELECT count(*) FROM public.estoque_movimentacoes));")
        B.reject("mesma chave com quantidade divergente conflita", A.purchase(arbio, 3, "supplier-lot-arbio-001", supplier_lot=external), "23505", "FINISHED_PRODUCT_IDEMPOTENCY_CONFLICT")
        B.reject("mesma chave com referência externa divergente conflita", A.purchase(arbio, 2, "supplier-lot-arbio-001", supplier_lot="OUTRO-LOTE"), "23505", "FINISHED_PRODUCT_IDEMPOTENCY_CONFLICT")
        B.reject("mesma chave com apresentação divergente conflita", A.purchase(presentation, 2, "supplier-lot-arbio-001", supplier_lot=external), "23505", "FINISHED_PRODUCT_IDEMPOTENCY_CONFLICT")
        B.reject("ator FSF não compra produto ARBio", A.purchase(arbio, 2, "supplier-lot-foreign-new", actor=B.T.V, supplier_lot=external), "42501", "FINISHED_PRODUCT_CATALOG_DENIED")
        B.reject("ator FSF não recupera receipt ARBio pela mesma chave", A.purchase(arbio, 2, "supplier-lot-arbio-001", actor=B.T.V, supplier_lot=external), "23505", "FINISHED_PRODUCT_IDEMPOTENCY_CONFLICT")
        assert B.last("SELECT jsonb_build_array((SELECT count(*) FROM public.lotes),(SELECT count(*) FROM public.estoque_produto),(SELECT count(*) FROM public.estoque_movimentacoes));") == before
        assert B.last(f"SELECT sum(quantidade)=9 AND sum(quantidade_conteudo)=165 FROM public.estoque_produto WHERE lote_id IN ({id_sql}) AND produto_id='{arbio['product']}';") == "t"
        B.ok("replay e conflitos não duplicam saldo, lote ou ledger; ARBio mantém 9 UN/165 kg")
        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=false WHERE singleton;")
        status = 0
    except Exception:
        B.fail("regressão lote fornecedor", traceback.format_exc())
    finally:
        (HERE / "evidence/supplier-lot.json").write_text(json.dumps({"status": "PASS" if status == 0 else "FAIL", "exit_code": status, "checks": B.CHECKS, "raw": B.RAW, "hosted": False, "synthetic_seams": ["Auth/claims e fixtures ARBio/FSF locais, não identidades reais", "catálogo/apresentação upstream com replica; compra executa todos os triggers habilitados", "PostgreSQL descartável, não JWT/RLS/Storage hosted nem E2E de pedido B2B"]}, ensure_ascii=False, indent=2) + "\n")
        print(f"RESULT {sum(x['status']=='PASS' for x in B.CHECKS)}/{len(B.CHECKS)} exit {status}")
    return status


if __name__ == "__main__":
    raise SystemExit(main())