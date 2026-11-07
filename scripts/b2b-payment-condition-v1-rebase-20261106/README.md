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
| `b2b_condition_versions` | candidata | V1 prazo `DEFAULT 30` personalizável (0–3650); V2 taxa finita ≤100, 6 casas; V3 calendário fora do B3 (nulo); V4 boleto ≤3 **sem** prazo fixo 30, parcela única sem juros |
| `b2b_condition_assignments`, `b2b_condition_retirements` | candidata (verbatim) | + colunas de autoria/data |
| `b2b_order_condition_snapshots` | candidata | N1 cotação (sem valores), termos, hash, nome do meio, estimado/base NF; N2 FK para a versão |
| `b2b_choice` | candidata (verbatim) | — |
| `b2b_resolve_condition` | candidata | R0 parâmetro de trava; R2 vendedor canônico + travas + releitura; R3 revogação por parceiro; R4 versão obsoleta, meio ativo, categoria RECEITA ativa, plano sem juros próprios, prazo ≤ plano, atribuição comercial publicada; R5 remove dependência do pacote de crédito não instalado; R6 retorno reduzido |
| `b2b_schedule` (Price) | candidata | P0 sem calendário; P1 datas nominais marcadas estimadas; P2 parcela única sem juros |
| create / simulate com escolha | **LIVE** c34e7404 / 37d4f45e | C0–C13 / S0–S10 (generate.py), sem capturas antigas de catálogo/embalagem |
| ativação por empresa, revogação por parceiro, escritores, leitor de opções/pedido, gatilho deferido | novos | — |
| gate fiscal, documentos, títulos, permits, calendário Paracatu | **fora (B4)** | continua fechado |

## Uma verdade monetária
Após carrinho LIVE, `b2b_schedule(líquido, taxa, n, hoje, prazo)` gera as parcelas; total = soma; juros = total − líquido.
O mesmo total alimenta crédito LIVE, hash (`fn_b2b_cart_hash` LIVE + escolha + condição reduzida + total), pedido, termos
(taxa/parcelas da versão), cronograma, snapshot, idempotência (fingerprint inclui a escolha) e ACK. Exemplo sintético:
1000 a 1,8% em 3x = 345,40/345,40/345,42 = 1036,22 em todos os pontos.

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

## Evidência (PG descartável, não é prova hospedada)
`test-local-pg.py` → `evidence-local-pg.json`. Costuras declaradas: as do harness B2, `payment_methods`/`financial_categories`
mínimas, leitor de termos com portas mínimas, pins de colunas trocados só na cópia temporária.

## Limitações abertas
- Datas estimadas (referência = data do pedido), sem dia útil Paracatu-MG; vencimento definitivo e calendário ficam no B4.
- Caminho interno barrado pela guarda LIVE de origem interna nos dois contratos; positiva interna não demonstrada.
- Resposta de cotação (LIVE) não recalcula pela condição; em empresa ativada o pedido de cotação guarda só a escolha.
- Revogar um parceiro numa versão é definitivo para ela; liberar de novo exige nova versão.
- Cópia frontend adiada da candidata (`scope-audit-20261103/deferred/source/`) não foi importada; a UI atual cobre o fluxo.
- Sem JWT/RLS/PostgREST/navegador autenticado.
