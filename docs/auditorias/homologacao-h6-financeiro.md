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

---

## H6d — Proveniência/reprodutibilidade (encerramento do GATE H6)

- Migrations canônicas criadas em `supabase/migrations/`:
  `20260917000000_h6c_financeiro_snapshot_b2b_credito.sql` e
  `20260917010000_h6c_backfill_payment_terms_link.sql`.
- `restoration/homologacao-h6/apply-h6c.sh` passa a aplicar as **duas** etapas na ordem,
  com guard duro contra produção.
- Novos: `rollback-h6c.sql` (forward-safe) e o postcheck de paridade
  `49-h6d-paridade-repo-live.sql` + `49-h6d-paridade.sh`.
- Paridade REPO x LIVE provada em transação com ROLLBACK: **6/6 PASS**, backfill no-op,
  nenhuma reaplicação de DDL necessária no staging.
- Histórico `supabase_migrations.schema_migrations` defasado em 48 versões
  (aplicação manual via psql) — **H6D-001 (P2)**, documentado e delegado a H10 sem
  adulteração de metadados.
- Reexecução: H6b 16/16, H6c 13/13, comportamental 12/12, concorrência 17/17,
  typecheck 0 erros, Vitest 3105 passed, build OK, binding `c75bb87f`.
- Produção `navfzbwgwzruipouyfnk` intocada.

**GATE H6 — APROVADA COM RESSALVAS (zero P0/P1). H7 não iniciada.**

---

# H6c-2 — FECHAMENTO DAS RESSALVAS DE EVIDÊNCIA/REVERSIBILIDADE

Ambiente: **staging `ikaauvsflpmamgxmkhoq`** (produção `navfzbwgwzruipouyfnk` intocada). H7 não iniciada.

## H6c-001 — entrega parcial com preços diferentes (agora PROVADO)

Runner: `restoration/homologacao-h6/51-h6c2-multipreco-guard.mjs` — **10/10 PASS**.

Fórmula server-side (`fn_entrega_valor_faturavel_v1`):

```text
base_aceita   = Σ (subtotal_snapshot_item × ratio_aceito_item)
fator         = base_aceita / Σ subtotal_snapshot_item
valor_canonico= round(total_snapshot_comercial × fator, 2)
```

Cenário: item A subtotal 1.000 (ratio aceito 1,00) e item B subtotal 3.000 (ratio aceito 0,50);
total comercial do snapshot 3.600 (com desconto global).
`fator = 2.500/4.000 = 0,625` → **valor canônico = R$ 2.250,00**.
Um ratio global por quantidade (0,75) daria R$ 2.700,00 — **erro de R$ 450,00**, provado em M2.
M3 confere `valor_faturavel_max` gravado (±R$ 0,01) e origem `B2B_PAYMENT_TERMS_SNAPSHOT`;
M4 rejeita payload acima (2.700) e abaixo (2.000); M5 confirma **1 AR exatamente em 2.250,00**;
M6 teardown com **0 resíduos**.

## H6c-002 — rollback integral e reprodutível

- `restoration/homologacao-h6/50-gerar-rollback-h6b.py` gera `rollback-h6b.sql` a partir das
  migrations canônicas: restaura as definições **exatas** de `rpc_register_receivable_payment`,
  `rpc_register_payable_payment`, `fn_reverse_payment`, `fn_entrega_guard_faturamento_v1` e
  `fn_generate_receivable_from_entrega`, remove objetos novos H6b/H6c (helpers `fn_h6b_*`,
  `fn_entrega_valor_faturavel_v1`, triggers `trg_h6b_*`/`trg_h6c_*`) e restaura grants
  (`anon` sem EXECUTE, `authenticated` com EXECUTE).
- `restoration/homologacao-h6/rollback-h6b.sh` automatiza e **falha fechado** fora do staging
  (checa DSN e o marcador `_fiscal_staging_marker`).
- Colunas aditivas (`request_fingerprint`, `valor_faturavel_origem/metodo`) permanecem —
  rollback **lógico**, documentado, sem perda de trilha.
- Postcheck `53-h6b-rollback-postcheck.sql`: **13/13 PASS**.
- Prova `54-h6c-reversibilidade.sh` — **APPLY → ROLLBACK → APPLY: PASS**
  (postcheck H6b 16/16, H6c 13/13; contagens idênticas nos três momentos:
  `50|30|58|30|10|43` baixas AR / baixas AP / AR / AP / reconciliações / vínculos canônicos).

## H6c-003 — guard integral cumpre a própria regra

Migration `20260918000000_h6c2_guard_integral_canonico.sql` (cópia canônica em `supabase/migrations/`):
sem conferência por item, quando há valor canônico resolvível o guard passa a operar em modo
`integral_canonico` e **rejeita divergência acima ou abaixo de R$ 0,01**; sem valor canônico o
modo legado é preservado (o guard não inventa preço). Provas G1 (2.000 exato = PASS),
G2 (2.100 = FAIL), G3 (1.900 = FAIL), G4 (tolerância de R$ 0,01 preservada).

## H6c-004 — retry do comprovante após baixa persistida

`src/lib/financial/anexarComprovanteBaixa.ts`: caminho determinístico
`owner_type/payment_id/idempotency_key-arquivo` + verificação prévia de documento equivalente;
upload com `upsert` no mesmo caminho lógico e violação de unicidade tratada como reuso.
Nenhum comprovante é apagado; bucket e RLS inalterados. `BaixaDialog.tsx` passa a usar o helper.
Teste: `src/test/financeiro/comprovanteBaixaIdempotencia.test.ts`.

## Evidências finais

| Verificação | Resultado |
|---|---|
| Postcheck estrutural `46-h6b` | 16/16 PASS |
| Postcheck `47-h6c` | 13/13 PASS |
| Comportamental `48-h6c` | 12/12 PASS |
| Concorrência `45-h6b` | 17/17 PASS |
| Multi-preço + guard `51-h6c2` | 10/10 PASS |
| Rollback `53` / reversibilidade `54` | 13/13 PASS / PASS |
| Typecheck | 0 erros |
| Vitest | 3111 passed / 4 skipped |
| Build | SUCCESS |
| Binding staging | 8/8 PASS (`ikaauvsflpmamgxmkhoq`) |
| Resíduos H6C2 | 0 (`52-h6c2-limpeza-residual.sql`) |
| `anon` EXECUTE em RPCs financeiras | nenhum |
| SECURITY DEFINER + `search_path` | conforme |
| Produção `navfzbwgwzruipouyfnk` | intocada |

Ressalvas remanescentes: **H6-006 (P3)** mensagem bruta de unicidade em estorno concorrente;
**H6D-001 (P2)** lacuna de `schema_migrations` delegada à H10. Zero P0/P1.

## GATE

**H6 — APROVADA.** H7 (Fiscal) **não iniciada**.
