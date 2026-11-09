# Plano revisado — previsão separada e recebível definitivo por NF

**Regra aprovada para implementação e testes exclusivamente locais:** previsão financeira separada após aprovação comercial **E** crédito válido; recebíveis definitivos somente após NF autorizada, um por documento fiscal, sem duplicação por replay. Não haverá migração para recebível único agregado por pedido. Nenhuma produção antes de revisão PASS.

## Limites e caracterização preservados

- Tentativas 125/126 permanecem como diagnóstico de H7/CHECK de auditoria; attempt-127 está incompleta e nenhuma ponte foi aprovada.
- ACL, RLS, dez gatilhos de recebíveis, `a00_delivery_no_downstream`, snapshots, CAS, gates e histórico permanecem preservados.
- Fiscal pendente, envios bloqueados e zero cobrança/baixa/contabilização de receita/carteira vencida antes da NF.
- Sem SQL hospedado, publicação, emissão, cobrança ou envio. Testes sintéticos não certificam JWT/RLS/Storage hosted.

## Modelo aprovado

1. **Previsão separada:** criada por idempotência somente quando aprovação comercial e aprovação de crédito/condições válidas estiverem confirmadas. Espelha o cronograma econômico contratado e possui vencimentos explicitamente estimados.
2. **Sem título antes da NF:** a previsão não é `accounts_receivable`, não é exigível e não abre cobrança, baixa, pagamento ou contabilidade.
3. **Definitivo por NF:** cada NF autorizada gera/confirma seu próprio recebível definitivo. NFs parciais podem gerar títulos próprios, limitados às alocações e ao total econômico.
4. **Previsão residual:** após cada NF, a previsão é reconciliada com o residual ainda não faturado; não se soma ao título definitivo nem ao pedido no crédito.
5. **Histórico:** falhas, rejeições, timeouts, cancelamentos e reconciliações são append-only, sem delete ou reescrita de snapshots.

## Máquina de estados

```text
SEM_PREVISAO
  | aprovação comercial E crédito/condição válidos
  v
PREVISTO_AGUARDANDO_FISCAL
  | intenção idempotente de emissão
  v
EMISSAO_EM_ANDAMENTO
  | falha/rejeição explícita                  | timeout ambíguo
  v                                           v
PREVISTO_AGUARDANDO_FISCAL             CONSULTA_FISCAL_OBRIGATORIA
                                               | consulta autoritativa
                                      +--------+----------------+
                                      | autorizada              | não autorizada
                                      v                         v
                           PREVISTO_FATURADO_PARCIAL/TOTAL  PREVISTO_AGUARDANDO_FISCAL

NF autorizada -> cria/confirma UM recebível definitivo daquela NF
NF parcial    -> reconcilia previsão residual + título da NF
cancelamento  -> cancela previsão/residual com histórico; título de NF exige contrato fiscal próprio
```

Todo retry mantém a mesma intenção de emissão e a mesma previsão. Timeout exige consulta antes de reemitir. Cada recebível definitivo usa `issue_date` da NF + prazo contratado; a previsão conserva datas estimadas.

## Fase 1 — Previsão separada após aprovação comercial e crédito

1. **Contrato privado e migração candidata inativa**
   - Criar candidato local para previsão server-owned, com pedido, tenant, parceiro, versão da condição, snapshot econômico, itens, cronograma estimado, residual, estado, CAS e idempotência.
   - Sem acesso direto do cliente à tabela privada; leitura por RPC escopada e escritas somente pelo fluxo canônico autorizado.
   - PRE por fase, POST, hashes LIVE separados dos hashes pós-candidato e rollback deny-only.

2. **Integração com aprovação**
   - Projetar/integrar a criação na mesma fronteira transacional que comprova aprovação comercial E crédito, sem writer paralelo e sem aprovação baseada só em cache/UI.
   - Replay da aprovação retorna a mesma previsão; revogação antes da gravação nega atomicamente.
   - Pedido ainda não aprovado nos dois eixos não cria previsão.

3. **Crédito e leitura**
   - Crédito usa pedido residual não faturado + definitivos em aberto; a previsão é somente projeção desse residual e nunca parcela adicional.
   - Na transição para NF, reduzir residual e incluir o definitivo uma única vez, sem somar pedido integral + previsão + título.

4. **UI e testes locais**
   - Exibir previsão separada, estimativa e estado fiscal, sem ações de cobrança/baixa.
   - Testar criação única, dupla aprovação obrigatória, replay, concorrência, revogação, cancelamento e leitura por tenant/papel.

## Fase 2 — NF autorizada e recebível definitivo por documento

1. **Reconciliação fiscal estrita**
   - Exigir NFE, `HOMOLOGATION`, retorno `2`, envelope `104` + protocolo `100/150`, XML assinado, tenant, pedido, itens, valores e contabilidade vigente.
   - Corrigir a ordem/imutabilidade H7 e auditoria com deltas mínimos revisáveis; `CLOSE_PENDING` nunca será aceito como positivo.

2. **Um definitivo por NF**
   - Reutilizar a cardinalidade B4: um recebível por documento fiscal confirmado, com replay/concorrência preservando o mesmo título.
   - NFs parciais distintas têm títulos próprios e atualizam a previsão residual; nunca cobrar além das alocações ou do total econômico.
   - Vencimentos definitivos por emissão da NF + prazo contratado; previsões anteriores permanecem identificadas como estimativas.

3. **Falha, rejeição e timeout**
   - Falha/rejeição conserva previsão e permite retry sem nova previsão ou título.
   - Timeout ambíguo consulta estado antes de reemitir; somente resposta autoritativa de não autorização permite nova tentativa.

4. **Cancelamento e compatibilidade**
   - Antes da NF: cancela previsão/residual com histórico.
   - Após NF parcial: cancela somente residual; títulos autorizados permanecem preservados.
   - Cancelamento de NF/título exige contrato fiscal/financeiro próprio homologado, sem estorno automático inventado.
   - Títulos históricos permanecem imutáveis; eventual geração de previsões para pedidos antigos exige migração separada, sem backfill automático ou dupla contagem.

5. **Validação local e gate**
   - PostgreSQL descartável com código real reconciliado e dependency candidate estrita, sem stub permissivo.
   - Provar positivo `104/100` → um título por NF, duas ou mais NFs parciais, replay/retransmissão, concorrência, divergências, revogação durante lock, timeout, rejeição, cancelamentos e rollback.
   - Nova evidência por tentativa com stdout/stderr/exit e SQLSTATE/mensagem real antes/depois, sem tokens.
   - Pacote final `REVIEW_ONLY_INACTIVE_NOT_APPROVED` até revisão independente PASS; nenhuma produção/NF real está autorizada.

## Impacto técnico

- **Esquema:** previsão privada separada, eventos/auditoria e reconciliação residual; `accounts_receivable` continua exclusivamente definitivo.
- **RPCs:** aprovação comercial+crédito, leitura escopada da previsão, intenção/consulta fiscal e reconciliação service-only; nenhum grant amplo.
- **Crédito:** previsão não adiciona exposição; residual e definitivos são buckets mutuamente exclusivos.
- **UI:** previsão/estimativa separada do recebível definitivo e ações fiscais coerentes com o estado.
- **Testes:** valores concretos, permissões, CAS, idempotência, concorrência, parciais, cancelamentos, migração e rollback.

## Decisões ainda necessárias

- Assinaturas exatas dos pontos canônicos de aprovação comercial/crédito e das consultas de timeout de cada provedor.
- Tratamento de pedidos já aprovados antes do novo contrato, sem backfill automático.
- Contrato posterior de cancelamento fiscal e seus efeitos financeiros/contábeis, fora desta implementação.

## UI independente

O atalho “Aprovações de crédito” permanece independente: correção local com 31/31 testes, typecheck 0 e build mais recente OK. A prévia externa ainda requer reteste autenticado do auditor; nenhuma publicação foi realizada.
