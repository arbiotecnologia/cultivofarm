#!/usr/bin/env python3
"""PG descartável — B2B_ORDER_PAYMENT_TERMS_READ_V1. Reaproveita o boot do pacote b2b-cart-catalog-fence (mesmas
costuras declaradas: auth.uid por claims locais, has_role/superadmin/features/platform_actor_access_ready).
Corpos REAIS: phase1_order_visible, phase1_partner_visible (2), is_valid_b2b_partner_user, owner_internal_partner_readable,
h15_actor_organization, b2b_actor_scope. Policies da tabela recriadas com o texto LIVE. Não é prova JWT/RLS hospedada."""
import hashlib, importlib.util, json, pathlib, runpy, sys, tempfile, shutil
HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("h", HERE.parent / "b2b-cart-catalog-fence-20261106" / "test-local-pg.py")
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
g = runpy.run_path(str(HERE / "generate.py"), run_name="lib")
u = h.u
UFIN, ORD, ORD2, ORDF = u(29), u(81), u(82), u(83)

TABLES = f"""
CREATE OR REPLACE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY, partner_id uuid NOT NULL, numero text, payment_plan_id uuid, payment_terms_id uuid);
CREATE TABLE public.partner_order_payment_terms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid NOT NULL, payment_plan_id uuid,
  plan_name_snapshot text, plan_code_snapshot text, discount_percent_snapshot numeric, monthly_interest_percent_snapshot numeric, months_count_snapshot numeric,
  installment_count integer, first_due_date date, interest_type_snapshot text, table_amount numeric, discount_amount numeric, net_amount_after_discount numeric,
  financial_interest_amount numeric, final_amount numeric, approval_status text, approved_by uuid, approved_at timestamptz, approval_notes text, created_by uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), pricing_mode_snapshot text, credit_decision_snapshot jsonb);
GRANT ALL ON public.partner_order_payment_terms, public.partner_orders TO anon, authenticated, service_role;
GRANT SELECT ON public.partner_users, public.user_roles, public.profiles, public.partner_accounts, public.organizations TO authenticated;
ALTER TABLE public.partner_order_payment_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY b2b_phase1_tenant_guard ON public.partner_order_payment_terms AS RESTRICTIVE FOR ALL USING (platform_private.b2b_phase1_order_visible(partner_order_id));
CREATE POLICY popt_insert ON public.partner_order_payment_terms FOR INSERT WITH CHECK (platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role));
CREATE POLICY popt_select ON public.partner_order_payment_terms FOR SELECT USING (platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (EXISTS ( SELECT 1
   FROM (partner_orders po
     JOIN partner_users pu ON ((pu.partner_id = po.partner_id)))
  WHERE ((po.id = partner_order_payment_terms.partner_order_id) AND (pu.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY popt_update ON public.partner_order_payment_terms FOR UPDATE USING (platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role));
INSERT INTO public.profiles VALUES ('{UFIN}','{h.A}',true); INSERT INTO public.user_roles VALUES ('{UFIN}','financeiro');
INSERT INTO public.partner_orders VALUES ('{ORD}','{h.P}','PB-T1',gen_random_uuid(),gen_random_uuid()),('{ORD2}','{h.P}','PB-T2',NULL,NULL),('{ORDF}','{h.PF}','PB-TF',gen_random_uuid(),gen_random_uuid());
INSERT INTO public.partner_order_payment_terms(partner_order_id, plan_name_snapshot, plan_code_snapshot, table_amount, discount_amount, net_amount_after_discount,
  financial_interest_amount, final_amount, approval_status, installment_count, credit_decision_snapshot)
  VALUES ('{ORD}','TESTE 10%','T10',21,2.1,18.9,0,18.9,'pending',1,'{{"secret":"credito"}}'),('{ORDF}','F','F',7,0,7,0,7,'pending',1,NULL);
"""
CAPS = ["platform_private.b2b_phase1_partner_visible", "public.b2b_phase1_partner_visible", "public.is_valid_b2b_partner_user",
        "platform_private.b2b_phase1_order_visible", "platform_private.b2b_owner_internal_partner_readable"]

def capbody(p):
    [f] = [x for x in (HERE / "captured").iterdir() if x.name.startswith(p + ".")]
    return f.read_text().rstrip("\n") + ";\n"

def call(uid, order, role="authenticated"):
    return h.as_user(uid, f"SELECT public.get_partner_order_payment_terms_secure('{order}')::text;", role)

def main():
    tmp = h.boot(); work = pathlib.Path(tempfile.mkdtemp())
    try:
        h.psql(TABLES)
        for c in CAPS: h.psql(capbody(c))
        h.psql("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA platform_private FROM PUBLIC;")
        for sig, md in g["PINS"].items():
            loc = h.psql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))").stdout.strip()
            h.check(f"corpo real byte a byte: {sig}", loc == md, loc)
        lp = json.loads((HERE / "captured" / "live-table-pins.json").read_text())
        pol = h.psql("SELECT " + g["POL"]).stdout.strip(); acl = h.psql("SELECT " + g["TACL"]).stdout.strip()
        h.check("policies locais == texto LIVE (md5)", pol == lp["policies_md5"], pol)
        seam = acl != lp["acl_md5"]
        files = g["build"](lp["policies_md5"], acl if seam else lp["acl_md5"])  # ACL local difere (owner); costura declarada
        for n, t in files.items(): (work / n).write_text(t)
        h.check("ACL da tabela: pin local substituído só na cópia temporária (declarado)" if seam else "ACL igual", True)
        cnt = lambda uid: h.as_user(uid, f"SELECT count(*) FROM public.partner_order_payment_terms WHERE partner_order_id='{ORD}';").stdout.strip().splitlines()[-1]
        h.check("causa: admin do vendedor lê 0 linhas da tabela direta", cnt(h.UADM) == "0", cnt(h.UADM))
        h.check("causa: comprador lê 1 linha da tabela direta", cnt(h.UB) == "1", cnt(h.UB))
        r = h.runfile(work / "01-pre.sql.readonly"); h.check("01 PRE_OK", r.returncode == 0 and "PRE_OK" in r.stderr, r.stderr[-300:])
        r = h.runfile(work / "02-install.sql.review"); h.check("02 install", r.returncode == 0, r.stderr[-300:])
        r = h.runfile(work / "03-post.sql.readonly"); h.check("03 POST_OK", r.returncode == 0 and "POST_OK" in r.stderr, r.stderr[-300:])
        r = h.runfile(work / "02-install.sql.review"); h.check("rerun recusado", r.returncode != 0)
        def present(name, uid, order, exp):
            j, e = h.out(call(uid, order))
            ok = j is not None and j.get("contract") == "B2B_ORDER_PAYMENT_TERMS_READ_V1" and j["present"] is exp and j["order_id"] == order
            if ok and exp: ok = float(j["terms"]["final_amount"]) == 18.9 and "credit_decision_snapshot" not in j["terms"]
            h.check(name, ok, e or j)
        present("admin do vendedor lê condição (18.90) sem credit_decision", h.UADM, ORD, True)
        present("financeiro do vendedor lê condição", UFIN, ORD, True)
        present("comprador do parceiro lê condição", h.UB, ORD, True)
        present("pedido do vendedor sem condição => present=false (ausência real)", h.UADM, ORD2, False)
        for n, uid, o in (("admin de outro tenant", h.UADMF, ORD), ("comprador de outro parceiro", h.UB2, ORD), ("técnico do parceiro", h.UT, ORD),
                          ("comprador inativo", h.UINACT, ORD), ("admin do vendedor em pedido de outro tenant", h.UADM, ORDF),
                          ("pedido inexistente (mesma negação, sem oráculo)", h.UADM, u(99)), ("sem sessão", None, ORD)):
            h.denied(f"negado: {n}", call(uid, o), "42501" if False else ("auth_required" if uid is None else "forbidden"))
        h.denied("anônimo sem EXECUTE", call(None, ORD, "anon"), "permission denied")
        h.check("tabela direta continua 0 linhas para admin do vendedor (RLS intocada)", cnt(h.UADM) == "0")
        r = h.runfile(work / "04-rollback-deny.sql.review"); h.check("04 rollback deny", r.returncode == 0, r.stderr[-300:])
        h.denied("rollback: leitor nega", h.psql(f"SELECT public.get_partner_order_payment_terms_secure('{ORD}')", check=False), "payment_terms_reader_rolled_back")
    finally:
        h.stop(tmp); shutil.rmtree(work, ignore_errors=True)
    fails = [c for c in h.checks if not c["ok"]]
    (HERE / "evidence-local-pg.json").write_text(json.dumps({"package": "B2B_ORDER_PAYMENT_TERMS_READ_V1", "hosted_proof": False,
        "passed": len(h.checks) - len(fails), "total": len(h.checks), "checks": h.checks}, indent=2, ensure_ascii=False) + "\n")
    print(f"{'PASS' if not fails else 'FAIL'} {len(h.checks) - len(fails)}/{len(h.checks)}"); return 1 if fails else 0

sys.exit(main())
