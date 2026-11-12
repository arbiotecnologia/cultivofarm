# Vendedor + capacidade do gestor — prova local (12/11/2026)

Árvore: `96e3dc5dc861f575526ab8cfbe5ab6417d4c63fc`. Tudo em PostgreSQL descartável (destruído ao fim; última base em `/tmp/vendedor-e2e-final.dump`, efêmera). Auth por claims SQL: sintética, não prova JWT/RLS/Storage hospedados. Nada hospedado, publicado, emitido ou cobrado.

## Base
`writers-20261111/measure_live.py` (compositor `order-e2e-new-20261108/compose_current.py`), saída em `evidence/measure-20261112/`: 6/6 corpos = MD5 do auditor. Depois 02a/02b + catálogo 6b56cfb1 + 02c + 02d (SHA conferido).

## Baterias executadas
| Bateria | Resultado |
|---|---|
| `writers-20261111/test_writers_pg.py` | 162/162 (`writers-20261111/evidence/attempt-006.json`) |
| `admin-gate-20261111/test_admin_gate_pg.py` | 79/79 |
| `gestor-capability-reader-20261112/test_e2e_pg.py` | 60/60 (`evidence/attempt-001.json`) |
| Vitest: 6 arquivos (capacidades reais + vendedor + comercial + carteira) | 75/75 |

## Falha reproduzida e correção (banco)
`c2_internal_order_entry_capability_v1` (LIVE e2619c71) pina o leitor `get_partner_catalog_secure` em b5684d35; após 02c o leitor oficial é 66899286 → gestor sempre `catalog_reader_pending`. Delta `02e` troca só esse literal (candidato 7ec80e25, ACL idêntica); PRE/POST/rollback com pins; rollback restaura e2619c71. Implantação: **banco** (frontend já aceita a resposta; sem mudança de tela necessária).

## Pedidos (base descartável)
| Origem | Pedido | Tabela/desc/total R$ | Parcelas | Status | Termos | Previsão |
|---|---|---|---|---|---|---|
| vendedor | PB-001020 `970363f5-e3ca-4ccc-a412-4b20dbd11b66` | 10.0 / 1.0 / 9.0 | [{'n': 1, 'due': '2026-12-12', 'amount': 9.0}] | em_analise_comercial (aprovado_por None) | termos ['approved/0029'] | nenhuma |
| gestor | PB-001021 `801646ca-d356-474f-a87a-e1a29e15177a` | 10.0 / 1.0 / 9.0 | [{'n': 1, 'due': '2026-12-12', 'amount': 9.0}] | em_analise_comercial (aprovado_por None) | termos ['approved/0029'] | nenhuma |
| comprador_canonico | PB-001024 `4b8ce125-c23b-470d-aee3-22fb6fa9898d` | 10.0 / 1.0 / 9.0 | [{'n': 1, 'due': '2026-12-12', 'amount': 9.0}] | aprovado (aprovado_por 0030) | termos ['approved/0029'] | `e6b8519a-cda5-4111-b7b9-2ea173593401` aguardando_fiscal R$9.0 |
| inversa_com_concessao | PB-001025 `df4c9874-e17a-49b5-9bae-8a1f3e868b39` | 10.0 / 1.0 / 9.0 | [{'n': 1, 'due': '2026-12-12', 'amount': 9.0}] | aprovado (aprovado_por 0030) | termos ['approved/0029'] | `99ba6a09-0ad2-4c85-8721-79c129299247` aguardando_fiscal R$9.0 |

Atribuição: `8bdfc2b8-e809-4293-81b7-2ce47d8ee6a3` (admin → V1/P). V2, vendedor de outra empresa, gestor e segundo vendedor negados.

## Achados (não corrigidos — decisão de política)
1. Pedidos de origem interna (vendedor e gestor) não passam da aprovação comercial: `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED` (contenção de 08/10/2026). Passagem ao financeiro do pedido do vendedor fica BLOQUEADA por essa trava; termos aprovados pelo Financeiro, sem previsão.
2. `gestor_comercial` consegue aprovar termos financeiros (`approve_b2b_payment_terms_secure`) — sem segregação servidor entre comercial e crédito/termos.
3. Crédito é automático (`credit_approved_by` nulo); não há aprovação de crédito explícita fora do ledger do piloto econômico.
4. Previsão exige gate+concessão do piloto: no espelho usou-se a costura declarada de `billing-delivery-20261111/positive_control.py` (gate ligado e concessão sintética exata por ator/pedido, depois desligado). Sem concessão, ambas as aprovações não geram previsão (estado de produção).

Nenhum título, NF, evento fiscal, envio, reserva ou entrega criado.
