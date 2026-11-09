#!/usr/bin/env python3
"""Deriva uma bateria estrita da fonte B4 sem alterar a bateria histórica."""
from pathlib import Path

H = Path(__file__).resolve().parent
SOURCE = H.parents[1] / "test-b4-b3.py"
OUT = H / "test_strict.py"


def replace(text, old, new, count=1):
    assert text.count(old) == count, (old[:120], text.count(old), count)
    return text.replace(old, new, count)


def main():
    s = SOURCE.read_text()
    s = replace(s, 'H = pathlib.Path(__file__).resolve().parent\nROOT = H.parents[2]',
                'H = pathlib.Path(__file__).resolve().parent.parents[1]\nROOT = H.parents[2]')
    s = replace(s, 'OUT = pathlib.Path(os.environ.get("B4_EVIDENCE_OUT", str(H / "review-458b6012/manual-null-1813")))',
                'OUT = pathlib.Path(os.environ.get("B4_EVIDENCE_OUT", str(H / "fiscal-decision-20261108/service-bridge-current-20261109/evidence/strict-01")))')
    start = "        # Costura SOMENTE do harness: adaptador fictício sem rede, após provar a negação real.\n"
    end = "        # Ponte fiscal service-only: instalada somente após a regressão e o\n"
    assert s.count(start) == 1 and s.count(end) == 1
    a = s.index(start)
    b = s.index(end, a)
    s = s[:a] + """        # Bateria estrita: nenhum allocate direto e nenhum stub permissivo.
        check("componente econômico direto fora desta bateria estrita", True)
        rollback = runfile(H / "04-rollback-deny.sql.review")
        check("rollback B4 deny-only antes da ponte preserva histórico", rollback.returncode == 0, rollback.stderr[-1200:])
        check("nenhum título fiscal existe antes da confirmação", B3.psql("SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id IS NOT NULL").stdout.strip() == "0")

""" + s[b:]
    s = replace(s, "(organization_id,is_active,configuration_status,legal_name,cnpj,configuration_version)",
                "(organization_id,is_active,configuration_status,accounting_validated_at,legal_name,cnpj,configuration_version)", count=2)
    s = replace(s, "SELECT '{B3.A}',true,'VALIDATED','AR BIO FIXTURE LOCAL','00000000000191',7", "SELECT '{B3.A}',true,'VALIDATED',now(),'AR BIO FIXTURE LOCAL','00000000000191',7")
    s = replace(s, "SELECT '{B3.F}',true,'VALIDATED','FSF FIXTURE LOCAL','00000000000191',1", "SELECT '{B3.F}',true,'VALIDATED',now(),'FSF FIXTURE LOCAL','00000000000191',1")
    s = replace(s, 'monetary = B3.psql(f"SELECT principal+financed_interest FROM platform_private.b2b_document_allocations WHERE document_id=\'{RECOVERY_DOC}\'").stdout.strip()',
                'monetary = B3.psql(f"SELECT round(financed_total/2,2) FROM platform_private.b4_order_condition_snapshots WHERE order_id=\'{recovery_order}\'").stdout.strip()')
    s = replace(s, '        B3.psql("CREATE OR REPLACE FUNCTION platform_private.b2b_integration_dependencies() RETURNS void LANGUAGE sql AS $$SELECT$$;")\n        pending_result, pending_error = service_json',
                '''        STRICT = H / "fiscal-decision-20261108/service-bridge-current-20261109"
        def strict_file(name):
            return service_sql("RESET ROLE;SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';" + (STRICT / name).read_text())
        strict_pre = strict_file("01-pre.sql.readonly")
        check("etapa estrita PRE confirma B4, ponte, legado e dez gatilhos originais", strict_pre.returncode == 0, strict_pre.stderr[-1400:])
        strict_install = strict_file("02-install.sql.review")
        check("etapa estrita instala validação por permit fiscal real, sem stub", strict_install.returncode == 0, strict_install.stderr[-1400:])
        strict_post = strict_file("03-post.sql.readonly")
        check("etapa estrita POST preserva ACL, metadata e legado negado", strict_post.returncode == 0, strict_post.stderr[-1200:])
        check("nenhum stub always-allow foi instalado", "LANGUAGE sql AS $$SELECT$$" not in B3.psql("SELECT pg_get_functiondef('platform_private.b2b_integration_dependencies()'::regprocedure)").stdout)
        pending_result, pending_error = service_json''')
    s = replace(s, '        check("parcialidade service-only consome somente o restante do pedido", residual(recovery_order) == 0, residual(recovery_order))',
                '        check("primeira NF parcial deixa residual econômico sem cobrar o saldo", residual(recovery_order) > 0, residual(recovery_order))')
    anchor = '        check("duas chamadas service-only concorrentes preservam um único título", all(r.returncode == 0 for r in bridge_races) and B3.psql(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id=\'{invoice_main}\'").stdout.strip() == "1", [r.stderr[-500:] for r in bridge_races])\n'
    addition = anchor + '''        invoice_second, tx_second = B3.u(460), B3.u(461)
        seed_invoice(invoice_second, with_item=True)
        seed_proof(invoice_second, tx_second, protocol="LOCAL-SECOND-PARTIAL")
        second, second_error = service_json(f"public.rpc_fiscal_invoice_apply_authorization_v1('{invoice_second}','{access_key}','LOCAL-SECOND-PARTIAL',now(),'100','LOCAL','{tx_second}');")
        check("segunda NF parcial confirmada tem título próprio", second and second.get("receivableId") and second["receivableId"] != service_title, second_error or second)
        totals = B3.psql(f"SELECT (SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{recovery_order}' AND b2b_document_id IS NOT NULL)||'|'||(SELECT sum(total_amount) FROM public.accounts_receivable WHERE origin_id='{recovery_order}' AND b2b_document_id IS NOT NULL)||'|'||(SELECT financed_total FROM platform_private.b4_order_condition_snapshots WHERE order_id='{recovery_order}')").stdout.strip()
        count_text, allocated_text, economic_text = totals.split("|")
        check("duas NFs parciais não cobram além das alocações e do total econômico", count_text == "2" and Decimal(allocated_text) == Decimal(economic_text) and residual(recovery_order) == 0, totals)
'''
    s = replace(s, anchor, addition)
    s = replace(s, '        B3.psql(real_dependencies + ";")\n        bridge_rollback = bridge_file("04-rollback-deny.sql.review")',
                '''        strict_rollback = strict_file("04-rollback-deny.sql.review")
        check("rollback estrito restaura somente negação e preserva títulos/alocações", strict_rollback.returncode == 0 and B3.psql("SELECT pg_get_functiondef('platform_private.b2b_integration_dependencies()'::regprocedure) LIKE '%B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN%'").stdout.strip() == "t", strict_rollback.stderr[-1200:])
        bridge_rollback = bridge_file("04-rollback-deny.sql.review")''')
    s = replace(s, '"kind": "DISPOSABLE_B4_FINAL_CREDIT_TERMS_1833_PRE_INSTALL_POST_ROLLBACK_NOT_HOSTED_E2E"',
                '"kind": "DISPOSABLE_STRICT_FISCAL_PERMIT_TO_RECEIVABLE_REVIEW_ONLY_NOT_HOSTED"')
    s = replace(s, '"installation": "DISPOSABLE_PRE_INSTALL_POST_PASS; operation dependency remains real always-deny until harness-only stub"',
                '"installation": "DISPOSABLE_PRE_INSTALL_POST_ROLLBACK_PASS; positive only after strict permit validator; no always-allow stub"')
    s = replace(s, '"b2b_integration_dependencies substituída somente após prova de negação"',
                '"nenhuma substituição permissiva; validador exige permit txid + NF + protocolo + tenant + contabilidade VALIDATED sintética"')
    OUT.write_text(s)
    print(f"generated {OUT} ({len(s.splitlines())} lines)")


if __name__ == "__main__":
    main()
