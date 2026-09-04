#!/usr/bin/env bash
# FASE H7P — Gate determinístico contra aplicação acidental das migrations repo-only.
#
# Regra: as 59 migrations listadas em h7p-repo-only-manifest.json NÃO podem ser
# aplicadas ao staging. Elas já estão refletidas no catálogo, foram superadas
# pelo banco, ou pertencem a um backend estranho (Cloud sandbox) e são
# conflitantes com o schema autorizado.
#
# O gate falha se:
#   1) qualquer arquivo do manifesto tiver seu conteúdo alterado (sha256);
#   2) qualquer arquivo do manifesto sumir do repositório;
#   3) qualquer versão do manifesto aparecer no ledger (sinal de aplicação em lote);
#   4) (com STAGING_DSN ausente) a verificação 3 é pulada e reportada.
#
# Nunca imprime DSN, chaves ou segredos.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST="$ROOT/restoration/homologacao-h7/h7p-repo-only-manifest.json"
STAGING_REF_EXPECTED="ikaauvsflpmamgxmkhoq"
PRODUCTION_REF_FORBIDDEN="navfzbwgwzruipouyfnk"

fail() { echo "H7P REPO-ONLY GATE: ABORT — $*" >&2; exit 20; }
[ -f "$MANIFEST" ] || fail "manifesto ausente"

# Gate de binding estático primeiro (fail-closed).
"$ROOT/restoration/homologacao-h7/check-frontend-binding.sh" >/dev/null

mapfile -t ROWS < <(node -e '
const m=require(process.argv[1]);
for (const e of m.entries) console.log(`${e.version}\t${e.sha256}\t${e.file}`);
' "$MANIFEST")

[ "${#ROWS[@]}" -gt 0 ] || fail "manifesto vazio"

DRIFT=0
for row in "${ROWS[@]}"; do
  version="${row%%$'\t'*}"; rest="${row#*$'\t'}"
  sha="${rest%%$'\t'*}"; file="${rest#*$'\t'}"
  path="$ROOT/supabase/migrations/$file"
  [ -f "$path" ] || fail "arquivo do manifesto ausente: $file"
  actual="$(sha256sum "$path" | awk '{print $1}')"
  [ "$actual" = "$sha" ] || { echo "  DRIFT $file" >&2; DRIFT=1; }
done
[ "$DRIFT" -eq 0 ] || fail "conteúdo de migration repo-only alterado (ver DRIFT acima)"

if [ -n "${STAGING_DSN:-}" ]; then
  printf '%s' "$STAGING_DSN" | grep -q "$PRODUCTION_REF_FORBIDDEN" && \
    fail "DSN aponta para producao"
  printf '%s' "$STAGING_DSN" | grep -q "$STAGING_REF_EXPECTED" || \
    fail "DSN nao e o staging autorizado"
  VERSIONS="$(printf '%s\n' "${ROWS[@]}" | cut -f1 | paste -sd, -)"
  APPLIED="$(psql "$STAGING_DSN" -tAc \
    "select coalesce(string_agg(version, ','), '') from supabase_migrations.schema_migrations
       where version = any (string_to_array('${VERSIONS}', ','))")"
  [ -z "$APPLIED" ] || fail "migrations repo-only presentes no ledger: $APPLIED"
  echo "H7P REPO-ONLY GATE: ledger verificado — nenhuma das ${#ROWS[@]} versões aplicada."
else
  echo "H7P REPO-ONLY GATE: STAGING_DSN ausente — verificação de ledger pulada (checagem estática OK)."
fi

echo "H7P REPO-ONLY GATE: OK — ${#ROWS[@]} migrations repo-only íntegras e bloqueadas."
