# Agendamento do worker `process-communication-outbox`

O worker é **POST-only** e autentica de duas maneiras (mutuamente exclusivas
por chamada):

- cabeçalho `x-internal-secret: $INTERNAL_FUNCTION_SECRET`
- `Authorization: Bearer <service_role JWT>` (não recomendado para cron)

Nenhum segredo deve ser armazenado em SQL, no repositório ou em logs. Ambas as
opções assumem `INTERNAL_FUNCTION_SECRET` configurado em Project Settings →
Secrets do projeto de staging.

## Parâmetros iniciais recomendados

| Parâmetro          | Valor inicial | Observação                                            |
| ------------------ | ------------- | ----------------------------------------------------- |
| Frequência         | 1×/minuto     | Sobe para 15s após 72h estáveis.                      |
| Batch size         | 10            | Já hard-coded no worker.                              |
| Lease              | 90s           | Já hard-coded no worker.                              |
| Backoff (defer)    | 600s          | Já hard-coded.                                        |
| Timeout HTTP       | 30s           | Depende do scheduler; alertar se exceder.             |

## Critérios de pausa imediata

- Taxa de `termination_failures` > 0 em 3 execuções consecutivas.
- Taxa de `permanent_error` (dead-letter) > 5% da amostra de 100 envios.
- Provider (SMTP/Meta) sinalizando degradação.
- Qualquer alarme de PII/log leaking.

## Opção A — Cron externo autenticado (recomendada)

Serviço externo (GitHub Actions cron, EventBridge, Fly Cron, etc.) faz POST
com o header interno. `INTERNAL_FUNCTION_SECRET` fica no cofre do scheduler,
nunca em SQL.

```
curl -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/process-communication-outbox" \
     -H "x-internal-secret: $INTERNAL_FUNCTION_SECRET" \
     -H "content-type: application/json" \
     --data '{}' \
     --max-time 30 --fail
```

Vantagens: segredo fora do banco; audit trail no scheduler; pausa 1-clique.

## Opção B — Mecanismo Supabase compatível

Se o projeto usar Supabase Scheduled Functions/cron nativo, configurar o job
com o mesmo header. **Não** armazenar o secret em `pg_cron`, em tabelas nem em
SQL de migration; usar exclusivamente a interface segura de secrets do
provedor. Caso a interface segura não esteja disponível, prefira Opção A.

## Rollback do agendamento

1. Desabilitar o job no scheduler (sem apagar histórico).
2. Executar `verify-staging.sh` para confirmar flags OFF.
3. Se necessário, `rollback-staging.sh` com `ROLLBACK_COMMUNICATION=true`.

## Ativação por canal

Ativar `in_app` → observar 24h → ativar `email` → observar 24h → ativar
`whatsapp`. Cada canal tem flag específica; nunca ativar dois canais no mesmo
turno.
