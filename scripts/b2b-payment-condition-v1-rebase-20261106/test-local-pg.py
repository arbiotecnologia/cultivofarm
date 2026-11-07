#!/usr/bin/env python3
"""PG DESCARTÁVEL — B2B_PAYMENT_CONDITION_V1 rebaseado sobre create LIVE c34e7404. Sem rede, sem banco hospedado, sem sessão real.

Base = harness do pacote b2b-solid-packaging-order-20261106 em modo GATILHOS REAIS (B2BPACK_REAL_TRIGGERS=1) com o 02 do B2
aplicado: create = CORPO REAL c34e7404 (md5 conferido), gatilhos reais de partner_orders/itens/condição; crédito/juros/plano
REAIS (213ac31f/806e5d87/4cb833a3), h15 REAL (64e10608), leitor do parceiro REAL (bd985484), carrinho/hash REAIS.

COSTURAS DECLARADAS (não são prova): as do harness B2 (auth.uid por GUC, has_role/c2_* mínimos, entitlements, tabelas de
2º nível); payment_methods/financial_categories mínimas; get_partner_order_payment_terms_secure = portas mínimas. Pins de
colunas/leitor de condição trocados SÓ na cópia temporária. Nunca prova JWT/RLS/PostgREST hospedado.
Dados 100% fictícios (TESTE): vendedor A (papel AR Bio) e F (outro tenant, papel FSF). Boleto com prazo 30 dias.
"""
import calendar, json, os, pathlib, runpy, subprocess, sys, tempfile, threading, time, uuid
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

os.environ["B2BPACK_REAL_TRIGGERS"] = "1"
HERE = pathlib.Path(__file__).resolve().parent
SPD = HERE.parent / "b2b-solid-packaging-order-20261106"
sys.path.insert(0, str(SPD))
import importlib.util
_spec = importlib.util.spec_from_file_location("sp", SPD / "test-local-pg.py"); SP = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(SP)
import real_extras as RX  # noqa: E402
g = runpy.run_path(str(HERE / "generate.py"), run_name="lib")
SP.PORT = "55463"

u = SP.u
A, F, P, PO, PF = SP.A, SP.F, SP.P, SP.PO, SP.PF
UB, UT, UB2, UADM, UADMF, UINACT = SP.UB, SP.UT, SP.UB2, SP.UADM, SP.UADMF, SP.UINACT
UFIN, UGC = u(29), u(30)
PC, UBC = u(85), u(86)  # parceiro/comprador sintéticos isolados para fronteiras de crédito
PLD, PLQ = SP.PLD, SP.PLQ
P3, PINT, PNA, P3B = u(81), u(82), u(83), u(84)
M_PIX, M_BOL, M_CASH, M_OFF, M_PROM, M_DEB = u(91), u(92), u(93), u(94), u(95), u(96)
CAT, CAT_D, CAT_OFF = u(97), u(98), u(99)
psql, as_user = SP.psql, SP.as_user
CHECKS = []


def check(name, ok, detail=""):
    CHECKS.append({"name": name, "ok": bool(ok), **({} if ok else {"detail": str(detail)[:400]})})


def out(r):
    if r.returncode != 0:
        return None, (r.stderr or "").strip()
    return json.loads(r.stdout.strip().splitlines()[-1]), None


def call(uid, sql, role="authenticated"):
    return out(as_user(uid, f"SELECT ({sql})::text;", role))


def denied(name, r, token):
    j, e = r
    check(name, j is None and token in (e or ""), f"esperado {token!r}; obtido {e or j}")


def L(q=1):
    return {"item_id": SP.LIQ, "item_tipo": "produto", "quantidade": q, "unidade_medida": "unidade", "volume_ml": 1000}


def S(q=1):
    return {"item_id": SP.SOL, "item_tipo": "produto", "packaging_id": SP.PK25, "quantidade": q}


def SF(q=1):
    return {"item_id": SP.FSOL, "item_tipo": "produto", "packaging_id": SP.PKF, "quantidade": q}


def js(x):
    return json.dumps(x).replace("'", "''")


def ch(method, ver, days):
    return {"payment_method": method, "payment_condition_version": ver, "payment_deadline_days": days}


def publish(uid, plan, method, pm, days, n, rate, exp, cat=CAT):
    return call(uid, f"public.b2b_payment_condition_publish('{plan}','{method}','{pm}','{cat}',{days},{n},{rate}::numeric,{exp})")


def assign(uid, partner, plan, method, ver, en=True):
    return call(uid, f"public.b2b_payment_condition_assign('{partner}','{plan}','{method}',{ver},{str(en).lower()})")


def activation(uid, mode, partners, ver):
    arr = "ARRAY[" + ",".join(f"'{p}'::uuid" for p in partners) + "]::uuid[]" if partners else "'{}'::uuid[]"
    return call(uid, f"public.b2b_payment_condition_activation_set('{mode}',{arr},{ver})")


def sim(uid, plan, items, choice, partner=P):
    c = "NULL" if choice is None else f"'{js(choice)}'::jsonb"
    return call(uid, f"public.simulate_b2b_payment_condition_secure('{partner}','{plan}','{js(items)}'::jsonb,{c})")


def create_sql(partner, plan, items, h, key, choice):
    c = "NULL" if choice is None else f"'{js(choice)}'::jsonb"
    return f"public.create_partner_order_condition_secure('{partner}',NULL,'{js(items)}'::jsonb,NULL,'{plan}','{h}','{key}',{c})"


def create(uid, plan, items, h, key, choice, partner=P):
    return call(uid, create_sql(partner, plan, items, h, key, choice))


def legacy(uid, plan, items, key, partner=P):
    s, _ = call(uid, f"public.simulate_b2b_payment_plan_secure('{partner}','{plan}','{js(items)}'::jsonb)")
    h = s["cart_hash"] if s else "x"
    return as_user(uid, f"SELECT public.create_partner_order_secure('{partner}',NULL,'{js(items)}'::jsonb,NULL,'{plan}',NULL,NULL,'{h}','{key}')::text;")


def respond(uid, order_id, lines, motivo=None):
    return call(uid, f"public.respond_b2b_order_quote_secure('{order_id}','{js(lines)}'::jsonb,NULL,NULL,{('NULL' if motivo is None else repr(motivo))})")


def price(principal, n, rate, due_days, base):
    """Price independente (Decimal, centavos ROUND_HALF_UP; última parcela absorve o resíduo do principal)."""
    c = Decimal("0.01"); bal = Decimal(str(principal)).quantize(c); i = Decimal(str(rate)) / 100
    pmt = (bal / n).quantize(c, ROUND_HALF_UP) if i == 0 else (bal * i / (1 - (1 + i) ** -n)).quantize(c, ROUND_HALF_UP)
    first = base + timedelta(days=due_days); rows = []
    for k in range(1, n + 1):
        it = (bal * i).quantize(c, ROUND_HALF_UP); pr = pmt - it if k < n else bal
        m = first.month - 1 + (k - 1); y = first.year + m // 12; m = m % 12 + 1
        d = date(y, m, min(first.day, calendar.monthrange(y, m)[1]))
        rows.append((k, d.isoformat(), pr + it, pr, it)); bal -= pr
    return rows


def rows_of(sched):
    return [(r["installment_number"], r["due_date"], Decimal(str(r["amount"])), Decimal(str(r["principal_amount"])), Decimal(str(r["interest_amount"]))) for r in sched]


def session(uid, body):
    pre = f"SET ROLE authenticated;\nSELECT set_config('request.jwt.claim.sub','{uid}',false) \\g /dev/null\n" if uid else ""
    return pre + body


def parallel(sqls, delays):
    res = [None] * len(sqls)

    def run(ix, s, d):
        time.sleep(d); res[ix] = psql(s, check=False)
    ts = [threading.Thread(target=run, args=(ix, s, d)) for ix, (s, d) in enumerate(zip(sqls, delays))]
    [t.start() for t in ts]; [t.join() for t in ts]
    return res


def idem(key):
    return psql(f"SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key='{key}'").stdout.strip()


SEAMS = f"""
CREATE TABLE public.payment_methods(id uuid PRIMARY KEY, name text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS public.financial_categories(id uuid PRIMARY KEY, name text NOT NULL, type text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE FUNCTION public.get_partner_order_payment_terms_secure(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM partner_orders o JOIN partner_accounts pa ON pa.id = o.partner_id WHERE o.id = p_order_id AND (
      EXISTS (SELECT 1 FROM partner_users pu WHERE pu.partner_id = o.partner_id AND pu.user_id = auth.uid())
      OR (has_role(auth.uid(),'administrador') AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.organization_id = pa.commercial_owner_organization_id)))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN '{{}}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.get_partner_order_payment_terms_secure(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_partner_order_payment_terms_secure(uuid) TO authenticated;
INSERT INTO public.profiles VALUES ('{UFIN}','{A}',true),('{UGC}','{A}',true),('{UBC}','{A}',true);
INSERT INTO public.partner_accounts VALUES ('{PC}',true,NULL,'{A}');
INSERT INTO public.partner_users VALUES ('{UBC}','{PC}');
INSERT INTO public.user_roles VALUES ('{UFIN}','financeiro'),('{UGC}','gestor_comercial'),('{UBC}','parceiro_b2b');
INSERT INTO platform_private.seam_entitlements VALUES ('{UFIN}','pedidos_b2b'),('{UGC}','pedidos_b2b'),('{UFIN}','catalogo_precos'),('{UGC}','catalogo_precos'),
  ('{UBC}','pedidos_b2b'),('{UBC}','catalogo_precos');
INSERT INTO public.partner_financial_settings(id,partner_id,credit_limit,credit_limit_action,block_if_overdue,overdue_tolerance_days) VALUES
  (gen_random_uuid(),'{P}',1000000,'block',false,0),(gen_random_uuid(),'{PF}',1000000,'block',false,0),(gen_random_uuid(),'{PC}',1018.11,'block',false,0);
INSERT INTO public.payment_methods VALUES ('{M_PIX}','Pix TESTE',true),('{M_BOL}','Boleto TESTE',true),('{M_CASH}','Dinheiro TESTE',true),
  ('{M_OFF}','Inativo TESTE',false),('{M_PROM}','Promissória TESTE',true),('{M_DEB}','Débito TESTE',true);
INSERT INTO public.financial_categories(id,name,type,active) VALUES ('{CAT}','Receita B2B TESTE','RECEITA',true),('{CAT_D}','Despesa TESTE','DESPESA',true),
  ('{CAT_OFF}','Receita inativa TESTE','RECEITA',false);
INSERT INTO public.commercial_payment_plans(id,active,pricing_mode,discount_percent,monthly_interest_percent,months_count,interest_type,installment_count,
  max_days,minimum_order_amount,requires_financial_approval,requires_guarantee,requires_credit_approval,name,code) VALUES
  ('{P3}',true,'discount_from_base',0,0,1,'simple',3,90,NULL,false,false,false,'TESTE 3x','T3'),
  ('{P3B}',true,'discount_from_base',0,0,1,'simple',3,90,NULL,false,false,false,'TESTE 3x B','T3B'),
  ('{PINT}',true,'discount_from_base',0,2,3,'compound',3,90,NULL,false,false,false,'TESTE juros 3x','TJ'),
  ('{PNA}',true,'discount_from_base',0,0,1,'simple',1,30,NULL,false,false,false,'TESTE não publicado','TN');
INSERT INTO public.commercial_payment_plan_assignments VALUES
  ('published','{PLD}','partner','{P}',NULL,CURRENT_DATE-1,NULL),('published','{PLD}','partner','{PF}',NULL,CURRENT_DATE-1,NULL),
  ('published','{PLQ}','partner','{P}',NULL,CURRENT_DATE-1,NULL),('published','{PLQ}','partner','{PF}',NULL,CURRENT_DATE-1,NULL),
  ('published','{P3}','partner','{P}',NULL,CURRENT_DATE-1,NULL),('published','{P3}','partner','{PC}',NULL,CURRENT_DATE-1,NULL),
  ('published','{P3B}','partner','{P}',NULL,CURRENT_DATE-1,NULL),('published','{PINT}','partner','{P}',NULL,CURRENT_DATE-1,NULL),
  ('draft','{PNA}','partner','{P}',NULL,CURRENT_DATE-1,NULL);
"""


def boot():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="b2bcond-", dir="/tmp")); tmp.chmod(0o777); SP.SOCK[0] = str(tmp)
    subprocess.run(SP.su() + ["initdb", "-D", str(tmp / "d"), "-U", "postgres", "-A", "trust"], check=True, capture_output=True)
    subprocess.run(SP.su() + ["pg_ctl", "-D", str(tmp / "d"), "-o", f"-p {SP.PORT} -k {tmp} -c listen_addresses=''", "-l", str(tmp / "log"), "-w", "start"],
                   check=True, capture_output=True)
    psql("CREATE DATABASE t", db="postgres")
    psql(SP.SCHEMA); psql(SP.RT.real_tables_sql())
    for name in ("public.fn_resolve_commercial_price", "public.recorte_a_legacy_solid", "platform_private.b2b_partner_catalog_reader",
                 "platform_private.solid_pack_presentation_link", "platform_private.partner_order_items_catalog_tenant_guard",
                 "public.fn_b2b_guard_order_items_immutable", "public.fn_resolve_b2b_cart", "public.fn_b2b_cart_hash",
                 "public.create_partner_order_secure", "public.simulate_b2b_payment_plan_secure", "public.respond_b2b_order_quote_secure"):
        psql(SP.cap(name))
    psql(SP.CATALOG_SEAM + SP.REAL_TRIGGERS); psql(SP.RT.real_triggers_sql())
    sp_src = (SPD / "test-local-pg.py").read_text()
    acl = sp_src.split('        psql("""REVOKE ALL ON FUNCTION public.create_partner_order_secure', 1)[1].split('""")', 1)[0]
    psql("REVOKE ALL ON FUNCTION public.create_partner_order_secure" + acl)
    psql(SP.FIXTURES); psql(SP.RT.fixtures_sql([UB, UT, UB2, SP.UADM, SP.UADMF, SP.UINACT, SP.UCONS, SP.USUP]))
    for f in ("01-pre.sql.readonly", "02-install.sql.review", "03-post.sql.readonly"):
        r = SP.runfile(SPD / f); check(f"estado instalado B2: {f}", r.returncode == 0, r.stderr[-300:])
    blk = (SPD / "real_extras.py").read_text().split('psql("""\nCREATE TABLE IF NOT EXISTS public.accounts_receivable', 1)[1].split('""")', 1)[0]
    psql("CREATE TABLE IF NOT EXISTS public.accounts_receivable" + blk)
    for n in ("public.fn_b2b_credit_exposure", "public.fn_b2b_apply_interest", "public.fn_b2b_plan_selectable"):
        psql(RX._cap("credit", n))
    psql("""REVOKE ALL ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) TO service_role;""")
    psql((HERE.parent / "b2b-cart-catalog-fence-20261106" / "captured" / "platform_private.h15_actor_organization.64e10608.live-20261106.sql").read_text().rstrip() + ";\n"
         "REVOKE ALL ON FUNCTION platform_private.h15_actor_organization() FROM PUBLIC;")
    psql(SEAMS)
    return tmp


def md5_of(sig):
    return psql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))").stdout.strip()


def runf(path):
    return subprocess.run(SP.su() + ["psql", "-X", "-q", "-t", "-A", "-h", SP.SOCK[0], "-p", SP.PORT, "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-f", str(path)],
                          capture_output=True, text=True)


CREATE_SIG = "public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)"
SIM_SIG = "public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)"


def main():
    tmp = boot(); work = pathlib.Path(tempfile.mkdtemp(prefix="b2bcond-w-")); work.chmod(0o777)
    fm = {}
    try:
        real = {k: v for k, v in g["LIVE_PINS"].items() if "payment_terms_secure" not in k}
        full = {}
        for sig, md in real.items():
            loc = md5_of(sig); full[sig] = loc
            check(f"corpo REAL = LIVE: {sig}", loc.startswith(md), f"{loc} != {md}")
        pins = dict(g["LIVE_PINS"]); pins.update(full)
        seam_sig = next(k for k in pins if "payment_terms_secure" in k); pins[seam_sig] = md5_of(seam_sig)
        cols = {t: psql(f"SELECT md5(string_agg(column_name||':'||data_type, ',' ORDER BY ordinal_position)) FROM information_schema.columns WHERE table_schema='public' AND table_name='{t}'").stdout.strip()
                for t in g["LIVE_COLS"]}

        def write(fmd=None, dmd=None, p=pins):
            files = g["build"](pins=p, cols=cols, fn_md5=fmd, deny_md5=dmd)
            for n, t in files.items(): (work / n).write_text(t); (work / n).chmod(0o644)
            return files

        # ---------- candidata comprovada / install transacional ----------
        import hashlib
        check("candidata comprovada: schema.sql.review/build.py com 14103/13768 caracteres e sha256 pinado",
              len((g["PRIOR_DIR"] / "schema.sql.review").read_text()) == 14103 and len((g["PRIOR_DIR"] / "build.py").read_text()) == 13768
              and all(hashlib.sha256((g["PRIOR_DIR"] / n).read_bytes()).hexdigest() == h for n, h in g["PRIOR_PINS"].items()))
        bad = dict(pins); bad[CREATE_SIG] = "0" * 32
        (work / "bad-install.sql").write_text(g["build"](pins=bad, cols=cols)["02-install.sql.review"]); (work / "bad-install.sql").chmod(0o644)
        r = runf(work / "bad-install.sql")
        left = psql("SELECT count(*) FROM pg_class WHERE relname LIKE 'b2b_condition%' OR relname LIKE 'b2b_order_condition%'").stdout.strip()
        check("02 com corpo LIVE divergente aborta sem deixar objetos", r.returncode != 0 and "divergente" in r.stderr and left == "0", (r.stderr[-200:], left))
        write()
        r = runf(work / "01-pre.sql.readonly"); check("01 PRE_OK", r.returncode == 0 and "PRE_OK" in r.stderr, r.stderr[-300:])
        r = runf(work / "02-install.sql.review"); check("02 install", r.returncode == 0, r.stderr[-600:])
        fm["install"] = {k: md5_of(s) for k, s in g["PUB"].items()}
        fm["install"]["quote"] = md5_of(g["QUOTE_SIG"])
        write(fm["install"])
        r = runf(work / "03-post.sql.readonly"); check("03 POST_OK", r.returncode == 0 and "POST_OK" in r.stderr, r.stderr[-300:])
        r = runf(work / "02-install.sql.review"); check("rerun do install recusado", r.returncode != 0)
        check("create/simulate LIVE originais intactos; somente a resposta de cotação ganhou o ramo condicionado",
              md5_of(CREATE_SIG) == g["LIVE_PINS"][CREATE_SIG] and md5_of(SIM_SIG) == g["LIVE_PINS"][SIM_SIG]
              and md5_of(g["QUOTE_SIG"]) != g["LIVE_PINS"][g["QUOTE_SIG"]])
        check("sem dois contratos: nenhum objeto rev.2 B2B_PAYMENT_METHOD_V1 nem create antigo de 10 argumentos",
              psql("SELECT (to_regclass('public.b2b_payment_method_configs') IS NULL AND to_regprocedure('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text,jsonb)') IS NULL)::text").stdout.strip() == "true")

        # ---------- sem ativação: contrato atual para todos ----------
        r = legacy(UB, PLD, [L(1)], "TESTE-LEG-0"); check("sem ativação: comprador segue contrato atual (nenhum bloqueio global)", r.returncode == 0, r.stderr[-200:])
        r = legacy(UB2, PLD, [SF(1)], "TESTE-LEG-F0", partner=PF); check("sem ativação: outro tenant (papel FSF) segue contrato atual", r.returncode == 0, r.stderr[-200:])

        # ---------- configuração (vendedor) ----------
        j, e = publish(UADM, PLD, "pix", M_PIX, 5, 1, 0, 0); check("admin A publica Pix v1 (5 dias)", j and j["condition"]["version"] == 1, e)
        j, e = publish(UFIN, P3, "boleto", M_BOL, 30, 3, "1.8", 0); check("financeiro A publica boleto 3x Price 1,8% em 30 dias", j and j["condition"]["deadline_days"] == 30, e)
        publish(UADM, PLD, "dinheiro", M_CASH, 0, 1, 0, 0); publish(UADM, PLQ, "pix", M_PIX, 5, 1, 0, 0); publish(UADM, P3, "pix", M_PIX, 5, 1, 0, 0)
        publish(UADM, PLQ, "boleto", M_BOL, 30, 3, "1.8", 0)
        j, e = publish(UADM, P3B, "promissoria", M_PROM, 30, 3, 0, 0); check("promissória personalizável: 3x taxa explícita 0", j and j["condition"]["method"] == "promissoria", e)
        j, e = publish(UADM, P3B, "cartao_credito", M_PROM, 30, 2, "2.5", 0); check("cartão de crédito personalizável: 2x 2,5%", j and j["condition"]["installment_count"] == 2, e)
        j, e = publish(UADM, P3B, "cartao_debito", M_DEB, 1, 1, 0, 0); check("débito: parcela única com 1 dia", j and j["condition"]["installment_count"] == 1, e)
        denied("plano com juros próprios recusado (uma fonte de juros)", publish(UADM, PINT, "boleto", M_BOL, 30, 3, "1", 0), "payment_condition_plan_interest_conflict")
        denied("Pix parcelado recusado", publish(UADM, P3, "pix", M_PIX, 5, 2, 0, 1), "check constraint")
        denied("boleto 4x recusado", publish(UADM, PNA, "boleto", M_BOL, 5, 4, "1", 0), "check constraint")
        denied("parcela única com juros recusada", publish(UADM, PNA, "boleto", M_BOL, 5, 1, "1", 0), "check constraint")
        denied("meio fora dos seis recusado", publish(UADM, PNA, "cheque", M_PIX, 5, 1, 0, 0), "check constraint")
        denied("prazo acima do plano recusado", publish(UADM, PNA, "pix", M_PIX, 31, 1, 0, 0), "payment_condition_deadline_exceeds_plan")
        denied("meio inativo no catálogo recusado", publish(UADM, PNA, "pix", M_OFF, 5, 1, 0, 0), "payment_method_catalog_unavailable")
        denied("categoria não RECEITA recusada", publish(UADM, PNA, "pix", M_PIX, 5, 1, 0, 0, cat=CAT_D), "revenue_category_unavailable")
        denied("categoria RECEITA inativa recusada", publish(UADM, PNA, "pix", M_PIX, 5, 1, 0, 0, cat=CAT_OFF), "revenue_category_unavailable")
        denied("publicação com CAS antigo = stale", publish(UADM, PLD, "pix", M_PIX, 5, 1, 0, 0), "payment_condition_config_stale")
        for nm, uid in (("comprador", UB), ("técnico", UT), ("gestor comercial (só leitura)", UGC), ("superadmin", SP.USUP)):
            denied(f"{nm} não configura", publish(uid, PNA, "pix", M_PIX, 5, 1, 0, 0), "forbidden")
        j, e = publish(UADMF, PLD, "pix", M_PIX, 2, 1, 0, 0); check("admin F publica a própria versão (isolada)", j and j["condition"]["organization_id"] == F, e)
        for plan, m in ((PLD, "pix"), (PLD, "dinheiro"), (PLQ, "pix"), (PLQ, "boleto"), (P3, "boleto"), (P3, "pix"), (P3B, "promissoria")):
            assign(UADM, P, plan, m, 1)
        assign(UADM, PC, P3, "boleto", 1)
        j, e = assign(UADMF, PF, PLD, "pix", 1); check("admin F atribui ao próprio parceiro", j and j["enabled"], e)
        denied("admin A não atribui parceiro de F", assign(UADM, PF, PLD, "pix", 1), "forbidden_partner")
        denied("admin F não atribui parceiro de A", assign(UADMF, P, PLD, "pix", 1), "forbidden_partner")
        j, e = call(UGC, "public.b2b_payment_condition_config_list()")
        check("gestor comercial lê condições de A (sem editar), default 30 dias exposto", j and j["can_edit"] is False and j["default_deadline_days"] == 30
              and len(j["conditions"]) >= 8 and all(c["plan_id"] for c in j["conditions"]) and len(j["categories"]) == 1, e)
        j, e = call(UADMF, "public.b2b_payment_condition_config_list()"); check("lista de F não vê condições de A", j and len(j["conditions"]) == 1, e)
        denied("comprador não lista configurações", call(UB, "public.b2b_payment_condition_config_list()"), "forbidden")
        denied("tabela privada fechada ao cliente", out(as_user(UADM, "SELECT count(*)::text FROM platform_private.b2b_condition_versions;")), "permission denied")
        denied("anônimo sem EXECUTE", out(as_user(None, "SELECT public.b2b_payment_condition_config_list()::text;", "anon")), "permission denied")

        # ---------- opções (comprador) ----------
        j, e = call(UB, f"public.b2b_list_payment_condition_options_secure('{P}','{PLD}')")
        check("opções do comprador P: só versões atribuídas de A; mode legacy antes da ativação",
              j and sorted(o["payment_method"] for o in j["options"]) == ["dinheiro", "pix"] and j["mode"] == "legacy", e or j)
        j, e = call(UB2, f"public.b2b_list_payment_condition_options_secure('{PF}','{PLD}')")
        check("comprador F vê só o Pix de F (2 dias)", j and [(o["payment_method"], o["payment_deadline_days"]) for o in j["options"]] == [("pix", 2)], e or j)
        denied("comprador P pedindo parceiro F negado", call(UB, f"public.b2b_list_payment_condition_options_secure('{PF}','{PLD}')"), "forbidden")
        denied("técnico negado", call(UT, f"public.b2b_list_payment_condition_options_secure('{P}','{PLD}')"), "forbidden_financial_terms")
        denied("comprador inativo negado", call(UINACT, f"public.b2b_list_payment_condition_options_secure('{P}','{PLD}')"), "")
        j, e = call(UB, f"public.b2b_list_payment_condition_options_secure('{P}','{P3B}')")
        check("cartão de crédito publicado mas não atribuído: indisponível ao comprador", j and [o["payment_method"] for o in j["options"]] == ["promissoria"], e or j)
        j, e = call(UADM, f"public.b2b_list_payment_condition_options_secure('{P}','{PLD}')"); check("ator interno de A vê opções do parceiro de A", j and len(j["options"]) == 2, e)
        denied("ator interno de F não vê parceiro de A", call(UADMF, f"public.b2b_list_payment_condition_options_secure('{P}','{PLD}')"), "forbidden_partner")

        # ---------- UMA verdade monetária ----------
        base = date.fromisoformat(psql("SELECT CURRENT_DATE").stdout.strip())
        BOL = ch("boleto", 1, 30)
        j, e = sim(UB, P3, [L(1000)], BOL)
        exp = price(1000, 3, "1.8", 30, base)
        check("exemplo do revisor: 1000 a 1,8% 3x = 345,40/345,40/345,42 (Decimal independente)",
              [str(x[2]) for x in exp] == ["345.40", "345.40", "345.42"] and sum(x[2] for x in exp) == Decimal("1036.22"), exp)
        ok = j and rows_of(j["schedule"]) == exp and Decimal(str(j["final_amount"])) == Decimal("1036.22") \
            and Decimal(str(j["amounts"]["final_amount"])) == Decimal("1036.22") and Decimal(str(j["financial_interest_amount"])) == Decimal("36.22") \
            and Decimal(str(j["net_amount_after_discount"])) == Decimal("1000.00") and j["first_due_date"] == exp[0][1] \
            and Decimal(str(j["credit"]["exposicao_projetada"])) >= Decimal("1036.22") and j["schedule_estimated"] is True and j["due_basis"] == "nf_issue"
        check("simulação: final/amounts/juros/cronograma/crédito = 1036,22; 1º vencimento estimado = hoje+30", ok, e or j and (j["final_amount"], j["schedule"], j.get("credit")))
        sim_hash = j and j["cart_hash"]
        bj, _ = call(UB, f"public.simulate_b2b_payment_plan_secure('{P}','{P3}','{js([L(1000)])}'::jsonb)")
        check("hash com condição ≠ hash LIVE do mesmo carrinho", sim_hash and bj and sim_hash != bj["cart_hash"])
        denied("create com hash LIVE (1000) recusado: price_changed", create(UB, P3, [L(1000)], bj["cart_hash"], "TESTE-H1", BOL), "price_changed")
        denied("prazo adulterado na escolha recusado", sim(UB, P3, [L(1000)], ch("boleto", 1, 1)), "payment_condition_unavailable")
        denied("escolha com campo extra (parcelas do cliente) recusada", sim(UB, P3, [L(1000)], dict(BOL, installment_count=1)), "payment_choice_required")
        j, e = create(UB, P3, [L(1000)], sim_hash, "TESTE-PRICE-1", BOL)
        oid = j and j["id"]
        check("create Price: ACK total/final/juros 1036,22 e mesmo hash", j and Decimal(str(j["total"])) == Decimal("1036.22") and Decimal(str(j["final_amount"])) == Decimal("1036.22")
              and Decimal(str(j["financial_interest_amount"])) == Decimal("36.22") and j["cart_hash"] == sim_hash and j["payment_choice"] == BOL, e or j)
        if oid:
            row = psql(f"""SELECT json_build_object('o',(SELECT json_build_object('total',total,'final',final_amount_with_interest,'int',financial_interest_amount,'terms',payment_terms_id) FROM public.partner_orders WHERE id='{oid}'),
              't',(SELECT json_agg(json_build_object('id',id,'final',final_amount,'int',financial_interest_amount,'n',installment_count,'first',first_due_date,'rate',monthly_interest_percent_snapshot)) FROM public.partner_order_payment_terms WHERE partner_order_id='{oid}'),
              's',(SELECT json_agg(json_build_object('installment_number',installment_number,'due_date',due_date,'amount',amount,'principal_amount',principal_amount,'interest_amount',interest_amount) ORDER BY installment_number) FROM public.partner_order_payment_schedule WHERE partner_order_id='{oid}'),
              'm',(SELECT json_build_object('final',financed_total,'rows',rows,'hash',cart_hash,'terms',payment_terms_id,'est',estimated) FROM platform_private.b2b_order_condition_snapshots WHERE order_id='{oid}'),
              'i',(SELECT result_snapshot->>'final_amount' FROM public.partner_order_idempotency WHERE idempotency_key='TESTE-PRICE-1'))""").stdout.strip()
            d = json.loads(row); D = lambda x: Decimal(str(x))
            check("pedido/termos/cronograma/snapshot/idempotência: todos 1036,22 e as mesmas 3 parcelas estimadas",
                  D(d["o"]["total"]) == D(d["o"]["final"]) == D(d["t"][0]["final"]) == D(d["m"]["final"]) == D(d["i"]) == Decimal("1036.22")
                  and D(d["o"]["int"]) == D(d["t"][0]["int"]) == Decimal("36.22") and len(d["t"]) == 1 and d["t"][0]["n"] == 3 and D(d["t"][0]["rate"]) == Decimal("1.8")
                  and d["o"]["terms"] == d["t"][0]["id"] == d["m"]["terms"] and rows_of(d["s"]) == exp and rows_of(d["m"]["rows"]) == exp
                  and d["t"][0]["first"] == exp[0][1] and d["m"]["hash"] == sim_hash and d["m"]["est"] is True, d)
        j2, e = create(UB, P3, [L(1000)], sim_hash, "TESTE-PRICE-1", BOL)
        check("replay mesma chave+escolha: mesmo pedido e mesmo ACK", j2 and j and j2["id"] == oid and j2["total"] == j["total"], e or j2)
        check("replay não duplica snapshot/termos", psql(f"SELECT (SELECT count(*) FROM platform_private.b2b_order_condition_snapshots WHERE order_id='{oid}')||':'||(SELECT count(*) FROM public.partner_order_payment_terms WHERE partner_order_id='{oid}')").stdout.strip() == "1:1")
        denied("mesma chave com outro meio: conflito", create(UB, P3, [L(1000)], sim_hash, "TESTE-PRICE-1", ch("pix", 1, 5)), "idempotency_conflict")
        PIX = ch("pix", 1, 5); CASH = ch("dinheiro", 1, 0)
        for nm, items, amt in (("líquido", [L(1)], "0.90"), ("embalagem inteira", [S(1)], "162.00"), ("misto", [L(1), S(1)], "162.90")):
            j, e = sim(UB, PLD, items, PIX)
            check(f"Pix {nm} com desconto 10%: R$ {amt} em 1 parcela hoje+5 (estimada)", j and Decimal(str(j["final_amount"])) == Decimal(amt) and len(j["schedule"]) == 1
                  and j["schedule"][0]["due_date"] == (base + timedelta(days=5)).isoformat() and Decimal(str(j["schedule"][0]["amount"])) == Decimal(amt), e or j)
        hm = sim(UB, PLD, [L(1), S(1)], PIX)[0]["cart_hash"]
        j, e = create(UB, PLD, [L(1), S(1)], hm, "TESTE-MIX-1", PIX)
        o_mix = j and j["id"]
        it = psql(f"SELECT string_agg(coalesce(packaging_codigo_snapshot,'L')||':'||quantidade::text||':'||preco_unitario_final_snapshot::text, ',' ORDER BY packaging_codigo_snapshot NULLS FIRST) FROM public.partner_order_items WHERE order_id='{o_mix}'").stdout.strip() if o_mix else ""
        check("pedido misto: snapshots de embalagem inteira + líquido preservados", j and Decimal(str(j["total"])) == Decimal("162.90") and it.startswith("L:1") and "SC25:1" in it, e or it)
        denied("preço client-side ignorado: hash não confere", create(UB, PLD, [dict(L(1), preco_unitario=0.01)], "x" * 64, "TESTE-CLI", PIX), "price_changed")
        denied("vencimento/parcelas do cliente não existem no contrato", out(as_user(UB, f"SELECT public.create_partner_order_condition_secure('{P}',NULL,'[]'::jsonb,NULL,'{PLD}','x','k',NULL,3)::text;")), "does not exist")
        j, e = sim(UB, PLQ, [L(1)], PIX); hq = j and j["cart_hash"]
        j, e = create(UB, PLQ, [L(1)], hq, "TESTE-COT-1", PIX); oq = j and j["id"]
        st = psql(f"SELECT status||':'||(SELECT count(*) FROM public.partner_order_payment_terms WHERE partner_order_id='{oq}')||':'||(SELECT quote::text||':'||coalesce(financed_total::text,'null') FROM platform_private.b2b_order_condition_snapshots WHERE order_id='{oq}') FROM public.partner_orders WHERE id='{oq}'").stdout.strip() if oq else ""
        check("cotação: aguardando_cotacao, sem termos, snapshot de escolha sem valor", st == "aguardando_cotacao:0:true:null", e or st)
        psql(f"INSERT INTO public.partner_financial_settings(id,partner_id,credit_limit,credit_limit_action,block_if_overdue,overdue_tolerance_days) VALUES (gen_random_uuid(),'{P}',2050,'block',false,0) ON CONFLICT (partner_id) DO UPDATE SET credit_limit=2050, credit_limit_action='block'")
        expo = json.loads(psql(f"SELECT public.fn_b2b_credit_exposure('{P}',0,NULL)::text").stdout.strip())
        room = Decimal(str(expo["credit_limit"])) - Decimal(str(expo["exposicao_projetada"]))
        psql(f"UPDATE public.partner_financial_settings SET credit_limit = {Decimal(str(expo['credit_limit'])) - room + (Decimal('1000') + Decimal('1036.22')) / 2} WHERE partner_id='{P}'")
        j, e = sim(UB, P3, [L(1000)], BOL); hp = j and j["cart_hash"]
        check("crédito: simulação avisa excesso com o total Price (não o líquido)", j and "Pedido excede o limite de crédito projetado" in j["warnings"], e or j and j["warnings"])
        denied("crédito real: create bloqueado pelo total Price", create(UB, P3, [L(1000)], hp, "TESTE-CRED-1", BOL), "credit_limit_exceeded")
        psql(f"DELETE FROM public.partner_financial_settings WHERE partner_id='{P}'")

        # ---------- negativas / stale ----------
        denied("sem escolha: payment_choice_required (sem fallback Pix)", sim(UB, PLD, [L(1)], None), "payment_choice_required")
        denied("create sem escolha: payment_choice_required", create(UB, PLD, [L(1)], "x", "TESTE-NULL", None), "payment_choice_required")
        denied("versão inexistente sem oráculo", sim(UB, PLD, [L(1)], ch("pix", 9, 5)), "payment_condition_unavailable")
        denied("versão de F pelo comprador de A", sim(UB, PLD, [L(1)], ch("pix", 1, 2)), "payment_condition_unavailable")
        denied("meio de outra condição", sim(UB, PLD, [L(1)], BOL), "payment_condition_unavailable")
        denied("promissória sem atribuição em PLD indisponível", sim(UB, PLD, [L(1)], ch("promissoria", 1, 30)), "payment_condition_unavailable")
        denied("técnico não simula", sim(UT, PLD, [L(1)], PIX), "forbidden_financial_terms")
        denied("anônimo sem EXECUTE no create", out(as_user(None, f"SELECT {create_sql(P, PLD, [L(1)], 'x', 'k', PIX)}::text;", "anon")), "permission denied")
        j, e = publish(UADM, PLD, "pix", M_PIX, 7, 1, 0, 1); check("Pix v2 com CAS; atribuições copiadas", j and j["condition"]["version"] == 2, e)
        denied("simulação versão antiga: stale", sim(UB, PLD, [L(1)], PIX), "payment_condition_stale")
        denied("create versão antiga: stale", create(UB, PLD, [L(1), S(1)], hm, "TESTE-STALE", PIX), "payment_condition_stale")
        PIX2 = ch("pix", 2, 7)
        j, e = sim(UB, PLD, [L(1)], PIX2); check("Pix v2 disponível ao mesmo parceiro (7 dias)", j and j["schedule"][0]["due_date"] == (base + timedelta(days=7)).isoformat(), e)
        check("snapshot histórico preserva v1/5 dias", psql(f"SELECT (choice->>'payment_condition_version')||':'||(condition->>'deadline_days') FROM platform_private.b2b_order_condition_snapshots WHERE order_id='{o_mix}'").stdout.strip() == "1:5")
        r = psql(f"UPDATE platform_private.b2b_order_condition_snapshots SET rows='[]' WHERE order_id='{o_mix}'", check=False)
        check("snapshot imutável", r.returncode != 0 and "IMMUTABLE" in r.stderr)
        check("versões append-only", psql("DELETE FROM platform_private.b2b_condition_versions", check=False).returncode != 0)

        # ---------- duas sessões: revogação durante espera ----------
        hp2 = sim(UB, PLD, [L(1)], PIX2)[0]["cart_hash"]
        res = parallel([session(UADM, f"BEGIN; SELECT public.b2b_payment_condition_assign('{P}','{PLD}','pix',2,false); SELECT pg_sleep(1.2); COMMIT;"),
                        session(UB, f"SELECT {create_sql(P, PLD, [L(1)], hp2, 'TESTE-W1', PIX2)};")], [0, 0.4])
        check("duas sessões: atribuição revogada durante a espera -> create espera a trava e nega", res[0].returncode == 0 and res[1].returncode != 0
              and "payment_condition_unavailable" in res[1].stderr and idem("TESTE-W1") == "0", (res[0].stderr[-150:], res[1].stderr[-200:]))
        hc = sim(UB, PLD, [L(1)], CASH)[0]["cart_hash"]
        res = parallel([session(UADM, f"BEGIN; SELECT public.b2b_payment_condition_retire('{PLD}','dinheiro',1); SELECT pg_sleep(1.2); COMMIT;"),
                        session(UB, f"SELECT {create_sql(P, PLD, [L(1)], hc, 'TESTE-W2', CASH)};")], [0, 0.4])
        check("duas sessões: versão aposentada durante a espera -> negada", res[1].returncode != 0 and "payment_condition_unavailable" in res[1].stderr and idem("TESTE-W2") == "0", res[1].stderr[-200:])
        j, e = publish(UADM, PLD, "dinheiro", M_CASH, 0, 1, 0, 1); CASH2 = ch("dinheiro", 2, 0)
        check("dinheiro v2 publicada após aposentar a v1 (nova versão explícita)", j and j["condition"]["version"] == 2, e)
        assign(UADM, P, PLD, "dinheiro", 2)
        hc = sim(UB, PLD, [L(1)], CASH2)[0]["cart_hash"]
        res = parallel([f"BEGIN; UPDATE public.commercial_payment_plan_assignments SET status='revoked' WHERE plan_id='{PLD}' AND partner_id='{P}'; SELECT pg_sleep(1.2); COMMIT;",
                        session(UB, f"SELECT {create_sql(P, PLD, [L(1)], hc, 'TESTE-W3', CASH2)};")], [0, 0.4])
        check("duas sessões: atribuição comercial LIVE revogada durante a espera -> indisponível", res[1].returncode != 0 and "payment_condition_unavailable" in res[1].stderr, res[1].stderr[-200:])
        psql(f"UPDATE public.commercial_payment_plan_assignments SET status='published' WHERE plan_id='{PLD}' AND partner_id='{P}'")
        res = parallel([f"BEGIN; UPDATE public.payment_methods SET active=false WHERE id='{M_CASH}'; SELECT pg_sleep(1.2); COMMIT;",
                        session(UB, f"SELECT {create_sql(P, PLD, [L(1)], hc, 'TESTE-W4', CASH2)};")], [0, 0.4])
        check("duas sessões: meio desativado no catálogo durante a espera -> indisponível", res[1].returncode != 0 and "payment_condition_unavailable" in res[1].stderr, res[1].stderr[-200:])
        psql(f"UPDATE public.payment_methods SET active=true WHERE id='{M_CASH}'")
        res = parallel([f"BEGIN; UPDATE public.financial_categories SET active=false WHERE id='{CAT}'; SELECT pg_sleep(1.2); COMMIT;",
                        session(UB, f"SELECT {create_sql(P, PLD, [L(1)], hc, 'TESTE-W5', CASH2)};")], [0, 0.4])
        check("duas sessões: categoria RECEITA desativada durante a espera -> indisponível", res[1].returncode != 0 and "payment_condition_unavailable" in res[1].stderr, res[1].stderr[-200:])
        psql(f"UPDATE public.financial_categories SET active=true WHERE id='{CAT}'")
        res = parallel([f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('b2b_credit:{P}',0)); SELECT pg_sleep(1.2); COMMIT;",
                        session(UB, f"SELECT {create_sql(P, PLD, [L(1)], hc, 'TESTE-W6', CASH2)};"),
                        f"DELETE FROM public.user_roles WHERE user_id='{UB}' AND role='parceiro_b2b';"], [0, 0.3, 0.7])
        check("duas sessões: papel do comprador revogado durante a espera de crédito -> negado na revalidação final",
              res[1].returncode != 0 and idem("TESTE-W6") == "0", res[1].stderr[-200:])
        psql(f"INSERT INTO public.user_roles VALUES ('{UB}','parceiro_b2b')")
        res = parallel([session(UADM, f"BEGIN; SELECT public.b2b_payment_condition_publish('{P3B}','cartao_debito','{M_DEB}','{CAT}',2,1,0,1); SELECT pg_sleep(1.2); COMMIT;"),
                        session(UFIN, f"SELECT public.b2b_payment_condition_publish('{P3B}','cartao_debito','{M_DEB}','{CAT}',3,1,0,2);"),
                        f"DELETE FROM public.user_roles WHERE user_id='{UFIN}' AND role='financeiro';"], [0, 0.3, 0.7])
        check("publish: papel revogado durante a espera do advisory -> forbidden (reautoriza após lock)", res[0].returncode == 0 and res[1].returncode != 0 and "forbidden" in res[1].stderr, res[1].stderr[-200:])
        psql(f"INSERT INTO public.user_roles VALUES ('{UFIN}','financeiro')")
        res = parallel([session(UADM, f"SELECT public.b2b_payment_condition_publish('{PNA}','pix','{M_PIX}','{CAT}',5,1,0,0);"),
                        session(UFIN, f"SELECT public.b2b_payment_condition_publish('{PNA}','pix','{M_PIX}','{CAT}',6,1,0,0);")], [0, 0])
        check("publish concorrente com o mesmo CAS: exatamente um vence", sorted(x.returncode == 0 for x in res) == [False, True]
              and psql(f"SELECT count(*) FROM platform_private.b2b_condition_versions WHERE plan_id='{PNA}'").stdout.strip() == "1", [x.stderr[-120:] for x in res])
        sql_par = session(UB, f"BEGIN; SELECT {create_sql(P, PLD, [S(1)], sim(UB, PLD, [S(1)], CASH2)[0]['cart_hash'], 'TESTE-PAR', CASH2)}; SELECT pg_sleep(0.5); COMMIT;")
        res = parallel([sql_par, sql_par], [0, 0.1])
        check("mesma chave em paralelo: um pedido", all(x.returncode == 0 for x in res) and idem("TESTE-PAR") == "1", [x.stderr[-150:] for x in res])

        # ---------- ativação por empresa ----------
        denied("financeiro não ativa", activation(UFIN, "pilot", [P], 0), "forbidden")
        denied("piloto com parceiro de outro tenant recusado", activation(UADM, "pilot", [PF], 0), "payment_condition_pilot_partner_invalid")
        denied("piloto sem condição atribuída ao parceiro recusado", activation(UADM, "pilot", [PO], 0), "payment_condition_activation_requires_config")
        j, e = activation(UADM, "pilot", [P], 0); check("admin A ativa piloto só para o parceiro P", j and j["activation"]["mode"] == "pilot" and j["activation"]["version"] == 1, e)
        denied("ativação com CAS antigo recusada", activation(UADM, "enforced", [], 0), "payment_condition_activation_stale")
        j, e = call(UB, f"public.b2b_list_payment_condition_options_secure('{P}','{PLD}')"); check("piloto: comprador P vê mode required", j and j["mode"] == "required", e)
        r = legacy(UB, PLD, [L(1)], "TESTE-LEG-1")
        check("piloto: contrato antigo do comprador P bloqueado (B2B_PAYMENT_CONDITION_REQUIRED, nada gravado)", r.returncode != 0 and "B2B_PAYMENT_CONDITION_REQUIRED" in r.stderr and idem("TESTE-LEG-1") == "0", r.stderr[-200:])
        r = legacy(SP.UADM, PLD, [L(1)], "TESTE-LEG-INT"); e_leg = (r.stderr or "").strip().splitlines()[0] if r.returncode else ""
        hi = sim(SP.UADM, PLD, [L(1)], CASH2)
        j, e = create(SP.UADM, PLD, [L(1)], hi[0]["cart_hash"] if hi[0] else "x", "TESTE-INT-1", CASH2)
        check("piloto: ator interno de A simula com condição (mesma verdade monetária)", hi[0] and Decimal(str(hi[0]["final_amount"])) == Decimal("0.90"), hi[1])
        check("ator interno: barreira LIVE de origem interna preservada nos dois caminhos", r.returncode != 0 and j is None
              and "B2B_INTERNAL_ISSUER_AMBIGUOUS" in e_leg and "B2B_INTERNAL_ISSUER_AMBIGUOUS" in (e or ""), (e_leg, e))
        r = legacy(UB2, PLD, [SF(1)], "TESTE-LEG-F1", partner=PF); check("piloto de A não afeta comprador de F (papel FSF)", r.returncode == 0, r.stderr[-200:])
        r = psql("BEGIN; ALTER TABLE platform_private.b2b_order_condition_snapshots DISABLE TRIGGER immutable_update_delete;\n"
                 + session(UB, f"SELECT {create_sql(P, PLD, [S(2)], sim(UB, PLD, [S(2)], CASH2)[0]['cart_hash'], 'TESTE-DEF2', CASH2)};\nRESET ROLE;\n")
                 + "DELETE FROM platform_private.b2b_order_condition_snapshots s USING public.partner_order_idempotency i WHERE i.idempotency_key='TESTE-DEF2' AND s.order_id=i.order_id;\nCOMMIT;", check=False)
        check("gatilho DEFERRED isolado: pedido sem snapshot falha no COMMIT", r.returncode != 0 and "B2B_PAYMENT_CONDITION_REQUIRED" in r.stderr and idem("TESTE-DEF2") == "0", r.stderr[-200:])
        j, e = call(UB, f"public.get_partner_order_payment_condition_secure('{oid}')")
        check("comprador lê condição/parcelas do pedido (mesmo total, estimado)", j and j["present"] and Decimal(str(j["payment_condition"]["financed_total"])) == Decimal("1036.22")
              and j["payment_condition"]["estimated"] is True, e or j)
        denied("admin F não lê pedido de A", call(UADMF, f"public.get_partner_order_payment_condition_secure('{oid}')"), "forbidden")
        check("PB-001036/teste4 fora do escopo: nenhum pedido real no PG descartável", psql("SELECT count(*) FROM public.partner_orders WHERE numero='PB-001036'").stdout.strip() == "0")

        # ---------- rollback deny-only transacional ----------
        files = write(fm["install"])
        bad_rb = files["04-rollback-deny.sql.review"].replace(fm["install"]["read"], "0" * 32, 1)
        (work / "bad-rb.sql").write_text(bad_rb); (work / "bad-rb.sql").chmod(0o644)
        r = runf(work / "bad-rb.sql")
        check("04 com pin divergente aborta sem mudar nada", r.returncode != 0 and md5_of(g["PUB"]["read"]) == fm["install"]["read"], r.stderr[-200:])
        r = runf(work / "04-rollback-deny.sql.review"); check("04 rollback deny-only", r.returncode == 0, r.stderr[-300:])
        denied("após rollback: opções negadas", call(UB, f"public.b2b_list_payment_condition_options_secure('{P}','{PLD}')"), "permission denied")
        r = legacy(UB, PLD, [L(1)], "TESTE-LEG-2")
        check("após rollback: empresa ativada continua bloqueada (nunca reabre fallback)", r.returncode != 0 and "B2B_PAYMENT_CONDITION_REQUIRED" in r.stderr)
        r = legacy(UB2, PLD, [SF(1)], "TESTE-LEG-F2", partner=PF); check("após rollback: empresa não ativada segue contrato atual", r.returncode == 0, r.stderr[-200:])
        check("após rollback: snapshots/versões preservados", int(psql("SELECT count(*) FROM platform_private.b2b_order_condition_snapshots").stdout.strip()) >= 3
              and int(psql("SELECT count(*) FROM platform_private.b2b_condition_versions").stdout.strip()) >= 10)
        fm["deny"] = {k: md5_of(s) for k, s in g["PUB"].items()}
        fm["deny"]["quote"] = md5_of(g["QUOTE_SIG"])
        (HERE / "fn-md5.json").write_text(json.dumps(fm, indent=2) + "\n")
    except Exception:
        for c in CHECKS:
            if not c["ok"]: print("FAIL", c["name"], c.get("detail", ""))
        raise
    finally:
        subprocess.run(SP.su() + ["pg_ctl", "-D", str(tmp / "d"), "-m", "fast", "stop"], capture_output=True)
    passed = sum(1 for c in CHECKS if c["ok"])
    (HERE / "evidence-local-pg.json").write_text(json.dumps({"contract": "B2B_PAYMENT_CONDITION_V1", "rebase_of": "financial-price-generator-20261029/integration (sha256 b1416978)",
        "kind": "DISPOSABLE_PG_REAL_CREATE_c34e7404_WITH_DECLARED_SEAMS_NOT_HOSTED_PROOF", "passed": passed, "total": len(CHECKS), "checks": CHECKS},
        indent=2, ensure_ascii=False) + "\n")
    print(f"{passed}/{len(CHECKS)}")
    for c in CHECKS:
        if not c["ok"]: print("FAIL", c["name"], c.get("detail", ""))
    return 0 if passed == len(CHECKS) else 1


if __name__ == "__main__":
    sys.exit(main())
