"""Relação SOMENTE homolog `produto_anexos` (produção: to_regclass NULL, 03/11). Estrutura REAL capturada READ ONLY em
vrlcdwmlytukrjezrrnf: 5 colunas, PK + FK produto_id -> produtos, sem policies/triggers. Instalada VERBATIM no PG
descartável; nenhuma relaxação do inventário de FKs. Prova:
  RED   PRE de produção sobre o estado homolog aborta exatamente fk_unmapped:produto_anexos.produto_id->produtos
  GREEN PRE homolog-clean aprova; drift de coluna/constraint/policy/trigger aborta
  MIG   migração homolog-clean copia anexos para o produto do tenant, snapshot integral no ledger, RLS ligado, ACL destrutiva fechada
"""
import harness as H

DDL = """CREATE TABLE public.produto_anexos(
  id uuid NOT NULL DEFAULT gen_random_uuid(), produto_id uuid, titulo text, url text, created_at timestamptz DEFAULT now(),
  CONSTRAINT produto_anexos_pkey PRIMARY KEY (id),
  CONSTRAINT produto_anexos_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id));"""
A1, A2, A3 = H.U(771), H.U(772), H.U(773)


def before_pre1(pg, pre_do, prod_pre):
    q = lambda s: pg.sql("RESET ROLE;\n" + s)
    q(DDL)
    used = q("SELECT produto_id FROM public.entregas WHERE produto_id IS NOT NULL LIMIT 1") or H.P1
    q(f"INSERT INTO public.produto_anexos(id,produto_id,titulo,url) VALUES ('{A1}','{used}','bula','https://x/a1'),"
      f"('{A2}',NULL,'sem produto','https://x/a2'),('{A3}','{H.P1}','ficha','https://x/a3');")
    H.ANEXOS_USED = used
    prod_do = prod_pre[prod_pre.index("DO $pre$"):prod_pre.index("$pre$;", prod_pre.index("DO $pre$") + 8) + 6]
    r = pg.sql(f"BEGIN;\n{prod_do}\nROLLBACK;", ok=False)
    H.check("HAX-RED", "PRE de PRODUÇÃO sobre estado homolog: aborta fk_unmapped exato (nunca relaxado)", True,
            "fk_unmapped:produto_anexos.produto_id->produtos" in r)
    r = pg.sql(f"BEGIN;\n{pre_do}\nROLLBACK;", ok=False)
    H.check("HAX-GREEN", "PRE homolog-clean: produto_anexos mapeada, sem fk_unmapped", False, "fk_unmapped" in r)
    for cid, ddl, code in [
        ("HAX-D1", "ALTER TABLE public.produto_anexos ADD COLUMN extra text;", "homolog_only_column_drift:produto_anexos"),
        ("HAX-D2", "ALTER TABLE public.produto_anexos ALTER COLUMN titulo SET NOT NULL;", "homolog_only_column_drift:produto_anexos"),
        ("HAX-D3", "ALTER TABLE public.produto_anexos ADD CONSTRAINT x_chk CHECK (url <> '');", "homolog_only_constraint_drift:produto_anexos"),
        ("HAX-D4", "CREATE POLICY p ON public.produto_anexos FOR SELECT USING (true);", "homolog_only_policy_trigger_drift:produto_anexos"),
        ("HAX-D5", "ALTER TABLE public.produto_anexos DROP CONSTRAINT produto_anexos_produto_id_fkey;", "fk_missing:produto_anexos.produto_id->produtos"),
        ("HAX-D6", "DROP TABLE public.produto_anexos;", "homolog_only_missing:produto_anexos"),
    ]:
        r = pg.sql(f"BEGIN; {ddl}\n{pre_do}\nROLLBACK;", ok=False)
        H.check(cid, f"drift homolog-only ({ddl[:60]}): PRE aborta", True, code in r)


def after_mig1(pg):
    q = lambda s: pg.sql("RESET ROLE;\n" + s)
    H.check("HAX-M1", "nenhum anexo aponta para produto sem dono após migração", "0",
            q("SELECT count(*) FROM public.produto_anexos a JOIN public.produtos p ON p.id=a.produto_id WHERE p.owner_organization_id IS NULL"))
    H.check("HAX-M2", "anexo sem produto preservado intacto", "1",
            q(f"SELECT count(*) FROM public.produto_anexos WHERE id='{A2}' AND produto_id IS NULL AND url='https://x/a2'"))
    H.check("HAX-M3", "snapshot integral dos 3 anexos no ledger antes de qualquer remoção", "3|true",
            q("SELECT (detail->>'count')||'|'||(detail->'rows' @> '[{\"url\":\"https://x/a1\"},{\"url\":\"https://x/a3\"}]')::text "
              "FROM platform_private.tenant_catalog_migration_ledger WHERE step='homolog_only_snapshot'"))
    H.check("HAX-M4", "anexos copiados ficam ancorados no produto do tenant (cópia registrada no rowmap)", True,
            int(q("SELECT count(*) FROM platform_private.tenant_catalog_row_map WHERE tbl='produto_anexos'") or 0) >= 1)
    H.check("HAX-M5", "RLS ligado e policies tenant criadas em produto_anexos", "true|5",
            q("SELECT relrowsecurity::text||'|'||(SELECT count(*) FROM pg_policies WHERE tablename='produto_anexos') FROM pg_class WHERE oid='public.produto_anexos'::regclass"))
    H.check("HAX-M6", "TRUNCATE/TRIGGER/REFERENCES de cliente fechados em produto_anexos", "false",
            q("SELECT (has_table_privilege('authenticated','public.produto_anexos','TRUNCATE') OR has_table_privilege('anon','public.produto_anexos','TRUNCATE')"
              " OR has_table_privilege('authenticated','public.produto_anexos','REFERENCES'))::text"))


def enable():
    H.HOMOLOG_FILES = ("homolog-clean/00-pre-global.homolog-clean.sql.review", "homolog-clean/01-migrate.homolog-clean.sql.review")
    H.HOOK_BEFORE_PRE1 = before_pre1
    H.HOOK_AFTER_MIG1 = after_mig1
