#!/usr/bin/env python3
"""PG DESCARTÁVEL — B2B_PAYMENT_METHOD_V1. Sem rede, sem banco hospedado, sem sessão real.

Reaproveita o boot do pacote b2b-cart-catalog-fence-20261106 e reproduz o estado INSTALADO em produção
(02 do 9c99095 + upgrade V2), com os mesmos CORPOS REAIS conferidos por md5:
  simulate_b2b_payment_plan_secure (37d4f45e), b2b_partner_catalog_reader (bd985484), h15_actor_organization (64e10608),
  b2b_actor_scope, fn_resolve_b2b_cart, b2b_packaging_line, motor/fence de preço etc.
COSTURAS DECLARADAS (SYNTHETIC, não são prova): as do harness base (auth.uid por claims locais, has_role, features...) e,
  neste pacote, create_partner_order_secure e get_partner_order_payment_terms_secure substituídos por stubs mínimos
  (o corpo LIVE c34e7404 depende de journal/tickets/notificações fora do harness). O stub reutiliza a simulação REAL
  para valores, grava pedido+condição e tem idempotência por fingerprint como o LIVE. Tabelas mínimas sintéticas.
Dados 100% fictícios ("TESTE"), vendedor A (papel AR Bio) e vendedor F (papel FSF). Nunca prova JWT/RLS/PostgREST.
"""
import hashlib, importlib.util, json, pathlib, runpy, subprocess, sys, tempfile, threading, uuid
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, timedelta

HERE = pathlib.Path(__file__).resolve().parent
CF = HERE.parent / "b2b-cart-catalog-fence-20261106"
spec = importlib.util.spec_from_file_location("h", CF / "test-local-pg.py"); h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
g = runpy.run_path(str(HERE / "generate.py"), run_name="lib")
u = h.u
A, F, P, PO, PF = h.A, h.F, h.P, h.PO, h.PF
UB, UT, UB2, UADM, UADMF, UINACT, UBF = h.UB, h.UT, h.UB2, h.UADM, h.UADMF, h.UINACT, h.UBF
UFIN, UGC = u(29), u(30)
PLD, P3, PINT, PNA = h.PLD, u(72), u(73), u(74)
M_PIX, M_BOL, M_CASH, M_OFF = u(91), u(92), u(93), u(94)
LIQ, PACK = h.LIQ_LINE, h.PACK_LINE

SEAMS = f"""
CREATE TABLE public.payment_methods(id uuid PRIMARY KEY, name text, active boolean, created_at timestamptz DEFAULT now());
ALTER TABLE public.commercial_payment_plans ADD COLUMN superseded_by_id uuid;
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero text, partner_id uuid NOT NULL, payment_plan_id uuid,
  total numeric(14,2), created_by uuid);
CREATE TABLE public.partner_order_payment_terms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid NOT NULL REFERENCES public.partner_orders(id),
  payment_plan_id uuid, installment_count integer, final_amount numeric(14,2));
CREATE TABLE public.partner_order_idempotency(partner_id uuid, idempotency_key text, fp text, result jsonb, PRIMARY KEY (partner_id, idempotency_key));
-- SYNTHETIC: stub de create_partner_order_secure (assinatura LIVE). Valores pela simulação REAL; parcelas do plano p/ externo (como o LIVE).
CREATE FUNCTION public.create_partner_order_secure(p_partner_id uuid, p_observacoes text DEFAULT NULL, p_items jsonb DEFAULT '[]', p_requested_delivery_date date DEFAULT NULL,
  p_payment_plan_id uuid DEFAULT NULL, p_first_due_date date DEFAULT NULL, p_installment_count integer DEFAULT NULL, p_expected_cart_hash text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb; fp text; prev record; o uuid; n integer; internal boolean := has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor_comercial');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  fp := md5(p_partner_id::text||coalesce(p_payment_plan_id::text,'-')||coalesce(p_first_due_date::text,'-')||coalesce(p_installment_count::text,'-')||p_items::text);
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || p_idempotency_key, 0));
  SELECT * INTO prev FROM partner_order_idempotency WHERE partner_id=p_partner_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN IF prev.fp <> fp THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN prev.result; END IF;
  v := simulate_b2b_payment_plan_secure(p_partner_id, p_payment_plan_id, p_items, NULL);
  IF v->>'cart_hash' IS DISTINCT FROM p_expected_cart_hash THEN RAISE EXCEPTION 'cart_hash_mismatch'; END IF;
  SELECT CASE WHEN internal THEN GREATEST(COALESCE(p_installment_count, installment_count,1),1) ELSE GREATEST(COALESCE(installment_count,1),1) END INTO n
    FROM commercial_payment_plans WHERE id=p_payment_plan_id;
  INSERT INTO partner_orders(numero, partner_id, payment_plan_id, total, created_by) VALUES ('PB-TESTE', p_partner_id, p_payment_plan_id, (v->>'final_amount')::numeric, auth.uid()) RETURNING id INTO o;
  INSERT INTO partner_order_payment_terms(partner_order_id, payment_plan_id, installment_count, final_amount) VALUES (o, p_payment_plan_id, n, (v->>'final_amount')::numeric);
  v := jsonb_build_object('id', o, 'numero', 'PB-TESTE', 'total', (v->>'final_amount')::numeric, 'cart_hash', v->>'cart_hash');
  INSERT INTO partner_order_idempotency VALUES (p_partner_id, p_idempotency_key, fp, v);
  RETURN v;
END $$;
-- SYNTHETIC: stub do leitor de condição instalado (efb3d18c): comprador do parceiro do pedido ou admin do vendedor.
CREATE FUNCTION public.get_partner_order_payment_terms_secure(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM partner_orders o JOIN partner_accounts pa ON pa.id=o.partner_id WHERE o.id=p_order_id AND (
      EXISTS (SELECT 1 FROM partner_users pu WHERE pu.partner_id=o.partner_id AND pu.user_id=auth.uid())
      OR (has_role(auth.uid(),'administrador') AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id=auth.uid() AND p.organization_id=pa.commercial_owner_organization_id)))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN '{{}}'::jsonb;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text), public.get_partner_order_payment_terms_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text), public.get_partner_order_payment_terms_secure(uuid) TO authenticated;
INSERT INTO public.profiles VALUES ('{UFIN}','{A}',true),('{UGC}','{A}',true);
INSERT INTO public.user_roles VALUES ('{UFIN}','financeiro'),('{UGC}','gestor_comercial');
INSERT INTO public.payment_methods(id,name,active) VALUES ('{M_PIX}','Pix TESTE',true),('{M_BOL}','Boleto TESTE',true),('{M_CASH}','Dinheiro TESTE',true),('{M_OFF}','Inativo TESTE',false);
INSERT INTO public.commercial_payment_plans VALUES
  ('{P3}',true,'discount_from_base',10,0,1,'none',3,30,NULL,false,false,false,'TESTE 3x','T3'),
  ('{PINT}',true,'discount_from_base',10,1.8,1,'compound',2,30,NULL,false,false,false,'TESTE juros 2x','TJ'),
  ('{PNA}',true,'discount_from_base',10,0,1,'none',1,30,NULL,false,false,false,'TESTE não publicado','TN');
INSERT INTO public.commercial_payment_plan_assignments VALUES
  ('published','{PLD}','partner','{P}',NULL,CURRENT_DATE-1,NULL),('published','{PLD}','partner','{PO}',NULL,CURRENT_DATE-1,NULL),
  ('published','{PLD}','partner','{PF}',NULL,CURRENT_DATE-1,NULL),('published','{P3}','partner','{P}',NULL,CURRENT_DATE-1,NULL),
  ('published','{PINT}','partner','{P}',NULL,CURRENT_DATE-1,NULL),('draft','{PNA}','partner','{P}',NULL,CURRENT_DATE-1,NULL);
"""

checks = h.checks
check, out = h.check, h.out


def call(uid, sql, role="authenticated"):
    return out(h.as_user(uid, f"SELECT ({sql})::text;", role))


def denied(name, r, token):
    j, e = r
    check(name, j is None and token in (e or ""), f"esperado erro {token!r}; obtido {e or j}")


def save(uid, cid, plan, kind, pm, due, mx, rate, status, ver):
    rate_s = "NULL" if rate is None else repr(str(rate))
    cid_s = "NULL" if cid is None else f"'{cid}'"
    return call(uid, f"public.b2b_payment_method_config_save({cid_s}::uuid,'{plan}','{kind}','{pm}',{due},{mx},{rate_s}::numeric,'{status}',{ver})")


def sim(uid, partner, plan, items, cid, ver):
    return call(uid, f"public.simulate_b2b_payment_plan_with_method_secure('{partner}','{plan}','{json.dumps(items)}'::jsonb,{('NULL' if cid is None else repr(cid))}::uuid,{('NULL' if ver is None else ver)})")


def base_hash(uid, partner, plan, items):
    j, e = call(uid, f"public.simulate_b2b_payment_plan_secure('{partner}','{plan}','{json.dumps(items)}'::jsonb,NULL)")
    assert j, e
    return j["cart_hash"]


def create(uid, partner, plan, items, key, cid, ver, cart_hash):
    return call(uid, f"public.create_partner_order_with_method_secure('{partner}',NULL,'{json.dumps(items)}'::jsonb,NULL,'{plan}','{cart_hash}','{key}',{('NULL' if cid is None else repr(cid))}::uuid,{('NULL' if ver is None else ver)})")


def price_schedule(amount, n, rate, due_days, base):
    """Price independente com Decimal (centavos ROUND_HALF_UP), última parcela absorve resíduo."""
    q = Decimal("0.01"); bal = Decimal(str(amount)).quantize(q); i = Decimal(str(rate)) / 100
    pmt = (bal / n).quantize(q, ROUND_HALF_UP) if i == 0 else (bal * i / (1 - (1 + i) ** -n)).quantize(q, ROUND_HALF_UP)
    first = base + timedelta(days=due_days); res = []
    for k in range(1, n + 1):
        it = (bal * i).quantize(q, ROUND_HALF_UP); pr = pmt - it if k < n else bal
        m = first.month - 1 + (k - 1); y = first.year + m // 12; m = m % 12 + 1
        import calendar
        d = min(first.day, calendar.monthrange(y, m)[1])
        res.append({"installment_number": k, "estimated_due_date": date(y, m, d).isoformat(), "amount": float(pr + it),
                    "principal_amount": float(pr), "interest_amount": float(it)})
        bal -= pr
    return res


def parallel(sqls):
    res = [None] * len(sqls)
    def run(ix, s): res[ix] = h.psql(s, check=False)
    ts = [threading.Thread(target=run, args=(ix, s)) for ix, s in enumerate(sqls)]
    [t.start() for t in ts]; [t.join() for t in ts]
    return res


def claims(uid):
    import time
    c = json.dumps({"sub": uid, "role": "authenticated", "exp": int(time.time()) + 3600})
    return f"SET ROLE authenticated;\nSELECT set_config('request.jwt.claims', '{c}', false) \\g /dev/null\n"


def main():
    tmp = h.boot(); work = pathlib.Path(tempfile.mkdtemp()); work.chmod(0o777)
    try:
        r = h.runfile(CF / "upgrade-v2" / "captured" / "v1-02-install.sql.review.applied"); check("estado instalado: cart fence 9c99095", r.returncode == 0, r.stderr[-200:])
        r = h.runfile(CF / "upgrade-v2" / "02-upgrade.sql.review"); check("estado instalado: upgrade V2", r.returncode == 0, r.stderr[-200:])
        h.psql(SEAMS)
        # Corpos REAIS: md5 local == LIVE.
        real = {k: v for k, v in g["LIVE_PINS"].items() if "create_partner_order_secure" not in k and "payment_terms_secure" not in k}
        for sig, md in real.items():
            loc = h.psql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))").stdout.strip()
            check(f"corpo REAL carregado = LIVE: {sig}", loc == md, f"{loc} != {md}")
        # Costuras: pins trocados SÓ na cópia temporária (declarado).
        pins = dict(g["LIVE_PINS"])
        for sig in [k for k in pins if k not in real]:
            pins[sig] = h.psql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))").stdout.strip()
        cols = {t: h.psql(f"SELECT md5(string_agg(column_name||':'||data_type, ',' ORDER BY ordinal_position)) FROM information_schema.columns WHERE table_schema='public' AND table_name='{t}'").stdout.strip()
                for t in g["LIVE_COLS"]}
        files = g["build"](pins=pins, cols=cols)
        for n, t in files.items(): (work / n).write_text(t)
        r = h.runfile(work / "01-pre.sql.readonly"); check("01 PRE_OK", r.returncode == 0 and "PRE_OK" in r.stderr, r.stderr[-300:])
        r = h.runfile(work / "02-install.sql.review"); check("02 install", r.returncode == 0, r.stderr[-400:])
        fm = {"install": {k: h.psql(f"SELECT md5(pg_get_functiondef('{s}'::regprocedure))").stdout.strip() for k, s in g["PUB"].items()}}
        files = g["build"](pins=pins, cols=cols, fn_md5=fm["install"])
        for n, t in files.items(): (work / n).write_text(t)
        r = h.runfile(work / "03-post.sql.readonly"); check("03 POST_OK", r.returncode == 0 and "POST_OK" in r.stderr, r.stderr[-300:])
        r = h.runfile(work / "02-install.sql.review"); check("rerun do install recusado", r.returncode != 0)
        bad = dict(pins); bad[next(iter(real))] = "0" * 32
        (work / "pre-bad.sql").write_text(g["build"](pins=bad, cols=cols)["01-pre.sql.readonly"])
        r = h.runfile(work / "pre-bad.sql"); check("PRE recusa corpo LIVE divergente", r.returncode != 0 and "divergente" in r.stderr)

        # ---------- configuração pelo vendedor ----------
        j, e = save(UADM, None, PLD, "pix", M_PIX, 5, 1, None, "active", 0); check("admin A cria Pix (v1)", j and j["config"]["version"] == 1, e)
        pix = j["config"]["id"] if j else None
        j, e = save(UFIN, None, P3, "boleto", M_BOL, 10, 3, "2.5", "active", 0); check("financeiro A cria boleto 3x Price 2,5% a.m.", j and j["config"]["version"] == 1, e)
        bol = j["config"]["id"] if j else None
        j, e = save(UADM, None, P3, "pix", M_PIX, 5, 1, None, "active", 0); pix3 = j["config"]["id"] if j else None
        j, e = save(UADM, None, PINT, "boleto", M_BOL, 10, 3, "1", "active", 0); bolint = j["config"]["id"] if j else None
        j, e = save(UADM, None, PLD, "dinheiro", M_CASH, 0, 1, None, "active", 0); cash = j["config"]["id"] if j else None
        j, e = save(UADMF, None, PLD, "pix", M_PIX, 2, 1, None, "active", 0); check("admin F cria Pix próprio (independente)", j and j["config"]["organization_id"] == F, e)
        pixF = j["config"]["id"] if j else None
        denied("promissória ativa recusada", save(UADM, None, PLD, "promissoria", M_BOL, 5, 1, None, "active", 0), "payment_method_kind_not_defined")
        denied("crédito ativo recusado", save(UADM, None, PLD, "credito", M_BOL, 5, 1, None, "active", 0), "payment_method_kind_not_defined")
        denied("Pix parcelado recusado (CHECK)", save(UADM, None, PINT, "pix", M_PIX, 5, 2, "1", "active", 0), "b2b_pmc_single_payment")
        denied("boleto 2x sem taxa explícita recusado", save(UADM, None, PNA, "boleto", M_BOL, 5, 2, None, "active", 0), "b2b_pmc_price_rate_explicit")
        denied("boleto 4x recusado", save(UADM, None, PNA, "boleto", M_BOL, 5, 4, "1", "active", 0), "max_installments")
        denied("meio inativo no catálogo recusado", save(UADM, None, PNA, "pix", M_OFF, 5, 1, None, "active", 0), "payment_method_catalog_unavailable")
        denied("criação duplicada (mesmo plano/meio) = stale", save(UADM, None, PLD, "pix", M_PIX, 5, 1, None, "active", 0), "payment_method_config_stale")
        denied("comprador não configura", save(UB, None, PLD, "pix", M_PIX, 5, 1, None, "active", 0), "forbidden")
        denied("técnico não configura", save(UT, None, PLD, "pix", M_PIX, 5, 1, None, "active", 0), "forbidden")
        denied("gestor comercial não configura (só admin/financeiro)", save(UGC, None, PLD, "pix", M_PIX, 5, 1, None, "active", 0), "forbidden")
        denied("admin F não edita config de A (sem oráculo)", save(UADMF, pix, PLD, "pix", M_PIX, 9, 1, None, "active", 1), "forbidden")
        denied("anônimo sem EXECUTE no writer", out(h.as_user(None, f"SELECT public.b2b_payment_method_config_list();", "anon")), "permission denied")
        j, e = call(UADMF, "public.b2b_payment_method_config_list()")
        check("lista do vendedor F só vê F", j and {c["organization_id"] for c in j["configs"]} == {F}, e)
        denied("comprador não lista configs internas", call(UB, "public.b2b_payment_method_config_list()"), "forbidden")
        denied("tabela de configs fechada a authenticated", out(h.as_user(UADM, "SELECT count(*) FROM public.b2b_payment_method_configs;")), "permission denied")

        # ---------- opções do comprador ----------
        j, e = call(UB, f"public.b2b_list_payment_method_options_secure('{P}','{PLD}')")
        kinds = sorted(o["method_kind"] for o in (j or {}).get("options", []))
        check("comprador P vê só meios ativos do vendedor A na condição", kinds == ["dinheiro", "pix"] and all(o["config_id"] != pixF for o in j["options"]), e or kinds)
        j, e = call(UBF, f"public.b2b_list_payment_method_options_secure('{PF}','{PLD}')")
        check("comprador F vê só o Pix de F", j and [o["config_id"] for o in j["options"]] == [pixF], e or j)
        denied("comprador P pedindo parceiro F negado", call(UB, f"public.b2b_list_payment_method_options_secure('{PF}','{PLD}')"), "forbidden_partner")
        denied("técnico negado (termos financeiros)", call(UT, f"public.b2b_list_payment_method_options_secure('{P}','{PLD}')"), "forbidden_financial_terms")
        denied("comprador inativo negado", call(UINACT, f"public.b2b_list_payment_method_options_secure('{P}','{PLD}')"), "")
        denied("anônimo sem EXECUTE no leitor", out(h.as_user(None, f"SELECT public.b2b_list_payment_method_options_secure('{P}','{PLD}');", "anon")), "permission denied")
        j, e = call(UB, f"public.b2b_list_payment_method_options_secure('{P}','{PNA}')")
        check("condição não publicada ao parceiro: nenhuma opção", j and j["options"] == [], e or j)
        j, e = call(UB, f"public.b2b_list_payment_method_options_secure('{P}','{P3}')")
        o3 = {o["method_kind"]: o for o in (j or {}).get("options", [])}
        check("plano 3x: boleto disponível, Pix indisponível (parcelas incompatíveis)", o3.get("boleto", {}).get("available") is True
              and o3.get("pix", {}).get("available") is False and o3["pix"]["reason"] == "payment_method_installments_incompatible", e or o3)
        j, e = call(UB, f"public.b2b_list_payment_method_options_secure('{P}','{PINT}')")
        check("plano com juros próprios: boleto Price indisponível (juros em dobro)", j and j["options"][0]["available"] is False
              and j["options"][0]["reason"] == "payment_method_price_interest_conflict", e or j)

        # ---------- simulação com meio ----------
        base = date.fromisoformat(h.psql("SELECT CURRENT_DATE").stdout.strip())
        for nm, items, amt in (("líquido", [LIQ], 0.90), ("embalagem inteira", [PACK], 18.00), ("misto", [LIQ, PACK], 18.90)):
            j, e = sim(UB, P, PLD, items, pix, 1)
            ok = j and j["final_amount"] == amt and j["estimated_schedule"] == [{"installment_number": 1, "estimated_due_date": (base + timedelta(days=5)).isoformat(),
                 "amount": amt, "principal_amount": amt, "interest_amount": 0}] and j["schedule_estimated"] is True and j["due_basis"] == "nf_issue"
            check(f"simulação Pix {nm}: R$ {amt:.2f} em 1 parcela estimada base+5d", ok, e or j and (j["final_amount"], j["estimated_schedule"]))
        j, e = sim(UB, P, P3, [LIQ, PACK], bol, 1)
        exp = price_schedule(18.90, 3, "2.5", 10, base)
        check("boleto 3x Price 2,5%: parcelas = cálculo Decimal independente", j and j["estimated_schedule"] == exp, e or (j and j["estimated_schedule"], exp))
        check("boleto 3x: principal soma exatamente o líquido (18,90)", j and abs(sum(Decimal(str(x["principal_amount"])) for x in j["estimated_schedule"]) - Decimal("18.90")) == 0)
        check("boleto 3x: total estimado = soma das parcelas", j and Decimal(str(j["estimated_total"])) == sum(Decimal(str(x["amount"])) for x in exp))
        j, e = call(UB, f"(SELECT platform_private.b2b_payment_method_estimate(100,3,31,0,'2027-01-01'))", "postgres")
        check("taxa 0: 33,33+33,33+33,34 e meses mesmo dia/último dia (01/02→01/03→01/04)", j and [x["amount"] for x in j] == [33.33, 33.33, 33.34]
              and [x["estimated_due_date"] for x in j] == ["2027-02-01", "2027-03-01", "2027-04-01"], j)
        j, e = call(UB, f"(SELECT platform_private.b2b_payment_method_estimate(10,3,30,0,'2027-01-01'))", "postgres")
        check("1ª em 31/01 → 28/02 → 31/03 (último dia)", j and [x["estimated_due_date"] for x in j] == ["2027-01-31", "2027-02-28", "2027-03-31"], j)
        denied("helper de estimativa fechado ao cliente", call(UB, "platform_private.b2b_payment_method_estimate(1,1,1,0,CURRENT_DATE)"), "permission denied")
        denied("sem meio: payment_method_required", sim(UB, P, PLD, [LIQ], None, None), "payment_method_required")
        denied("config inexistente: indisponível sem oráculo", sim(UB, P, PLD, [LIQ], str(uuid.uuid4()), 1), "payment_method_unavailable")
        denied("config de F usada por comprador de A: indisponível", sim(UB, P, PLD, [LIQ], pixF, 1), "payment_method_unavailable")
        denied("config de outra condição: indisponível", sim(UB, P, PLD, [LIQ], bol, 1), "payment_method_unavailable")
        denied("Pix em plano 3x: parcelas incompatíveis", sim(UB, P, P3, [LIQ], pix3, 1), "payment_method_installments_incompatible")
        denied("boleto em plano com juros: conflito Price", sim(UB, P, PINT, [LIQ], bolint, 1), "payment_method_price_interest_conflict")
        denied("técnico não simula com meio", sim(UT, P, PLD, [LIQ], pix, 1), "forbidden_financial_terms")
        j, e = sim(UB, P, PLD, [dict(LIQ, preco_unitario=0.01, subtotal=0.01)], pix, 1)
        check("preço client-side não altera valor (erro ou R$ 0,90)", (j is None and e) or (j and j["final_amount"] == 0.90), e or j)

        # ---------- criação ----------
        hm = base_hash(UB, P, PLD, [LIQ, PACK])
        j, e = create(UB, P, PLD, [LIQ, PACK], "k-1", pix, 1, hm)
        o1 = j and j["id"]
        check("pedido misto com Pix: criado com snapshot do meio (estimado, base NF)", j and j["payment_method"]["method_kind"] == "pix" and j["payment_method"]["version"] == 1
              and j["payment_method"]["schedule_estimated"] is True and j["payment_method"]["due_basis"] == "nf_issue" and j["total"] == 18.90, e or j)
        j2, e = create(UB, P, PLD, [LIQ, PACK], "k-1", pix, 1, hm)
        check("repetição mesma chave+meio: mesmo pedido", j2 and j2["id"] == o1, e or j2)
        n = h.psql(f"SELECT count(*) FROM public.partner_order_payment_method_snapshots WHERE partner_order_id='{o1}'").stdout.strip()
        check("um único snapshot após repetição", n == "1", n)
        denied("mesma chave com outro meio: conflito", create(UB, P, PLD, [LIQ, PACK], "k-1", cash, 1, hm), "idempotency_conflict")
        denied("mesma chave por outro comprador: negado", create(UB2, P, PLD, [LIQ, PACK], "k-1", pix, 1, hm), "forbidden_partner")
        # legado direto: bloqueado com erro explícito no COMMIT
        r = h.as_user(UB, f"SELECT public.create_partner_order_secure('{P}',NULL,'{json.dumps([LIQ])}'::jsonb,NULL,'{PLD}',NULL,NULL,'{base_hash(UB, P, PLD, [LIQ])}','legacy-1');")
        check("contrato antigo pelo comprador: B2B_PAYMENT_METHOD_REQUIRED, nada gravado", r.returncode != 0 and "B2B_PAYMENT_METHOD_REQUIRED" in r.stderr
              and h.psql("SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key='legacy-1'").stdout.strip() == "0", r.stderr[-200:])
        r = h.as_user(UADM, f"SELECT public.create_partner_order_secure('{P}',NULL,'{json.dumps([LIQ])}'::jsonb,NULL,'{PLD}',NULL,NULL,'{base_hash(UADM, P, PLD, [LIQ])}','internal-1');")
        check("ator interno do vendedor segue o caminho atual (inalterado)", r.returncode == 0, r.stderr[-200:])
        # parcelas: boleto 3x (do plano); cliente não tem parâmetro de parcelas
        hb = base_hash(UB, P, P3, [PACK])
        j, e = create(UB, P, P3, [PACK], "k-bol", bol, 1, hb)
        check("boleto 3x: snapshot 3 parcelas Price (n do plano, nunca do cliente)", j and j["payment_method"]["installment_count"] == 3
              and j["payment_method"]["estimated_schedule"] == price_schedule(18.00, 3, "2.5", 10, base), e or j)
        # stale/revogação/concorrência
        j, e = save(UADM, pix, PLD, "pix", M_PIX, 7, 1, None, "active", 1); check("admin A altera Pix (v2) com CAS", j and j["config"]["version"] == 2, e)
        denied("CAS antigo recusado", save(UADM, pix, PLD, "pix", M_PIX, 8, 1, None, "active", 1), "payment_method_config_stale")
        denied("simulação com versão antiga: stale", sim(UB, P, PLD, [LIQ], pix, 1), "payment_method_stale")
        denied("criação com versão antiga: stale", create(UB, P, PLD, [LIQ, PACK], "k-stale", pix, 1, hm), "payment_method_stale")
        v1snap = h.psql(f"SELECT config_version||':'||due_days FROM public.partner_order_payment_method_snapshots WHERE partner_order_id='{o1}'").stdout.strip()
        check("snapshot histórico preserva v1 e 5 dias após alteração", v1snap == "1:5", v1snap)
        r = h.psql(f"UPDATE public.partner_order_payment_method_snapshots SET due_days=1 WHERE partner_order_id='{o1}'", check=False)
        check("snapshot imutável (UPDATE recusado até para owner)", r.returncode != 0 and "immutable" in r.stderr)
        r = h.psql(f"DELETE FROM public.b2b_payment_method_config_versions", check=False)
        check("histórico de versões append-only", r.returncode != 0)
        # Concorrência: revogação enquanto pedido trava a config (FOR SHARE) -> uma ordem serializada, sem pedido com versão revogada.
        hp = base_hash(UB, P, PLD, [LIQ])
        res = parallel([claims(UB) + f"BEGIN; SELECT public.create_partner_order_with_method_secure('{P}',NULL,'{json.dumps([LIQ])}'::jsonb,NULL,'{PLD}','{hp}','k-cc',{repr(pix)}::uuid,2); SELECT pg_sleep(1.5); COMMIT;",
                        "SELECT pg_sleep(0.5);\n" + claims(UADM) + f"SELECT public.b2b_payment_method_config_save({repr(pix)}::uuid,'{PLD}','pix','{M_PIX}',7,1,NULL,'revoked',2);"])
        made = h.psql("SELECT count(*) FROM platform_private.b2b_payment_method_order_receipts WHERE idempotency_key='k-cc'").stdout.strip()
        check("concorrência criação×revogação: pedido v2 confirmado e revogação aplicada depois", res[0].returncode == 0 and res[1].returncode == 0 and made == "1",
              (res[0].stderr[-200:], res[1].stderr[-200:]))
        denied("após revogação: indisponível", sim(UB, P, PLD, [LIQ], pix, 3), "payment_method_unavailable")
        j, e = call(UB, f"public.b2b_list_payment_method_options_secure('{P}','{PLD}')")
        check("revogado sai das opções", j and [o["method_kind"] for o in j["options"]] == ["dinheiro"], e or j)
        # Mesma chave em paralelo: um pedido só.
        hc = base_hash(UB, P, PLD, [PACK])
        sql = claims(UB) + f"BEGIN; SELECT public.create_partner_order_with_method_secure('{P}',NULL,'{json.dumps([PACK])}'::jsonb,NULL,'{PLD}','{hc}','k-par',{repr(cash)}::uuid,1); SELECT pg_sleep(0.5); COMMIT;"
        res = parallel([sql, sql])
        n = h.psql("SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key='k-par'").stdout.strip()
        check("duas requisições paralelas com a mesma chave: um pedido", all(x.returncode == 0 for x in res) and n == "1", [x.stderr[-150:] for x in res])
        # Leitura do snapshot
        j, e = call(UB, f"public.get_partner_order_payment_method_secure('{o1}')")
        check("comprador lê meio do pedido (presente, estimado)", j and j["present"] and j["payment_method"]["method_kind"] == "pix" and j["payment_method"]["schedule_estimated"], e or j)
        j, e = call(UADM, f"public.get_partner_order_payment_method_secure('{o1}')"); check("admin do vendedor lê meio do pedido", j and j["present"], e)
        denied("comprador de F não lê pedido de A", call(UBF, f"public.get_partner_order_payment_method_secure('{o1}')"), "forbidden")
        denied("admin F não lê pedido de A", call(UADMF, f"public.get_partner_order_payment_method_secure('{o1}')"), "forbidden")

        # ---------- rollback deny-only ----------
        rb_files = g["build"](pins=pins, cols=cols, fn_md5=fm["install"])
        (work / "04.sql").write_text(rb_files["04-rollback-deny.sql.review"])
        r = h.runfile(work / "04.sql"); check("04 rollback deny-only", r.returncode == 0, r.stderr[-300:])
        denied("após rollback: opções negadas", call(UB, f"public.b2b_list_payment_method_options_secure('{P}','{PLD}')"), "permission denied")
        r = h.as_user(UB, f"SELECT public.create_partner_order_secure('{P}',NULL,'{json.dumps([LIQ])}'::jsonb,NULL,'{PLD}',NULL,NULL,'{base_hash(UB, P, PLD, [LIQ])}','legacy-2');")
        check("após rollback: contrato antigo continua bloqueado (sem reabrir fallback)", r.returncode != 0 and "B2B_PAYMENT_METHOD_REQUIRED" in r.stderr)
        n = h.psql("SELECT count(*) FROM public.partner_order_payment_method_snapshots").stdout.strip()
        check("após rollback: snapshots preservados", int(n) >= 3, n)
        fm["deny"] = {k: h.psql(f"SELECT md5(pg_get_functiondef('{s}'::regprocedure))").stdout.strip() for k, s in g["PUB"].items()}
        (HERE / "fn-md5.json").write_text(json.dumps(fm, indent=2) + "\n")
    finally:
        h.stop(tmp)
    passed = sum(1 for c in checks if c["ok"])
    (HERE / "evidence-local-pg.json").write_text(json.dumps({"contract": "B2B_PAYMENT_METHOD_V1", "kind": "DISPOSABLE_PG_WITH_DECLARED_SEAMS_NOT_HOSTED_PROOF",
        "passed": passed, "total": len(checks), "checks": checks}, indent=2, ensure_ascii=False) + "\n")
    print(f"{passed}/{len(checks)}")
    for c in checks:
        if not c["ok"]: print("FAIL", c["name"], c.get("detail", ""))
    return 0 if passed == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
