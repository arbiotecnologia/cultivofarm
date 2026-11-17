#!/usr/bin/env python3
"""Gera a variante HML (vrlcdwmlytukrjezrrnf) a partir dos artefatos de produção já gerados por ../build.py.
Diferenças permitidas e únicas: (1) ref; (2) crédito FECHADO no HML (cadeia B4 ausente lá: b2b_credit_balances etc.),
fn_b2b_credit_exposure HML (legada) fica intacta e pinada; capacidade credit_read=false; leitor de crédito nega.
Nada de corpo de produção é transplantado; demais pinos são os de produção e o PRE aborta se o HML divergir.
Cada substituição casa exatamente uma vez; não acessa banco."""
import json, pathlib, re, sys
H = pathlib.Path(__file__).resolve().parent; R = H.parent
PROD, HML = "swzpzcwiasxmjutrmvkm", "vrlcdwmlytukrjezrrnf"
HML_PINS = json.loads((H / "hml-pins.json").read_text())
PINS = json.loads((R / "pins.json").read_text())
CREDIT_FN = {"fn_b2b_credit_exposure", "platform_private.b2b_credit_balances"}
CREDIT_CHAIN = {"platform_private.b2b_credit_config_block", "fn_authz_uid_scope_ok", "is_financial_staff", "platform_private.b2b_integration_actor",
  "platform_private.b2b_debtor_partner", "platform_private.b2b_receivable_partner_scope", "platform_private.b2b_allocation_money_row",
  "platform_private.b2b_legacy_money_row", "platform_private.b2b_proven_money_row_internal", "platform_private.b2b_order_residual"}
def sub(t, old, new, n=1, tag=""):
    if t.count(old) != n: sys.exit(f"ANCHOR {tag}: {old[:70]!r} x{t.count(old)}")
    return t.replace(old, new)
def ref(t, n, tag): return sub(t, PROD, HML, n, tag)
def cut_fn(t, header, tag):
    i = t.find(header)
    if i < 0 or t.count(header) != 1: sys.exit(f"ANCHOR cut {tag}")
    j = t.index("END $function$;\n", i) + len("END $function$;\n")
    return t[:i] + f"-- HML: {tag} omitido (cadeia de crédito B4 ausente no HML; crédito fechado).\n" + t[j:]
# 02b
t = (R / "02b-install.sql.review").read_text()
t = ref(t, t.count(PROD), "02b")
for h, tag in [("CREATE OR REPLACE FUNCTION platform_private.b2b_credit_balances_core(", "balances_core"),
               ("CREATE OR REPLACE FUNCTION platform_private.b2b_credit_balances(", "balances"),
               ("CREATE OR REPLACE FUNCTION platform_private.b2b_credit_exposure_core(", "exposure_core"),
               ("CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure(", "fn_b2b_credit_exposure")]:
    t = cut_fn(t, h, tag)
t = sub(t, "'obligations_read',true,'export',true,'credit_read',true,'writes',false);",
        "'obligations_read',true,'export',true,'credit_read',false,'credit_reason','credit_chain_unavailable','writes',false);", tag="cap")
i = t.index("CREATE FUNCTION platform_private.b2b_finance_credit_core()"); j = t.index("END $function$;\n", i) + 16
t = t[:i] + """CREATE FUNCTION platform_private.b2b_finance_credit_core()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
 -- HML: cadeia canônica de crédito ausente; nunca cair na fórmula legada sem gate.
 RAISE EXCEPTION 'own_finance_credit_unavailable' USING ERRCODE='42501';
END $function$;
""" + t[j:]
t = sub(t, "REVOKE ALL ON FUNCTION platform_private.b2b_credit_exposure_core(uuid,numeric,uuid) FROM PUBLIC, anon, authenticated, service_role;\n", "", tag="rv1")
t = sub(t, "REVOKE ALL ON FUNCTION platform_private.b2b_credit_balances_core(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;\n", "", tag="rv2")
if re.search(r"credit_exposure_core|credit_balances", t): sys.exit("LEFTOVER credit in 02b-hml")
(H / "02b-install-hml.sql.review").write_text("-- VARIANTE HML gerada por hml/build_hml.py; não editar.\n" + t)
# 01-pre: pinos de produção sem a cadeia de crédito + pino HML da exposição legada + ausência da cadeia B4.
pre = (R / "01-pre.template.sql").read_text()
pins = {k: v for k, v in PINS.items() if k not in CREDIT_FN and k not in CREDIT_CHAIN and k in json.loads((R / "01-pre.sql.readonly").read_text().split("pins jsonb := '",1)[1].split("';",1)[0])}
pins.update(HML_PINS)
pre = pre.replace("@@PINS@@", json.dumps(pins, sort_keys=True))
pre = ref(pre, 2, "pre")
pre = sub(pre, "  IF pg_get_constraintdef(", """  IF to_regprocedure('platform_private.b2b_credit_balances(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'B2B_FIN_PRE_HML_CREDIT_CHAIN_PRESENT: HML mudou; recapturar e gerar pacote de crédito revisado';
  END IF;
  IF pg_get_constraintdef(""", tag="pre-abs")
(H / "01-pre-hml.sql.readonly").write_text("-- VARIANTE HML gerada por hml/build_hml.py; não editar.\n" + pre)
# 03-post
post = (R / "03-post.sql.readonly").read_text()
for line in ["  AND NOT has_function_privilege('authenticated','platform_private.b2b_credit_exposure_core(uuid,numeric,uuid)','EXECUTE')\n",
             "  AND pg_get_functiondef('public.fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure) LIKE '%b2b_integration_actor(p_partner_id)%'\n",
             "  AND NOT has_function_privilege('authenticated','platform_private.b2b_credit_balances_core(uuid,uuid,uuid)','EXECUTE')\n",
             "  AND pg_get_functiondef('platform_private.b2b_credit_balances(uuid,uuid)'::regprocedure) LIKE '%b2b_integration_actor(p_partner)%'\n"]:
    post = sub(post, line, "", tag="post")
post = sub(post, "  AND (SELECT count(*) FROM pg_policies", f"""  AND md5(pg_get_functiondef('public.fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure))='{HML_PINS["fn_b2b_credit_exposure"][1]}'
  AND to_regprocedure('platform_private.b2b_credit_exposure_core(uuid,numeric,uuid)') IS NULL
  AND pg_get_functiondef('platform_private.b2b_finance_credit_core()'::regprocedure) LIKE '%own_finance_credit_unavailable%'
  AND (SELECT count(*) FROM pg_policies""", tag="post2")
(H / "03-post-hml.sql.readonly").write_text("-- VARIANTE HML gerada por hml/build_hml.py; não editar.\n" + post)
# 04 rollback: sem restaurar/remover cadeia de crédito
rb = (R / "04-rollback.sql.review").read_text()
rb = ref(rb, rb.count(PROD), "rb")
for h, tag in [("CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure(", "fn"), ("CREATE OR REPLACE FUNCTION platform_private.b2b_credit_balances(", "bal")]:
    i = rb.find(h)
    if i < 0: sys.exit("ANCHOR rb " + tag)
    j = rb.index("$function$;\n", rb.index("AS $function$", i) + 13) + 12
    rb = rb[:i] + rb[j:]
rb = sub(rb, "DROP FUNCTION platform_private.b2b_credit_exposure_core(uuid,numeric,uuid);\n", "", tag="rb1")
rb = sub(rb, "DROP FUNCTION platform_private.b2b_credit_balances_core(uuid,uuid,uuid);\n", "", tag="rb2")
if re.search(r"credit_exposure_core|credit_balances|fn_b2b_credit_exposure", rb): sys.exit("LEFTOVER credit in rb-hml")
(H / "04-rollback-hml.sql.review").write_text("-- VARIANTE HML gerada por hml/build_hml.py; não editar.\n" + rb)
# 02a/02c/04c: só o ref (núcleo de transição e executor têm md5 HML = produção, capturado pelo auditor).
for src, dst in [("02a-install-enum.sql.review", "02a-install-enum-hml.sql.review"), ("02c-install-access-transition.sql.review", "02c-install-access-transition-hml.sql.review"),
                 ("04c-rollback-access-transition.sql.review", "04c-rollback-access-transition-hml.sql.review")]:
    s = (R / src).read_text(); n = s.count(PROD)
    (H / dst).write_text("-- VARIANTE HML gerada por hml/build_hml.py; não editar.\n" + (ref(s, n, dst) if n else s))
print("HML OK")
