#!/usr/bin/env bash
# Fase Fiscal 3.0.2-D — INTEGRATION SCANNER.
# Detecta integração fiscal PREMATURA em código de runtime: imports de SDKs
# fiscais, URLs de provedores/SEFAZ e chamadas fetch para esses hosts.
# Ignora docs/, restoration/, e src/test/. Não falha por menção a nome de env.
# Nunca ecoa valor sensível.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGETS=("$@")
if [ "${#TARGETS[@]}" -eq 0 ]; then
  TARGETS=("src" "supabase/functions")
fi

declare -a PATTERNS=(
  'FOCUS_HOST|\bapi\.focusnfe\.com\b'
  'FOCUS_SDK|from ["'\'']focus-nfe(-node)?["'\'']|require\(["'\'']focus-nfe(-node)?["'\'']\)'
  'SEFAZ_HOST|\bnfe\.sefaz\.[a-z.]+\b|\bhomologacao\.sefaz\b|\bnfe\.fazenda\.[a-z.]+\b'
  'NFSE_NACIONAL|\bnfse\.gov\.br\b|\badn\.nfse\.gov\.br\b'
  'PLUGNOTAS|\bapi\.plugnotas\.com\.br\b'
  'PROVIDER_FETCH|fetch\([^)]*["'\'']https?://[^"'\'']*(focusnfe|nfse\.gov|sefaz|plugnotas)'
)

INCLUDES=(
  --glob '!node_modules/**'
  --glob '!dist/**'
  --glob '!build/**'
  --glob '!.git/**'
  --glob '!docs/**'
  --glob '!restoration/**'
  --glob '!src/test/**'
  --glob '!scripts/fiscal-integration-scan.sh'
  --glob '!scripts/fiscal-secrets-scan.sh'
  --glob '!scripts/fixtures/**'
)

# H7-4 — allowlist ESTRITA para o label SEFAZ_HOST.
# Estes dois arquivos declaram hosts oficiais como DADO ESTÁTICO auditável:
#   - sefazEndpoints.ts: registro versionado + blocklist de produção (guard duro);
#   - xsd/manifest.json: proveniência do pacote oficial de schemas (metadado).
# Nenhum deles pode conter transporte; isso é verificado logo abaixo.
SEFAZ_HOST_ALLOWLIST=(
  'supabase/functions/_shared/fiscal/sefazEndpoints.ts'
  'supabase/functions/fiscal-xml-engine/xsd/manifest.json'
)

is_allowlisted() { # $1=label $2=file
  [ "$1" = "SEFAZ_HOST" ] || return 1
  local f
  for f in "${SEFAZ_HOST_ALLOWLIST[@]}"; do [ "$2" = "$f" ] && return 0; done
  return 1
}

fail=0
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

# Arquivos allowlisted não podem executar transporte de rede.
for f in "${SEFAZ_HOST_ALLOWLIST[@]}"; do
  if [ -f "$f" ] && rg -q --pcre2 '\b(fetch|XMLHttpRequest|axios|Deno\.connect)\s*\(' "$f"; then
    echo "FISCAL INTEGRATION: [ALLOWLIST_VIOLATION] em ${f} — arquivo declarativo contém transporte"
    fail=1
  fi
done

for entry in "${PATTERNS[@]}"; do
  label="${entry%%|*}"
  regex="${entry#*|}"
  rg -n --with-filename --pcre2 -i "${INCLUDES[@]}" -e "$regex" "${TARGETS[@]}" >"$tmp" 2>/dev/null || true
  if [ -s "$tmp" ]; then
    while IFS= read -r line; do
      file_line="${line%%:*}"
      rest="${line#*:}"
      lineno="${rest%%:*}"
      if is_allowlisted "$label" "$file_line"; then continue; fi
      echo "FISCAL INTEGRATION: [$label] em ${file_line}:${lineno} — valor mascarado"
      fail=1
    done <"$tmp"
  fi
done


if [ "$fail" -eq 1 ]; then
  echo "FISCAL INTEGRATION SCAN: FAIL — integração fiscal prematura detectada em runtime."
  exit 1
fi
echo "FISCAL INTEGRATION SCAN: OK — nenhum indicador de emissão fiscal em runtime."
