#!/usr/bin/env python3
"""Gera 02b-install.sql.review a partir dos corpos LIVE capturados (md5 pinados).
Cada substituição precisa casar exatamente uma vez; qualquer drift aborta. Não acessa banco."""
import hashlib, json, pathlib, sys
H = pathlib.Path(__file__).resolve().parent
C = H / "captured"
PINS = json.loads((H / "pins.json").read_text())

def body(name):
    t = (C / f"{name}.sql").read_text()
    sig, md5 = PINS[name]
    if hashlib.md5(t.encode()).hexdigest() != md5: sys.exit(f"DRIFT {name}")
    return t

def sub(t, old, new, name):
    if t.count(old) != 1: sys.exit(f"ANCHOR {name}: {old[:60]!r} x{t.count(old)}")
    return t.replace(old, new)

DELTA = ["platform_private.b2b_own_obligations_owner", "platform_private.external_provisioning_scope", "admin_provision_user_profile_v1", "b2b_finish_provisioning", "fn_b2b_credit_exposure", "rpc_partner_message_counters"]
FIN = "'parceiro_b2b_financeiro'"
out = []
# 1. Guardião de obrigações próprias: ramo financeiro exclusivo, gestor preservado verbatim.
t = body("platform_private.b2b_own_obligations_owner")
t = sub(t, """ IF u IS NULL OR NOT platform_private.platform_actor_access_ready(u)
  OR NOT public.has_role(u,'parceiro_b2b') THEN
  RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.is_valid_b2b_partner_user(u,p_partner_id) THEN
 RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;""",
""" IF u IS NULL OR NOT platform_private.platform_actor_access_ready(u) THEN
  RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;
 -- B2B_FINANCE_ROLE_V1: gestor segue o validador canônico; financeiro externo exige papel exclusivo,
 -- vínculo papel='financeiro' vigente e parceiro derivado do servidor (nunca do argumento).
 IF public.has_role(u,'parceiro_b2b') THEN
  IF NOT public.is_valid_b2b_partner_user(u,p_partner_id) THEN
  RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;
 ELSIF p_partner_id IS NULL OR platform_private.b2b_finance_actor_partner() IS DISTINCT FROM p_partner_id THEN
  RAISE EXCEPTION 'own_finance_forbidden' USING ERRCODE='42501'; END IF;""", "owner")
out.append(t.rstrip() + ";\n")
# 2. Provisionamento: allowlist, parceiro obrigatório, exclusividade do financeiro.
t = body("platform_private.external_provisioning_scope")
t = sub(t, "r NOT IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor')) THEN RAISE EXCEPTION 'c2_invalid_roles' USING ERRCODE='22023'; END IF;",
 f"r NOT IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor',{FIN})) THEN RAISE EXCEPTION 'c2_invalid_roles' USING ERRCODE='22023'; END IF;\n IF {FIN}=ANY(p_roles) AND cardinality(p_roles)<>1 THEN RAISE EXCEPTION 'c2_finance_role_exclusive' USING ERRCODE='22023'; END IF;", "scope1")
t = sub(t, "IF NOT ('parceiro_b2b'=ANY(p_roles) OR 'parceiro_b2b_tecnico'=ANY(p_roles)) THEN",
 f"IF NOT ('parceiro_b2b'=ANY(p_roles) OR 'parceiro_b2b_tecnico'=ANY(p_roles) OR {FIN}=ANY(p_roles)) THEN", "scope2")
out.append(t.rstrip() + ";\n")
t = body("admin_provision_user_profile_v1")
t = sub(t, "WHERE r IN ('parceiro_b2b'::public.app_role, 'parceiro_b2b_tecnico'::public.app_role);",
 "WHERE r IN ('parceiro_b2b'::public.app_role, 'parceiro_b2b_tecnico'::public.app_role, 'parceiro_b2b_financeiro'::public.app_role);", "prov1")
t = sub(t, "IF p_partner_id IS NULL OR p_partner_papel NOT IN ('gestor', 'tecnico') THEN",
 "IF p_partner_id IS NULL OR p_partner_papel IS NULL OR p_partner_papel NOT IN ('gestor', 'tecnico', 'financeiro')\n       OR (('parceiro_b2b_financeiro'::public.app_role = ANY(p_roles)) IS DISTINCT FROM (p_partner_papel = 'financeiro'))\n       OR ('parceiro_b2b_financeiro'::public.app_role = ANY(p_roles) AND v_role_count <> 1) THEN", "prov2")
out.append(t.rstrip() + ";\n")
t = body("b2b_finish_provisioning")
t = sub(t, "WHEN 'parceiro_b2b'=ANY(rs) THEN 'gestor' ELSE 'tecnico' END);",
 "WHEN 'parceiro_b2b'=ANY(rs) THEN 'gestor' WHEN 'parceiro_b2b_financeiro'=ANY(rs) THEN 'financeiro' ELSE 'tecnico' END);", "finish")
out.append(t.rstrip() + ";\n")
# 5. Crédito: corpo canônico vira núcleo privado SEM a checagem de ator (mesma fórmula, byte a byte);
#    a função pública mantém assinatura/ACL e reexecuta a MESMA checagem antes de delegar.
src = body("fn_b2b_credit_exposure")
core = sub(src, "CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure(", "CREATE OR REPLACE FUNCTION platform_private.b2b_credit_exposure_core(", "core1")
core = sub(core, "  PERFORM platform_private.b2b_integration_actor(p_partner_id);\n", "", "core2")
out.append(core.rstrip() + ";\n")
hdr = src[:src.index("DECLARE")]
out.append(hdr + """BEGIN
  -- B2B_FINANCE_ROLE_V1: autorização canônica inalterada; cálculo delegado ao núcleo único.
  PERFORM platform_private.b2b_integration_actor(p_partner_id);
  RETURN platform_private.b2b_credit_exposure_core(p_partner_id, p_new_order_amount, p_exclude_order_id);
END $function$;\n""")
# 6. Contadores de mensagens: fechados ao portador do papel financeiro (antes de qualquer leitura).
t = body("rpc_partner_message_counters")
t = sub(t, "BEGIN\n  IF NOT (public.has_role(", "BEGIN\n  IF platform_private.b2b_finance_role_holder() THEN\n    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';\n  END IF;\n  IF NOT (public.has_role(", "counters")
out.append(t.rstrip() + ";\n")
tpl = (H / "02b-install.template.sql").read_text()
res = tpl.replace("-- @@CAPTURED_DELTAS@@\n", "\n".join(out))
(H / "02b-install.sql.review").write_text(res)
pins = json.dumps({k: v for k, v in PINS.items() if k in DELTA})
pre = (H / "01-pre.template.sql").read_text().replace("@@PINS@@", pins)
(H / "01-pre.sql.readonly").write_text(pre)
rb = (H / "04-rollback.template.sql").read_text().replace("-- @@CAPTURED_ORIGINALS@@\n", "".join(body(n).rstrip() + ";\n" for n in DELTA) + "DROP FUNCTION platform_private.b2b_credit_exposure_core(uuid,numeric,uuid);\n")
(H / "04-rollback.sql.review").write_text(rb)
print("OK", hashlib.sha256(res.encode()).hexdigest())
