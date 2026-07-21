#!/usr/bin/env bash
# Fase Fiscal 3.0.1 — scanner de segurança fiscal ampliado.
# Falha se algum indicador de emissão externa/segredo fiscal aparecer no repo.
# Saída mascarada — nunca ecoa o valor sensível encontrado.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Padrões proibidos (case-insensitive) — nome de env / provider / segredo.
PATTERNS=(
  'FOCUS_TOKEN'
  'FOCUS_[A-Z_]+'
  'PLUGNOTAS_[A-Z_]+'
  'NFSE_TOKEN'
  'SEFAZ_TOKEN'
  'CERT_PASSWORD'
  'CERTIFICATE_PASSWORD'
  'SUPABASE_ACCESS_TOKEN'
  'SUPABASE_SERVICE_ROLE_KEY'
  'SERVICE_ROLE_KEY'
  'JWT_SECRET'
  'DATABASE_URL'
  'DB_PASSWORD'
  'PRIVATE_KEY'
  'CLIENT_SECRET'
  '\.pfx'
  '\.p12'
  'focusnfe\.com'
  'nfse\.gov\.br'
  'homologacao\.sefaz'
)

# Escopo: TODO o repo, exceto build/caches. docs/, restoration/ e src/test/
# NÃO são mais excluídos em bloco. Termos documentais legítimos passam por allowlist.
INCLUDES=(
  --glob '!node_modules/**'
  --glob '!dist/**'
  --glob '!build/**'
  --glob '!.git/**'
  --glob '!bun.lockb'
  --glob '!bun.lock'
  --glob '!package-lock.json'
  --glob '!scripts/fiscal-security-scan.sh'
)

# Allowlist: linhas contendo qualquer um destes tokens documentais são
# ignoradas mesmo que casem com PATTERNS. Mantém docs/relatórios que
# citam nomes de env como proibidos.
ALLOWLIST_REGEX='(proibid|forbidden|allowlist|NUNCA|MUST NOT|not applicable|documental|mencion|placeholder|EXAMPLE|<VALOR>|<PATH>|substitu|redacted|REDACTED)'

fail=0
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

for p in "${PATTERNS[@]}"; do
  rg -n -i "${INCLUDES[@]}" -- "$p" . >"$tmp" 2>/dev/null || true
  if [ -s "$tmp" ]; then
    # filtra allowlist e mascara valor
    while IFS= read -r line; do
      if echo "$line" | rg -q -i -- "$ALLOWLIST_REGEX"; then
        continue
      fi
      # Extrai arquivo:linha e mascara o restante
      file_line="${line%%:*}"
      rest="${line#*:}"
      lineno="${rest%%:*}"
      # Mostra somente localização + tipo, valor não é ecoado.
      echo "FISCAL SECURITY: [$p] em ${file_line}:${lineno} — valor mascarado"
      fail=1
    done <"$tmp"
  fi
done

if [ "$fail" -eq 1 ]; then
  echo "FISCAL SECURITY SCAN: FAIL"
  exit 1
fi
echo "FISCAL SECURITY SCAN: OK — nenhum segredo/endpoint fiscal encontrado."
