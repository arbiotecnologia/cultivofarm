# Reconciliação com a candidata prévia B2B_PAYMENT_CONDITION_V1 — FINALIZAÇÃO PAUSADA

Pedido: comparar com a cópia isolada aec6d152, commit 301bf597… (base a13636ab…), sem editá-la nem buscar credenciais.

## O que existe neste projeto original
- Commits `301bf597…` e `a13636ab…`: **ausentes** do histórico git deste projeto (`git cat-file` falha).
- Cópia frontend **adiada**, sem pin de commit: `scripts/catalog-exclusive-tenant-reconciliation-20261102/scope-audit-20261103/deferred/source/`
  (paymentContract.ts, paymentSchedule.ts, civilDate.ts, usePaymentConditionCapability.ts, NovoPedido, Simulador, BaixaDialog,
  ContaDrawer, testes). Origem registrada: export integral 75972877, declarado "não candidato de publicação".
- SQL inativo: `scripts/financial-price-generator-20261029/integration/` (schema, captured-deltas, origin, partial, fences,
  build.py, test-local.py). Contém `partner_payment_condition_capability_v1`, `b2b_condition_versions/assignments`,
  `b2b_order_condition_snapshots`, calendário `holiday_calendars` Paracatu-MG, overloads com `p_payment_choice`,
  origem/alocação parcial e atestação fiscal privada sempre negada.
- Não é possível afirmar que essas cópias equivalem byte a byte ao commit 301bf597: **o auditor precisa fornecer os trechos/hashes**.

## Comparação (cópias do original × B3 local)
| Tema | Candidata prévia | B3 local (B2B_PAYMENT_METHOD_V1) |
|---|---|---|
| Base LIVE | create pin `7ec41e17` (≠ LIVE atual `c34e7404`); simulate `37d4f45e` igual | pins atuais `c34e7404`/`37d4f45e` |
| Integração | substitui create/simulate por overload com `p_payment_choice` | wrappers novos, corpos LIVE intactos |
| Modelo | versões privadas por org+plano+método + atribuição por parceiro; categoria e `payment_method_id` obrigatórios | config pública-RLS-fechada por org+plano+tipo, CAS e histórico |
| Meios | cartao_debito/cartao_credito | debito/credito; promissória/crédito bloqueados |
| Boleto | ≤3 e prazo **fixo 30 dias** | ≤3, dias configuráveis |
| Datas | âncora de emissão provisória + calendário Paracatu-MG | estimativa sem calendário |
| Crédito/C2 | `c2_owner_order_guard` + `b2b_credit_config_block` | não aplica |
| B4 | origem/parcial/atestação fiscal (gate sempre nega) | só auditoria |

Conclusão: a candidata prévia cobre o mesmo contrato com mais dependências (calendário, crédito, B4). Manter as duas seria
**contrato duplicado**. O B3 local fica **PAUSADO** (não candidato a instalação) até o auditor escolher a base:
(a) rebasear a candidata prévia para o create LIVE `c34e7404`; ou (b) seguir o B3 local, absorvendo calendário/crédito.
Decisão comercial também pendente: boleto com prazo fixo de 30 dias ou configurável.

## Atualização após revisão 9c0d288 (rev. 2)
Confirmado neste projeto: `scripts/financial-price-generator-20261029/integration/` (schema/build/test) **existe**; o
`paymentContract.ts` frontend **não existe em src/** (só a cópia adiada sem pin). A rev. 2 aproximou o modelo da candidata
prévia onde ela era mais completa, sem copiá-la:
- igual: escolha versionada por empresa vendedora, seis meios, único = 1 parcela sem juros, boleto ≤ 3, Price com taxa
  explícita, snapshot imutável por pedido, cotação sem valor, idempotência com meio/versão, total único em create/simulate.
- diferente: overload gerado do create LIVE **atual** c34e7404 (a prévia parte de 7ec41e17, já substituído); vínculo de
  parceiro reaproveita `commercial_payment_plan_assignments` (a prévia cria `b2b_condition_assignments`); sem calendário
  Paracatu-MG nem atestação fiscal (ficam para B4); boleto com prazo configurável (a prévia fixa 30 dias); ativação por
  empresa (a prévia usa capability por ator/parceiro).
Continua sendo decisão do auditor qual das duas é a base única; esta rev. não instala nada nem desativa a prévia.
