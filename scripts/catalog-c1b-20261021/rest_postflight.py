"""Run only AFTER independently approved migration, using existing A/B sessions.
No login, session mutation, DDL/DML, retries, redirects or credential output.
Set C1B_REST_URL (exact canonical URL), C1B_ANON_KEY, C1B_A_JWT,
C1B_B_JWT, C1B_A_PARTNER_ID, C1B_B_PARTNER_ID and C1B_REST_CASES_FILE.
Cases JSON: [{"actor":"A|B","rpc":"...","args":{...},"status":200|403,
"present":[{"id":"...","tipo":"produto|microrganismo"}], "absent":[...]}].
Use actual known A/B visible/hidden/inactive records. Never export JWTs in cases.
"""
import json, os, urllib.request, urllib.error
CANONICAL = "https://swzpzcwiasxmjutrmvkm.supabase.co"
def main():
    if os.environ.get("C1B_REST_URL") != CANONICAL:
        raise SystemExit("FAIL_CLOSED_CANONICAL_TARGET")
    key = os.environ["C1B_ANON_KEY"]
    jwt = {a: os.environ[f"C1B_{a}_JWT"] for a in ["A", "B"]}
    partners = {a: os.environ[f"C1B_{a}_PARTNER_ID"] for a in ["A", "B"]}
    if not key or not all(jwt.values()) or not all(partners.values()):
        raise SystemExit("FAIL_CLOSED_MISSING_INPUT")
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs): return None
    opener = urllib.request.build_opener(NoRedirect())
    def call(actor, rpc, args):
        request = urllib.request.Request(f"{CANONICAL}/rest/v1/rpc/{rpc}",
            data=json.dumps(args).encode(), headers={"apikey":key, "Authorization":f"Bearer {jwt[actor]}",
            "Content-Type":"application/json", "Cache-Control":"no-store"}, method="POST")
        try:
            with opener.open(request, timeout=15) as result:
                data = result.read(2 * 1024 * 1024 + 1)
                assert len(data) <= 2 * 1024 * 1024, "RESPONSE_LIMIT"
                return result.status, json.loads(data)
        except urllib.error.HTTPError as error:
            return error.code, {"code": json.loads(error.read(8192)).get("code")}
    # Every overload argument set is exercised over REST, not SQL.
    for actor in ["A", "B"]:
        for rpc, args in [
            ("get_partner_catalog_secure", {"p_partner_id":partners[actor]}),
            ("get_partner_catalog_secure", {"p_partner_id":partners[actor], "p_catalog_v2":True}),
            ("get_partner_catalog_tecnico_secure", {}),
            ("get_partner_catalog_tecnico_secure", {"p_catalog_v2":True}),
        ]:
            status, body = call(actor, rpc, args)
            assert status in [200, 403], "REST_OVERLOAD_OR_AUTH_FAILURE"
            assert not isinstance(body, dict) or body.get("code") not in ["PGRST202", "PGRST203"], "REST_RESOLUTION_FAILED"
            if status == 200:
                assert isinstance(body, list), "TABLE_CONTRACT"
                if "p_catalog_v2" in args:
                    assert all(r.get("catalog_contract") == "C1B_DUAL_TENANT_V1" and isinstance(r.get("ficha_conteudo"),dict) for r in body), "V2_CONTRACT"
    cases = json.load(open(os.environ["C1B_REST_CASES_FILE"]))
    assert cases and {c["actor"] for c in cases} == {"A", "B"}, "MISSING_A_B_CASES"
    assert any(c.get("present") for c in cases) and any(c.get("absent") for c in cases), "MISSING_POSITIVE_HIDDEN_CASES"
    for case in cases:
        assert case["rpc"] in ["get_partner_catalog_secure", "get_partner_catalog_tecnico_secure"], "RPC_ALLOWLIST"
        status, body = call(case["actor"], case["rpc"], case["args"])
        assert status == case["status"], "REAL_CASE_STATUS"
        if status == 200:
            identities = {(r["item_id"],r["item_tipo"]) for r in body}
            assert all((r["id"],r["tipo"]) in identities for r in case.get("present",[])), "VISIBLE_MISSING"
            assert all((r["id"],r["tipo"]) not in identities for r in case.get("absent",[])), "HIDDEN_LEAK"
            if case.get("finance_null"):
                assert all(all(r.get(k) is None for k in ["valor_dose_brl","valor_litro_brl","valor_ha_brl"]) for r in body), "TECHNICAL_FINANCE_LEAK"
    print(json.dumps({"rest":"PASS", "cases":len(cases), "target":"canonical", "credentials_output":False}))
if __name__ == "__main__": main()