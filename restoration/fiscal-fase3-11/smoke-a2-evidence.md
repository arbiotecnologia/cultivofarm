> **Supersessão 3.11.5 (adendo, texto histórico preservado abaixo):**
> A pendência descrita na seção "O que este arquivo NÃO certifica" foi
> superada pela execução completa da matriz de 677 asserções no staging
> temporário `ikaa***hoq`, commit `49c58e5871b14d99cc7a61c2cea7d19a703c1a95`,
> classificação **APTO**. Detalhes em
> [`docs/fiscal-fase3-11-5-certificacao-runtime.md`](../../docs/fiscal-fase3-11-5-certificacao-runtime.md).
> Este arquivo continua registrando o smoke A.2 original (31 casos) como
> evidência histórica; não descreve nem substitui a execução runtime da
> Fase 3.11.

# Evidência Smoke A.2 — Fase Fiscal 3.0.2

**Origem:** execução manual no SQL Editor do staging temporário (Supabase).
**Data:** 21/07/2026.
**Project ref (mascarado):** `ikaa***hoq`.
**Marker confirmado:** `public._fiscal_staging_marker.marker='STAGING'`.

## Resultado

| Métrica | Valor |
|---|---|
| Planejadas | 31 |
| Executadas | 31 |
| Aprovadas | 31 |
| Falhas | 0 |
| Erros | 0 |
| Skipped | 0 |

## Resíduos após teardown

users=0, clients=0, invoices=0, events=0, receivables=0.

## Escopo aprovado

- Isolamento produtor A/B por AR e por entrega.
- Bloqueio de DELETE em `fiscal_invoices` para todos os perfis.
- Leituras autorizadas para admin/gestor/financeiro.
- RPC `rpc_fiscal_event_manual` autorizada (staff) e bloqueada (demais).
- Bloqueio a parceiro/anon/sem papel.
- `mask_sensitive_jsonb` recursiva.

## O que este arquivo NÃO certifica

O harness completo da Fase 3.11 (677 asserções cobrindo 15 perfis × 9
tabelas × 4 ops + 5 views + RPC + ownership) ainda **não foi executado**.
Esta evidência cobre apenas os 31 casos smoke.

Para certificar o harness completo executar
`scripts/fiscal-staging-rls-certify.sql` no SQL Editor do staging temporário
seguindo `docs/fiscal-fase3-11-rls-sql-native.md`.
