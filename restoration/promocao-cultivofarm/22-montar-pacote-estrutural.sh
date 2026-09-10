#!/usr/bin/env bash
# =====================================================================
# PROMOÇÃO CULTIVOFARM — MONTAGEM DETERMINÍSTICA DO PACOTE ESTRUTURAL
#
# Concatena, na ordem cronológica do nome do arquivo, apenas as migrations
# marcadas como INCLUIDA em 21-manifesto-migrations.csv.
#
# NÃO acessa banco. NÃO executa SQL. Apenas lê migrations e grava arquivos.
#
# Exclui explicitamente:
#   - as 20 migrations de sandbox 20260812134101..20260812135640
#   - harness/fixture/seed/smoke
#   - migrations com marcador de ambiente de homologação
#   - migrations com DML (ficam em REVISAO_DML até aprovação humana)
#
# Uso:
#   restoration/promocao-cultivofarm/22-montar-pacote-estrutural.sh gerado/
#   INCLUIR_REVISADAS=lista.txt ... (opcional, uma migration por linha,
#   somente após revisão humana registrada em 24-revisao-dml.md)
# =====================================================================
set -euo pipefail

TARGET_REF="swzpzcwiasxmjutrmvkm"
FORBIDDEN=("navfzbwgwzruipouyfnk" "ikaauvsflpmamgxmkhoq" "yzszlzjpovmcteuxjznj")

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKG="$ROOT/restoration/promocao-cultivofarm"
MIGRATIONS="$ROOT/supabase/migrations"
CSV="$PKG/21-manifesto-migrations.csv"
OUT_DIR="${1:?diretório de saída obrigatório}"

[ -f "$CSV" ] || { echo "ABORT: manifesto ausente. Rode 20-classificar-migrations.py." >&2; exit 2; }

mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/30-pacote-estrutural-cultivofarm.sql"
LOG="$OUT_DIR/30-pacote-estrutural-cultivofarm.manifest.txt"

# Lista ordenada de INCLUIDA (campo 3 do CSV), preservando a ordem do manifesto.
mapfile -t INCLUIDAS < <(awk -F',' 'NR>1 && $3=="INCLUIDA" {print $2}' "$CSV")

if [ -n "${INCLUIR_REVISADAS:-}" ]; then
  [ -f "$INCLUIR_REVISADAS" ] || { echo "ABORT: lista de revisadas inexistente." >&2; exit 2; }
  while IFS= read -r extra; do
    [ -z "$extra" ] && continue
    case "$extra" in \#*) continue;; esac
    INCLUIDAS+=("$extra")
  done < "$INCLUIR_REVISADAS"
  IFS=$'\n' INCLUIDAS=($(printf '%s\n' "${INCLUIDAS[@]}" | sort -u))
  unset IFS
fi

[ "${#INCLUIDAS[@]}" -gt 0 ] || { echo "ABORT: nenhuma migration incluída." >&2; exit 2; }

{
  echo "-- ==================================================================="
  echo "-- PACOTE ESTRUTURAL CULTIVOFARM — alvo ${TARGET_REF}"
  echo "-- Gerado por 22-montar-pacote-estrutural.sh a partir de"
  echo "-- 21-manifesto-migrations.csv. NAO EDITAR A MAO."
  echo "-- Migrations incluídas: ${#INCLUIDAS[@]}"
  echo "-- ==================================================================="
  echo
  echo "\\set ON_ERROR_STOP on"
  echo "BEGIN;"
  echo "SET LOCAL promocao.target_ref = '${TARGET_REF}';"
  echo "DO \$guard\$"
  echo "BEGIN"
  echo "  IF current_setting('promocao.target_ref', true) <> '${TARGET_REF}' THEN"
  echo "    RAISE EXCEPTION 'ABORT: alvo incorreto para o pacote CultivoFarm.';"
  echo "  END IF;"
  echo "END \$guard\$;"
  echo
} > "$OUT"

: > "$LOG"
for f in "${INCLUIDAS[@]}"; do
  src="$MIGRATIONS/$f"
  [ -f "$src" ] || { echo "ABORT: migration ausente: $f" >&2; exit 2; }
  for bad in "${FORBIDDEN[@]}"; do
    if grep -q "$bad" "$src"; then
      echo "ABORT: $f referencia ambiente proibido ($bad)." >&2
      exit 3
    fi
  done
  {
    echo "-- ---------------------------------------------------------------"
    echo "-- BEGIN $f"
    echo "-- ---------------------------------------------------------------"
    cat "$src"
    echo
    echo "-- END $f"
    echo
  } >> "$OUT"
  printf '%s  %s\n' "$(sha256sum "$src" | cut -d' ' -f1)" "$f" >> "$LOG"
done

{
  echo "-- Pós-check mínimo antes do COMMIT: nenhuma tabela public sem RLS."
  echo "DO \$post\$"
  echo "DECLARE v int;"
  echo "BEGIN"
  echo "  SELECT count(*) INTO v FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace"
  echo "   WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;"
  echo "  IF v > 0 THEN RAISE EXCEPTION 'ABORT: % tabela(s) public sem RLS.', v; END IF;"
  echo "END \$post\$;"
  echo
  echo "COMMIT;"
} >> "$OUT"

PKG_HASH="$(sha256sum "$OUT" | cut -d' ' -f1)"
echo "PACOTE_OK arquivo=$OUT"
echo "MIGRATIONS_INCLUIDAS=${#INCLUIDAS[@]}"
echo "SHA256=$PKG_HASH"
echo "MANIFESTO_HASHES=$LOG"
