#!/usr/bin/env python3
"""Reconcilia a captura autorizada de 09/11 19:52 sem consultar nem escrever no hosted."""
import hashlib
import json
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[4]
REF = "swzpzcwiasxmjutrmvkm"
REV2 = ROOT / "scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/production-rollout-posplans-20261108-condition-contract-required/rev2-coherence-20261109"
ATTEMPT37 = REV2 / "evidence/attempt-37/hook-results.json"
SELLER91 = REV2 / "seller-respond-fix-20261109/respond.candidate.sql"
CANONICAL = ROOT / "scripts/delivery-atomic-hardening-20261030/capture/current.json"
LOGISTICS = REV2 / "live-exact-7/capture-23-20261109.json"
EXPECTED = {
    "public.generate_b2b_receivable_secure(uuid)": "c49cc7ccedbcb28cba9b816b7e47c521",
    "public.generate_b2b_receivable_secure_impl(uuid)": "1bdac7fae6d702fb42d3a30539e9c9c3",
    "public.tg_auto_b2b_receivable()": "0f679538fe394924b140e54938a3bb9e",
    "public.tg_b2b_block_receivable_before_approval()": "9d559f2f04613704467cb488de0d842f",
    "public.cancel_b2b_receivable_secure(uuid,text)": "9935ddb807b0b3da89dfb7d18fea267e",
    "platform_private.b2b_resale_delivery_order_valid_v1(entregas)": "bd76345c3bceaa5e6203013920427df4",
    "platform_private.b2b_resale_delivery_status_transition_valid_v1(partner_orders,partner_orders)": "72d5d18157ffd837b89245bad19fc17e",
    "public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)": "97bcdb9884b54adb3bd4aae4915e32d0",
}


def md5(text):
    return hashlib.md5(text.encode()).hexdigest()


def main():
    old = json.loads(ATTEMPT37.read_text())["used_md5_mirror"]
    assert len(old) == 101
    seller = SELLER91.read_text()
    assert md5(seller) == EXPECTED["public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)"]
    pins = dict(old)
    pins["respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)"] = EXPECTED["public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)"]
    canonical = json.loads(CANONICAL.read_text())["functions"]
    logistics = json.loads(LOGISTICS.read_text())
    functions = []
    for sig in [
        "platform_private.b2b_resale_delivery_order_valid_v1(entregas)",
        "platform_private.b2b_resale_delivery_status_transition_valid_v1(partner_orders,partner_orders)",
    ]:
        row = next(x for x in logistics if x["signature"] == sig)
        assert md5(row["definition"]) == EXPECTED[sig] == row["md5"]
        name, args = sig.split("(", 1)
        schema, proname = name.split(".")
        functions.append({"schema": schema, "proname": proname, "args": args[:-1], "definition": row["definition"],
                          "definition_md5": row["md5"], "owner": "postgres", "acl": row["acl"],
                          "prosecdef": "SECURITY DEFINER" in row["definition"],
                          "proconfig": ['search_path=""']})
    for sig in [
        "public.cancel_b2b_receivable_secure(uuid,text)",
        "public.generate_b2b_receivable_secure(uuid)",
        "public.generate_b2b_receivable_secure_impl(uuid)",
        "public.tg_auto_b2b_receivable()",
        "public.tg_b2b_block_receivable_before_approval()",
    ]:
        name = sig.split("(", 1)[0].split(".")[1]
        row = next(x for x in canonical if x["name"] == name)
        assert md5(row["body"]) == EXPECTED[sig] == row["md5"]
        functions.append({"schema": row["schema"], "proname": row["name"], "args": sig.split("(", 1)[1][:-1],
                          "definition": row["body"], "definition_md5": row["md5"], "owner": row["owner"], "acl": row["acl"],
                          "prosecdef": "SECURITY DEFINER" in row["body"],
                          "proconfig": ['search_path=""'] if "SET search_path TO ''" in row["body"] else ["search_path=public"]})
    functions.append({
        "schema": "public", "proname": "respond_b2b_order_quote_secure", "args": "uuid,jsonb,date,integer,text",
        "definition": seller, "definition_md5": md5(seller), "owner": "postgres",
        "acl": "{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}",
        "prosecdef": True, "proconfig": ["search_path=public"],
    })
    capture = {
        "kind": "AUDITOR_CAPTURE_RECONCILED_FROM_EXACT_LOCAL_SOURCES_NOT_A_NEW_HOSTED_READ",
        "captured_at_reported": "2026-11-09T19:52:00Z",
        "project_ref": REF,
        "source": {"read_performed_by_agent": False, "hosted_read_performed": False, "basis": "capturas locais canônicas e relato/captura fornecidos pelo auditor"},
        "source_note": "Oito corpos byte-identicos as fontes canonicas e MD5 confirmados pelo auditor; 101 pins da attempt37 com Seller91 substituido pelo corpo instalado. Nenhuma consulta hosted nesta geracao.",
        "functions": functions,
        "pins": [{"sig": ("public." + k if "." not in k.split("(", 1)[0] else k), "definition_md5": v}
                 for k, v in sorted(pins.items())],
        "seller91_executed_body": "respond.candidate.sql",
        "seller91_executed_body_sha256": hashlib.sha256(SELLER91.read_bytes()).hexdigest(),
        "previous_attempt37_sha256": hashlib.sha256(ATTEMPT37.read_bytes()).hexdigest(),
    }
    assert len(capture["pins"]) == 101
    (H / "capture-current.json").write_text(json.dumps(capture, indent=2, ensure_ascii=False) + "\n")
    (H / "respond.seller91.sql").write_text(seller)
    print(json.dumps({"functions": len(functions), "pins": len(capture["pins"]),
                      "capture_sha256": hashlib.sha256((H / "capture-current.json").read_bytes()).hexdigest()}, indent=2))


if __name__ == "__main__":
    main()
