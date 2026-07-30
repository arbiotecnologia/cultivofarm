# Motor Comercial B2B — Fase 7: Certificação Final

**Ambiente exclusivo:** staging Supabase `ikaauvsflpmamgxmkhoq`.
**Produção `navfzbwgwzruipouyfnk`: não tocada, não promovida, não publicada.**

---

## VEREDITO (início)

> 🟢 **STAGING CERTIFICADO**
> 🔴 **PROMOÇÃO BLOQUEADA** — 19 migrations fiscais legadas dependentes de `_fiscal_staging_marker` impedem um pacote promocional reprodutível.
> ⚫ **PRODUÇÃO: NÃO APTO** (consequência direta do bloqueio de promoção).

Estes três estados são distintos e não devem ser lidos como equivalentes:

| Estado | Significado | Situação |
| --- | --- | --- |
| CERTIFICADO NO STAGING | Comportamento provado em runtime no staging | 🟢 atingido |
| APTO PARA PROMOÇÃO | Pacote de migrations reprodutível fora do staging | 🔴 bloqueado |
| APTO PARA PRODUÇÃO | Promoção validada + janela aprovada | ⚫ não avaliado |

---

## 1. Migration corretiva do fingerprint (reprodutível)

`supabase/migrations/20260730040000_fix_create_order_fingerprint_v2.sql` substitui
`create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)` por
`CREATE OR REPLACE FUNCTION` com corpo completo, explícito e versionado — **sem**
`pg_get_functiondef` + `replace` textual (padrão proibido desde a Fase 6).

- **Algoritmo:** `reqfp_v2` — SHA-256 hex (64) sobre payload canônico: parceiro, plano,
  itens normalizados e ordenados (tipo, id, quantidade, unidade), data de entrega,
  primeiro vencimento, número de parcelas, observações e demais parâmetros comerciais.
  `cart_hash` continua validado separadamente (assinatura de preço).
- **Legado:** linha de idempotência com `request_fingerprint IS NULL` não permite replay.
  Erro estável `idempotency_legacy_unverifiable`, zero criação; o cliente deve emitir nova chave.
- **Formato:** constraint garante SHA-256 hex de 64 caracteres quando não nulo.
- **Overloads:** auditados por `regprocedure`; assinatura única confirmada.
- **Grants:** `REVOKE ALL FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated, service_role`.

## 2. Gates server-side ausentes — corrigidos nesta rodada

A auditoria runtime encontrou **duas falhas reais** (não eram falhas do harness):

| Falha encontrada | Correção aplicada |
| --- | --- |
| Cobrança podia ser gerada para pedido ainda **não aprovado** (só bloqueava `cancelado`/`reprovado`) | Trigger `trg_b2b_block_receivable_before_approval` em `partner_order_financial_links` → `receivable_requires_approved_order` |
| `update_partner_order_status` permitia qualquer transição, inclusive **reprovado → em_producao/faturado** | Nova versão explícita: `order_terminal_status` e `status_requires_approved_order` |

Migration: `20260730041500` (forward-only, com bloco `verify`), funções auxiliares
`fn_b2b_status_is_operational` / `fn_b2b_status_is_approved_or_later`.

## 3. Provas de runtime — 20/20 PASS

Harness temporário protegido (Edge Function), sessões autenticadas efêmeras, cleanup total.
**Sem `DISABLE TRIGGER` em nenhum ponto.**

| # | Prova | Resultado |
| --- | --- | --- |
| 1 | Fixtures: 2 parceiros + 8 usuários efêmeros | PASS |
| 2 | 10 sessões autenticadas (8 aliases distintos) | PASS |
| 3 | Composição do catálogo: 16 itens = **7 produtos** (`SOLO-2, SOLB-1, INS-2, INO-1, FUNG-1, SOLO-1, INS-1`) + **9 microrganismos** (`BAC-4, BAC-5, BAC-3, BAC-7, BAC-8, BAC-2, BAC-13, BAC-6, CON-1`); 0 quote_only reais | PASS |
| 4 | `quote_only` provado com fixture temporária sem preço (removida no cleanup; catálogo legítimo intacto) | PASS |
| 5 | Simulação (2 itens, final 177,60) | PASS |
| 6 | Paridade catálogo → simulação (2 linhas) | PASS |
| 7 | Concorrência mesma chave (`Promise.all`): 1 pedido, mesmo id | PASS |
| 8 | `reqfp_v2` detecta divergência de observações → `idempotency_conflict` | PASS |
| 9 | `reqfp_v2` detecta divergência de itens → `idempotency_conflict` | PASS |
| 10 | Linha histórica sem fingerprint → `idempotency_legacy_unverifiable`, zero criação | PASS |
| 11 | Gates pré-aprovação: recebível, produção, entrega, faturamento, auto-aprovação do parceiro, simulação por técnico, estoque direto, financeiro direto — **todos bloqueados, efeito zero** | PASS |
| 12 | E2E A: aprovações → status `aprovado` | PASS |
| 13 | E2E A: recebível concorrente (2× `Promise.all`) → mesmo `receivable_id`, 1 `accounts_receivable`, 1 vínculo, total 177,60 = snapshot, vencimento = cronograma | PASS |
| 14 | Paridade simulação → snapshot dos itens do pedido | PASS |
| 15 | Imutabilidade pós-aprovação → `forbidden_quote_response` | PASS |
| 16 | E2E B: rejeição com motivo → `reprovado`, auditoria `rejected`/`status_changed`, recebível/produção/faturamento bloqueados, efeito zero | PASS |
| 17 | E2E C: ajuste de condições → auditoria `payment_terms_adjustment_requested`, recebível `financial_approval_pending`, produção bloqueada, retorno canônico `approved` | PASS |
| 18 | RLS — 8 aliases (admin, financeiro, gestor_comercial, parceiro A, parceiro B, técnico B2B, produtor direto, sem vínculo): allow/deny conforme desenho; produtor direto em inércia segura (`forbidden_partner`, sem ativação) | PASS |
| 19 | Isolamento entre parceiros (catálogo e pedidos cruzados) | PASS |
| 20 | Cleanup determinístico: 0 pedidos, 0 parceiros, 0 produtos, 8 usuários removidos, 0 erros | PASS |

**Nota factual sobre parcelamento:** no plano utilizado (`installment_count = 1`) o motor
grava o valor no próprio `accounts_receivable` (`total_amount`, `first_due_date`,
`installment_count`) e no `partner_order_payment_schedule`; não há linhas em
`accounts_receivable_installments`. A prova exige coerência entre as três fontes.

## 4. Limpeza, segredo e qualidade

- Edge Function do harness **removida** (`404` no endpoint) e arquivos apagados do repositório.
- Residuais em staging: parceiros 0, pedidos 0, vínculos 0, produtos 0, usuários `@harness.invalid` 0, profiles órfãs 0.
- `SUPABASE_SECRET_KEY`: usado apenas em memória no backend do staging; **não aparece** em
  arquivos, diff ou logs (`rg` no repositório: 0 ocorrências). O proprietário pode remover o
  secret do Lovable e excluir a key no Supabase.
- `tsgo --noEmit`: **PASS**.
- `npm run build`: **PASS**.
- Vitest suíte completa: **2657 PASS**, 4 skipped. Uma falha isolada de ambiente em
  `portalAcompanhamentoProdutor.test.tsx` foi reexecutada isoladamente: **10/10 PASS** (flaky).

## 5. Bloqueio de promoção — 19 migrations fiscais legadas

19 migrations de julho/2026 dependem da flag `_fiscal_staging_marker`, que existe apenas
no staging. Um pacote promocional montado hoje não é reprodutível fora deste projeto.
**Classificação correta: bloqueio de promoção — não “pendência não bloqueante”.**

Plano objetivo (não executado neste ciclo, por exigir inventário e rollback próprios):

1. Inventariar as 19 migrations e o conjunto exato de objetos que cada uma cria/altera.
2. Substituir a dependência do marker por guardas idempotentes (`IF NOT EXISTS` / checagem de
   catálogo), sem alterar semântica fiscal.
3. Gerar migrations corretivas forward-only, com bloco `verify` por arquivo.
4. Testar **fresh path** (banco vazio) e **upgrade path** (staging atual).
5. Montar pacote promocional com rollback documentado e só então reavaliar o veredito.

---

## VEREDITO (fim)

> 🟢 **STAGING CERTIFICADO**
> 🔴 **PROMOÇÃO BLOQUEADA** — 19 migrations fiscais legadas dependentes de `_fiscal_staging_marker`.
> ⚫ **PRODUÇÃO: NÃO APTO.**
