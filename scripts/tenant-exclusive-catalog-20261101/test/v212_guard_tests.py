"""Efeitos dos gatilhos/ACL/RLS REAIS da captura v2.12 (nada suspenso; cada cenário em transação com ROLLBACK).
Auth continua sintética (as_user) — não é prova JWT hospedada."""
import harness as H

KIND = "PG_DISPOSABLE_REAL_SCHEMA_V212_GUARDS_SYNTHETIC_AUTH"


def run(pg, q, check, as_user, val):
    c = lambda cid, scen, exp, act: check(cid, scen, exp, act, kind=KIND)
    ARB, FSF, UA, UF = H.ARB, H.FSF, H.UA, H.UF
    FI_A, FI_F, CFS_A, CFS_F = H.U(51), H.U(53), H.U(70), H.U(71)
    cnt = lambda: q(f"SELECT count(*) FROM public.fiscal_invoices WHERE id='{FI_A}'")

    r = pg.sql(f"BEGIN; DELETE FROM public.fiscal_invoices WHERE id='{FI_A}'; ROLLBACK;", ok=False)
    pg.sql("ROLLBACK;", ok=False)
    c("V212-G1", "DELETE de nota fiscal pelo dono do banco: gatilhos reais recusam e a linha permanece",
      "ERR|1", ("ERR" if r.startswith("ERR") else "OK") + "|" + cnt())
    H.V212_DETAIL = {"G1": r[:300]}

    r = pg.sql(f"BEGIN; INSERT INTO public.fiscal_invoices(organization_id,invoice_type,company_settings_id,created_by) "
               f"VALUES ('{ARB}','NFE','{CFS_F}','{UA}'); ROLLBACK;", ok=False)
    pg.sql("ROLLBACK;", ok=False)
    c("V212-G2", "nota AR Bio apontando configuração fiscal da FSF: integridade de tenant real recusa", True, r.startswith("ERR"))
    H.V212_DETAIL["G2"] = r[:300]

    r = pg.sql(as_user(UF) + f"SELECT count(*) FROM public.fiscal_invoices WHERE organization_id='{ARB}';", ok=False)
    c("V212-G3", "gestor FSF não lê notas da AR Bio (policies reais)", "0", val(r) if not r.startswith("ERR") else "ERR")

    r = pg.sql("BEGIN; " + as_user(UF) + f"UPDATE public.fiscal_invoices SET invoice_type='NFSE' WHERE id='{FI_A}'; ROLLBACK;", ok=False)
    pg.sql("ROLLBACK;", ok=False)
    c("V212-G4", "gestor FSF não altera nota da AR Bio; tipo permanece", "NFE",
      q(f"SELECT invoice_type FROM public.fiscal_invoices WHERE id='{FI_A}'"))

    r = pg.sql("BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.bank_accounts; ROLLBACK;", ok=False)
    pg.sql("ROLLBACK;", ok=False)
    c("V212-G5", "anon sem privilégio em bank_accounts (ACL real só postgres/service_role)", True, "permission denied" in r)

    r = pg.sql("BEGIN; SET LOCAL ROLE authenticated; SELECT count(*) FROM public.bank_accounts; ROLLBACK;", ok=False)
    pg.sql("ROLLBACK;", ok=False)
    c("V212-G6", "authenticated sem privilégio em bank_accounts (ACL real)", True, "permission denied" in r)

    tg = q("SELECT count(*) FROM pg_trigger g JOIN pg_class t ON t.oid=g.tgrelid WHERE t.relname='fiscal_invoices' AND NOT g.tgisinternal AND g.tgenabled='O'")
    c("V212-G7", "gatilhos reais de fiscal_invoices instalados e habilitados durante os cenários", "12", tg)
