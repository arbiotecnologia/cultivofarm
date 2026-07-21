# Fase Fiscal 3.0.1 — Backfill em schema REAL (public.*)

## Status
**TESTE PREPARADO — EXECUÇÃO PENDENTE EM STAGING DOCKER ISOLADO.**

Nenhuma fixture foi inserida no projeto real. O `03-apply.sh` aborta se `PGURL`
contiver o project ref real.

## Fluxo obrigatório
1. `docker run` de um Postgres isolado.
2. Aplicar TODAS as migrations do repositório anteriores a `20260721000000`
   (fora do escopo deste diretório — use o pipeline padrão da AR Bio).
3. `psql "$PGURL" -f restoration/backfill-fiscal-fase3/01-prepare.sql`
   — cria marker anti-produção e fixtures em `public.*`.
4. `psql "$PGURL" -f restoration/backfill-fiscal-fase3/02-baseline.sql`
   — snapshot **ANTES** das migrations fiscais.
5. `bash restoration/backfill-fiscal-fase3/03-apply.sh`
   — aplica `20260721000000` + `20260721010000` + `20260722000000` em ordem.
6. `psql "$PGURL" -f restoration/backfill-fiscal-fase3/04-verify.sql`
   — verifica contagens, órfãos, ISSUED ≠ AUTHORIZED, metadados legados,
     índices críticos.
7. `psql "$PGURL" -f restoration/backfill-fiscal-fase3/99-cleanup.sql`
   e descartar o container.

## Fixtures cobrem
PENDING, ISSUED, CANCELED, ERROR; com/sem `access_key`; múltiplos documentos
por cliente; documento sem número/série; documento manual; documento externo.

## Proibido
- Executar contra o projeto real (`03-apply.sh` aborta por heurística de ref).
- Deixar o container ativo após validação.
- Compartilhar dumps do banco de teste.
