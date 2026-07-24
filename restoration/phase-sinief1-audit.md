# Fase SINIEF 1 — Auditoria da modelagem canônica aditiva

Base normativa: Ajuste SINIEF 49/2025 consolidado pelos Ajustes SINIEF 8/2026, 15/2026 e 20/2026. Vigência: 03/08/2026.

Escopo: apenas modelagem de dados (DDL aditivo). Emissão real permanece bloqueada.

## Artefatos

| Papel | Caminho |
|---|---|
| Migration canônica executável (**divergência controlada**) | `restoration/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql` |
| Espelho a ser sincronizado externamente | `supabase/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql` (ainda **não** criado — sandbox bloqueou) |
| Teste estático | `src/test/fiscal/fase_sinief1.migration.static.test.ts` |

> **Nota de divergência controlada.** Nas fases anteriores a fonte executável ficava em `supabase/migrations/` e `restoration/` guardava apenas stub documental. Nesta fase, o sandbox do agente rejeitou a criação de qualquer arquivo novo em `supabase/migrations/` ("Files under supabase/migrations/ are managed by the migration system") e o projeto usa Supabase externo (Lovable Cloud desabilitado → `supabase--enable` é a única ferramenta da namespace, sem migration tool). Por isso a fonte executável canônica desta fase reside em `restoration/migrations/` e o humano deve copiá-la para `supabase/migrations/` com o mesmo nome antes de aplicar pelo pipeline oficial. O teste estático valida que, enquanto a duplicata não existir, permanece uma única fonte executável; ao existir, exige conteúdo idêntico.

## Matriz de campos em `public.fiscal_invoices` (todos NULLABLE)

| Coluna | Tipo | CHECK |
|---|---|---|
| `direction` | text | `IN ('OUT','IN')` |
| `fiscal_operation_type` | text | 8 valores: `NORMAL`, `ADVANCE_PAYMENT`, `EFFECTIVE_SALE_AFTER_ADVANCE`, `STOCK_LOSS`, `VALUE_QUANTITY_REDUCTION`, `DELIVERY_REFUSAL_TOTAL`, `DELIVERY_REFUSAL_PARTIAL`, `RECIPIENT_NOT_FOUND` |
| `fin_nfe` | smallint | `IN (1..6)` |
| `tp_nf_debito` | smallint | `BETWEEN 1 AND 99` |
| `tp_nf_credito` | smallint | `BETWEEN 1 AND 99` |
| `nature_operation` | text | livre (natOp) |
| `tax_authority_notes` | text | livre (`infAdFisco`) |
| `legal_basis` / `legal_version` / `legal_effective_date` | text/text/date | livres |

Índices parciais: `ix_fi_fiscal_operation_type`, `ix_fi_direction`.

## Novas tabelas

### `public.fiscal_invoice_references`
Vínculo N:1 entre documento atual e documento original.

- `relation_type IN ('ADVANCE_PAYMENT_OF','EFFECTIVE_SALE_OF','REDUCTION_OF','TOTAL_REFUSAL_OF','PARTIAL_REFUSAL_OF','RECIPIENT_NOT_FOUND_OF')`.
- Aceita `referenced_invoice_id` interno **e/ou** `referenced_access_key` externo (44 dígitos, regex validado).
- CHECK `chk_fir_has_target` garante pelo menos um alvo.
- CHECK `chk_fir_no_self_reference` impede autorreferência.
- Índice único composto por `(fiscal_invoice_id, relation_type, referenced_invoice_id, referenced_access_key)` — evita duplicatas.

### `public.fiscal_invoice_item_references`
DFeReferenciado por item (recusa parcial e redução por item).

- `reference_type IN ('PARTIAL_REFUSAL_ITEM','REDUCTION_ITEM')`.
- Campos positivos (`referenced_quantity > 0`, `referenced_value > 0`, `referenced_item_sequence > 0`) quando presentes.
- Mesmas garantias de alvo obrigatório e não-autorreferência.

### `public.fiscal_stock_loss_contexts`
Contexto legal para NF-e de perda (tpNFDebito=07).

- `legal_reason_category IN ('LOSS','PERISHMENT','DETERIORATION','THEFT','ROBBERY')`.
- `legal_reason_details` obrigatório e não-vazio (btrim).
- `lote_id` → **FK confirmada** para `public.lotes(id) ON DELETE SET NULL`.
- `movimentacao_id` → uuid **sem FK** (nenhuma tabela canônica de movimentação de estoque confirmada nas migrations). Documentado no SQL.
- UNIQUE por `fiscal_invoice_id` (1:1 com invoice).

## Ampliação de `public.fiscal_events.event_type`

CHECK reescrito preservando integralmente os 13 valores originais e adicionando 7 aditivos:

- `SINIEF_ADVANCE_PAYMENT_ISSUED`
- `SINIEF_EFFECTIVE_SALE_ISSUED`
- `SINIEF_STOCK_LOSS_ISSUED`
- `SINIEF_VALUE_QUANTITY_REDUCTION_ISSUED`
- `SINIEF_DELIVERY_REFUSAL_TOTAL_ISSUED`
- `SINIEF_DELIVERY_REFUSAL_PARTIAL_ISSUED`
- `SINIEF_RECIPIENT_NOT_FOUND_ISSUED`

Como `event_type` é `text` com CHECK (não enum), aplica-se `DROP CONSTRAINT + ADD CONSTRAINT` — não há `ALTER TYPE`. Nenhum valor legado removido; teste estático valida cada nome literal.

## RLS / GRANTs

Padrão canônico fiscal aplicado às três novas tabelas:

| Grant | Papel |
|---|---|
| `SELECT, INSERT` | `authenticated` |
| `ALL` | `service_role` |

Policies:

| Policy | Papéis |
|---|---|
| `<tabela>_read` (SELECT) | `administrador`, `gestor`, `financeiro`, `administrativo` |
| `<tabela>_insert` (INSERT) | `administrador`, `financeiro` |

**Nenhuma policy `UPDATE`/`DELETE`** — coerente com imutabilidade fiscal (`fiscal_events`, `fiscal_invoice_items_state_guard`). Nenhum bypass. Nenhuma RLS existente foi afrouxada.

## O que NÃO foi feito (por design)

- Nenhuma migration existente foi editada.
- Nenhum backfill de dados.
- Nenhum novo campo em `fiscal_invoice_items` (referências por item foram isoladas em tabela própria).
- Nenhum tipo TypeScript foi editado manualmente (`src/integrations/supabase/types.ts` intacto).
- Nenhuma alteração em provider, XML, edge functions, feature flags.
- Nenhum cálculo tributário, CFOP, CST, alíquota ou UF codificado — todos os campos ficam livres para preenchimento por domínio validado por contabilidade.

## Invariantes verificados por teste

- `FEATURE_FLAGS.fiscalEmissionEnabled === false`.
- `fiscal-preflight` continua com `canTransmit: false as const` e `provider: "NONE" as const`.
- Migration sem `sefaz`, `xml`, `transmit`, `focus_nfe` ou URL.
- Migration sem `DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE FROM`, nem `DROP CONSTRAINT` de PK/FK/UNIQUE.
- Stub restoration/ sem qualquer SQL executável.

## Checklist externo (a ser executado pelo humano fora do Lovable)

1. Aplicar `supabase/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql` no ambiente (staging → homologação → produção) via CI Supabase oficial.
2. Após aplicação, regenerar `src/integrations/supabase/types.ts` pelo procedimento oficial do projeto (mesmo usado nas fases anteriores). Somente depois disso as Fases 2+ poderão remover as boundaries locais.
3. Validar em banco que:
   - As três tabelas foram criadas com RLS habilitada.
   - Os CHECKs listados existem em `information_schema.check_constraints`.
   - `fiscal_events_event_type_check` inclui os 7 novos valores SINIEF.
4. Confirmar que `SELECT` das novas tabelas por role `authenticated` sem `administrador/gestor/financeiro/administrativo` retorna vazio (RLS).
5. Confirmar que `INSERT` das novas tabelas por role sem `administrador/financeiro` retorna `permission denied`.

## Riscos

| Risco | Mitigação |
|---|---|
| Regeneração de `types.ts` depende de acesso externo ao Supabase | Fases 2+ manterão boundary local até regeneração oficial. |
| `movimentacao_id` sem FK pode virar órfão | Documentado; validação futura no domínio. Não inventar tabela. |
| CHECK reescrito de `fiscal_events_event_type_check` afeta triggers/gravações concorrentes durante migration | Migration transacional (`BEGIN/COMMIT`); janela curta. |
| UF/alíquota/CFOP dependem de contabilidade | Todos os campos ficam livres; nenhuma heurística. |

## Classificação

**APTO PARA FASE 2**, condicionado a:

1. Aplicação externa da migration canônica.
2. Regeneração oficial de `types.ts` antes da Fase 2 remover boundaries locais.
3. Manutenção de `fiscalEmissionEnabled=false` e `provider=NONE`/`canTransmit=false`.

Não avançar sem prompt específico para a Fase 2.
