#!/usr/bin/env bash
# =====================================================================
# PROMOÇÃO CULTIVOFARM — GERAÇÃO DO BASELINE ESTRUTURAL (ONDA 0)
#
# Extrai do STAGING ikaauvsflpmamgxmkhoq um dump SOMENTE ESTRUTURA e
# produz os artefatos aplicáveis no CultivoFarm swzpzcwiasxmjutrmvkm.
#
# NÃO extrai dados, usuários Auth nem objetos de Storage.
# NÃO escreve em banco nenhum: apenas lê o staging e grava arquivos.
# Nunca imprime DSN, senhas ou tokens.
#
# Uso (máquina do operador, com sessão de homologação válida):
#   STAGING_DSN='postgresql://...' \
#     restoration/promocao-cultivofarm/02-gerar-baseline-estrutural.sh out/
# =====================================================================
set -euo pipefail

STG_REF="ikaauvsflpmamgxmkhoq"
PROD_REF="navfzbwgwzruipouyfnk"
SANDBOX_REF="yzszlzjpovmcteuxjznj"
TARGET_REF="swzpzcwiasxmjutrmvkm"

: "${STAGING_DSN:?STAGING_DSN obrigatório (origem = homologação)}"
OUT="${1:?diretório de saída obrigatório}"

case "$STAGING_DSN" in
  *"$PROD_REF"*)    echo "ABORT: origem aponta para produção." >&2; exit 2;;
  *"$SANDBOX_REF"*) echo "ABORT: origem aponta para sandbox." >&2; exit 2;;
  *"$TARGET_REF"*)  echo "ABORT: origem não pode ser o próprio alvo." >&2; exit 2;;
  *"$STG_REF"*)     : ;;
  *) echo "ABORT: origem não é o staging autorizado." >&2; exit 2;;
esac

mkdir -p "$OUT"

# ---------------------------------------------------------------------
# 1. Dump estrutural puro (sem owner, sem privilégios, sem dados)
# ---------------------------------------------------------------------
pg_dump "$STAGING_DSN" \
  --schema-only --no-owner --no-privileges --no-comments=false \
  --schema=public --schema=private \
  --exclude-schema='supabase_migrations' \
  > "$OUT/02-baseline-estrutural.sql"

# ---------------------------------------------------------------------
# 2. Dump separado de GRANTs e POLICIES (aplicado na Onda 5)
#    pg_dump --schema-only já traz policies; aqui geramos a lista
#    auditável de grants para conferência linha a linha.
# ---------------------------------------------------------------------
psql "$STAGING_DSN" -X -v ON_ERROR_STOP=1 -tA \
  -c "SET default_transaction_read_only = on" \
  -c "
    SELECT format('GRANT %s ON public.%I TO %I;',
                  string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type),
                  table_name, grantee)
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon','authenticated','service_role')
    GROUP BY table_name, grantee
    ORDER BY table_name, grantee;
  " > "$OUT/03-grants-policies.sql"

# ---------------------------------------------------------------------
# 3. Contrato esperado (inventário) para os pós-checks de paridade
# ---------------------------------------------------------------------
INV="$OUT/00-inventario-esperado"
mkdir -p "$INV"
TARGET_DSN="$STAGING_DSN" TARGET_REF="$STG_REF" \
  restoration/promocao-producao/10-inventario-readonly.sh "$INV"

# ---------------------------------------------------------------------
# 4. Hashes de integridade
# ---------------------------------------------------------------------
( cd "$OUT" && sha256sum 02-baseline-estrutural.sql 03-grants-policies.sql ) \
  > "$OUT/SHA256SUMS.txt"

echo "BASELINE_OK origem=$STG_REF alvo_previsto=$TARGET_REF dir=$OUT"
cat "$OUT/SHA256SUMS.txt"
wc -l "$OUT/02-baseline-estrutural.sql" "$OUT/03-grants-policies.sql"
