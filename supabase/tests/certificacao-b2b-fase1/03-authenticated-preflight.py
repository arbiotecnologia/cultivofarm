"""Read-only canonical Auth/RLS preflight. Never fabricates claims or stores tokens.

Fixtures must not start until Auth Admin and a proven ID-scoped cleanup exist.
Secrets are consumed only from process environment. Output contains counts/statuses.
"""
import json
import os
import pathlib
import urllib.error
import urllib.request
from datetime import datetime, timezone

REF = "swzpzcwiasxmjutrmvkm"
URL = f"https://{REF}.supabase.co"
ROLES = ("administrador", "financeiro", "gestor_comercial", "parceiro_b2b", "parceiro_b2b_tecnico")


def request(path, key, token=None):
    headers = {"apikey": key}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(URL + path, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, None
    except (OSError, ValueError):
        return 0, None


def main():
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = pathlib.Path(os.environ.get("B2B_EVIDENCE_DIR", "/tmp/browser/b2b-e2e-20261007"))
    output.mkdir(parents=True, exist_ok=True)
    manifest = {"run_id": run_id, "prefix": "CERT_B2B_E2E_" + run_id,
                "project_ref": REF, "created_ids": {}, "auth_created_ids": [], "storage_paths": [],
                "mutations_started": False, "results": []}
    configured = os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    if configured != URL or not key:
        raise SystemExit("BLOCKED: canonical binding absent or divergent")

    admin_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    admin_status = None
    if admin_key:
        # Opaque sb_secret_ keys are apikey only, never Bearer opaque secrets.
        admin_status, _ = request("/auth/v1/admin/users?page=1&per_page=1", admin_key,
                                  None if admin_key.startswith("sb_secret_") else admin_key)
    manifest["admin_api_available"] = admin_status == 200
    manifest["admin_api_http"] = admin_status
    valid_sessions = 0
    for scenario in ("A", "B", "C"):
        for role in ROLES:
            token = os.environ.get(f"CERT_B2B_{scenario}_{role.upper()}_TOKEN")
            if not token:
                manifest["results"].append({"scenario": scenario, "role": role, "status": "BLOCKED", "reason": "valid_session_absent"})
                continue
            status, actor = request("/auth/v1/user", key, token)
            if status != 200 or not isinstance(actor, dict) or not actor.get("id"):
                manifest["results"].append({"scenario": scenario, "role": role, "status": "BLOCKED", "reason": "auth_validation_failed", "http": status})
                continue
            valid_sessions += 1
            for table in ("partner_orders", "partner_simulations", "partner_order_financial_links"):
                code, rows = request(f"/rest/v1/{table}?select=id&limit=1", key, token)
                manifest["results"].append({"scenario": scenario, "role": role, "table": table,
                                            "status": "OBSERVED", "http": code,
                                            "row_count": len(rows) if isinstance(rows, list) else None})
    # Public negative probes are not counted as authenticated RLS proofs.
    for table in ("partner_orders", "partner_simulations", "partner_order_financial_links", "accounts_receivable"):
        status, rows = request(f"/rest/v1/{table}?select=id&limit=1", key)
        denied = status in (401, 403) or (status == 200 and rows == [])
        manifest["results"].append({"scenario": "anonymous", "table": table,
                                    "status": "PASS" if denied else "FAIL", "http": status})
    manifest["valid_session_count"] = valid_sessions
    manifest["decision"] = "NO-GO"
    manifest["blockers"] = ["full_authenticated_flow_not_executed", "id_scoped_cleanup_not_proven"]
    if not manifest["admin_api_available"]:
        manifest["blockers"].append("server_side_auth_admin_unavailable")
    if valid_sessions == 0:
        manifest["blockers"].append("real_actor_sessions_unavailable")
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps({"run_id": run_id, "decision": manifest["decision"],
                      "valid_session_count": valid_sessions, "mutations_started": False,
                      "anonymous_results": [r for r in manifest["results"] if r["scenario"] == "anonymous"]}))


if __name__ == "__main__":
    main()