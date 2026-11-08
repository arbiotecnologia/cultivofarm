#!/usr/bin/env python3
"""Captura baseline da composição local; nunca conecta ao hosted."""
import importlib.util
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEPENDENCY_NAMES = [
    "platform_private.entregas_catalog_tenant_guard()",
    "platform_private.estoque_produto_catalog_tenant_guard()",
    "platform_private.lotes_catalog_tenant_guard()",
    "platform_private.ordens_servico_catalog_tenant_guard()",
    "platform_private.produto_etiquetas_catalog_tenant_guard()",
    "platform_private.programacao_producao_catalog_tenant_guard()",
]
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

def capture(B):
    values = ",".join("('" + n.replace("'", "''") + "')" for n in NAMES)
    rows = json.loads(B.last(f"""
      SELECT coalesce(jsonb_agg(jsonb_build_object('signature',v.signature,'md5',md5(pg_get_functiondef(p.oid)),'owner',r.rolname,'acl',coalesce(p.proacl::text,'')::text) ORDER BY v.signature),'[]'::jsonb)
      FROM (VALUES {values}) v(signature)
      JOIN pg_proc p ON p.oid=to_regprocedure(v.signature)
      JOIN pg_roles r ON r.oid=p.proowner;
    """))
    dependency_values = ",".join("('" + n.replace("'", "''") + "')" for n in DEPENDENCY_NAMES)
    dependency_functions = json.loads(B.last(f"""
      SELECT coalesce(jsonb_agg(jsonb_build_object('signature',v.signature,'md5',md5(pg_get_functiondef(p.oid)),'owner',r.rolname,'acl',coalesce(p.proacl::text,'')::text) ORDER BY v.signature),'[]'::jsonb)
      FROM (VALUES {dependency_values}) v(signature)
      JOIN pg_proc p ON p.oid=to_regprocedure(v.signature)
      JOIN pg_roles r ON r.oid=p.proowner;
    """))
    dependency_triggers = json.loads(B.last("""
      SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled::text,'type',t.tgtype) ORDER BY t.tgname),'[]'::jsonb)
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname='public'
        AND c.relname IN ('entregas','estoque_produto','lotes','ordens_servico','produto_etiquetas','programacao_producao')
        AND t.tgname LIKE 'a000_%_catalog_tenant_guard';
    """))
    relations = json.loads(B.last("""
      SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',r.rolname,'acl',coalesce(c.relacl::text,'')::text) ORDER BY n.nspname,c.relname),'[]'::jsonb)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE (n.nspname='public' AND c.relname IN ('produtos','microrganismos','lotes','estoque_produto','estoque_movimentacoes','entregas','catalogo_volumes','product_sale_units','product_packagings'))
         OR (n.nspname='platform_private' AND c.relname='authz_tickets');
    """))
    catalog_columns = json.loads(B.last("""
      SELECT coalesce(jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable) ORDER BY table_name,column_name),'[]'::jsonb)
      FROM information_schema.columns WHERE table_schema='public'
      AND ((table_name IN ('produtos','microrganismos') AND column_name='owner_organization_id')
        OR (table_name='catalogo_volumes' AND column_name IN ('owner_organization_id','medida','volume_ml'))
        OR table_name IN ('product_sale_units','product_packagings'));
    """))
    catalog_constraints = json.loads(B.last("""
      SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',x.conname,'definition',pg_get_constraintdef(x.oid)) ORDER BY c.relname,x.conname),'[]'::jsonb)
      FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND (c.relname IN ('product_sale_units','product_packagings')
        OR (c.relname IN ('produtos','microrganismos','catalogo_volumes') AND x.conname LIKE '%owner_organization_id%'));
    """))
    columns = json.loads(B.last("""
      SELECT coalesce(jsonb_agg(jsonb_build_object('table',table_name,'column',column_name) ORDER BY table_name,column_name),'[]'::jsonb)
      FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('estoque_produto','entregas')
      AND column_name IN ('origem_estoque','unidade_comercial','conteudo_por_unidade','unidade_conteudo','quantidade_conteudo','embalagem_id','embalagem_versao');
    """))
    return {"source": "disposable_canonical_post_catalog_posplans_composition", "hosted": False, "functions": rows, "dependency_functions": dependency_functions, "dependency_triggers": dependency_triggers, "relations": relations, "catalog_columns": catalog_columns, "catalog_constraints": catalog_constraints, "existing_candidate_columns": columns}


def main():
    spec = importlib.util.spec_from_file_location("finished_before", HERE / "test_pg.py")
    B = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(B)
    B.restore_checkpoint()
    out = capture(B)
    target = Path(os.environ.get("FINISHED_BASELINE_OUT", str(HERE / "baseline.json")))
    target.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"functions": len(out["functions"]), "dependency_functions": len(out["dependency_functions"]), "dependency_triggers": len(out["dependency_triggers"]), "relations": len(out["relations"]), "candidate_columns_already_present": len(out["existing_candidate_columns"])}))


if __name__ == "__main__":
    main()
