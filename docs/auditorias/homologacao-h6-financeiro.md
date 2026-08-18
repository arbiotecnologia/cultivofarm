# H6/H6b — Homologação do Financeiro AR Bio

Ambiente: **staging `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` **não foi tocada**
(guard duro em `apply-h6b.sh` e no runner concorrente). H7 **não iniciada**.

## 1. Inventário do fluxo financeiro

| Camada | Objetos canônicos |
|--------|-------------------|
| Títulos | `accounts_receivable` / `accounts_payable` + `*_installments` |
| Baixas | `receivable_payments` / `payable_payments` (append-only desde H6) |
| RPCs de baixa | `rpc_register_receivable_payment`, `rpc_register_payable_payment` |
| Estorno | `fn_reverse_payment(_payment_id,_kind,_reason)` |
| Entrega → AR | `fn_generate_receivable_from_entrega`, `fn_entrega_guard_faturamento_v1`, `rpc_entrega_reconciliar_v1` |
| Snapshot comercial | `partner_order_payment_terms.final_amount` → `partner_orders.final_amount_with_interest` → itens (`preco_unitario_final_snapshot`) |
| Trilha | `financial_audit_log` (leitura restrita a staff financeiro) |

Nenhuma tabela, rota, tela, permissão, categoria, centro de custo, método de pagamento,
conta bancária ou conciliação foi criada em paralelo — todas as correções ocorreram nas
funções canônicas já existentes.

## 2. Findings e situação

| ID | Sev | Achado | Situação |
|----|-----|--------|----------|
| H6-001 | P1 | `idempotency_key` opcional nas baixas AR/AP: retry sem chave criava segunda baixa válida | **Corrigido** |
| H6-002 | P1 | `total_amount` da AR vinha do payload; `valor_faturavel_max` nunca era preenchido na reconciliação | **Corrigido** |
| H6-003 | P2 | Replay de estorno após timeout devolvia erro bruto de unicidade | **Corrigido** |
| H6-004 | P2 | Snapshot econômico de títulos/parcelas | Já protegido em H6; reconferido em H6b (T9) |
| H6-006 | P3 | Mensagem de conflito concorrente pouco descritiva em cenários raros | Aceito (P3) |

### H6-001 — Idempotência obrigatória nas baixas
- `idempotency_key` obrigatória, mínimo 8 caracteres; ausência falha com
  `FIN_IDEMPOTENCY_REQUIRED` (`check_violation`), **antes** de qualquer gravação.
- `request_fingerprint` (SHA-256 dos campos econômicos materiais: valor, desconto, juros,
  multa, método, conta e data) calculado **server-side** e persistido na própria baixa —
  sem tabela paralela.
- Mesma chave + mesmo fingerprint ⇒ **replay**: retorna o `payment_id` existente, sem novo
  efeito contábil. Mesma chave + payload divergente ⇒ `FIN_IDEMPOTENCY_CONFLICT`.
- `FOR UPDATE` da parcela, validação de saldo/status/comprovante e o unique
  `installment_id + idempotency_key` preservados; advisory xact lock determinístico
  acrescentado antes da decisão.
- Frontend (`BaixaDialog.tsx`) gera a chave **uma vez por submissão lógica** e a reutiliza
  em retry/duplo clique.

### H6-002 — Valor faturável derivado server-side
- `fn_entrega_valor_faturavel_v1(entrega)` resolve a fonte econômica histórica na ordem:
  1. `partner_order_payment_terms.final_amount` (termo aprovado) —
     origem `B2B_PAYMENT_TERMS_SNAPSHOT`;
  2. `partner_orders.final_amount_with_interest` — origem `B2B_ORDER_SNAPSHOT`;
  3. soma dos itens aceitos por `preco_unitario_final_snapshot × quantidade aceita` —
     origem `B2B_ITEMS_SNAPSHOT` (usada em entrega parcial com itens de valores diferentes;
     `ratio_aceito` **não** é usado como proporção econômica quando há valor por item).
  Nunca se usa preço atual de catálogo, nem se recalcula juros/desconto com parâmetros atuais.
- `trg_h6b_reconciliacao_valor_faturavel` persiste `valor_faturavel_max`,
  `valor_faturavel_origem` e `valor_faturavel_metodo` na reconciliação.
- `fn_entrega_guard_faturamento_v1` devolve o teto econômico e rejeita total acima dele.
- `fn_generate_receivable_from_entrega` exige paridade do payload com o valor canônico
  dentro de **R$ 0,01**; parcelas continuam obrigadas a somar exatamente o total validado.
  Unique de uma AR ativa por entrega e `FOR UPDATE` preservados.
- Legado sem snapshot resolvível: nenhum preço é inventado — segue o fluxo manual já
  existente, exigindo papel financeiro, motivo e registro em `financial_audit_log`
  (origem, pedido/termo, valor comercial histórico, valor aceito e modo manual).

### H6-003 — Replay de estorno
- `idempotency_key`/fingerprint no estorno; segunda tentativa lógica retorna o estorno
  existente. Intenção divergente (outro motivo/valor) ⇒ `FIN_IDEMPOTENCY_CONFLICT`.
- Estorno duplicado concorrente ⇒ exatamente uma persistência; usuário, data, motivo,
  baixa original e valor registrados na trilha.

## 3. Artefatos

- `supabase/migrations/20260916000000_h6b_financeiro_idempotencia_valor_canonico.sql`
  (migration incremental; nenhuma migration histórica foi editada).
- `restoration/homologacao-h6/apply-h6b.sh` — apply com guard anti-produção.
- `restoration/homologacao-h6/rollback-h6b.sql` — rollback lógico, não destrutivo.
- `restoration/homologacao-h6/46-h6b-postcheck.sql` — postcheck estrutural.
- `restoration/homologacao-h6/45-h6b-concorrencia.mjs` — runner comportamental/concorrente.
- `src/components/financeiro/BaixaDialog.tsx` — chave por tentativa lógica.

## 4. Metodologia dos testes concorrentes

Duas conexões `pg.Client` independentes (não pooled na mesma sessão), cada uma em sua
própria transação com `SET LOCAL ROLE authenticated` e `request.jwt.claims` do usuário-alvo.
As duas transações sincronizam num *barrier* temporal (`pg_sleep` até um instante comum)
para que as chamadas cheguem realmente concorrentes. Fixtures são criadas com prefixo `H6B-…`
e removidas no teardown, que também prova ausência de resíduo.

## 5. Resultados

Postcheck estrutural `46-h6b-postcheck.sql`: **16/16 PASS**.

Runner concorrente `45-h6b-concorrencia.mjs`: **17/17 PASS**

| Gate | Resultado |
|------|-----------|
| T1 AR mesma chave/payload em paralelo | 1 baixa, replay com mesmo `payment_id` |
| T2 AR mesma chave/payload divergente | conflito estável, 1 baixa |
| T3 AR duas chaves, soma > saldo | recebido 800 de saldo 1000, sem overpayment |
| T4a–T4c AP (matriz equivalente) | PASS |
| T4d chave ausente/curta (AR e AP) | fail-closed |
| T5 estorno concorrente | 1 reversão + replay estável |
| T5b estorno com intenção divergente | `FIN_IDEMPOTENCY_CONFLICT` |
| T6 entrega B2B integral | AR única = snapshot 2000 |
| T7 entrega parcial | teto 1000, origem `B2B_PAYMENT_TERMS_SNAPSHOT`, AR = teto |
| T8 payload com total acima e abaixo | rejeitado |
| T9 alteração de parâmetros mestres | AR/parcelas inalteradas (2000 → 2000) |
| T10 entrega `NOT_BILLABLE` | nenhuma AR gerada |
| T11 `anon` nas RPCs financeiras | sem EXECUTE |
| T12 papel sem alçada (`producao`) | baixa e estorno negados (42501) |
| T13 teardown | zero resíduos |

Segurança: todas as funções tocadas são `SECURITY DEFINER` com `search_path` explícito
(postcheck S12) e sem EXECUTE para `anon` (S13). Escopo A×B/partner e RLS de portais
preservados. Produção intocada.

## 6. Regressão

- Binding conferido e restaurado para a baseline de staging `c75bb87f`
  (`.env`, `src/integrations/supabase/client.ts`, `types.ts`) — havia drift para o sandbox.
- Typecheck: **0 erros**.
- Suite Vitest e build: ver seção de execução no relatório de encerramento da conversa.
- Fluxo H5 (entrega/reconciliação), contas a receber/pagar existentes e
  dashboards/cashflow/DRE continuam operando; as proteções H5 de estoque e reconciliação
  permaneceram ativas (o teardown do harness precisou suspendê-las explicitamente,
  o que evidencia que estão em vigor).

## 7. Pendências

- **H6-006 (P3)** — mensagem de conflito concorrente pouco descritiva em cenário raro.
- **P3** — teardown do harness depende de suspender triggers de proteção; é aceitável por
  ser exclusivo de fixtures descartáveis em staging.

## GATE

**H6 — APROVADA COM RESSALVAS** (zero P0/P1; ressalvas P3 acima). **H7 não iniciada.**
