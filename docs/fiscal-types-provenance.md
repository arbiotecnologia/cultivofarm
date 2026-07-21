# Fase Fiscal 3.0.2-D.1 — Proveniência de `src/integrations/supabase/types.ts`

## Origem do contrato

Os tipos fiscais adicionados a `src/integrations/supabase/types.ts` nesta fase
foram derivados **exclusivamente** das seguintes migrations canônicas, já
auditadas e aplicadas externamente em staging certificado:

- `supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql`
- `supabase/migrations/20260721010000_fiscal_fase2_1_hardening.sql`
- `supabase/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql`

**Nenhum tipo foi obtido do banco principal (`navfzbwgwzruipouyfnk`).** O
sandbox não teve acesso ao Data API nem ao Postgres em produção durante esta
fase. Nenhum secret foi consumido, nenhuma migration foi aplicada, nenhum
provedor fiscal foi acionado.

## Entidades adicionadas (aditivas)

**Tabelas (9)**: `company_fiscal_settings`, `product_fiscal_profiles`,
`service_fiscal_profiles`, `customer_fiscal_profiles`, `fiscal_invoices`
(colunas novas: `company_cnpj`, `document_model`, `document_origin`,
`environment`, `provider`, `provider_reference`, `provider_status_raw`,
`idempotency_key`, `normalized_status`, `source_type`, `source_id`,
`parent_invoice_id`, `substitution_invoice_id`, `authorized_at`, `rejected_at`,
`canceled_at`, `cancel_reason`, `reconciliation_status`, `company_snapshot`,
`customer_snapshot`, `fiscal_totals_snapshot`, `payload_schema_version`,
`locked_at`, `locked_by`), `fiscal_invoice_items`, `fiscal_events`
(com `fiscal_invoice_id` **NOT NULL**), `fiscal_idempotency_keys`,
`fiscal_audit_log`.

**Views (5)**: `v_fiscal_company_readiness`, `v_product_fiscal_readiness`,
`v_service_fiscal_readiness`, `v_customer_fiscal_readiness`,
`v_fiscal_document_reconciliation_pending`.

**Funções (2)**: `rpc_fiscal_event_manual(p_invoice_id uuid, p_event_type text,
p_notes text DEFAULT NULL) → uuid` e `mask_sensitive_jsonb(v jsonb) → jsonb`.

**Relacionamentos declarados**:
- `product_fiscal_profiles.product_id → produtos.id`
- `customer_fiscal_profiles.customer_id → clientes.id`
- `fiscal_invoice_items.fiscal_invoice_id → fiscal_invoices.id`
- `fiscal_events.fiscal_invoice_id → fiscal_invoices.id`
- `fiscal_idempotency_keys.fiscal_invoice_id → fiscal_invoices.id`
- (preservados) FKs pré-existentes de `fiscal_invoices` para `financial_documents`,
  `entregas`, `accounts_receivable`.

## Garantias

- Zero `any`, zero `Record<string, any>`, zero `@ts-ignore`, zero cast de
  conveniência introduzido.
- Nullability estrita: colunas `NOT NULL` na migration aparecem sem `| null`;
  colunas anuláveis aparecem com `| null`.
- Nenhuma entidade antiga do `types.ts` foi removida ou alterada em sua
  semântica de contrato — a única tabela modificada foi `fiscal_invoices`, e
  apenas com **adições** de colunas.
- `scripts/verify-fiscal-types.ts` executa contra o arquivo real e retorna OK
  (9 tabelas, 5 views, 2 RPCs).

## Dívida residual — obrigatória antes do deploy em produção

Este arquivo **ainda deve ser substituído pela geração oficial do Supabase**
(`supabase gen types typescript --project-id navfzbwgwzruipouyfnk`) antes de
qualquer deploy em produção. A regeneração oficial é a única fonte autoritativa
para tipos e deve produzir um diff limitado a:

1. Reformatação padrão do CLI (ordem de colunas, alias, comentários).
2. Eventual inclusão de FKs auto-detectadas adicionais que não constam nas
   migrations canônicas (checkpoint: nenhum FK novo deve ser silenciosamente
   removido do bloco fiscal).
3. Refino de tipos de colunas `jsonb`/`timestamptz`/`numeric` que aqui foram
   normalizados como `Json`/`string`/`number`.

Se o diff da regeneração oficial trouxer divergência de nullability, coluna
ausente ou coluna extra em relação às três migrations canônicas, isso é
sinal de que schema em produção divergiu do canônico e deve ser reconciliado
**antes** do deploy.

## Como validar

```sh
bunx tsx scripts/verify-fiscal-types.ts
bun run typecheck
bun run build
bunx vitest run src/test/fiscal
bash scripts/fiscal-secrets-scan.sh
bash scripts/fiscal-integration-scan.sh
```

Todos devem sair verde. Divergência do verificador em relação às migrations é
bloqueante — não editar tipos manualmente para “consertar”; corrigir a migration
ou reportar.

---

## Fase Fiscal 3.1.1 — Correção de posicionamento das views (2026-07-22)

Diagnóstico: na aplicação manual do contrato durante a Fase 3.0.2-D.1, as cinco
views fiscais foram inseridas dentro do bloco `Database["public"]["Functions"]`
por descolamento das chaves de fechamento da função
`get_financial_dre_summary`. Isso produzia dois defeitos observáveis:

1. `.from("v_fiscal_company_readiness")` (e demais views) era rejeitado pelo
   tipo, pois o cliente Supabase busca views em `Database["public"]["Views"]`.
2. O bloco `Functions` continha entradas com formato de tabela (`Row/Insert/
   Update/Relationships`), o que não corresponde ao formato oficial gerado por
   `supabase gen types`.

Correção aplicada de forma **estritamente aditiva/estrutural**, sem alterar
colunas, nullability, tipos TS ou relacionamentos:

- Fechada a chave da função `get_financial_dre_summary`.
- Movidas as cinco views fiscais para `Database["public"]["Views"]`:
  `v_fiscal_company_readiness`, `v_product_fiscal_readiness`,
  `v_service_fiscal_readiness`, `v_customer_fiscal_readiness`,
  `v_fiscal_document_reconciliation_pending`.
- Mantidas em `Database["public"]["Functions"]` apenas as duas RPCs fiscais
  (`rpc_fiscal_event_manual`, `mask_sensitive_jsonb`) e a totalidade das
  funções pré-existentes.
- Nenhuma tabela, enum, relacionamento, RPC preexistente ou coluna foi
  removido ou modificado.

Verificador `scripts/verify-fiscal-types.ts` estendido para reprovar:

- view ausente do bloco `Views` (`kind: "view.section"`);
- view indevidamente presente no bloco `Functions` (`kind: "view.misplaced"`);
- RPC ausente do bloco `Functions` (`kind: "rpc.section"`);
- qualquer nome presente simultaneamente em `Views` e `Functions`
  (`kind: "duplicate.section"`).

Cobertura por testes negativos em `src/test/fiscal/verify-fiscal-types.test.ts`
(bloco “posicionamento estrutural (Fase 3.1.1)”).

Decisão sobre `src/pages/configuracoes/FiscalEmpresa.tsx`: mantido o cálculo
sintético `computeReadiness` em `src/hooks/useFiscalCompanySettings.ts`. A view
`v_fiscal_company_readiness` é agora tipada, mas ligá-la em runtime
depende de RLS validada em staging (fora do escopo desta fase, tratado na
3.0.2-B.1). Substituir o cálculo local por consulta à view é seguro e será
avaliado quando o harness RLS rodar no ambiente real.

## Obrigação de regeneração oficial

A obrigação declarada nas fases anteriores permanece: **antes de qualquer
promoção à produção**, `src/integrations/supabase/types.ts` deve ser regerado
pelo comando oficial `supabase gen types typescript --project-id <ref>` a partir
do staging certificado, substituindo integralmente o arquivo. O verificador
atual protege apenas contra regressões estruturais conhecidas — não substitui
a fonte-de-verdade gerada pelo Supabase.
