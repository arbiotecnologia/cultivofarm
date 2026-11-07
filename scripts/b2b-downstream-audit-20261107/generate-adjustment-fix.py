#!/usr/bin/env python3
"""Gera o delta revisável do ajuste B2B a partir de capturas LOCAIS. Sem rede/banco."""
import hashlib
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCE = ROOT / "scripts/delivery-atomic-hardening-20261030/capture/current.json"
SIG = "public.request_b2b_payment_terms_adjustment_secure(uuid,text)"
REQUEST_SOURCE = "public.request_b2b_payment_terms_adjustment_secure(p_partner_order_id uuid, p_notes text)"
BASE_MD5 = "f9bf8f543564af480d08e7bebd111b88"
VISIBLE_MD5 = "8812508716f279a88e3d5a31b15621d8"
PRIVATE_VISIBLE_MD5 = "8504f07fbc3a7975accf919f386d00eb"
ROLE_MD5 = "4d90e93d521a4819d9085f28d742030f"
PRIVATE_ROLE_MD5 = "c5af5b55de6d79da9b73a33948746ae2"
ACCOUNTING_GUARD_MD5 = "669b19490a7a9700f0158db4b31885ad"
CONTRACT = "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1"
SELLER_CONTRACT = "B2B_SELLER_FINANCIAL_TEAM_V1"
HELPER_SIG = "platform_private.b2b_seller_financial_scope_error(uuid,uuid)"
HELPER_OWNER = "postgres"
HELPER_ACL = "{postgres=X/postgres}"
DECISION_SOURCES = {
    "request": {"source": REQUEST_SOURCE, "signature": SIG, "md5": BASE_MD5},
    "approve": {
        "source": "public.approve_b2b_payment_terms_secure(p_partner_order_id uuid, p_notes text)",
        "signature": "public.approve_b2b_payment_terms_secure(uuid,text)",
        "md5": "a61daa8542058bdbf239903d655c2a1b",
    },
    "reject": {
        "source": "public.reject_b2b_payment_terms_secure(p_partner_order_id uuid, p_reason text)",
        "signature": "public.reject_b2b_payment_terms_secure(uuid,text)",
        "md5": "40777d0cec6a7d8a8d4dfcb3370b08b6",
    },
}

# regprocedure -> (assinatura na captura, md5 conferido, arquivo local gerado).
DEPENDENCIES = {
    "platform_private.platform_actor_access_ready(uuid)": (
        "platform_private.platform_actor_access_ready(p_user uuid)",
        "048249c0c2106c3761e26eacb8d0de84",
        "platform_private.platform_actor_access_ready.048249c0.sql",
    ),
    "platform_private.entitlements_for_user(uuid)": (
        "platform_private.entitlements_for_user(_uid uuid)",
        "7f4ec7facaebbdf35444dd490fdebe56",
        "platform_private.entitlements_for_user.7f4ec7fa.sql",
    ),
    "platform_private.has_role(uuid,public.app_role)": (
        "platform_private.has_role(_user_id uuid, _role app_role)",
        PRIVATE_ROLE_MD5,
        "platform_private.has_role.c5af5b55.sql",
    ),
    "public.has_role(uuid,public.app_role)": (
        "public.has_role(_user_id uuid, _role app_role)",
        ROLE_MD5,
        "public.has_role.4d90e93d.sql",
    ),
    "public.is_platform_superadmin(uuid)": (
        "public.is_platform_superadmin(_user_id uuid)",
        "3dfe79d976821244d9b7a7f893d765f2",
        "public.is_platform_superadmin.3dfe79d9.sql",
    ),
    "public.is_valid_b2b_partner_user(uuid,uuid)": (
        "public.is_valid_b2b_partner_user(p_user_id uuid, p_partner_id uuid)",
        "0bb0dea04be8ca84c66db7ca6329876c",
        "public.is_valid_b2b_partner_user.0bb0dea0.sql",
    ),
    "platform_private.b2b_actor_scope(uuid)": (
        "platform_private.b2b_actor_scope(_uid uuid)",
        "c3f2997746f24bc2efd15db5c0ccc862",
        "platform_private.b2b_actor_scope.c3f29977.sql",
    ),
    "platform_private.b2b_phase1_partner_visible(uuid,boolean)": (
        "platform_private.b2b_phase1_partner_visible(p_partner uuid, p_technical boolean)",
        "915f516e605af7cc14584e2e762a2661",
        "platform_private.b2b_phase1_partner_visible.915f516e.sql",
    ),
    "public.b2b_phase1_partner_visible(uuid,boolean)": (
        "public.b2b_phase1_partner_visible(p_partner uuid, p_technical boolean)",
        "6b3defc01a66040146562c60ad224f03",
        "public.b2b_phase1_partner_visible.6b3defc0.sql",
    ),
    "platform_private.b2b_phase1_order_visible(uuid)": (
        "platform_private.b2b_phase1_order_visible(p_order uuid)",
        PRIVATE_VISIBLE_MD5,
        "platform_private.b2b_phase1_order_visible.8504f07f.sql",
    ),
    "public.b2b_phase1_order_visible(uuid)": (
        "public.b2b_phase1_order_visible(p_order uuid)",
        VISIBLE_MD5,
        "public.b2b_phase1_order_visible.88125087.sql",
    ),
    "public._saas_user_has_feature(uuid,text)": (
        "public._saas_user_has_feature(_uid uuid, _feature_key text)",
        "501dd958e117d2df8a4d38f6bcbeed04",
        "public._saas_user_has_feature.501dd958.sql",
    ),
    "public._saas_trg_require_feature()": (
        "public._saas_trg_require_feature()",
        "13ed48832f81cbb35434688ca35fda4b",
        "public._saas_trg_require_feature.13ed4883.sql",
    ),
    "platform_private.c2_accounting_pending_guard()": (
        "platform_private.c2_accounting_pending_guard()",
        ACCOUNTING_GUARD_MD5,
        "platform_private.c2_accounting_pending_guard.669b1949.sql",
    ),
}


def delta(src, anchor, replacement, label):
    count = src.count(anchor)
    if count != 1:
        raise SystemExit(f"{label}: âncora encontrada {count} vezes")
    return src.replace(anchor, replacement)


def captures():
    data = json.loads(SOURCE.read_text())
    return {f.get("signature"): f for f in data["functions"]}


def captured(source_signature, expected_md5):
    rows = captures()
    if source_signature not in rows:
        raise SystemExit(f"captura ausente: {source_signature}")
    row = rows[source_signature]
    body = row["body"]
    actual = hashlib.md5(body.encode()).hexdigest()
    if actual != expected_md5 or row.get("md5") != expected_md5:
        raise SystemExit(f"captura divergente: {source_signature}: {actual}")
    if not row.get("owner") or not row.get("acl"):
        raise SystemExit(f"owner/ACL ausentes: {source_signature}")
    return row


def source_body():
    return captured(REQUEST_SOURCE, BASE_MD5)["body"]


def candidate_body():
    body = source_body()
    body = delta(
        body,
        "BEGIN\n  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;\n  IF NOT (public.has_role(v_uid,'administrador')",
        "BEGIN\n  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;\n"
        "  IF NOT public.b2b_phase1_order_visible(p_partner_order_id) THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;\n"
        "  IF NOT (public.has_role(v_uid,'administrador')",
        "A1 Auth antes do escopo de entrada",
    )
    body = delta(
        body,
        "  SELECT po.payment_terms_id, po.created_by, po.numero\n    INTO v_terms_id, v_created_by, v_numero\n  FROM public.partner_orders po\n  WHERE po.id = p_partner_order_id;\n\n  IF v_terms_id IS NULL THEN RAISE EXCEPTION 'payment_terms_not_defined'; END IF;",
        "  SELECT po.payment_terms_id, po.created_by, po.numero, po.c2_external_origin_snapshot\n"
        "    INTO v_terms_id, v_created_by, v_numero, v_origin\n"
        "  FROM public.partner_orders po\n"
        "  WHERE po.id = p_partner_order_id\n"
        "  FOR UPDATE;\n\n"
        "  -- Pedido ausente, estrangeiro ou removido durante a espera segue a mesma negação, sem oráculo.\n"
        "  IF NOT FOUND THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;\n"
        "  -- Revalida depois da espera pelo lock: papel/perfil/vínculo/escopo podem ter sido revogados.\n"
        "  IF NOT public.b2b_phase1_order_visible(p_partner_order_id) THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;\n"
        "  IF NOT (public.has_role(v_uid,'administrador')\n"
        "       OR public.has_role(v_uid,'financeiro')\n"
        "       OR public.has_role(v_uid,'gestor_comercial')) THEN\n"
        "    RAISE EXCEPTION 'unauthorized';\n"
        "  END IF;\n"
        "  -- O gatilho contábil protege mudanças de financial_approval_status; pending→pending também é decisão proibida.\n"
        "  IF v_origin->>'contract' = 'C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' THEN\n"
        "    RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501';\n"
        "  END IF;\n"
        "  IF v_terms_id IS NULL THEN RAISE EXCEPTION 'payment_terms_not_defined'; END IF;",
        "A2 lock/missing/reautorização/contabilidade",
    )
    body = delta(body, "  v_numero text;\nBEGIN", "  v_numero text;\n  v_origin jsonb;\nBEGIN", "A0 snapshot de origem")
    return body


def decision_candidate_body(kind):
    """Approve/reject reutilizam o mesmo escopo canônico, lock e reautorização."""
    if kind not in ("approve", "reject"):
        raise SystemExit(f"decisão desconhecida: {kind}")
    meta = DECISION_SOURCES[kind]
    body = captured(meta["source"], meta["md5"])["body"]
    body = delta(body, "  v_numero text;\nBEGIN", "  v_numero text;\n  v_origin jsonb;\nBEGIN", kind + " snapshot de origem")
    body = delta(
        body,
        "  SELECT po.payment_terms_id, po.created_by, po.numero\n    INTO v_terms_id, v_created_by, v_numero\n  FROM public.partner_orders po\n  WHERE po.id = p_partner_order_id;\n\n  IF v_terms_id IS NULL THEN\n    RAISE EXCEPTION 'payment_terms_not_defined';\n  END IF;",
        "  SELECT po.payment_terms_id, po.created_by, po.numero, po.c2_external_origin_snapshot\n"
        "    INTO v_terms_id, v_created_by, v_numero, v_origin\n"
        "  FROM public.partner_orders po\n"
        "  WHERE po.id = p_partner_order_id\n"
        "  FOR UPDATE;\n\n"
        "  -- Ausência/estrangeiro/ausência após espera compartilham a mesma negação.\n"
        "  IF NOT FOUND THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;\n"
        "  -- Papel, perfil, vínculo, escopo e feature são revalidados depois do lock.\n"
        "  IF NOT public.b2b_phase1_order_visible(p_partner_order_id) THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;\n"
        "  IF NOT (public.has_role(v_uid,'administrador')\n"
        "       OR public.has_role(v_uid,'financeiro')\n"
        "       OR public.has_role(v_uid,'gestor_comercial')) THEN\n"
        "    RAISE EXCEPTION 'unauthorized';\n"
        "  END IF;\n"
        "  -- Nenhuma decisão avança enquanto a conciliação contábil estiver pendente.\n"
        "  IF v_origin->>'contract' = 'C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' THEN\n"
        "    RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501';\n"
        "  END IF;\n"
        "  IF v_terms_id IS NULL THEN RAISE EXCEPTION 'payment_terms_not_defined'; END IF;",
        kind + " lock/reautorização/contabilidade",
    )
    return body


def acl_entries(acl):
    """Converte a ACL capturada em entradas canônicas de aclexplode."""
    if not (acl.startswith("{") and acl.endswith("}")):
        raise SystemExit(f"ACL inválida: {acl}")
    result = []
    for raw in acl[1:-1].split(","):
        grantee, right = raw.split("=", 1)
        privilege, grantor = right.split("/", 1)
        grantable = privilege.endswith("*")
        privilege = privilege.rstrip("*")
        privilege = {"X": "EXECUTE"}.get(privilege, privilege)
        result.append({
            "grantee": grantee or "PUBLIC",
            "privilege": privilege,
            "grantable": grantable,
            "grantor": grantor,
        })
    return sorted(result, key=lambda x: (x["grantee"], x["privilege"], x["grantor"]))


def acl_md5(acl):
    lines = [
        f"{x['grantee']}={x['privilege']}{'*' if x['grantable'] else ''}/{x['grantor']}"
        for x in acl_entries(acl)
    ]
    return hashlib.md5("|".join(lines).encode()).hexdigest()


def assertions(expected_writers):
    rows = []
    for kind, meta in DECISION_SOURCES.items():
        row = captured(meta["source"], meta["md5"])
        rows.append((meta["signature"], expected_writers[kind], row["owner"], acl_md5(row["acl"])))
    for reg, (source_signature, md5, _) in DEPENDENCIES.items():
        row = captured(source_signature, md5)
        rows.append((reg, md5, row["owner"], acl_md5(row["acl"])))
    values = ",\n    ".join(
        f"('{sig}', '{body_md5}', '{owner}', '{acl_digest}')"
        for sig, body_md5, owner, acl_digest in rows
    )
    return f"""DO $guard$
DECLARE d record;
BEGIN
  FOR d IN SELECT * FROM (VALUES
    {values}
  ) AS x(sig, body_md5, owner, acl_md5)
  LOOP
    IF to_regprocedure(d.sig) IS NULL THEN
      RAISE EXCEPTION 'ADJUSTMENT_DEPENDENCY_MISSING: %', d.sig;
    END IF;
    IF md5(pg_get_functiondef(d.sig::regprocedure)) IS DISTINCT FROM d.body_md5 THEN
      IF d.sig IN ('{SIG}', '{DECISION_SOURCES["approve"]["signature"]}', '{DECISION_SOURCES["reject"]["signature"]}') THEN
        RAISE EXCEPTION 'ADJUSTMENT_FUNCTION_PIN_DRIFT';
      END IF;
      RAISE EXCEPTION 'ADJUSTMENT_DEPENDENCY_PIN_DRIFT: %', d.sig;
    END IF;
    IF (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid=d.sig::regprocedure) IS DISTINCT FROM d.owner THEN
      RAISE EXCEPTION 'ADJUSTMENT_OWNER_DRIFT: %', d.sig;
    END IF;
    IF (
      SELECT md5(string_agg(v.entry, '|' ORDER BY v.entry))
      FROM (
        SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
          || '=' || a.privilege_type || CASE WHEN a.is_grantable THEN '*' ELSE '' END
          || '/' || a.grantor::regrole::text AS entry
        FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f',p.proowner))) a
        WHERE p.oid=d.sig::regprocedure
      ) v
    ) IS DISTINCT FROM d.acl_md5 THEN
      RAISE EXCEPTION 'ADJUSTMENT_ACL_DRIFT: %', d.sig;
    END IF;
  END LOOP;
END
$guard$;"""


def build():
    candidates = {
        "request": candidate_body(),
        "approve": decision_candidate_body("approve"),
        "reject": decision_candidate_body("reject"),
    }
    candidate_md5s = {kind: hashlib.md5(body.encode()).hexdigest() for kind, body in candidates.items()}
    baseline_md5s = {kind: meta["md5"] for kind, meta in DECISION_SOURCES.items()}
    pre = (
        "-- READ ONLY. Capturas LOCAIS; o auditor deve confrontar corpos, owners e ACLs LIVE antes de qualquer uso.\n"
        f"{assertions(baseline_md5s)}\nSELECT 'PRE_OK' AS status;\n"
    )
    candidate_sql = "\n\n".join(candidates[kind] + ";" for kind in ("request", "approve", "reject"))
    install = f"""-- CANDIDATO INATIVO. Não aplicar sem revisão e preflight LIVE independente.
-- CREATE OR REPLACE preserva owner/ACL; nenhuma concessão de privilégio é executada.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
{assertions(baseline_md5s)}

{candidate_sql}

{assertions(candidate_md5s)}
COMMIT;
"""
    post = f"""-- READ ONLY. Confere corpo, owner e ACL dos writers e de wrappers/núcleos privados.
{assertions(candidate_md5s)}
SELECT 'POST_OK' AS status;
"""
    revokes = "\n".join(
        f"REVOKE ALL ON FUNCTION {meta['signature']} FROM PUBLIC, anon;\nREVOKE EXECUTE ON FUNCTION {meta['signature']} FROM authenticated;"
        for meta in DECISION_SOURCES.values()
    )
    deny_conditions = "\n  ".join(
        f"IF has_function_privilege('authenticated', '{meta['signature']}', 'EXECUTE') OR has_function_privilege('anon', '{meta['signature']}', 'EXECUTE') OR NOT has_function_privilege('service_role', '{meta['signature']}', 'EXECUTE') THEN RAISE EXCEPTION 'ADJUSTMENT_ROLLBACK_NOT_CLOSED'; END IF;\n"
        f"  IF md5(pg_get_functiondef('{meta['signature']}'::regprocedure)) <> '{candidate_md5s[kind]}' THEN RAISE EXCEPTION 'ADJUSTMENT_ROLLBACK_BODY_CHANGED'; END IF;"
        for kind, meta in DECISION_SOURCES.items()
    )
    rollback = f"""-- ROLLBACK DENY-ONLY: não restaura corpos sem lock/reautorização/contabilidade.
BEGIN;
SET LOCAL lock_timeout = '3s';
{assertions(candidate_md5s)}
{revokes}
DO $deny$
BEGIN
  {deny_conditions}
END
$deny$;
COMMIT;
"""
    files = {
        "captured/public.request_b2b_payment_terms_adjustment_secure.f9bf8f54.local-20261030.sql": source_body() + "\n",
        "candidate/public.request_b2b_payment_terms_adjustment_secure.sql.review": candidates["request"] + "\n",
        "01-pre.sql.readonly": pre,
        "02-install.sql.review": install,
        "03-post.sql.readonly": post,
        "04-rollback-deny.sql.review": rollback,
    }
    for kind in ("approve", "reject"):
        meta = DECISION_SOURCES[kind]
        name = meta["signature"].split("(")[0]
        files[f"captured/{name}.{meta['md5'][:8]}.local-20261030.sql"] = captured(meta["source"], meta["md5"])["body"] + "\n"
        files[f"candidate/{name}.sql.review"] = candidates[kind] + "\n"
    dependencies = {}
    for reg, (source_signature, md5, filename) in DEPENDENCIES.items():
        row = captured(source_signature, md5)
        capture_name = f"captured/auth-scoping/{filename}"
        files[capture_name] = row["body"] + "\n"
        dependencies[reg] = {
            "source_signature": source_signature,
            "md5": md5,
            "owner": row["owner"],
            "acl": row["acl"],
            "acl_md5": acl_md5(row["acl"]),
            "capture": capture_name,
        }
    files["adjustment-pins.json"] = json.dumps({
        "review": "31430566",
        "status": "INACTIVE_NOT_APPROVED",
        "source": str(SOURCE.relative_to(ROOT)),
        "source_md5": BASE_MD5,
        "request_owner": captured(REQUEST_SOURCE, BASE_MD5)["owner"],
        "request_acl": captured(REQUEST_SOURCE, BASE_MD5)["acl"],
        "scope_md5": VISIBLE_MD5,
        "private_scope_md5": PRIVATE_VISIBLE_MD5,
        "role_md5": ROLE_MD5,
        "private_role_md5": PRIVATE_ROLE_MD5,
        "accounting_guard_md5": ACCOUNTING_GUARD_MD5,
        "candidate_md5": candidate_md5s["request"],
        "decision_candidates": {
            kind: {"signature": DECISION_SOURCES[kind]["signature"], "baseline_md5": baseline_md5s[kind], "candidate_md5": candidate_md5s[kind],
                   "owner": captured(DECISION_SOURCES[kind]["source"], baseline_md5s[kind])["owner"],
                   "acl": captured(DECISION_SOURCES[kind]["source"], baseline_md5s[kind])["acl"]}
            for kind in DECISION_SOURCES
        },
        "contract": CONTRACT,
        "temporary_pin_substitution": False,
        "dependencies": dependencies,
    }, indent=2) + "\n"
    return files


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
