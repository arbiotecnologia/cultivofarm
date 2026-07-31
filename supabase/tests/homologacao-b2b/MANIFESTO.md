# Homologação B2B — Manifesto de Promoção

Ambiente exclusivo: staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` não foi acessada.

## 1. Promocional (production-safe, permanece em `supabase/migrations/`)
- Índice único de recebível ativo por pedido B2B + lock consultivo em `generate_b2b_receivable_secure`.
- Revogações de EXECUTE (`rpc_cc_simulate_price`, helpers de precificação).
- Matriz de condições (`commercial_condition_item_prices`), assignments e `fiscal_operation_policies`.

## 2. Staging-only — NÃO promover (`supabase/tests/homologacao-b2b/01-staging-infra/`)
- `010_evidence_table.sql` — tabela de evidência de homologação.
- `020_fiscal_mock_adapter_v1.sql`, `021_fiscal_mock_adapter_v2.sql` — versões anteriores do adapter simulado.
- `022_fiscal_mock_adapter_v3_hardened.sql` — adapter atual: guarda de staging, exige administrador
  autenticado, resolve NCM/CFOP/CST/CSOSN/origem do perfil fiscal real, falha fechado com
  `FISCAL_PROFILE_INCOMPLETE`, diferencia `PRODUCT`/`MICROORGANISM` e confere soma dos itens.

## 3. Harness executável (nunca em `supabase/migrations/`)
- `supabase/functions/hml-b2b-runtime-harness/index.ts` — identidades Auth reais, matriz de 8 perfis,
  concorrência HTTP simultânea, paridade, gates e fiscal mock. Descobre a massa por código `HML-B2B-*`
  (sem UUID fixo) e faz cleanup transacional ao final.

## 4. Seed sintético (preservado até o fim da homologação)
- Planos `HML-B2B-A..D`, 4 assignments publicados, 9 preços de matriz, política fiscal NF-e,
  2 perfis fiscais sintéticos de produto. Todos inventariados em `public.hml_fixture_registry`.

## 5. Cleanup final
- `supabase/tests/homologacao-b2b/99-cleanup-final.sql` — idempotente, com guarda de staging.
  **Não executado nesta rodada** (a massa ainda é necessária para a homologação manual).

## Exclusões explícitas da cadeia promocional
Migrations de harness com UUIDs fixos (`_legacy_run1..5`) foram removidas do repositório.
