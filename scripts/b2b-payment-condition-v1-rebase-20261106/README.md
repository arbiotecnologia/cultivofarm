# B2B_PAYMENT_CONDITION_V1 — rebase sobre o create LIVE c34e7404 (B3)

Status: **NÃO APROVADO PARA IMPLANTAÇÃO; NÃO APLICADO.** Só código e PostgreSQL descartável. Nada remoto, publicado,
cadastrado, cobrado, emitido ou enviado; PB-001036/teste4 intocados.

## Decisão aplicada (auditor, 2026-11-06)
Rebasear a candidata comprovada `scripts/financial-price-generator-20261029/integration/schema.sql.review` (sha256
`b1416978…`, 14103 caracteres) e `build.py` (sha256 `0210f7ad…`, 13768) — byte a byte iguais ao projeto isolado
aec6d152 ref 301bf597 e ao original ref d5aa368, conforme leitura do auditor — sobre os corpos LIVE. O contrato rev.2
`B2B_PAYMENT_METHOD_V1` (`../b2b-payment-method-order-20261106/`) virou histórico. O PRE aborta se ele, ou o create antigo
de 10 argumentos da candidata, estiverem presentes.

## Origem de cada parte
| Parte | Origem | Deltas |
|---|---|---|
| `b2b_condition_versions` | candidata | V1 prazo `DEFAULT 30` personalizável (0–3650); V2 taxa finita ≤100, 6 casas; V3 calendário fora do B3 (nulo); V4 boleto ≤3 **sem** prazo fixo 30; taxa explícita em 1x só para boleto/promissória/crédito; dinheiro/Pix/débito seguem 1x sem juros |
| `b2b_condition_assignments`, `b2b_condition_retirements` | candidata (verbatim) | + colunas de autoria/data |
| `b2b_order_condition_snapshots` | candidata | N1 cotação (sem valores), termos, hash, nome do meio, estimado/base NF; N2 FK para a versão |
| `b2b_choice` | candidata (verbatim) | — |
| `b2b_resolve_condition` | candidata | R0 parâmetro de trava; R2 vendedor canônico + travas + releitura; R3 revogação por parceiro; R4 versão obsoleta, meio ativo, categoria RECEITA ativa, plano sem juros próprios, prazo ≤ plano, atribuição comercial publicada; R5 crédito explícito validado no helper próprio; R6 retorno reduzido |
| `b2b_schedule` (Price) | candidata | P0 sem calendário; P1 datas nominais marcadas estimadas; Price original aceita n=1 com taxa explícita, sem taxa/default novo |
| create / simulate com escolha | **LIVE** c34e7404 / 37d4f45e | C0–C13 / S0–S10 (generate.py), sem capturas antigas de catálogo/embalagem; crédito sem COALESCE/EXCEPTION OTHERS |
| resposta de cotação | **LIVE** e57d3a64 | Mesma RPC: ramo condicionado recalcula Price, snapshot/recibo append-only, idempotência e reautorização; legado fora da ativação preservado |
| ativação por empresa, revogação por parceiro, escritores, leitor de opções/pedido, gatilho deferido | novos | — |
| gate fiscal, documentos, títulos, permits, calendário Paracatu | **fora (B4)** | continua fechado |

## Uma verdade monetária
Após carrinho LIVE, `b2b_schedule(líquido, taxa, n, hoje, prazo)` gera as parcelas; total = soma; juros = total − líquido.
O mesmo total alimenta crédito LIVE, hash (`fn_b2b_cart_hash` LIVE + escolha + condição reduzida + total), pedido, termos
(taxa/parcelas da versão), cronograma, snapshot, idempotência (fingerprint inclui a escolha) e ACK. Exemplo sintético:
1000 a 1,8% em 3x = 345,40/345,40/345,42 = 1036,22 em todos os pontos. O oráculo sintético de 1x é 1018,00,
com principal 1000,00 e juros 18,00. Essa taxa existe só nas fixtures locais: dinheiro/Pix/débito continuam exigindo 1x sem
juros; boleto/promissória/crédito aceitam 1x com taxa explícita. Nenhuma taxa/default foi cadastrada remotamente.

## Ordem de travas
```text
create:  advisory b2b_idem (LIVE) -> reautorização LIVE -> replay
         -> versão FOR SHARE -> atribuição FOR SHARE -> plano FOR SHARE -> atribuição comercial FOR SHARE
         -> payment_methods FOR SHARE -> financial_categories FOR SHARE -> releitura do vendedor
         -> b2b_packaging_lock (LIVE) -> advisory b2b_credit (LIVE) -> resolve sem trava (igual ao primeiro) -> INSERT
publish/retire/assign: advisory b2bcond:<org>:<plano>:<meio> -> reautorização -> versão vigente FOR UPDATE -> CAS
ativação: advisory b2bcond_act:<org> -> reautorização -> linha FOR UPDATE -> CAS
```

## Tela
Motor Comercial B2B → Meios de pagamento: administrador/financeiro publicam versões (CAS, prazo inicial 30 vindo do
servidor, taxa explícita), aposentam e liberam/revogam por parceiro; só administrador liga piloto/obrigatória; gestor
comercial consulta. No pedido, o comprador escolhe entre versões vigentes liberadas; envio exige ACK com a mesma escolha.

## Crédito explícito e cotação (revisão 194331e)
`platform_private.b2b_credit_checked` exige configuração ativa completa e limite numérico finito ≥0. NULL/ausente, negativo,
NaN/Infinity, configuração inválida e erro transitório abortam; zero explícito permanece zero e qualquer exposição positiva
o excede. A comparação usa o total Price, não o principal. A UI recusa `credit:null`/ausência de `credit_checked` e informa
indisponibilidade sem enviar.

A resposta da cotação usa a MESMA RPC LIVE. Com snapshot da condição, reautoriza o vendedor, revalida versão/atribuição,
recalcula uma única economia Price e grava snapshot econômico + recibo append-only. Replay idêntico devolve o mesmo ACK;
payload divergente é `quote_idempotency_conflict`. Sem snapshot, o comportamento legado permanece. O rollback nega apenas
o ramo com condição e não bloqueia cotação legada de empresa não ativada.

## Evidência (PG descartável, não é prova hospedada)
`test-local-pg.py` → `evidence-local-pg.json`: **172/172**, incluindo NULL/zero/negativo/NaN/erro transitório, limite entre
1000 e 1036,22 e no limite exato, cotação/idempotência/revogação, create interno positivo com fixture isolada e guards REAIS,
rollback e o oráculo de parcela única em publicação/resolução/simulação/create/leitor/persistência. UI montada: **29/29** em
`evidence/review-194331e/single-rate-focused.json`. A fixture interna tem UMA configuração fictícia VALIDADA; ao removê-la, a mesma guarda volta a negar
`B2B_INTERNAL_ISSUER_AMBIGUOUS`. Nenhuma guarda foi desligada para o positivo.

Costuras declaradas: as do harness B2, `payment_methods`/`financial_categories` mínimas, leitor de termos com portas mínimas,
pins de colunas trocados só na cópia temporária. A injeção transitória ocorre só no PG descartável e o corpo REAL de crédito
é restaurado byte a byte e conferido por md5.

## Limitações abertas
- Datas estimadas (referência = data do pedido/resposta), sem dia útil Paracatu-MG; vencimento definitivo e calendário ficam no B4.
- Revogar um parceiro numa versão é definitivo para ela; liberar de novo exige nova versão.
- Cópia frontend adiada da candidata (`scope-audit-20261103/deferred/source/`) não foi importada; a UI atual cobre o fluxo.
- Sem JWT/RLS/PostgREST/navegador autenticado. Positivo interno é componente sintético, não E2E nem autorização de operação.
- Nenhuma cobrança, documento fiscal, aprovação ou operação posterior foi executada; PB-001036/teste4 intocados.
