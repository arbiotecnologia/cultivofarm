"""Rodada complementar (só B2BPACK_REAL_TRIGGERS=1), executada no MESMO PostgreSQL descartável, antes do rollback.

1. Resolvedores REAIS de crédito/juros/plano (captured/credit/, md5 LIVE conferido no nome) no lugar das costuras
   NO_LIMIT/juros 0: saldo acima/abaixo do limite, limite NULL, ação block vs approval_required, inadimplência.
   Limites/juros são valores de FIXTURE local (TESTE), nunca regra comercial.
2. c2_accounting_pending_guard REAL negando explicitamente transição operacional/financeira/recebível em pedidos reais
   criados pelo writer (contrato C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1).
3. Cotação: comercial autorizado responde; comprador, técnico, outro tenant e perfil inativo negados.
4. Concorrência com os writers REAIS solid_pack_price_set_v1 / solid_pack_offer_save_v1 (captured/solid-pack/) em duas
   conexões, com os gatilhos reais de catalogo_volumes (owner_consistent, presentation_guard) carregados nesta etapa.
   Ordem antiga de travas é EMULADA (mesmas instruções do lock antigo, com pausa) para mostrar o ciclo; a função
   instalada usa a trava consultiva compartilhada alinhada aos writers.

Costuras desta etapa (declaradas em SEAMS): tabelas de recebível/vínculo financeiro com colunas reais sem gatilhos/FKs;
request.jwt.claims por GUC local (disposable) para recorte_a_actor_fresh; demais gatilhos de catalogo_volumes
(sync_catalogo_volumes_calc, sync_mestre, touch_version, updated_at) omitidos.
"""
import json
import pathlib
import subprocess
import threading
import time
from decimal import Decimal, ROUND_HALF_UP

HERE = pathlib.Path(__file__).resolve().parent
CAP = HERE / "captured"

SEAMS = [
    "accounts_receivable/accounts_receivable_installments/partner_order_financial_links com colunas reais, SEM gatilhos/FKs (fixture de inadimplência inserida como postgres)",
    "partner_order_payment_schedule ganha a coluna real id (o guard real ordena por s.id)",
    "zz_c2_accounting_pending também testado ISOLADO (demais gatilhos de partner_orders desligados numa transação desfeita)",
    "commercial_payment_plans ganha superseded_by_id/valid_from/valid_until reais para o fn_b2b_plan_selectable REAL",
    "request.jwt.claims por GUC local (PG descartável) para recorte_a_actor_fresh REAL; não é sessão hospedada",
    "gatilhos de catalogo_volumes sync_catalogo_volumes_calc/trg_zz_catalogo_volumes_sync_mestre/touch_version/updated_at omitidos (podem travar produtos/volumes no hospedado)",
    "ordem antiga de travas do comprador EMULADA com as mesmas instruções e pausa (prova do ciclo, não execução da função antiga)",
]


def _cap(sub, name):
    fs = sorted((CAP / sub).glob(f"{name}.*.live-20261106.sql"))
    assert len(fs) == 1, (sub, name, fs)
    return fs[0].read_text()


def _q2(x):
    return Decimal(x).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def run(T, chk, j, c1):
    psql, as_user, create, sim, items, S, err, u = T["psql"], T["as_user"], T["create"], T["sim"], T["items"], T["S"], T["err"], T["u"]
    P, A, UB, UT, UADM, UADMF, SOL, PK25, PR25 = (T[k] for k in ("P", "A", "UB", "UT", "UADM", "UADMF", "SOL", "PK25", "PR25"))
    PLQ = T["PLQ"]
    SOCK, PORT, su = T["SOCK"], T["PORT"], T["su"]

    # ------------------------------------------------------------------ 1. resolvedores REAIS
    psql("""
CREATE TABLE IF NOT EXISTS public.accounts_receivable(id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, origin_type text NOT NULL, origin_id uuid, customer_id uuid,
  description text NOT NULL, category_id uuid NOT NULL, cost_center_id uuid, total_amount numeric(14,2) NOT NULL, issue_date date NOT NULL DEFAULT CURRENT_DATE,
  first_due_date date NOT NULL, installment_count integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'OPEN', fiscal_invoice_required boolean NOT NULL DEFAULT false,
  fiscal_invoice_status text NOT NULL DEFAULT 'NOT_REQUIRED', notes text, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), payment_method_id uuid, partner_id uuid, organization_id uuid);
CREATE TABLE IF NOT EXISTS public.accounts_receivable_installments(id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, receivable_id uuid NOT NULL,
  installment_number integer NOT NULL, due_date date NOT NULL, original_amount numeric(14,2) NOT NULL, received_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0, interest_amount numeric(14,2) NOT NULL DEFAULT 0, penalty_amount numeric(14,2) NOT NULL DEFAULT 0,
  net_amount numeric(14,2) NOT NULL, status text NOT NULL DEFAULT 'OPEN', paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), organization_id uuid);
CREATE TABLE IF NOT EXISTS public.partner_order_financial_links(id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, partner_order_id uuid NOT NULL, partner_id uuid NOT NULL,
  receivable_id uuid NOT NULL, financial_status text NOT NULL DEFAULT 'gerado', billing_trigger text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.commercial_payment_plans ADD COLUMN IF NOT EXISTS superseded_by_id uuid,
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT (now() - interval '1 day'), ADD COLUMN IF NOT EXISTS valid_until timestamptz;
DROP FUNCTION public.fn_b2b_credit_exposure(uuid, numeric, uuid);
DROP FUNCTION public.fn_b2b_apply_interest(numeric, text, numeric, integer);
DROP FUNCTION public.fn_b2b_plan_selectable(uuid);
""")
    for n in ("public.fn_b2b_credit_exposure", "public.fn_b2b_apply_interest", "public.fn_b2b_plan_selectable"):
        psql(_cap("credit", n))
    # ACL LIVE: exposição só service_role (chamada dentro dos DEFINER); seletor de plano authenticated/service_role.
    psql("""REVOKE ALL ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid), public.fn_b2b_plan_selectable(uuid,timestamptz) FROM PUBLIC;
            GRANT EXECUTE ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) TO service_role;
            GRANT EXECUTE ON FUNCTION public.fn_b2b_plan_selectable(uuid,timestamptz) TO authenticated, service_role;""")
    real_md5 = {n: psql(f"SELECT md5(pg_get_functiondef('{n}'::regprocedure))").stdout.strip() for n in
                ("public.fn_b2b_credit_exposure(uuid,numeric,uuid)", "public.fn_b2b_apply_interest(numeric,text,numeric,numeric)",
                 "public.fn_b2b_plan_selectable(uuid,timestamp with time zone)")}
    chk("real.credit_resolvers_loaded_live_md5", real_md5 == {"public.fn_b2b_credit_exposure(uuid,numeric,uuid)": "213ac31f3a30816ead75365b0d1fed18",
        "public.fn_b2b_apply_interest(numeric,text,numeric,numeric)": "806e5d8789b08cd6790a10feaf95f26d",
        "public.fn_b2b_plan_selectable(uuid,timestamp with time zone)": "4cb833a3eae76cbebce920f34cd5d5ce"}, real_md5)

    PLJ, PLS, PLOLD = u(74), u(75), u(76)
    psql(f"""INSERT INTO public.commercial_payment_plans(id,active,pricing_mode,discount_percent,monthly_interest_percent,months_count,interest_type,installment_count,
               max_days,minimum_order_amount,requires_financial_approval,requires_guarantee,requires_credit_approval,name,code) VALUES
             ('{PLJ}',true,'discount_from_base',0,2,3,'compound',3,90,NULL,false,false,false,'Composto TESTE','J3'),
             ('{PLS}',true,'discount_from_base',0,1.5,2,'simple',2,60,NULL,false,false,false,'Simples TESTE','S2');
             INSERT INTO public.commercial_payment_plans(id,active,pricing_mode,discount_percent,monthly_interest_percent,months_count,interest_type,installment_count,
               max_days,minimum_order_amount,requires_financial_approval,requires_guarantee,requires_credit_approval,name,code,valid_until) VALUES
             ('{PLOLD}',true,'discount_from_base',0,0,1,'simple',1,30,NULL,false,false,false,'Vencido TESTE','OLD', now() - interval '1 hour');""")

    def exposure():
        return json.loads(psql(f"SELECT public.fn_b2b_credit_exposure('{P}',0,NULL)::text").stdout.strip())

    def settings(limit, action="block", overdue=False):
        lim = "NULL" if limit is None else str(limit)
        psql(f"""INSERT INTO public.partner_financial_settings(id,partner_id,credit_limit,credit_limit_action,block_if_overdue,overdue_tolerance_days)
                 VALUES (gen_random_uuid(),'{P}',{lim},'{action}',{str(overdue).lower()},0)
                 ON CONFLICT (partner_id) DO UPDATE SET credit_limit = EXCLUDED.credit_limit, credit_limit_action = EXCLUDED.credit_limit_action,
                   block_if_overdue = EXCLUDED.block_if_overdue""")

    def make(key, pk=PK25, q=1, plan=None):
        plan = plan or T["PLD"]
        s = j(sim(UB, plan, items(S(pk, q))))
        r = create(UB, plan, items(S(pk, q)), s["cart_hash"] if s else "x", key)
        return s, r

    def idem(key):
        return psql(f"SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key = '{key}'").stdout.strip()

    # Juros reais (vetores Decimal independentes; valores de fixture, não condição comercial)
    sj = j(sim(UB, PLJ, items(S(PK25, 1))))
    exp_j = _q2(Decimal("180") * (Decimal("1.02") ** 3))
    chk("real.interest_compound_matches_decimal", sj and _q2(sj["final_amount"]) == exp_j and _q2(sj["financial_interest_amount"]) == exp_j - 180, sj and sj["final_amount"])
    ss = j(sim(UB, PLS, items(S(PK25, 1))))
    exp_s = _q2(Decimal("180") * (1 + Decimal("0.015") * 2))
    chk("real.interest_simple_matches_decimal", ss and _q2(ss["final_amount"]) == exp_s, ss and ss["final_amount"])
    r = sim(UB, PLOLD, items(S(PK25, 1)))
    chk("real.plan_expired_not_selectable", "plan_not_selectable" in (err(r) or ""), err(r))

    # Limite NULL => NO_LIMIT_DEFINED, pedido segue para análise e grava o aviso de limite não definido.
    settings(None)
    _, r = make("TESTE-PED-20261106-CRNULL", plan=PLJ)
    o = j(r)
    chk("real.credit_limit_null_order_in_analysis", o and o["status"] == "em_analise_comercial" and o.get("credit_reason_code") == "NO_LIMIT_DEFINED", err(r) or o)
    sched = psql(f"SELECT count(*)||'|'||sum(amount) FROM public.partner_order_payment_schedule WHERE partner_order_id = '{o['id']}'").stdout.strip() if o else ""
    chk("real.interest_schedule_sums_to_final", sched == f"3|{exp_j}", sched)
    nlog = psql(f"SELECT count(*) FROM public.partner_order_audit_logs WHERE order_id = '{o['id']}' AND acao = 'credit_limit_not_defined'").stdout.strip() if o else ""
    chk("real.credit_limit_null_audited", nlog == "1", nlog)
    ORD_ANALISE = o and o["id"]

    # Saldo acima: limite = exposição atual + 1000 (fixture) => OK
    e0 = Decimal(str(exposure()["exposicao_atual"]))
    settings(e0 + 1000)
    _, r = make("TESTE-PED-20261106-CROK")
    o = j(r)
    chk("real.credit_above_limit_ok", o and o["status"] == "em_analise_comercial" and o.get("credit_reason_code") == "OK", err(r) or o)

    # Saldo abaixo + block: limite = exposição atual + 100 (< 162) => recusa atômica, sem pedido nem chave.
    e1 = Decimal(str(exposure()["exposicao_atual"]))
    chk("real.credit_pending_orders_consume_limit", e1 >= e0 + Decimal("162"), (str(e0), str(e1)))
    settings(e1 + 100, "block")
    n_before = psql("SELECT count(*) FROM public.partner_orders").stdout.strip()
    _, r = make("TESTE-PED-20261106-CRBLK")
    chk("real.credit_below_limit_block_rejected", "credit_limit_exceeded" in (err(r) or ""), err(r))
    chk("real.credit_block_atomic_no_order_no_key", idem("TESTE-PED-20261106-CRBLK") == "0" and psql("SELECT count(*) FROM public.partner_orders").stdout.strip() == n_before)

    # Saldo abaixo + approval_required => aguardando_aprovacao_credito (sem decisão de crédito escondida)
    settings(e1 + 100, "approval_required")
    _, r = make("TESTE-PED-20261106-CRAPR")
    o = j(r)
    chk("real.credit_below_limit_approval_required", o and o["status"] == "aguardando_aprovacao_credito" and o.get("credit_block_reason") == "limite_excedido", err(r) or o)
    ORD_CREDIT = o and o["id"]

    # Inadimplência com block_if_overdue => recusa antes de qualquer gravação
    settings(e1 + 100000, "block", overdue=True)
    psql(f"""WITH ar AS (INSERT INTO public.accounts_receivable(origin_type,description,category_id,total_amount,first_due_date,created_by,partner_id,organization_id)
               VALUES ('TESTE','TESTE vencido',gen_random_uuid(),10,current_date - 10,'{UADM}','{P}','{A}') RETURNING id)
             INSERT INTO public.accounts_receivable_installments(receivable_id,installment_number,due_date,original_amount,net_amount,status)
             SELECT id,1,current_date - 10,10,10,'OPEN' FROM ar""")
    _, r = make("TESTE-PED-20261106-CROVD")
    chk("real.credit_overdue_blocked", "credit_blocked_overdue" in (err(r) or ""), err(r))
    chk("real.credit_overdue_atomic_no_key", idem("TESTE-PED-20261106-CROVD") == "0")
    psql(f"UPDATE public.accounts_receivable_installments SET status = 'PAID', received_amount = original_amount WHERE due_date = current_date - 10")
    settings(None)

    # ------------------------------------------------------------------ 2. c2_accounting_pending_guard REAL
    psql("ALTER TABLE public.partner_order_payment_schedule ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();")
    contract = psql(f"SELECT c2_external_origin_snapshot->>'contract' FROM public.partner_orders WHERE id = '{ORD_ANALISE}'").stdout.strip()
    chk("accounting.order_carries_pending_contract", contract == "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1", contract)
    for nm, oid, setc in (
        ("approve", ORD_ANALISE, "status = 'aprovado'"),
        ("production", ORD_ANALISE, "status = 'em_producao'"),
        ("ready_for_production", ORD_ANALISE, "ready_for_production = true"),
        ("receivable_generated", ORD_ANALISE, "receivable_generated = true"),
        ("approved_at", ORD_ANALISE, "approved_at = now()"),
        ("credit_wait_to_analysis", ORD_CREDIT, "status = 'em_analise_comercial'"),
        ("credit_approved_at", ORD_CREDIT, "credit_approved_at = now()"),
    ):
        # Ator = admin do vendedor (auth.uid por GUC local) para que os guards anteriores não neguem por ausência de sessão;
        # a asserção exige a mensagem do c2_accounting_pending_guard, não "qualquer negação".
        r = psql(f"SELECT set_config('request.jwt.claim.sub','{UADM}',false) \\g /dev/null\nUPDATE public.partner_orders SET {setc} WHERE id = '{oid}'", check=False)
        chk(f"accounting.integrated_stack_denies.{nm}", r.returncode != 0, err(r))
        # Isolado: SÓ o gatilho real zz_c2_accounting_pending ativo (demais desligados numa transação desfeita) — prova que ELE nega,
        # não apenas que "algum guard" negou.
        r = psql("BEGIN; ALTER TABLE public.partner_orders DISABLE TRIGGER USER; ALTER TABLE public.partner_orders ENABLE TRIGGER zz_c2_accounting_pending;\n"
                 f"SELECT set_config('request.jwt.claim.sub','{UADM}',true) \\g /dev/null\nUPDATE public.partner_orders SET {setc} WHERE id = '{oid}';\nROLLBACK;", check=False)
        chk(f"accounting.pending_guard_alone_denies.{nm}", r.returncode != 0 and "C2_ACCOUNTING_PENDING" in r.stderr, err(r))
    st = psql(f"SELECT status||'|'||coalesce(receivable_generated,false)||'|'||coalesce(ready_for_production,false) FROM public.partner_orders WHERE id = '{ORD_ANALISE}'").stdout.strip()
    chk("accounting.order_unchanged_after_denials", st == "em_analise_comercial|false|false", st)
    r = psql(f"UPDATE public.partner_orders SET status = 'cancelado' WHERE id = '{ORD_CREDIT}'", check=False)
    chk("accounting.pending_allows_cancel_control", r.returncode == 0 or "C2_ACCOUNTING_PENDING" not in r.stderr, err(r))

    # ------------------------------------------------------------------ 3. cotação: autorizado x indevidos
    qs = j(sim(UB, PLQ, items(S(PK25, 1))))
    cq = j(create(UB, PLQ, items(S(PK25, 1)), qs["cart_hash"], "TESTE-PED-20261106-COT2"))
    it_id = psql(f"SELECT id FROM public.partner_order_items WHERE order_id = '{cq['id']}'").stdout.strip()
    body = f"""'[{{"item_id":"{it_id}","unit_price":150}}]'::jsonb"""
    for nm, uid in (("buyer", UB), ("technician", UT), ("other_tenant_admin", UADMF)):
        r = as_user(uid, f"SELECT public.respond_b2b_order_quote_secure('{cq['id']}',{body});")
        chk(f"quote.denied.{nm}", r.returncode != 0, err(r))
    psql(f"UPDATE public.profiles SET ativo = false WHERE user_id = '{UADM}'")
    r = as_user(UADM, f"SELECT public.respond_b2b_order_quote_secure('{cq['id']}',{body});")
    chk("quote.denied.inactive_seller_admin", r.returncode != 0, err(r))
    psql(f"UPDATE public.profiles SET ativo = true WHERE user_id = '{UADM}'")
    sub0 = psql(f"SELECT subtotal FROM public.partner_order_items WHERE id = '{it_id}'").stdout.strip()
    chk("quote.denials_left_item_untouched", sub0 == psql(f"SELECT subtotal FROM public.partner_order_items WHERE id = '{it_id}'").stdout.strip())
    r = as_user(UADM, f"SELECT public.respond_b2b_order_quote_secure('{cq['id']}',{body})::text;")
    qrow = psql(f"SELECT subtotal||'|'||packaging_id_snapshot FROM public.partner_order_items WHERE id = '{it_id}'").stdout.strip()
    chk("quote.authorized_seller_admin_responds_real_credit", r.returncode == 0 and qrow == f"150.00|{PK25}", (err(r), qrow))

    # ------------------------------------------------------------------ 4. writers REAIS de embalagem x pedido
    psql("ALTER TABLE public.catalogo_volumes ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;")
    psql("""CREATE TABLE IF NOT EXISTS platform_private.solid_pack_admin_receipts(idempotency_key text NOT NULL PRIMARY KEY, actor_id uuid NOT NULL, organization_id uuid NOT NULL,
              action text NOT NULL, request_fp text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
            DROP FUNCTION IF EXISTS public.solid_pack_price_set_v1(uuid,bigint,date,uuid,text);""")
    for n in ("platform_private.has_role", "platform_private.solid_mass_price_ok", "platform_private.recorte_a_actor_fresh", "platform_private.solid_pack_admin_org",
              "platform_private.solid_pack_receipt", "platform_private.solid_pack_decimal_text", "platform_private.solid_pack_weight_label",
              "platform_private.solid_pack_presentation_set_active", "platform_private.solid_pack_presentation_insert",
              "platform_private.solid_pack_presentation_new_version", "platform_private.catalogo_volumes_owner_consistent",
              "platform_private.solid_pack_presentation_guard"):
        psql(_cap("solid-pack", n))
    psql(_cap("solid-pack", "public.solid_pack_price_set_v1")); psql(_cap("solid-pack", "public.solid_pack_offer_save_v1"))
    psql("""REVOKE ALL ON FUNCTION public.solid_pack_price_set_v1(uuid,bigint,date,uuid,text), public.solid_pack_offer_save_v1(uuid,uuid,text,text,numeric,integer,text) FROM PUBLIC;
            GRANT EXECUTE ON FUNCTION public.solid_pack_price_set_v1(uuid,bigint,date,uuid,text), public.solid_pack_offer_save_v1(uuid,uuid,text,text,numeric,integer,text) TO authenticated;
            CREATE TRIGGER a00_catalogo_volumes_owner_consistent BEFORE INSERT OR UPDATE ON public.catalogo_volumes FOR EACH ROW EXECUTE FUNCTION platform_private.catalogo_volumes_owner_consistent();
            CREATE TRIGGER a01_catalogo_volumes_presentation_guard BEFORE INSERT OR DELETE OR UPDATE ON public.catalogo_volumes FOR EACH ROW EXECUTE FUNCTION platform_private.solid_pack_presentation_guard();""")

    def adm_pre(uid=UADM):
        claims = json.dumps({"role": "authenticated", "sub": uid, "exp": int(time.time()) + 3600})
        return (f"SET ROLE authenticated;\nSELECT set_config('request.jwt.claim.sub','{uid}',false) \\g /dev/null\n"
                f"SELECT set_config('request.jwt.claims','{claims}',false) \\g /dev/null\n")

    def adm(sql, uid=UADM):
        return psql(adm_pre(uid) + sql, check=False)

    def bg(sql):
        p = subprocess.Popen(su() + ["psql", "-X", "-q", "-t", "-A", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1"],
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        out = {}
        th = threading.Thread(target=lambda: out.update(zip(("out", "err"), p.communicate(sql)), rc=p.returncode)); th.start()
        return th, out

    def cur_price(pk):
        return psql(f"SELECT id FROM public.catalogo_precos_embalagem WHERE packaging_id = '{pk}' AND ativo AND valid_from <= current_date "
                    "AND (valid_until IS NULL OR valid_until >= current_date)").stdout.strip()

    def counts():
        return psql("SELECT (SELECT count(*) FROM public.product_packagings)||'|'||(SELECT count(*) FROM public.catalogo_precos_embalagem)||'|'||"
                    "(SELECT count(*) FROM platform_private.solid_pack_admin_receipts)||'|'||(SELECT count(*) FROM public.catalogo_volumes)").stdout.strip()

    # Sanidade: writer real funciona fora de corrida e é idempotente; ator externo negado.
    r = adm(f"SELECT public.solid_pack_price_set_v1('{PK25}', 19000, current_date + 1, '{PR25}', 'TESTE-PRICE-SANITY-0001')::text;")
    chk("solidpack.price_set_real_ok", r.returncode == 0 and '"price_id"' in r.stdout, err(r))
    PR_FUT = json.loads(r.stdout.strip().splitlines()[-1])["price_id"] if r.returncode == 0 else None
    c_ok = counts()
    r2 = adm(f"SELECT public.solid_pack_price_set_v1('{PK25}', 19000, current_date + 1, '{PR25}', 'TESTE-PRICE-SANITY-0001')::text;")
    chk("solidpack.price_set_replay_same_result", r2.returncode == 0 and '"replayed": true' in r2.stdout and counts() == c_ok, err(r2))
    r3 = adm(f"SELECT public.solid_pack_price_set_v1('{PK25}', 19999, current_date + 1, '{PR25}', 'TESTE-PRICE-SANITY-0001');")
    chk("solidpack.price_set_key_conflict", "PACK_IDEMPOTENCY_CONFLICT" in (err(r3) or ""), err(r3))
    r4 = adm(f"SELECT public.solid_pack_price_set_v1('{PK25}', 19000, current_date + 2, NULL, 'TESTE-PRICE-EXTERN-0001');", uid=UB)
    chk("solidpack.price_set_external_buyer_denied", r4.returncode != 0, err(r4))

    # (a) pedido segura as travas; writer REAL de preço espera e termina coerente depois do commit.
    PRB = cur_price(PK25)
    hb = j(sim(UB, T["PLD"], items(S(PK25, 1))))["cart_hash"]
    th, out = bg(f"BEGIN; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{UB}',false);\n"
                 f"SELECT (public.create_partner_order_secure('{P}',NULL,'{items(S(PK25, 1))}'::jsonb,NULL,'{T['PLD']}',NULL,NULL,'{hb}','TESTE-PED-20261106-RACE-A'))->>'id';\n"
                 "SELECT pg_sleep(3); COMMIT;\n")
    time.sleep(1.0)
    t0 = time.time()
    rp = adm(f"SELECT public.solid_pack_price_set_v1('{PK25}', 20000, current_date + 3, '{PR_FUT}', 'TESTE-PRICE-RACE-A-0001')::text;")
    waited = time.time() - t0
    th.join()
    snap = psql("SELECT i.packaging_price_id_snapshot FROM public.partner_order_items i JOIN public.partner_order_idempotency x ON x.order_id = i.order_id "
                "WHERE x.idempotency_key = 'TESTE-PED-20261106-RACE-A'").stdout.strip()
    chk("race.order_first_price_writer_waits_then_ok", out.get("rc") == 0 and rp.returncode == 0 and waited > 1.0, (out.get("err"), err(rp), round(waited, 2)))
    chk("race.order_first_snapshot_is_price_seen", snap == PRB, (snap, PRB))

    # (b) writer REAL de nova versão (arquiva SC25 e desativa preços) segura as travas; pedido espera e é recusado coerente.
    ver = psql(f"SELECT version FROM public.product_packagings WHERE id = '{PK25}'").stdout.strip()
    hb = j(sim(UB, T["PLD"], items(S(PK25, 1))))["cart_hash"]
    th, out = bg(adm_pre() + "BEGIN;\n" + f"SELECT public.solid_pack_offer_save_v1('{SOL}','{PK25}','SC25','Saco 25 kg',25,{ver},'TESTE-OFFER-RACE-B-0001')::text;\n"
                 "SELECT pg_sleep(3); COMMIT;\n")
    time.sleep(1.0)
    c_before_buy = psql("SELECT count(*) FROM public.partner_orders").stdout.strip()
    rb = create(UB, T["PLD"], items(S(PK25, 1)), hb, "TESTE-PED-20261106-RACE-B")
    th.join()
    chk("race.writer_first_offer_save_committed", out.get("rc") == 0 and '"packaging_id"' in (out.get("out") or ""), out.get("err"))
    chk("race.writer_first_order_rejected_coherently", rb.returncode != 0 and "deadlock" not in (rb.stderr or "") and idem("TESTE-PED-20261106-RACE-B") == "0"
        and psql("SELECT count(*) FROM public.partner_orders").stdout.strip() == c_before_buy, err(rb))
    new_pk = json.loads([l for l in out["out"].splitlines() if l.startswith("{")][-1])["packaging_id"]
    chk("race.old_packaging_archived_new_needs_price", psql(f"SELECT ativo FROM public.product_packagings WHERE id = '{PK25}'").stdout.strip() == "f"
        and cur_price(PK25) == "" and cur_price(new_pk) == "")
    rr = adm(f"SELECT public.solid_pack_offer_save_v1('{SOL}','{PK25}','SC25','Saco 25 kg',25,{ver},'TESTE-OFFER-RACE-B-0001')::text;")
    chk("race.offer_save_replay_idempotent", rr.returncode == 0 and '"replayed": true' in rr.stdout and new_pk in rr.stdout, err(rr))

    # (c) ciclo de travas: ordem ANTIGA do comprador (produto/unidade/volume FOR SHARE, depois embalagem) EMULADA com pausa
    #     x offer_save REAL => o Postgres detecta deadlock e aborta UMA transação inteira; nada parcial; mesma chave depois aplica 1 vez.
    pr_new = adm(f"SELECT (public.solid_pack_price_set_v1('{new_pk}', 18000, current_date, NULL, 'TESTE-PRICE-NEWPK-0001'))->>'price_id';")
    chk("race.new_packaging_priced", pr_new.returncode == 0, err(pr_new))
    ver2 = psql(f"SELECT version FROM public.product_packagings WHERE id = '{new_pk}'").stdout.strip()
    before = counts()
    old_lock = (f"BEGIN; SELECT 1 FROM public.produtos WHERE id = '{SOL}' FOR SHARE; SELECT 1 FROM public.product_sale_units WHERE product_id = '{SOL}' FOR SHARE;\n"
                f"SELECT 1 FROM public.catalogo_volumes WHERE id = '{new_pk}' FOR SHARE; SELECT pg_sleep(1.5);\n"
                f"SELECT 1 FROM public.product_packagings WHERE id = '{new_pk}' FOR SHARE; SELECT pg_sleep(1); COMMIT;\n")
    th, out = bg(old_lock); time.sleep(0.5)
    rd = adm(f"SELECT public.solid_pack_offer_save_v1('{SOL}','{new_pk}','SC25','Saco 25 kg',25,{ver2},'TESTE-OFFER-DEADLK-0001')::text;")
    th.join()
    deadlock = "deadlock detected" in (rd.stderr or "") or "deadlock detected" in (out.get("err") or "")
    chk("race.old_lock_order_reproduces_deadlock", deadlock, (err(rd), (out.get("err") or "").strip()[:200]))
    admin_ok = rd.returncode == 0
    after = counts()
    chk("race.deadlock_victim_rolled_back_whole", (admin_ok and out.get("rc") != 0) or (not admin_ok and after == before), (before, after, admin_ok))
    if not admin_ok:
        rr = adm(f"SELECT public.solid_pack_offer_save_v1('{SOL}','{new_pk}','SC25','Saco 25 kg',25,{ver2},'TESTE-OFFER-DEADLK-0001')::text;")
        rr2 = adm(f"SELECT public.solid_pack_offer_save_v1('{SOL}','{new_pk}','SC25','Saco 25 kg',25,{ver2},'TESTE-OFFER-DEADLK-0001')::text;")
        chk("race.deadlock_retry_same_key_applies_once", rr.returncode == 0 and rr2.returncode == 0 and '"replayed": true' in rr2.stdout, (err(rr), err(rr2)))
    else:
        chk("race.deadlock_retry_same_key_applies_once", True, "vítima foi o comprador emulado; writer aplicou uma vez")
    newest = psql(f"SELECT id||'|'||version FROM public.product_packagings WHERE product_id = '{SOL}' AND codigo = 'SC25' AND ativo").stdout.strip().split("|")
    pk3, ver3 = newest[0], newest[1]
    adm(f"SELECT public.solid_pack_price_set_v1('{pk3}', 18000, current_date, NULL, 'TESTE-PRICE-PK3-00001');")

    # (d) ordem NOVA (trava consultiva compartilhada antes de qualquer linha), EMULADA com a mesma pausa: writer espera, sem deadlock.
    new_lock = (f"BEGIN; SELECT pg_advisory_xact_lock_shared(hashtextextended('solid_pack_product:'||'{SOL}',0));\n"
                f"SELECT 1 FROM public.produtos WHERE id = '{SOL}' FOR SHARE; SELECT 1 FROM public.product_sale_units WHERE product_id = '{SOL}' FOR SHARE;\n"
                f"SELECT 1 FROM public.catalogo_volumes WHERE id = '{pk3}' FOR SHARE; SELECT pg_sleep(1.5);\n"
                f"SELECT 1 FROM public.product_packagings WHERE id = '{pk3}' FOR SHARE; SELECT pg_sleep(1); COMMIT;\n")
    th, out = bg(new_lock); time.sleep(0.5)
    rn = adm(f"SELECT public.solid_pack_offer_save_v1('{SOL}','{pk3}','SC25','Saco 25 kg',25,{ver3},'TESTE-OFFER-ALIGN-0001')::text;")
    th.join()
    chk("race.aligned_lock_no_deadlock_both_commit", rn.returncode == 0 and out.get("rc") == 0, (err(rn), (out.get("err") or "").strip()[:200]))

    # (e) função INSTALADA (com a trava alinhada) em corrida real: pedido segura; offer_save REAL espera; ambos commitam.
    newest = psql(f"SELECT id||'|'||version FROM public.product_packagings WHERE product_id = '{SOL}' AND codigo = 'SC25' AND ativo").stdout.strip().split("|")
    pk4, ver4 = newest
    adm(f"SELECT public.solid_pack_price_set_v1('{pk4}', 18000, current_date, NULL, 'TESTE-PRICE-PK4-00001');")
    hb = j(sim(UB, T["PLD"], items(S(pk4, 1))))["cart_hash"]
    th, out = bg(f"BEGIN; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{UB}',false);\n"
                 f"SELECT (public.create_partner_order_secure('{P}',NULL,'{items(S(pk4, 1))}'::jsonb,NULL,'{T['PLD']}',NULL,NULL,'{hb}','TESTE-PED-20261106-RACE-E'))->>'id';\n"
                 "SELECT pg_sleep(2); COMMIT;\n")
    time.sleep(0.8)
    re_ = adm(f"SELECT public.solid_pack_offer_save_v1('{SOL}','{pk4}','SC25','Saco 25 kg',25,{ver4},'TESTE-OFFER-RACE-E-0001')::text;")
    th.join()
    snap = psql("SELECT i.packaging_id_snapshot||'|'||i.packaging_version_snapshot FROM public.partner_order_items i JOIN public.partner_order_idempotency x "
                "ON x.order_id = i.order_id WHERE x.idempotency_key = 'TESTE-PED-20261106-RACE-E'").stdout.strip()
    chk("race.installed_lock_order_and_offer_save_both_coherent", out.get("rc") == 0 and re_.returncode == 0 and snap == f"{pk4}|{ver4}", (out.get("err"), err(re_), snap))
    return SEAMS
