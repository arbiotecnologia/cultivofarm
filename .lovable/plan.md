# Plano revisável — registro financeiro provisório antes da NF

**Status:** proposta para revisão, não aprovada para implementação. A decisão de release da ponte fiscal pós-confirmação fica suspensa até reconciliar este desenho. Nenhuma NF de produção está preparada ou autorizada.

## Fatores preservados

- A tentativa 125 caracterizou `FISCAL_DOCUMENT_LOCKED`: a ponte tentou gravar `receivable_id` depois de a NF se tornar imutável.
- A tentativa 126 avançou e caracterizou o CHECK de `fiscal_audit_log_action_check`; ambas permanecem como diagnóstico, não como aprovação da ponte.
- A tentativa 127 foi interrompida pela mudança de direção e marcada `INTERRUPTED_NOT_RUN_TO_COMPLETION`; não há positivo fiscal integrado promovido.
- `strict-01` e demais limitações históricas permanecem preservados. ACL, dez gatilhos de recebíveis, `a00_delivery_no_downstream`, snapshots, RLS, gates e contenções não serão enfraquecidos.
- Escopo exclusivamente local/documental nesta etapa: sem SQL hospedado, publicação, emissão, cobrança, baixa, contabilização de receita, envio ou ativação.

## Modelo proposto

Criar **um agregado financeiro canônico por pedido/cronograma contratado** após aprovação comercial, crédito e condições válidas. Antes da autorização fiscal ele é somente um registro provisório `aguardando_fiscal`, não um título exigível.

A autorização de uma NF confirma uma parcela faturada **do mesmo agregado**, sem criar outra duplicata. Uma entidade de alocação fiscal separa, de forma auditável, valor residual, quantidade/valor faturado e NF correspondente. Isso substitui, para o novo contrato, a hipótese de criar um novo recebível independente a cada NF.

## Máquina de estados proposta

```text
SEM_REGISTRO
  | aprovação comercial + crédito + condição válidos, atomicamente
  v
AGUARDANDO_FISCAL  <-----------------------------+
  | início idempotente de emissão                |
  v                                              |
EMISSAO_EM_ANDAMENTO                             |
  | falha/rejeição fiscal explícita               |
  +----------------------------------------------+
  | timeout/resultado ambíguo
  v
CONSULTA_FISCAL_OBRIGATORIA
  | consulta confirma autorização           | consulta prova não autorização
  v                                         v
FATURADO_PARCIAL ou FATURADO          AGUARDANDO_FISCAL
  | NF parcial residual > 0                    | novo retry com mesma intenção
  +---------------------------------------------+

AGUARDANDO_FISCAL --cancelamento sem NF autorizada--> CANCELADO_ANTES_DA_NF
FATURADO_PARCIAL  --cancelamento somente residual--> CANCELADO_RESIDUAL
FATURADO          --evento fiscal próprio----------> CANCELAMENTO_FISCAL_PENDENTE
                                                     -> CANCELADO_FISCAL
```

Regras:

- Todo retry usa a mesma intenção e chave de idempotência; não cria novo agregado, cronograma ou título.
- Timeout ambíguo obriga consulta de estado antes de qualquer reemissão. A consulta deve considerar chave de acesso, protocolo, ambiente, tenant e identificador da intenção.
- Antes da autorização não existem cobrança, baixa, receita contabilizada, carteira vencida ou ação de pagamento.
- Datas anteriores à NF são marcadamente estimadas. Cada parcela faturada usa `issue_date` da NF + prazo contratado para seu vencimento definitivo.
- Cancelamentos são eventos append-only; nenhum delete nem reescrita de histórico. Cancelamento fiscal não estorna automaticamente receita ou recebível sem contrato próprio homologado.

## Fase 1 — Provisório anterior à NF

1. **Inventário de consumidores e contenção**
   - Mapear toda leitura/escrita de `accounts_receivable`, parcelas, crédito, cobrança, relatórios, contabilidade e UI.
   - Definir predicados que excluam provisórios de cobrança, baixa, receita, vencidos e relatórios exigíveis antes de qualquer escrita candidata.
   - Manter writers legados e ponte pós-confirmação fechados durante a revisão.

2. **Modelo e migração candidata, ainda inativos**
   - Definir no agregado canônico estágio financeiro, versão/CAS, origem, condição econômica imutável, indicação de vencimento estimado e timestamps de confirmação.
   - Projetar alocações fiscais por agregado/parcela/NF, com valor, quantidade, residual, estado, chave de idempotência e auditoria append-only.
   - Decidir fisicamente entre evoluir o agregado atual ou criar raiz de cronograma canônica; não criar fluxo financeiro paralelo nem escolher antes do inventário.
   - Preparar PRE/POST/rollback deny-only e avaliação de impacto, sem aplicar.

3. **RPCs e fronteiras**
   - Conceber uma única transação de aprovação comercial/crédito que valida condição e cria o provisório por idempotência, sem writer paralelo.
   - Manter emissão, consulta e reconciliação fiscal service-only; cliente não grava protocolo, status fiscal ou confirmação.
   - Fazer crédito ler buckets mutuamente exclusivos: residual ainda não provisionado + provisório ativo + definitivo em aberto. A transição move valor entre buckets e nunca soma pedido integral + provisório + definitivo.

4. **UI**
   - Exibir “previsão aguardando fiscal”, valores e vencimentos estimados antes da NF.
   - Não montar cobrança, baixa, pagamento, contabilidade ou ações de título enquanto o estado não for faturado.
   - Mostrar residual e parcelas faturadas por NF sem apagar histórico de falhas/consultas.

5. **Gate da fase**
   - Testes descartáveis de criação única, replay, concorrência, condição/crédito revogados, falha após aprovação e rollback.
   - Provar ausência de efeitos externos e de contagem dupla de crédito em todas as transições.
   - Nenhuma ativação sem revisão independente e autorização específica.

## Fase 2 — Confirmação fiscal do mesmo registro

1. **Reconciliação autorizada**
   - Validar NF NFE, ambiente `HOMOLOGATION`, retorno `2`, envelope `104` + protocolo `100/150`, XML assinado, tenant, pedido, itens, valores e contabilidade vigente.
   - Confirmar a parcela no agregado existente, atualizar residual e gravar vínculo/auditoria na mesma transação; nenhum novo recebível por replay ou NF parcial.

2. **Retry e timeout**
   - Falha/rejeição conserva o provisório e permite retry idempotente.
   - Timeout consulta primeiro; reemissão somente após resposta autoritativa de não autorização, com correlação e trilha completas.

3. **Faturamento parcial**
   - Alocar cada NF à mesma raiz, separando parte faturada e residual.
   - Duas NFs parciais devem produzir duas alocações fiscais e zero novas raízes/duplicatas; a soma nunca excede itens/alocações nem o total econômico.
   - Cada parte faturada tem vencimento próprio por data de emissão; o residual permanece estimado.

4. **Cancelamento**
   - Sem NF: cancela todo o provisório com motivo/histórico.
   - Parcial: cancela apenas residual, preservando parcelas autorizadas.
   - Após NF: depende de evento fiscal homologado; não há reversão financeira automática inventada.

5. **Compatibilidade e migração**
   - Manter títulos históricos imutáveis e identificar explicitamente o contrato legado “um título por documento fiscal”.
   - Não fazer backfill automático: primeiro mapear quais títulos antigos representam raiz, parcela ou alocação e provar ausência de duplicidade/exposição.
   - Se houver coexistência temporária, usar versão de contrato e leitores reconciliados; nunca somar os dois modelos no crédito nem na carteira.
   - Rollback fecha writers novos e preserva registros, vínculos, snapshots e histórico.

6. **Gate da fase**
   - Ensaios em PostgreSQL descartável: positivo único, duas/mais NFs parciais, replay, retransmissão estável, concorrência, divergência, revogação durante lock, timeout, rejeição, cancelamentos e rollback.
   - Homologação posterior, separada e autorizada, com provedor sem efeitos reais de cobrança; NF de produção permanece fora do plano.

## Impacto técnico a revisar

- **Esquema:** estágio/CAS/origem no agregado, alocações NF↔parcela, idempotência e auditoria; RLS/grants restritos em qualquer tabela nova.
- **RPCs:** aprovação+provisão atômica, intenção de emissão, consulta obrigatória, reconciliação service-only e cancelamento residual; legado permanece fechado até migração aprovada.
- **Consultas:** crédito, carteira, vencidos, relatórios e contabilidade precisam distinguir provisório de exigível.
- **UI:** estados, estimativas, residual, falhas e retries sem ações financeiras antecipadas.
- **Testes:** regras de estado e valores concretos, permissões reais de papel, concorrência, imutabilidade e migração; testes sintéticos não certificam JWT/RLS/Storage hosted.

## Decisões necessárias antes de implementar

1. Estrutura física do agregado único e estratégia para todos os consumidores existentes.
2. Momento transacional exato da provisão e tratamento de aprovação já existente sem registro.
3. Forma de dividir parcelas contratadas quando várias NFs têm datas e valores distintos.
4. Política contábil para provisório, faturado parcial, cancelamento e eventos fiscais posteriores.
5. Migração/coexistência dos títulos legados por documento, sem backfill ou dupla contagem.
6. Assinaturas e evidências reais dos provedores para consulta de timeout e classificação de rejeição.

## UI independente

O atalho “Aprovações de crédito” não faz parte desta regra financeira. A correção local cobre também query recebida com a página já montada: **31/31 testes**, typecheck exit 0 e build mais recente **OK**. A prévia externa continua sem reteste autenticado pelo agente; nenhuma publicação foi realizada.
