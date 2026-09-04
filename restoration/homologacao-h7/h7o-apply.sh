#!/usr/bin/env bash
# H7O — Aplicação fail-fast das migrations H7O no STAGING e versionamento byte a byte no repositório.
# Ordem: guard de binding/staging → ensaio (transação descartada) de cada forward → aplicação com ledger
# exato (h7o-apply.mjs) → cópia dos forwards para supabase/migrations (abort se já existir com conteúdo
# diferente) → verificação md5 repo == ledger.
# Nunca imprime DSN/segredos.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
RUN="$ROOT/restoration/os-e2e/staging-psql.sh"
MIG="$ROOT/supabase/migrations"
FWD="$HERE/h7o-forwards"

"$HERE/guard-staging.sh"

mapfile -t FILES < <(ls "$FWD"/*.sql | sort)
[ "${#FILES[@]}" -gt 0 ] || { echo "ABORT: nenhum forward em $FWD" >&2; exit 1; }

# 1) ensaio individual (transação descartada) — sintaxe, pré e pós-condições
for f in "${FILES[@]}"; do
  v=$(basename "$f" | cut -c1-14)
  if [ -n "$("$RUN" -tAc "select 1 from supabase_migrations.schema_migrations where version='$v'")" ]; then
    echo "ensaio: $v já no ledger — pulando ensaio isolado"; continue
  fi
  { echo 'begin;'; cat "$f"; echo 'rollback;'; } | "$RUN" -q >/dev/null
  echo "ensaio OK (descartado): $(basename "$f")"
done

# 2) aplicação com ledger exato
node "$HERE/h7o-apply.mjs" "${FILES[@]}"

# 3) versionamento no repositório (byte a byte)
for f in "${FILES[@]}"; do
  b=$(basename "$f")
  if [ -f "$MIG/$b" ]; then
    cmp -s "$f" "$MIG/$b" || { echo "ABORT: $MIG/$b existe com conteúdo diferente do forward" >&2; exit 8; }
  else
    cp "$f" "$MIG/$b"
  fi
  repo_md5=$(md5sum "$MIG/$b" | cut -d' ' -f1)
  v=${b:0:14}
  db_md5=$("$RUN" -tAc "select md5(array_to_string(statements, E'\n')) from supabase_migrations.schema_migrations where version='$v'")
  [ "$repo_md5" = "$db_md5" ] && echo "versionado: $b (md5 $repo_md5 == ledger)" || { echo "ABORT: md5 repo != ledger para $b" >&2; exit 9; }
done
echo "H7O APPLY: OK"
