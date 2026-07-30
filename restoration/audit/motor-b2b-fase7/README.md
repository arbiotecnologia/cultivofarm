# Motor B2B — Fase 7 — Harness de auditoria (FORA da cadeia de migrations)

Este diretório NÃO pertence a `supabase/migrations` e NUNCA é executado em promoção.

## Por que existe

A auditoria externa rejeitou a entrega anterior porque três arquivos de prova
foram adicionados à cadeia promocional:

- `20260730025626_98ab65d6-e7ea-431f-89bd-157e1cc89bfb.sql`
- `20260730025843_e160c294-c198-47bc-8cab-cebd24105248.sql`
- `20260730025923_7c153213-e2a8-4b97-8627-c20a416ba15f.sql`

Eles criavam fixtures, apagavam evidências/dados, usavam
`ALTER TABLE ... DISABLE TRIGGER` e dependiam de dados existentes.
Foram **removidos de `supabase/migrations/`** e preservados aqui, apenas como
referência histórica, com extensão `.sql.txt` para que nenhum runner os execute:

- `harness-p1-p11-original.sql.txt`
- `harness-p1-p11-retry-original.sql.txt`
- `proofs-table-original.sql.txt`

A tabela de prova `public._motor_b2b_fase7_proofs` é somente de teste e deve
sair do schema promocional e de `types.ts` (drop idempotente).

## Regras obrigatórias para qualquer script deste diretório

1. Executar `_guard.sql` **antes de qualquer escrita**. Ele exige
   `marker='STAGING'` **e** `project_ref='ikaauvsflpmamgxmkhoq'` e recusa
   explicitamente produção `navfzbwgwzruipouyfnk`.
2. Nenhum UUID real, nenhum usuário real hardcoded. Tudo por parâmetro
   (`psql -v partner_id=... -v user_id=...`).
3. Preferir transação **rollback-only** (`BEGIN; ... ROLLBACK;`).
4. **Proibido** `ALTER TABLE ... DISABLE TRIGGER`. Se for necessário persistir
   evidência, remover fixtures pela RPC canônica, em ordem de FK.
5. Ao final, provar: todos os triggers `enabled` e zero fixture órfã.

## Uso

```bash
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 \
  -f restoration/audit/motor-b2b-fase7/_guard.sql \
  -f restoration/audit/motor-b2b-fase7/harness-rollback-only.sql
```

## Estado

O harness rollback-only cobre apenas as pré-condições e a verificação de
integridade (triggers habilitados / ausência de órfãos). As provas de
concorrência multi-sessão (itens 4 e 5 da auditoria) **exigem duas conexões
simultâneas reais** e não foram executadas nesta entrega — ver
`docs/motor-b2b-fase7-certificacao-final.md`, seção de pendências.
