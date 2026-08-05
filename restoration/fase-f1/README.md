# restoration/fase-f1 — Kit da Fase F1 (hardening fiscal)

Ambiente autorizado: **staging `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` é proibida nesta fase.
Documentação completa: [`docs/fase-f1-hardening-fiscal.md`](../../docs/fase-f1-hardening-fiscal.md).

## Conteúdo

| Arquivo | Papel |
| --- | --- |
| `migration-correcao.sql` | Migration corretiva pós-auditoria (cópia canônica em `supabase/migrations/20260813000000_fase_f1_correcao_promovivel.sql`) |
| `baseline/pre-correcao.json` | Snapshot de contagens e hashes capturado antes da correção |
| `postcheck.sql` | 24 gates de verificação, somente leitura, comparados contra o baseline |
| `run-postcheck.sh` | Runner que injeta o baseline no postcheck |
| `rollback.sql` | Rollback lógico transacional e fail-closed |

As duas cópias da migration são idênticas (sha256 `9b8864fa1762b13e8eab5c668154d4c99fd532e57df26a2bf77fff395ea9d6ee`).

## Ordem de execução

```bash
# 1) aplicar (idempotente, transacional)
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 --single-transaction \
  -f restoration/fase-f1/migration-correcao.sql

# 2) verificar
./restoration/fase-f1/run-postcheck.sh

# 3) rollback, apenas sob autorização explícita
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f restoration/fase-f1/rollback.sql
```

`STAGING_DSN` é lido do ambiente e nunca impresso.

## Propriedades do kit

- **Promovível**: nenhum UUID de ambiente na migration, no postcheck ou no rollback — a quarentena é identificada por predicado semântico.
- **Fail-closed**: migration, postcheck e rollback abortam se o par `marker`/`project_ref` não for um ambiente autorizado; o postcheck ainda exige que o ambiente seja o mesmo do baseline.
- **Sem contagens congeladas**: integridade é verificada por não regressão contra o baseline (hashes fiscais idênticos, contagens que não caem, ledger que não retrocede).
- **Não invasivo**: zero DELETE, zero alteração de valor fiscal, corpo compartilhado de `fiscal_audit_trigger()` preservado no estado pré-F1.

## Evidência da execução (staging `ikaauvsflpmamgxmkhoq`)

| Verificação | Resultado |
| --- | --- |
| Pós-check — 24 gates | `POSTCHECK_FASE_F1_CORRECAO_PASS` |
| Harness de runtime RBAC/diagnóstico | 17 PASS / 0 FAIL |
| Ensaio transacional de rollback (revertido) | PASS |
| Reaplicação da migration | PASS (idempotente) |
| Ledger | 630 versões, head `20260813000000` |
| Vitest / `tsgo --noEmit` / `bun run build` | 2723 passed / limpo / PASS |
