# Fase E — Homologação runtime e auditoria final (staging `ikaauvsflpmamgxmkhoq`)

Ambiente: **exclusivamente staging**. Produção `navfzbwgwzruipouyfnk` **não** foi acessada, alterada ou publicada.

## Defeitos encontrados nas Fases B–D e corrigidos

| # | Defeito | Correção |
|---|---------|----------|
| E1 | `authenticated` tinha `INSERT/UPDATE/DELETE/TRUNCATE` nas tabelas do motor comercial e de política fiscal | Grants reduzidos a `SELECT`; políticas `*_admin_manage` (ALL) substituídas por políticas de leitura. Escrita apenas via RPCs `SECURITY DEFINER` com auditoria |
| E2 | Itens `discount_from_base` eram publicados sem percentual, e `fn_resolve_commercial_price` só usava o desconto do plano | `commercial_price_rules.discount_percent` (0–100) + projeção na publicação + precedência item → plano no resolver, com `discount_source` no retorno |
| E3 | `rpc_cc_upsert_item_price` aceitava combinações incoerentes com o plano | `fn_cc_validate_item_input` fail-closed: modo divergente, preço fixo sem valor e desconto fora de faixa são recusados |

## Gates runtime executados (transação com ROLLBACK)

| Gate | Verificação | Resultado |
|------|-------------|-----------|
| G1 | Grants de `authenticated` nas 5 tabelas | `SELECT` apenas — **PASS** |
| G2 | Políticas RLS remanescentes | somente `SELECT` — **PASS** |
| G3a | Modo do item conflitante com o plano | recusado (`pricing_mode_conflicts_plan`) — **PASS** |
| G3b | Desconto 140% | recusado (`discount_percent_out_of_range`) — **PASS** |
| G3c | Item coerente | aceito — **PASS** |
| G4 | Precedência do desconto do item (33%) sobre o do plano (40%) | `discount_source=item_rule`, unitário 60,00 → 67,00 — **PASS** |
| G5 | Requisito fiscal sem política cadastrada | `required=true`, `PENDING_PARAMETRIZATION` (fail-closed) — **PASS** |

## Validações de repositório

- `tsgo --noEmit`: sem erros
- `vitest run`: 2664 testes, 2659 pass / 4 skip; 1 timeout intermitente em `portalAcompanhamentoProdutor.test.tsx` que passa isolado (10/10)

## Status

**🟢 FASE E CERTIFICADA EM STAGING** · **🔴 PRODUÇÃO NÃO EXECUTADA** (requer autorização humana explícita de promoção).
