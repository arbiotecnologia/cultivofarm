# Fase Fiscal 3.0.2-A.2 — Certificação

## Escopo

Registro formal das evidências de smoke SQL executado em staging isolado e
delimitação clara do que **ainda não** foi certificado (matriz HTTP/JWT
completa via harness Node).

## Ambiente

- Project ref temporário: validado e **≠** `navfzbwgwzruipouyfnk` (produção).
- Marker `_fiscal_staging_marker` com `marker='STAGING'` e `project_ref`
  igual ao esperado — confirmado.
- 489 migrations canônicas aplicadas em ordem cronológica.
- Última migration aplicada: `20260722000000_fiscal_fase3_0_1_integridade.sql`.

## Objetos verificados

- 9 tabelas fiscais: `company_fiscal_settings`, `product_fiscal_profiles`,
  `service_fiscal_profiles`, `customer_fiscal_profiles`, `fiscal_invoices`,
  `fiscal_invoice_items`, `fiscal_events`, `fiscal_idempotency_keys`,
  `fiscal_audit_log`.
- 5 views: `v_fiscal_company_readiness`, `v_product_fiscal_readiness`,
  `v_service_fiscal_readiness`, `v_customer_fiscal_readiness`,
  `v_fiscal_document_reconciliation_pending`.
- 3 FKs esperadas confirmadas (`product_id`, `customer_id`, `fiscal_invoice_id`).
- `fiscal_events.fiscal_invoice_id` **NOT NULL**.
- `public.get_cliente_ids_for_user(uuid) RETURNS uuid[]` presente.

## Smoke SQL (contexto de role/JWT claims): 31/31 aprovados

Perfis cobertos: `administrador`, `gestor`, `financeiro`, produtor A,
produtor B, parceiro, `authenticated_sem_papel`, `anon`.

- Leitura de `fiscal_invoices` para staff: allow.
- Produtor A vê o próprio invoice (via `accounts_receivable`): allow.
- Produtor B **não** vê invoice alheio de A: deny (0 linhas).
- Parceiro/sem papel/anon: deny em todas as leituras fiscais.
- `rpc_fiscal_event_manual`: allow para staff, deny para os demais.
- `mask_sensitive_jsonb`: recursiva aprovada (objetos, arrays, chaves aninhadas).

## Teardown

Confirmado zero remanescente em: usuários sintéticos, `clientes`, `profiles`,
`user_clientes`, `user_roles`, `accounts_receivable` sintéticas, `fiscal_invoices`,
`fiscal_events`, `fiscal_invoice_items`, `fiscal_audit_log` fiscal.

## Reprodutibilidade

Ver `scripts/fiscal-staging-a2-smoke.sql`. O script:
- exige `fiscal.expected_project_ref` via `SET`;
- valida marker;
- aborta com `RAISE EXCEPTION` se apontar para produção;
- executa em transação com `ON_ERROR_STOP`;
- limpa artefatos pelo prefixo `FISCAL_TEST_A2_SMOKE_`.

Nenhuma credencial, project ref real ou senha está persistida no arquivo.

## Gates aprovados

- Smoke SQL em contexto de role/JWT claims (31/31).
- Marker + project_ref verificados.
- Teardown zero.
- `mask_sensitive_jsonb` recursiva.

## Gates ainda pendentes

- **Matriz HTTP/JWT completa via harness Node** (`src/test/fiscal/rls/`)
  permanece pendente até que as 6 envs de staging (`FISCAL_TEST_ENV`,
  `FISCAL_TEST_PROJECT_REF`, `PGURL_STAGING`, `PGREST_STAGING`,
  `PGREST_ANON_KEY`, `PGREST_SERVICE_ROLE_KEY`) sejam provisionadas
  externamente. **Sem aprovação simulada**: o teste de configuração parcial
  falha, o de ausência total dá skip explícito, e o runtime só é acionado
  quando as 6 envs coexistem com marker válido.

## Não escopo

Emissão externa, provedor fiscal, certificados/tokens, telas de UI, migrations
adicionais e Fase 3.1 permanecem fora deste marco.
