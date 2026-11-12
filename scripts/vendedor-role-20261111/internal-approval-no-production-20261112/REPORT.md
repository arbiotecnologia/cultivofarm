# approve_partner_order — aprovação comercial sem liberar produção (12/11/2026)

Árvore: `9a1e9dcc8be4a6d29d70fdf535eba2840b4a71cf`. Somente PostgreSQL descartável (espelho composto + 02b/catálogo/02c/02d + 02e com SHA conferido); base destruída ao fim. Auth por claims SQL: sintética, não prova JWT/RLS/Storage. Nada hospedado, publicado, emitido ou cobrado.

## Delta (só `public.approve_partner_order(uuid,text,date)`, LIVE 0d3b8504 → candidato fe848f18, ACL idêntica)
1. UPDATE: `ready_for_production = (c2_external_origin_snapshot IS NULL AND internal_origin_snapshot IS NULL)`.
2. Pós-UPDATE: `ready=false` só aceito se aprovado, origem interna ou externa presente e `internal_economic_snapshot` selado pelo trigger (schema 1, `origin` = snapshot de origem, `sealed_by` = aprovador); `ready=true` com origem → recusa.
3. Notificação "aprovação comercial… planejamento ainda não liberado" para as duas origens.
Inalterados: reavaliação de crédito, reautorização após lock, CAS de status (anti-replay), guards operacionais/fiscais, alçada do gestor sobre termos, crédito automático.

Arquivos: `01f-pre` (exige ref, LIVE, 02e e guard pinados), `02f-install`, `03f-post`, `04f-rollback` (recusa drift); gerados por `generate.py`; `manifest.json`, `SHA256SUMS`.

## Execução — `test_e2e_pg.py` → `evidence/attempt-001.json`: 83/83 PASS
| Cenário | Pedido | Criador | Comercial | Termos | ready | Previsão |
|---|---|---|---|---|---|---|
| antes do delta | PB-001020 `e27630d8-…` | V1 (vendedor) | negada `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED` | pendente | false | — |
| mesmo pedido após delta | PB-001020 | V1 | gestor …0030 | financeiro …0029 | false | `a5aaa0f0-…` aguardando_fiscal R$9,00 |
| vendedor novo | PB-001021 `53f5f142-…` | V1 | gestor | financeiro | false | `72ca6c4d-…` R$9,00 |
| externo (controle) | PB-001023 `151327eb-…` | comprador …0021 | gestor | financeiro | false | `3d3dd87c-…` R$9,00 |

Todos: tabela R$10,00, desconto R$1,00, total R$9,00, parcela única 12/12/2026. Vendedor/financeiro/outra empresa não aprovam comercialmente; vendedor não aprova termos nem lê previsão; replay recusado; repetição de termos não duplica previsão; ligar produção ou status `faturado` diretamente segue negado; nenhum título/NF/evento fiscal/envio/reserva/entrega/OS criado; gate do piloto desligado ao fim; rollback restaura LIVE e a contenção original volta.

## Observações
- Mensagem: a fixture não tem destinatários do parceiro, então nenhuma notificação foi gerada; o texto só foi verificado no código, não em execução.
- Gestor aprova comercialmente o próprio pedido (PB-001022) pela regra existente — não alterado (decisão de negócio), sem produção.
- Previsão depende do gate+concessão do piloto (costura declarada, igual a `positive_control.py`).
- Implantação: banco, após 02e. Frontend não alterado.
