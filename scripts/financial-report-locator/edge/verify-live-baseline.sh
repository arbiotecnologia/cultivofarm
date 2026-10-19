#!/usr/bin/env bash
# Fail-closed: the Edge rollback source MUST be the exact LIVE v89 bytes captured by the auditor.
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"; F="$D/live-v89.index.ts"
EXPECTED=ab4d568230b779264ea3716e9a3f4c0f8463a781ac995362685aab6620f5ec60
test -f "$F" || { echo "FAIL: live-v89.index.ts ausente (capturar bytes LIVE)"; exit 1; }
GOT=$(sha256sum "$F" | cut -d' ' -f1)
[ "$GOT" = "$EXPECTED" ] || { echo "FAIL: sha $GOT != $EXPECTED"; exit 1; }
grep -q 'createSignedUrl(path, 60 \* 60)' "$F" || { echo "FAIL: live bytes sem assinatura esperada"; exit 1; }
echo "LIVE baseline OK — rollback Edge = redeploy deste arquivo"
