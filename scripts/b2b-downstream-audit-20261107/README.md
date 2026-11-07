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

### Candidato inativo — revisão 31430566 + achado de escopo 16:38, 76/76, exit 0

As rodadas **29/29** e **60/60** são históricas e não bastam para implantação. A primeira usava guards mínimos/localização de pin; a segunda ainda usava superadmin como positivo. A revisão de escopo vendedor/comprador passou **76/76**, sem alterar o SQL candidato, e permanece **não aprovada e não aplicada**. Evidência atual: `review-31430566/scope-live-1638/`; evidência 60/60 preservada em `review-31430566/historical-60/`.

`generate-adjustment-fix.py` gera, sem edição manual dos SQL:

- `01-pre.sql.readonly`, `02-install.sql.review`, `03-post.sql.readonly`, `04-rollback-deny.sql.review`;
- corpo capturado e candidato separados, 14 capturas reais de Auth/escopo/dependências, pins e `SHA256SUMS`;
- verificações de corpo, owner e ACL do writer, wrappers e núcleos privados em PRE/POST/rollback, sem nenhum `GRANT` e sem substituição temporária de pinos.

Delta mínimo:

1. autenticação e mesma porta `b2b_phase1_order_visible` usada por approve/reject/note antes da primeira escrita;
2. `SELECT ... FOR UPDATE`, negação fail-closed para pedido ausente/NULL e nova verificação de escopo/papéis depois da espera;
3. negação explícita `C2_ACCOUNTING_PENDING` antes de alterar termos/pedido;
4. owner/ACL originais preservados; nenhum papel, grant, writer ou acesso ampliado;
5. rollback **deny-only**: revoga cliente e mantém o corpo corrigido/histórico, sem restaurar a função vulnerável.

Cobertura atual: pin divergente do writer/privado, owner/ACL divergentes, PRE/POST, rerun, 38 gatilhos ativos, C2 pending, FSF com vínculo próprio negado, pedido ausente/NULL e revogação durante lock de papel, perfil, senha provisória, vínculo organização-parceiro, convite processing/access_valid_after e feature `pedidos_b2b`. Admin/financeiro/gestor comercial comuns tiveram positivos **somente no legado sintético**, pelo caminho `organizations.partner_account_id` com dono comercial coerente; admin+parceiro apenas com `partner_users` único foi negado. No externo validado, os três papéis foram negados pelo guard real `C2_EXTERNAL_ORIGIN_DENIED`, sem efeitos. Candidato MD5 inalterado `7eb3b5be33552f6bd4eecd56796502ed`; evidência `review-31430566/scope-live-1638/adjustment-candidate.json`.

Além dos quatro pinos anteriores, os MD5 LIVE relatados de `b2b_phase1_partner_visible` (`915f516e…`), `b2b_actor_scope` (`c3f29977…`) e `platform_actor_access_ready` (`048249c0…`) correspondem exatamente às capturas locais executadas. Isso não é nova leitura LIVE. As demais dependências/owners/ACLs vêm de captura LOCAL e exigem conferência independente. Detalhes e matriz em `review-31430566/scope-live-1638/`. **Não aprovado nem aplicado; nenhum positivo sintético certifica o admin vendedor ARBio.**

### Revisão 458b6012 das três decisões — 134/134, exit 0

Os 76 testes anteriores foram preservados em `review-31430566/historical-76/` e não somados. Request/approve/reject agora compartilham o mesmo escopo canônico, `FOR UPDATE`, reautorização pós-lock e bloqueio `C2_ACCOUNTING_PENDING`, com owner/ACL preservados e sem grants. FSF, comprador, pedido ausente e pendência contábil foram negados sem efeitos; revogações durante lock também fecharam approve/reject. Nos três papéis internos, positivos ocorreram somente no legado sintético; no externo validado, o guard real de origem negou todos. Rollback deny-only fechou os três writers sem apagar histórico. Evidência atual: `review-31430566/scope-live-1638/decision-candidates.json`; **INATIVO/NÃO APROVADO**.

### Revisão final 18:33 — revalidação após lock dos termos, 187/187

Antes **184/187, exit 1**: request/approve/reject aceitaram papel revogado durante o `FOR UPDATE` dos termos. Os três candidatos agora releem pedido+termos, pertencimento, escopo vendedor e C2 também depois dessa espera. Depois **187/187, exit 0**, com duas sessões, rollback explícito e todos os 38 gatilhos reais habilitados. Evidência e hashes em `review-31430566/final-credit-terms-1833/`; candidatos continuam INATIVOS/NÃO APROVADOS. Uma tentativa de troca cruzada com ordem inversa de locks causou deadlock e foi arquivada separadamente, sem promovê-la a prova do predicado pós-espera.

## 2. Resultados downstream executados

| Componente | Resultado atual | Evidência | Limite |
|---|---:|---|---|
| B4 anterior | **63/63 históricos**, não somados | `b4/review-458b6012/historical-63/` | Não promovido após revisão 458b6012 |
| Manifesto B4 458b6012 | **42/42**, exit 0 | `b4/review-458b6012/evidence-manifest-tests.json` | 54 objetos; instalação bloqueada por baseline ausente |
| B4 componente + impactos compartilhados | **73/73**, exit 0 | `b4/review-458b6012/evidence-b4-shared-impact.json` | Não E2E; efeito em MANUAL parceiro exige reconciliação |
| Price, calendário, crédito, títulos, pagamentos/estorno | **338/338**, exit 0 | `evidence/price/` | Componente com Auth/settings/NF/contabilidade sintéticos; não E2E |
| Cobrança por entrega e escopo | **47/47**, exit 0 | `evidence/delivery-billing/` | Candidato histórico inativo; stubs e schema reduzido |
| Envase/CQ/estoque/pronto_entrega | **119/119 matriz completa + 21/21 recorte**, exits 0 | `physical/evidence/envase-full/`; `physical/evidence/envase-targeted/` | PostgreSQL descartável; liberação real/JWT/RLS não testados |
| Expedição/em rota/comprovante/confirmação/cancelamento | **123/123**, exit 0 | `physical/evidence/confirmation/`; `confirmation/test-results.json` | Componente local; biológico ml, sem químicos/fertilizantes |
| UI B3, quatro arquivos documentados | **67/67**, exit 0 | `evidence/ui-b3/results-67.json` | Auth/transporte sintéticos |
| Typecheck | exit 0 | `evidence/typecheck/` | — |
| Build automático | `build OK` no harness | `/tmp/observability/build-errors.log` | sem código numérico fornecido pelo harness |

Não houve suíte completa. O primeiro arquivo UI isolado também foi executado (36/36); o conjunto final preserva as 67 regressões documentadas.

## 3. Mapa de contratos e contenções

- **Pedido/cotação/aprovações:** B3 publicado é marco histórico informado; suas 226 provas PG anteriores não foram repetidas. O ajuste candidato desta pasta é separado e não altera B3, Price, escolha, snapshots ou crédito.
- **Faturamento parcial/NF autorizada → recebível:** os 63 testes anteriores são históricos. A revisão 458b6012 inventariou 54 alterações e passou 42/42 verificações estáticas e 73/73 no componente descartável, sem somar contagens. A instalação está bloqueada até captura LIVE da projeção monetária. Títulos MANUAL sem/com parceiro foram preservados na criação, mas MANUAL de parceiro sem origem conhecida bloqueou exposição com `MONEY_ORIGIN_UNPROVEN`; pedido interno ficou contido. Instalação não ativa operação: dependência fiscal/contábil continua always-deny. Detalhes em `b4/README.md`.
- **Recebível idempotente:** Price testou geração/replay, crédito total, pagamento e estorno por componentes existentes. Cobrança por entrega testou replay com mesmo ID, categoria RECEITA ativa, método ativo, escopo, concorrência e revogação.
- **Estoque/envase:** a composição capturada executou CQ → estoque → `pronto_entrega`, com permissões fechadas antes do grant sintético, estrangeiro negado e sentinelas downstream preservadas.
- **Expedição/em rota/confirmação/cancelamento:** após separar o stub de bloqueio do release revisado e corrigir somente a criação do cache descartável, a composição passou **123/123**. Cobriu envio independente, Enviar→Confirmar sem segunda baixa, CAS, replay/idempotência, isolamento de tenant, revogações sob lock observado, corridas de envio/confirmação/cancelamento, cancelamento e rollback deny-only. O release original de envase ficou byte-idêntico antes/depois do recorte; detalhes em `physical/README.md`.
- **Fiscal/comunicação:** nenhum emissor real, transmissão, cobrança, documento ou envio. Referências/NF/contabilidade dos harnesses são adaptadores/fixtures locais sem rede.

## 4. Unidades, produtos e calendário

- Envase/estoque exercitou produto biológico fictício em **ml**. B3 histórico cobre líquido L/ml e embalagens inteiras; isso não foi reexecutado como downstream nesta rodada.
- **Químicos e fertilizantes em kg/g/embalagem inteira: NOT_RUN no downstream físico.** Nenhum cadastro paralelo foi criado; peso continua apenas para frete e preço permanece server-side.
- Price executou 126 comparações SQL × motor Decimal independente, 1–3 parcelas, datas-base de NF e preservação de centavos/snapshots.
- Calendário local `paracatu-mg-2026-2027-v2`, Paracatu-MG + nacionais, com dataset/integridade/versionamento pinados, foi testado: ausência, localidade divergente e cobertura excedida negam. Isso não comprova que essa versão esteja carregada na produção; fora da fonte/cobertura, o comportamento exigido permanece fail-closed.
- Cancelamento de NF após pagamento continua sem decisão B4 e não foi implementado. Estorno testado refere-se a pagamento no componente Price, não a cancelamento fiscal real.

## 5. Riscos pendentes / próxima revisão

1. Confrontar LIVE request/approve/reject, hashes/ACL/gatilhos e elegibilidade real do vendedor; os 134 PASS são locais e não autorizam instalação.
2. Capturar LIVE `rpc_receivable_money_projection_v1(uuid,integer,integer)` e reconferir os 54 objetos B4. Sem isso, PRE/install permanecem bloqueados.
3. Reconciliar o efeito `MONEY_ORIGIN_UNPROVEN` em títulos MANUAL de parceiro antes de qualquer liberação; não inventar origem/backfill nem abrir writers.
4. Cobrir químicos/fertilizantes kg/g e cenários L/ml na cadeia física sem criar cadastros paralelos. **Continua NOT_RUN nesta rodada**; os 123 PASS são da composição biológica ml.
5. JWT/RLS/Storage/PostgREST/browser real, contabilidade, emissão fiscal, recebíveis e envios continuam NOT_RUN e fechados.

`matrix.csv` apresenta o recorte cenário/resultado/evidência/risco. `evidence/summary.json` e `evidence/SHA256SUMS` consolidam códigos de saída e hashes. Todo PASS acima é local e sintético, nunca homologação do fluxo real completo.
