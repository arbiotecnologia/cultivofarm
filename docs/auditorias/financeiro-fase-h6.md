# FASE H6 — Auditoria, correção e homologação do Financeiro AR Bio

Ambiente: **staging `ikaauvsflpmamgxmkhoq`** (produção `navfzbwgwzruipouyfnk` não foi tocada).
Data: 2026 — execução somente staging. H7 **não** iniciada.

## 1. Inventário

- 21 tabelas financeiras (`accounts_receivable`, `accounts_receivable_installments`, `receivable_payments`,
  `accounts_payable`, `accounts_payable_installments`, `payable_payments`, `financial_receipts`,
  `recurring_financial_templates`, `recurring_generation_log`, `financial_audit_log`,
  `partner_financial_settings`, `financial_settings`, cadastros auxiliares).
- 50 funções/RPCs financeiras. Todos os escritores (`fn_generate_receivable_from_entrega`,
  `generate_b2b_receivable_secure_impl`, `fn_generate_recurring_title`, `rpc_register_*_payment`,
  `fn_reverse_payment`) são `SECURITY DEFINER` com `search_path` fixo.

## 2. Achados

| ID | Sev | Achado | Situação |
|----|-----|--------|----------|
| H6-001 | P1 | `receivable_payments`/`payable_payments` tinham policy `ALL` para staff financeiro: INSERT/UPDATE direto pelo Data API contornava todas as validações do RPC (saldo, comprovante, forma de pagamento ativa) e permitia alterar baixas já lançadas | **Corrigido** |
| H6-002 | P1 | Baixas sem chave de idempotência: duplo clique/retry gerava duas baixas parciais | **Corrigido** |
| H6-003 | P1 | Snapshot do título mutável (`total_amount`, `installment_count`, origem, datas de emissão) e parcela com `original_amount` alterável | **Corrigido** |
| H6-004 | P2 | GRANT residual a `anon` em `recurring_financial_templates` (RLS bloqueava, mas o privilégio existia) | **Corrigido** |
| H6-005 | P2 | Geração recorrente idempotente apenas por `EXISTS` no log — corrida podia duplicar competência | **Corrigido (índice único)** |
| H6-006 | P3 | Estorno concorrente é bloqueado por índice único, porém a mensagem retornada é o erro bruto de unicidade | Aceito |

### Já conformes (sem alteração)
- Entrega → AR: `FOR UPDATE` na entrega, guarda de reconciliação, índices parciais
  `ux_ar_one_per_delivery` e `ux_ar_one_active_per_b2b_order` impedem faturamento duplicado.
- Baixa: `FOR UPDATE` na parcela, bloqueio de excesso de saldo, exigência de comprovante configurável.
- Estorno: apenas staff financeiro, motivo obrigatório (≥5 caracteres), lançamento espelho negativo,
  um estorno por baixa, proibido estornar estorno ou parcela cancelada.
- Trilha: `fn_financial_audit` em AR/AP e nas baixas; `financial_audit_log` legível apenas por staff.
- Portais: produtor e parceiro B2B leem apenas os próprios títulos; `anon` sem acesso.

## 3. Correções aplicadas

- `restoration/fase-h6/20260915000000_h6_financeiro_hardening_v1.sql`
  - razão de baixas **append-only** (trigger + RLS só de leitura; escrita apenas via RPC);
  - triggers de imutabilidade de snapshot em títulos e parcelas (status, fiscal e notas continuam editáveis);
  - colunas e índices únicos de idempotência;
  - revogação de `anon` em `recurring_financial_templates`;
  - índice único de competência recorrente.
- `restoration/fase-h6/20260915010000_h6_baixa_idempotente_v1.sql`
  - `rpc_register_receivable_payment` / `rpc_register_payable_payment` com replay idempotente
    (retornam a baixa existente em vez de duplicar) e `EXECUTE` revogado de `anon`/`PUBLIC`.
- `src/components/financeiro/BaixaDialog.tsx`: envia `idempotency_key` por tentativa de baixa.

## 4. Evidências

- Postcheck `restoration/fase-h6/44-h6-postcheck.sql`: **16/16 PASS** (estruturais)
  e comportamentais `H6-B02`, `H6-B03`, `H6-B04` = PASS
  (`H6-B01` SKIP: staging sem baixas registradas após as limpezas anteriores).
- Typecheck: 0 erros. Vitest: **3105 passed / 4 skipped**.
- Binding conferido e restaurado para a baseline de staging `c75bb87f` (`.env`, `types.ts`).

## GATE

**H6 — APROVADA COM RESSALVAS** (ressalvas: H6-006 P3 e H6-B01 sem massa de dados para prova ao vivo).
H7 não iniciada.

## Adendo H7b — H6-P2 (menor privilégio nas trigger functions)

Achado da auditoria independente: `fn_h6c_entrega_ar_b2b_link()` e
`fn_h6c_set_canonical_payment_terms()` são `SECURITY DEFINER RETURNS trigger`
com `search_path` fixo, mas ainda mantinham `EXECUTE` herdado de
`PUBLIC`/`anon`/`authenticated`. Não eram RPCs diretamente exploráveis (não
estão expostas via PostgREST como trigger functions), logo P2 e não P1.

Correção aplicada em `supabase/migrations/20260920000000_h7b_fiscal_idempotencia_ambiente_v1.sql`
(sem qualquer mudança de lógica):

```sql
REVOKE ALL ON FUNCTION public.fn_h6c_entrega_ar_b2b_link()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_h6c_set_canonical_payment_terms() FROM PUBLIC, anon, authenticated;
```

ACL depois (staging): `postgres=X/postgres,service_role=X/postgres`.
Os triggers continuam executando normalmente (execução ocorre sob o dono da
função, não sob o chamador). Verificado por `restoration/homologacao-h7b/65-h7b-postcheck.sql`
(T11 PASS) e pela suíte financeira completa.

**H6-P2: CORRIGIDO.** O gate H6 permanece **APROVADA**.
