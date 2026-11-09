#!/usr/bin/env python3
"""B4 somente local sobre B3 REAL instalado no PG descartável. Sem rede/hosted/JWT real."""
import concurrent.futures
import hashlib
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
from decimal import Decimal

H = pathlib.Path(__file__).resolve().parent.parents[1]
ROOT = H.parents[2]
B3DIR = ROOT / "scripts/b2b-payment-condition-v1-rebase-20261106"
CAPTURE = ROOT / "scripts/delivery-atomic-hardening-20261030/capture/current.json"
MONEY = ROOT / "scripts/financial-installments-initial-20261024/receivable-semantics-live-20261028.json"
MANUAL_LIVE = H / "live-readonly-manual-null-1813.json"
OUT = pathlib.Path(os.environ.get("B4_EVIDENCE_OUT", str(H / "fiscal-decision-20261108/service-bridge-current-20261109/evidence/strict-01")))
REVIEW_BEFORE = os.environ.get("B4_REVIEW_BEFORE") == "1"
PARSER_BEFORE = os.environ.get("B4_PARSER_BEFORE") == "1"
LOCK_BEFORE = os.environ.get("B4_LOCK_BEFORE") == "1"
if json.loads(MONEY.read_text()).get("ref") != "swzpzcwiasxmjutrmvkm":
    raise SystemExit("B4_MONEY_REF_DRIFT")
if json.loads(MANUAL_LIVE.read_text()).get("canonical_ref") != "swzpzcwiasxmjutrmvkm":
    raise SystemExit("B4_MANUAL_FACTS_REF_DRIFT")


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


B3 = load("b3_for_b4", B3DIR / "test-local-pg.py")
CURRENT_AR = load("current_receivable_baseline", H / "current_receivable_baseline.py")
B3.SP.PORT = "55489"
G = B3.g
CHECKS = []
CUSTOMER = B3.u(301)
DOCS = [B3.u(310 + i) for i in range(10)]
RECOVERY_DOC = B3.u(380)
BOL = B3.ch("boleto", 1, 30)
REAL_MANUAL = [B3.u(360 + i) for i in range(5)]
AMBIGUOUS_TITLE = B3.u(365)
CONFLICT_TITLE = B3.u(366)
OWNER_CONFLICT_TITLE = B3.u(367)
P_AMBIG_A, P_AMBIG_B = B3.u(370), B3.u(371)
SHARED_CUSTOMER = B3.u(372)
OTHER_CUSTOMER = B3.u(374)
ZERO_CUSTOMER = B3.u(375)
P_ZERO = B3.u(369)


def check(name, ok, detail=""):
    row = {"name": name, "ok": bool(ok)}
    if not ok:
        row["detail"] = str(detail)[:1200]
    CHECKS.append(row)
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + row["detail"]), flush=True)


def js(value):
    return json.dumps(value).replace("'", "''")


def sql_json(sql):
    result = B3.psql(f"SELECT ({sql})::text")
    return json.loads(result.stdout.strip().splitlines()[-1])


def call(uid, expression):
    return B3.call(uid, expression)


def server_run(uid, sql):
    command = B3.SP.su() + ["psql", "-X", "-q", "-t", "-A", "-h", B3.SP.SOCK[0], "-p", B3.SP.PORT, "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1"]
    return subprocess.run(command, input=f"SELECT set_config('request.jwt.claim.sub','{uid}',false) \\g /dev/null\n{sql}", text=True, capture_output=True)


def server_call(uid, expression):
    """Adaptador local privilegiado: GUC sintético, sem SET ROLE; não prova JWT/RLS."""
    return B3.out(server_run(uid, f"SELECT ({expression})::text;"))


def deny(name, result, token):
    data, error = result
    check(name, data is None and token in (error or ""), error or data)


def runfile(path):
    return B3.runf(path)


def install_b3(work):
    pins = dict(G["LIVE_PINS"])
    for sig, md5 in list(pins.items()):
        if "payment_terms_secure" in sig:
            pins[sig] = B3.md5_of(sig)
            continue
        actual = B3.md5_of(sig)
        check(f"B3 corpo atual pinado: {sig}", actual == md5, f"{actual} != {md5}")
        pins[sig] = actual
    cols = {table: B3.psql(f"SELECT md5(string_agg(column_name||':'||data_type, ',' ORDER BY ordinal_position)) FROM information_schema.columns WHERE table_schema='public' AND table_name='{table}'").stdout.strip()
            for table in G["LIVE_COLS"]}
    files = G["build"](pins=pins, cols=cols)
    for name, text in files.items():
        (work / name).write_text(text)
        (work / name).chmod(0o644)
    for name, marker in [("01-pre.sql.readonly", "PRE_OK"), ("02-install.sql.review", ""), ("03-post.sql.readonly", "POST_OK")]:
        result = runfile(work / name)
        check(f"B3 {name}", result.returncode == 0 and marker in result.stderr, result.stderr[-800:])


def captured_function(name):
    data = json.loads(CAPTURE.read_text())
    matches = [f for f in data["functions"] if f["name"] == name]
    assert len(matches) == 1, (name, len(matches))
    return matches[0]


def approve_order(order_id):
    result = B3.as_user(B3.UADM, f"SELECT public.approve_partner_order('{order_id}',NULL,NULL);")
    check("aprovação comercial canônica do pedido", result.returncode == 0, result.stderr[-900:])
    financial = B3.psql(f"SELECT financial_approval_status FROM public.partner_orders WHERE id='{order_id}'").stdout.strip()
    if financial == "pending":
        result = B3.as_user(B3.UADM, f"SELECT public.approve_b2b_payment_terms_secure('{order_id}',NULL)::text;")
        check("aprovação canônica dos termos exigida pelo plano", result.returncode == 0, result.stderr[-700:])
    else:
        check("plano sem aprovação financeira adicional preserva not_required", financial == "not_required", financial)
    state = B3.psql(f"SELECT status||'|'||financial_approval_status||'|'||(internal_economic_snapshot IS NOT NULL) FROM public.partner_orders WHERE id='{order_id}'").stdout.strip()
    check("pedido aprovado e economicamente selado", state in {"aprovado|approved|true", "aprovado|not_required|true"}, state)


def finance_schema():
    # O B3 traz somente tabelas mínimas de crédito. Antes de qualquer título, substitui essas
    # tabelas vazias pelas colunas/restrições capturadas; pedidos/gatilhos B3 não são tocados.
    B3.psql("""CREATE SCHEMA IF NOT EXISTS extensions;CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DROP TABLE IF EXISTS public.financial_receipts;DROP TABLE IF EXISTS public.receivable_payments;
DROP TABLE IF EXISTS public.financial_audit_log;DROP TABLE IF EXISTS public.accounts_receivable_installments;DROP TABLE IF EXISTS public.accounts_receivable;
CREATE TABLE IF NOT EXISTS public.bank_accounts(id uuid PRIMARY KEY,active boolean);
CREATE TABLE IF NOT EXISTS public.financial_settings(require_receipt_on_receivable_payment boolean);
CREATE TABLE IF NOT EXISTS platform_private.financial_initial_installments(transaction_id bigint,title_id uuid,kind text,actor_id uuid,organization_id uuid,installments jsonb);
CREATE TABLE IF NOT EXISTS public.accounts_payable(id uuid,status text);
CREATE TABLE IF NOT EXISTS public.accounts_payable_installments(id uuid,status text,due_date date,original_amount numeric,paid_amount numeric,discount_amount numeric,interest_amount numeric,penalty_amount numeric);
CREATE TABLE IF NOT EXISTS public.payable_payments(id uuid,payment_date date,amount_paid numeric,organization_id uuid);
CREATE TABLE IF NOT EXISTS public.entregas(id uuid PRIMARY KEY,partner_order_id uuid);
INSERT INTO public.financial_settings SELECT false WHERE NOT EXISTS(SELECT 1 FROM public.financial_settings);
CREATE UNIQUE INDEX IF NOT EXISTS partner_order_financial_links_partner_order_id_key ON public.partner_order_financial_links(partner_order_id);
CREATE FUNCTION platform_private.b2b_own_obligations(uuid,timestamptz,uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT '[]'::jsonb$$;
""")
    live = json.loads(MONEY.read_text())
    # Referências exigidas pelas FKs capturadas de accounts_receivable.
    for table in ["financial_cost_centers", "fiscal_requirement_exemptions", "recurring_financial_templates"]:
        B3.psql(f"CREATE TABLE IF NOT EXISTS public.{table}(id uuid PRIMARY KEY)")
    B3.psql("CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,email text)")
    for uid in [B3.UADM, B3.UFIN, B3.UB, B3.UT]:
        B3.psql(f"INSERT INTO auth.users(id) VALUES('{uid}') ON CONFLICT(id) DO NOTHING")
    names = ["accounts_receivable", "accounts_receivable_installments", "receivable_payments", "financial_receipts", "financial_audit_log"]
    for name in names:
        table = next(t for t in live["tables"] if t["name"] == name)
        cols = [f"{c['name']} {c['type']}" + (" DEFAULT " + c["default"] if c["default"] else "") + (" NOT NULL" if c["notnull"] else "") for c in table["columns"]]
        constraints = [f"CONSTRAINT {c['name']} {c['definition']}" for c in table["constraints"] if name == "accounts_receivable" or not c["definition"].startswith("FOREIGN KEY")]
        B3.psql(f"CREATE TABLE public.{name} (" + ",".join(cols + constraints) + ")")
    # Metadata LIVE de accounts_receivable: ACL ampla por papel + RLS obrigatória.
    # As policies não são promovidas a prova; os writers testados são definer/owner.
    B3.psql("""GRANT ALL PRIVILEGES ON TABLE public.accounts_receivable TO anon,authenticated,service_role;
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;""")
    B3.psql(f"""INSERT INTO platform_private.seam_entitlements VALUES
('{B3.UADM}','contas_receber'),('{B3.UFIN}','contas_receber');""")
    for index in live["indexes"]:
        if not index["name"].endswith("_pkey"):
            exists = B3.psql(f"SELECT to_regclass('{index['name']}') IS NOT NULL").stdout.strip()
            if exists != "t":
                B3.psql(index["definition"] + ";")
    signatures = ["fn_generate_receivable_installments()", "fn_recalc_receivable_installment()", "fn_h6b_num(numeric)",
                  "fn_h6b_payment_fingerprint(text,uuid,jsonb)", "rpc_register_receivable_payment(uuid,jsonb)", "fn_reverse_payment(uuid,text,text)",
                  "fn_h6_guard_ar_installment_snapshot()", "fn_h6_guard_title_snapshot()", "fn_h6_payments_append_only()", "fn_financial_audit()",
                  "fn_assign_receipt_metadata()", "fn_sync_receipt_aliases()", "issue_financial_receipt(uuid,text)", "cancel_financial_receipt(uuid,text)",
                  "cancel_b2b_receivable_secure(uuid,text)", "rpc_cancel_financial_installment(uuid,text,text)", "fn_fin_cashflow(date,date,text,text)", "fn_fin_aging(text)"]
    for sig in signatures:
        function = next(f for f in live["functions"] if f["signature"] == sig)
        B3.psql(function["body"] + ";")
    for sig in ["d51_5_validate_financial_tenant_links()", "guard_tenant_organization_id()", "update_updated_at_column()",
                "fn_h6d_block_hard_delete()", "_saas_trg_require_feature()", "tg_sync_b2b_financial_status()"]:
        function = next((f for f in live["functions"] if f["signature"] == sig), None)
        B3.psql((function or captured_function(sig.split("(")[0]))["body"] + ";")
    # O PostgreSQL descartável concede PUBLIC EXECUTE por padrão; reproduzir as
    # ACLs LIVE informadas, sem alterar os pinos ou ampliar o candidato.
    B3.psql("""REVOKE ALL ON FUNCTION public.fn_generate_receivable_installments() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_generate_receivable_installments() TO service_role;
REVOKE ALL ON FUNCTION public.rpc_register_receivable_payment(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_receivable_payment(uuid,jsonb) TO authenticated,service_role;""")
    included = {"trg_ar_gen_installments", "trg_h6_ar_snapshot", "trg_audit_ar", "trg_h6_ari_snapshot", "trg_h6_rp_append_only",
                "trg_recalc_ar_inst", "trg_audit_rp", "trg_assign_receipt_metadata", "trg_sync_receipt_aliases"}
    for table in live["tables"]:
        if table["name"] in names + ["partner_order_payment_schedule"]:
            for trigger in table["triggers"] or []:
                if trigger["name"] in included or table["name"] == "accounts_receivable":
                    exists = B3.psql(f"SELECT count(*) FROM pg_trigger WHERE tgname='{trigger['name']}' AND tgrelid='public.{table['name']}'::regclass").stdout.strip()
                    if exists == "0":
                        B3.psql(trigger["definition"] + ";")
    CURRENT_AR.restore(B3.psql)
    check("guard downstream real tem MD5 exato", B3.md5_of(CURRENT_AR.SIGNATURE) == CURRENT_AR.FUNCTION_MD5)


def document(doc_id, order, item, quantity, issue="2026-10-01", event=None):
    snapshot = sql_json(f"SELECT jsonb_build_object('packaging_id',packaging_id_snapshot,'content',packaging_peso_liquido_kg_snapshot,'content_unit',packaging_unidade_conteudo_snapshot,'volume',coalesce(volume_ml,volume_ml_snapshot)) FROM public.partner_order_items WHERE id='{item}' AND order_id='{order}'")
    if snapshot["packaging_id"]:
        taxable = Decimal(str(quantity)) * Decimal(str(snapshot["content"]))
        taxable_unit = str(snapshot["content_unit"]).upper()
    else:
        taxable = Decimal(str(quantity)) * Decimal(str(snapshot["volume"]))
        taxable_unit = "ML"
    items = [{"item_id": item, "quantity": quantity, "commercial_unit": "UN",
              "taxable_quantity": int(taxable) if taxable == taxable.to_integral_value() else float(taxable),
              "taxable_unit": taxable_unit}]
    B3.psql(f"INSERT INTO platform_private.b2b_authorized_documents VALUES('{doc_id}','{B3.A}','{B3.P}','{order}','NFE','{issue}','{event or doc_id}','{'a'*64}','{js(items)}'::jsonb,'AUTHORIZED')")


def allocate(uid, doc_id):
    return server_call(uid, f"platform_private.b2b_allocate_document('{doc_id}')")


def exposure():
    data, error = server_call(B3.UADM, f"public.fn_b2b_credit_exposure('{B3.P}',0,NULL)")
    if error or data is None:
        raise RuntimeError(error or "exposição sem retorno")
    return Decimal(str(data["exposicao_atual"]))


def residual(order):
    return Decimal(B3.psql(f"SELECT platform_private.b2b_order_residual('{order}')").stdout.strip())


def main():
    tmp = B3.boot()
    work = pathlib.Path(tempfile.mkdtemp(prefix="b4-b3-", dir="/tmp"))
    work.chmod(0o777)
    result_code = 1
    try:
        check("boot B2/B3 com gatilhos reais", all(c["ok"] for c in B3.CHECKS), B3.CHECKS)
        install_b3(work)
        B3.psql("""CREATE TABLE IF NOT EXISTS public.entregas(id uuid PRIMARY KEY,partner_order_id uuid);CREATE TABLE IF NOT EXISTS public.fiscal_invoices(id uuid);
CREATE TABLE IF NOT EXISTS public.fiscal_sefaz_transmissions(id uuid PRIMARY KEY,service text NOT NULL DEFAULT 'NFeAutorizacao4',fiscal_event_id uuid,fiscal_invoice_id uuid,
 state text,outcome text,c_stat text,x_motivo text,ch_nfe text,n_prot text,n_rec text,ambiente_retorno text,dh_recbto timestamptz,
 error_code text,response_summary jsonb,completed_at timestamptz);
CREATE FUNCTION platform_private.c2_order_partner_recipients(uuid) RETURNS SETOF uuid LANGUAGE sql AS $$SELECT NULL::uuid WHERE FALSE$$;""")
        for name in ["approve_b2b_payment_terms_secure", "approve_partner_order", "fn_b2b_order_priceable", "fn_b2b_order_billing_eligibility", "is_financial_staff", "fn_authz_uid_scope_ok",
                     "generate_b2b_receivable_secure", "generate_b2b_receivable_secure_impl", "tg_auto_b2b_receivable",
                     "fn_generate_receivable_from_entrega", "rpc_fiscal_invoice_apply_authorization_v1", "rpc_fiscal_sefaz_transmit_record_v1"]:
            function = captured_function(name)
            B3.psql(function["body"] + ";")
        B3.psql("""REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.tg_auto_b2b_receivable() FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION public.tg_auto_b2b_receivable() TO service_role;
REVOKE ALL ON FUNCTION public.fn_generate_receivable_from_entrega(uuid,jsonb) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.fn_generate_receivable_from_entrega(uuid,jsonb) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamp with time zone,text,text,uuid) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamp with time zone,text,text,uuid) TO service_role;
ALTER TABLE public.partner_order_payment_schedule ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();""")
        B3.psql(f"""ALTER TABLE public.partner_accounts ADD COLUMN IF NOT EXISTS client_id uuid;
CREATE TABLE IF NOT EXISTS public.clientes(id uuid PRIMARY KEY,organization_id uuid);
INSERT INTO public.clientes(id,organization_id) VALUES
('{CUSTOMER}','{B3.A}'),('{SHARED_CUSTOMER}','{B3.A}'),('{OTHER_CUSTOMER}','{B3.A}'),('{ZERO_CUSTOMER}','{B3.A}') ON CONFLICT (id) DO NOTHING;
UPDATE public.partner_accounts SET client_id='{CUSTOMER}' WHERE id='{B3.P}';
UPDATE public.partner_accounts SET client_id='{OTHER_CUSTOMER}' WHERE id='{B3.PO}';
INSERT INTO public.partner_accounts(id,ativo,deleted_at,commercial_owner_organization_id,client_id) VALUES
('{P_AMBIG_A}',true,NULL,'{B3.A}','{SHARED_CUSTOMER}'),('{P_AMBIG_B}',true,NULL,'{B3.A}','{SHARED_CUSTOMER}'),
('{P_ZERO}',true,NULL,'{B3.A}','{ZERO_CUSTOMER}');
INSERT INTO public.partner_financial_settings
SELECT (jsonb_populate_record(NULL::public.partner_financial_settings,to_jsonb(s)||jsonb_build_object('id',gen_random_uuid(),'partner_id',x.partner_id))).*
FROM public.partner_financial_settings s CROSS JOIN (VALUES
('{B3.PO}'::uuid),('{P_AMBIG_A}'::uuid),('{P_AMBIG_B}'::uuid),('{P_ZERO}'::uuid)) x(partner_id)
WHERE s.partner_id='{B3.P}';""")
        for plan in [B3.P3, B3.PLQ]:
            data, error = B3.publish(B3.UFIN, plan, "boleto", B3.M_BOL, 30, 3, "1.8", 0)
            check("publicação B3 usada pelo B4", data is not None, error)
            B3.assign(B3.UADM, B3.P, plan, "boleto", 1)
        data, error = B3.activation(B3.UADM, "pilot", [B3.P], 0)
        check("piloto B3 restrito ao parceiro fictício", data is not None, error)
        B3.psql(f"INSERT INTO public.company_fiscal_settings(organization_id,is_active,configuration_status,accounting_validated_at,legal_name,cnpj,configuration_version) VALUES('{B3.A}',true,'VALIDATED',now(),'AR Bio TESTE LOCAL','00000000000191',7)")

        # Cotação REAL: resposta cria o snapshot econômico append-only consumido pelo B4.
        data, error = B3.sim(B3.UB, B3.PLQ, [B3.L(3)], BOL)
        quote_hash = data and data["cart_hash"]
        data, error = B3.create(B3.UB, B3.PLQ, [B3.L(3)], quote_hash, "TESTE-B4-QUOTE", BOL)
        quote_order = data and data["id"]
        check("cotação B3 criada sem título", quote_order is not None, error)
        quote_item = B3.psql(f"SELECT id FROM public.partner_order_items WHERE order_id='{quote_order}'").stdout.strip()
        data, error = B3.respond(B3.UADM, quote_order, [{"item_id": quote_item, "unit_price": "100.01"}])
        check("resposta de cotação B3 com centavos", data is not None, error)
        approve_order(quote_order)

        # Pedido direto REAL: snapshot não cotado também precisa funcionar.
        data, error = B3.sim(B3.UB, B3.P3, [B3.L(1000)], BOL)
        direct_hash = data and data["cart_hash"]
        data, error = B3.create(B3.UB, B3.P3, [B3.L(1000)], direct_hash, "TESTE-B4-DIRECT", BOL)
        direct_order = data and data["id"]
        direct_item = B3.psql(f"SELECT id FROM public.partner_order_items WHERE order_id='{direct_order}'").stdout.strip()
        approve_order(direct_order)

        # Pedido independente para falha pós-INSERT/recuperação; não altera as
        # quantidades nem os saldos esperados dos cenários históricos.
        data, error = B3.sim(B3.UB, B3.P3, [B3.L(2)], BOL)
        data, error = B3.create(B3.UB, B3.P3, [B3.L(2)], data and data["cart_hash"], "TESTE-B4-RECOVERY", BOL)
        recovery_order = data and data["id"]
        recovery_item = B3.psql(f"SELECT id FROM public.partner_order_items WHERE order_id='{recovery_order}'").stdout.strip()
        check("fixture independente de recuperação criada sem título", recovery_order is not None and recovery_item != "", error)
        approve_order(recovery_order)

        # Pedido separado para callback real H12/H13, prova divergente e NFS-e.
        data, error = B3.sim(B3.UB, B3.P3, [B3.L(5)], BOL)
        data, error = B3.create(B3.UB, B3.P3, [B3.L(5)], data and data["cart_hash"], "TESTE-B4-CALLBACK-REVIEW", BOL)
        callback_order = data and data["id"]
        callback_item = B3.psql(f"SELECT id FROM public.partner_order_items WHERE order_id='{callback_order}'").stdout.strip()
        check("fixture independente do callback fiscal criada sem título", callback_order is not None and callback_item != "", error)
        approve_order(callback_order)

        # Pedido exclusivo para as corridas de lock H13×H12/ponte. Nenhum outro
        # cenário consome seu saldo ou depende do resultado financeiro da corrida.
        data, error = B3.sim(B3.UB, B3.P3, [B3.L(1)], BOL)
        data, error = B3.create(B3.UB, B3.P3, [B3.L(1)], data and data["cart_hash"], "TESTE-B4-LOCK-ORDER", BOL)
        lock_order = data and data["id"]
        lock_item = B3.psql(f"SELECT id FROM public.partner_order_items WHERE order_id='{lock_order}'").stdout.strip()
        check("fixture independente para ordenação de locks criada sem título", lock_order is not None and lock_item != "", error)
        approve_order(lock_order)

        # Pedido ainda pendente de contabilidade: fixture separada, nunca promovida artificialmente.
        B3.psql(f"DELETE FROM public.company_fiscal_settings WHERE organization_id='{B3.A}'")
        data, error = B3.sim(B3.UB, B3.P3, [B3.L(1)], BOL)
        data, error = B3.create(B3.UB, B3.P3, [B3.L(1)], data and data["cart_hash"], "TESTE-B4-PENDING", BOL)
        pending_order = data and data["id"]
        pending_item = B3.psql(f"SELECT id FROM public.partner_order_items WHERE order_id='{pending_order}'").stdout.strip()
        check("fixture contábil pendente separada", B3.psql(f"SELECT c2_external_origin_snapshot->>'contract' FROM public.partner_orders WHERE id='{pending_order}'").stdout.strip() == "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1")

        finance_schema()
        category_id = B3.psql("SELECT id FROM public.financial_categories WHERE active AND upper(btrim(type))='RECEITA' ORDER BY id LIMIT 1").stdout.strip()

        def manual_title(title_id, customer_id, amount, status="OPEN", due="'2026-11-03'", partner_id=None):
            partner_sql = f"'{partner_id}'" if partner_id else "NULL"
            return server_run(B3.UFIN, f"""INSERT INTO public.accounts_receivable
              (id,organization_id,origin_type,customer_id,partner_id,description,category_id,total_amount,issue_date,first_due_date,installment_count,status,payment_method_id,created_by)
              VALUES('{title_id}','{B3.A}','MANUAL','{customer_id}',{partner_sql},'TESTE SHARED MANUAL','{category_id}','{amount}','2026-10-01',{due},1,'{status}','{B3.M_BOL}','{B3.UFIN}');""")

        # Os cinco títulos e os conflitos são históricos: existem ANTES do trigger
        # candidato. Todos os dez gatilhos atuais da tabela seguem ativos;
        # nenhum UPDATE de partner_id/backfill é usado para montar a forma real.
        check("trigger compartilhado candidato ainda ausente antes dos históricos", B3.psql("SELECT count(*) FROM pg_trigger WHERE tgname='zz_b2b_shared_credit_guard' AND tgrelid='public.accounts_receivable'::regclass").stdout.strip() == "0")
        real_results = [manual_title(title, CUSTOMER, str(index + 1), "OVERDUE" if index == 4 else "OPEN", "CURRENT_DATE-30" if index == 4 else "CURRENT_DATE+30")
                        for index, title in enumerate(REAL_MANUAL)]
        check("cinco históricos locais 4 OPEN/1 OVERDUE nascem com partner_id NULL", all(r.returncode == 0 for r in real_results)
              and B3.psql(f"SELECT count(*) FILTER(WHERE status='OPEN')||'|'||count(*) FILTER(WHERE status='OVERDUE')||'|'||count(*) FILTER(WHERE partner_id IS NULL) FROM public.accounts_receivable WHERE id IN ({','.join(repr(x) for x in REAL_MANUAL)})").stdout.strip() == "4|1|5", [r.stderr[-500:] for r in real_results])
        historical_results = [
            manual_title(AMBIGUOUS_TITLE, SHARED_CUSTOMER, "10.00", "CANCELED"),
            manual_title(CONFLICT_TITLE, CUSTOMER, "11.00", "CANCELED", partner_id=B3.PO),
            manual_title(OWNER_CONFLICT_TITLE, CUSTOMER, "12.00", "CANCELED", partner_id=B3.PF),
        ]
        check("históricos de ambiguidade/conflito são preservados sem correção retroativa", all(r.returncode == 0 for r in historical_results)
              and B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE id IN ('{AMBIGUOUS_TITLE}','{CONFLICT_TITLE}','{OWNER_CONFLICT_TITLE}') AND status='CANCELED'").stdout.strip() == "3", [r.stderr[-500:] for r in historical_results])

        pre = runfile(H / "01-pre.sql.readonly")
        if pre.returncode != 0 and "B4_PRE_COLUMNS" in pre.stderr:
            actual_columns = B3.psql("SELECT jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'default',column_default,'notnull',is_nullable) ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts_receivable'").stdout.strip()
            print("PRE_COLUMN_DEBUG actual=" + actual_columns, flush=True)
            print("PRE_COLUMN_DEBUG expected=" + json.dumps(next(x for x in json.loads(MONEY.read_text())["tables"] if x["name"] == "accounts_receivable")["columns"]), flush=True)
        if pre.returncode != 0 and "B4_PRE_INDEXES" in pre.stderr:
            actual_indexes = B3.psql("SELECT jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='accounts_receivable'").stdout.strip()
            print("PRE_INDEX_DEBUG actual=" + actual_indexes, flush=True)
            print("PRE_INDEX_DEBUG expected=" + json.dumps(json.loads(MONEY.read_text())["indexes"]), flush=True)
        check("PRE confirma writers/índice e ausência de todos os overloads da projeção", pre.returncode == 0 and "PRE_OK" in (pre.stdout + pre.stderr), (pre.stdout + pre.stderr)[-1200:])
        install = runfile(H / "02-install.sql.review")
        if install.returncode != 0 and "B4_POST_BODY:" in install.stderr:
            # Diagnóstico fora do aceite: a transação oficial já fez rollback.
            diagnostic_install = runfile(H / "b4-candidate.sql.review")
            if diagnostic_install.returncode != 0:
                raise RuntimeError("diagnóstico do corpo falhou: " + diagnostic_install.stderr[-900:])
            function_objects = [x for x in json.loads((H / "b4-object-manifest.json").read_text())["objects"] if x["kind"] == "function"]
            values = ",".join("('" + x["candidate"]["signature"] + "','" + x["candidate"]["body_md5"] + "')" for x in function_objects)
            mismatch_sql = "SELECT x.sig||'|'||x.expected||'|'||coalesce(md5(pg_get_functiondef(x.sig::regprocedure)),'MISSING') FROM (VALUES " + values + ") x(sig,expected) WHERE to_regprocedure(x.sig) IS NULL OR md5(pg_get_functiondef(x.sig::regprocedure)) IS DISTINCT FROM x.expected ORDER BY x.sig"
            mismatch_output = B3.psql(mismatch_sql).stdout
            print("POST_FUNCTION_HASH_DEBUG\n" + mismatch_output, flush=True)
            actual_definitions = {}
            for line in mismatch_output.strip().splitlines():
                sig = line.split("|", 1)[0]
                actual_definitions[sig] = B3.psql(f"SELECT pg_get_functiondef('{sig}'::regprocedure)").stdout
            diagnostic_path = H / "review-458b6012/live-absence-4097d4e2/diagnostic-function-definitions.json"
            diagnostic_path.write_text(json.dumps(actual_definitions, indent=2) + "\n")
            raise RuntimeError("instalação oficial falhou; diagnóstico de hashes concluído fora do aceite")
        check("instalação descartável cria projeção nova e passa PRE+POST íntegros", install.returncode == 0, install.stderr[-1400:])
        post = runfile(H / "03-post.sql.readonly")
        check("POST confirma exatamente um overload owner-only e metadata completa", post.returncode == 0 and "POST_OK" in (post.stdout + post.stderr), (post.stdout + post.stderr)[-1200:])
        check("instalação não habilita a dependência fiscal/contábil", B3.psql("SELECT pg_get_functiondef('platform_private.b2b_integration_dependencies()'::regprocedure) LIKE '%B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN%'").stdout.strip() == "t")
        real_dependencies = B3.psql("SELECT pg_get_functiondef('platform_private.b2b_integration_dependencies()'::regprocedure)").stdout
        rerun = runfile(H / "02-install.sql.review")
        check("rerun falha fechado ao encontrar overload/objetos já criados", rerun.returncode != 0 and "B4_" in rerun.stderr, rerun.stderr[-700:])
        check("instalação não substitui dependência operacional por stub", "CREATE OR REPLACE FUNCTION platform_private.b2b_integration_dependencies" not in (H / "02-install.sql.review").read_text())
        trigger_count = B3.psql("SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgrelid IN ('public.partner_orders'::regclass,'public.partner_order_items'::regclass,'public.partner_order_payment_terms'::regclass,'public.partner_order_payment_schedule'::regclass)").stdout.strip()
        check("32 gatilhos reais carregados pelo harness B3 continuam habilitados", trigger_count == "32", trigger_count)
        check("B3 create/simulate antigos não foram restaurados nem alterados", B3.md5_of(B3.CREATE_SIG) == G["LIVE_PINS"][B3.CREATE_SIG] and B3.md5_of(B3.SIM_SIG) == G["LIVE_PINS"][B3.SIM_SIG]
              and B3.psql("SELECT to_regprocedure('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text,jsonb)') IS NULL").stdout.strip() == "t")
        check("autorização fiscal continua service-only e sem integração de recebível", B3.psql("SELECT has_function_privilege('authenticated','public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamp with time zone,text,text,uuid)','EXECUTE')").stdout.strip() == "f"
              and "accounts_receivable" not in captured_function("rpc_fiscal_invoice_apply_authorization_v1")["body"])

        document(DOCS[0], quote_order, quote_item, 1)
        deny("gate fiscal/contábil não comprovado permanece fechado", allocate(B3.UADM, DOCS[0]), "B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN")
        check("pedido aprovado sem evento fiscal alocado permanece previsão, sem dívida", B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_type='B2B_ORDER' AND origin_id='{quote_order}'").stdout.strip() == "0" and residual(quote_order) > 0)
        deny("cliente não invoca alocador privado", B3.out(B3.as_user(B3.UADM, f"SELECT platform_private.b2b_allocate_document('{DOCS[0]}')::text;")), "permission denied")
        # Bateria estrita: nenhum allocate direto e nenhum stub permissivo.
        check("componente econômico direto fora desta bateria estrita", True)
        rollback = runfile(H / "04-rollback-deny.sql.review")
        check("rollback B4 deny-only antes da ponte preserva histórico", rollback.returncode == 0, rollback.stderr[-1200:])
        check("nenhum título fiscal existe antes da confirmação", B3.psql("SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id IS NOT NULL").stdout.strip() == "0")

        # Ponte fiscal service-only: instalada somente após a regressão e o
        # rollback B4 acima. Nenhum auth.uid/ator humano é fabricado para o título.
        BRIDGE = H / "fiscal-decision-20261108/service-bridge"
        B3.psql("""ALTER TABLE public.fiscal_invoices ADD COLUMN receivable_id uuid,ADD COLUMN environment text,ADD COLUMN normalized_status text,
 ADD COLUMN access_key text,ADD COLUMN authorized_at timestamptz,ADD COLUMN provider_status_raw text,ADD COLUMN tax_authority_notes text,
 ADD COLUMN reconciliation_status text,ADD COLUMN updated_at timestamptz DEFAULT now(),ADD COLUMN status text DEFAULT 'PENDING',
 ADD COLUMN company_settings_id uuid,ADD COLUMN organization_id uuid,ADD COLUMN partner_order_id uuid,ADD COLUMN debtor_partner_id uuid,ADD COLUMN debtor_customer_id uuid,
 ADD COLUMN invoice_type text,ADD COLUMN issue_date date,ADD COLUMN total_amount numeric(14,2),ADD COLUMN provider_reference text,ADD COLUMN created_by uuid;
ALTER TABLE public.fiscal_invoices ADD CONSTRAINT fiscal_invoices_pkey PRIMARY KEY(id);
CREATE TABLE public.fiscal_invoice_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fiscal_invoice_id uuid NOT NULL,partner_order_item_id uuid,
 item_sequence integer NOT NULL,item_kind text NOT NULL,quantity numeric(18,6),commercial_unit text,taxable_quantity numeric(18,6),taxable_unit text,net_value numeric(18,2));
CREATE TABLE IF NOT EXISTS public.fiscal_xml_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fiscal_invoice_id uuid,signed_path text,access_key text,signed_at timestamptz,updated_at timestamptz);
CREATE TABLE IF NOT EXISTS public.fiscal_sefaz_transmissions(id uuid PRIMARY KEY,service text NOT NULL DEFAULT 'NFeAutorizacao4',fiscal_event_id uuid,fiscal_invoice_id uuid,
 xml_run_id uuid,idempotency_key text,request_fingerprint text,environment_code text DEFAULT '2',endpoint_url text,correlation_id uuid DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),
 state text,outcome text,c_stat text,x_motivo text,ch_nfe text,n_prot text,n_rec text,ambiente_retorno text,dh_recbto timestamptz,
 error_code text,response_summary jsonb,completed_at timestamptz);
ALTER TABLE public.fiscal_sefaz_transmissions ADD COLUMN IF NOT EXISTS xml_run_id uuid,ADD COLUMN IF NOT EXISTS idempotency_key text,
 ADD COLUMN IF NOT EXISTS request_fingerprint text,ADD COLUMN IF NOT EXISTS environment_code text DEFAULT '2',ADD COLUMN IF NOT EXISTS endpoint_url text,
 ADD COLUMN IF NOT EXISTS correlation_id uuid DEFAULT gen_random_uuid(),ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
 ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE TABLE IF NOT EXISTS public.fiscal_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),table_name text,record_id uuid,action text,old_values jsonb,new_values jsonb,changed_by uuid);""")
        captured_tx_guard = next(x["body"] for x in json.loads(CAPTURE.read_text())["functions"] if x["name"] == "fn_fiscal_sefaz_tx_guard")
        B3.psql(captured_tx_guard + ";DROP TRIGGER IF EXISTS trg_fiscal_sefaz_tx_guard ON public.fiscal_sefaz_transmissions;CREATE TRIGGER trg_fiscal_sefaz_tx_guard BEFORE DELETE OR UPDATE ON public.fiscal_sefaz_transmissions FOR EACH ROW EXECUTE FUNCTION public.fn_fiscal_sefaz_tx_guard();")
        B3.psql(f"""INSERT INTO public.company_fiscal_settings(organization_id,is_active,configuration_status,accounting_validated_at,legal_name,cnpj,configuration_version)
 SELECT '{B3.A}',true,'VALIDATED',now(),'AR BIO FIXTURE LOCAL','00000000000191',7 WHERE NOT EXISTS(SELECT 1 FROM public.company_fiscal_settings WHERE organization_id='{B3.A}' AND is_active);""")
        company_a = B3.psql(f"SELECT id FROM public.company_fiscal_settings WHERE organization_id='{B3.A}' AND is_active").stdout.strip()
        B3.psql(f"""INSERT INTO public.company_fiscal_settings(organization_id,is_active,configuration_status,accounting_validated_at,legal_name,cnpj,configuration_version)
 SELECT '{B3.F}',true,'VALIDATED',now(),'FSF FIXTURE LOCAL','00000000000191',1 WHERE NOT EXISTS(SELECT 1 FROM public.company_fiscal_settings WHERE organization_id='{B3.F}' AND is_active);""")
        company_f = B3.psql(f"SELECT id FROM public.company_fiscal_settings WHERE organization_id='{B3.F}' AND is_active").stdout.strip()
        invoice_main, invoice_pending, invoice_denied, invoice_foreign = [B3.u(390+i) for i in range(4)]
        invoice_nonb2b, invoice_partial, invoice_bad_cstat, invoice_no_tx, invoice_nfse, invoice_h13, invoice_h13_pending, invoice_h13_rejected = [B3.u(400+i) for i in range(8)]
        tx_main, tx_denied, tx_foreign, tx_nonb2b, tx_partial, tx_bad_cstat, tx_nfse, tx_h13, tx_h13_pending, tx_h13_rejected = [B3.u(420+i) for i in range(10)]
        invoice_parser = B3.u(440)
        tx_parser, tx_h13_repeat, tx_h13_divergent = [B3.u(441+i) for i in range(3)]
        invoice_lock_h12, invoice_lock_bridge = B3.u(445), B3.u(446)
        tx_lock_h12, tx_lock_bridge = B3.u(447), B3.u(448)
        monetary = B3.psql(f"SELECT round(financed_total/2,2) FROM platform_private.b4_order_condition_snapshots WHERE order_id='{recovery_order}'").stdout.strip()
        def seed_invoice(invoice_id, status="PENDING", org=None, company=None, order=None, partner=None, with_item=False, item=None, invoice_type="NFE", provider_reference="LOCAL-PROVIDER"):
            org = org or B3.A; company = company or company_a; order = order or recovery_order; partner = partner or B3.P
            item = item or recovery_item
            order_sql = f"'{order}'" if order else "NULL"
            partner_sql = f"'{partner}'" if partner else "NULL"
            B3.psql(f"""INSERT INTO public.fiscal_invoices(id,invoice_type,status,normalized_status,environment,company_settings_id,organization_id,
 partner_order_id,debtor_partner_id,issue_date,total_amount,created_by,provider_reference)
  VALUES('{invoice_id}','{invoice_type}','{status}','{status}','HOMOLOGATION','{company}','{org}',{order_sql},{partner_sql},'2027-02-01','{monetary}','{B3.UADM}','{provider_reference}');""")
            if with_item:
                B3.psql(f"""INSERT INTO public.fiscal_invoice_items(fiscal_invoice_id,partner_order_item_id,item_sequence,item_kind,quantity,commercial_unit,taxable_quantity,taxable_unit,net_value)
 VALUES('{invoice_id}','{item}',1,'PRODUCT',1,'UN',1,'UN','{monetary}');""")
        def seed_proof(invoice_id, transmission_id, key=access_key if 'access_key' in globals() else "35261111111111111111111111111111111111111111", protocol="LOCAL-PROTOCOL", cstat="100", outcome="AUTHORIZED", state="SUCCEEDED"):
            B3.psql(f"""INSERT INTO public.fiscal_xml_runs(fiscal_invoice_id,signed_path,access_key,signed_at,updated_at)
 VALUES('{invoice_id}','local/{invoice_id}.xml','{key}',now(),now());
 INSERT INTO public.fiscal_sefaz_transmissions(id,fiscal_invoice_id,xml_run_id,idempotency_key,request_fingerprint,environment_code,endpoint_url,state,outcome,c_stat,x_motivo,ch_nfe,n_prot,ambiente_retorno,dh_recbto,completed_at)
 VALUES('{transmission_id}','{invoice_id}',gen_random_uuid(),'local-tx:{transmission_id}','local-fp:{transmission_id}','2','https://hnfe.fazenda.mg.gov.br/LOCAL-SYNTHETIC-NO-NETWORK','{state}','{outcome}','{cstat}','LOCAL','{key}','{protocol}','2',now(),now());""")
        def real_record(transmission_id, state, patch):
            return service_json(f"public.rpc_fiscal_sefaz_transmit_record_v1('{transmission_id}','{state}','{js(patch)}'::jsonb)")
        def pending_code(transmission_id):
            return B3.psql(f"SELECT coalesce(error_code,'') FROM platform_private.fiscal_close_pending WHERE transmission_id='{transmission_id}'").stdout.strip()
        def service_sql(sql):
            return server_run("", "SET ROLE service_role;" + sql)
        def service_json(expression):
            return B3.out(service_sql(f"SELECT ({expression})::text;"))
        def bridge_file(name):
            return service_sql("RESET ROLE;SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';" + (BRIDGE/name).read_text())
        seed_invoice(invoice_pending)
        seed_invoice(invoice_main,with_item=True)
        seed_invoice(invoice_denied,"AUTHORIZED",with_item=True)
        seed_invoice(invoice_foreign,"AUTHORIZED",org=B3.F,company=company_f,with_item=True)
        seed_invoice(invoice_nonb2b,order=None,partner=None)
        seed_invoice(invoice_partial,order=callback_order,partner=None,with_item=True,item=callback_item)
        seed_invoice(invoice_bad_cstat,order=callback_order,with_item=True,item=callback_item)
        seed_invoice(invoice_no_tx,order=callback_order,with_item=True,item=callback_item)
        seed_invoice(invoice_nfse,"AUTHORIZED",order=callback_order,with_item=True,item=callback_item,invoice_type="NFSE",provider_reference="NFSE-LOCAL-1")
        seed_invoice(invoice_h13,order=callback_order,with_item=True,item=callback_item)
        seed_invoice(invoice_h13_pending,order=None,partner=None)
        seed_invoice(invoice_h13_rejected,order=None,partner=None)
        seed_invoice(invoice_parser,order=None,partner=None,provider_reference="PARSER-104-100")
        seed_invoice(invoice_lock_h12,order=None,partner=None,provider_reference="LOCK-H13-H12")
        seed_invoice(invoice_lock_bridge,"AUTHORIZED",order=lock_order,with_item=True,item=lock_item,provider_reference="LOCK-H13-BRIDGE")
        B3.psql(f"""UPDATE public.fiscal_invoices SET authorized_at=now(),access_key='35261111111111111111111111111111111111111111' WHERE id IN ('{invoice_denied}','{invoice_foreign}','{invoice_nfse}','{invoice_lock_bridge}');
 UPDATE public.fiscal_invoices SET partner_order_id=NULL,debtor_partner_id=NULL WHERE id IN ('{invoice_nonb2b}','{invoice_parser}','{invoice_lock_h12}');
 UPDATE public.fiscal_invoices SET debtor_partner_id=NULL WHERE id='{invoice_partial}';""")
        seed_proof(invoice_main,tx_main)
        seed_proof(invoice_denied,tx_denied)
        seed_proof(invoice_foreign,tx_foreign)
        seed_proof(invoice_nonb2b,tx_nonb2b,state="SENT",outcome="PENDING",cstat="103",protocol="PENDING")
        seed_proof(invoice_partial,tx_partial,state="SENT",outcome="PENDING",cstat="103",protocol="PENDING")
        seed_proof(invoice_bad_cstat,tx_bad_cstat,cstat="999",outcome="REJECTED")
        seed_proof(invoice_nfse,tx_nfse,protocol="NFSE-PROTOCOL-1")
        seed_proof(invoice_h13,tx_h13,state="SENT",outcome="PENDING",cstat="103",protocol="PENDING")
        seed_proof(invoice_h13_pending,tx_h13_pending,state="SENT",outcome="PENDING",cstat="103",protocol="PENDING")
        seed_proof(invoice_h13_rejected,tx_h13_rejected,state="SENT",outcome="PENDING",cstat="103",protocol="PENDING")
        seed_proof(invoice_parser,tx_parser,state="SENT",outcome="PENDING",cstat="103",protocol="PENDING")
        seed_proof(invoice_lock_h12,tx_lock_h12,state="SENT",outcome="PENDING",cstat="103",protocol="PENDING")
        seed_proof(invoice_lock_bridge,tx_lock_bridge,state="SENT",outcome="PENDING",cstat="103",protocol="PENDING")
        if not REVIEW_BEFORE and not PARSER_BEFORE:
            # Erro estranho é gravado enquanto a transmissão ainda é mutável;
            # depois disso a guarda real proíbe qualquer alteração terminal.
            B3.psql(f"UPDATE public.fiscal_sefaz_transmissions SET error_code='FOREIGN_PROVIDER_ERROR' WHERE id='{tx_h13}';")
        pre_bridge = bridge_file("01-pre.sql.readonly")
        check("ponte PRE confirma pins B4 e autorização capturada", pre_bridge.returncode == 0, pre_bridge.stderr[-1000:])
        install_bridge = bridge_file("02-install.sql.review")
        check("ponte service-only instala com POST e ACL fechada", install_bridge.returncode == 0, install_bridge.stderr[-1200:])
        post_bridge = bridge_file("03-post.sql.readonly")
        check("ponte POST íntegro", post_bridge.returncode == 0, post_bridge.stderr[-900:])
        denied_client = B3.as_user(B3.UADM, f"SELECT platform_private.b2b_fiscal_invoice_bridge_v1('{invoice_main}');")
        check("ponte não recebe EXECUTE de usuário autenticado", denied_client.returncode != 0 and "permission denied" in denied_client.stderr, denied_client.stderr)
        denied_dependency = service_json(f"platform_private.b2b_fiscal_invoice_bridge_v1('{invoice_denied}')")
        deny("ponte mantém dependência fiscal/contábil real fechada antes da costura local", denied_dependency, "B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN")
        check("dependência negada não deixa documento/título", B3.psql(f"SELECT (SELECT count(*) FROM platform_private.b2b_authorized_documents WHERE id='{invoice_denied}')||'|'||(SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_denied}')").stdout.strip() == "0|0")
        STRICT = H / "fiscal-decision-20261108/service-bridge-current-20261109"
        def strict_file(name):
            return service_sql("RESET ROLE;SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';" + (STRICT / name).read_text())
        strict_pre = strict_file("01-pre.sql.readonly")
        check("etapa estrita PRE confirma B4, ponte, legado e dez gatilhos originais", strict_pre.returncode == 0, strict_pre.stderr[-1400:])
        strict_install = strict_file("02-install.sql.review")
        check("etapa estrita instala validação por permit fiscal real, sem stub", strict_install.returncode == 0, strict_install.stderr[-1400:])
        strict_post = strict_file("03-post.sql.readonly")
        check("etapa estrita POST preserva ACL, metadata e legado negado", strict_post.returncode == 0, strict_post.stderr[-1200:])
        check("nenhum stub always-allow foi instalado", "LANGUAGE sql AS $$SELECT$$" not in B3.psql("SELECT pg_get_functiondef('platform_private.b2b_integration_dependencies()'::regprocedure)").stdout)
        pending_result, pending_error = service_json(f"platform_private.b2b_fiscal_invoice_bridge_v1('{invoice_pending}')")
        check("evento pendente é ignorado sem título", pending_result and pending_result["skipped"] and pending_result["receivable_id"] is None, pending_error or pending_result)
        B3.psql(f"UPDATE public.fiscal_invoices SET normalized_status='REJECTED',status='REJECTED' WHERE id='{invoice_pending}'")
        rejected_result, rejected_error = service_json(f"platform_private.b2b_fiscal_invoice_bridge_v1('{invoice_pending}')")
        check("evento rejeitado é ignorado sem título", rejected_result and rejected_result["skipped"], rejected_error or rejected_result)
        check("pendente/rejeitado não criam documento ou recebível", B3.psql(f"SELECT (SELECT count(*) FROM platform_private.b2b_authorized_documents WHERE id='{invoice_pending}')||'|'||(SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_pending}')").stdout.strip() == "0|0")

        # Revisão ab904bf: o retorno real H13, não apenas normalized_status da fixture.
        pending_record, pending_record_error = real_record(tx_h13_pending, "SENT", {"cStat":"103","xMotivo":"PROCESSANDO"})
        check("callback H13 pendente não chama autorização nem cria título", pending_record and pending_record["outcome"] == "PENDING" and not pending_record["reconciliationPending"], pending_record_error or pending_record)
        rejected_record, rejected_record_error = real_record(tx_h13_rejected, "SUCCEEDED", {"cStat":"610","nProt":"LOCAL-REJECT","xMotivo":"REJEITADO","tpAmb":"2"})
        check("callback H13 rejeitado não promove NF nem cria título", rejected_record and rejected_record["outcome"] == "REJECTED" and B3.psql(f"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_h13_rejected}'").stdout.strip() == "PENDING", rejected_record_error or rejected_record)
        check("callbacks reais pendente/rejeitado preservam zero documentos fiscais B4", B3.psql(f"SELECT count(*) FROM platform_private.b2b_authorized_documents WHERE id IN ('{invoice_h13_pending}','{invoice_h13_rejected}')").stdout.strip() == "0")

        nonb2b_record, nonb2b_error = real_record(tx_nonb2b, "SUCCEEDED", {"cStat":"100","nProt":"LOCAL-NONB2B","chNFe":"35261111111111111111111111111111111111111111","xMotivo":"AUTORIZADO","tpAmb":"2","dhRecbto":"2027-02-01T12:00:00Z"})
        if REVIEW_BEFORE:
            check("ANTES: retorno autorizado não-B2B quebra no fechamento B2B incondicional", nonb2b_record and nonb2b_record["reconciliationPending"] and nonb2b_record["reconciliationCode"] == "FISCAL_AUTHORIZATION_CLOSE_PENDING", nonb2b_error or nonb2b_record)
            check("ANTES: NF não-B2B permanece pendente apesar do retorno externo preservado", B3.psql(f"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_nonb2b}'").stdout.strip() == "PENDING")
        else:
            check("DEPOIS: retorno não-B2B é classificado e autorizado sem título B2B", nonb2b_record and not nonb2b_record["reconciliationPending"] and B3.psql(f"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_nonb2b}'").stdout.strip() == "AUTHORIZED", nonb2b_error or nonb2b_record)
            check("DEPOIS: classificação não-B2B não cria documento/título B4", B3.psql(f"SELECT (SELECT count(*) FROM platform_private.b2b_authorized_documents WHERE id='{invoice_nonb2b}')||'|'||(SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_nonb2b}')").stdout.strip() == "0|0")
        check("retorno externo não-B2B permanece durável na transmissão", B3.psql(f"SELECT outcome||'|'||coalesce(error_code,'') FROM public.fiscal_sefaz_transmissions WHERE id='{tx_nonb2b}'").stdout.strip().startswith("AUTHORIZED|"))

        # Complemento feb815603: envelope real com status do lote 104 e protocolo 100.
        # Não se substitui cStat por 100 para fazer o teste passar.
        parser_patch = {"cStat":"104","protocolCStat":"100","nProt":"PARSER-PROTOCOL-100","chNFe":"35261111111111111111111111111111111111111111","xMotivo":"LOTE PROCESSADO; PROTOCOLO AUTORIZADO","tpAmb":"2","dhRecbto":"2027-02-01T12:30:00Z"}
        parser_record, parser_error = real_record(tx_parser,"SUCCEEDED",parser_patch)
        parser_state = B3.psql(f"SELECT outcome||'|'||c_stat||'|'||coalesce(error_code,'') FROM public.fiscal_sefaz_transmissions WHERE id='{tx_parser}'").stdout.strip()
        if PARSER_BEFORE:
            check("ANTES: parser calcula AUTHORIZED por protocolCStat=100 mas persiste c_stat=104", parser_record and parser_record["outcome"] == "AUTHORIZED" and parser_state.startswith("AUTHORIZED|104|FISCAL_AUTHORIZATION_CLOSE_PENDING"), parser_error or parser_state)
            check("ANTES: H12 recebe 104 e deixa autorização não-B2B em CLOSE_PENDING", parser_record and parser_record["reconciliationPending"] and B3.psql(f"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_parser}'").stdout.strip() == "PENDING", parser_error or parser_record)
        else:
            check("DEPOIS: parser preserva lote 104 e protocolo 100 em campos separados", parser_record and parser_record["outcome"] == "AUTHORIZED" and parser_record["cStat"] == "104" and parser_record["protocolCStat"] == "100" and parser_state == "AUTHORIZED|104|", parser_error or parser_state)
            check("DEPOIS: H12 consome protocolo 100 e fecha não-B2B sem título", parser_record and not parser_record["reconciliationPending"] and B3.psql(f"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_parser}'").stdout.strip() == "AUTHORIZED" and B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_parser}'").stdout.strip() == "0", parser_error or parser_record)
            check("DEPOIS: coluna protocol_c_stat conserva evidência efetiva 100", B3.psql(f"SELECT protocol_c_stat FROM public.fiscal_sefaz_transmissions WHERE id='{tx_parser}'").stdout.strip() == "100")
        parser_replay, parser_replay_error = real_record(tx_parser,"SUCCEEDED",parser_patch)
        check("replay do mesmo envelope 104/100 não duplica transmissão nem efeito fiscal", parser_replay and parser_replay["outcome"] == "AUTHORIZED" and B3.psql(f"SELECT count(*) FROM public.fiscal_sefaz_transmissions WHERE fiscal_invoice_id='{invoice_parser}'").stdout.strip() == "1", parser_replay_error or parser_replay)
        if not PARSER_BEFORE:
            check("replay 104/100 recuperado permanece sem pendência e sem rebaixar evidência", not parser_replay["reconciliationPending"] and parser_replay["protocolCStat"] == "100" and B3.psql(f"SELECT c_stat||'|'||protocol_c_stat FROM public.fiscal_sefaz_transmissions WHERE id='{tx_parser}'").stdout.strip() == "104|100", parser_replay_error or parser_replay)

        partial_record, partial_error = real_record(tx_partial, "SUCCEEDED", {"cStat":"100","nProt":"LOCAL-PARTIAL","chNFe":"35261111111111111111111111111111111111111111","xMotivo":"AUTORIZADO","tpAmb":"2","dhRecbto":"2027-02-01T12:00:00Z"})
        check("vínculo B2B parcial não escapa como não-B2B", partial_record and partial_record["reconciliationPending"] and B3.psql(f"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_partial}'").stdout.strip() == "PENDING", partial_error or partial_record)

        bad_cstat = service_sql(f"SELECT public.rpc_fiscal_invoice_apply_authorization_v1('{invoice_bad_cstat}','35261111111111111111111111111111111111111111','BAD-CSTAT',now(),'999','REJEITADO','{tx_bad_cstat}');")
        if REVIEW_BEFORE:
            check("ANTES: callback direto aceita _c_stat=999 e cria título", bad_cstat.returncode == 0 and B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_bad_cstat}'").stdout.strip() == "1", bad_cstat.stderr)
        else:
            check("DEPOIS: _c_stat divergente não autoriza nem cria título", bad_cstat.returncode != 0 and "FISCAL_AUTHORIZATION_PAYLOAD_INVALID" in bad_cstat.stderr and B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_bad_cstat}'").stdout.strip() == "0", bad_cstat.stderr)
        no_tx = service_sql(f"SELECT public.rpc_fiscal_invoice_apply_authorization_v1('{invoice_no_tx}','35261111111111111111111111111111111111111111','NO-TRANSMISSION',now(),'100','LOCAL',NULL);")
        if REVIEW_BEFORE:
            check("ANTES: callback sem transmissão autoriza e cria título", no_tx.returncode == 0 and B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_no_tx}'").stdout.strip() == "1", no_tx.stderr)
        else:
            check("DEPOIS: ausência de transmissão falha fechado", no_tx.returncode != 0 and "FISCAL_AUTHORIZATION_PAYLOAD_INVALID" in no_tx.stderr and B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_no_tx}'").stdout.strip() == "0", no_tx.stderr)
        nfse_result = service_sql(f"SELECT platform_private.b2b_fiscal_invoice_bridge_v1('{invoice_nfse}');")
        if REVIEW_BEFORE:
            check("ANTES: NFS-e é promovida sem callback específico comprovado", nfse_result.returncode == 0 and B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_nfse}'").stdout.strip() == "1", nfse_result.stderr)
        else:
            check("DEPOIS: NFS-e permanece fail-closed até callback específico", nfse_result.returncode != 0 and "B2B_FISCAL_NFSE_CALLBACK_UNPROVEN" in nfse_result.stderr and B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_nfse}'").stdout.strip() == "0", nfse_result.stderr)

        B3.psql("""CREATE FUNCTION public.b4_test_fail_after_title() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'B4_TEST_POST_TITLE_FAILURE' USING ERRCODE='P0001'; END $$;
 CREATE TRIGGER zz_b4_test_fail_after_title AFTER INSERT ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.b4_test_fail_after_title();""")
        access_key = "35261111111111111111111111111111111111111111"
        failed_auth = service_sql(f"SELECT public.rpc_fiscal_invoice_apply_authorization_v1('{invoice_main}','{access_key}','LOCAL-PROTOCOL',now(),'100','LOCAL','{tx_main}');")
        check("autorização com falha pós-título aborta sem perder capacidade de retry", failed_auth.returncode != 0 and "B4_TEST_POST_TITLE_FAILURE" in failed_auth.stderr, failed_auth.stderr[-1000:])
        check("falha da autorização não deixa NF autorizada, documento ou título parcial", B3.psql(f"SELECT (SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_main}')||'|'||(SELECT count(*) FROM platform_private.b2b_authorized_documents WHERE id='{invoice_main}')||'|'||(SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_main}')").stdout.strip() == "PENDING|0|0")
        B3.psql("DROP TRIGGER zz_b4_test_fail_after_title ON public.accounts_receivable;DROP FUNCTION public.b4_test_fail_after_title();")
        authorized, authorized_error = service_json(f"public.rpc_fiscal_invoice_apply_authorization_v1('{invoice_main}','{access_key}','LOCAL-PROTOCOL',now(),'100','LOCAL','{tx_main}')")
        check("retentativa autorizada gera um recebível B4 pela NF", authorized and authorized["applied"] and authorized.get("receivableId"), authorized_error or authorized)
        service_title = authorized and authorized["receivableId"]
        service_origin = B3.psql(f"SELECT coalesce((SELECT created_by::text FROM public.accounts_receivable WHERE id='{service_title}'),'<NULL>')||'|'||coalesce(receivable_id::text,'<NULL>') FROM public.fiscal_invoices WHERE id='{invoice_main}'").stdout.strip()
        check("título service-only não inventa ator humano e conserva vínculo NF", service_origin == f"<NULL>|{service_title}", service_origin)
        check("primeira NF parcial deixa residual econômico sem cobrar o saldo", residual(recovery_order) > 0, residual(recovery_order))
        replay, replay_error = service_json(f"public.rpc_fiscal_invoice_apply_authorization_v1('{invoice_main}','{access_key}','LOCAL-PROTOCOL',now(),'100','LOCAL','{tx_main}')")
        check("retentativa da NF autorizada é replay sem duplicação", replay and replay["applied"] is False and replay["b2bReplay"] and replay["receivableId"] == service_title, replay_error or replay)
        def bridge_race():
            return service_sql(f"SELECT platform_private.b2b_fiscal_invoice_bridge_v1('{invoice_main}');")
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            bridge_races = list(pool.map(lambda _: bridge_race(), range(2)))
        check("duas chamadas service-only concorrentes preservam um único título", all(r.returncode == 0 for r in bridge_races) and B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_main}'").stdout.strip() == "1", [r.stderr[-500:] for r in bridge_races])
        invoice_second, tx_second = B3.u(460), B3.u(461)
        seed_invoice(invoice_second, with_item=True)
        seed_proof(invoice_second, tx_second, protocol="LOCAL-SECOND-PARTIAL")
        second, second_error = service_json(f"public.rpc_fiscal_invoice_apply_authorization_v1('{invoice_second}','{access_key}','LOCAL-SECOND-PARTIAL',now(),'100','LOCAL','{tx_second}');")
        check("segunda NF parcial confirmada tem título próprio", second and second.get("receivableId") and second["receivableId"] != service_title, second_error or second)
        totals = B3.psql(f"SELECT (SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{recovery_order}' AND b2b_document_id IS NOT NULL)||'|'||(SELECT sum(total_amount) FROM public.accounts_receivable WHERE origin_id='{recovery_order}' AND b2b_document_id IS NOT NULL)||'|'||(SELECT financed_total FROM platform_private.b4_order_condition_snapshots WHERE order_id='{recovery_order}')").stdout.strip()
        count_text, allocated_text, economic_text = totals.split("|")
        check("duas NFs parciais não cobram além das alocações e do total econômico", count_text == "2" and Decimal(allocated_text) == Decimal(economic_text) and residual(recovery_order) == 0, totals)

        changed_amount = server_run("", f"BEGIN;UPDATE public.fiscal_invoices SET total_amount=total_amount+1 WHERE id='{invoice_main}';UPDATE public.fiscal_invoice_items SET net_value=net_value+1 WHERE fiscal_invoice_id='{invoice_main}';SET ROLE service_role;SELECT platform_private.b2b_fiscal_invoice_bridge_v1('{invoice_main}');ROLLBACK;")
        if REVIEW_BEFORE:
            check("ANTES: replay aceita valor cabeçalho/item alterado de forma consistente", changed_amount.returncode == 0, changed_amount.stderr)
        else:
            check("DEPOIS: replay com valor alterado diverge e preserva snapshot", changed_amount.returncode != 0 and "FISCAL_REPLAY_DIVERGENCE" in changed_amount.stderr, changed_amount.stderr)
        check("ensaio monetário não altera a NF durável", B3.psql(f"SELECT total_amount::text FROM public.fiscal_invoices WHERE id='{invoice_main}'").stdout.strip() == str(monetary))
        changed_reference = server_run("", f"BEGIN;UPDATE public.fiscal_invoices SET provider_reference='PROVIDER-DIVERGENT' WHERE id='{invoice_main}';SET ROLE service_role;SELECT platform_private.b2b_fiscal_invoice_bridge_v1('{invoice_main}');ROLLBACK;")
        if REVIEW_BEFORE:
            check("ANTES: replay aceita referência de provedor divergente", changed_reference.returncode == 0, changed_reference.stderr)
        else:
            check("DEPOIS: referência divergente é conflito de replay", changed_reference.returncode != 0 and "FISCAL_REPLAY_DIVERGENCE" in changed_reference.stderr, changed_reference.stderr)
        changed_protocol = service_sql(f"SELECT public.rpc_fiscal_invoice_apply_authorization_v1('{invoice_main}','{access_key}','PROTOCOL-DIVERGENT',now(),'100','LOCAL','{tx_main}');")
        if REVIEW_BEFORE:
            check("ANTES: replay aceita protocolo divergente da transmissão", changed_protocol.returncode == 0, changed_protocol.stderr)
        else:
            check("DEPOIS: protocolo divergente é negado antes do replay", changed_protocol.returncode != 0 and "FISCAL_AUTHORIZATION_TRANSMISSION_MISMATCH" in changed_protocol.stderr, changed_protocol.stderr)
        if not REVIEW_BEFORE:
            snapshot_row = B3.psql(f"SELECT source_digest||'|'||(snapshot->>'total_amount')||'|'||(snapshot->>'protocol') FROM platform_private.b2b_fiscal_invoice_snapshots WHERE invoice_id='{invoice_main}'").stdout.strip()
            check("snapshot fiscal privado conserva digest, valor e protocolo", snapshot_row.endswith(f"|{monetary}|LOCAL-PROTOCOL") and len(snapshot_row.split('|')[0]) == 64, snapshot_row)
        canceled_callback = server_run("", f"BEGIN;UPDATE public.fiscal_invoices SET normalized_status='CANCELED',status='CANCELED' WHERE id='{invoice_main}';SET ROLE service_role;SELECT platform_private.b2b_fiscal_invoice_bridge_v1('{invoice_main}');ROLLBACK;")
        check("cancelamento continua sem reversão automática não homologada", canceled_callback.returncode == 0 and B3.psql(f"SELECT status FROM public.accounts_receivable WHERE id='{service_title}'").stdout.strip() == "OPEN", canceled_callback.stderr)

        B3.psql("""CREATE FUNCTION public.b4_test_fail_after_title() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'B4_TEST_POST_TITLE_FAILURE' USING ERRCODE='P0001'; END $$;
 CREATE TRIGGER zz_b4_test_fail_after_title AFTER INSERT ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.b4_test_fail_after_title();""")
        h13_patch = {"cStat":"100","nProt":"H13-PROTOCOL","chNFe":access_key,"xMotivo":"AUTORIZADO","tpAmb":"2","dhRecbto":"2027-02-01T13:00:00Z"}
        h13_failed, h13_failed_error = real_record(tx_h13, "SUCCEEDED", h13_patch)
        check("H13 preserva retorno autorizado quando título falha", h13_failed and h13_failed["reconciliationPending"] and h13_failed["reconciliationCode"] == "FISCAL_AUTHORIZATION_CLOSE_PENDING", h13_failed_error or h13_failed)
        if REVIEW_BEFORE or PARSER_BEFORE:
            check("falha de título não apaga evidência externa nem deixa NF/título parcial", B3.psql(f"SELECT (SELECT outcome||'|'||error_code FROM public.fiscal_sefaz_transmissions WHERE id='{tx_h13}')||'|'||(SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_h13}')||'|'||(SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_h13}')").stdout.strip() == "AUTHORIZED|FISCAL_AUTHORIZATION_CLOSE_PENDING|PENDING|0")
        else:
            h13_evidence = B3.psql(f"SELECT (SELECT outcome||'|'||error_code FROM public.fiscal_sefaz_transmissions WHERE id='{tx_h13}')||'|'||(SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_h13}')||'|'||(SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_h13}')").stdout.strip()
            check("guarda terminal preserva transmissão/erro estranho e pendência privada sem NF/título parcial", h13_evidence == "AUTHORIZED|FOREIGN_PROVIDER_ERROR|PENDING|0" and pending_code(tx_h13) == "FISCAL_AUTHORIZATION_CLOSE_PENDING", h13_evidence)
        B3.psql("DROP TRIGGER zz_b4_test_fail_after_title ON public.accounts_receivable;DROP FUNCTION public.b4_test_fail_after_title();")
        h13_retry, h13_retry_error = real_record(tx_h13, "SUCCEEDED", h13_patch)
        check("retry H13 recupera título sem reenviar emissão", h13_retry and not h13_retry["reconciliationPending"] and B3.psql(f"SELECT (SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_h13}')||'|'||(SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_h13}')").stdout.strip() == "AUTHORIZED|1", h13_retry_error or h13_retry)
        if REVIEW_BEFORE:
            check("ANTES: retry deixa erro de reconciliação obsoleto na transmissão", B3.psql(f"SELECT error_code FROM public.fiscal_sefaz_transmissions WHERE id='{tx_h13}'").stdout.strip() == "FISCAL_AUTHORIZATION_CLOSE_PENDING")
        else:
            check("DEPOIS: retry H13 limpa somente a pendência privada e preserva erro estranho", pending_code(tx_h13) == "" and B3.psql(f"SELECT error_code FROM public.fiscal_sefaz_transmissions WHERE id='{tx_h13}'").stdout.strip() == "FOREIGN_PROVIDER_ERROR")

        # Nova transmissão/confirmação da MESMA chave e protocolo: o ID é evidência
        # adicional, não parte da identidade fiscal estável nem motivo de conflito.
        seed_proof(invoice_h13,tx_h13_repeat,protocol="H13-PROTOCOL",state="SENT",outcome="PENDING",cstat="103")
        repeated_record, repeated_error = real_record(tx_h13_repeat,"SUCCEEDED",h13_patch)
        repeated_state = B3.psql(f"SELECT outcome||'|'||coalesce(error_code,'') FROM public.fiscal_sefaz_transmissions WHERE id='{tx_h13_repeat}'").stdout.strip()
        if PARSER_BEFORE:
            check("ANTES: nova transmissão da mesma chave/protocolo causa conflito artificial pelo transmission_id no digest", repeated_record and repeated_record["reconciliationPending"] and repeated_state == "AUTHORIZED|FISCAL_AUTHORIZATION_CLOSE_PENDING", repeated_error or repeated_state)
        else:
            check("DEPOIS: confirmação repetida da mesma chave/protocolo é replay sem conflito artificial", repeated_record and not repeated_record["reconciliationPending"] and repeated_state == "AUTHORIZED|", repeated_error or repeated_state)
            check("DEPOIS: replay estável preserva transmissão original no snapshot e um único título", B3.psql(f"SELECT transmission_id FROM platform_private.b2b_fiscal_invoice_snapshots WHERE invoice_id='{invoice_h13}'").stdout.strip() == tx_h13 and B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_h13}'").stdout.strip() == "1")
        seed_proof(invoice_h13,tx_h13_divergent,protocol="H13-PROTOCOL-DIVERGENT",state="SENT",outcome="PENDING",cstat="103")
        divergent_record, divergent_error = real_record(tx_h13_divergent,"SUCCEEDED",{**h13_patch,"nProt":"H13-PROTOCOL-DIVERGENT"})
        check("confirmação com protocolo divergente continua fechada sem duplicar título", divergent_record and divergent_record["reconciliationPending"] and B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_h13}'").stdout.strip() == "1", divergent_error or divergent_record)
        if not PARSER_BEFORE:
            check("divergência de protocolo não substitui referência fiscal original", B3.psql(f"SELECT transmission_id||'|'||protocol FROM platform_private.b2b_fiscal_invoice_snapshots WHERE invoice_id='{invoice_h13}'").stdout.strip() == f"{tx_h13}|H13-PROTOCOL")

        # Retorno atrasado não pode rebaixar uma transmissão já autorizada nem
        # apagar erro de provedor/origem distinta do pendente de fechamento.
        if REVIEW_BEFORE or PARSER_BEFORE:
            B3.psql(f"UPDATE public.fiscal_sefaz_transmissions SET error_code='FOREIGN_PROVIDER_ERROR' WHERE id='{tx_h13}';")
        stale_record, stale_error = real_record(tx_h13,"SENT",{"cStat":"103","xMotivo":"RETORNO ATRASADO"})
        stale_state = B3.psql(f"SELECT outcome||'|'||c_stat||'|'||coalesce(error_code,'') FROM public.fiscal_sefaz_transmissions WHERE id='{tx_h13}'").stdout.strip()
        if PARSER_BEFORE:
            check("ANTES: retorno SENT atrasado rebaixa AUTHORIZED para PENDING e sobrescreve 100 por 103", stale_record and stale_record["outcome"] == "PENDING" and stale_state == "PENDING|103|FOREIGN_PROVIDER_ERROR", stale_error or stale_state)
        else:
            check("DEPOIS: retorno atrasado não rebaixa autorização nem apaga erro de outra origem", stale_record and stale_record["outcome"] == "AUTHORIZED" and stale_state == "AUTHORIZED|100|FOREIGN_PROVIDER_ERROR", stale_error or stale_state)
        foreign_error_replay, foreign_error_replay_error = real_record(tx_h13,"SUCCEEDED",h13_patch)
        check("replay autorizado não limpa error_code estranho ao fechamento", foreign_error_replay and B3.psql(f"SELECT error_code FROM public.fiscal_sefaz_transmissions WHERE id='{tx_h13}'").stdout.strip() == "FOREIGN_PROVIDER_ERROR", foreign_error_replay_error or foreign_error_replay)
        if not REVIEW_BEFORE and not PARSER_BEFORE:
            terminal_mutation = server_run("", f"UPDATE public.fiscal_sefaz_transmissions SET error_code='MUTACAO_PROIBIDA' WHERE id='{tx_h13}';")
            check("guarda real continua negando UPDATE terminal após os replays", terminal_mutation.returncode != 0 and "FISCAL_TRANSMISSION_IMMUTABLE" in terminal_mutation.stderr and B3.psql(f"SELECT error_code FROM public.fiscal_sefaz_transmissions WHERE id='{tx_h13}'").stdout.strip() == "FOREIGN_PROVIDER_ERROR", terminal_mutation.stderr)
        if not PARSER_BEFORE:
            with concurrent.futures.ThreadPoolExecutor(2) as pool:
                concurrent_records = list(pool.map(lambda call: real_record(tx_h13,call[0],call[1]), [("SENT",{"cStat":"103","xMotivo":"ATRASADO CONCORRENTE"}),("SUCCEEDED",h13_patch)]))
            check("H13 concorrente fora de ordem termina autorizado, com protocolo estável e erro estranho preservado", all(row[0] for row in concurrent_records) and B3.psql(f"SELECT outcome||'|'||c_stat||'|'||protocol_c_stat||'|'||error_code FROM public.fiscal_sefaz_transmissions WHERE id='{tx_h13}'").stdout.strip() == "AUTHORIZED|100|100|FOREIGN_PROVIDER_ERROR", [row[1] for row in concurrent_records])
            check("concorrência H13 não duplica NF, snapshot ou título", B3.psql(f"SELECT (SELECT count(*) FROM public.fiscal_invoices WHERE id='{invoice_h13}')||'|'||(SELECT count(*) FROM platform_private.b2b_fiscal_invoice_snapshots WHERE invoice_id='{invoice_h13}')||'|'||(SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_h13}')").stdout.strip() == "1|1|1")

        # Revisão 1a65c9c: o gatilho temporário pausa H13 no UPDATE que já
        # possui o row lock da transmissão. H12/ponte usam outra conexão real;
        # nenhum lock ou guarda do candidato é removido ou substituído.
        B3.psql("""CREATE FUNCTION public.b4_test_pause_authorized_tx() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF NEW.outcome='AUTHORIZED' AND OLD.outcome IS DISTINCT FROM 'AUTHORIZED' THEN PERFORM pg_sleep(1.2); END IF;
 RETURN NEW;END $$;
CREATE TRIGGER zz_b4_test_pause_authorized_tx BEFORE UPDATE ON public.fiscal_sefaz_transmissions
 FOR EACH ROW EXECUTE FUNCTION public.b4_test_pause_authorized_tx();""")
        def race_service_sql(sql):
            # deadlock_timeout exige superusuário; configura antes de SET ROLE.
            return server_run("", "SET deadlock_timeout='100ms';SET lock_timeout='6s';SET ROLE service_role;" + sql)
        def lock_race(invoice_id, transmission_id, protocol, direct_sql):
            patch = {"cStat":"100","nProt":protocol,"chNFe":access_key,"xMotivo":"AUTORIZADO LOCK RACE","tpAmb":"2","dhRecbto":"2027-02-01T14:00:00Z"}
            log_path = tmp / "log"
            log_offset = log_path.stat().st_size
            with concurrent.futures.ThreadPoolExecutor(2) as pool:
                h13_future = pool.submit(race_service_sql, f"SELECT public.rpc_fiscal_sefaz_transmit_record_v1('{transmission_id}','SUCCEEDED','{js(patch)}'::jsonb);")
                time.sleep(0.25)
                direct_future = pool.submit(race_service_sql, direct_sql)
                h13_result = h13_future.result()
                direct_result = direct_future.result()
            with log_path.open("rb") as stream:
                stream.seek(log_offset)
                deadlock_log = stream.read().decode("utf-8", errors="replace")
            return h13_result, direct_result, deadlock_log, patch

        lock_h12_sql = f"SELECT public.rpc_fiscal_invoice_apply_authorization_v1('{invoice_lock_h12}','{access_key}','LOCK-H12-PROTOCOL',now(),'100','LOCK RACE','{tx_lock_h12}');"
        lock_h13_result, lock_h12_result, lock_h12_log, lock_h12_patch = lock_race(invoice_lock_h12, tx_lock_h12, "LOCK-H12-PROTOCOL", lock_h12_sql)
        if LOCK_BEFORE:
            check("ANTES: H13 transmissão→nota contra H12 nota→transmissão produz deadlock real", "deadlock detected" in lock_h12_log, lock_h12_log[-1600:])
        else:
            check("DEPOIS: H13 e H12 na mesma NF/transmissão seguem nota→transmissão sem deadlock", "deadlock detected" not in lock_h12_log and lock_h13_result.returncode == 0 and lock_h12_result.returncode == 0, [lock_h13_result.stderr, lock_h12_result.stderr, lock_h12_log[-1200:]])
        lock_h12_recovery, lock_h12_recovery_error = real_record(tx_lock_h12, "SUCCEEDED", lock_h12_patch)
        check("corrida H13/H12 é recuperável sem apagar retorno externo", lock_h12_recovery and lock_h12_recovery["outcome"] == "AUTHORIZED" and not lock_h12_recovery["reconciliationPending"] and pending_code(tx_lock_h12) == "", lock_h12_recovery_error or lock_h12_recovery)
        check("corrida não-B2B não cria documento/título", B3.psql(f"SELECT (SELECT count(*) FROM platform_private.b2b_authorized_documents WHERE id='{invoice_lock_h12}')||'|'||(SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_lock_h12}')").stdout.strip() == "0|0")

        lock_bridge_log = ""
        lock_bridge_result = lock_bridge_direct = None
        if not LOCK_BEFORE:
            lock_bridge_sql = f"SELECT platform_private.b2b_fiscal_invoice_bridge_v1('{invoice_lock_bridge}');"
            lock_bridge_result, lock_bridge_direct, lock_bridge_log, lock_bridge_patch = lock_race(invoice_lock_bridge, tx_lock_bridge, "LOCK-BRIDGE-PROTOCOL", lock_bridge_sql)
            check("DEPOIS: H13 e ponte direta que trava a nota não invertem locks nem fazem deadlock", "deadlock detected" not in lock_bridge_log and lock_bridge_result.returncode == 0 and lock_bridge_direct.returncode == 0, [lock_bridge_result.stderr, lock_bridge_direct.stderr, lock_bridge_log[-1200:]])
            lock_bridge_recovery, lock_bridge_recovery_error = real_record(tx_lock_bridge, "SUCCEEDED", lock_bridge_patch)
            check("ponte direta concorrente preserva evidência e fecha sem duplicar documento/título", lock_bridge_recovery and not lock_bridge_recovery["reconciliationPending"] and B3.psql(f"SELECT (SELECT count(*) FROM platform_private.b2b_authorized_documents WHERE id='{invoice_lock_bridge}')||'|'||(SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_lock_bridge}')").stdout.strip() == "1|1", lock_bridge_recovery_error or lock_bridge_recovery)
        B3.psql("DROP TRIGGER zz_b4_test_pause_authorized_tx ON public.fiscal_sefaz_transmissions;DROP FUNCTION public.b4_test_pause_authorized_tx();")
        (OUT / "lock-ordering.json").write_text(json.dumps({
            "mode": "BEFORE_CANDIDATE_LOCK_CHARACTERIZATION" if LOCK_BEFORE else "AFTER_CANDIDATE",
            "same_invoice_transmission": True,
            "pause": "temporary BEFORE UPDATE trigger after H13 acquired transmission row lock; candidate locks/guards unchanged",
            "h13_h12": {"deadlock_detected": "deadlock detected" in lock_h12_log, "h13_exit": lock_h13_result.returncode, "h12_exit": lock_h12_result.returncode, "postgres_log": lock_h12_log[-3000:]},
            "h13_direct_bridge": None if LOCK_BEFORE else {"deadlock_detected": "deadlock detected" in lock_bridge_log, "h13_exit": lock_bridge_result.returncode, "bridge_exit": lock_bridge_direct.returncode, "postgres_log": lock_bridge_log[-3000:]},
            "hosted": False, "provider_called": False,
        }, indent=2, ensure_ascii=False) + "\n")

        foreign = service_sql(f"SELECT platform_private.b2b_fiscal_invoice_bridge_v1('{invoice_foreign}');")
        check("NF com tenant divergente do pedido é negada", foreign.returncode != 0 and "B2B_FISCAL_ORDER_SCOPE_INVALID" in foreign.stderr, foreign.stderr[-800:])
        check("NF estrangeira não gera documento/título", B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_foreign}'").stdout.strip() == "0")
        legacy_after_bridge = B3.u(398)
        legacy_insert = manual_title(legacy_after_bridge, unlinked_customer, "3.00")
        check("inserção não-B2B com ator preserva recorrência/importação legada", legacy_insert.returncode == 0, legacy_insert.stderr[-800:])
        legacy_update = server_run(B3.UFIN, f"UPDATE public.accounts_receivable SET description='LEGADO ATUALIZADO',partner_id=partner_id WHERE id='{legacy_after_bridge}';")
        check("UPDATE de título legado não exige permit fiscal B2B", legacy_update.returncode == 0 and B3.psql(f"SELECT description FROM public.accounts_receivable WHERE id='{legacy_after_bridge}'").stdout.strip() == "LEGADO ATUALIZADO", legacy_update.stderr[-800:])
        null_manual = server_run(B3.UFIN, f"""INSERT INTO public.accounts_receivable(id,organization_id,origin_type,customer_id,description,category_id,total_amount,issue_date,first_due_date,installment_count,status,payment_method_id,created_by)
 VALUES('{B3.u(399)}','{B3.A}','MANUAL','{CUSTOMER}','SEM AUTOR','{category_id}',1,CURRENT_DATE,CURRENT_DATE,1,'OPEN','{B3.M_BOL}',NULL);""")
        expected_null_error = "B2B_SERVICE_ORIGIN_REQUIRED" if REVIEW_BEFORE else "RECEIVABLE_CREATED_BY_REQUIRED"
        check("origem manual sem ator continua fechada sem afrouxar NOT NULL legado", null_manual.returncode != 0 and expected_null_error in null_manual.stderr, null_manual.stderr[-800:])
        bridge_allocations = B3.psql("SELECT count(*) FROM platform_private.b2b_document_allocations").stdout.strip()
        strict_rollback = strict_file("04-rollback-deny.sql.review")
        check("rollback estrito restaura somente negação e preserva títulos/alocações", strict_rollback.returncode == 0 and B3.psql("SELECT pg_get_functiondef('platform_private.b2b_integration_dependencies()'::regprocedure) LIKE '%B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN%'").stdout.strip() == "t", strict_rollback.stderr[-1200:])
        bridge_rollback = bridge_file("04-rollback-deny.sql.review")
        check("rollback deny-only da ponte fecha callback e preserva histórico", bridge_rollback.returncode == 0 and B3.psql("SELECT count(*) FROM platform_private.b2b_document_allocations").stdout.strip() == bridge_allocations, bridge_rollback.stderr[-900:])
        check("rollback da ponte não reabre alocador nem exceção manual", B3.psql("SELECT has_function_privilege('service_role','platform_private.b2b_fiscal_invoice_bridge_v1(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamptz,text,text,uuid)','EXECUTE')").stdout.strip() == "f")
        result_code = 0 if all(c["ok"] for c in CHECKS) else 1
    except Exception as exc:
        check("execução sem exceção de harness", False, repr(exc))
        result_code = 1
    finally:
        subprocess.run(B3.SP.su() + ["pg_ctl", "-D", str(tmp / "d"), "-m", "fast", "stop"], capture_output=True)
        evidence = {
            "kind": "DISPOSABLE_STRICT_FISCAL_PERMIT_TO_RECEIVABLE_REVIEW_ONLY_NOT_HOSTED",
            "review": "458b6012+4097d4e2+manual-null-1813+fiscal-units-grams-1f4073+final-credit-terms-1833+ab904bf",
            "review_ab904bf_mode": "BEFORE_VULNERABILITY_CHARACTERIZATION" if REVIEW_BEFORE else "AFTER_CANDIDATE",
            "status": "INACTIVE_BLOCKED_PENDING_LIVE_DATA_IMPACT_AND_HOMOLOGATION_NOT_APPROVED",
            "historical_63_not_added": "review-458b6012/historical-63/evidence-b4-b3.json",
            "object_manifest": "b4-object-manifest.json",
            "live_facts": ["USER_REPORTED_READONLY_4097D4E2", "USER_REPORTED_READONLY_MANUAL_NULL_1813; cinco títulos não lidos nem alterados pelo agente"],
            "installation": "DISPOSABLE_PRE_INSTALL_POST_ROLLBACK_PASS; positive only after strict permit validator; no always-allow stub",
            "credit_limit_zero_review": {"zero": "VALID_LIMIT_ZERO_POSITIVE_EXPOSURE_LIMIT_EXCEEDED", "null_negative_nan": "CREDIT_SETTINGS_INCOMPLETE", "live_settings_changed": False},
            "shared_impact_scope": ["credit_limit zero/NULL/negativo/NaN em parceiro isolado sem exposição", "cinco MANUAL partner_id NULL + cliente único, 4 OPEN/1 OVERDUE", "múltiplos parceiros no mesmo cliente", "conflito partner_id/customer_id/owner", "MANUAL não B2B sem parceiro: parcela e baixa legadas", "MANUAL não B2B com parceiro: exposição e baixa MONEY_ORIGIN_UNPROVEN", "pedidos atuais inalterados e nova simulação do parceiro bloqueada", "origem monetária legada desconhecida", "pedido interno sintético", "writer integral antigo"],
            "passed": sum(c["ok"] for c in CHECKS), "total": len(CHECKS), "checks": CHECKS,
            "hosted": "NOT_RUN", "jwt_rls_storage": "NOT_RUN",
            "synthetic_seams": ["Auth por GUC/roles locais", "adaptador servidor local sem SET ROLE para funções privadas; negação cliente testada separadamente", "schema financeiro capturado com FK/RLS externos omitidos", "títulos históricos criados antes do trigger candidato com dez gatilhos atuais ativos; nenhum backfill", "company_fiscal_settings fictícia VALIDATED", "autorização/cancelamento fiscal privado fictício sem rede", "nenhuma substituição permissiva; validador exige permit txid + NF + protocolo + tenant + contabilidade VALIDATED sintética", "c2_order_partner_recipients sintética sem destinatários, somente para concluir aprovação", "entregas mínima para o fence"],
            "b3_overloads_restored": False,
            "historical_301bf597": "não liberado; componentes B4 extraídos e adaptados, não prova de equivalência",
        }
        evidence_path = OUT / "evidence-b4-shared-impact.json"
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    return result_code


if __name__ == "__main__":
    sys.exit(main())
