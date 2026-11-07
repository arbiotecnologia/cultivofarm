#!/usr/bin/env python3
"""Captura baseline da composição local; nunca conecta ao hosted."""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("finished_before", HERE / "test_pg.py")
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)
NAMES = [
    "public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)",
    "public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)",
    "platform_private.delivery_merge_split_20261030(uuid,jsonb,jsonb)",
    "platform_private.delivery_confirm_apply_v1(uuid,timestamptz,text,jsonb)",
    "platform_private.delivery_send_apply_v1(uuid,timestamptz,text)",
    "public.fn_sync_os_classica_downstream()",
    "platform_private.envase_insert_guard_v1()",
    "platform_private.envase_insert_final_v1()",
    "platform_private.guard_manual_lot_write_v1()",
    "platform_private.trg_lab_lot_biological_only()",
    "public.validate_estoque_entrada()",
]

def main():
    B.restore_checkpoint()
    values = ",".join("('" + n.replace("'", "''") + "')" for n in NAMES)
    rows = json.loads(B.last(f"""
      SELECT coalesce(jsonb_agg(jsonb_build_object('signature',v.signature,'md5',md5(pg_get_functiondef(p.oid)),'owner',r.rolname,'acl',coalesce(p.proacl::text,'')::text) ORDER BY v.signature),'[]'::jsonb)
      FROM (VALUES {values}) v(signature)
      JOIN pg_proc p ON p.oid=to_regprocedure(v.signature)
      JOIN pg_roles r ON r.oid=p.proowner;
    """))
    relations = json.loads(B.last("""
      SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',r.rolname,'acl',coalesce(c.relacl::text,'')::text) ORDER BY n.nspname,c.relname),'[]'::jsonb)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE (n.nspname='public' AND c.relname IN ('produtos','lotes','estoque_produto','estoque_movimentacoes','entregas','catalogo_volumes','product_sale_units','product_packagings'))
         OR (n.nspname='platform_private' AND c.relname='authz_tickets');
    """))
    catalog_columns = json.loads(B.last("""
      SELECT coalesce(jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable) ORDER BY table_name,column_name),'[]'::jsonb)
      FROM information_schema.columns WHERE table_schema='public'
      AND ((table_name='produtos' AND column_name='owner_organization_id')
        OR (table_name='catalogo_volumes' AND column_name IN ('owner_organization_id','medida','volume_ml'))
        OR table_name IN ('product_sale_units','product_packagings'));
    """))
    catalog_constraints = json.loads(B.last("""
      SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',x.conname,'definition',pg_get_constraintdef(x.oid)) ORDER BY c.relname,x.conname),'[]'::jsonb)
      FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('product_sale_units','product_packagings');
    """))
    columns = json.loads(B.last("""
      SELECT coalesce(jsonb_agg(jsonb_build_object('table',table_name,'column',column_name) ORDER BY table_name,column_name),'[]'::jsonb)
      FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('estoque_produto','entregas')
      AND column_name IN ('origem_estoque','unidade_comercial','conteudo_por_unidade','unidade_conteudo','quantidade_conteudo','embalagem_id','embalagem_versao');
    """))
    out = {"source": "disposable_captured_composition_with_current_catalog_schema_seam", "hosted": False, "functions": rows, "relations": relations, "catalog_columns": catalog_columns, "catalog_constraints": catalog_constraints, "existing_candidate_columns": columns}
    (HERE / "baseline.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"functions": len(rows), "relations": len(relations), "candidate_columns_already_present": len(columns)}))

if __name__ == "__main__":
    main()
