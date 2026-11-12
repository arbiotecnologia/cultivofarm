#!/usr/bin/env bash
set -euo pipefail
H=scripts/b2b-cancellation-policy-20261112
OUT="$H/evidence/suite-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"
python3 "$H/generate.py" > "$OUT/generate.log" 2>&1
bash "$H/prepare_mirror.sh" "$OUT/restore" > "$OUT/restore.log" 2>&1
python3 "$H/test_deterministic.py" > "$OUT/deterministic.log" 2>&1
python3 "$H/test_roundtrip.py" > "$OUT/roundtrip.log" 2>&1
python3 "$H/test_integration.py" > "$OUT/integration.log" 2>&1
bun run test -- src/test/fiscal/cancellationPolicyCandidate.ui.test.tsx src/test/fiscal/eligibilityDiagnostic.test.ts src/test/fiscal/eligibilityEconomicDiagnosis.ui.test.tsx > "$OUT/ui.log" 2>&1
printf '0\n' > "$OUT/exitcode"
echo "$OUT"