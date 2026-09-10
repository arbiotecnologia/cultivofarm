# Rollback — Promoção estrutural CultivoFarm (`swzpzcwiasxmjutrmvkm`)

Regra geral: **toda onda roda dentro de uma única transação**, com os pós-checks
executados antes do `COMMIT`. Falha de qualquer gate → `ROLLBACK` e nada persiste.

## Estrutura obrigatória de cada onda

```sql
BEGIN;
SET LOCAL promocao.target_ref = 'swzpzcwiasxmjutrmvkm';

DO $$
BEGIN
  IF current_setting('promocao.target_ref', true) <> 'swzpzcwiasxmjutrmvkm' THEN
    RAISE EXCEPTION 'ABORT: alvo incorreto.';
  END IF;
END $$;

-- ... DDL da onda ...

-- pós-check da onda: cada gate falho deve RAISE EXCEPTION aqui
COMMIT;
```

## Rollback por onda

| Onda | Conteúdo | Rollback |
|---|---|---|
| 0 | Baseline estrutural (dump) | `ROLLBACK` na transação; se já commitado, ver "reset total" |
| 1 | Extensões e schemas | `DROP SCHEMA private CASCADE;` — extensões ficam (idempotentes e inofensivas) |
| 2 | Tabelas, sequences, constraints, índices | `ROLLBACK`; se commitado, reset total (alvo ainda sem dados) |
| 3 | Funções e triggers | `ROLLBACK`; se commitado, `DROP FUNCTION`/`DROP TRIGGER` da lista da onda |
| 4 | Views e matviews | `DROP VIEW` / `DROP MATERIALIZED VIEW` das criadas na onda |
| 5 | RLS, policies, grants | `DROP POLICY` das criadas + `REVOKE` dos grants da onda; RLS permanece habilitada (estado seguro) |
| 6 | Jobs de cron | `SELECT cron.unschedule(jobid)` dos jobs criados |
| 7 | Ledger | `DELETE FROM supabase_migrations.schema_migrations WHERE version = '<baseline>'` |

## Reset total (só antes da primeira carga de dados)

Enquanto o CultivoFarm não tiver dados reais, o rollback canônico é recriar o schema:

```sql
BEGIN;
SET LOCAL promocao.target_ref = 'swzpzcwiasxmjutrmvkm';
DROP SCHEMA IF EXISTS private CASCADE;
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
DELETE FROM supabase_migrations.schema_migrations;
COMMIT;
```

Depois, reabilitar as extensões pelo dashboard se alguma tiver sido removida em cascata.

**Proibido** executar esse bloco em `navfzbwgwzruipouyfnk`, `ikaauvsflpmamgxmkhoq`
ou `yzszlzjpovmcteuxjznj`. Confirme o ref antes de colar.

## Após a primeira carga de dados

O reset total deixa de ser aceitável. A partir daí o rollback exige
**PITR / restore point** do projeto CultivoFarm, confirmado por escrito antes
de qualquer nova onda.

## Gatilhos de rollback imediato

- Qualquer gate de `04-postchecks.sql` retornando linha (tabela sem RLS,
  tabela sem GRANT, SECDEF sem `search_path`, view sem `security_invoker`).
- Qualquer tabela de negócio com `n_live_tup > 0`.
- Qualquer usuário em `auth.users` nesta etapa.
- Job de cron criado com `active = true`.
- Divergência de contagem contra `00-inventario-esperado/` não justificada por escrito.
