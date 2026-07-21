#!/usr/bin/env bash
# Fase Fiscal 2.1 — scanner de segurança fiscal.
# Falha se algum indicador de emissão externa/segredo fiscal aparecer no repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Termos proibidos (case-insensitive) em código-fonte e configs.
PATTERNS=(
  'FOCUS_TOKEN'
  'NFSE_TOKEN'
  'SEFAZ_TOKEN'
  'CERT_PASSWORD'
  'CERTIFICATE_PASSWORD'
  '\.pfx'
  '\.p12'
  'focusnfe\.com'
  'nfse\.gov\.br'
  'homologacao\.sefaz'
)

# "Authorization: Bearer" só é problema em arquivos fiscais.
FISCAL_ONLY_PATTERNS=(
  'Authorization: Bearer'
)

# Escopo: código do app e edge functions. Ignora node_modules, dist, docs históricas
# e relatórios da própria auditoria (que citam os termos como proibidos).
INCLUDES=(
  --glob '!node_modules/**'
  --glob '!dist/**'
  --glob '!.git/**'
  --glob '!bun.lockb'
  --glob '!package-lock.json'
  --glob '!docs/**'
  --glob '!scripts/fiscal-security-scan.sh'
  --glob '!src/test/fiscal/**'
  --glob '!restoration/**'
)

fail=0
for p in "${PATTERNS[@]}"; do
  if rg -n -i "${INCLUDES[@]}" -- "$p" . >/tmp/fiscal-scan.$$ 2>/dev/null; then
    if [ -s /tmp/fiscal-scan.$$ ]; then
      echo "FISCAL SECURITY: term found -> $p"
      cat /tmp/fiscal-scan.$$
      fail=1
    fi
  fi
done
rm -f /tmp/fiscal-scan.$$

# Padrões fiscais restritos: só falhar quando encontrados em arquivos com
# nome fiscal (fiscal, nfe, nfse, sefaz, focus).
FISCAL_SCOPE=(--glob '**/*fiscal*' --glob '**/*nfe*' --glob '**/*nfse*' --glob '**/*sefaz*' --glob '**/*focus*')
for p in "${FISCAL_ONLY_PATTERNS[@]}"; do
  if rg -n -i "${INCLUDES[@]}" "${FISCAL_SCOPE[@]}" -- "$p" . >/tmp/fiscal-scan.$$ 2>/dev/null; then
    if [ -s /tmp/fiscal-scan.$$ ]; then
      echo "FISCAL SECURITY (fiscal scope): term found -> $p"
      cat /tmp/fiscal-scan.$$
      fail=1
    fi
  fi
done
rm -f /tmp/fiscal-scan.$$

if [ "$fail" -eq 1 ]; then
  echo "FISCAL SECURITY SCAN: FAIL"
  exit 1
fi
echo "FISCAL SECURITY SCAN: OK — nenhum token/certificado/endpoint fiscal encontrado."
