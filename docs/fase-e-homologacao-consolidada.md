# Fase E — Homologação Runtime Consolidada (Motor de Condições Comerciais + Fiscal B2B)

- Ambiente: **staging `ikaauvsflpmamgxmkhoq`** (exclusivo).
- Produção `navfzbwgwzruipouyfnk`: **não tocada, não publicada**.
- Harness: `supabase/functions/fase-e-runtime-harness` (usuários Auth efêmeros, 8 perfis reais, cleanup obrigatório).
- Execução final: run `4ec2d2bc` — **75 PASS · 0 FAIL · 1 SKIP**.

## 1. Perfis reais usados (Auth efêmeros)

`admin` (administrador), `financeiro`, `gestor` (gestor_comercial), `parceiro_gestor` (parceiro_b2b),
`tecnico` (parceiro_b2b_tecnico), `produtorA`, `produtorB` (cliente_produtor com vínculo obrigatório),
`sem_vinculo` (sem role). Todos criados, autenticados por senha real e removidos no final.

## 2. Resultado por bloco

| Bloco | Cenários | Resultado |
| --- | --- | --- |
| ACL de helpers e anon (9) | `fn_resolve_commercial_price`, `fn_resolve_b2b_cart`, `fn_b2b_order_billing_eligibility`, `generate_b2b_receivable_secure_impl`, `fn_fiscal_requirement_resolve`, `fn_b2b_cart_hash`, `fn_cc_audit`, `fn_cc_can_publish`, anon | PASS |
| Alçadas e coerência (5) | gestor cria mas **não publica**; publicação exige administrador/financeiro; modo divergente, preço fixo sem valor e desconto fora de faixa recusados | PASS |
| Resolução de preço (7) | `fixed_item_price`, precedência do desconto do item (33%) sobre o do plano (10%), `quote_only` sem efeito, `MIN_QUANTITY_NOT_MET` com quantidade abaixo e ausente, unidade sem volume recusada, arredondamento 2 casas | PASS |
| Matriz e vigência (3) | item draft não consumido, item sob atribuição draft não publica, atribuição vencida não consumida | PASS |
| Segurança de contexto (5) | parceiro não escolhe outro comprador (`auth.uid()` autoritativo); técnico, produtorA/B e sem_vinculo não resolvem preços | PASS |
| RLS por perfil (32) | leitura permitida a admin/financeiro/gestor nas 3 tabelas do motor; negada a parceiro, técnico, produtores e sem_vinculo; **escrita negada a todos** os 8 perfis | PASS |
| Checkout (6) | mínimo recusado no servidor, `quote_only` sem valor financeiro, `cart_hash` autoritativo, hash divergente recusado, idempotência concorrente = 1 pedido, snapshot imutável após mudança de preço | PASS |
| Financeiro/fiscal (5) | gate `billing_not_eligible` antes da aprovação; aprovação + geração concorrente = **exatamente 1 recebível**; devedor = parceiro correto; `fiscal_invoice_required` vindo do resolvedor (`PENDING_PARAMETRIZATION`, não hardcoded `false`); parcelas geradas | PASS |
| Higiene (1) | cleanup sem resíduos (planos, regras, itens, atribuições, pedidos, parceiros, clientes, usuários Auth = 0) | PASS |

## 3. Defeito real encontrado e corrigido nesta fase

`accounts_receivable_fiscal_invoice_status_check` não aceitava os status produzidos por
`fn_fiscal_requirement_resolve` (`PENDING_PARAMETRIZATION`, `EXEMPT`). Consequência: **nenhum recebível B2B
era gerado** quando não havia política fiscal parametrizada — o gate fail-closed derrubava a operação inteira
em vez de registrar a pendência. Corrigido em staging pela migration
`20260731022659` (constraint ampliada para `NOT_REQUIRED | PENDING | ISSUED | CANCELED | PENDING_PARAMETRIZATION | EXEMPT`).
Reexecução do harness após a correção: FIN-receivable, FIN-devedor, FIN-fiscal-flag e FIN-parcelas passaram.

## 4. Pendência declarada (SKIP)

`FISC-emissao`: emissão fiscal real (NF-e/NFS-e) a partir de pedido B2B **não foi executada**. Não existe
pipeline de emissão ligado ao pedido B2B nem parametrização tributária real (regime/UF/CFOP/NCM/CST/CSOSN)
em staging. Estado: **BLOQUEADO PARA EMISSÃO REAL** — o recebível nasce com `fiscal_invoice_required = true` e
status `PENDING_PARAMETRIZATION`, sem dupla nota e sem falso `NOT_REQUIRED`.

## 5. Status

- **🟢 STAGING CERTIFICADO (Fase E)** — 75/76 cenários com evidência runtime; 1 SKIP declarado.
- **🟡 PROMOÇÃO**: passo `restoration/promocao-b2b/steps/30_hardening_fase_e_final.sql` preparado, forward-only,
  aguardando autorização humana. Produção permanece intocada.
