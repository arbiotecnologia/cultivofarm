#!/usr/bin/env bash
# =====================================================================
# P0/P1 — DIFF ESTRUTURAL: <inventário de um ambiente> x expected/ (staging)
#
# Somente leitura de arquivos. Não conecta a banco algum.
#
# Uso:
#   restoration/promocao-producao/20-diff-expected.sh /tmp/prod-inv
#
# Saída: relatório por domínio (tabelas, funções, triggers, índices, enums,
# buckets) com FALTA (existe no staging, ausente no alvo) e EXTRA (existe
# no alvo, ausente no staging). Exit 1 se houver qualquer divergência.
# =====================================================================
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXP="$DIR/expected"
INV="${1:?diretório do inventário do alvo}"

rc=0
for d in tables functions triggers indexes enums buckets; do
  [ -f "$INV/$d.tsv" ] || { echo "ABORT: $INV/$d.tsv ausente"; exit 2; }
  a=$(mktemp); b=$(mktemp)
  sort -u "$EXP/$d.tsv" > "$a"; sort -u "$INV/$d.tsv" > "$b"
  falta=$(comm -23 "$a" "$b" | wc -l | tr -d ' ')
  extra=$(comm -13 "$a" "$b" | wc -l | tr -d ' ')
  echo "== $d: FALTA=$falta EXTRA=$extra =="
  comm -23 "$a" "$b" | sed 's/^/  FALTA  /'
  comm -13 "$a" "$b" | sed 's/^/  EXTRA  /'
  [ "$falta" = 0 ] && [ "$extra" = 0 ] || rc=1
  rm -f "$a" "$b"
done

# Ledger: versões do staging ausentes no alvo (candidatas a promoção).
if [ -f "$INV/ledger.tsv" ]; then
  a=$(mktemp); b=$(mktemp)
  sort -u "$EXP/staging-ledger.tsv" > "$a"; sort -u "$INV/ledger.tsv" > "$b"
  echo "== ledger: no staging e ausentes no alvo =="
  comm -23 "$a" "$b" | sed 's/^/  PENDENTE  /'
  echo "== ledger: no alvo e ausentes no staging (investigar) =="
  comm -13 "$a" "$b" | sed 's/^/  ORFA  /'
  rm -f "$a" "$b"
fi

[ "$rc" = 0 ] && echo "DIFF_OK — alvo estruturalmente idêntico ao staging." \
             || echo "DIFF_DIVERGENTE — ver FALTA/EXTRA acima."
exit "$rc"
