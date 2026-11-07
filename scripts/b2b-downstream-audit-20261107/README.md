# Auditoria local B2B ARBio até faturamento/entrega — 07/11/2026

**Sem operação hospedada, publicação, NF/cobrança/aprovação contábil real, envios ou subagentes.** B3 permanece histórico/publicado conforme relato do auditor; nada do B3 foi reaberto ou alterado. A fonte LIVE ainda precisa ser confrontada pelo auditor: captura local e migrations do repositório não são presumidas como produção.

## 1. Prioridade: ajuste financeiro sob pendência contábil

Fonte local identificada: `scripts/delivery-atomic-hardening-20261030/capture/current.json`, função `request_b2b_payment_terms_adjustment_secure(uuid,text)`, MD5 `f9bf8f543564af480d08e7bebd111b88`.

### Reprodução — 14/14, exit 0

`test-adjustment-baseline.py` executou a função capturada com **todos os 38 gatilhos reais capturados habilitados**:

- Pedido externo canônico fictício com `C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1`, `financial_approval_status='pending'` e termos `pending`: a RPC concluiu e mudou `payment_condition_status` para `adjustment_requested`. O gatilho contábil protege mudança de `financial_approval_status`, mas esse valor permaneceu `pending`; a lacuna `pending→pending` foi confirmada localmente.
- Pedido externo validado: o gatilho real `b2b_internal_child_snapshot_guard`/`c2_external_origin_assert` negou administrador estrangeiro com `C2_EXTERNAL_OWNER_DENIED`. Portanto, esse caso não foi classificado como vulnerabilidade de escopo.
- Pedido genuinamente legado, sem snapshot de origem: administrador de outro tenant concluiu o ajuste. A fixture mínima foi preparada com gatilhos de duas tabelas pausados somente na montagem; todos foram religados e conferidos antes da RPC. Essa costura está registrada e não prova criação canônica/RLS.
- Controle isolado e revertido: `zz_c2_accounting_pending` negou `pending→approved`; nenhum gatilho ficou desabilitado.

Evidência: `evidence/adjustment-baseline.json`, `evidence-adjustment-baseline-sixth.*`. As tentativas anteriores com erros de harness/fixture foram preservadas.

### Candidato inativo — 29/29, exit 0

`generate-adjustment-fix.py` gera, sem edição manual dos SQL:

- `01-pre.sql.readonly`, `02-install.sql.review`, `03-post.sql.readonly`, `04-rollback-deny.sql.review`;
- corpo capturado e corpo candidato separados, pins e `SHA256SUMS`.

Delta mínimo:

1. mesma porta `b2b_phase1_order_visible` usada por approve/reject/note, antes da primeira escrita;
2. `SELECT ... FOR UPDATE` do pedido e nova verificação de escopo/papéis depois da espera;
3. negação explícita `C2_ACCOUNTING_PENDING` antes de alterar termos/pedido;
4. ACL original preservada; nenhum papel, grant, writer ou acesso ampliado;
5. rollback **deny-only**: revoga cliente e mantém o corpo corrigido/histórico, sem restaurar a função vulnerável.

Cobertura: pin divergente, PRE/POST, rerun, 38 gatilhos ativos, negação contábil e estrangeira sem efeitos em pedido/termos/auditoria/notificações, revogação de papel durante o lock, positivos no próprio tenant para pedido validado e legado, comprador negado, rollback com pin inválido/válido e preservação de histórico. Candidato MD5 `55996e9496ffb123504adaeaa502c81f`.

Somente a cópia em `/tmp` substitui o pin do leitor de escopo pela costura sintética do harness. Os artefatos revisáveis conservam o pin da captura LIVE `8812508716f279a88e3d5a31b15621d8`. **Não aprovado nem aplicado.**

## 2. Resultados downstream executados

| Componente | Resultado atual | Evidência | Limite |
|---|---:|---|---|
| Reconciliação B4 útil sobre B3 atual | **63/63**, exit 0 | `b4/evidence-b4-b3.json` | Componente local, adaptador NF sem rede; não E2E/JWT/RLS |
| Price, calendário, crédito, títulos, pagamentos/estorno | **338/338**, exit 0 | `evidence/price/` | Componente com Auth/settings/NF/contabilidade sintéticos; não E2E |
| Cobrança por entrega e escopo | **47/47**, exit 0 | `evidence/delivery-billing/` | Candidato histórico inativo; stubs e schema reduzido |
| Envase/CQ/estoque/pronto_entrega | **21 PASS**, exit 0, `ENVASE_TARGETED=1` | `evidence/envase-stock/` | Recorte, não matriz completa; liberação real não testada |
| Expedição/comprovante/confirmação/cancelamento | **exit 1 antes da matriz** | `evidence/delivery-confirmation/` | `ENVASE_RELEASE_DRIFT`; somente restore inicial passou |
| UI B3, quatro arquivos documentados | **67/67**, exit 0 | `evidence/ui-b3/results-67.json` | Auth/transporte sintéticos |
| Typecheck | exit 0 | `evidence/typecheck/` | — |
| Build automático | `build OK` no harness | `/tmp/observability/build-errors.log` | sem código numérico fornecido pelo harness |

Não houve suíte completa. O primeiro arquivo UI isolado também foi executado (36/36); o conjunto final preserva as 67 regressões documentadas.

## 3. Mapa de contratos e contenções

- **Pedido/cotação/aprovações:** B3 publicado é marco histórico informado; suas 226 provas PG anteriores não foram repetidas. O ajuste candidato desta pasta é separado e não altera B3, Price, escolha, snapshots ou crédito.
- **Faturamento parcial/NF autorizada → recebível:** o harness histórico com overloads superados não foi executado. A reconciliação isolada `b4/` extraiu somente os componentes úteis sobre o B3 atual e passou **63/63**: parciais, replay, residual+exposição, baixa, substituição intermediária de centavos, concorrência, gates e rollback. O candidato continua inativo; NF é fixture local sem rede e não há certificação de cobrança real.
- **Recebível idempotente:** Price testou geração/replay, crédito total, pagamento e estorno por componentes existentes. Cobrança por entrega testou replay com mesmo ID, categoria RECEITA ativa, método ativo, escopo, concorrência e revogação.
- **Estoque/envase:** a composição capturada executou CQ → estoque → `pronto_entrega`, com permissões fechadas antes do grant sintético, estrangeiro negado e sentinelas downstream preservadas.
- **Expedição/em rota/confirmação/cancelamento:** a bateria não passou da composição por `ENVASE_RELEASE_DRIFT`. Nenhuma transição física dessa bateria é alegada nesta execução; resultados históricos não substituem esse resultado.
- **Fiscal/comunicação:** nenhum emissor real, transmissão, cobrança, documento ou envio. Referências/NF/contabilidade dos harnesses são adaptadores/fixtures locais sem rede.

## 4. Unidades, produtos e calendário

- Envase/estoque exercitou produto biológico fictício em **ml**. B3 histórico cobre líquido L/ml e embalagens inteiras; isso não foi reexecutado como downstream nesta rodada.
- **Químicos e fertilizantes em kg/g/embalagem inteira: NOT_RUN no downstream físico.** Nenhum cadastro paralelo foi criado; peso continua apenas para frete e preço permanece server-side.
- Price executou 126 comparações SQL × motor Decimal independente, 1–3 parcelas, datas-base de NF e preservação de centavos/snapshots.
- Calendário local `paracatu-mg-2026-2027-v2`, Paracatu-MG + nacionais, com dataset/integridade/versionamento pinados, foi testado: ausência, localidade divergente e cobertura excedida negam. Isso não comprova que essa versão esteja carregada na produção; fora da fonte/cobertura, o comportamento exigido permanece fail-closed.
- Cancelamento de NF após pagamento continua sem decisão B4 e não foi implementado. Estorno testado refere-se a pagamento no componente Price, não a cancelamento fiscal real.

## 5. Riscos pendentes / próxima revisão

1. Confrontar a função LIVE, hashes/ACL/gatilhos e só então revisar o delta do ajuste; não aplicar os arquivos desta pasta automaticamente.
2. Reconciliar `ENVASE_RELEASE_DRIFT` na composição descartável antes de repetir expedição/confirmação/cancelamento. Não se alterou SQL antigo para esconder o drift.
3. Revisar o candidato B4 reconciliado em `b4/` contra LIVE e suas costuras antes de qualquer decisão de instalação. A bateria local passou 63/63, mas a cobrança real após NF autorizada segue não certificada.
4. Cobrir químicos/fertilizantes kg/g e cenários L/ml na cadeia física sem criar cadastros paralelos.
5. JWT/RLS/Storage/PostgREST/browser real, contabilidade, emissão fiscal, recebíveis e envios continuam NOT_RUN e fechados.

`matrix.csv` apresenta o recorte cenário/resultado/evidência/risco. `evidence/summary.json` e `evidence/SHA256SUMS` consolidam códigos de saída e hashes. Todo PASS acima é local e sintético, nunca homologação do fluxo real completo.
