# Piloto econômico C2 — PB-001042 (somente espelho; NÃO instalado)

Camada econômica isolada para pedido `C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1` em `em_analise_comercial`
com `quote_responded` único: aprovação **comercial** (administrador/gestor_comercial) e de **crédito**
(administrador/financeiro), explícitas, com autor+data, tenant/carteira do vendedor verificados, concessão por
pedido/ator/tipo (≤24h, revogável). Quando ambas existem: **uma** previsão `aguardando_fiscal` (estimada, não exigível)
e **um** evento `PREVISION_CREATED`. Nada muda no pedido; NF, recebível, cobrança, reserva, entrega e envio continuam bloqueados.

## Arquivos
| arquivo | papel |
|---|---|
| `candidate.sql` | fonte do candidato |
| `00-default-acl-probe.sql.readonly` | sonda somente leitura das ACLs padrão reais (pg_default_acl, schema) — o auditor anexa a saída |
| `01-pre.sql.readonly` | PRE somente leitura (ref, pins das dependências, ausência) |
| `02-install.sql.review` | instalação em transação única, instala FECHADO |
| `03-post.sql.readonly` | POST (MD5 candidato, ACL por conjunto, barreiras, dependências) |
| `04-rollback-deny.sql.review` | rollback deny-only (preserva ledger/previsões/barreira) |
| `05-pilot-enable.sql.review` | habilitação estreita separada (settings `c2pilot.*`) |
| `06-pilot-disable.sql.review` | desligamento |
| `generate.py`, `candidate-md5.json`, `SHA256SUMS` | geração/verificação dos bytes |
| `fixture.py`, `test_pilot_pg.py` | fixture por entradas reais e bateria |
| `evidence/attempt-NNN/` | checks.json, executed.json (SHA dos bytes executados), stdout.txt |

## Comandos (locais)
```
# espelho compatível (cópia temporária; não reescreve evidências do projeto)
rm -rf /tmp/pb && mkdir -p /tmp/pb/proj && cp -r scripts /tmp/pb/proj/ && rm -rf /tmp/pb/proj/scripts/vendedor-role-20261111/writers-20261111/evidence/measure
(cd /tmp/pb/proj && python3 scripts/vendedor-role-20261111/writers-20261111/measure_live.py)   # gera /tmp/vendedor-mirror.dump
python3 scripts/c2-pilot-economic-approval-20261111/measure_candidate.py   # regrava candidate-md5.json
python3 scripts/c2-pilot-economic-approval-20261111/generate.py && python3 scripts/c2-pilot-economic-approval-20261111/generate.py --verify
python3 scripts/c2-pilot-economic-approval-20261111/test_pilot_pg.py
bunx vitest run src/test/b2b/c2PilotEconomicApproval.test.tsx
```
Uso hospedado (auditor, após aprovação): `SET c2pilot.expected_ref='swzpzcwiasxmjutrmvkm';` antes de 01/02/03/04;
05 exige também `c2pilot.order_id`, `c2pilot.commercial_actor`, `c2pilot.credit_actor`, `c2pilot.hours` (1–24), `c2pilot.reason`.

## Espelho
Dump composto (`compose_current.py`) + Vendedor 02a/02b/02c/02d (estado reportado em produção) + catálogo 6b56cfb1.
Costuras declaradas: plano global "Sob consulta TESTE" adotado pela empresa A; configuração fiscal da emitente
desativada só durante a criação (o writer canônico grava o snapshot pendente); gate global de previsão alinhado OFF.
Negativas de evidência mutam dados apenas em transação revertida.

## Dependências reais ausentes / pendências
- Pins de dependência são do espelho: o auditor precisa confirmar os MD5 de produção de `approve_partner_order`,
  `approve_b2b_credit`, `approve_b2b_payment_terms_secure`, `b2b_financial_forecast_after_approval_v1`,
  `b2b_financial_forecast_guard`, `get_b2b_financial_forecast_secure`, `c2p1_internal_actor`, `h15_actor_organization`
  e `has_ticket` (os de `c2_accounting_pending_guard` 669b1949, `c2_external_origin_contract_valid` 369fd07c e
  `respond_b2b_order_quote_secure` 964b79ec já coincidem com capturas/pacotes do projeto). Divergência ⇒ PRE falha fechado.
- Confirmar em produção que as tabelas de previsão (`b2b_financial_forecasts`/eventos/gate) existem com o gate OFF.
- Usuários reais da AR Bio com perfil comercial e financeiro (UUIDs) para 05 — não criados aqui.
- Decisão de segregação: o mesmo administrador pode aprovar os dois tipos se tiver ambas as concessões; restringir se desejado.
- Prova JWT/RLS/Storage e navegador real após instalação.
- Leitor Financeiro instalado (`get_b2b_seller_finance_order_review_v1`) não está no dump; o painel é independente dele.

## Revisão 2 (após PRE hospedado aprovado; 01 byte-idêntico)
- Leitor `c2_pilot_economic_state_v1`: com gate desligado ou sem concessão vigente do próprio ator para o pedido, devolve só
  `{contract, order_id, available:false, reason}` (PILOT_DISABLED|NOT_GRANTED) — sem evidência, autores, hashes ou previsão;
  só mostra previsão de origem `C2_PILOT_ECONOMIC_APPROVAL_V1`. Não substitui nem amplia o leitor financeiro.
- Core: papel, escopo do tenant, gate e concessão vigente são comprovados sem lock antes de travar o pedido; após as esperas
  reautoriza e revalida gate/concessão; o replay só é respondido depois disso (concessão revogada ou gate off ⇒ negado, sem forecast_id).
- Evidência: termos `approved` exigem autor+data; dispensa só `not_required` sem autor, `requires_financial_approval=false`
  e cabeçalho fora de pending/rejected; comparações monetárias com nulos falham fechado.
- ACL padrão: produção não foi consultada daqui. O espelho emula o pior caso (tabelas/funções novas em public e platform_private
  abertas a anon/authenticated/service_role); 02 revoga explicitamente e 03 exige conjunto exato (tabelas: só o dono).
  O auditor roda `00-default-acl-probe.sql.readonly` e anexa a saída real.
- Evidência: `evidence/attempt-005` (attempt-003 com falhas de teste e attempt-004 preservadas).
