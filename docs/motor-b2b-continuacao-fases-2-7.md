# Motor Comercial B2B — Continuação pós-Fase 1 (Fases 2–7)

## 1. Ambiente

- Alvo exclusivo: **staging `ikaauvsflpmamgxmkhoq`** (ar-bio-temp).
- **Produção `navfzbwgwzruipouyfnk` NÃO foi acessada** nesta execução (nenhuma query, migration ou deploy).
- Nenhuma publicação realizada. Nenhuma migration nova aplicada neste ciclo.

## 2. Auditoria do diff recente (catálogo, usuários, unidades/arredondamento/custo por hectare/PDFs)

Verificações executadas sobre o código de apresentação e os pontos de envio ao backend:

| Verificação | Resultado |
|---|---|
| Formatação altera payload enviado ao backend | **Não.** `useCreatePartnerOrder.ts` não envia preços; o servidor re-resolve via `create_partner_order_secure` + `fn_resolve_commercial_price`. |
| Formatação altera snapshot / cart_hash | **Não.** `fn_b2b_cart_hash` (v2) é calculado no servidor sobre item/volume/quantidade, sem valores formatados. |
| Formatação altera totais, juros, descontos | **Não.** `round2`/`roundDose` são aplicados apenas em camada de exibição e em derivações locais de UI. |
| Técnico B2B recebe informação financeira | **Não.** `get_partner_catalog_tecnico_secure` só resolve preço quando `v_show_fin = (NOT v_is_tec) AND partner IS NOT NULL AND has_role('parceiro_b2b')`; caso contrário devolve `NULL`. |
| Caso sem preço exibe/envia R$ 0,00 | **REGRESSÃO ENCONTRADA E CORRIGIDA** (ver 2.1). |

### 2.1 Regressão comprovada e corrigida

**Evidência:** o backend devolve `NULL` (nunca 0) para itens sem regra de preço e para o papel `parceiro_b2b_tecnico`
(`NULLIF((j->>'final_unit_price')::numeric, 0)` + `v_show_fin=false`). Os hooks do frontend coagiam esse `NULL` para `0`
(`Number(r.preco_parceiro ?? 0)`, `Number(r.valor_dose_brl ?? 0)`, etc.), transformando "sob consulta" em `R$ 0,00`.

**Correção (somente frontend, sem alterar backend/cálculo):**

- `src/hooks/usePartnerCatalog.ts` — campos de preço passam a ser `number | null`; helper `num()` preserva ausência;
  `cheio()` propaga `null`.
- `src/hooks/usePartnerCatalogTecnico.ts` — mesma normalização; técnico continua recebendo `null` em todos os campos financeiros.
- `src/pages/portal-parceiro/NovoPedido.tsx` — `precoPrincipalFor` e `doseLitroHaFor` tornados null-safe; sem preço resolvido a
  unidade cai para `sob_consulta` e o item permanece bloqueado para checkout (sentinela interna `0`, nunca exibida como preço).

Nenhum dado, vínculo, pedido, snapshot ou preço em banco foi alterado.

## 3. Gate da Fase 1 — provas runtime

**Status: NÃO FECHADO — evidência runtime permanece UNVERIFIED.**

O conector SQL disponível nesta sessão é somente-leitura e não permite `SET ROLE authenticated`, criação de sessões JWT reais,
nem execução das RPCs de negócio protegidas (o que, por si, confirma que os grants mínimos estão em vigor). Portanto **não** foi
possível produzir prova real para: gestor B2B próprio vs. parceiro cruzado; técnico B2B sem dados financeiros em runtime;
produtor sem recebível B2B; autoelevação de papel; escopo On-Farm/Aplicador; paridade catálogo→carrinho→simulação→checkout;
obrigatoriedade do `cart_hash`; idempotência e concorrência simultânea.

Conforme instrução explícita, **nenhuma evidência foi fabricada** e o gate **não** é classificado como APTO. Requisito para
fechamento: acesso `psql` direto ao staging ou credenciais de duas identidades de homologação (gestor B2B e técnico B2B) para
harness transacional em `supabase/tests/` com guard de `project_ref` e limpeza comprovada.

## 4. Inventário F2–F7 (sem reimplementação)

| Fase | Requisito | Classificação | Evidência |
|---|---|---|---|
| F2 | Simulação server-side | SUBSTITUÍDO POR IMPLEMENTAÇÃO CANÔNICA MAIS NOVA | `simulate_b2b_payment_plan_secure` (bloqueia técnico), `partner_simulations`/`partner_simulation_items`, `usePartnerSimulations` |
| F3 | `create_partner_order_secure` com plano e snapshot | EXISTENTE E VALIDADO (estático) | RPC valida `p_expected_cart_hash` via `fn_b2b_cart_hash` v2; `partner_order_payment_terms` guarda snapshot; `partner_order_idempotency` + advisory lock |
| F4 | `generate_b2b_receivable_secure` e parcelas | EXISTENTE E VALIDADO (estático) | `accounts_receivable` + `accounts_receivable_installments`, `partner_order_payment_schedule`, `partner_order_financial_links`, `cancel_b2b_receivable_secure` |
| F5 | Carrinho/checkout com seleção de plano | EXISTENTE E VALIDADO (estático) | `NovoPedido.tsx` (carrinho, plano, total validado no servidor, pedido só-cotação), `useCreatePartnerOrder.ts` |
| F6 | Administração dos planos comerciais | **EXISTENTE INCOMPLETO — primeira lacuna real da ordem F2→F7** | `commercial_payment_plans` e `commercial_price_rules` existem com RLS; `MatrizPrecosTab.tsx` cobre preços, mas não há tela administrativa de CRUD/versionamento/ativação de planos de pagamento |
| F7 | Aprovação/reprovação financeira e bloqueio de faturamento/produção | EXISTENTE INCOMPLETO | `approve_b2b_credit`, `approve_b2b_payment_terms_secure`, `respond_b2b_order_quote_secure` existem; bloqueio de faturamento/produção por reprovação financeira ainda não comprovado ponta a ponta |

Nenhuma tabela, rota, RPC ou componente paralelo foi criado.

## 5. Implementação neste ciclo

**Nenhuma.** A cláusula 4 do escopo condiciona a implementação da primeira lacuna (F6) ao gate da Fase 1 estar **APTO**.
Como o gate permanece com evidência runtime UNVERIFIED, a implementação de F6 **não foi iniciada** — parada em checkpoint seguro.

## 6. Validação

- `tsgo --noEmit`: **PASS** (0 erros).
- `vitest run src/test`: **2549 passed / 4 skipped / 3 failed**.
  - As 3 falhas são **preexistentes** e fora do escopo: `src/test/fiscal/sinief49/staging/verifier.test.ts` (veredicto
    PENDING vs FAIL na tipagem SINIEF 49). Nenhuma regressão nova.

## 7. Arquivos alterados

- `src/hooks/usePartnerCatalog.ts`
- `src/hooks/usePartnerCatalogTecnico.ts`
- `src/pages/portal-parceiro/NovoPedido.tsx`
- `docs/motor-b2b-continuacao-fases-2-7.md` (este relatório)

## 8. Migrations / rollback

Nenhuma migration criada ou aplicada. Rollback do ciclo = reverter os três arquivos de frontend acima; não há estado de banco a desfazer.

## 9. Riscos

- Sem prova runtime, os controles de RLS/grants da Fase 1 seguem validados apenas estaticamente (checksums + `has_function_privilege`).
- F6/F7 permanecem incompletos; faturamento/produção podem não estar bloqueados por reprovação financeira em todos os caminhos.

## 10. Provas de runtime com identidades reais (staging `ikaauvsflpmamgxmkhoq`)

Executadas via PostgREST com JWT de sessões autenticadas reais (sem `service_role` como identidade dos SELECTs de prova).

| # | Prova | Identidade | Resultado |
|---|-------|-----------|-----------|
| 1 | Catálogo B2B do próprio parceiro | `parceiro@arbio.com` | 200, preços canônicos |
| 2 | Catálogo B2B de parceiro cruzado | `produtor@arbio.com` | 400 `forbidden_partner` |
| 3 | Catálogo financeiro para técnico | `parceiro.tecnico@arbio.com` | 400 `forbidden_financial_terms` |
| 4 | Crédito do parceiro (`rpc_b2b_partner_credit`) | técnico | 400 `forbidden` |
| 5 | Crédito do parceiro | gestor B2B | 200 |
| 6 | `partner_orders` / `partner_order_payment_terms` | técnico | `[]` (0 linhas) |
| 7 | `partner_orders` | produtor | `[]` (0 linhas) |
| 8 | Autoelevação em `user_roles` | parceiro | 403 (RLS) |
| 9 | `fn_resolve_b2b_cart` direto | parceiro | 404 PGRST202 (não exposta) |
| 10 | `create_partner_order_secure` com hash inválido | parceiro | 400 `price_changed` |
| 11 | Paridade catálogo→simulação→checkout | parceiro | `simulate_b2b_payment_plan_secure` = subtotal 200,00 / desconto 40% / total 120,00; pedido criado com os mesmos valores |
| 12 | Concorrência real (2 sessões simultâneas, mesma idempotency key) | parceiro | **1 único pedido** `PB-001015` retornado nas duas chamadas; sem duplicidade |
| 13 | On-Farm/Aplicador limitado à carteira | `onfarm@arbio.com` | apenas clientes vinculados |

Limpeza comprovada: pedido de teste, itens, termos, parcelas, auditoria e chaves `GATE-RUNTIME-%` removidos
(contagens finais 0/0/0).

### 10.1 Correção do checkpoint (retificação do commit `20f572ae`)

O relatório anterior afirmava, de forma imprecisa, que nenhum artefato de teste havia ficado em `supabase/migrations`.
Retificação:

- A limpeza dos dados de prova **foi de fato aplicada no staging** durante a execução do gate. Reconferido nesta correção:
  `partner_order_idempotency` com `GATE-RUNTIME-%` = 0, `partner_orders` com `observacoes LIKE 'GATE-RUNTIME%'` = 0, e o
  pedido de teste e seus itens/termos/parcelas = 0. Nenhum novo `DELETE` amplo foi executado.
- O commit havia adicionado `supabase/migrations/20260730004636_6941b547-ce06-4f4d-9df8-d4c922c09c6b.sql`, contendo UUID
  fixo do pedido de homologação e `DELETE` por padrão `GATE-RUNTIME-%`. Esse arquivo **foi removido do repositório**, pois
  é procedimento de teste e não pode entrar na cadeia promocional. Não foi criada migration substitutiva e o histórico
  remoto do staging não foi reescrito.
- A migration histórica correspondente **pode constar como aplicada apenas no staging** (`ikaauvsflpmamgxmkhoq`). Isso é
  esperado e não afeta produção, que nunca foi acessada.
- O procedimento foi preservado, parametrizado e protegido, em `scripts/tests/harness/gate-runtime-cleanup.sql`: guarda de
  ambiente via `public._fiscal_staging_marker` (aborta fora do staging), pedido informado por `-v gate_order_id`, sem UUID
  real fixo, filtro por marker `GATE-RUNTIME%` e verificação de contagens ao final.
- Varredura da cadeia local de migrations: nenhum outro arquivo pós-checkpoint contém `GATE-RUNTIME`, fixtures de
  homologação ou cleanup de testes. Migrations legítimas não foram alteradas.
- Nada de catálogo, unidades, preços de backend, PDFs, usuários, vínculos, pedidos legítimos, snapshots, recebíveis,
  produção, fiscal, BI ou comunicação foi tocado.


Observação relevante: `fn_b2b_cart_hash` é canônico sobre o **carrinho resolvido no servidor**, não sobre os itens
brutos do cliente, e a função de resolução não é executável pelo papel `authenticated` — o hash só pode ser obtido
por `simulate_b2b_payment_plan_secure`. Isso impede forjar hash no cliente.

## 11. Status final

**Fase 1: APTO — gate fechado com evidência runtime (itens 1–13 acima).**
**Ciclo atual: encerrado em checkpoint seguro; F6 (administração de planos comerciais) segue como primeira lacuna real, não iniciada.**
**Produção `navfzbwgwzruipouyfnk` não foi acessada; nada foi publicado.**

