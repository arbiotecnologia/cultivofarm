#!/usr/bin/env bash
# =====================================================================
# CLEANUP DO EXECUTOR TEMPORÁRIO DO REHEARSAL
# Remove a via de uso único após o ensaio. Não toca no pacote de promoção
# (preflight/steps/postflight/manifest permanecem intactos).
#
# Após rodar isto, peça a remoção do secret lógico STAGING_DSN em
# Project Settings -> Secrets.
# =====================================================================
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm -f "$DIR/run-rehearsal-from-secret.sh"
echo "executor temporario removido"
echo "ACAO MANUAL PENDENTE: remover o secret STAGING_DSN em Project Settings -> Secrets"
rm -f "$DIR/cleanup-rehearsal-executor.sh"
echo "CLEANUP_DONE"
