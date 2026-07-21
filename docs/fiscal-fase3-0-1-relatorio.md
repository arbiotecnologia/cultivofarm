# Fase Fiscal 3.0.1 — Relatório de correção dos Gates Técnicos

## Status
**PLANO CORRETIVO ENTREGUE — EXECUÇÃO SQL/RLS PENDENTE EM STAGING ISOLADO.**

Nenhuma migration foi aplicada ao projeto real. Nenhum usuário criado.
Nenhum secret/PAT solicitado. Nenhum provedor fiscal contatado.

## Escopo entregue nesta subfase

### 1. Inventário do schema real
`docs/fiscal-fase3-0-1-inventario.md` — 9 tabelas, 5 views, 1 RPC, 1 função
de mascaramento. Fonte-de-verdade única para verificador e RLS.

### 2. Verificador estático corrigido
- `scripts/verify-fiscal-types.ts` — whitelist alinhada às colunas/nullables
  reais das migrations `20260721000000` e `20260721010000`.
- `src/test/fiscal/verify-fiscal-types.test.ts` — 4 fixtures unitárias
  cobrindo happy-path, coluna faltante, nullable divergente e assinatura de
  RPC divergente (4/4 pass).

### 3. Migration corretiva
`restoration/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql` —
aditiva, transacional, idempotente:
- FK condicional `product_fiscal_profiles.product_id → produtos(id)` (RESTRICT).
- FK condicional `customer_fiscal_profiles.customer_id → clientes(id)`.
- `service_fiscal_profiles`: sem FK; índices únicos parciais em `service_id`
  e `source_reference` (`is_active=true`).
- `fiscal_events.fiscal_invoice_id`: `NOT NULL` apenas se banco limpo.
- `fiscal_events.notes text`: coluna aditiva.
- `mask_sensitive_jsonb`: **reescrita realmente recursiva** (percorre objetos
  e arrays; 18 termos sensíveis).
- `rpc_fiscal_event_manual(uuid,text,text)`: valida existência do invoice e
  event_type via allowlist; `notes` persistido; `REVOKE public,anon` +
  `GRANT authenticated`.
- `v_fiscal_document_reconciliation_pending`: filtro explícito por
  `has_role` (admin/gestor/financeiro).

> ⚠️ O arquivo mora em `restoration/migrations/` porque o sandbox rejeita
> gravação direta em `supabase/migrations/`. Antes da execução externa em
> staging, promover byte-a-byte para
> `supabase/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql`.

### 4. Matriz RLS por-tabela
`src/test/fiscal/rls/matrix.ts` — 15 perfis × 9 tabelas × 4 operações + 5
views + 1 RPC. Cada célula reflete as policies aplicadas (write DENY em
`fiscal_events`/`fiscal_audit_log`, SELECT DENY em `fiscal_invoice_items`
para `administrativo`, etc.).

### 5. Runner com fixtures
`src/test/fiscal/rls/runner.ts` — classifica HTTP (2xx=allow, 401/403=deny,
404/409=deny). Skip explícito na ausência de envs; nunca silêncio.

### 6. Guard anti-produção
`src/test/fiscal/rls/guard.ts` — aborta se `PGURL_STAGING` ou `PGREST_STAGING`
contiverem `navfzbwgwzruipouyfnk`. `restoration/backfill-fiscal-fase3/03-apply.sh`
executa a mesma heurística em bash.

### 7. Backfill redesenhado (schema real)
`restoration/backfill-fiscal-fase3/`:
- `01-prepare.sql` — marker `_fiscal_staging_marker` + 10 fixtures em
  `public.clientes`/`public.fiscal_invoices` cobrindo PENDING/ISSUED/
  CANCELED/ERROR, com/sem access_key, múltiplos por cliente, manual e
  externo.
- `02-baseline.sql` — snapshot **ANTES** em `fiscal_backfill_audit.baseline`.
- `03-apply.sh` — aplica `20260721000000` → `20260721010000` →
  `20260722000000` em ordem; aborta se `PGURL` for produção.
- `04-verify.sql` — compara baseline × pós-migration, checa órfãos, garante
  que ISSUED **não** virou AUTHORIZED, valida metadados legados
  (`document_origin='MANUAL_RECORD'`, `normalized_status='LEGACY_RECORDED'`,
  `provider='NONE'`, `environment='NOT_CONFIGURED'`) e presença de 5 índices
  críticos.
- `99-cleanup.sql` — DROP total do ambiente isolado.

### 8. Scanner de segredos ampliado
`scripts/fiscal-security-scan.sh` — cobre `SERVICE_ROLE_KEY`, `DB_PASSWORD`,
`.p12`/`.pfx`/`.pem`, além dos padrões de PAT e senha do banco anteriores.
Saída mascarada.

### 9. Mascaramento — teste SQL exigente
`src/test/fiscal/rls/mask.sql.test.ts` — falha explicitamente se `pg` estiver
ausente durante execução em staging (skip silencioso proibido).

## Validação executada no sandbox
- `bun run typecheck` — **PASS**.
- `bunx vitest run src/test/fiscal` — **27 pass / 4 skip** (skips = harness
  RLS runtime e teste SQL real, ambos exigem envs de staging isolado).
- `scripts/fiscal-security-scan.sh` — sem hits.

## O que NÃO foi feito (deliberadamente)
- Executar a migration `20260722000000` em qualquer banco.
- Executar o harness RLS contra qualquer banco.
- Aplicar backfill em qualquer banco.
- Solicitar/usar PAT, service_role, connection string ou senha.
- Alterar `20260721000000` ou `20260721010000` (imutáveis pós-aplicação).

## Próximo passo (fora do sandbox)
1. Promover `restoration/migrations/20260722000000_*.sql` para
   `supabase/migrations/` byte-a-byte.
2. Provisionar Postgres Docker isolado; rodar 01→02→03→04 do backfill.
3. Semear 15 JWTs sintéticos no staging; exportar envs; rodar `bunx vitest
   run src/test/fiscal/rls`.
4. Anexar evidências (baseline vs pós-migration; matriz RLS 630 células) ao
   fechamento formal desta subfase antes de iniciar a 3.1.
