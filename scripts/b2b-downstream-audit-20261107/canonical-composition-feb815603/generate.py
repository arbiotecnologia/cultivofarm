#!/usr/bin/env python3
"""Reconcilia planos+B4+ponte sem editar fontes históricas; somente revisão local."""
from pathlib import Path
import difflib
import hashlib
import importlib.util
import json
import re

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
PLANS = ROOT / "scripts/commercial-plans-tenant-20261108"
B4 = ROOT / "scripts/b2b-downstream-audit-20261107/b4"
BRIDGE = B4 / "fiscal-decision-20261108/service-bridge"
REF = "swzpzcwiasxmjutrmvkm"
EXPECTED = {
    PLANS / "02-install.sql.review": "cc1f6cc837e29377b6b6fa4deaa334257cdab5484025a519dfd5833b8a12cd40",
    B4 / "02-install.sql.review": "0d533f85731a782fa851868b41adf6e7f8e1bbfd729f156be7d6499ac6b6fee6",
    B4 / "b4-candidate.sql.review": "7dde7f07bca49f6d89ca995f1b6eacfdbb84b0694565e2a4121b1a7bec4dc59f",
    BRIDGE / "02-install.sql.review": "4fe6d63a8ba562367129a5abce72a1be602acb0bd597337c556286232ffc8fdf",
}
SHARED = [
    "public.b2b_payment_condition_publish(uuid,text,uuid,uuid,integer,integer,numeric,integer)",
    "public.b2b_payment_condition_retire(uuid,text,integer)",
    "public.b2b_payment_condition_assign(uuid,uuid,text,integer,boolean)",
    "public.b2b_payment_condition_config_list()",
    "public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)",
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def replace_once(text, old, new, label):
    assert text.count(old) == 1, (label, text.count(old))
    return text.replace(old, new)


def production_pins(text):
    pins = {}
    for line in text.splitlines():
        match = re.search(r"pg_get_functiondef\('([^']+)'::regprocedure\)\)<>'([0-9a-f]{32})'", line)
        if match:
            pins[match.group(1)] = match.group(2)
    assert len(pins) == 17, len(pins)
    return pins


def function_names(text):
    return set(re.findall(r"CREATE(?: OR REPLACE)? FUNCTION\s+((?:public|platform_private)\.[a-zA-Z0-9_]+)\s*\(", text, re.I))


def sql_tokens(text):
    """Remove apenas whitespace fora de strings/identificadores; tokens permanecem ordem e conteúdo."""
    return re.findall(
        r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|\$\$|\b\d+(?:\.\d+)?\b|"
        r"\b[A-Za-z_][A-Za-z0-9_$]*\b|::|:=|<=|>=|<>|!=|\|\||[^\s]",
        text,
    )


def main():
    for path, expected in EXPECTED.items():
        assert sha(path) == expected, (path, sha(path), expected)
    plan_manifest = json.loads((PLANS / "manifest.json").read_text())
    bridge_manifest = json.loads((BRIDGE / "manifest.json").read_text())
    assert plan_manifest["project_ref"] == bridge_manifest["project_ref"] == REF
    assert bridge_manifest["b4_sha256"] == EXPECTED[B4 / "b4-candidate.sql.review"]

    # Reconstrói as cinco funções a partir das capturas de produção. O diff é de
    # semântica real, não uma substituição cega de MD5.
    generator = load("canonical_plans_generator", PLANS / "generate.py")
    functions = generator.build_functions()
    by_name = {name: text for name, text in functions.items() if name in {
        "b2b_payment_condition_publish", "b2b_payment_condition_retire",
        "b2b_payment_condition_assign", "b2b_payment_condition_config_list",
        "respond_b2b_order_quote_secure",
    }}
    assert len(by_name) == 5
    diff_dir = H / "diff"
    diff_dir.mkdir(exist_ok=True)
    semantic = []
    for name, candidate in sorted(by_name.items()):
        original = generator.source(name)
        signature = next(sig for sig in SHARED if sig.split("(", 1)[0].endswith("." + name))
        source_md5 = plan_manifest["source_functions"][signature.removeprefix("public.")]
        candidate_md5 = plan_manifest["candidate_functions"][signature.removeprefix("public.")]
        assert hashlib.md5(original.encode()).hexdigest() == source_md5
        assert hashlib.md5(candidate.encode()).hexdigest() == candidate_md5
        diff = "".join(difflib.unified_diff(
            original.splitlines(True), candidate.splitlines(True),
            fromfile="production/" + name, tofile="post-plans/" + name,
        ))
        assert diff
        (diff_dir / (name + ".diff")).write_text(diff)
        semantic.append({
            "signature": signature,
            "production_md5": source_md5,
            "post_plans_md5": candidate_md5,
            "diff": "diff/" + name + ".diff",
            "decision": "KEEP_POST_PLANS_BODY_AS_B4_DEPENDENCY",
            "b4_replaces_body": False,
        })

    b4_pre = (B4 / "01-pre.sql.readonly").read_text()
    b4_install = (B4 / "02-install.sql.review").read_text()
    b4_post = (B4 / "03-post.sql.readonly").read_text()
    pins = production_pins(b4_pre)
    post_plans_pins = dict(pins)
    for row in semantic:
        signature = row["signature"]
        assert pins[signature] == row["production_md5"]
        post_plans_pins[signature] = row["post_plans_md5"]
        for label, text in (("pre", b4_pre), ("install", b4_install)):
            assert text.count(row["production_md5"]) == 1, (label, signature)
        b4_pre = replace_once(b4_pre, row["production_md5"], row["post_plans_md5"], signature)
        b4_install = replace_once(b4_install, row["production_md5"], row["post_plans_md5"], signature)
    # Nenhum outro pin de produção alterado por planos pode permanecer oculto.
    all_plan_sources = set(plan_manifest["source_functions"].values())
    remaining = sorted(all_plan_sources & set(production_pins(b4_pre).values()))
    assert not remaining, remaining
    assert set(post_plans_pins) == set(pins) and len(post_plans_pins) == 17

    # A composição física reproduz o mesmo writer de baixa com whitespace diverso.
    # Só aceita a variante medida se TODOS os tokens SQL forem idênticos; não há
    # substituição de lógica nem edição do corpo para satisfazer o PRE.
    payment_sig = "public.rpc_register_receivable_payment(uuid,jsonb)"
    capture = json.loads((ROOT / "scripts/delivery-atomic-hardening-20261030/capture/current.json").read_text())
    production_payment = next(row["body"] for row in capture["functions"] if row["name"] == "rpc_register_receivable_payment")
    payment_reference = H / "references/public.rpc_register_receivable_payment.post-composition.sql"
    composed_payment = payment_reference.read_text()
    composed_payment_md5 = hashlib.md5(composed_payment.encode()).hexdigest()
    production_payment_md5 = hashlib.md5(production_payment.encode()).hexdigest()
    assert re.fullmatch(r"[0-9a-f]{32}", production_payment_md5)
    assert payment_sig not in pins
    assert composed_payment_md5 == "2f238ac7871ed569adee240c372027eb"
    assert composed_payment_md5 != production_payment_md5
    assert sql_tokens(production_payment) == sql_tokens(composed_payment), "PAYMENT_BODY_SEMANTIC_DRIFT"
    payment_diff = "".join(difflib.unified_diff(
        production_payment.splitlines(True), composed_payment.splitlines(True),
        fromfile="production/rpc_register_receivable_payment",
        tofile="post-composition/rpc_register_receivable_payment",
    ))
    assert payment_diff, "PAYMENT_VARIANT_DIFF_MISSING"
    (diff_dir / "rpc_register_receivable_payment.diff").write_text(payment_diff)
    post_composition_pins = dict(post_plans_pins)
    post_composition_production_payment_md5 = composed_payment_md5
    for label, text in (("pre", b4_pre), ("install", b4_install)):
        assert text.count(production_payment_md5) == 1, (label, payment_sig)
    b4_pre = replace_once(b4_pre, production_payment_md5, composed_payment_md5, payment_sig)
    b4_install = replace_once(b4_install, production_payment_md5, composed_payment_md5, payment_sig)
    composition_reconciliation = {
        "signature": payment_sig,
        "production_md5": production_payment_md5,
        "post_composition_md5": composed_payment_md5,
        "reference_sha256": sha(payment_reference),
        "sql_token_sequence_identical": True,
        "diff": "diff/rpc_register_receivable_payment.diff",
        "decision": "PIN_MEASURED_COMPOSITION_BODY_WITHOUT_REWRITING_LOGIC",
    }

    plan_defs = function_names((PLANS / "02-install.sql.review").read_text())
    b4_defs = function_names((B4 / "02-install.sql.review").read_text())
    bridge_defs = function_names((BRIDGE / "02-install.sql.review").read_text())
    assert not (plan_defs & b4_defs), sorted(plan_defs & b4_defs)
    assert not (plan_defs & bridge_defs), sorted(plan_defs & bridge_defs)
    assert b4_defs & bridge_defs == {
        "platform_private.b2b_integration_actor", "platform_private.b2b_title_insert_fence",
    }

    # PRE de produção: somente verificações que valem antes de qualquer candidato.
    pre_production = (
        "-- READONLY; baseline de produção capturada, sem efeitos.\n"
        "SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';\n"
        + (PLANS / "01-pre.sql.readonly").read_text()
        + "\n-- B4 ainda exige a baseline anterior a planos neste PRE inicial.\n"
        + (B4 / "01-pre.sql.readonly").read_text()
        + "SELECT 'COMPOSED_PRODUCTION_PRE_OK' AS status;\n"
    )

    cross_post = f"""-- READONLY POST final; não certifica JWT/RLS/Storage/provedor.
SET commercial_plans.review_project_ref='{REF}';
SET b2b_fiscal_bridge.review_project_ref='{REF}';
{(PLANS / '03-post.sql.readonly').read_text()}
{(BRIDGE / '03-post.sql.readonly').read_text()}
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('platform_private.b2b_integration_dependencies()'::regprocedure)) IS DISTINCT FROM '605e722506de23bfd69c890c4123d4b6'
 THEN RAISE EXCEPTION 'COMPOSED_ALWAYS_DENY_DRIFT' USING ERRCODE='42501'; END IF;
 IF has_function_privilege('authenticated','platform_private.b2b_allocate_document(uuid)','EXECUTE')
   OR has_function_privilege('service_role','platform_private.b2b_allocate_document(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'COMPOSED_ALLOCATOR_GRANT_OPEN' USING ERRCODE='42501'; END IF;
END $guard$;
SELECT 'COMPOSED_POST_OK' AS status;
"""

    # O rollback B4 isolado contém o POST anterior à ponte e não pode ser
    # reutilizado depois que actor/fence/created_by foram reconciliados pela ponte.
    rollback = (
        "-- DENY-ONLY conjunto reverso: ponte, B4 e planos; preserva dados/histórico.\n"
        + (BRIDGE / "04-rollback-deny.sql.review").read_text()
        + "\nBEGIN;\n"
        "REVOKE EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) FROM PUBLIC,anon,authenticated;\n"
        "REVOKE EXECUTE ON FUNCTION public.rpc_receivable_money_projection_v1(uuid,integer,integer) FROM PUBLIC,anon,authenticated;\n"
        "COMMIT;\n"
        + (PLANS / "04-rollback-deny.sql.review").read_text()
        + """DO $guard$ BEGIN
 IF has_function_privilege('authenticated','public.rpc_admin_list_commercial_plans(text,text,integer,integer)','EXECUTE')
   OR has_function_privilege('service_role','platform_private.b2b_fiscal_invoice_bridge_v1(uuid)','EXECUTE')
   OR has_function_privilege('authenticated','public.generate_b2b_receivable_secure(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'COMPOSED_ROLLBACK_STILL_OPEN' USING ERRCODE='42501'; END IF;
END $guard$;
SELECT 'COMPOSED_ROLLBACK_OK' AS status;
"""
    )

    install = (
        "-- REVIEW ONLY INATIVO/NÃO APROVADO; ordem canônica planos→B4→ponte.\n"
        "SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';\n"
        + (PLANS / "02-install.sql.review").read_text()
        + (PLANS / "03-post.sql.readonly").read_text()
        + "\n-- PRE B4 reconciliado semanticamente com as cinco dependências pós-planos.\n"
        + b4_install
        + b4_post
        + "\nSET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';\n"
        + (BRIDGE / "02-install.sql.review").read_text()
        + cross_post
    )

    stages = H / "stages"
    stages.mkdir(exist_ok=True)
    outputs = {
        "01-pre.sql.readonly": pre_production,
        "02-install.sql.review": install,
        "03-post.sql.readonly": cross_post,
        "04-rollback-deny.sql.review": rollback,
        "stages/01-b4-pre-post-composition.sql.readonly": b4_pre,
        "stages/02-b4-install-post-composition.sql.review": b4_install,
        "stages/03-b4-post.sql.readonly": b4_post,
        "stages/04-bridge-install.sql.review": (BRIDGE / "02-install.sql.review").read_text(),
    }
    for name, text in outputs.items():
        path = H / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    manifest = {
        "review": "feb815603",
        "status": "INACTIVE_NOT_APPROVED",
        "canonical_ref": REF,
        "hosted": False,
        "source_sha256": {str(path.relative_to(ROOT)): expected for path, expected in EXPECTED.items()},
        "production_baseline": {
            "b4_dependency_md5": pins,
            "b4_install_sha256": EXPECTED[B4 / "02-install.sql.review"],
            "plans_install_sha256": EXPECTED[PLANS / "02-install.sql.review"],
        },
        "post_plans_baseline": {
            "plans_install_sha256": EXPECTED[PLANS / "02-install.sql.review"],
            "b4_dependency_md5": post_plans_pins,
            "overridden_dependency_count": len(SHARED),
            "unchanged_dependency_count": len(pins) - len(SHARED),
            "b4_body_sha256": EXPECTED[B4 / "b4-candidate.sql.review"],
            "bridge_install_sha256": EXPECTED[BRIDGE / "02-install.sql.review"],
        },
        "post_composition_baseline": {
            "b4_dependency_md5": post_composition_pins,
            "plans_semantic_overrides": len(SHARED),
            "whitespace_only_composition_overrides": 1,
            "harness_only_acl_restoration": {
                "signature": "public.tg_auto_b2b_receivable()",
                "required_acl": "{postgres=X/postgres,service_role=X/postgres}",
                "reason": "Disposable composition dropped captured service_role EXECUTE; restore baseline before PRE, never weaken PRE.",
                "included_in_candidate_install": False,
            },
        },
        "composition_reconciliation": composition_reconciliation,
        "overlap_analysis": {
            "plans_b4_replaced_function_names": [],
            "plans_bridge_replaced_function_names": [],
            "b4_bridge_replaced_function_names": sorted(b4_defs & bridge_defs),
            "b4_pre_dependencies_changed_by_plans": SHARED,
            "rollback_stale_if_reused_after_bridge": [
                "platform_private.b2b_integration_actor(uuid,boolean)",
                "platform_private.b2b_title_insert_fence()",
                "public.accounts_receivable.created_by NOT NULL",
                "B4 POST embedded in isolated rollback",
            ],
            "always_allow_substitution": False,
        },
        "semantic_reconciliation": semantic,
        "install_order": [
            "production PRE", "plans install+POST", "B4 PRE post-composition",
            "B4 install+POST", "bridge install+POST", "composed POST",
        ],
        "rollback_order": ["bridge deny-only", "B4 deny-only without stale POST", "plans deny-only"],
        "outputs": {name: hashlib.sha256(text.encode()).hexdigest() for name, text in outputs.items()},
    }
    (H / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    (H / "reconciliation.json").write_text(json.dumps({
        "decision": "Plans owns the five shared dependency bodies; B4 body remains byte-identical; bridge owns its two B4 replacements.",
        "semantic_reconciliation": semantic,
        "composition_reconciliation": composition_reconciliation,
        "post_composition_baseline": manifest["post_composition_baseline"],
        "overlap_analysis": manifest["overlap_analysis"],
    }, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"outputs": manifest["outputs"], "overridden_dependencies": SHARED}, indent=2))


if __name__ == "__main__":
    main()
