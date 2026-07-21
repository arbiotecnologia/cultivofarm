# Fase Fiscal 3.0.2-C — Backfill sintético reproduzível

## Status
**BACKFILL PREPARADO PARA STAGING — execução runtime não incluída neste ciclo.**

Nenhum comando `psql`/`bash` deste diretório foi executado durante a preparação.
Toda evidência runtime deve ser produzida no projeto isolado `AR-Bio-TEMP`
(project ref `ikaauvsflpmamgxmkhoq`) por operador humano.

## Pré-requisitos externos (uma única vez por staging)

1. Projeto Supabase temporário provisionado (`AR-Bio-TEMP`, ref diferente de
   `navfzbwgwzruipouyfnk`).
2. Marker fiscal criado com o project_ref esperado:

   ```sql
   CREATE TABLE IF NOT EXISTS public._fiscal_staging_marker
     (marker text PRIMARY KEY, project_ref text NOT NULL);
   INSERT INTO public._fiscal_staging_marker(marker, project_ref)
     VALUES ('STAGING','ikaauvsflpmamgxmkhoq')
   ON CONFLICT (marker) DO UPDATE SET project_ref = EXCLUDED.project_ref;
   ```

3. Migrations base (pré-fiscais) já aplicadas no staging pelo pipeline padrão.
4. Usuário sintético `harness@fiscal-staging.local` criado via
   `supabase.auth.admin.createUser` com `email_confirm: true` e roles
   `administrador` em `public.user_roles`. Capturar o UUID gerado.

## Estado pré-fiscal exigido

Antes de 01-prepare o staging deve conter as tabelas base
(`public.clientes`, `public.accounts_receivable`, `public.fiscal_invoices`,
`public.produtos`, `public.entregas`) já com o schema oficial do repositório
mas SEM as três migrations fiscais canônicas aplicadas — elas serão instaladas
pelo passo 03.

## Execução (staging isolado, humano)

Todas as variáveis abaixo são exigidas — configuração parcial é abortada:

```sh
export FISCAL_TEST_ENV=STAGING
export FISCAL_TEST_PROJECT_REF=ikaauvsflpmamgxmkhoq
export PGURL_STAGING='postgres://.../postgres'   # deve conter o ref acima
export HARNESS_USER_ID='<uuid do usuário sintético>'

psql "$PGURL_STAGING" -v harness_user_id="$HARNESS_USER_ID" \
  -f restoration/backfill-fiscal-fase3/01-prepare.sql
psql "$PGURL_STAGING" -f restoration/backfill-fiscal-fase3/02-baseline.sql
bash  restoration/backfill-fiscal-fase3/03-apply.sh
psql "$PGURL_STAGING" -f restoration/backfill-fiscal-fase3/04-verify.sql
psql "$PGURL_STAGING" -f restoration/backfill-fiscal-fase3/99-cleanup.sql
```

## O que cada arquivo cobre

- **01-prepare.sql** — 4 clientes, 4 accounts_receivable e 10 fiscal_invoices
  (PENDING/ISSUED/CANCELED/ERROR; com/sem `access_key`; sem número/série;
  múltiplos por cliente; NFE e NFSE; documento manual e externo). Escreve
  UUIDs em `fiscal_backfill_audit.fixture_ids`. Falha se marker ou project_ref
  inconsistente.
- **02-baseline.sql** — contagens agregadas + snapshot por UUID
  (status, invoice_type, série, número, access_key, receivable_id, delivery_id).
- **03-apply.sh** — aplica **exclusivamente** as três migrations canônicas de
  `supabase/migrations/` (nunca `restoration/migrations/`). Reforça guard
  triplo: FISCAL_TEST_ENV, FISCAL_TEST_PROJECT_REF, PGURL_STAGING; consulta
  marker+project_ref antes.
- **04-verify.sql** — invariantes: zero perda, zero órfãos, status legado
  preservado por UUID (`IS DISTINCT FROM`), ISSUED nunca virou AUTHORIZED,
  metadados legados corretos (origem/normalized/provider/environment),
  múltiplos por cliente preservados, índices críticos presentes, máscara
  funcional, view de reconciliação presente.
- **99-cleanup.sql** — remove todas as fixtures sintéticas e schema
  `fiscal_backfill_audit`. **NÃO** remove `_fiscal_staging_marker`.

## Proibido

- Executar contra o projeto principal (`navfzbwgwzruipouyfnk`). O guard aborta
  em `03-apply.sh` e em `01-prepare.sql`.
- Aplicar migrations de `restoration/migrations/*.sql` — todos são stubs
  (`SELECT 1 WHERE false`). A fonte canônica única é `supabase/migrations/`.
- Alegar execução runtime sem anexar logs completos das 5 fases.
- Compartilhar dumps do banco de teste.
- Remover o marker; o projeto temporário é persistente entre execuções.
