# Fase Fiscal 3.0 — Harness RLS runtime

## Status
**HARNESS IMPLEMENTADO — EXECUÇÃO RUNTIME PENDENTE EM STAGING.**

Nenhum usuário foi criado no projeto real da AR Bio. Nenhum SQL foi executado no banco de produção durante esta fase.

## O que foi entregue
- `src/test/fiscal/rls/matrix.ts` — matriz declarativa 15 perfis × 9 tabelas × 4 operações + 5 views + 1 RPC.
- `src/test/fiscal/rls/runner.ts` — executor via PostgREST + PG client.
- `src/test/fiscal/rls/harness.test.ts` — vitest com skip explícito quando envs de staging estão ausentes.
- `src/test/fiscal/rls/mask.sql.test.ts` — validação runtime de `mask_sensitive_jsonb`.

## Perfis cobertos (15)
`administrador`, `gestor`, `financeiro`, `administrativo`, `gestor_comercial`,
`consultor_tecnico`, `tecnico_agronomo`, `aplicador`, `operador_onfarm`,
`producao`, `cliente_produtor`, `parceiro_b2b`, `parceiro_b2b_tecnico`,
`authenticated_sem_papel`, `anon`.

## Alvos cobertos
- 9 tabelas: `company_fiscal_settings`, `product_fiscal_profiles`, `service_fiscal_profiles`, `customer_fiscal_profiles`, `fiscal_invoices`, `fiscal_invoice_items`, `fiscal_events`, `fiscal_idempotency_keys`, `fiscal_audit_log`.
- 5 views: `v_fiscal_products_readiness`, `v_fiscal_services_readiness`, `v_fiscal_customers_readiness`, `v_fiscal_company_readiness`, `v_fiscal_invoices_summary`.
- 1 RPC: `rpc_fiscal_event_manual`.

## Operações
`SELECT`, `INSERT`, `UPDATE`, `DELETE` via PostgREST. Views testadas com SELECT. RPC testada com POST.

## Como executar em staging (fora do sandbox)

Pré-requisitos: banco de staging isolado (nunca produção) com os 15 perfis já semeados e JWTs sintéticos válidos gerados pelo próprio Supabase Auth.

```sh
export PGURL_STAGING='postgres://.../postgres'   # staging isolado
export PGREST_STAGING='https://<staging-ref>.supabase.co/rest/v1'
export PGREST_ANON_KEY='<anon key do staging>'

# 15 JWTs sintéticos — gerados no ambiente isolado, NUNCA persistidos no repo.
export JWT_ADMINISTRADOR='...'
export JWT_GESTOR='...'
# ... (demais 13)

bunx vitest run src/test/fiscal/rls
```

Sem os envs, o harness roda com skip explícito e mensagem: `EXECUÇÃO RUNTIME PENDENTE EM STAGING`.

## Interpretação
- `passed`: `observed === expected` (allow/deny).
- `failed`: divergência entre esperado e observado — bloqueante.
- `skipped`: JWT ausente ou envs incompletos.

## Regras de segurança
- Nunca exportar JWTs, connection string ou access token em arquivos do repo.
- Nunca apontar `PGURL_STAGING` para o projeto real da AR Bio.
- Nunca criar/excluir usuários no projeto real. Semear apenas em staging isolado.
