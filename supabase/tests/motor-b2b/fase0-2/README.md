# Testes da Fase 0.2 — Motor B2B (fora da cadeia de migrations)

Estes scripts **não são migrations** e nunca devem ser colocados em `supabase/migrations/`.
Eles dependem de dados de staging, criam fixtures e executam identidades simuladas.

| Script | O que faz |
| --- | --- |
| `01-rls-rpc-harness.sql` | T1–T19: leitura cruzada por papel (admin, financeiro, gestor comercial, gestor B2B A, técnico B2B A, produtor A, produtor B, autenticado sem vínculo) + execução **real** das 4 RPCs sensíveis por técnico B2B, usuário sem papel e `anon` + ACLs + checksums das 17 RPCs. |
| `02-rollback-cycle.sql` | T20: aplica o rollback de emergência, prova que o baseline vulnerável voltou, reaplica o hardening e prova a igualdade da impressão digital segura. |

## Garantias de segurança

- Trava de ambiente obrigatória: abortam se `_fiscal_staging_marker` não for `ikaauvsflpmamgxmkhoq`;
  produção `navfzbwgwzruipouyfnk` é recusada explicitamente.
- **Nenhuma identidade real é tocada.** Todos os usuários, parceiros, clientes, papéis e vínculos
  são sintéticos (`FASE02`), criados dentro de uma subtransação que sempre sofre `ROLLBACK`.
- **Proibido** `ON CONFLICT DO UPDATE` em `partner_users`, `user_roles` ou `user_clientes`.
- Nenhum `TRUNCATE` e nenhuma limpeza destrutiva: como tudo é revertido, não há fixtures residuais.
- Somente linhas de evidência (contadores/status) são persistidas em
  `public._motor_b2b_fase0_2_evidence`, tabela técnica sem grants para `anon`/`authenticated`/PUBLIC,
  com RLS habilitada e **removida após a exportação das evidências para `docs/`**.

## Execução

```bash
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -f supabase/tests/motor-b2b/fase0-2/01-rls-rpc-harness.sql
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -f supabase/tests/motor-b2b/fase0-2/02-rollback-cycle.sql
```

## Histórico

Versões anteriores destes testes chegaram a ser aplicadas ao staging como migrations e continham
fixtures, `TRUNCATE`, UUIDs de contas de homologação reais e limpeza destrutiva. Esses arquivos
foram **removidos da cadeia canônica** e substituídos por estes scripts.

Cadeia canônica remanescente da Fase 0.2 (apta a promoção):

- `supabase/migrations/20260729010220_motor_b2b_fase0_2_hardening_rls.sql` — hardening.
- `supabase/migrations/20260729014307_motor_b2b_fase0_2_reconciliacao.sql` — reafirmação
  idempotente de policies, revogações de `anon` e índice.
- `supabase/migrations/20260729015203_motor_b2b_fase0_2_drop_evidence_table.sql` — remoção da
  tabela técnica de evidências após exportação para `docs/`.

As execuções antigas permanecem registradas no histórico remoto do staging
(`supabase_migrations.schema_migrations`); não foi feito downgrade no banco.
