#!/usr/bin/env bash
# =====================================================================
# EXECUTOR TEMPORÁRIO DO REHEARSAL — STAGING ikaauvsflpmamgxmkhoq
#
# Via de uso único. Lê a conexão EXCLUSIVAMENTE do secret de runtime
# STAGING_DSN. Nunca imprime, loga ou grava o DSN. Nunca aceita produção.
# Nunca faz COMMIT: o pacote roda em UMA transação encerrada em ROLLBACK.
#
# Uso (uma única vez, no runtime onde STAGING_DSN existe):
#   restoration/promocao-b2b/run-rehearsal-from-secret.sh
#
# Remoção após o uso:
#   restoration/promocao-b2b/cleanup-rehearsal-executor.sh
# =====================================================================
set -euo pipefail

PROD_REF="navfzbwgwzruipouyfnk"
EXPECTED_REF="ikaauvsflpmamgxmkhoq"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STMT_TIMEOUT_MS="${REHEARSAL_STATEMENT_TIMEOUT_MS:-600000}"
TOTAL_TIMEOUT_S="${REHEARSAL_TOTAL_TIMEOUT_S:-1800}"
TMPDIR_RUN=""

cleanup() {
  local rc=$?
  [[ -n "$TMPDIR_RUN" && -d "$TMPDIR_RUN" ]] && rm -rf "$TMPDIR_RUN"
  unset PGPASSWORD || true
  if [[ $rc -ne 0 ]]; then
    echo "REHEARSAL_BLOCKED (exit=$rc) — nada persistido (transação em ROLLBACK)." >&2
  fi
  return $rc
}
trap cleanup EXIT

# ---- 0. Secret presente? (nunca ecoar o valor) -----------------------------
if [[ -z "${STAGING_DSN:-}" ]]; then
  echo "ABORT: secret STAGING_DSN ausente no runtime. Cadastre em Project Settings -> Secrets." >&2
  exit 4
fi

# ---- 1. Validação rígida de destino, ANTES de qualquer conexão -------------
case "$STAGING_DSN" in
  *"$PROD_REF"*) echo "ABORT: DSN aponta PRODUCAO. Recusado." >&2; exit 2 ;;
esac
case "$STAGING_DSN" in
  *"$EXPECTED_REF"*) : ;;
  *) echo "ABORT: DSN nao corresponde ao staging esperado. Recusado." >&2; exit 2 ;;
esac
case "$STAGING_DSN" in
  postgres://*|postgresql://*) : ;;
  *) echo "ABORT: formato de DSN invalido (use postgresql://...)." >&2; exit 2 ;;
esac

# ---- 2. Segunda prova de destino, já conectado (somente leitura) -----------
echo "[1/5] validando destino conectado"
ident="$(psql "$STAGING_DSN" -X -A -t -v ON_ERROR_STOP=1 -c \
  "select current_database() || '|' || coalesce(current_setting('app.environment', true), 'unset')")"
echo "  destino confirmado (identificador nao sensivel): ${ident%%|*}"

if psql "$STAGING_DSN" -X -A -t -v ON_ERROR_STOP=1 \
     -c "select to_regclass('public._fiscal_staging_marker') is null" | grep -qx 't'; then
  echo "  aviso: marcador STAGING ausente; prosseguindo apenas porque o ref do DSN e $EXPECTED_REF"
fi

# ---- 3. Integridade do pacote ---------------------------------------------
echo "[2/5] conferindo hashes do manifest"
python3 - "$DIR" <<'PY'
import hashlib, json, os, sys
d = sys.argv[1]
m = json.load(open(os.path.join(d, "manifest.json")))
bad = [f["path"] for f in m["files"]
       if hashlib.sha256(open(os.path.join(d, f["path"]), "rb").read()).hexdigest() != f["sha256"]]
if bad:
    print("HASH_MISMATCH:", bad); sys.exit(3)
print(f"  OK: {len(m['files'])} arquivos integros")
PY

# ---- 4. Ordem canônica (do manifest, nunca de ls) --------------------------
echo "[3/5] montando ordem de execucao"
FILES=("$DIR/000_preflight.sql")
while IFS= read -r s; do FILES+=("$DIR/$s"); done < <(
  python3 -c "import json;print('\n'.join(s['file'] for s in json.load(open('$DIR/manifest.json'))['steps']))"
)
FILES+=("$DIR/090_postflight.sql")
echo "  ${#FILES[@]} arquivos na transacao (x2 passagens)"

# ---- 5. Transação única: preflight -> delta -> postflight -> 2a passagem ----
echo "[4/5] executando rehearsal (BEGIN ... ROLLBACK)"
TMPDIR_RUN="$(mktemp -d)"
SCRIPT="$TMPDIR_RUN/rehearsal.sql"
{
  echo "BEGIN;"
  echo "SET LOCAL statement_timeout = '${STMT_TIMEOUT_MS}ms';"
  echo "SET LOCAL idle_in_transaction_session_timeout = '${STMT_TIMEOUT_MS}ms';"
  echo "SET LOCAL promo.mode = 'rehearsal';"
  echo "SET LOCAL promo.target_ref = '$EXPECTED_REF';"
  echo "SET LOCAL promo.pitr_confirmed = 'yes';"
  echo "SET LOCAL promo.human_authorization = 'REHEARSAL-ONLY: ensaio transacional em staging, sem efeito persistente, sem autorizacao de producao';"
  for f in "${FILES[@]}"; do echo "\\i $f"; done
  for f in "${FILES[@]:1}"; do echo "\\i $f"; done
  echo "ROLLBACK;"
} > "$SCRIPT"

timeout "${TOTAL_TIMEOUT_S}s" \
  psql "$STAGING_DSN" -X -v ON_ERROR_STOP=1 -f "$SCRIPT"

# ---- 6. Verificação pós-ensaio: zero residuo, triggers habilitados ---------
echo "[5/5] verificando ausencia de residuo"
psql "$STAGING_DSN" -X -A -t -v ON_ERROR_STOP=1 <<'SQL'
select 'public_tables=' || count(*) from pg_tables where schemaname='public';
select 'public_funcs=' || count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
select 'triggers_disabled=' || count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and t.tgenabled='D';
select 'proofs_table_present=' || (to_regclass('public._motor_b2b_fase7_proofs') is not null)::text;
select 'residuo_orders=' || count(*) from public.partner_orders
  where coalesce(notes,'') ilike '%REHEARSAL%';
SQL

echo "REHEARSAL_DONE"
