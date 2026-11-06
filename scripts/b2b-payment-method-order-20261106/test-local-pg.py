#!/usr/bin/env python3
"""PG DESCARTÁVEL — B2B_PAYMENT_METHOD_V1 rev. 2. Sem rede, sem banco hospedado, sem sessão real.

Base = harness do pacote b2b-solid-packaging-order-20261106 em modo de GATILHOS REAIS (B2BPACK_REAL_TRIGGERS=1) e com o
02 do B2 aplicado: o create resultante é o CORPO REAL c34e7404 (md5 conferido), com os gatilhos reais de partner_orders/
itens/condição. Resolvedores REAIS de crédito/juros/plano (213ac31f/806e5d87/4cb833a3), h15 REAL (64e10608), leitor do
parceiro REAL (bd985484), carrinho/hash REAIS. O pacote gera os RPCs com meio a partir desses corpos por deltas exatos.

COSTURAS DECLARADAS (não são prova): as do harness B2 (auth.uid por GUC, has_role/get_user_partner_id/b2b_actor_scope,
c2_* mínimos, entitlements, tabelas de 2º nível sem gatilhos); payment_methods mínima; get_partner_order_payment_terms_secure = portas mínimas (comprador do parceiro ou admin do vendedor). Os pins de
colunas/leitor de condição são trocados SÓ na cópia temporária. Nunca prova JWT/RLS/PostgREST hospedado.
Dados 100% fictícios (TESTE): vendedor A (papel AR Bio) e F (outro tenant).
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
SP.PORT = "55461"

u = SP.u
A, F, P, PO, PF = SP.A, SP.F, SP.P, SP.PO, SP.PF
UB, UT, UB2, UADM, UADMF, UINACT = SP.UB, SP.UT, SP.UB2, SP.UADM, SP.UADMF, SP.UINACT
UFIN, UGC = u(29), u(30)
PLD, PLQ = SP.PLD, SP.PLQ
P3, PINT, PNA, P3B = u(81), u(82), u(83), u(84)
M_PIX, M_BOL, M_CASH, M_OFF, M_PROM, M_DEB = u(91), u(92), u(93), u(94), u(95), u(96)
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


def js(x):
    return json.dumps(x).replace("'", "''")


def q(x):
    return "NULL" if x is None else f"'{x}'"


def save(uid, cid, plan, kind, pm, due, mx, rate, status, ver):
    return call(uid, f"public.b2b_payment_method_config_save({q(cid)}::uuid,'{plan}','{kind}','{pm}',{due},{mx},{q(rate)}::numeric,'{status}',{ver})")


def activation(uid, mode, partners, ver):
    arr = "ARRAY[" + ",".join(f"'{p}'::uuid" for p in partners) + "]::uuid[]" if partners else "'{}'::uuid[]"
    return call(uid, f"public.b2b_payment_method_activation_set('{mode}',{arr},{ver})")


def sim(uid, plan, items, cid, ver, partner=P):
    return call(uid, f"public.simulate_b2b_payment_plan_with_method_secure('{partner}','{plan}','{js(items)}'::jsonb,{q(cid)}::uuid,{'NULL' if ver is None else ver})")


def create_sql(partner, plan, items, h, key, cid, ver):
    return f"public.create_partner_order_with_method_secure('{partner}',NULL,'{js(items)}'::jsonb,NULL,'{plan}','{h}','{key}',{q(cid)}::uuid,{'NULL' if ver is None else ver})"


def create(uid, plan, items, h, key, cid, ver, partner=P):
    return call(uid, create_sql(partner, plan, items, h, key, cid, ver))


def legacy(uid, plan, items, key, partner=P):
    s, _ = call(uid, f"public.simulate_b2b_payment_plan_secure('{partner}','{plan}','{js(items)}'::jsonb)")
    h = s["cart_hash"] if s else "x"
    return as_user(uid, f"SELECT public.create_partner_order_secure('{partner}',NULL,'{js(items)}'::jsonb,NULL,'{plan}',NULL,NULL,'{h}','{key}')::text;")


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


def rows_of(sched, key="estimated_due_date"):
    return [(r["installment_number"], r[key], Decimal(str(r["amount"])), Decimal(str(r["principal_amount"])), Decimal(str(r["interest_amount"]))) for r in sched]


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


SEAMS = f"""
CREATE TABLE public.payment_methods(id uuid PRIMARY KEY, name text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE FUNCTION public.get_partner_order_payment_terms_secure(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM partner_orders o JOIN partner_accounts pa ON pa.id = o.partner_id WHERE o.id = p_order_id AND (
      EXISTS (SELECT 1 FROM partner_users pu WHERE pu.partner_id = o.partner_id AND pu.user_id = auth.uid())
      OR (has_role(auth.uid(),'administrador') AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.organization_id = pa.commercial_owner_organization_id)))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN '{{}}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.get_partner_order_payment_terms_secure(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_partner_order_payment_terms_secure(uuid) TO authenticated;
INSERT INTO public.profiles VALUES ('{UFIN}','{A}',true),('{UGC}','{A}',true);
INSERT INTO public.user_roles VALUES ('{UFIN}','financeiro'),('{UGC}','gestor_comercial');
INSERT INTO platform_private.seam_entitlements VALUES ('{UFIN}','pedidos_b2b'),('{UGC}','pedidos_b2b'),('{UFIN}','catalogo_precos'),('{UGC}','catalogo_precos');
INSERT INTO public.payment_methods VALUES ('{M_PIX}','Pix TESTE',true),('{M_BOL}','Boleto TESTE',true),('{M_CASH}','Dinheiro TESTE',true),
  ('{M_OFF}','Inativo TESTE',false),('{M_PROM}','Promissória TESTE',true),('{M_DEB}','Débito TESTE',true);
INSERT INTO public.commercial_payment_plans(id,active,pricing_mode,discount_percent,monthly_interest_percent,months_count,interest_type,installment_count,
  max_days,minimum_order_amount,requires_financial_approval,requires_guarantee,requires_credit_approval,name,code) VALUES
  ('{P3}',true,'discount_from_base',0,0,1,'simple',3,90,NULL,false,false,false,'TESTE 3x','T3'),
  ('{P3B}',true,'discount_from_base',0,0,1,'simple',3,90,NULL,false,false,false,'TESTE 3x B','T3B'),
  ('{PINT}',true,'discount_from_base',0,2,3,'compound',3,90,NULL,false,false,false,'TESTE juros 3x','TJ'),
  ('{PNA}',true,'discount_from_base',0,0,1,'simple',1,30,NULL,false,false,false,'TESTE não publicado','TN');
INSERT INTO public.commercial_payment_plan_assignments VALUES
  ('published','{PLD}','partner','{P}',NULL,CURRENT_DATE-1,NULL),('published','{PLD}','partner','{PF}',NULL,CURRENT_DATE-1,NULL),
  ('published','{PLQ}','partner','{P}',NULL,CURRENT_DATE-1,NULL),('published','{P3}','partner','{P}',NULL,CURRENT_DATE-1,NULL),
  ('published','{P3B}','partner','{P}',NULL,CURRENT_DATE-1,NULL),('published','{PINT}','partner','{P}',NULL,CURRENT_DATE-1,NULL),
  ('draft','{PNA}','partner','{P}',NULL,CURRENT_DATE-1,NULL);
"""


def boot():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="b2bpm-", dir="/tmp")); tmp.chmod(0o777); SP.SOCK[0] = str(tmp)
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
    psql("""REVOKE ALL ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text), public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date),
             public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date), public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric), platform_private.b2b_partner_catalog_reader(uuid) FROM PUBLIC;
            GRANT EXECUTE ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text), public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date) TO authenticated, service_role;
            GRANT EXECUTE ON FUNCTION public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date), public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric) TO service_role;""")
    psql(SP.FIXTURES); psql(SP.RT.fixtures_sql([UB, UT, UB2, SP.UADM, SP.UADMF, SP.UINACT, SP.UCONS, SP.USUP]))
    for f in ("01-pre.sql.readonly", "02-install.sql.review", "03-post.sql.readonly"):  # estado INSTALADO do B2 (produção)
        r = SP.runfile(SPD / f); check(f"estado instalado B2: {f}", r.returncode == 0, r.stderr[-300:])
    # Resolvedores REAIS de crédito/juros/plano (mesmo bloco do real_extras do B2).
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


def main():
    tmp = boot(); work = pathlib.Path(tempfile.mkdtemp(prefix="b2bpm-w-")); work.chmod(0o777)
    fm = {}
    try:
        real = {k: v for k, v in g["LIVE_PINS"].items() if "payment_terms_secure" not in k}
        full = {}
        for sig, md in real.items():
            loc = md5_of(sig); full[sig] = loc
            check(f"corpo REAL = LIVE: {sig}", loc.startswith(md), f"{loc} != {md}")
        pins = dict(g["LIVE_PINS"]); pins.update(full)
        seam_sig = next(k for k in pins if "payment_terms_secure" in k); pins[seam_sig] = md5_of(seam_sig)  # costura declarada
        cols = {t: psql(f"SELECT md5(string_agg(column_name||':'||data_type, ',' ORDER BY ordinal_position)) FROM information_schema.columns WHERE table_schema='public' AND table_name='{t}'").stdout.strip()
                for t in g["LIVE_COLS"]}  # costura declarada (esquema mínimo)
        fm["full_live_pins"] = {k: v for k, v in full.items() if k == "public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric)"}

        def write(fmd=None, dmd=None, p=pins):
            files = g["build"](pins=p, cols=cols, fn_md5=fmd, deny_md5=dmd)
            for n, t in files.items(): (work / n).write_text(t); (work / n).chmod(0o644)
            return files

        # ---------- install falho é transacional ----------
        bad = dict(pins); bad["public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)"] = "0" * 32
        (work / "bad-install.sql").write_text(g["build"](pins=bad, cols=cols)["02-install.sql.review"]); (work / "bad-install.sql").chmod(0o644)
        r = runf(work / "bad-install.sql")
        left = psql("SELECT count(*) FROM pg_class WHERE relname LIKE 'b2b_payment_method%'").stdout.strip()
        check("02 com corpo LIVE divergente aborta sem deixar objetos", r.returncode != 0 and "divergente" in r.stderr and left == "0", (r.stderr[-200:], left))
        write()
        r = runf(work / "01-pre.sql.readonly"); check("01 PRE_OK", r.returncode == 0 and "PRE_OK" in r.stderr, r.stderr[-300:])
        r = runf(work / "02-install.sql.review"); check("02 install", r.returncode == 0, r.stderr[-600:])
        fm["install"] = {k: md5_of(s) for k, s in g["PUB"].items()}
        write(fm["install"])
        r = runf(work / "03-post.sql.readonly"); check("03 POST_OK", r.returncode == 0 and "POST_OK" in r.stderr, r.stderr[-300:])
        r = runf(work / "02-install.sql.review"); check("rerun do install recusado", r.returncode != 0)
        check("corpos LIVE originais intactos após install", md5_of("public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)") == g["LIVE_PINS"]["public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)"]
              and md5_of("public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)") == g["LIVE_PINS"]["public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)"])

        # ---------- sem ativação: contrato atual para todos ----------
        r = legacy(UB, PLD, [L(1)], "TESTE-LEG-0")
        check("sem ativação: comprador segue contrato atual (nenhum bloqueio global)", r.returncode == 0, r.stderr[-200:])
        r = legacy(UB2, PLD, [L(1)], "TESTE-LEG-F0", partner=PF)
        check("sem ativação: outro tenant segue contrato atual", r.returncode == 0, r.stderr[-200:])

        # ---------- configuração ----------
        j, e = save(UADM, None, PLD, "pix", M_PIX, 5, 1, None, "active", 0); check("admin A cria Pix v1", j and j["config"]["version"] == 1, e)
        pix = j and j["config"]["id"]
        j, e = save(UFIN, None, P3, "boleto", M_BOL, 30, 3, "1.8", "active", 0); check("financeiro A cria boleto 3x Price 1,8%", j and j["config"]["version"] == 1, e)
        bol = j and j["config"]["id"]
        j, e = save(UADM, None, PLD, "dinheiro", M_CASH, 0, 1, None, "active", 0); cash = j and j["config"]["id"]
        j, e = save(UADM, None, PLQ, "pix", M_PIX, 5, 1, None, "active", 0); pixq = j and j["config"]["id"]
        j, e = save(UADM, None, P3, "pix", M_PIX, 5, 1, None, "active", 0); pix3 = j and j["config"]["id"]
        j, e = save(UADM, None, PINT, "boleto", M_BOL, 30, 3, "1", "active", 0); bolint = j and j["config"]["id"]
        j, e = save(UADM, None, P3B, "promissoria", M_PROM, 30, 3, "0", "active", 0)
        check("promissória personalizável: 3x com taxa explícita 0 aceita", j and j["config"]["method_kind"] == "promissoria", e); prom = j and j["config"]["id"]
        denied("promissória 3x sem taxa explícita recusada", save(UADM, None, P3, "promissoria", M_PROM, 30, 3, None, "active", 0), "b2b_pmc_price_rate_explicit")
        denied("crédito 37x recusado", save(UADM, None, P3, "credito", M_PROM, 30, 37, "1", "active", 0), "max_installments")
        denied("Pix parcelado recusado", save(UADM, None, PINT, "pix", M_PIX, 5, 2, "1", "active", 0), "b2b_pmc_single_payment")
        denied("boleto 4x recusado", save(UADM, None, PNA, "boleto", M_BOL, 5, 4, "1", "active", 0), "b2b_pmc_boleto_max3")
        denied("meio inativo no catálogo recusado", save(UADM, None, PNA, "debito", M_OFF, 5, 1, None, "active", 0), "payment_method_catalog_unavailable")
        denied("criação duplicada = stale", save(UADM, None, PLD, "pix", M_PIX, 5, 1, None, "active", 0), "payment_method_config_stale")
        for nm, uid in (("comprador", UB), ("técnico", UT), ("gestor comercial (só leitura)", UGC), ("superadmin", SP.USUP)):
            denied(f"{nm} não configura", save(uid, None, PNA, "pix", M_PIX, 5, 1, None, "active", 0), "forbidden")
        denied("admin F não edita config de A", save(UADMF, pix, PLD, "pix", M_PIX, 9, 1, None, "active", 1), "forbidden")
        j, e = save(UADMF, None, PLD, "pix", M_PIX, 2, 1, None, "active", 0); pixF = j and j["config"]["id"]
        j, e = call(UGC, "public.b2b_payment_method_config_list()")
        check("gestor comercial lê configs de A (sem editar)", j and j["can_edit"] is False and all(c["organization_id"] == A for c in j["configs"]) and len(j["configs"]) >= 6, e)
        j, e = call(UADMF, "public.b2b_payment_method_config_list()"); check("lista de F só vê F", j and {c["organization_id"] for c in j["configs"]} == {F}, e)
        denied("comprador não lista configs", call(UB, "public.b2b_payment_method_config_list()"), "forbidden")
        denied("tabela fechada ao cliente", out(as_user(UADM, "SELECT count(*)::text FROM public.b2b_payment_method_configs;")), "permission denied")
        denied("anônimo sem EXECUTE", out(as_user(None, "SELECT public.b2b_payment_method_config_list()::text;", "anon")), "permission denied")

        # ---------- opções ----------
        j, e = call(UB, f"public.b2b_list_payment_method_options_secure('{P}','{PLD}')")
        check("opções do comprador P: só meios ativos de A; mode legacy antes da ativação",
              j and sorted(o["method_kind"] for o in j["options"]) == ["dinheiro", "pix"] and j["mode"] == "legacy", e or j)
        j, e = call(UB2, f"public.b2b_list_payment_method_options_secure('{PF}','{PLD}')")
        check("comprador F vê só o Pix de F", j and [o["config_id"] for o in j["options"]] == [pixF], e or j)
        denied("comprador P pedindo parceiro F negado", call(UB, f"public.b2b_list_payment_method_options_secure('{PF}','{PLD}')"), "forbidden")
        denied("técnico negado", call(UT, f"public.b2b_list_payment_method_options_secure('{P}','{PLD}')"), "forbidden_financial_terms")
        denied("comprador inativo negado", call(UINACT, f"public.b2b_list_payment_method_options_secure('{P}','{PLD}')"), "")
        j, e = call(UB, f"public.b2b_list_payment_method_options_secure('{P}','{PNA}')"); check("condição não publicada: nenhuma opção", j and j["options"] == [], e or j)
        j, e = call(UB, f"public.b2b_list_payment_method_options_secure('{P}','{P3}')"); o3 = {o["method_kind"]: o for o in (j or {}).get("options", [])}
        check("plano 3x: boleto disponível, Pix indisponível", o3.get("boleto", {}).get("available") is True and o3.get("pix", {}).get("reason") == "payment_method_installments_incompatible", e or o3)
        j, e = call(UB, f"public.b2b_list_payment_method_options_secure('{P}','{PINT}')")
        check("plano com juros próprios: Price indisponível", j and j["options"][0]["reason"] == "payment_method_price_interest_conflict", e or j)
        j, e = call(UADM, f"public.b2b_list_payment_method_options_secure('{P}','{PLD}')"); check("ator interno de A vê opções do parceiro de A", j and len(j["options"]) == 2, e)
        denied("ator interno de F não vê parceiro de A", call(UADMF, f"public.b2b_list_payment_method_options_secure('{P}','{PLD}')"), "forbidden_partner")

        # ---------- UMA verdade monetária ----------
        base = date.fromisoformat(psql("SELECT CURRENT_DATE").stdout.strip())
        j, e = sim(UB, P3, [L(1000)], bol, 1)
        exp = price(1000, 3, "1.8", 30, base)
        check("exemplo do revisor: 1000 a 1,8% 3x = 345,40/345,40/345,42 (Decimal independente)",
              [str(x[2]) for x in exp] == ["345.40", "345.40", "345.42"] and sum(x[2] for x in exp) == Decimal("1036.22"), exp)
        ok = j and rows_of(j["schedule"]) == exp and Decimal(str(j["final_amount"])) == Decimal("1036.22") \
            and Decimal(str(j["amounts"]["final_amount"])) == Decimal("1036.22") and Decimal(str(j["financial_interest_amount"])) == Decimal("36.22") \
            and Decimal(str(j["net_amount_after_discount"])) == Decimal("1000.00") and j["first_due_date"] == exp[0][1] \
            and Decimal(str(j["credit"]["exposicao_projetada"])) >= Decimal("1036.22") and j["schedule_estimated"] is True
        check("simulação: final/amounts/juros/cronograma/crédito = 1036,22 (uma verdade)", ok, e or j and (j["final_amount"], j["schedule"], j.get("credit")))
        sim_hash = j and j["cart_hash"]
        bj, _ = call(UB, f"public.simulate_b2b_payment_plan_secure('{P}','{P3}','{js([L(1000)])}'::jsonb)")
        check("hash com meio ≠ hash LIVE do mesmo carrinho (inclui condição/meio/versão/total)", sim_hash and bj and sim_hash != bj["cart_hash"])
        denied("create com hash LIVE (1000) recusado: price_changed", create(UB, P3, [L(1000)], bj["cart_hash"], "TESTE-H1", bol, 1), "price_changed")
        j, e = create(UB, P3, [L(1000)], sim_hash, "TESTE-PRICE-1", bol, 1)
        oid = j and j["id"]
        check("create Price: ACK total/final/juros 1036,22 e mesmo hash", j and Decimal(str(j["total"])) == Decimal("1036.22") and Decimal(str(j["final_amount"])) == Decimal("1036.22")
              and Decimal(str(j["financial_interest_amount"])) == Decimal("36.22") and j["cart_hash"] == sim_hash and j["payment_method"]["version"] == 1, e or j)
        if oid:
            row = psql(f"""SELECT json_build_object('o',(SELECT json_build_object('total',total,'final',final_amount_with_interest,'int',financial_interest_amount,'net',net_amount_after_discount,'terms',payment_terms_id) FROM public.partner_orders WHERE id='{oid}'),
              't',(SELECT json_agg(json_build_object('id',id,'final',final_amount,'int',financial_interest_amount,'n',installment_count,'first',first_due_date)) FROM public.partner_order_payment_terms WHERE partner_order_id='{oid}'),
              's',(SELECT json_agg(json_build_object('installment_number',installment_number,'estimated_due_date',due_date,'amount',amount,'principal_amount',principal_amount,'interest_amount',interest_amount) ORDER BY installment_number) FROM public.partner_order_payment_schedule WHERE partner_order_id='{oid}'),
              'm',(SELECT json_build_object('final',final_amount,'sched',estimated_schedule,'hash',cart_hash,'terms',payment_terms_id) FROM public.partner_order_payment_method_snapshots WHERE partner_order_id='{oid}'),
              'i',(SELECT result_snapshot->>'final_amount' FROM public.partner_order_idempotency WHERE idempotency_key='TESTE-PRICE-1'))""").stdout.strip()
            d = json.loads(row); D = lambda x: Decimal(str(x))
            check("pedido/terms/cronograma/snapshot/idempotência: todos 1036,22 e as mesmas 3 parcelas",
                  D(d["o"]["total"]) == D(d["o"]["final"]) == D(d["t"][0]["final"]) == D(d["m"]["final"]) == D(d["i"]) == Decimal("1036.22")
                  and D(d["o"]["int"]) == D(d["t"][0]["int"]) == Decimal("36.22") and len(d["t"]) == 1 and d["t"][0]["n"] == 3
                  and d["o"]["terms"] == d["t"][0]["id"] == d["m"]["terms"] and rows_of(d["s"]) == exp and rows_of(d["m"]["sched"]) == exp
                  and d["t"][0]["first"] == exp[0][1] and d["m"]["hash"] == sim_hash, d)
        j2, e = create(UB, P3, [L(1000)], sim_hash, "TESTE-PRICE-1", bol, 1)
        check("replay mesma chave+meio: mesmo pedido e mesmo ACK", j2 and j2["id"] == oid and j2["total"] == j["total"], e or j2)
        check("replay não duplica snapshot/terms", psql(f"SELECT (SELECT count(*) FROM public.partner_order_payment_method_snapshots WHERE partner_order_id='{oid}')||':'||(SELECT count(*) FROM public.partner_order_payment_terms WHERE partner_order_id='{oid}')").stdout.strip() == "1:1")
        denied("mesma chave com outro meio: conflito", create(UB, P3, [L(1000)], sim_hash, "TESTE-PRICE-1", pix3, 1), "")
        # Desconto + líquido/embalagem/misto à vista
        for nm, items, amt in (("líquido", [L(1)], "0.90"), ("embalagem inteira", [S(1)], "162.00"), ("misto", [L(1), S(1)], "162.90")):
            j, e = sim(UB, PLD, items, pix, 1)
            check(f"Pix {nm} com desconto 10%: R$ {amt} em 1 parcela base+5d", j and Decimal(str(j["final_amount"])) == Decimal(amt) and len(j["schedule"]) == 1
                  and j["schedule"][0]["estimated_due_date"] == (base + timedelta(days=5)).isoformat() and Decimal(str(j["schedule"][0]["amount"])) == Decimal(amt), e or j)
        hm = sim(UB, PLD, [L(1), S(1)], pix, 1)[0]["cart_hash"]
        j, e = create(UB, PLD, [L(1), S(1)], hm, "TESTE-MIX-1", pix, 1)
        o_mix = j and j["id"]
        it = psql(f"SELECT string_agg(coalesce(packaging_codigo_snapshot,'L')||':'||quantidade::text||':'||preco_unitario_final_snapshot::text, ',' ORDER BY packaging_codigo_snapshot NULLS FIRST) FROM public.partner_order_items WHERE order_id='{o_mix}'").stdout.strip() if o_mix else ""
        check("pedido misto: snapshots de embalagem inteira + líquido preservados", j and Decimal(str(j["total"])) == Decimal("162.90") and it.startswith("L:1") and "SC25:1" in it, e or it)
        denied("preço client-side ignorado: hash não confere", create(UB, PLD, [dict(L(1), preco_unitario=0.01)], "x" * 64, "TESTE-CLI", pix, 1), "price_changed")
        denied("parcelas/vencimento do cliente não existem no contrato", out(as_user(UB, f"SELECT public.create_partner_order_with_method_secure('{P}',NULL,'[]'::jsonb,NULL,'{PLD}','x','k',NULL,NULL,3)::text;")), "does not exist")
        # Cotação
        j, e = sim(UB, PLQ, [L(1)], pixq, 1)
        hq = j and j["cart_hash"]
        j, e = create(UB, PLQ, [L(1)], hq, "TESTE-COT-1", pixq, 1)
        oq = j and j["id"]
        st = psql(f"SELECT status||':'||(SELECT count(*) FROM public.partner_order_payment_terms WHERE partner_order_id='{oq}')||':'||coalesce((SELECT final_amount::text FROM public.partner_order_payment_method_snapshots WHERE partner_order_id='{oq}'),'null') FROM public.partner_orders WHERE id='{oq}'").stdout.strip() if oq else ""
        check("cotação: aguardando_cotacao, sem terms, snapshot com valor nulo", st == "aguardando_cotacao:0:null", e or st)
        # Crédito real: limite entre 1000 e 1036,22
        psql(f"INSERT INTO public.partner_financial_settings(id,partner_id,credit_limit,credit_limit_action,block_if_overdue,overdue_tolerance_days) VALUES (gen_random_uuid(),'{P}',2050,'block',false,0) ON CONFLICT (partner_id) DO UPDATE SET credit_limit=2050, credit_limit_action='block'")
        expo = json.loads(psql(f"SELECT public.fn_b2b_credit_exposure('{P}',0,NULL)::text").stdout.strip())
        room = Decimal(str(expo["credit_limit"])) - Decimal(str(expo["exposicao_projetada"]))
        lim_room = (Decimal("1000") + Decimal("1036.22")) / 2  # disponível entre o líquido e o total Price
        psql(f"UPDATE public.partner_financial_settings SET credit_limit = {Decimal(str(expo['credit_limit'])) - room + lim_room} WHERE partner_id='{P}'")
        j, e = sim(UB, P3B, [L(1000)], prom, 1); hp = j and j["cart_hash"]
        check("crédito: simulação avisa excesso com o total Price (não o líquido)", j and "Pedido excede o limite de crédito projetado" in j["warnings"], e or j and j["warnings"])
        denied("crédito real: create bloqueado pelo total Price (credit_limit_exceeded)", create(UB, P3B, [L(1000)], hp, "TESTE-CRED-1", prom, 1), "credit_limit_exceeded")
        psql(f"DELETE FROM public.partner_financial_settings WHERE partner_id='{P}'")

        # ---------- negativas de autorização / stale ----------
        denied("sem meio: payment_method_required", sim(UB, PLD, [L(1)], None, None), "payment_method_required")
        denied("config inexistente sem oráculo", sim(UB, PLD, [L(1)], str(uuid.uuid4()), 1), "payment_method_unavailable")
        denied("config de F por comprador de A", sim(UB, PLD, [L(1)], pixF, 1), "payment_method_unavailable")
        denied("config de outra condição", sim(UB, PLD, [L(1)], bol, 1), "payment_method_unavailable")
        denied("técnico não simula", sim(UT, PLD, [L(1)], pix, 1), "forbidden_financial_terms")
        denied("anônimo sem EXECUTE no create", out(as_user(None, f"SELECT {create_sql(P, PLD, [L(1)], 'x', 'k', pix, 1)}::text;", "anon")), "permission denied")
        j, e = save(UADM, pix, PLD, "pix", M_PIX, 7, 1, None, "active", 1); check("Pix v2 com CAS", j and j["config"]["version"] == 2, e)
        denied("CAS antigo recusado", save(UADM, pix, PLD, "pix", M_PIX, 8, 1, None, "active", 1), "payment_method_config_stale")
        denied("simulação versão antiga: stale", sim(UB, PLD, [L(1)], pix, 1), "payment_method_stale")
        denied("create versão antiga: stale", create(UB, PLD, [L(1), S(1)], hm, "TESTE-STALE", pix, 1), "payment_method_stale")
        check("snapshot histórico preserva v1/5 dias", psql(f"SELECT config_version||':'||due_days FROM public.partner_order_payment_method_snapshots WHERE partner_order_id='{o_mix}'").stdout.strip() == "1:5")
        r = psql(f"UPDATE public.partner_order_payment_method_snapshots SET due_days=1 WHERE partner_order_id='{o_mix}'", check=False)
        check("snapshot imutável", r.returncode != 0 and "immutable" in r.stderr)
        check("histórico de versões append-only", psql("DELETE FROM public.b2b_payment_method_config_versions", check=False).returncode != 0)

        # ---------- duas sessões: revogação durante espera ----------
        hp2 = sim(UB, PLD, [L(1)], pix, 2)[0]["cart_hash"]
        cs = session(UB, f"SELECT {create_sql(P, PLD, [L(1)], hp2, 'TESTE-W1', pix, 2)};")
        res = parallel([session(UADM, f"BEGIN; SELECT public.b2b_payment_method_config_save('{pix}','{PLD}','pix','{M_PIX}',7,1,NULL,'revoked',2); SELECT pg_sleep(1.2); COMMIT;"), cs], [0, 0.4])
        check("duas sessões: create espera a revogação do meio e falha depois (sem pedido)", res[0].returncode == 0 and res[1].returncode != 0
              and ("payment_method_stale" in res[1].stderr or "payment_method_unavailable" in res[1].stderr)
              and psql("SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key='TESTE-W1'").stdout.strip() == "0", (res[0].stderr[-150:], res[1].stderr[-200:]))
        hc = sim(UB, PLD, [L(1)], cash, 1)[0]["cart_hash"]
        res = parallel([f"BEGIN; UPDATE public.commercial_payment_plan_assignments SET status='revoked' WHERE plan_id='{PLD}' AND partner_id='{P}'; SELECT pg_sleep(1.2); COMMIT;",
                        session(UB, f"SELECT {create_sql(P, PLD, [L(1)], hc, 'TESTE-W2', cash, 1)};")], [0, 0.4])
        check("duas sessões: atribuição revogada durante a espera -> indisponível", res[1].returncode != 0 and "payment_method_unavailable" in res[1].stderr, res[1].stderr[-200:])
        psql(f"UPDATE public.commercial_payment_plan_assignments SET status='published' WHERE plan_id='{PLD}' AND partner_id='{P}'")
        res = parallel([f"BEGIN; UPDATE public.payment_methods SET active=false WHERE id='{M_CASH}'; SELECT pg_sleep(1.2); COMMIT;",
                        session(UB, f"SELECT {create_sql(P, PLD, [L(1)], hc, 'TESTE-W3', cash, 1)};")], [0, 0.4])
        check("duas sessões: meio desativado no catálogo durante a espera -> indisponível", res[1].returncode != 0 and "payment_method_unavailable" in res[1].stderr, res[1].stderr[-200:])
        psql(f"UPDATE public.payment_methods SET active=true WHERE id='{M_CASH}'")
        res = parallel([f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('b2b_credit:{P}',0)); SELECT pg_sleep(1.2); COMMIT;",
                        session(UB, f"SELECT {create_sql(P, PLD, [L(1)], hc, 'TESTE-W4', cash, 1)};"),
                        f"DELETE FROM public.user_roles WHERE user_id='{UB}' AND role='parceiro_b2b';"], [0, 0.3, 0.7])
        check("duas sessões: papel do comprador revogado durante a espera de crédito -> negado na revalidação", res[1].returncode != 0
              and psql("SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key='TESTE-W4'").stdout.strip() == "0", res[1].stderr[-200:])
        psql(f"INSERT INTO public.user_roles VALUES ('{UB}','parceiro_b2b')")
        res = parallel([session(UADM, f"BEGIN; SELECT public.b2b_payment_method_config_save('{cash}','{PLD}','dinheiro','{M_CASH}',1,1,NULL,'active',1); SELECT pg_sleep(1.2); COMMIT;"),
                        session(UFIN, f"SELECT public.b2b_payment_method_config_save('{cash}','{PLD}','dinheiro','{M_CASH}',2,1,NULL,'active',2);"),
                        f"DELETE FROM public.user_roles WHERE user_id='{UFIN}' AND role='financeiro';"], [0, 0.3, 0.7])
        check("config_save: papel revogado durante a espera do advisory -> forbidden (reautoriza após lock)", res[0].returncode == 0 and res[1].returncode != 0 and "forbidden" in res[1].stderr, res[1].stderr[-200:])
        psql(f"INSERT INTO public.user_roles VALUES ('{UFIN}','financeiro')")
        sql_par = session(UB, f"BEGIN; SELECT {create_sql(P, PLD, [S(1)], sim(UB, PLD, [S(1)], cash, 2)[0]['cart_hash'], 'TESTE-PAR', cash, 2)}; SELECT pg_sleep(0.5); COMMIT;")
        res = parallel([sql_par, sql_par], [0, 0.1])
        check("mesma chave em paralelo: um pedido", all(x.returncode == 0 for x in res) and psql("SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key='TESTE-PAR'").stdout.strip() == "1", [x.stderr[-150:] for x in res])

        # ---------- ativação por empresa ----------
        denied("financeiro não ativa", activation(UFIN, "pilot", [P], 0), "forbidden")
        denied("piloto com parceiro de outro tenant recusado", activation(UADM, "pilot", [PF], 0), "payment_method_pilot_partner_invalid")
        j, e = activation(UADM, "pilot", [P], 0); check("admin A ativa piloto só para o parceiro P", j and j["activation"]["mode"] == "pilot" and j["activation"]["version"] == 1, e)
        denied("ativação com CAS antigo recusada", activation(UADM, "enforced", [], 0), "payment_method_activation_stale")
        j, e = call(UB, f"public.b2b_list_payment_method_options_secure('{P}','{PLD}')"); check("piloto: comprador P vê mode required", j and j["mode"] == "required", e)
        r = legacy(UB, PLD, [L(1)], "TESTE-LEG-1")
        check("piloto: contrato antigo do comprador P bloqueado (B2B_PAYMENT_METHOD_REQUIRED, nada gravado)", r.returncode != 0 and "B2B_PAYMENT_METHOD_REQUIRED" in r.stderr
              and psql("SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key='TESTE-LEG-1'").stdout.strip() == "0", r.stderr[-200:])
        r = legacy(SP.UADM, PLD, [L(1)], "TESTE-LEG-INT")
        check("piloto: ator interno de A também exige meio (sem bypass por papel)", r.returncode != 0 and "B2B_PAYMENT_METHOD_REQUIRED" in r.stderr, r.stderr[-200:])
        hi = sim(SP.UADM, PLD, [L(1)], cash, 2)
        j, e = create(SP.UADM, PLD, [L(1)], hi[0]["cart_hash"] if hi[0] else "x", "TESTE-INT-1", cash, 2)
        check("piloto: ator interno de A cria com meio", j and j["payment_method"]["method_kind"] == "dinheiro", e or hi[1])
        r = legacy(UB2, PLD, [L(1)], "TESTE-LEG-F1", partner=PF)
        check("piloto de A não afeta comprador de F (contrato atual)", r.returncode == 0, r.stderr[-200:])
        r = psql(session(UB, f"BEGIN; SELECT {create_sql(P, PLD, [L(1)], hc, 'TESTE-DEF', cash, 2)}; DELETE FROM public.partner_order_payment_method_snapshots; COMMIT;"), check=False)
        check("gatilho DEFERRED: snapshot removido na mesma transação -> recusado (imutável/obrigatório)", r.returncode != 0)
        # Isolado: com o gatilho de imutabilidade desligado numa transação desfeita, só a exigência deferida barra.
        r = psql("BEGIN; ALTER TABLE public.partner_order_payment_method_snapshots DISABLE TRIGGER b2b_pm_snapshot_immutable;\n"
                 + session(UB, f"SELECT {create_sql(P, PLD, [S(2)], sim(UB, PLD, [S(2)], cash, 2)[0]['cart_hash'], 'TESTE-DEF2', cash, 2)};\nRESET ROLE;\n")
                 + "DELETE FROM public.partner_order_payment_method_snapshots s USING public.partner_order_idempotency i WHERE i.idempotency_key='TESTE-DEF2' AND s.partner_order_id=i.order_id;\nCOMMIT;", check=False)
        check("gatilho DEFERRED isolado: pedido sem snapshot falha no COMMIT com B2B_PAYMENT_METHOD_REQUIRED", r.returncode != 0 and "B2B_PAYMENT_METHOD_REQUIRED" in r.stderr
              and psql("SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key='TESTE-DEF2'").stdout.strip() == "0", r.stderr[-200:])
        j, e = call(UB, f"public.get_partner_order_payment_method_secure('{oid}')")
        check("comprador lê meio/parcelas do pedido (mesmo total)", j and j["present"] and Decimal(str(j["payment_method"]["final_amount"])) == Decimal("1036.22"), e or j)
        denied("admin F não lê pedido de A", call(UADMF, f"public.get_partner_order_payment_method_secure('{oid}')"), "forbidden")

        # ---------- rollback deny-only transacional ----------
        files = write(fm["install"])
        bad_rb = files["04-rollback-deny.sql.review"].replace(fm["install"]["read"], "0" * 32, 1)
        (work / "bad-rb.sql").write_text(bad_rb); (work / "bad-rb.sql").chmod(0o644)
        r = runf(work / "bad-rb.sql")
        check("04 com pin divergente aborta sem mudar nada", r.returncode != 0 and md5_of(g["PUB"]["read"]) == fm["install"]["read"], r.stderr[-200:])
        r = runf(work / "04-rollback-deny.sql.review"); check("04 rollback deny-only", r.returncode == 0, r.stderr[-300:])
        denied("após rollback: opções negadas", call(UB, f"public.b2b_list_payment_method_options_secure('{P}','{PLD}')"), "permission denied")
        r = legacy(UB, PLD, [L(1)], "TESTE-LEG-2")
        check("após rollback: empresa ativada continua bloqueada (nunca reabre fallback)", r.returncode != 0 and "B2B_PAYMENT_METHOD_REQUIRED" in r.stderr)
        r = legacy(UB2, PLD, [L(1)], "TESTE-LEG-F2", partner=PF)
        check("após rollback: empresa não ativada segue contrato atual", r.returncode == 0, r.stderr[-200:])
        check("após rollback: snapshots/histórico preservados", int(psql("SELECT count(*) FROM public.partner_order_payment_method_snapshots").stdout.strip()) >= 4
              and int(psql("SELECT count(*) FROM public.b2b_payment_method_config_versions").stdout.strip()) >= 8)
        fm["deny"] = {k: md5_of(s) for k, s in g["PUB"].items()}
        (HERE / "fn-md5.json").write_text(json.dumps(fm, indent=2) + "\n")
    except Exception:
        for c in CHECKS:
            if not c["ok"]: print("FAIL", c["name"], c.get("detail", ""))
        raise
    finally:
        subprocess.run(SP.su() + ["pg_ctl", "-D", str(tmp / "d"), "-m", "fast", "stop"], capture_output=True)
    passed = sum(1 for c in CHECKS if c["ok"])
    (HERE / "evidence-local-pg.json").write_text(json.dumps({"contract": "B2B_PAYMENT_METHOD_V1", "revision": 2,
        "kind": "DISPOSABLE_PG_REAL_CREATE_c34e7404_WITH_DECLARED_SEAMS_NOT_HOSTED_PROOF", "passed": passed, "total": len(CHECKS), "checks": CHECKS},
        indent=2, ensure_ascii=False) + "\n")
    print(f"{passed}/{len(CHECKS)}")
    for c in CHECKS:
        if not c["ok"]: print("FAIL", c["name"], c.get("detail", ""))
    return 0 if passed == len(CHECKS) else 1


if __name__ == "__main__":
    sys.exit(main())
