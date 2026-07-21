# Fase Fiscal 3.0 — Complemento (regras adicionais aceitas)

Este documento registra as regras adicionais impostas no aceite parcial da Fase 3.0 e como cada uma foi endereçada. **A Fase 3.1 permanece bloqueada** até execução externa dos gates pendentes.

## 1. Stubs em `restoration/migrations/` NÃO são executados

- Fonte canônica: `supabase/migrations/` (única lida pelo Supabase CLI e pelo runner de deploy).
- `restoration/migrations/*.sql` foram reduzidos a headers de aviso (sem DDL executável). Um `grep -n 'CREATE\\|ALTER\\|DROP'` retorna vazio nesses arquivos.
- Nenhum script do repositório aponta o CLI para `restoration/` (`rg -n 'restoration/migrations' -g'!docs' -g'!*.md'` retorna apenas referências textuais). Verificado nesta fase.

## 2. Verificador de `types.ts` ampliado

`scripts/verify-fiscal-types.ts` agora valida, por whitelist:

- **Tabelas** (9): existência do bloco `Row/Insert/Update`.
- **Colunas obrigatórias**: nome, tipo TS (quando declarado) e nullable (`| null`).
- **Views** (5): existência + colunas mínimas.
- **RPCs** (`rpc_fiscal_event_manual`, `mask_sensitive_jsonb`): argumentos e tipo de retorno.
- **Relacionamentos** FK principais (`product_id`, `service_id`, `customer_id`, `invoice_id`).

Falha com exit 1 detalhando cada divergência.

## 3. Relatório runtime do harness RLS

O `runner.ts` já expõe `summarize()` com `total`, `passed`, `failed`, `skipped`. Ao rodar em staging, o relatório complementar deverá conter:

- asserções **planejadas** (630);
- **executadas** (`total - skipped`);
- **aprovadas** (`passed`);
- **falhas** (lista detalhada com role/target/operation/HTTP);
- **skips** com motivo (JWT ausente etc.).

## 4. Verificação de backfill ampliada

`restoration/backfill-fiscal-fase3/03-verify.sql` passa a registrar:

- contagem **antes** e **depois** por entidade (`_backfill_baseline`);
- **perda de registros** (falha se `after < before`);
- **órfãos** em `legacy_invoices`;
- **conflitos de índice** por environment;
- ausência de **AUTHORIZED** indevido pré-emissão;
- **preservação de anexos** legados (quando a coluna existir);
- **preservação de status legado** (quando a coluna existir);
- resposta funcional de `mask_sensitive_jsonb` no schema isolado.

## 5. Cobertura ampliada do teste SQL de mascaramento

`src/test/fiscal/rls/mask.sql.test.ts` cobre:

- objetos aninhados;
- arrays simples;
- arrays de objetos;
- headers (`Authorization`, `apikey`);
- case-insensitive (`TOKEN`, `Token`, `token`, `Password`, `SENHA`);
- payload nulo;
- payload grande (500 chaves + sensíveis intercaladas).

Skip explícito sem `PGURL_STAGING`.

## Entregáveis do complemento

Quando o responsável fornecer `types.ts` regenerado + logs de staging, o relatório final terá seções A–M:

A. Tipos regenerados · B. Verificador de tipos · C. Typecheck · D. Ambiente staging · E. Backfill · F. Matriz RLS · G. Views · H. RPC · I. Mascaramento SQL · J. Falhas · K. Gates aprovados · L. Gates pendentes · M. Recomendação sobre 3.1.

**Fase 3.1 não será iniciada automaticamente.**
