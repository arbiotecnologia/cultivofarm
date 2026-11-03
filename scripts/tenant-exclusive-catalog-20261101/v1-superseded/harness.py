#!/usr/bin/env python3
"""PostgreSQL DESCARTÁVEL — catálogo exclusivo por tenant. Zero hosted.

Esquema SINTÉTICO mínimo das tabelas inventariadas (colunas usadas pelo mapeamento), ACL padrão estilo
Supabase, política permissiva antiga, trigger de imutabilidade e trigger desligado para provar restauração
exata. Auth/membership são stubs (classe PG_DISPOSABLE_SYNTHETIC_AUTH) — não é prova JWT/RLS hospedada.
"""
import json, os, pathlib, re, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
PKG = HERE.parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/tenant-catalog-run"); OUT.mkdir(parents=True, exist_ok=True)
LOG = open(OUT / "harness.log", "w")
checks = []


def check(cid, scen, exp, act, kind="PG_DISPOSABLE_SYNTHETIC_AUTH"):
    r = dict(id=cid, scenario=scen, expected=exp, actual=act, status="PASS" if exp == act else "FAIL", kind=kind)
    checks.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)


class PG:
    def __init__(self):
        for v in [k for k in os.environ if k.startswith("PG")]: os.environ.pop(v)
        self.d = tempfile.mkdtemp(prefix="pgtenantcat-"); os.chown(self.d, 1000, 1000)
        self.port = str(58000 + os.getpid() % 900)
        self.as_ = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
        subprocess.run(self.as_ + ["initdb", "-D", f"{self.d}/data", "-U", "postgres", "-A", "trust", "-E", "UTF8"], check=True, capture_output=True)
        subprocess.run(self.as_ + ["pg_ctl", "-D", f"{self.d}/data", "-o", f"-p {self.port} -k {self.d} -c listen_addresses=''",
                                   "-l", f"{self.d}/log", "-w", "start"], check=True, capture_output=True)

    def sql(self, s, ok=True):
        r = subprocess.run(["psql", "-X", "-q", "-At", "-h", self.d, "-p", self.port, "-U", "postgres", "-d", "postgres",
                            "-v", "ON_ERROR_STOP=1"], input=s, text=True, capture_output=True)
        LOG.write(f"--- ok={ok} rc={r.returncode}\n{s[:500]}\n>> {r.stdout[-700:]}{r.stderr[-700:]}\n"); LOG.flush()
        if ok and r.returncode: raise RuntimeError(r.stderr[-2000:])
        return r.stdout.strip() if r.returncode == 0 else "ERR:" + r.stderr.strip()

    def stop(self):
        subprocess.run(self.as_ + ["pg_ctl", "-D", f"{self.d}/data", "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(self.d, ignore_errors=True)


A = "aaaaaaaa-0000-0000-0000-00000000000a"; F = "ffffffff-0000-0000-0000-00000000000f"
UA = "11111111-0000-0000-0000-0000000000a1"; UF = "11111111-0000-0000-0000-0000000000f1"
USA = "11111111-0000-0000-0000-0000000000ff"; UB2B = "11111111-0000-0000-0000-0000000000b2"
P1 = "00000000-0000-0000-0000-0000000000p1".replace("p", "a"); P2 = "00000000-0000-0000-0000-0000000000b2"
P3 = "00000000-0000-0000-0000-0000000000c3"; P4 = "00000000-0000-0000-0000-0000000000d4"
PF = "22222222-0000-0000-0000-00000000000f"; ORD = "33333333-0000-0000-0000-000000000001"
LOTF = "44444444-0000-0000-0000-00000000000f"; CLIF = "55555555-0000-0000-0000-00000000000f"

PROD_FK = "uuid REFERENCES public.produtos(id)"
SCHEMA = f"""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE public.organizations(id uuid PRIMARY KEY, nome text);
CREATE TABLE platform_private.members(user_id uuid, org uuid, mutate boolean);
CREATE FUNCTION platform_private.catalog_tenant_actor(p text) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v uuid; BEGIN
  SELECT org INTO v FROM platform_private.members WHERE user_id = auth.uid() AND (p='read' OR mutate);
  IF v IS NULL THEN RAISE EXCEPTION 'catalog_tenant_forbidden' USING ERRCODE='42501'; END IF; RETURN v; END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_tenant_actor(text) FROM PUBLIC, anon, authenticated;
CREATE TABLE public.produtos(id uuid PRIMARY KEY, nome text NOT NULL, codigo text UNIQUE, descricao text, tipo text, classe_catalogo text,
  familia_catalogo text, modo_acao text, modo_aplicacao text, funcao_completa text, e_insumo boolean, b2b_enabled boolean,
  dose_ml_ha numeric, estoque_minimo numeric, valor_dose_brl numeric, valor_ha_brl numeric, valor_litro_brl numeric,
  ativo boolean DEFAULT true, versao_catalogo text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY legado_leitura_global ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY legado_escrita ON public.produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, commercial_owner_organization_id uuid REFERENCES public.organizations(id));
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY, partner_id uuid REFERENCES public.partner_accounts(id));
CREATE TABLE public.partner_simulations(id uuid PRIMARY KEY, partner_id uuid);
CREATE TABLE public.clientes(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE public.registros_consultor(id uuid PRIMARY KEY, cliente_id uuid);
CREATE TABLE public.microrganismos(id uuid PRIMARY KEY, nome text, product_id {PROD_FK});
CREATE TABLE public.lotes(id uuid PRIMARY KEY, organization_id uuid, produto_id {PROD_FK});
CREATE TABLE public.entregas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, produto_id {PROD_FK});
CREATE TABLE public.ordens_servico(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, produto_id {PROD_FK});
CREATE TABLE public.programacao_producao(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, produto_id {PROD_FK});
CREATE TABLE public.catalog_tenant_visibility(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, produto_id {PROD_FK});
CREATE TABLE public.commercial_condition_item_prices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid, product_id {PROD_FK});
CREATE TABLE public.commercial_price_rules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid, product_id {PROD_FK});
CREATE TABLE public.partner_product_prices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid, product_id {PROD_FK});
CREATE TABLE public.partner_order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, product_id {PROD_FK}, qty numeric);
CREATE TABLE public.partner_simulation_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), simulation_id uuid, product_id {PROD_FK});
CREATE TABLE public.estoque_produto(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lote_id uuid, reservado_para_partner_id uuid, produto_id {PROD_FK});
CREATE TABLE public.estoque_embalagens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lote_id uuid, entrega_id uuid, cliente_id uuid, produto_id {PROD_FK});
CREATE TABLE public.produto_etiquetas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lote_id uuid, entrega_id uuid, cliente_id uuid, produto_id {PROD_FK});
CREATE TABLE public.os_faturamento_base(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ordem_servico_id uuid, cliente_id uuid, produto_id {PROD_FK});
CREATE TABLE public.ordens_servico_onfarm(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente_id uuid, produto_id {PROD_FK});
CREATE TABLE public.registros_consultor_recomendacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registro_consultor_id uuid, produto_biologico_sugerido_id {PROD_FK});
CREATE TABLE public.commercial_campaign_products(campaign_id uuid, product_id {PROD_FK});
CREATE TABLE public.product_fiscal_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id {PROD_FK}, is_active boolean, ncm text);
CREATE UNIQUE INDEX pfp_one_active ON public.product_fiscal_profiles(product_id) WHERE is_active;
CREATE TABLE public.product_technical_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), produto_id {PROD_FK});
CREATE TABLE public.produto_composicao_conjuntos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), produto_id {PROD_FK});
CREATE TABLE public.produto_conformidade_perfis(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), produto_id {PROD_FK});
CREATE TABLE public.product_crop_recommendations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), produto_id {PROD_FK});
CREATE TABLE public.product_target_recommendations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), produto_id {PROD_FK});
CREATE TABLE public.cq_parametros_referencia(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), produto_id {PROD_FK});
CREATE TABLE public.catalogo_volumes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), produto_id {PROD_FK});
CREATE TABLE public.formulacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), produto_id {PROD_FK}, component_insumo_id {PROD_FK});
-- triggers atuais sintéticos: item de pedido selado (bloqueia UPDATE) e trigger já desligado em lotes
CREATE FUNCTION public.poi_sealed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'partner_order_item_sealed'; END $$;
CREATE TRIGGER a10_poi_sealed BEFORE UPDATE ON public.partner_order_items FOR EACH ROW EXECUTE FUNCTION public.poi_sealed();
CREATE FUNCTION public.lote_noop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER z_lote_disabled BEFORE UPDATE ON public.lotes FOR EACH ROW EXECUTE FUNCTION public.lote_noop();
ALTER TABLE public.lotes DISABLE TRIGGER z_lote_disabled;
-- catálogo global atual (stub do escritor) concedido como hoje
CREATE FUNCTION public.platform_create_global_product(p jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
GRANT EXECUTE ON FUNCTION public.platform_create_global_product(jsonb) TO authenticated;
"""

DATA = f"""
INSERT INTO public.organizations VALUES ('{A}','AR Bio'),('{F}','FSF Agro');
INSERT INTO platform_private.members VALUES ('{UA}','{A}',true),('{UF}','{F}',true),('{UB2B}','{F}',false);
INSERT INTO public.partner_accounts VALUES ('{PF}','{A}');           -- parceiro FSF dentro da AR Bio
INSERT INTO public.partner_orders VALUES ('{ORD}','{PF}');
INSERT INTO public.clientes VALUES ('{CLIF}','{F}');
INSERT INTO public.produtos(id,nome,codigo,valor_ha_brl) VALUES ('{P1}','Bio X','BX',100),('{P2}','Sem uso','SU',1),
  ('{P3}','Só FSF','SF',2),('{P4}','Insumo Y','IY',3);
INSERT INTO public.partner_order_items(order_id,product_id,qty) VALUES ('{ORD}','{P1}',3);
INSERT INTO public.partner_product_prices(partner_id,product_id) VALUES ('{PF}','{P1}');
INSERT INTO public.lotes VALUES ('{LOTF}','{F}','{P1}');
INSERT INTO public.estoque_produto(lote_id,produto_id) VALUES ('{LOTF}','{P1}');
INSERT INTO public.entregas(organization_id,produto_id) VALUES ('{F}','{P3}');
INSERT INTO public.ordens_servico_onfarm(cliente_id,produto_id) VALUES ('{CLIF}','{P3}');
INSERT INTO public.product_fiscal_profiles(product_id,is_active,ncm) VALUES ('{P1}',true,'31010000');
INSERT INTO public.formulacoes(produto_id,component_insumo_id) VALUES ('{P1}','{P4}');
INSERT INTO public.microrganismos VALUES (gen_random_uuid(),'M1','{P3}');
"""


def as_user(uid, role="authenticated"): return f"SET ROLE {role}; SET test.uid='{uid or ''}';\n"
def val(r): return r.splitlines()[-1] if r and not r.startswith("ERR") else r


def main():
    pre = (PKG / "00-pre-global.sql.review").read_text()
    mig = (PKG / "01-migrate.sql.review").read_text()
    pre_do = pre[pre.index("DO $pre$"):pre.index("$pre$;", pre.index("DO $pre$") + 8) + 6]
    pg = PG()
    try:
        pg.sql(SCHEMA); pg.sql(DATA)
        r = pg.sql(pre, ok=False); check("PRE-1", "PRE aprova estado sintético coerente (READ ONLY)", "OK", "OK" if not r.startswith("ERR") else r)
        r = pg.sql(f"BEGIN; CREATE TABLE public.zz(p {PROD_FK});\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-2", "FK real não mapeada aborta PRE", True, "fk_unmapped:zz.p" in r)
        r = pg.sql(f"BEGIN; ALTER TABLE public.produtos ADD COLUMN owner_organization_id uuid;\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-3", "instalação parcial detectada", True, "partial:produtos.owner_organization_id" in r)
        r = pg.sql(f"BEGIN; CREATE UNIQUE INDEX px ON public.produtos(lower(nome));\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-4", "índice único por expressão aborta (não reescrito às cegas)", True, "unique_expr_or_partial" in r)
        r = pg.sql(f"BEGIN; ALTER FUNCTION platform_private.catalog_tenant_actor(text) RENAME TO cta_x;\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-5", "dependência canônica ausente aborta", True, "dep:catalog_tenant_actor" in r)
        # tenant não resolvível => aborta tudo, sem mudança
        pg.sql(f"INSERT INTO public.commercial_campaign_products VALUES (gen_random_uuid(),'{P1}');")
        r = pg.sql(mig, ok=False)
        check("MIG-0", "referência sem tenant (campanha) aborta migração inteira", True, "tenant_catalog_unresolved_tenant" in r)
        check("MIG-0b", "aborto não deixa coluna/mapa (transação única)", "0|false",
              pg.sql("SELECT (SELECT count(*) FROM pg_attribute WHERE attrelid='public.produtos'::regclass AND attname='owner_organization_id')||'|'||(to_regclass('platform_private.tenant_catalog_product_map') IS NOT NULL)"))
        pg.sql("DELETE FROM public.commercial_campaign_products;")
        r = pg.sql(mig, ok=False); check("MIG-1", "migração transacional completa", "OK", "OK" if not r.startswith("ERR") else r[-600:])
        q = lambda s: pg.sql("RESET ROLE;\n" + s)
        check("MIG-2", "cópias independentes: P1×2 (A,F), P3×1 (F), P4×2; sem global", "5|0",
              q("SELECT count(*)||'|'||count(*) FILTER (WHERE owner_organization_id IS NULL) FROM public.produtos"))
        check("MIG-3", "produto sem uso não recebe dono inventado (removido e registrado)", "1",
              q("SELECT detail->>'unused' FROM platform_private.tenant_catalog_migration_ledger WHERE step='global_removed'"))
        check("MIG-4", "item do pedido do parceiro FSF aponta para cópia da AR Bio (vendedor)", A,
              q("SELECT p.owner_organization_id FROM public.partner_order_items i JOIN public.produtos p ON p.id=i.product_id"))
        check("MIG-5", "lote/estoque do tenant FSF apontam para cópia FSF", f"{F}|{F}",
              q("SELECT (SELECT p.owner_organization_id FROM public.lotes l JOIN public.produtos p ON p.id=l.produto_id)||'|'||(SELECT p.owner_organization_id FROM public.estoque_produto e JOIN public.produtos p ON p.id=e.produto_id)"))
        check("MIG-6", "A e F com cópias distintas do mesmo produto antigo", "2",
              q(f"SELECT count(DISTINCT new_product_id) FROM platform_private.tenant_catalog_product_map WHERE old_product_id='{P1}'"))
        check("MIG-7", "perfil fiscal copiado por tenant (1 ativo por cópia)", "2",
              q("SELECT count(*) FROM public.product_fiscal_profiles"))
        check("MIG-8", "componente da formulação no mesmo tenant do produto pai", "0",
              q("SELECT count(*) FROM public.formulacoes f JOIN public.produtos a ON a.id=f.produto_id JOIN public.produtos b ON b.id=f.component_insumo_id WHERE a.owner_organization_id<>b.owner_organization_id"))
        check("MIG-9", "microrganismo global: referência anulada e registrada", "0|1",
              q("SELECT (SELECT count(*) FROM public.microrganismos WHERE product_id IS NOT NULL)||'|'||(SELECT count(*) FROM platform_private.tenant_catalog_migration_ledger WHERE step='reference_nullified')"))
        check("MIG-10", "triggers restaurados exatamente (selado O, desligado D)", "O|D",
              q("SELECT (SELECT tgenabled FROM pg_trigger WHERE tgname='a10_poi_sealed')::text||'|'||(SELECT tgenabled FROM pg_trigger WHERE tgname='z_lote_disabled')::text"))
        r = q("UPDATE public.partner_order_items SET qty=4;") if False else pg.sql("UPDATE public.partner_order_items SET qty=4;", ok=False)
        check("MIG-11", "imutabilidade do item selado volta a valer", True, "partner_order_item_sealed" in r)
        check("MIG-12", "códigos únicos agora por tenant (BX existe em A e F)", "2", q("SELECT count(*) FROM public.produtos WHERE codigo='BX'"))
        check("MIG-13", "ownership NOT NULL", "NO", q("SELECT is_nullable FROM information_schema.columns WHERE table_name='produtos' AND column_name='owner_organization_id'"))
        check("MIG-14", "políticas legadas substituídas", "tenant_produtos_select", q("SELECT string_agg(policyname,',') FROM pg_policies WHERE tablename='produtos'"))
        # acesso
        check("ACL-1", "admin A vê só produtos da A", "2|0",
              val(pg.sql(as_user(UA) + f"SELECT count(*)||'|'||count(*) FILTER (WHERE owner_organization_id<>'{A}') FROM public.produtos;")))
        check("ACL-2", "usuário FSF (inclusive comprador B2B) não lê catálogo da AR Bio diretamente", "0",
              val(pg.sql(as_user(UB2B) + f"SELECT count(*) FROM public.produtos WHERE owner_organization_id='{A}';")))
        check("ACL-3", "Superadmin sem tenant: zero linhas (sem bypass global)", "0", val(pg.sql(as_user(USA) + "SELECT count(*) FROM public.produtos;")))
        r = pg.sql(as_user(None, "anon") + "SELECT count(*) FROM public.produtos;", ok=False); check("ACL-4", "anon negado", True, "permission denied" in r)
        r = pg.sql(as_user(UA) + "INSERT INTO public.produtos(id,nome,owner_organization_id) VALUES (gen_random_uuid(),'Direto','" + A + "');", ok=False)
        check("ACL-5", "escrita direta negada (só RPC)", True, "permission denied" in r)
        r = pg.sql(as_user(UA) + "SELECT public.platform_create_global_product('{}');", ok=False)
        check("ACL-6", "escritor do catálogo global fechado no servidor", True, "permission denied" in r)
        r = pg.sql(as_user(UA) + "SELECT count(*) FROM public.product_fiscal_profiles;")
        check("ACL-7", "descendente (perfil fiscal) restrito ao tenant", "1", val(r))
        # RPC
        def save(uid, pid, payload, exp, key):
            return pg.sql(as_user(uid) + f"SELECT public.tenant_product_save({pid},'{json.dumps(payload)}'::jsonb,{exp},'{key}')::text;", ok=False)
        K = lambda n: f"00000000-0000-0000-0000-{n:012d}"
        r = save(UA, "NULL", {"nome": "Novo Bio", "valor_ha_brl": 10}, "NULL", K(1)); check("RPC-1", "admin A cria produto próprio", True, '"replayed": false' in r)
        pa = json.loads(val(r))
        r = save(UF, "NULL", {"nome": "Novo Bio"}, "NULL", K(2)); check("RPC-2", "mesmo nome em outro tenant permitido", True, '"replayed": false' in r)
        r = save(UA, "NULL", {"nome": "novo bio "}, "NULL", K(3)); check("RPC-3", "duplicado no mesmo tenant (normalizado) negado", True, "tenant_product_duplicate_name" in r)
        r = save(UA, "NULL", {"nome": "Novo Bio", "valor_ha_brl": 10}, "NULL", K(1)); check("RPC-4", "replay mesma chave devolve recibo", True, '"replayed": true' in r)
        r = save(UA, "NULL", {"nome": "Outro"}, "NULL", K(1)); check("RPC-5", "mesma chave com payload diferente negada", True, "idempotency_conflict" in r)
        r = save(UF, f"'{pa['product_id']}'", {"nome": "Hack"}, f"'{pa['updated_at']}'", K(4)); check("RPC-6", "outro tenant não altera (não encontrado)", True, "tenant_product_not_found" in r)
        r = save(UA, f"'{pa['product_id']}'", {"nome": "X2"}, "'2000-01-01T00:00:00Z'", K(5)); check("RPC-7", "CAS obsoleto => PT409", True, "version_conflict" in r)
        r = save(UA, f"'{pa['product_id']}'", {"nome": "X2"}, "NULL", K(6)); check("RPC-8", "CAS ausente => PT409", True, "cas_required" in r)
        r = save(UA, "NULL", {"nome": "Z", "owner_organization_id": F}, "NULL", K(7)); check("RPC-9", "tenant no payload proibido", True, "field_forbidden" in r)
        r = save(UA, "NULL", {"nome": "Neg", "valor_ha_brl": -1}, "NULL", K(8)); check("RPC-10", "valor negativo negado", True, "out_of_range" in r)
        r = save(UA, f"'{pa['product_id']}'", {"descricao": "ok"}, f"'{pa['updated_at']}'", K(9)); check("RPC-11", "edição com CAS correto", True, '"replayed": false' in r)
        up = json.loads(val(r))
        r = pg.sql(as_user(UA) + f"SELECT public.tenant_product_set_archived('{pa['product_id']}',true,'{up['updated_at']}','{K(10)}')::text;", ok=False)
        check("RPC-12", "arquivamento com CAS", True, '"ativo": false' in r)
        check("RPC-13", "lista padrão oculta arquivados", "2", val(pg.sql(as_user(UA) + "SELECT count(*) FROM public.tenant_product_list();")))
        check("RPC-14", "lista com arquivados", "3", val(pg.sql(as_user(UA) + "SELECT count(*) FROM public.tenant_product_list(true);")))
        r = save(USA, "NULL", {"nome": "SA"}, "NULL", K(11)); check("RPC-15", "Superadmin sem tenant negado (sem bypass)", True, "catalog_tenant_forbidden" in r)
        r = save(UB2B, "NULL", {"nome": "B2B"}, "NULL", K(12)); check("RPC-16", "membro sem permissão de gestão negado", True, "catalog_tenant_forbidden" in r)
        r = pg.sql(as_user(None, "anon") + f"SELECT public.tenant_product_save(NULL,'{{}}',NULL,'{K(13)}');", ok=False); check("RPC-17", "anon sem EXECUTE", True, "permission denied" in r)
        r = pg.sql("RESET ROLE; UPDATE public.produtos SET owner_organization_id='" + F + "' WHERE owner_organization_id='" + A + "';", ok=False)
        check("RPC-18", "dono imutável mesmo para owner/service", True, "tenant_product_owner_immutable" in r)
        r = pg.sql("RESET ROLE; DELETE FROM public.tenant_product_audit;", ok=False); check("RPC-19", "auditoria imutável", True, "tenant_product_audit_immutable" in r)
        check("RPC-20", "auditoria registra create/update/archive", "archive,create,update",
              q("SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM public.tenant_product_audit"))
        r = pg.sql(mig, ok=False); check("MIG-15", "reexecução bloqueada pelo PRE (sem dupla migração)", True, "partial:" in r)
    finally:
        pg.stop()
    s = dict(PASS=sum(c["status"] == "PASS" for c in checks), FAIL=sum(c["status"] == "FAIL" for c in checks))
    (OUT / "checks.json").write_text(json.dumps(checks, indent=1, ensure_ascii=False)); (OUT / "summary.json").write_text(json.dumps(s)); print(json.dumps(s))


if __name__ == "__main__":
    main()
