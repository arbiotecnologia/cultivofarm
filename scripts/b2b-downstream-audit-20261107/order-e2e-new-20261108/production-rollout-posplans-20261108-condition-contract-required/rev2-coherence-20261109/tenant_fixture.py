"""Mirror-only fixture reconciliation for the CURRENT LIVE rule (commercial-plans cc1f6cc): plans are tenant-exclusive.

The frozen B3 harness assigned the same plans PLD/PLQ to partners of tenants A (P) and F (PF). cc1f6cc resolves the owner per
plan family and leaves ambiguous families NULL (denied) - so in the LIVE mirror PLD/PLQ became unusable for BOTH tenants.
This patch (applied only to the temp mirror copy, declared in harness-patch.diff) gives F its own plans PLDF/PLQF (same
economics, distinct id/code) and re-points every F usage. Tenant A keeps PLD/PLQ/P3. No guard, helper or expectation changes.
"""
DEF_ANCHOR = "P1 = u(87)"
DEF = "PLDF, PLQF = u(88), u(89)  # [mirror tenant-exclusive] planos exclusivos de F (regra LIVE cc1f6cc)\n"
REPL = [  # (old, new, exact count)
 ("('published','{PLD}','partner','{PF}',NULL,CURRENT_DATE-1,NULL)", "('published','{PLDF}','partner','{PF}',NULL,CURRENT_DATE-1,NULL)", 1),
 ("('published','{PLQ}','partner','{PF}',NULL,CURRENT_DATE-1,NULL)", "('published','{PLQF}','partner','{PF}',NULL,CURRENT_DATE-1,NULL)", 1),
 ("INSERT INTO public.commercial_payment_plan_assignments VALUES\n",
  "INSERT INTO public.commercial_payment_plans SELECT (jsonb_populate_record(NULL::public.commercial_payment_plans, to_jsonb(p) || jsonb_build_object('id',"
  "CASE p.id WHEN '{PLD}' THEN '{PLDF}' ELSE '{PLQF}' END,'code',p.code||'-F','name',p.name||' F'))).* FROM public.commercial_payment_plans p WHERE p.id IN ('{PLD}','{PLQ}');\n"
  "INSERT INTO public.commercial_payment_plan_assignments VALUES\n", 1),
 ('legacy(UB2, PLD, [SF(1)], "TESTE-LEG-F0", partner=PF)', 'legacy(UB2, PLDF, [SF(1)], "TESTE-LEG-F0", partner=PF)', 1),
 ('legacy(UB2, PLQ, [SF(1)], "TESTE-LEG-FQ-ZERO", partner=PF)', 'legacy(UB2, PLQF, [SF(1)], "TESTE-LEG-FQ-ZERO", partner=PF)', 1),
 ('publish(UADMF, PLD, "pix", M_PIX, 2, 1, 0, 0)', 'publish(UADMF, PLDF, "pix", M_PIX, 2, 1, 0, 0)', 1),
 ('assign(UADMF, PF, PLD, "pix", 1)', 'assign(UADMF, PF, PLDF, "pix", 1)', 1),
 ('assign(UADM, PF, PLD, "pix", 1)', 'assign(UADM, PF, PLDF, "pix", 1)', 1),
 ("b2b_list_payment_condition_options_secure('{PF}','{PLD}')", "b2b_list_payment_condition_options_secure('{PF}','{PLDF}')", 2),
 ('legacy(UB2, PLD, [SF(1)], "TESTE-LEG-F1", partner=PF)', 'legacy(UB2, PLDF, [SF(1)], "TESTE-LEG-F1", partner=PF)', 1),
 ('legacy(UB2, PLQ, [SF(1)], "TESTE-LEG-FQ", partner=PF)', 'legacy(UB2, PLQF, [SF(1)], "TESTE-LEG-FQ", partner=PF)', 1),
 ('legacy(UB2, PLD, [SF(1)], "TESTE-LEG-F2", partner=PF)', 'legacy(UB2, PLDF, [SF(1)], "TESTE-LEG-F2", partner=PF)', 1),
]
# B3 04 rollback is pinned to the PRE-cc1f6cc publish body; it cannot run over the LIVE stack and must not be repinned.
# In LIVE mode the whole harness B3-rollback section is replaced by an explicit NOT_RUN record (rollback 81 is tested in the hook).
RB_START = "        # ---------- rollback deny-only transacional ----------\n"
RB_END = '        (HERE / "fn-md5.json").write_text(json.dumps(fm, indent=2) + "\\n")\n'
RB_STUB = ("        # [mirror LIVE] B3 04 rollback NOT_RUN: pinned to pre-cc1f6cc publish c6fbe159 != historical; separate review required\n"
           "        NOT_RUN_B3_ROLLBACK = True\n")


def apply(s):
    assert s.count(DEF_ANCHOR) == 1
    s = s.replace(DEF_ANCHOR, DEF + DEF_ANCHOR, 1)
    for old, new, n in REPL:
        assert s.count(old) == n, (old, s.count(old))
        s = s.replace(old, new)
    a = s.index(RB_START); b = s.index(RB_END, a) + len(RB_END)
    return s[:a] + RB_STUB + s[b:]
