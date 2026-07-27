# Kit de implantação — Módulo de Comunicação (Fase 3 v2)

Scripts fail-fast e SQL somente-leitura/idempotentes para aplicar as Fases 1 e
2 do módulo de Comunicação em um projeto **de staging** e certificar o
resultado antes de qualquer promoção. Nada aqui roda em produção
diretamente; nenhum segredo é gravado no repositório.

## Convenções e proteções

- **Ref configurado no repositório:** `navfzbwgwzruipouyfnk`. Tratado como
  produção por padrão; recusado por todos os scripts exceto sob
  `I_UNDERSTAND_CONFIGURED_REF_IS_STAGING=true`.
- **Confirmação dupla:** `STAGING_PROJECT_REF` e `STAGING_CONFIRM_REF` iguais.
- **Segredos:** nenhum script imprime DSN, tokens, senhas ou JWT. Falhas de
  `psql`/`supabase`/`curl` são redigidas. Sem `set -x`, sem execução dinâmica,
  sem `source` arbitrário, sem `cat` do body HTTP.
- **Dependências condicionais:** `psql` sempre; `supabase` CLI apenas quando
  `REQUIRE_SUPABASE_CLI=true` (setado pelo deploy). `curl`/`jq` apenas quando
  `STAGING_TEST_ADMIN_JWT` está presente (verify).
- **Feature flags de entrega são env de Edge Function** — verify checa via
  `communication-health` real, não em tabela SQL.
- **Fail-fast:** `set -Eeuo pipefail`; SQL via `psql -v ON_ERROR_STOP=1
  --single-transaction`.
- **Transação única na Fase 2:** `precheck.sql + migration.sql + postcheck.sql`
  passados em uma única invocação de psql; falha no postcheck reverte a
  migration automaticamente. Harness roda depois. Seeds da Fase 2 rodam por
  último, apenas sob `APPLY_COMMUNICATION_SEEDS=true`. Seeds da Fase 1 nunca
  são executadas por este kit.

## Arquivos

| Arquivo                        | Papel                                                            |
| ------------------------------ | ---------------------------------------------------------------- |
| `env.example`                  | Nomes de variáveis obrigatórias; valores fictícios.              |
| `validate-staging.sh`          | Valida CLI/vars/confirmações; **não** muta banco.                |
| `apply-staging.sh`             | F1 postcheck → F2 (precheck+migration+postcheck TX única) → F2 harness → F2 seeds opcional. |
| `deploy-functions-staging.sh`  | Publica só `communication-health` e `process-communication-outbox`. |
| `verify-staging.sh`            | Reexecuta postchecks/harness; health check REAL se JWT admin.    |
| `rollback-staging.sh`          | Desfaz apenas Fase 2 (requer `ROLLBACK_COMMUNICATION=true`).     |
| `smoke-staging.sql`            | Smoke read-only de assinaturas, grants (+/-), RLS, triggers, constraints e presença contratual das validações. |
| `checklist-manual.md`          | Homologação manual funcional/UX.                                 |
| `scheduling.md`                | Duas opções POST-only para agendar o worker.                     |

## Ordem recomendada

1. Ler `env.example`, exportar variáveis no shell (não commitar).
2. `bash restoration/comunicacao-deploy/validate-staging.sh`
3. `bash restoration/comunicacao-deploy/apply-staging.sh`
4. `bash restoration/comunicacao-deploy/deploy-functions-staging.sh`
5. `psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-deploy/smoke-staging.sql`
6. `bash restoration/comunicacao-deploy/verify-staging.sh`  *(opcionalmente com `STAGING_TEST_ADMIN_JWT`)*
7. Homologação manual conforme `checklist-manual.md`.
8. Ativar canal a canal seguindo `scheduling.md`.

## Verificação real das flags OFF (opcional)

Se o operador exportar `STAGING_TEST_ADMIN_JWT` no shell, `verify-staging.sh`
fará POST autenticado a `communication-health` e exigirá:

- HTTP 200 e `ok=true`;
- `delivery_enabled=false`;
- `email.enabled=false`, `whatsapp.enabled=false`, `in_app.enabled=false`.

Qualquer flag `true` faz o script falhar. Sem JWT, o script imprime **SKIP**
explícito — nunca "ok".

## Rollback

Somente Fase 2. A Fase 1 e dados de negócio **não são** removidos. Exige
`ROLLBACK_COMMUNICATION=true` e as mesmas confirmações de ref.

## Comando inicial

```sh
export STAGING_PROJECT_REF="<ref-staging-real>"
export STAGING_CONFIRM_REF="<ref-staging-real>"
export STAGING_DB_URL="postgresql://<user>:<pwd>@<host>:5432/postgres?sslmode=require"
# Opcional (health check real):
# export STAGING_TEST_ADMIN_JWT="<jwt-admin-de-staging>"
bash restoration/comunicacao-deploy/validate-staging.sh
```
