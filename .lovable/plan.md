## Fase Fiscal 2.1 — Hardening da Fundação Fiscal

Escopo estritamente aditivo e defensivo. Sem provedor, sem certificado, sem token, sem webhook, sem homologação, sem produção, sem alterar regras financeiras/motor B2B. Nada da Fase Fiscal 3 será iniciado.

### 1. Reconciliação da migration (canonizar)
1. Snapshot atual do banco: `pg_dump --schema-only` das 8 tabelas novas + colunas aditivas de `fiscal_invoices`/`financial_documents` + views (via `psql`) → `restoration/fiscal_fase2_applied_schema.sql` (referência).
2. Copiar `restoration/fiscal_fase2_fundacao.sql` para `supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql`, envelopando **todo** DDL em guards idempotentes: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE VIEW/FUNCTION`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`, `CREATE TRIGGER` protegido por `pg_trigger` lookup.
3. Registrar no `supabase_migrations.schema_migrations` a versão `20260721000000` sem re-executar o SQL (INSERT direto via `psql`), documentando o procedimento em `docs/fiscal-fase2-1-reconciliacao.md`.
4. Manter `restoration/fiscal_fase2_fundacao.sql` como referência histórica com header apontando para a migration canônica.
5. Testar reprodutibilidade em base local vazia (dockerized `postgres:15` + extensões básicas) executando **apenas** a migration versionada.

### 2. Auditoria do schema real
Coletar via `information_schema` + `pg_catalog`:
- tabelas, colunas, tipos, defaults, nullability, checks, FKs, uniques, índices, triggers, funções, policies, grants, owners, `reloptions` das views.
- Diff triplo: (planejado no plano) × (migration canônica) × (schema aplicado). Divergências publicadas em `docs/fiscal-fase2-1-schema-diff.md`.

### 3. Correção da unicidade por ambiente (migration aditiva `20260721000001_fiscal_fase2_1_uniqueness.sql`)
- `DROP INDEX IF EXISTS` do unique antigo `(document_model, series, invoice_number, company_cnpj)`.
- `CREATE UNIQUE INDEX ... (company_cnpj, document_model, environment, series, invoice_number) WHERE …`.
- Reavaliar `(provider, environment, provider_reference)` — incluir `document_model` se for necessário.
- **Não** tocar em `access_key` unique.

### 4. FKs e ON DELETE (migration `20260721000002_fiscal_fase2_1_fks.sql`)
Padrão alvo:
- `product_fiscal_profiles.product_id` → `RESTRICT`
- `customer_fiscal_profiles.customer_id` → `RESTRICT`
- `fiscal_invoice_items.fiscal_invoice_id` → `CASCADE` (documentado)
- `fiscal_events.fiscal_invoice_id` → `RESTRICT`
- `fiscal_idempotency_keys.fiscal_invoice_id` → `SET NULL`
- `financial_documents.fiscal_invoice_id` → `RESTRICT`
- `parent_invoice_id`, `substitution_invoice_id` → `RESTRICT`
Usar `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ...` idempotente.

### 5. Endurecimento de `fiscal_events` (migration `…_events_hardening.sql`)
- `REVOKE INSERT/UPDATE/DELETE` de authenticated.
- Bloquear `UPDATE`/`DELETE` por policy `USING (false)`.
- RPC `rpc_fiscal_event_manual(p_invoice_id, p_event_type, p_notes)` `SECURITY DEFINER`, `search_path=public`, whitelisting apenas `MANUAL_NOTE`, `MANUAL_CORRECTION`, `MANUAL_RECONCILIATION`. `event_source='USER'`, `performed_by=auth.uid()`. Rejeita `PROVIDER|WEBHOOK|SYSTEM|SEFAZ|NFSE_NACIONAL`.
- Grant `EXECUTE` a `administrador|gestor|financeiro` via check interno da própria função.

### 6. Endurecimento de `fiscal_audit_log` (migration `…_audit_hardening.sql`)
- Revisar `public.fiscal_audit_trigger`: `SECURITY DEFINER`, `SET search_path = public, pg_temp`, referências schema-qualificadas.
- `REVOKE ALL ON fiscal_audit_log FROM authenticated` (só `SELECT` para `administrador`); INSERT apenas via trigger.
- Allowlist de tabelas auditadas dentro do trigger.
- Função `mask_sensitive_jsonb(jsonb)` removendo chaves: `authorization|token|password|senha|certificate|certificado|private_key|secret|pfx|p12|Authorization` (case-insensitive). Aplicada em `old_data`/`new_data` antes do INSERT.
- `performed_by := auth.uid()` sempre — nunca do payload.

### 7. Views: garantir `security_invoker=true`
Migration `…_views_security_invoker.sql`: `ALTER VIEW … SET (security_invoker = true)` em todas as 5 views. Confirmar via `pg_class.reloptions`.

### 8. Decisão sobre perfil `administrativo` em `fiscal_invoice_items`
Proposta: **remover** SELECT (justificativa: administrativo cuida de faturamento agregado, não de linhas fiscais). Migration `…_admin_items_revoke.sql` com `DROP POLICY` correspondente. Decisão registrada em `docs/fiscal-fase2-1-relatorio.md`.

### 9. Testes de RLS reais em banco (novo diretório `src/test/fiscal/rls/`)
Suíte usando `pg` client conectando via `PGHOST` com cada JWT sintético (obtidos via `admin-create-user` já existente ou tokens gerados). Cobre 15 perfis × 8 tabelas × 4 operações. Ambiente pulável quando `PGHOST` ausente (skip com aviso), garantindo CI local. Também um teste PostgREST via `fetch` para 3 tabelas críticas.

### 10. Testes de constraints e substituição (`src/test/fiscal/constraints.test.ts`)
Inserções via `psql` numa transação `ROLLBACK`-only cobrindo os 11 casos listados. Ciclos de substituição detectados por trigger (adicionar em `…_substitution_guard.sql` se não existir).

### 11. Testes de backfill sintético (`src/test/fiscal/backfill.test.ts`)
Cria banco temporário (docker), carrega 12 registros pré-migration, aplica a migration versionada, valida cada asserção da spec (§10).

### 12. Regeneração de tipos
Executar geração de tipos Supabase → `src/integrations/supabase/types.ts`. Substituir os `as any` já introduzidos onde possível. Nenhum `@ts-ignore` novo.

### 13. Testes de interface
Snapshot/contract tests garantindo:
- Copy "Registro e acompanhamento…" presente.
- Banner respeita `isLoading`, `isError`, empty.
- Nenhum botão contendo "Emitir"/"Transmitir"/"Certificado" existe nas telas fiscais.

### 14. Grep de segurança + inventário de segredos
Script `scripts/fiscal-security-scan.sh` (novo) rodando `rg` para a lista de termos. Falha se qualquer match. Executar `secrets--fetch_secrets` para confirmar ausência de segredos fiscais.

### 15. Validações finais
- `bun run typecheck`
- `bun run build`
- `bunx vitest run`
- `bun run lint` (registro)
- ESLint focado apenas em arquivos alterados

### Entregáveis
- `supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql` (canônica idempotente)
- `supabase/migrations/2026072100000{1..7}_*.sql` (hardening incremental)
- `docs/fiscal-fase2-1-reconciliacao.md`
- `docs/fiscal-fase2-1-schema-diff.md`
- `docs/fiscal-fase2-1-relatorio.md` (itens A–AC)
- `src/test/fiscal/rls/*`, `src/test/fiscal/constraints.test.ts`, `src/test/fiscal/backfill.test.ts`, `src/test/fiscal/ui.copy.test.tsx`
- `scripts/fiscal-security-scan.sh`
- `src/integrations/supabase/types.ts` regenerado

### Fora de escopo (bloqueado)
Emissão real, Focus/SEFAZ/NFS-e, certificados, tokens, webhooks fiscais, Edge Functions fiscais, mudanças em regras financeiras/motor B2B/entregas/estoque, ativação de produção, unicidade em `receivable_id`/`delivery_id`, início da Fase Fiscal 3.

### Detalhes técnicos
```text
Ordem de execução:
  1. Snapshot          -> restoration/fiscal_fase2_applied_schema.sql
  2. Migration canônica -> insert em schema_migrations (sem reaplicar)
  3. Migrations de hardening (idempotentes) aplicadas via psql
  4. Regeneração de tipos
  5. Suítes: rls -> constraints -> backfill -> ui -> security-scan
  6. typecheck / build / vitest / lint
  7. Relatório A-AC
```

Aguardando autorização explícita para executar. Confirmo que aplico as migrations via a connection string já em uso ou prefere revisar cada arquivo SQL antes?
