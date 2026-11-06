#!/usr/bin/env python3
"""B2B_ORDER_PAYMENT_TERMS_READ_V1 — leitor canônico da condição de pagamento de UM pedido (NÃO APLICADO).

Causa: partner_orders SELECT tem guard restritivo (phase1_partner_visible OR b2b_owner_internal_partner_readable),
mas partner_order_payment_terms tem guard restritivo só com b2b_phase1_order_visible. A equipe do vendedor (owner)
lê o pedido e recebe 0 linhas de condição -> a UI dizia "sem condição registrada".
Delta: nova função DEFINER somente leitura que exige EXATAMENTE as mesmas duas portas do pedido + a mesma regra de
papel da policy permissiva popt_select; nenhuma policy, grant de tabela ou helper é alterado.
"""
import hashlib, json, pathlib
HERE = pathlib.Path(__file__).resolve().parent

def cap(prefix):
    [p] = [x for x in (HERE / "captured").iterdir() if x.name.startswith(prefix + ".")]
    b = p.read_bytes(); md = hashlib.md5(b).hexdigest(); assert md[:8] == p.name.split(".")[-3]; return b.decode(), md

PINS = {
    "platform_private.b2b_phase1_order_visible(uuid)": cap("platform_private.b2b_phase1_order_visible")[1],
    "platform_private.b2b_phase1_partner_visible(uuid,boolean)": cap("platform_private.b2b_phase1_partner_visible")[1],
    "public.b2b_phase1_partner_visible(uuid,boolean)": cap("public.b2b_phase1_partner_visible")[1],
    "public.is_valid_b2b_partner_user(uuid,uuid)": cap("public.is_valid_b2b_partner_user")[1],
    "platform_private.b2b_owner_internal_partner_readable(uuid)": cap("platform_private.b2b_owner_internal_partner_readable")[1],
}
SIG = "public.get_partner_order_payment_terms_secure(uuid)"
FIELDS = ["id", "partner_order_id", "payment_plan_id", "plan_name_snapshot", "plan_code_snapshot", "pricing_mode_snapshot",
          "discount_percent_snapshot", "monthly_interest_percent_snapshot", "months_count_snapshot", "interest_type_snapshot",
          "installment_count", "first_due_date", "table_amount", "discount_amount", "net_amount_after_discount",
          "financial_interest_amount", "final_amount", "approval_status", "approved_at", "approval_notes", "created_at", "updated_at"]
OBJ = ", ".join(f"'{f}', t.{f}" for f in FIELDS)
FN = f"""CREATE OR REPLACE FUNCTION public.get_partner_order_payment_terms_secure(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- B2B_ORDER_PAYMENT_TERMS_READ_V1: somente leitura; não aprova, não altera e não expõe credit_decision_snapshot.
DECLARE v_uid uuid := auth.uid(); v_partner uuid; v_n integer; v_terms jsonb;
BEGIN
  IF v_uid IS NULL OR p_order_id IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  SELECT o.partner_id INTO v_partner FROM public.partner_orders o WHERE o.id = p_order_id;
  -- Mesmas portas do guard restritivo de SELECT de partner_orders; pedido inexistente nega igual (sem oráculo).
  IF v_partner IS NULL OR NOT (platform_private.b2b_phase1_partner_visible(v_partner, false) IS TRUE
                               OR platform_private.b2b_owner_internal_partner_readable(v_partner) IS TRUE) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  -- Mesma regra de papel da policy permissiva popt_select.
  IF NOT (platform_private.has_role(v_uid, 'administrador'::public.app_role) OR platform_private.has_role(v_uid, 'financeiro'::public.app_role)
          OR platform_private.has_role(v_uid, 'gestor_comercial'::public.app_role)
          OR (platform_private.has_role(v_uid, 'parceiro_b2b'::public.app_role)
              AND EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = v_partner AND pu.user_id = v_uid))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO v_n FROM public.partner_order_payment_terms t WHERE t.partner_order_id = p_order_id;
  IF v_n > 1 THEN RAISE EXCEPTION 'payment_terms_ambiguous' USING ERRCODE='P0001'; END IF;
  SELECT jsonb_build_object({OBJ}) INTO v_terms FROM public.partner_order_payment_terms t WHERE t.partner_order_id = p_order_id;
  RETURN jsonb_build_object('contract', 'B2B_ORDER_PAYMENT_TERMS_READ_V1', 'order_id', p_order_id,
                            'present', v_terms IS NOT NULL, 'terms', v_terms);
END $function$
"""
DENY = """CREATE OR REPLACE FUNCTION public.get_partner_order_payment_terms_secure(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'payment_terms_reader_rolled_back' USING ERRCODE='42501';
END $function$
"""
FN_MD5 = hashlib.md5(FN.encode()).hexdigest(); DENY_MD5 = hashlib.md5(DENY.encode()).hexdigest()
POL = ("(SELECT md5(string_agg(polname||':'||polcmd::text||':'||polpermissive::text||':'||coalesce(pg_get_expr(polqual,polrelid),'')||':'||coalesce(pg_get_expr(polwithcheck,polrelid),''), '|' ORDER BY polname))"
       " FROM pg_policy WHERE polrelid='public.partner_order_payment_terms'::regclass)")
TACL = "(SELECT md5(relacl::text) FROM pg_class WHERE oid='public.partner_order_payment_terms'::regclass)"

def pins(label):
    s = "".join(f"  IF to_regprocedure('{k}') IS NULL OR md5(pg_get_functiondef('{k}'::regprocedure)) <> '{v}' THEN RAISE EXCEPTION '{label}: {k} divergente'; END IF;\n" for k, v in PINS.items())
    return s

def fn_pin(md, label):
    return f"  IF to_regprocedure('{SIG}') IS NULL OR md5(pg_get_functiondef('{SIG}'::regprocedure)) <> '{md}' THEN RAISE EXCEPTION '{label}: leitor divergente'; END IF;\n"

ACL = (f"  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid='{SIG}'::regprocedure"
       " AND a.privilege_type='EXECUTE' AND a.grantee IN (0, 'anon'::regrole::oid)) THEN RAISE EXCEPTION 'ACL: PUBLIC/anon com EXECUTE'; END IF;\n")

def build(pol_md5, acl_md5):
    keep = (f"  IF {POL} IS DISTINCT FROM '{pol_md5}' THEN RAISE EXCEPTION 'policies de partner_order_payment_terms mudaram'; END IF;\n"
            f"  IF {TACL} IS DISTINCT FROM '{acl_md5}' THEN RAISE EXCEPTION 'ACL da tabela mudou'; END IF;\n")
    pre = ("-- 01 PRE (somente leitura). Ref canônico swzpzcwiasxmjutrmvkm conferido FORA do SQL.\nDO $$ BEGIN\n" + pins("PRE") + keep +
           f"  IF to_regprocedure('{SIG}') IS NOT NULL THEN RAISE EXCEPTION 'PRE: leitor já existe'; END IF;\n  RAISE NOTICE 'PRE_OK';\nEND $$;\n")
    inst = ("-- 02 INSTALL (REVISÁVEL; NÃO APLICAR sem autorização).\nBEGIN;\nDO $$ BEGIN\n" + pins("INSTALL") + keep +
            f"  IF to_regprocedure('{SIG}') IS NOT NULL THEN RAISE EXCEPTION 'INSTALL: leitor já existe'; END IF;\nEND $$;\n" + FN.rstrip("\n") + ";\n"
            f"REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION {SIG} TO authenticated;\n"
            "DO $$ BEGIN\n" + fn_pin(FN_MD5, "INSTALL_POST") + pins("INSTALL_POST") + keep + ACL + "END $$;\nCOMMIT;\n")
    post = "-- 03 POST (somente leitura).\nDO $$ BEGIN\n" + fn_pin(FN_MD5, "POST") + pins("POST") + keep + ACL + "  RAISE NOTICE 'POST_OK';\nEND $$;\n"
    rb = ("-- 04 ROLLBACK deny-only: leitor passa a negar (UI mostra indisponível, nunca 'sem condição'); nada mais muda.\nBEGIN;\nDO $$ BEGIN\n" + fn_pin(FN_MD5, "ROLLBACK") + "END $$;\n"
          + DENY.rstrip("\n") + ";\nREVOKE ALL ON FUNCTION " + SIG + " FROM PUBLIC, anon, authenticated;\nDO $$ BEGIN\n" + fn_pin(DENY_MD5, "ROLLBACK_POST") + keep + "END $$;\nCOMMIT;\n")
    return {"01-pre.sql.readonly": pre, "02-install.sql.review": inst, "03-post.sql.readonly": post, "04-rollback-deny.sql.review": rb}

# md5 LIVE de policies/ACL da tabela: capturados read-only em live-table-pins.json (gerado à parte).
if __name__ == "__main__":
    lp = json.loads((HERE / "captured" / "live-table-pins.json").read_text())
    files = build(lp["policies_md5"], lp["acl_md5"])
    for n, t in files.items(): (HERE / n).write_text(t)
    meta = {n: hashlib.md5(t.encode()).hexdigest() for n, t in files.items()}; meta["reader"] = FN_MD5
    (HERE / "generated-md5.json").write_text(json.dumps(meta, indent=2) + "\n"); print(json.dumps(meta, indent=2))
