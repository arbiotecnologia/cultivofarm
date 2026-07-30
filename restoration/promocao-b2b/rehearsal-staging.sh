#!/usr/bin/env bash
# =====================================================================
# ENSAIO (DRY-RUN / REHEARSAL) — EXCLUSIVAMENTE STAGING ikaauvsflpmamgxmkhoq
# Nunca aponta produção: aborta se o DSN/ref contiver navfzbwgwzruipouyfnk.
#
# Uso:
#   STAGING_DSN='postgresql://...' STAGING_REF=ikaauvsflpmamgxmkhoq \
#     restoration/promocao-b2b/rehearsal-staging.sh [--apply]
#
# Sem --apply: valida hashes do manifest, ordem, sintaxe (psql ... --dry via
# transação abortada) e roda preflight+postflight em transação revertida.
# Com --apply: mesma sequência, ainda em transação revertida (ROLLBACK final).
# Este script NUNCA faz COMMIT.
# =====================================================================
set -euo pipefail

PROD_REF="navfzbwgwzruipouyfnk"
EXPECTED_REF="ikaauvsflpmamgxmkhoq"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${STAGING_DSN:?STAGING_DSN obrigatório}"
: "${STAGING_REF:?STAGING_REF obrigatório}"

# ---- verificação PRIMÁRIA de destino, no executor, ANTES da conexão --------
if [[ "$STAGING_REF" == "$PROD_REF" || "$STAGING_DSN" == *"$PROD_REF"* ]]; then
  echo "ABORT: destino aponta PRODUÇÃO ($PROD_REF)." >&2; exit 2
fi
if [[ "$STAGING_REF" != "$EXPECTED_REF" || "$STAGING_DSN" != *"$EXPECTED_REF"* ]]; then
  echo "ABORT: ensaio autorizado somente em $EXPECTED_REF." >&2; exit 2
fi

# ---- integridade do pacote -------------------------------------------------
echo "[1/4] verificando hashes do manifest"
python3 - "$DIR" <<'PY'
import hashlib, json, sys, os
d = sys.argv[1]
m = json.load(open(os.path.join(d, "manifest.json")))
bad = []
for f in m["files"]:
    p = os.path.join(d, f["path"])
    h = hashlib.sha256(open(p, "rb").read()).hexdigest()
    if h != f["sha256"]:
        bad.append(f["path"])
if bad:
    print("HASH_MISMATCH:", bad); sys.exit(3)
print(f"OK: {len(m['files'])} arquivos íntegros")
PY

# ---- ordem exata -----------------------------------------------------------
echo "[2/4] montando ordem de execução"
FILES=("$DIR/000_preflight.sql")
while IFS= read -r s; do FILES+=("$DIR/$s"); done < <(
  python3 -c "import json,sys;print('\n'.join(s['file'] for s in json.load(open('$DIR/manifest.json'))['steps']))"
)
FILES+=("$DIR/090_postflight.sql")
printf '  %s\n' "${FILES[@]##*/}"

# ---- ensaio em transação revertida ----------------------------------------
echo "[3/4] executando ensaio (BEGIN ... ROLLBACK)"
{
  echo "BEGIN;"
  echo "SET LOCAL promo.mode = 'rehearsal';"
  echo "SET LOCAL promo.target_ref = '$EXPECTED_REF';"
  echo "SET LOCAL promo.pitr_confirmed = 'yes';"
  echo "SET LOCAL promo.human_authorization = 'REHEARSAL-ONLY: ensaio em staging, sem efeito persistente, sem autorizacao de producao';"
  for f in "${FILES[@]}"; do echo "\\i $f"; done
  # Idempotência: segunda passagem completa do delta na MESMA transação.
  for f in "${FILES[@]:1}"; do echo "\\i $f"; done
  echo "ROLLBACK;"
} | psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f -

echo "[4/4] ensaio concluído sem persistir alterações (ROLLBACK final)"
echo "REHEARSAL_DONE"
