#!/usr/bin/env python3
"""B4 somente local sobre B3 REAL instalado no PG descartável. Sem rede/hosted/JWT real."""
import concurrent.futures
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
from decimal import Decimal

H = pathlib.Path(__file__).resolve().parent
ROOT = H.parents[2]
B3DIR = ROOT / "scripts/b2b-payment-condition-v1-rebase-20261106"
CAPTURE = ROOT / "scripts/delivery-atomic-hardening-20261030/capture/current.json"
MONEY = ROOT / "scripts/financial-installments-initial-20261024/receivable-semantics-live-20261028.json"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


B3 = load("b3_for_b4", B3DIR / "test-local-pg.py")
B3.SP.PORT = "55489"
G = B3.g
CHECKS = []
CUSTOMER = B3.u(301)
DOCS = [B3.u(310 + i) for i in range(10)]
BOL = B3.ch("boleto", 1, 30)


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
    names = ["accounts_receivable", "accounts_receivable_installments", "receivable_payments", "financial_receipts", "financial_audit_log"]
    for name in names:
        table = next(t for t in live["tables"] if t["name"] == name)
        cols = [f"{c['name']} {c['type']}" + (" DEFAULT " + c["default"] if c["default"] else "") + (" NOT NULL" if c["notnull"] else "") for c in table["columns"]]
        constraints = [f"CONSTRAINT {c['name']} {c['definition']}" for c in table["constraints"] if not c["definition"].startswith("FOREIGN KEY")]
        B3.psql(f"CREATE TABLE public.{name} (" + ",".join(cols + constraints) + ")")
    for index in live["indexes"]:
        if index["unique"] and not index["name"].endswith("_pkey"):
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
    included = {"trg_ar_gen_installments", "trg_h6_ar_snapshot", "trg_audit_ar", "trg_h6_ari_snapshot", "trg_h6_rp_append_only",
                "trg_recalc_ar_inst", "trg_audit_rp", "trg_assign_receipt_metadata", "trg_sync_receipt_aliases"}
    for table in live["tables"]:
        if table["name"] in names + ["partner_order_payment_schedule"]:
            for trigger in table["triggers"] or []:
                if trigger["name"] in included:
                    exists = B3.psql(f"SELECT count(*) FROM pg_trigger WHERE tgname='{trigger['name']}'").stdout.strip()
                    if exists == "0":
                        B3.psql(trigger["definition"] + ";")


def document(doc_id, order, item, quantity, issue="2026-10-01", event=None):
    items = [{"item_id": item, "quantity": quantity}]
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
CREATE FUNCTION platform_private.c2_order_partner_recipients(uuid) RETURNS SETOF uuid LANGUAGE sql AS $$SELECT NULL::uuid WHERE FALSE$$;""")
        for name in ["approve_b2b_payment_terms_secure", "approve_partner_order", "fn_b2b_order_priceable", "fn_b2b_order_billing_eligibility", "is_financial_staff", "fn_authz_uid_scope_ok",
                     "generate_b2b_receivable_secure", "generate_b2b_receivable_secure_impl", "tg_auto_b2b_receivable",
                     "fn_generate_receivable_from_entrega", "rpc_fiscal_invoice_apply_authorization_v1"]:
            function = captured_function(name)
            B3.psql(function["body"] + ";")
        B3.psql("""REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_generate_receivable_from_entrega(uuid,jsonb) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.fn_generate_receivable_from_entrega(uuid,jsonb) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamp with time zone,text,text,uuid) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamp with time zone,text,text,uuid) TO service_role;
ALTER TABLE public.partner_order_payment_schedule ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();""")
        B3.psql(f"""ALTER TABLE public.partner_accounts ADD COLUMN IF NOT EXISTS client_id uuid;
CREATE TABLE IF NOT EXISTS public.clientes(id uuid PRIMARY KEY,organization_id uuid);
INSERT INTO public.clientes(id,organization_id) VALUES('{CUSTOMER}','{B3.A}') ON CONFLICT (id) DO NOTHING;
UPDATE public.partner_accounts SET client_id='{CUSTOMER}' WHERE id='{B3.P}'""")
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

        # Pedido ainda pendente de contabilidade: fixture separada, nunca promovida artificialmente.
        B3.psql(f"DELETE FROM public.company_fiscal_settings WHERE organization_id='{B3.A}'")
        data, error = B3.sim(B3.UB, B3.P3, [B3.L(1)], BOL)
        data, error = B3.create(B3.UB, B3.P3, [B3.L(1)], data and data["cart_hash"], "TESTE-B4-PENDING", BOL)
        pending_order = data and data["id"]
        pending_item = B3.psql(f"SELECT id FROM public.partner_order_items WHERE order_id='{pending_order}'").stdout.strip()
        check("fixture contábil pendente separada", B3.psql(f"SELECT c2_external_origin_snapshot->>'contract' FROM public.partner_orders WHERE id='{pending_order}'").stdout.strip() == "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1")

        finance_schema()
        pre = runfile(H / "01-pre.sql.readonly")
        check("PRE revisado falha fechado sobre baseline incompleta", pre.returncode != 0 and "B4_" in pre.stderr, pre.stderr[-1200:])
        install = runfile(H / "02-install.sql.review")
        check("instalação não sobrescreve desconhecido nem cria objetos", install.returncode != 0 and B3.psql("SELECT to_regclass('platform_private.b2b_authorized_documents') IS NULL").stdout.strip() == "t", install.stderr[-1200:])
        # COMPONENTE SOMENTE NO PG DESCARTÁVEL: o pacote instalável continua bloqueado.
        # Executar o corpo aqui não é PRE/POST nem evidência de instalação/produção.
        component = runfile(H / "b4-candidate.sql.review")
        check("corpo B4 executável apenas como componente descartável", component.returncode == 0, component.stderr[-1200:])
        rerun = runfile(H / "02-install.sql.review")
        check("rerun continua bloqueado e não reinstala", rerun.returncode != 0 and "B4_" in rerun.stderr, rerun.stderr[-700:])
        check("instalação não substitui dependência operacional por stub", "CREATE OR REPLACE FUNCTION platform_private.b2b_integration_dependencies" not in (H / "02-install.sql.review").read_text())
        trigger_count = B3.psql("SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgrelid IN ('public.partner_orders'::regclass,'public.partner_order_items'::regclass,'public.partner_order_payment_terms'::regclass,'public.partner_order_payment_schedule'::regclass)").stdout.strip()
        check("32 gatilhos reais carregados pelo harness B3 continuam habilitados", trigger_count == "32", trigger_count)
        check("B3 create/simulate antigos não foram restaurados nem alterados", B3.md5_of(B3.CREATE_SIG) == G["LIVE_PINS"][B3.CREATE_SIG] and B3.md5_of(B3.SIM_SIG) == G["LIVE_PINS"][B3.SIM_SIG]
              and B3.psql("SELECT to_regprocedure('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text,jsonb)') IS NULL").stdout.strip() == "t")
        check("autorização fiscal continua service-only e sem integração de recebível", B3.psql("SELECT has_function_privilege('authenticated','public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamp with time zone,text,text,uuid)','EXECUTE')").stdout.strip() == "f"
              and "accounts_receivable" not in captured_function("rpc_fiscal_invoice_apply_authorization_v1")["body"])

        document(DOCS[0], quote_order, quote_item, 1)
        deny("gate fiscal/contábil não comprovado permanece fechado", allocate(B3.UADM, DOCS[0]), "B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN")
        deny("cliente não invoca alocador privado", B3.out(B3.as_user(B3.UADM, f"SELECT platform_private.b2b_allocate_document('{DOCS[0]}')::text;")), "permission denied")
        # Costura SOMENTE do harness: adaptador fictício sem rede, após provar a negação real.
        B3.psql("CREATE OR REPLACE FUNCTION platform_private.b2b_integration_dependencies() RETURNS void LANGUAGE sql AS $$SELECT$$;")

        before = exposure()
        data, error = allocate(B3.UADM, DOCS[0])
        check("primeira NF parcial autorizada fictícia gera título", data and data["success"] and not data["replayed"], error or data)
        title1 = data and data["receivable_id"]
        check("conversão não duplica exposição", exposure() == before, f"{before} -> {exposure()}")
        check("residual = pedido restante + títulos sem dupla contagem", residual(quote_order) > 0)
        data2, error2 = allocate(B3.UADM, DOCS[0])
        check("replay da mesma autorização devolve mesmo título", data2 and data2["replayed"] and data2["receivable_id"] == title1, error2 or data2)
        check("replay não duplica alocação", B3.psql("SELECT count(*) FROM platform_private.b2b_document_allocations").stdout.strip() == "1")
        rows1 = sql_json(f"SELECT jsonb_agg(to_jsonb(i) ORDER BY installment_number) FROM public.accounts_receivable_installments i WHERE receivable_id='{title1}'")
        check("datas finais partem da emissão e calendário selado", rows1[0]["due_date"] == "2026-11-03", rows1)
        check("juros financiados não são somados duas vezes", all(Decimal(str(r["original_amount"])) == Decimal(str(r["net_amount"])) and Decimal(str(r["interest_amount"])) == 0 for r in rows1), rows1)

        projection, projection_error = server_call(B3.UFIN, f"public.rpc_receivable_money_projection_v1('{title1}',0,1000)")
        check("projeção financeira usa ator e tenant autorizados", projection is not None, projection_error)
        installment1 = projection[0]["id"]
        payment = {"amount_received": 10, "payment_method_id": B3.M_BOL, "idempotency_key": "TESTE-B4-PAY-1"}
        payment_result = B3.as_user(B3.UFIN, f"SELECT public.rpc_register_receivable_payment('{installment1}','{js(payment)}'::jsonb)::text;")
        check("baixa parcial local no ledger capturado", payment_result.returncode == 0, (payment_result.stderr + payment_result.stdout)[-900:])
        check("baixa reduz somente título, não residual do pedido", exposure() == before - Decimal("10") and residual(quote_order) > 0)

        document(DOCS[1], quote_order, quote_item, 1, issue="2026-11-01")
        document(DOCS[2], quote_order, quote_item, 1, issue="2026-12-01")
        second, error = allocate(B3.UADM, DOCS[1])
        third, error3 = allocate(B3.UADM, DOCS[2])
        check("três documentos independentes fecham quantidade e residual", second and third and residual(quote_order) == 0, error or error3)
        check("três títulos, um por documento", B3.psql(f"SELECT count(*) FROM platform_private.b2b_document_allocations WHERE order_id='{quote_order}'").stdout.strip() == "3")
        check("crédito após parciais preserva total menos baixa", exposure() == before - Decimal("10"), exposure())

        before_paid = B3.psql(f"SELECT jsonb_build_object('alloc',(SELECT count(*) FROM platform_private.b2b_document_allocations),'pay',(SELECT count(*) FROM receivable_payments),'residual',platform_private.b2b_order_residual('{quote_order}'))").stdout.strip()
        deny("cancelamento de NF paga exige reconciliação", allocate(B3.UADM, DOCS[0]) if False else server_call(B3.UADM, f"platform_private.b2b_reverse_allocation('{DOCS[0]}')"), "FISCAL_PAID_RECONCILIATION_REQUIRED")
        check("cancelamento pago negado preserva histórico e saldo", B3.psql(f"SELECT jsonb_build_object('alloc',(SELECT count(*) FROM platform_private.b2b_document_allocations),'pay',(SELECT count(*) FROM receivable_payments),'residual',platform_private.b2b_order_residual('{quote_order}'))").stdout.strip() == before_paid)

        canceled_money = B3.psql(f"SELECT item_money FROM platform_private.b2b_document_allocations WHERE document_id='{DOCS[1]}'").stdout.strip()
        attestation = server_run(B3.UADM, f"INSERT INTO platform_private.b2b_cancellation_attestations VALUES('{DOCS[1]}','{B3.A}','cancel-middle','{'b'*64}');")
        check("atestação fictícia de cancelamento passa pela guarda com ator", attestation.returncode == 0, attestation.stderr[-700:])
        reversed_result, reversed_error = server_call(B3.UADM, f"platform_private.b2b_reverse_allocation('{DOCS[1]}')")
        check("substituição intermediária cancela somente título não pago", reversed_result and reversed_result["success"], reversed_error)
        restored = residual(quote_order)
        check("cancelamento restaura exatamente principal+juros do documento", restored == Decimal(str(second["principal"])) + Decimal(str(second["financed_interest"])), restored)
        document(DOCS[3], quote_order, quote_item, 1, issue="2027-01-04")
        replacement, replacement_error = allocate(B3.UADM, DOCS[3])
        check("documento substituto consome residual sem duplicar", replacement and residual(quote_order) == 0, replacement_error)
        check("substituição intermediária preserva centavos por item", B3.psql(f"SELECT item_money FROM platform_private.b2b_document_allocations WHERE document_id='{DOCS[3]}'").stdout.strip() == canceled_money)
        check("histórico do título cancelado permanece", B3.psql(f"SELECT status FROM public.accounts_receivable WHERE id='{second['receivable_id']}'").stdout.strip() == "CANCELED")

        document(DOCS[4], quote_order, quote_item, 1)
        deny("quantidade acima do pedido negada", allocate(B3.UADM, DOCS[4]), "FISCAL_QUANTITY_OVERALLOCATED")
        deny("tenant estrangeiro não faz replay nem lê recibo", server_call(B3.UADMF, f"platform_private.b2b_allocate_document('{DOCS[0]}')"), "forbidden_partner")
        document(DOCS[5], pending_order, pending_item, 1)
        deny("pendência contábil bloqueia antes de qualquer título", allocate(B3.UADM, DOCS[5]), "C2_ACCOUNTING_PENDING")
        deny("writer B2B anterior continua negado após instalação", call(B3.UADM, f"public.generate_b2b_receivable_secure('{quote_order}')"), "B2B_AUTHORIZED_FISCAL_DOCUMENT_REQUIRED")

        # Snapshot direto B3, calendário fora da cobertura e corrida por saldo remanescente.
        document(DOCS[6], direct_order, direct_item, 1)
        direct_result, direct_error = allocate(B3.UADM, DOCS[6])
        check("snapshot B3 não cotado também aloca", direct_result and direct_result["success"], direct_error)
        document(DOCS[7], direct_order, direct_item, 1, issue="2028-01-03")
        deny("fora da cobertura do calendário falha fechado", allocate(B3.UADM, DOCS[7]), "CALENDAR_COVERAGE_EXCEEDED")
        for doc, event in [(DOCS[8], "race-a"), (DOCS[9], "race-b")]:
            document(doc, direct_order, direct_item, 999, issue="2027-02-01", event=event)
        def race(doc):
            return subprocess.run(B3.SP.su() + ["psql", "-X", "-q", "-t", "-A", "-h", B3.SP.SOCK[0], "-p", B3.SP.PORT, "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1"], input=f"SELECT set_config('request.jwt.claim.sub','{B3.UADM}',false) \\g /dev/null\nSELECT platform_private.b2b_allocate_document('{doc}');", text=True, capture_output=True)
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            races = list(pool.map(race, [DOCS[8], DOCS[9]]))
        check("duas sessões: somente uma consome o saldo final", sum(r.returncode == 0 for r in races) == 1 and any("FISCAL_QUANTITY_OVERALLOCATED" in r.stderr for r in races), [r.stderr[-500:] for r in races])
        check("corrida não duplica título nem residual", residual(direct_order) == 0 and B3.psql(f"SELECT count(*) FROM platform_private.b2b_document_allocations WHERE order_id='{direct_order}'").stdout.strip() == "2")

        allocations_before = B3.psql("SELECT count(*) FROM platform_private.b2b_document_allocations").stdout.strip()
        rollback = runfile(H / "04-rollback-deny.sql.review")
        check("rollback deny-only conclui", rollback.returncode == 0, rollback.stderr[-700:])
        check("rollback preserva alocações, títulos e snapshots", B3.psql("SELECT count(*) FROM platform_private.b2b_document_allocations").stdout.strip() == allocations_before
              and B3.psql("SELECT count(*) FROM platform_private.b2b_order_condition_snapshots").stdout.strip() >= "3")
        check("rollback fecha writer manual e projeção ao cliente", B3.psql("SELECT has_function_privilege('authenticated','public.generate_b2b_receivable_secure(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.rpc_receivable_money_projection_v1(uuid,integer,integer)','EXECUTE')").stdout.strip() == "f")
        result_code = 0 if all(c["ok"] for c in CHECKS) else 1
    except Exception as exc:
        check("execução sem exceção de harness", False, repr(exc))
        result_code = 1
    finally:
        subprocess.run(B3.SP.su() + ["pg_ctl", "-D", str(tmp / "d"), "-m", "fast", "stop"], capture_output=True)
        evidence = {
            "kind": "DISPOSABLE_B4_ON_REAL_B3_COMPONENTS_NOT_HOSTED_E2E",
            "passed": sum(c["ok"] for c in CHECKS), "total": len(CHECKS), "checks": CHECKS,
            "hosted": "NOT_RUN", "jwt_rls_storage": "NOT_RUN",
            "synthetic_seams": ["Auth por GUC/roles locais", "adaptador servidor local sem SET ROLE para funções privadas; negação cliente testada separadamente", "schema financeiro capturado com FK/RLS externos omitidos", "company_fiscal_settings fictícia VALIDATED", "autorização/cancelamento fiscal privado fictício sem rede", "b2b_integration_dependencies substituída somente após prova de negação", "c2_order_partner_recipients sintética sem destinatários, somente para concluir aprovação", "entregas mínima para o fence"],
            "b3_overloads_restored": False,
            "historical_301bf597": "não liberado; componentes B4 extraídos e adaptados, não prova de equivalência",
        }
        (H / "evidence-b4-b3.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    return result_code


if __name__ == "__main__":
    sys.exit(main())
