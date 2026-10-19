#!/usr/bin/env bash
# Frontend rollback: restores exact bytes of published d58c1730 (runtime probe + tests) and removes the test adapter.
# Run BEFORE rollback.sql.review (frontend without the RPC pauses; never the reverse order in production).
set -euo pipefail
cd "$(dirname "$0")/../.."
B=scripts/monitor-single-rtt-probe/baseline
while read -r _ f; do cp "$B/$f" "$f"; done < scripts/monitor-single-rtt-probe/SHA256SUMS.baseline
rm -f src/test/config/helpers/internalActorContextAdapter.ts
rmdir src/test/config/helpers 2>/dev/null || true
sha256sum -c scripts/monitor-single-rtt-probe/SHA256SUMS.baseline
