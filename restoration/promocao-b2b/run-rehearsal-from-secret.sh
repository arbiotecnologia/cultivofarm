#!/usr/bin/env bash
# =====================================================================
# EXECUTOR TEMPORÁRIO DO REHEARSAL — STAGING ikaauvsflpmamgxmkhoq
#
# ARTEFATO TEMPORÁRIO. Não integra o manifest canônico de promoção
# (manifest.json cobre apenas os 35 artefatos permanentes do pacote).
# Removido por cleanup-rehearsal-executor.sh após o ensaio.
#
# Via de uso único. Lê a conexão EXCLUSIVAMENTE do secret de runtime
# STAGING_DSN. Nunca imprime, loga ou grava o DSN. Nunca aceita produção.
# Nunca faz COMMIT: o pacote roda em UMA transação encerrada em ROLLBACK.
# =====================================================================
set -euo pipefail

PROD_REF="navfzbwgwzruipouyfnk"
EXPECTED_REF="ikaauvsflpmamgxmkhoq"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STMT_TIMEOUT_MS="${REHEARSAL_STATEMENT_TIMEOUT_MS:-600000}"
TOTAL_TIMEOUT_S="${REHEARSAL_TOTAL_TIMEOUT_S:-1800}"
TMPDIR_RUN=""
CONNECTED=0

# Consulta ÚNICA de baseline: a mesma expressão é usada antes e depois do
# ensaio, para que a comparação nunca misture métricas de fontes distintas
# (pg_tables x information_schema.tables, por exemplo).
read -r -d '' BASELINE_SQL <<'SQL' || true
select 'base_tables='   || (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r');
select 'views='         || (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m'));
select 'functions='     || (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public');
select 'policies='      || (select count(*) from pg_policies where schemaname='public');
select 'triggers_disabled=' || (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and t.tgenabled='D');
select 'proofs_table_present=' || (to_regclass('public._motor_b2b_fase7_proofs') is not null)::text;
select 'residuo_orders=' || (select count(*) from public.partner_orders where coalesce(observacoes,'') ilike '%REHEARSAL%');
select 'residuo_idem='   || (select count(*) from public.partner_order_idempotency where idempotency_key like 'GATE-RUNTIME-%' or idempotency_key like 'REHEARSAL%');
SQL

snapshot() { # $1 = arquivo de saída
  psql "$STAGING_DSN" -X -A -t -v ON_ERROR_STOP=1 -c "$BASELINE_SQL" > "$1"
}

cleanup() {
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    if [[ $CONNECTED -eq 1 ]]; then
      echo "REHEARSAL_BLOCKED (exit=$rc) — executando pós-verificação read-only..." >&2
      if snapshot "${TMPDIR_RUN:-/tmp}/post_fail.txt" 2>/dev/null; then
        echo "--- estado pós-falha (read-only) ---" >&2
        cat "${TMPDIR_RUN:-/tmp}/post_fail.txt" >&2
        if [[ -f "${TMPDIR_RUN:-/tmp}/pre.txt" ]] \
           && diff -q "${TMPDIR_RUN:-/tmp}/pre.txt" "${TMPDIR_RUN:-/tmp}/post_fail.txt" >/dev/null; then
          echo "POST_STATE_IDENTICAL_TO_BASELINE" >&2
        else
          echo "POST_STATE_DIVERGENTE — inspecione manualmente antes de qualquer nova acao" >&2
        fi
      else
        echo "POST_VERIFICATION_UNAVAILABLE — estado NAO confirmado" >&2
      fi
    else
      echo "REHEARSAL_BLOCKED (exit=$rc) — falha antes de qualquer conexao; nenhum SQL enviado." >&2
    fi
  fi
  [[ -n "$TMPDIR_RUN" && -d "$TMPDIR_RUN" ]] && rm -rf "$TMPDIR_RUN"
  unset PGPASSWORD || true
  return $rc
}
trap cleanup EXIT

TMPDIR_RUN="$(mktemp -d)"
chmod 700 "$TMPDIR_RUN"

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

# ---- 2. Autenticação (SELECT somente leitura) ------------------------------
echo "[1/6] validando autenticacao e destino conectado"
ident="$(psql "$STAGING_DSN" -X -A -t -v ON_ERROR_STOP=1 -c "select current_database()")"
CONNECTED=1
echo "  conexao OK (identificador nao sensivel): $ident"

# ---- 3. Marcador de staging: FAIL-CLOSED -----------------------------------
echo "[2/6] validando marcador de ambiente (fail-closed)"
psql "$STAGING_DSN" -X -v ON_ERROR_STOP=1 <<SQL
DO \$g\$
DECLARE v_marker text; v_ref text; v_n int;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'MARKER_ABORT: public._fiscal_staging_marker inexistente — ambiente nao identificado';
  END IF;
  SELECT count(*) INTO v_n FROM public._fiscal_staging_marker;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'MARKER_ABORT: marcador ambiguo (% linhas, esperado exatamente 1)', v_n;
  END IF;
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_marker IS DISTINCT FROM 'STAGING' THEN
    RAISE EXCEPTION 'MARKER_ABORT: marker=% (esperado STAGING)', coalesce(v_marker,'<null>');
  END IF;
  IF v_ref = '$PROD_REF' THEN
    RAISE EXCEPTION 'MARKER_ABORT: marcador aponta PRODUCAO — execucao proibida';
  END IF;
  IF v_ref IS DISTINCT FROM '$EXPECTED_REF' THEN
    RAISE EXCEPTION 'MARKER_ABORT: project_ref divergente do staging autorizado';
  END IF;
  RAISE NOTICE 'MARKER_OK';
END \$g\$;
SQL

# ---- 4. Integridade do pacote (35 artefatos permanentes) -------------------
# Fail-closed: reprova se o arquivo estiver AUSENTE, ilegível, ou se o sha256
# OU o tamanho em bytes divergirem do manifest. Mensagens sanitizadas.
echo "[3/6] conferindo integridade do manifest (sha256 + bytes)"
python3 - "$DIR" <<'PY'
import hashlib, json, os, sys
d = sys.argv[1]
try:
    m = json.load(open(os.path.join(d, "manifest.json")))
except Exception as e:
    print("MANIFEST_UNREADABLE:", type(e).__name__); sys.exit(3)

missing, mismatch = [], []
for f in m["files"]:
    p = os.path.join(d, f["path"])
    if not os.path.isfile(p):
        missing.append(f["path"]); continue
    try:
        b = open(p, "rb").read()
    except Exception as e:
        missing.append(f'{f["path"]} (unreadable: {type(e).__name__})'); continue
    h, n = hashlib.sha256(b).hexdigest(), len(b)
    prob = []
    if h != f["sha256"]:
        prob.append("sha256")
    if "bytes" in f and n != f["bytes"]:
        prob.append(f'bytes({f["bytes"]}!={n})')
    if prob:
        mismatch.append(f'{f["path"]} [{",".join(prob)}]')

if missing:
    print("MANIFEST_FILE_MISSING:", "; ".join(missing))
if mismatch:
    print("MANIFEST_INTEGRITY_MISMATCH:", "; ".join(mismatch))
if missing or mismatch:
    sys.exit(3)
print(f"  OK: {len(m['files'])} arquivos integros (sha256 e bytes conferem)")
PY


# ---- 5. Baseline imediatamente antes do ensaio -----------------------------
echo "[4/6] capturando baseline pre-rehearsal"
snapshot "$TMPDIR_RUN/pre.txt"
sed 's/^/  pre  /' "$TMPDIR_RUN/pre.txt"

# ---- 6. Ordem canônica (do manifest, nunca de ls) --------------------------
FILES=("$DIR/000_preflight.sql")
while IFS= read -r s; do FILES+=("$DIR/$s"); done < <(
  python3 -c "import json;print('\n'.join(s['file'] for s in json.load(open('$DIR/manifest.json'))['steps']))"
)
FILES+=("$DIR/090_postflight.sql")

# ---- 7. Transação única: preflight -> delta -> postflight -> 2a passagem ----
echo "[5/6] executando rehearsal (BEGIN ... ROLLBACK), ${#FILES[@]} arquivos x2 passagens"
SCRIPT="$TMPDIR_RUN/rehearsal.sql"
{
  echo "\\set ON_ERROR_STOP on"
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

# ON_ERROR_STOP=1 propaga falha de qualquer statement, inclusive dentro de \i.
timeout "${TOTAL_TIMEOUT_S}s" \
  psql "$STAGING_DSN" -X -v ON_ERROR_STOP=1 -f "$SCRIPT"

# ---- 8. Comparação pós-ROLLBACK com a MESMA consulta -----------------------
echo "[6/6] comparando estado pos-ROLLBACK com o baseline"
snapshot "$TMPDIR_RUN/post.txt"
sed 's/^/  post /' "$TMPDIR_RUN/post.txt"

if ! diff -u "$TMPDIR_RUN/pre.txt" "$TMPDIR_RUN/post.txt"; then
  echo "ABORT: estado pos-rehearsal divergente do baseline." >&2
  exit 5
fi

grep -qx 'triggers_disabled=0' "$TMPDIR_RUN/post.txt" || { echo "ABORT: triggers desabilitados presentes." >&2; exit 6; }
grep -qx 'residuo_orders=0'    "$TMPDIR_RUN/post.txt" || { echo "ABORT: residuo em partner_orders." >&2; exit 6; }
grep -qx 'residuo_idem=0'      "$TMPDIR_RUN/post.txt" || { echo "ABORT: residuo em idempotencia." >&2; exit 6; }
grep -qx 'proofs_table_present=false' "$TMPDIR_RUN/post.txt" || { echo "ABORT: tabela de provas presente." >&2; exit 6; }

echo "BASELINE_IDENTICO · ZERO_RESIDUO · TRIGGERS_HABILITADOS"
echo "REHEARSAL_DONE"
