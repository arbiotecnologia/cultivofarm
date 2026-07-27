# Kit de implantação — Módulo de Comunicação (Fase 3)

Este diretório reúne scripts e SQL somente-leitura/idempotentes para aplicar as
Fases 1 e 2 do módulo de Comunicação em um projeto **de staging** e certificar
o resultado antes de qualquer promoção. Nada aqui deve rodar em produção
diretamente; e nada aqui grava segredos reais no repositório.

## Convenções e proteções

- **Ref de projeto configurado no repositório:** `navfzbwgwzruipouyfnk`. Este ref
  é tratado como **produção** por padrão e é recusado por todos os scripts
  interativos, exceto se o operador declarar explicitamente
  `I_UNDERSTAND_CONFIGURED_REF_IS_STAGING=true` (usar apenas quando o operador
  souber, fora do repositório, que aquele ref é o staging real da instância).
- **Confirmação dupla:** todo comando de mutação exige `STAGING_PROJECT_REF` e
  `STAGING_CONFIRM_REF` iguais. Refs diferentes → abort.
- **Segredos:** nenhum script imprime `STAGING_DB_URL`, tokens Supabase, nem
  variáveis marcadas como sensíveis. Falhas do `psql`/`supabase` são redigidas
  para não vazar DSN. Nenhum `set -x`, `eval`, `source` arbitrário ou log de
  cabeçalhos HTTP.
- **Fail-fast:** todos os shell scripts usam `set -Eeuo pipefail`, resolvem
  caminho via `${BASH_SOURCE[0]}`, e usam `psql -v ON_ERROR_STOP=1
  --single-transaction` sempre que aplicável.
- **Feature flags:** permanecem OFF. Nenhum script altera flags de entrega.
- **Secrets de entrega:** não são configurados por este kit. Documentados no
  runbook do módulo. Sem eles, o worker responde `dry_run/disabled`.

## Arquivos

| Arquivo                        | Papel                                                            |
| ------------------------------ | ---------------------------------------------------------------- |
| `env.example`                  | Nomes de variáveis obrigatórias, sem valores reais.              |
| `validate-staging.sh`          | Valida CLI, variáveis e confirmações; **não** executa mutação.   |
| `apply-staging.sh`             | Aplica Fase 1 postcheck → Fase 2 precheck/migration/postcheck/harness. |
| `deploy-functions-staging.sh`  | Publica apenas `communication-health` e `process-communication-outbox`. |
| `verify-staging.sh`            | Reexecuta postchecks/harness e confere flags OFF.                |
| `rollback-staging.sh`          | Desfaz **somente** a Fase 2 (requer `ROLLBACK_COMMUNICATION=true`). |
| `smoke-staging.sql`            | Smoke em transação com `ROLLBACK` para assinaturas/grants.       |
| `checklist-manual.md`          | Checklist manual de homologação (funcional/UX).                  |
| `scheduling.md`                | Duas opções de agendamento POST-only para o worker.              |

## Ordem recomendada

1. Ler `env.example`, exportar variáveis no shell (não commitar).
2. `bash restoration/comunicacao-deploy/validate-staging.sh`
3. `bash restoration/comunicacao-deploy/apply-staging.sh`
4. `bash restoration/comunicacao-deploy/deploy-functions-staging.sh`
5. `psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-deploy/smoke-staging.sql`
6. `bash restoration/comunicacao-deploy/verify-staging.sh`
7. Homologação manual conforme `checklist-manual.md`.
8. Escolha o mecanismo em `scheduling.md`, ativando canal a canal.

## Rollback

Somente Fase 2. A Fase 1 e dados de negócio **não são** removidos por este kit.
Rollback exige `ROLLBACK_COMMUNICATION=true` e as mesmas confirmações de ref.

## Comando inicial (uso real com ref de staging externo)

```sh
export STAGING_PROJECT_REF="<ref-staging-real>"          # NUNCA navfzbwgwzruipouyfnk
export STAGING_CONFIRM_REF="<ref-staging-real>"          # idêntico ao anterior
export STAGING_DB_URL="postgresql://<user>:<pwd>@<host>:5432/postgres?sslmode=require"
bash restoration/comunicacao-deploy/validate-staging.sh
```
