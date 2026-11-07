#!/usr/bin/env python3
"""Gera o delta revisável do ajuste B2B a partir da captura LOCAL identificada. Sem rede/banco."""
import hashlib
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCE = ROOT / "scripts/delivery-atomic-hardening-20261030/capture/current.json"
SIG = "public.request_b2b_payment_terms_adjustment_secure(uuid,text)"
BASE_MD5 = "f9bf8f543564af480d08e7bebd111b88"
VISIBLE_MD5 = "8812508716f279a88e3d5a31b15621d8"
ACCOUNTING_GUARD_MD5 = "669b19490a7a9700f0158db4b31885ad"
CONTRACT = "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1"


def delta(src, anchor, replacement, label):
    count = src.count(anchor)
    if count != 1:
        raise SystemExit(f"{label}: âncora encontrada {count} vezes")
    return src.replace(anchor, replacement)


def source_body():
    data = json.loads(SOURCE.read_text())
    rows = [f for f in data["functions"] if f.get("signature") == "public.request_b2b_payment_terms_adjustment_secure(p_partner_order_id uuid, p_notes text)"]
    if len(rows) != 1:
        raise SystemExit("captura do ajuste ausente ou ambígua")
    body = rows[0]["body"]
    if hashlib.md5(body.encode()).hexdigest() != BASE_MD5:
        raise SystemExit("captura do ajuste divergente")
    return body


def candidate_body():
    body = source_body()
    body = delta(body, "  v_numero text;\nBEGIN\n  IF v_uid IS NULL", "  v_numero text;\n  v_origin jsonb;\nBEGIN\n  IF NOT public.b2b_phase1_order_visible(p_partner_order_id) THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;\n  IF v_uid IS NULL", "A1 escopo de entrada")
    body = delta(body, "  SELECT po.payment_terms_id, po.created_by, po.numero\n    INTO v_terms_id, v_created_by, v_numero\n  FROM public.partner_orders po\n  WHERE po.id = p_partner_order_id;\n\n  IF v_terms_id IS NULL THEN RAISE EXCEPTION 'payment_terms_not_defined'; END IF;",
                 "  SELECT po.payment_terms_id, po.created_by, po.numero, po.c2_external_origin_snapshot\n    INTO v_terms_id, v_created_by, v_numero, v_origin\n  FROM public.partner_orders po\n  WHERE po.id = p_partner_order_id\n  FOR UPDATE;\n\n  -- Revalida depois da espera pelo lock: papel/perfil/vínculo/escopo podem ter sido revogados.\n  IF NOT public.b2b_phase1_order_visible(p_partner_order_id) THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;\n  IF NOT (public.has_role(v_uid,'administrador')\n       OR public.has_role(v_uid,'financeiro')\n       OR public.has_role(v_uid,'gestor_comercial')) THEN\n    RAISE EXCEPTION 'unauthorized';\n  END IF;\n  -- O gatilho contábil protege mudanças de financial_approval_status; pending→pending também é decisão proibida.\n  IF v_origin->>'contract' = 'C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' THEN\n    RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501';\n  END IF;\n  IF v_terms_id IS NULL THEN RAISE EXCEPTION 'payment_terms_not_defined'; END IF;", "A2 lock/reautorização/contabilidade")
    return body


def assertions(expected_request, expected_visible=VISIBLE_MD5):
    return f"""DO $guard$
BEGIN
  IF md5(pg_get_functiondef('{SIG}'::regprocedure)) <> '{expected_request}' THEN
    RAISE EXCEPTION 'ADJUSTMENT_FUNCTION_PIN_DRIFT';
  END IF;
  IF md5(pg_get_functiondef('public.b2b_phase1_order_visible(uuid)'::regprocedure)) <> '{expected_visible}' THEN
    RAISE EXCEPTION 'ADJUSTMENT_SCOPE_PIN_DRIFT';
  END IF;
  IF md5(pg_get_functiondef('platform_private.c2_accounting_pending_guard()'::regprocedure)) <> '{ACCOUNTING_GUARD_MD5}' THEN
    RAISE EXCEPTION 'ACCOUNTING_GUARD_PIN_DRIFT';
  END IF;
END
$guard$;"""


def build():
    base = source_body()
    candidate = candidate_body()
    candidate_md5 = hashlib.md5(candidate.encode()).hexdigest()
    pre = f"""-- READ ONLY. Captura LOCAL de 2026-10-30; o auditor deve confrontar a fonte LIVE antes de qualquer uso.\n{assertions(BASE_MD5)}\nSELECT 'PRE_OK' AS status;\n"""
    install = f"""-- CANDIDATO INATIVO. Não aplicar sem revisão e preflight LIVE independente.\nBEGIN;\nSET LOCAL lock_timeout = '3s';\nSET LOCAL statement_timeout = '30s';\n{assertions(BASE_MD5)}\n\n{candidate};\n\nREVOKE ALL ON FUNCTION {SIG} FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION {SIG} TO authenticated, service_role;\n\n{assertions(candidate_md5)}\nCOMMIT;\n"""
    post = f"""-- READ ONLY.\n{assertions(candidate_md5)}\nDO $acl$\nBEGIN\n  IF NOT has_function_privilege('authenticated', '{SIG}', 'EXECUTE')\n     OR NOT has_function_privilege('service_role', '{SIG}', 'EXECUTE')\n     OR has_function_privilege('anon', '{SIG}', 'EXECUTE') THEN\n    RAISE EXCEPTION 'ADJUSTMENT_ACL_DRIFT';\n  END IF;\nEND\n$acl$;\nSELECT 'POST_OK' AS status;\n"""
    rollback = f"""-- ROLLBACK DENY-ONLY: não restaura o corpo que permitia pending→pending/escopo legado.\nBEGIN;\nSET LOCAL lock_timeout = '3s';\n{assertions(candidate_md5)}\nREVOKE ALL ON FUNCTION {SIG} FROM PUBLIC, anon;\nREVOKE EXECUTE ON FUNCTION {SIG} FROM authenticated;\nDO $deny$\nBEGIN\n  IF has_function_privilege('authenticated', '{SIG}', 'EXECUTE')\n     OR has_function_privilege('anon', '{SIG}', 'EXECUTE') THEN\n    RAISE EXCEPTION 'ADJUSTMENT_ROLLBACK_NOT_CLOSED';\n  END IF;\n  IF md5(pg_get_functiondef('{SIG}'::regprocedure)) <> '{candidate_md5}' THEN\n    RAISE EXCEPTION 'ADJUSTMENT_ROLLBACK_BODY_CHANGED';\n  END IF;\nEND\n$deny$;\nCOMMIT;\n"""
    return {
        "captured/public.request_b2b_payment_terms_adjustment_secure.f9bf8f54.local-20261030.sql": base + "\n",
        "candidate/public.request_b2b_payment_terms_adjustment_secure.sql.review": candidate + "\n",
        "01-pre.sql.readonly": pre,
        "02-install.sql.review": install,
        "03-post.sql.readonly": post,
        "04-rollback-deny.sql.review": rollback,
        "adjustment-pins.json": json.dumps({"source": str(SOURCE.relative_to(ROOT)), "source_md5": BASE_MD5, "scope_md5": VISIBLE_MD5, "accounting_guard_md5": ACCOUNTING_GUARD_MD5, "candidate_md5": candidate_md5, "contract": CONTRACT}, indent=2) + "\n",
    }


def main():
    files = build()
    for name, content in files.items():
        path = HERE / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    hashes = {name: hashlib.sha256(content.encode()).hexdigest() for name, content in files.items()}
    (HERE / "SHA256SUMS").write_text("".join(f"{digest}  {name}\n" for name, digest in sorted(hashes.items())))
    print(json.dumps({"generated": len(files), "candidate_md5": json.loads(files["adjustment-pins.json"])["candidate_md5"]}))


if __name__ == "__main__":
    main()
