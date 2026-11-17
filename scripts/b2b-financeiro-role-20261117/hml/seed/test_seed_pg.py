#!/usr/bin/env python3
"""Bateria descartável do seed/cleanup QA. Esquema MÍNIMO sintético que imita guardas HML (bloqueio homolog de título,
no-delete h6d/saas, auditoria e geração de parcelas): NÃO prova que os gatilhos reais do HML aceitem o seed."""
import json, os, shutil, subprocess, tempfile
from pathlib import Path
D = Path(__file__).resolve().parent; TMP = Path(tempfile.mkdtemp(prefix="qaseed-", dir="/tmp")); TMP.chmod(0o777)
os.environ["PATH"] = str(Path(shutil.which("initdb")).resolve().parent) + os.pathsep + os.environ["PATH"]
PRIV = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
PORT = "55691"; R = []
def psql(sql, user="postgres", err=None):
    c = subprocess.run(["psql", "-X", "-h", str(TMP), "-p", PORT, "-U", user, "-qAt", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], input=sql, text=True, capture_output=True)
    if err is not None:
        assert c.returncode != 0 and err in c.stderr, (err, c.stdout, c.stderr); return c.stderr
    assert c.returncode == 0, c.stderr; return c.stdout.strip()
def ok(n): R.append({"name": n, "status": "PASS"}); print("PASS", n)
A, C = "525fea87-e27e-43f7-af7b-a30064188332", "85ba8b71-8514-4ec9-90d3-bfc7ab3ed214"
SCHEMA = f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE qa_other LOGIN;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE SCHEMA platform_private; GRANT USAGE ON SCHEMA platform_private, public TO qa_other;
CREATE TABLE public.organizations(id uuid PRIMARY KEY, nome text);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), razao_social text NOT NULL, deleted_at timestamptz, commercial_owner_organization_id uuid REFERENCES public.organizations);
CREATE TABLE public.partner_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, partner_id uuid REFERENCES public.partner_accounts, papel text);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, nome text);
CREATE TABLE public.financial_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, type text, active boolean DEFAULT true, created_at timestamptz DEFAULT now());
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero text, partner_id uuid NOT NULL REFERENCES public.partner_accounts, subtotal numeric, total numeric, observacoes text);
CREATE TABLE public.accounts_receivable(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), origin_type text NOT NULL, origin_id uuid, description text NOT NULL, category_id uuid NOT NULL REFERENCES public.financial_categories,
 total_amount numeric NOT NULL, issue_date date, first_due_date date NOT NULL, installment_count int, partner_id uuid, organization_id uuid, notes text, fiscal_invoice_required boolean);
CREATE TABLE public.accounts_receivable_installments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receivable_id uuid NOT NULL REFERENCES public.accounts_receivable, installment_number int NOT NULL, due_date date NOT NULL,
 original_amount numeric NOT NULL, received_amount numeric DEFAULT 0, net_amount numeric NOT NULL, organization_id uuid);
CREATE TABLE public.partner_order_financial_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid NOT NULL REFERENCES public.partner_orders, partner_id uuid NOT NULL, receivable_id uuid NOT NULL REFERENCES public.accounts_receivable);
CREATE TABLE public.partner_financial_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partner_accounts, credit_limit numeric);
CREATE TABLE public.organization_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations);
CREATE TABLE public.organization_subscription_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid REFERENCES public.organization_subscriptions, organization_id uuid, reason text);
CREATE TABLE public.financial_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), table_name text, record_id uuid, payload jsonb);
GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA public TO qa_other;
CREATE FUNCTION platform_private.homolog_validation_block_receivable_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  RAISE EXCEPTION 'HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED: criacao de titulos desabilitada durante preparacao AR Bio/FSF' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER a_homolog BEFORE INSERT ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION platform_private.homolog_validation_block_receivable_insert();
CREATE FUNCTION public.fn_h6d_block_hard_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'H6D_NO_DELETE'; END $$;
CREATE FUNCTION public.saas_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE x int; BEGIN RAISE EXCEPTION 'SAAS_NO_DELETE'; END $$;
CREATE FUNCTION public.fn_financial_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO public.financial_audit_log(table_name, record_id, payload) VALUES (TG_TABLE_NAME, coalesce(NEW.id, OLD.id), to_jsonb(coalesce(NEW, OLD))); RETURN coalesce(NEW, OLD); END $$;
CREATE FUNCTION public.fn_gen_inst() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO public.accounts_receivable_installments(receivable_id, installment_number, due_date, original_amount, net_amount, organization_id)
 SELECT NEW.id, g, NEW.first_due_date + (g-1)*30, NEW.total_amount/NEW.installment_count, NEW.total_amount/NEW.installment_count, NEW.organization_id FROM generate_series(1, NEW.installment_count) g; RETURN NEW; END $$;
CREATE TRIGGER h6d BEFORE DELETE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.fn_h6d_block_hard_delete();
CREATE TRIGGER h6d BEFORE DELETE ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION public.fn_h6d_block_hard_delete();
CREATE TRIGGER audit AFTER INSERT OR DELETE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();
CREATE TRIGGER gen AFTER INSERT ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.fn_gen_inst();
CREATE TRIGGER nd BEFORE DELETE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
CREATE TRIGGER nd BEFORE DELETE ON public.organization_subscription_history FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
CREATE TRIGGER nd BEFORE DELETE ON public.financial_audit_log FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
INSERT INTO public.organizations VALUES ('{A}','QA A'),('{C}','QA C'),('00000000-0000-0000-0000-0000000000ff','Negócio');
INSERT INTO public.financial_categories(name,type) VALUES ('Receita QA-ref','RECEITA');
INSERT INTO public.partner_accounts(id, razao_social, commercial_owner_organization_id) VALUES ('cdb78993-89e4-48db-956e-f40b014a8146','Parceiro QA A','{A}'),('9d53f280-f828-4af8-a08c-3574263dc466','Parceiro QA B','{A}'),('6100c3ac-ff5b-4596-a0e3-92665a5dcaab','Parceiro QA C','{C}'),('d7edc250-25a4-4ee2-8b62-27c1645cdfc0','Parceiro de negócio','00000000-0000-0000-0000-0000000000ff');
INSERT INTO auth.users VALUES ('7d15eddb-38b6-43dd-bbf5-43936155321d','fin-a@x'),('1d0ea582-1d46-4152-8fbe-f425c74942c1','gestor-a@x'),('30000000-0000-0000-0000-000000000009','real@cliente');
INSERT INTO public.profiles VALUES ('7d15eddb-38b6-43dd-bbf5-43936155321d','QA'),('1d0ea582-1d46-4152-8fbe-f425c74942c1','QA G'),('30000000-0000-0000-0000-000000000009','Real');
INSERT INTO public.partner_users(user_id, partner_id, papel) VALUES ('7d15eddb-38b6-43dd-bbf5-43936155321d','cdb78993-89e4-48db-956e-f40b014a8146','financeiro'),('1d0ea582-1d46-4152-8fbe-f425c74942c1','cdb78993-89e4-48db-956e-f40b014a8146','gestor');
CREATE TABLE public.saas_plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE NOT NULL, name text NOT NULL, description text, active boolean, is_default boolean);
CREATE TABLE public.saas_plan_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES public.saas_plans, status text, features_snapshot jsonb);
CREATE TABLE public.saas_plan_version_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_version_id uuid, action text);
ALTER TABLE public.organization_subscriptions ADD COLUMN plan_version_id uuid REFERENCES public.saas_plan_versions;
CREATE TRIGGER nd BEFORE DELETE ON public.saas_plan_versions FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
INSERT INTO public.saas_plans(id,key,name,active) VALUES ('78000000-0000-4f00-8127-000000000001','qa_outro','QA outro',true),('7e570000-0000-4000-8000-0000000000a1','gratuito','Gratuito',true);
INSERT INTO public.saas_plan_versions(id,plan_id,status) VALUES ('7e570000-0000-4000-8000-0000000000b1','7e570000-0000-4000-8000-0000000000a1','PUBLISHED');
CREATE TABLE public.organization_feature_overrides(id uuid PRIMARY KEY, organization_id uuid REFERENCES public.organizations, reason text);
CREATE TABLE public.organization_feature_override_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), override_id uuid, action text);
CREATE TRIGGER nd BEFORE DELETE ON public.organization_feature_override_audit FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA public TO qa_other;
"""
BUSINESS = """ALTER TABLE public.accounts_receivable DISABLE TRIGGER a_homolog;  -- só no banco descartável: linha de negócio pré-existente
INSERT INTO public.accounts_receivable(origin_type, description, category_id, total_amount, first_due_date, installment_count, partner_id, organization_id)
 SELECT 'MANUAL','Negócio real', (SELECT id FROM public.financial_categories), 10, current_date, 1, id, commercial_owner_organization_id FROM public.partner_accounts WHERE id='d7edc250-25a4-4ee2-8b62-27c1645cdfc0';
ALTER TABLE public.accounts_receivable ENABLE TRIGGER a_homolog;"""
PLAN = (D / "04-register-saas-hml.sql.review").read_text(); SEED = (D / "05-seed-hml.sql.review").read_text(); CLEAN = (D / "06-cleanup-hml.sql.review").read_text()
MD5 = "SELECT md5(prosrc)||'|'||md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname IN ('homolog_validation_block_receivable_insert','fn_h6d_block_hard_delete','saas_no_delete','fn_financial_audit') ORDER BY proname;"
COUNT = "SELECT (SELECT count(*) FROM public.accounts_receivable)||','||(SELECT count(*) FROM public.accounts_receivable_installments)||','||(SELECT count(*) FROM public.partner_order_financial_links)||','||(SELECT count(*) FROM public.financial_audit_log)||','||(SELECT count(*) FROM public.partner_accounts);"
try:
    subprocess.run(PRIV + ["initdb", "-D", str(TMP/"d"), "-U", "postgres", "-A", "trust"], check=True, capture_output=True)
    subprocess.run(PRIV + ["pg_ctl", "-D", str(TMP/"d"), "-l", str(TMP/"log"), "-o", f"-k {TMP} -h \"\" -p {PORT}", "start", "-w"], check=True, capture_output=True)
    # 1) impressão digital: sem a função homolog (como produção) o seed recusa sem efeitos
    psql("CREATE TABLE public.organizations(id uuid);"); psql(SEED, err="QA_SEED_REFUSED: impressão digital HML ausente"); psql("DROP TABLE public.organizations;"); ok("recusa alvo sem impressão digital HML")
    psql(SCHEMA); psql(BUSINESS); base_md5 = psql(MD5); base = psql(COUNT)
    SAAS = """INSERT INTO public.organization_subscriptions(id,organization_id,plan_version_id) SELECT x.id::uuid, x.o::uuid, (SELECT id FROM public.saas_plan_versions LIMIT 1) FROM (VALUES ('fcb4c72d-2040-4bbc-98fd-145f1463ec04','%s'),('2624ff4a-c4dd-4885-af23-beb8463d2209','%s')) x(id,o);
 INSERT INTO public.organization_subscription_history(subscription_id, organization_id, reason) SELECT id, organization_id, 'QA-FIN-20261117: massa ficticia autorizada, somente homologacao' FROM public.organization_subscriptions;
 INSERT INTO public.organization_feature_overrides(id, organization_id, reason) VALUES ('019fe16e-4a05-4ca1-8480-c2727b92dfa2','%s','QA-FIN-20261117: t'),('d69bf60a-faa2-4cc0-80df-fd8dc913e9e9','%s','QA-FIN-20261117: t'),('1aca4276-7043-4616-8dd5-839d2e4e86de','%s','QA-FIN-20261117: t'),('1eac8c31-6b09-43fd-bbec-e523a812e6ba','%s','QA-FIN-20261117: t');
 INSERT INTO public.organization_feature_override_audit(override_id, action) SELECT id, 'grant' FROM public.organization_feature_overrides;""" % (A, C, A, C, A, C)
    psql(SEED, err="QA_SEED_REFUSED: rodar 04"); psql(PLAN, err="QA_SEED_REFUSED: assinaturas QA ausentes"); psql(SAAS)  # massa SaaS que o root criou
    psql(PLAN, user="qa_other", err="QA_SEED_REFUSED: session_user"); psql(PLAN); psql(PLAN, err="QA_SEED_REFUSED: seed anterior existe"); ok("04 registra SaaS QA existente uma vez; 05 exige 04")
    # 2) não-postgres recusado
    psql(SEED, user="qa_other", err="QA_SEED_REFUSED: session_user"); ok("recusa sessão não-postgres")
    # 3) falha no meio: rollback integral e corpo homolog intacto
    psql("CREATE FUNCTION public.boom() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'GUARD_REAL_X'; END$$; CREATE TRIGGER boom BEFORE INSERT ON public.partner_order_financial_links FOR EACH ROW EXECUTE FUNCTION public.boom();")
    psql(SEED, err="GUARD_REAL_X"); assert psql(MD5) == base_md5 and psql(COUNT) == base and psql("SELECT count(*) FROM qa_b2bfin.manifest WHERE kind='receivable'") == "0"
    psql("DROP TRIGGER boom ON public.partner_order_financial_links;"); ok("outra guarda recusa -> rollback total, exceção nunca persiste")
    # 4) seed real
    out = psql(SEED); assert psql(MD5) == base_md5, "corpo não restaurado"
    tj = json.loads([l for l in out.splitlines() if l.startswith("QA_TITLES_JSON|")][0].split("|", 1)[1])
    assert set(tj) == {"A", "B", "C"} and all(len(v) == 1 and len(v[0]["installments"]) == 2 and v[0]["order_id"] for v in tj.values()); ok("seed cria títulos A/B/C com pedido, 2 parcelas e vínculo, manifestados")
    assert psql("SELECT count(*) FROM public.accounts_receivable WHERE description LIKE 'QA-FIN-%'") == "3"; ok("dados não-vazios após seed")
    psql("INSERT INTO public.accounts_receivable(origin_type,description,category_id,total_amount,first_due_date,installment_count) SELECT 'X','QA-FIN-intruso',id,1,current_date,1 FROM public.financial_categories;",
         err="HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED"); ok("após seed o bloqueio homolog volta a valer (postgres sem ticket)")
    psql("INSERT INTO public.accounts_receivable(origin_type,description,category_id,total_amount,first_due_date,installment_count) SELECT 'X','QA-FIN-intruso',id,1,current_date,1 FROM public.financial_categories;",
         user="qa_other", err="HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED"); ok("outro papel continua bloqueado")
    psql("DELETE FROM public.accounts_receivable_installments;", err="H6D_NO_DELETE"); ok("no-delete continua valendo fora da limpeza")
    psql(SEED, err="QA_SEED_REFUSED: seed anterior existe"); ok("seed não duplica")
    psql("ALTER TABLE qa_b2bfin.manifest OWNER TO postgres;"); psql("SELECT * FROM qa_b2bfin.manifest", user="qa_other", err="permission denied"); ok("manifesto inacessível a outros papéis")
    # 5) limpeza: exige negar se semente atingir tabela protegida
    psql("UPDATE public.saas_plans SET description='ref cdb78993-89e4-48db-956e-f40b014a8146' WHERE key='gratuito';")
    psql(CLEAN, err="QA_CLEAN_REFUSED: referência em tabela protegida"); assert psql(MD5) == base_md5
    psql("UPDATE public.saas_plans SET description=NULL WHERE key='gratuito';"); ok("limpeza recusa tocar plano não-QA (rollback)")
    out = psql(CLEAN); assert "QA_CLEAN_PASS" in out
    assert psql(MD5) == base_md5 and psql(COUNT) == "1,1,0,1,1" and psql("SELECT to_regnamespace('qa_b2bfin') IS NULL") == "t", psql(COUNT)
    assert psql("SELECT count(*) FROM public.organization_subscriptions")=="0" and psql("SELECT count(*) FROM public.organizations")=="3" and psql("SELECT nome FROM public.profiles")=="Real" and psql("SELECT count(*) FROM auth.users")=="3"
    assert psql("SELECT string_agg(key,',' ORDER BY key) FROM public.saas_plans")=="gratuito,qa_outro" and psql("SELECT count(*) FROM public.saas_plan_versions")=="1" and psql("SELECT count(*) FROM public.organization_feature_overrides")=="0" and psql("SELECT count(*) FROM public.organization_feature_override_audit")=="0"
    ok("limpeza remove títulos/parcelas/vínculos/pedidos/auditoria/assinaturas/parceiros/perfis QA; negócio, tenants e auth intactos; corpos restaurados")
    psql("DELETE FROM public.accounts_receivable;", err="H6D_NO_DELETE"); ok("no-delete restaurado após limpeza")
    v = psql((D / "07-verify-clean-hml.sql.readonly").read_text()); assert v.startswith("QA_VERIFY|t|0|0|0|0|0|2|0|"), v; ok("07 verifica limpo (auth qa-fin restante = remover via Admin API)")
finally:
    subprocess.run(PRIV + ["pg_ctl", "-D", str(TMP/"d"), "stop", "-m", "immediate"], capture_output=True)
    (D / "evidence-seed-local.json").write_text(json.dumps({"synthetic_schema": True, "proves_hml_triggers": False, "results": R}, indent=1, ensure_ascii=False))
print(f"{len(R)} PASS")
