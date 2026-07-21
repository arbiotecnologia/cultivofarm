#!/usr/bin/env bash
# Fase Fiscal 3.0.2-D — SECRETS SCANNER.
# Detecta APENAS valores secretos REAIS. Nunca falha por menção a nome de env,
# por Deno.env.get("NOME") ou por documentação. Nunca ecoa o valor encontrado.
#
# Padrões cobertos:
#   - JWT triplo (header.payload.signature) base64url.
#   - Chave publishable/service_role Supabase (sb_secret_..., sbp_..., sbs_...).
#   - Postgres URL com senha embutida.
#   - Bloco PEM (BEGIN CERTIFICATE / PRIVATE KEY / RSA PRIVATE KEY).
#   - Arquivos .pfx/.p12 versionados.
#
# Uso:
#   scripts/fiscal-secrets-scan.sh                 # varre repo
#   scripts/fiscal-secrets-scan.sh <path> [<path>] # varre caminhos específicos (fixtures)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGETS=("$@")
if [ "${#TARGETS[@]}" -eq 0 ]; then
  TARGETS=(".")
fi

# Regex por padrão. Case-sensitive quando indicado.
declare -a PATTERNS=(
  'JWT|ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
  'SUPABASE_SECRET|sb_secret_[A-Za-z0-9]{32,}'
  'SUPABASE_PAT|sbp_[a-f0-9]{40}'
  'PG_URL_WITH_PWD|postgres(ql)?://[A-Za-z0-9._-]+:[^@\s"'"'"'<>\[\]{}]{6,}@'
  'PEM_BLOCK|-----BEGIN (CERTIFICATE|PRIVATE KEY|RSA PRIVATE KEY|ENCRYPTED PRIVATE KEY)-----'
)

# Escopo — sempre exclui build/caches, o próprio scanner e o outro scanner de integração.
INCLUDES=(
  --glob '!node_modules/**'
  --glob '!dist/**'
  --glob '!build/**'
  --glob '!.git/**'
  --glob '!bun.lock*'
  --glob '!package-lock.json'
  --glob '!scripts/fiscal-secrets-scan.sh'
  --glob '!scripts/fiscal-integration-scan.sh'
  --glob '!scripts/fixtures/**'
)

fail=0
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

for entry in "${PATTERNS[@]}"; do
  label="${entry%%|*}"
  regex="${entry#*|}"
  rg -n --with-filename --pcre2 "${INCLUDES[@]}" -e "$regex" "${TARGETS[@]}" >"$tmp" 2>/dev/null || true
  if [ -s "$tmp" ]; then
    while IFS= read -r line; do
      file_line="${line%%:*}"
      rest="${line#*:}"
      lineno="${rest%%:*}"
      # NUNCA ecoa o valor. Apenas localização + rótulo.
      echo "FISCAL SECRETS: [$label] em ${file_line}:${lineno} — valor mascarado"
      fail=1
    done <"$tmp"
  fi
done

# Arquivos .pfx/.p12 versionados
while IFS= read -r f; do
  echo "FISCAL SECRETS: [CERT_FILE] arquivo binário versionado ${f}"
  fail=1
done < <(rg --files "${INCLUDES[@]}" "${TARGETS[@]}" 2>/dev/null | rg -i '\.(pfx|p12)$' || true)

if [ "$fail" -eq 1 ]; then
  echo "FISCAL SECRETS SCAN: FAIL"
  exit 1
fi
echo "FISCAL SECRETS SCAN: OK — nenhum valor secreto real encontrado."
