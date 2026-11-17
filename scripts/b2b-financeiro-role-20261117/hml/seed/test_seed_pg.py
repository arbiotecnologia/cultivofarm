#!/usr/bin/env python3
"""Bateria descartável de 04/05/06a/06/07. Esquema MÍNIMO sintético imitando guardas HML (bloqueio homolog, no-delete,
auditoria): prova a mecânica e as recusas, NÃO que os gatilhos reais do HML aceitem o seed."""
import json, os, re, shutil, subprocess, tempfile
from pathlib import Path
D = Path(__file__).resolve().parent; TMP = Path(tempfile.mkdtemp(prefix="qaseed-", dir="/tmp")); TMP.chmod(0o777)
os.environ["PATH"] = str(Path(shutil.which("initdb")).resolve().parent) + os.pathsep + os.environ["PATH"]
PRIV = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
PORT = "55691"; R = []
def psql(sql, user="postgres", err=None):
    c = subprocess.run(["psql", "-X", "-h", str(TMP), "-p", PORT, "-U", user, "-qAt", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], input=sql, text=True, capture_output=True)
    if err is not None:
        assert c.returncode != 0 and err in c.stderr, (err, c.stdout[-2000:], c.stderr[-2000:]); return c.stderr
    assert c.returncode == 0, c.stderr[-3000:]; return c.stdout.strip()
def ok(n): R.append({"name": n, "status": "PASS"}); print("PASS", n)
A, C, BIZ = "525fea87-e27e-43f7-af7b-a30064188332", "85ba8b71-8514-4ec9-90d3-bfc7ab3ed214", "00000000-0000-0000-0000-0000000000ff"
PA, PB, PC, PX = "cdb78993-89e4-48db-956e-f40b014a8146", "9d53f280-f828-4af8-a08c-3574263dc466", "6100c3ac-ff5b-4596-a0e3-92665a5dcaab", "00000000-0000-0000-0000-00000000abcd"
U = ["7d15eddb-38b6-43dd-bbf5-43936155321d", "5db79a8e-82af-419d-ae66-87a98c02fbec", "c3ed723f-1017-478e-99b2-25b48b3ab77e", "1d0ea582-1d46-4152-8fbe-f425c74942c1", "51652ab6-da23-4a3d-8f29-417af15cc761"]
REAL = "30000000-0000-0000-0000-000000000009"
OV = ["019fe16e-4a05-4ca1-8480-c2727b92dfa2", "d69bf60a-faa2-4cc0-80df-fd8dc913e9e9", "1aca4276-7043-4616-8dd5-839d2e4e86de", "1eac8c31-6b09-43fd-bbec-e523a812e6ba"]
SU = ["fcb4c72d-2040-4bbc-98fd-145f1463ec04", "2624ff4a-c4dd-4885-af23-beb8463d2209"]
SCHEMA = f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE qa_other LOGIN;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE SCHEMA platform_private; GRANT USAGE ON SCHEMA platform_private, public TO qa_other;
CREATE TABLE public.organizations(id uuid PRIMARY KEY, nome text);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, razao_social text NOT NULL, deleted_at timestamptz, commercial_owner_organization_id uuid REFERENCES public.organizations);
CREATE TABLE public.partner_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, partner_id uuid REFERENCES public.partner_accounts, papel text, tenant_id uuid);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, nome text);
CREATE TABLE public.financial_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, type text, active boolean DEFAULT true, created_at timestamptz DEFAULT now());
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY, numero text, partner_id uuid NOT NULL REFERENCES public.partner_accounts, subtotal numeric, total numeric, observacoes text, payment_terms_id uuid, internal_economic_snapshot jsonb);
CREATE TABLE public.accounts_receivable(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), origin_type text NOT NULL, origin_id uuid, description text NOT NULL, category_id uuid NOT NULL REFERENCES public.financial_categories,
 total_amount numeric NOT NULL, issue_date date, first_due_date date NOT NULL, installment_count int, partner_id uuid, organization_id uuid, notes text, fiscal_invoice_required boolean);
CREATE TABLE public.accounts_receivable_installments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receivable_id uuid NOT NULL REFERENCES public.accounts_receivable, installment_number int NOT NULL, due_date date NOT NULL,
 original_amount numeric NOT NULL, received_amount numeric DEFAULT 0, discount_amount numeric DEFAULT 0, interest_amount numeric DEFAULT 0, penalty_amount numeric DEFAULT 0, net_amount numeric NOT NULL, organization_id uuid);
CREATE TABLE public.partner_order_payment_terms(id uuid PRIMARY KEY, partner_order_id uuid NOT NULL REFERENCES public.partner_orders ON DELETE CASCADE, plan_name_snapshot text NOT NULL, plan_code_snapshot text NOT NULL,
 discount_percent_snapshot numeric NOT NULL, monthly_interest_percent_snapshot numeric NOT NULL, months_count_snapshot numeric NOT NULL, installment_count int, first_due_date date NOT NULL, table_amount numeric,
 discount_amount numeric, net_amount_after_discount numeric, financial_interest_amount numeric, final_amount numeric, approval_status text);
CREATE TABLE public.partner_order_payment_schedule(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid NOT NULL REFERENCES public.partner_orders ON DELETE CASCADE, payment_terms_id uuid NOT NULL,
 installment_number int NOT NULL, due_date date NOT NULL, amount numeric(14,2) NOT NULL, principal_amount numeric(14,2), interest_amount numeric(14,2), status text NOT NULL DEFAULT 'planned', receivable_installment_id uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.partner_order_financial_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid NOT NULL REFERENCES public.partner_orders, partner_id uuid NOT NULL, receivable_id uuid NOT NULL REFERENCES public.accounts_receivable);
CREATE TABLE public.partner_financial_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partner_accounts, credit_limit numeric);
CREATE TABLE public.saas_plans(id uuid PRIMARY KEY, key text, name text, active boolean);
CREATE TABLE public.saas_plan_versions(id uuid PRIMARY KEY, plan_id uuid REFERENCES public.saas_plans, status text);
CREATE TABLE public.organization_subscriptions(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations, plan_version_id uuid REFERENCES public.saas_plan_versions);
CREATE TABLE public.organization_subscription_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid REFERENCES public.organization_subscriptions, organization_id uuid, reason text);
CREATE TABLE public.organization_feature_overrides(id uuid PRIMARY KEY, organization_id uuid REFERENCES public.organizations, reason text);
CREATE TABLE public.organization_feature_override_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), override_id uuid, organization_id uuid, action text);
CREATE TABLE public.financial_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text NOT NULL, entity_id uuid NOT NULL, action text NOT NULL, old_data jsonb, new_data jsonb, performed_by uuid, reason text);
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
 INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data) VALUES (TG_TABLE_NAME, coalesce(NEW.id, OLD.id), TG_OP, to_jsonb(coalesce(NEW, OLD))); RETURN coalesce(NEW, OLD); END $$;
CREATE TRIGGER h6d BEFORE DELETE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.fn_h6d_block_hard_delete();
CREATE TRIGGER h6d BEFORE DELETE ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION public.fn_h6d_block_hard_delete();
CREATE TRIGGER audit AFTER INSERT OR DELETE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();
CREATE TRIGGER nd BEFORE DELETE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
CREATE TRIGGER nd BEFORE DELETE ON public.organization_subscription_history FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
CREATE TRIGGER nd BEFORE DELETE ON public.organization_feature_override_audit FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
CREATE TRIGGER nd BEFORE DELETE ON public.financial_audit_log FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
CREATE TRIGGER nd BEFORE DELETE ON public.saas_plan_versions FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
INSERT INTO public.organizations VALUES ('{A}','QA A'),('{C}','QA C'),('{BIZ}','Negócio');
INSERT INTO public.financial_categories(name,type) VALUES ('Receita ref','RECEITA');
INSERT INTO public.partner_accounts VALUES ('{PA}','Parceiro QA A',NULL,'{A}'),('{PB}','Parceiro QA B',NULL,'{A}'),('{PC}','Parceiro QA C',NULL,'{C}'),('{PX}','Parceiro de negócio',NULL,'{BIZ}');
INSERT INTO auth.users SELECT u::uuid, 'qa'||n||'@x' FROM unnest('{{{",".join(U)}}}'::text[]) WITH ORDINALITY t(u,n); INSERT INTO auth.users VALUES ('{REAL}','real@cliente');
INSERT INTO public.profiles SELECT u::uuid, CASE WHEN u='{U[2]}' THEN '{C}'::uuid ELSE '{A}'::uuid END, 'QA' FROM unnest('{{{",".join(U)}}}'::text[]) u; INSERT INTO public.profiles VALUES ('{REAL}','{BIZ}','Real');
INSERT INTO public.partner_users(user_id, partner_id, papel, tenant_id) VALUES ('{U[0]}','{PA}','financeiro','{A}'),('{U[1]}','{PB}','financeiro','{A}'),('{U[2]}','{PC}','financeiro','{C}'),('{U[3]}','{PA}','gestor','{A}'),('{U[4]}','{PA}','tecnico','{A}');
INSERT INTO public.saas_plans VALUES ('7e570000-0000-4000-8000-0000000000a1','gratuito','Gratuito',true),('78000000-0000-4f00-8127-000000000001','qa_outro','QA outro',true);
INSERT INTO public.saas_plan_versions VALUES ('7e570000-0000-4000-8000-0000000000b1','7e570000-0000-4000-8000-0000000000a1','PUBLISHED');
"""
SAAS = f"""INSERT INTO public.organization_subscriptions VALUES ('{SU[0]}','{A}','7e570000-0000-4000-8000-0000000000b1'),('{SU[1]}','{C}','7e570000-0000-4000-8000-0000000000b1');
INSERT INTO public.organization_subscription_history(subscription_id, organization_id, reason) SELECT id, organization_id, 'QA-FIN-20261117: massa ficticia autorizada, somente homologacao' FROM public.organization_subscriptions;
INSERT INTO public.organization_feature_overrides VALUES ('{OV[0]}','{A}','QA-FIN-20261117: teste ficticio autorizado de isolamento'),('{OV[1]}','{C}','QA-FIN-20261117: t'),('{OV[2]}','{A}','QA-FIN-20261117: t'),('{OV[3]}','{C}','QA-FIN-20261117: t');
INSERT INTO public.organization_feature_override_audit(override_id, organization_id, action) SELECT id, organization_id, 'grant' FROM public.organization_feature_overrides;"""
BUSINESS = """ALTER TABLE public.accounts_receivable DISABLE TRIGGER a_homolog;  -- só no banco descartável: linha de negócio pré-existente
INSERT INTO public.accounts_receivable(origin_type, description, category_id, total_amount, first_due_date, installment_count, partner_id, organization_id)
 SELECT 'MANUAL','Negócio real', (SELECT id FROM public.financial_categories), 10, current_date, 1, '%s', '%s';
ALTER TABLE public.accounts_receivable ENABLE TRIGGER a_homolog;""" % (PX, BIZ)
F = {n: (D / n).read_text() for n in ["04-register-saas-hml.sql.review", "05-seed-hml.sql.review", "06a-cleanup-dryrun-hml.sql.rollback", "06-cleanup-hml.sql.review", "07-verify-clean-hml.sql.readonly"]}
REG, SEED, DRY, CLEAN, VER = F.values()
MD5 = "SELECT string_agg(md5(prosrc)||md5(pg_get_functiondef(oid)), ',' ORDER BY proname) FROM pg_proc WHERE proname IN ('homolog_validation_block_receivable_insert','fn_h6d_block_hard_delete','saas_no_delete','fn_financial_audit');"
SNAP = "SELECT (SELECT count(*) FROM public.accounts_receivable)||','||(SELECT count(*) FROM public.accounts_receivable_installments)||','||(SELECT count(*) FROM public.financial_audit_log)||','||(SELECT count(*) FROM public.partner_accounts)||','||(SELECT count(*) FROM public.saas_plans)||','||(SELECT count(*) FROM public.saas_plan_versions)||','||(SELECT count(*) FROM public.organizations)||','||(SELECT count(*) FROM auth.users);"
def digest(out):
    m = re.search(r"^QA_CLEAN_DIGEST\|(\w+)\|(\d+)$", out, re.M); assert m, out[-1500:]; return m.group(1), int(m.group(2))
def refusals(out): return [l for l in out.splitlines() if l.startswith("QA_CLEAN_REFUSALS|")]
try:
    subprocess.run(PRIV + ["initdb", "-D", str(TMP/"d"), "-U", "postgres", "-A", "trust"], check=True, capture_output=True)
    subprocess.run(PRIV + ["pg_ctl", "-D", str(TMP/"d"), "-l", str(TMP/"log"), "-o", f"-k {TMP} -h \"\" -p {PORT}", "start", "-w"], check=True, capture_output=True)
    psql("CREATE TABLE public.organizations(id uuid);"); psql(REG, err="impressão digital HML ausente"); psql("DROP TABLE public.organizations;"); ok("recusa alvo sem impressão digital HML (produção)")
    psql(SCHEMA); psql(BUSINESS); base_md5 = psql(MD5)
    psql(SEED, err="QA_SEED_REFUSED: rodar 04"); psql(REG, err="assinaturas QA ausentes"); ok("05 exige 04; 04 exige SaaS QA existente")
    psql(SAAS); psql(REG, user="qa_other", err="session_user"); out = psql(REG); assert "QA_SAAS_REGISTERED|6" in out, out
    psql(REG, err="seed anterior existe"); ok("04 registra 2 assinaturas + 4 overrides uma única vez")
    base = psql(SNAP)
    psql("CREATE FUNCTION public.boom() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'GUARD_REAL_X'; END$$; CREATE TRIGGER boom BEFORE INSERT ON public.partner_order_financial_links FOR EACH ROW EXECUTE FUNCTION public.boom();")
    psql(SEED, err="GUARD_REAL_X"); assert psql(MD5) == base_md5 and psql(SNAP) == base
    psql("DROP TRIGGER boom ON public.partner_order_financial_links;"); ok("guarda real recusa -> rollback total, exceção nunca persiste")
    out = psql(SEED); assert psql(MD5) == base_md5
    tj = json.loads([l for l in out.splitlines() if l.startswith("QA_TITLES_JSON|")][0].split("|", 1)[1])
    assert set(tj) == {"A", "B", "C"} and all(len(v) == 1 and len(v[0]["installments"]) == 2 for v in tj.values()); ok("seed cria títulos A/B/C com pedido, 2 parcelas e vínculo")
    assert psql("SELECT count(*) FROM public.partner_order_payment_terms")=="3" and psql("SELECT count(*) FROM public.partner_order_payment_schedule WHERE receivable_installment_id IS NOT NULL")=="6"
    assert psql("SELECT count(*) FROM public.financial_audit_log WHERE entity_type='accounts_receivable_installments' AND action='INSERT'")=="6"
    assert psql("SELECT count(*) FROM public.partner_orders WHERE internal_economic_snapshot->>'schema_version'='1' AND internal_economic_snapshot->>'qa_fixture'='true' AND jsonb_array_length(internal_economic_snapshot->'schedule')=2")=="3"
    assert psql("SELECT to_regprocedure('qa_b2bfin.seed_legacy_origin(uuid,uuid,uuid,uuid,text)') IS NULL")=="t"; ok("origem legada fictícia completa (termos, cronograma, snapshot selado, auditoria) e função de seed removida")
    psql("INSERT INTO public.accounts_receivable(origin_type,description,category_id,total_amount,first_due_date,installment_count) SELECT 'X','QA-FIN-intruso',id,1,current_date,1 FROM public.financial_categories;", err="HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED")
    psql("INSERT INTO public.accounts_receivable(origin_type,description,category_id,total_amount,first_due_date,installment_count) SELECT 'X','QA-FIN-intruso',id,1,current_date,1 FROM public.financial_categories;", user="qa_other", err="HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED")
    psql("DELETE FROM public.accounts_receivable_installments;", err="H6D_NO_DELETE"); ok("após seed: bloqueio homolog e no-delete voltam a valer para todos")
    psql(SEED, err="seed anterior existe"); psql("SELECT * FROM qa_b2bfin.manifest", user="qa_other", err="permission denied"); ok("seed não duplica; manifesto fechado")
    seeded = psql(SNAP)
    out = psql(DRY); d, n = digest(out); assert not refusals(out) and n > 0 and psql(SNAP) == seeded and psql(MD5) == base_md5
    plan = [l for l in out.splitlines() if l.startswith("QA_CLEAN_PLAN|")]
    assert not any(x in l for l in plan for x in ("saas_plan", "organizations|", "financial_categories", "Negócio")), plan
    ok(f"dry-run lista {n} linhas (tabela/ID/hash/vínculo), sem recusas e sem alterar nada")
    psql("SET app.qa_cleanup_digest='errado';\n" + CLEAN, err="difere do aprovado"); psql(CLEAN, err="difere do aprovado"); ok("execução exige o digest do dry-run")
    for label, setup, undo, reason in [
        ("ator QA em linha de negócio", f"CREATE TABLE public.notas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid); INSERT INTO public.notas(created_by) VALUES ('{U[0]}');", "DROP TABLE public.notas;", "ator_qa_em_linha_de_negocio"),
        ("coincidência só textual", f"CREATE TABLE public.textos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), corpo text); INSERT INTO public.textos(corpo) VALUES ('menciona {PA}');", "DROP TABLE public.textos;", "referencia_so_textual"),
        ("linha de outro tenant", f"CREATE TABLE public.extra(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid, organization_id uuid); INSERT INTO public.extra(partner_id, organization_id) VALUES ('{PA}','{BIZ}');", "DROP TABLE public.extra;", "outro_tenant"),
        ("plano/versão protegido", f"ALTER TABLE public.saas_plan_versions ADD COLUMN ref uuid; UPDATE public.saas_plan_versions SET ref='{SU[0]}';", "ALTER TABLE public.saas_plan_versions DROP COLUMN ref;", "tabela_protegida")]:
        psql(setup); out = psql(DRY); r = refusals(out); assert any(reason in l for l in r), (label, r, [l for l in out.splitlines() if "notas" in l or "textos" in l or "extra" in l])
        d2, _ = digest(out); psql(f"SET app.qa_cleanup_digest='{d2}';\n" + CLEAN, err="QA_CLEAN_REFUSED"); assert psql(SNAP) == seeded and psql(MD5) == base_md5
        psql(undo); ok(f"limpeza recusa {label} (dry-run lista, execução aborta sem efeito)")
    out = psql(DRY); d, n = digest(out); assert not refusals(out)
    out = psql(f"SET app.qa_cleanup_digest='{d}';\n" + CLEAN); assert "QA_CLEAN_PASS|5" in out, out[-800:]
    assert psql(MD5) == base_md5 and psql("SELECT to_regnamespace('qa_b2bfin') IS NULL") == "t"
    assert psql(SNAP) == "1,0,1,1,2,1,3,6", psql(SNAP)
    assert psql("SELECT count(*) FROM public.partner_accounts WHERE id='%s'" % PX) == "1" and psql("SELECT nome FROM public.profiles") == "Real"
    for t in ["organization_subscriptions", "organization_subscription_history", "organization_feature_overrides", "organization_feature_override_audit", "partner_users", "partner_orders", "partner_order_payment_terms", "partner_order_payment_schedule", "partner_order_financial_links", "partner_financial_settings"]:
        assert psql(f"SELECT count(*) FROM public.{t}") == "0", t
    ok("limpeza remove toda a massa QA; plano/versão, tenants, negócio e auth intactos; corpos restaurados")
    psql("DELETE FROM public.accounts_receivable;", err="H6D_NO_DELETE"); ok("no-delete restaurado após limpeza")
    v = psql(VER); assert v.startswith("QA_VERIFY|t|0|0|"), v; ok("07 confirma limpo (contas Auth: remover no painel)")
finally:
    subprocess.run(PRIV + ["pg_ctl", "-D", str(TMP/"d"), "stop", "-m", "immediate"], capture_output=True)
    (D / "evidence-seed-local.json").write_text(json.dumps({"synthetic_schema": True, "proves_hml_triggers": False, "results": R}, indent=1, ensure_ascii=False))
print(f"{len(R)} PASS")
