#!/usr/bin/env bash
# H8-B — aplicador transacional fail-closed (staging ikaauvsflpmamgxmkhoq).
# Aplica UMA migration forward e registra a versão no ledger na MESMA transação.
# Nunca imprime DSN, chaves ou segredos. Recusa produção.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FWD="${1:?uso: h8b-apply.sh <arquivo-forward.sql>}"
[ -f "$FWD" ] || { echo "ABORT: forward inexistente" >&2; exit 3; }

BASE="$(basename "$FWD" .sql)"
VERSION="${BASE%%_*}"
NAME="${BASE#*_}"
[[ "$VERSION" =~ ^[0-9]{14}$ ]] || { echo "ABORT: versao invalida" >&2; exit 3; }
[[ "$VERSION" > "20261001020000" ]] || { echo "ABORT: versao nao e posterior a H8-A" >&2; exit 3; }

"$ROOT/restoration/homologacao-h7/check-frontend-binding.sh" >/dev/null

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
{
  echo "BEGIN;"
  cat "$FWD"
  echo ";"
  printf "INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES (%s, %s, ARRAY[%s]::text[]);\n" \
    "$(printf "'%s'" "$VERSION")" "$(printf "'%s'" "$NAME")" "\$stmt\$$(cat "$FWD")\$stmt\$"
  echo "COMMIT;"
} > "$TMP"

"$ROOT/restoration/os-e2e/staging-psql.sh" -f "$TMP"
echo "H8-B APPLY: $VERSION ($NAME) aplicada e registrada no ledger."
