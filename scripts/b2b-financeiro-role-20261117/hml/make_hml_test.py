#!/usr/bin/env python3
"""Deriva hml/test_hml_pg.py da bateria de produção (mesmos cenários de acesso), trocando apenas:
ref, artefatos *-hml, cadeia de crédito ausente + exposição legada HML pinada, e expectativas de crédito FECHADO."""
import pathlib, sys
H = pathlib.Path(__file__).resolve().parent; R = H.parent
t = (R / "test_local_pg.py").read_text()
def sub(old, new, n=1):
    global t
    if t.count(old) != n: sys.exit(f"ANCHOR {old[:70]!r} x{t.count(old)}")
    t = t.replace(old, new)
sub('H = Path(__file__).resolve().parent', 'HM = Path(__file__).resolve().parent; H = HM.parent')
sub('"fn_b2b_credit_exposure", "rpc_partner_message_counters", "platform_private.b2b_credit_balances"]:', '"rpc_partner_message_counters"]:')
sub('"fn_b2b_credit_exposure", "rpc_partner_message_counters",', '"rpc_partner_message_counters",')
i = t.index('"platform_private.b2b_credit_config_block", "platform_private.b2b_credit_balances",'); j = t.index("]", i)
t = t[:i] + '"platform_private.b2b_credit_config_block"' + t[j:]   # cadeia B4 ausente no HML
i = t.index("CHAIN = ["); j = t.index("\n", i); t = t[:i] + "CHAIN = []" + t[j:]
sub('    run("REVOKE ALL ON FUNCTION platform_private.b2b_credit_balances(uuid,uuid) FROM PUBLIC; REVOKE ALL ON FUNCTION platform_private.b2b_credit_config_block(uuid) FROM PUBLIC;")',
    '    run("ALTER TABLE public.partner_orders ADD COLUMN total numeric(12,2);" + (HM / "captured" / "fn_b2b_credit_exposure.sql").read_text() + ";")  # corpo HML 213ac31f')
sub("swzpzcwiasxmjutrmvkm", "vrlcdwmlytukrjezrrnf", t.count("swzpzcwiasxmjutrmvkm"))
for a, b in [('(H / "01-pre.sql.readonly")', '(HM / "01-pre-hml.sql.readonly")'), ('(H / "02a-install-enum.sql.review")', '(HM / "02a-install-enum-hml.sql.review")'),
             ('(H / "03-post.sql.readonly")', '(HM / "03-post-hml.sql.readonly")'), ('(H / "04-rollback.sql.review")', '(HM / "04-rollback-hml.sql.review")')]:
    sub(a, b)
sub('(H / "02b-install.sql.review")', '(HM / "02b-install-hml.sql.review")', 2)
# Bloco de crédito: substitui pelos cenários HML (fechado, sem cair na fórmula legada).
i = t.index('    cred = lambda uid, k:'); j = t.index('    check("financeiro_le_obrigacoes_proprias"')
t = t[:i] + '''    cred = lambda uid, k: act(uid, f"SELECT public.b2b_finance_credit_v1()->>'{k}';")
    check("hml_capacidade_credito_fechado", cap(F1, "credit_read"), "false")
    check("hml_capacidade_motivo", cap(F1, "credit_reason"), "credit_chain_unavailable")
    check("hml_leitor_credito_fechado", cred(F1, "credit_limit"), error="own_finance_credit_unavailable")
    check("hml_exposicao_legada_intacta", "SELECT md5(pg_get_functiondef('public.fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure));", "213ac31f3a30816ead75365b0d1fed18")
    check("hml_sem_nucleo_credito", "SELECT to_regprocedure('platform_private.b2b_credit_exposure_core(uuid,numeric,uuid)') IS NULL AND to_regprocedure('platform_private.b2b_credit_balances_core(uuid,uuid,uuid)') IS NULL;", "t")
    check("contadores_mensagens_fechados_financeiro", act(F1, "SELECT public.rpc_partner_message_counters(NULL);"), error="permission_denied")
    check("contadores_mensagens_fechados_irmao_explicito", act(F1, f"SELECT public.rpc_partner_message_counters('{P2}');"), error="permission_denied")
    check("contadores_gestor_regressao", act(G1, "SELECT public.rpc_partner_message_counters(NULL)->>'nao_lidas';"), "1")
''' + t[j:]
sub('check("financeiro_capacidade_sem_escrita_credito_bloqueado", act(F1, "SELECT (c->>\'writes\')||(c->>\'credit_read\')||(c->>\'export\') FROM public.b2b_finance_capability_v1() c;"), "falsetruetrue")',
    'check("financeiro_capacidade_sem_escrita_credito_bloqueado", act(F1, "SELECT (c->>\'writes\')||(c->>\'credit_read\')||(c->>\'export\') FROM public.b2b_finance_capability_v1() c;"), "falsefalsetrue")')
sub('check(f"{nm}_credito_negado", act(uid, "SELECT public.b2b_finance_credit_v1();"), error="own_finance_forbidden")',
    'check(f"{nm}_credito_negado", act(uid, "SELECT public.b2b_finance_credit_v1();"), error="own_finance_credit_unavailable")')
sub('check("revogacao_retira_credito", act(F2, "SELECT public.b2b_finance_credit_v1();"), error="own_finance_forbidden")',
    'check("revogacao_retira_credito", act(F2, "SELECT public.b2b_finance_credit_v1();"), error="own_finance_credit_unavailable")')
i = t.index('    check("rollback_remove_nucleo_balancos"'); j = t.index('    check("rollback_gestor_preservado"')
t = t[:i] + '''    check("rollback_exposicao_legada_intacta", "SELECT md5(pg_get_functiondef('public.fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure));", "213ac31f3a30816ead75365b0d1fed18")
''' + t[j:]
sub('(H / "evidence-local.json")', '(HM / "evidence-hml-local.json")')
sub('B2BFIN_PORT", "55631"', 'B2BFIN_PORT", "55641"')
(H / "test_hml_pg.py").write_text('# GERADO por hml/make_hml_test.py; não editar.\n' + t)
print("OK")
