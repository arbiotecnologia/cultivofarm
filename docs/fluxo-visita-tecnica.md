# Fluxo Unificado de Visita Técnica e Evidências Privadas (Revisado para BI)

Este documento descreve o fluxo oficial, regras de negócio e governança da esteira de visita técnica no sistema AR Bio, com foco em segurança de arquivos privados via Signed URLs.

## 1. Fluxo Oficial da Esteira

O processo de visita técnica segue uma sequência linear e rastreável:

1.  **Solicitação ou Demanda:** Iniciada pelo produtor (Portal) ou internamente (Agenda).
2.  **Atribuição e Agendamento:** O gestor atribui um consultor e define a data prevista.
3.  **Check-in:** Registro de presença no campo (via mobile) com coordenadas GPS.
4.  **Execução da Visita:** Coleta de diagnósticos, fotos, áudios e notas.
5.  **Recomendação Técnica:** Conduta sugerida pelo consultor para o problema identificado.
6.  **Liberação/Aprovação:**
    *   **Envio para Aprovação:** Caso exija revisão do gestor.
    *   **Liberação Direta:** Caso o consultor tenha autonomia e a opção esteja ativa.
7.  **Decisão do Produtor:** Aceite, recusa ou solicitação de aplicação (via Portal).
8.  **Geração de OS:** Se aceito e aplicável, gera uma Ordem de Serviço para o laboratório.
9.  **Retorno ou Monitoramento:** Programação de nova visita ou ativação de alerta de acompanhamento.

## 2. Status Oficiais

### Solicitação (`portal_solicitacoes`)
- `pendente`: Aguardando triagem.
- `aberta`: Triagem realizada.
- `atribuida`: Consultor designado.
- `agendada`: Data de visita definida.
- `em_visita`: Visita iniciada pelo consultor.
- `checkin_realizado`: Consultor confirmou chegada.
- `recomendacao_emitida`: Visita finalizada com conduta técnica.
- `aguardando_decisao_produtor`: Recomendação liberada ao cliente.
- `convertida_os`: Demanda evoluiu para Ordem de Serviço.
- `concluida`: Fluxo encerrado com sucesso.
- `cancelada`: Atendimento anulado.

### Visita Técnica (`registros_consultor`)
- `rascunho`: Visita em preenchimento.
- `finalizado`: Visita concluída pelo consultor.
- `enviado_aprovacao`: Aguardando aval do gestor técnico.
- `aprovado`: Recomendação pronta e liberada ao produtor.
- `reprovado`: Necessita ajustes conforme feedback do gestor.
- `convertido_os`: OS gerada a partir da recomendação.
- `arquivado`: Histórico inativo.

## 3. Regras de Governança

*   **Check-in Vinculado:** Nenhum check-in técnico iniciado por uma solicitação deve ser salvo sem `registro_consultor_id`. O sistema deve garantir que uma visita rascunho seja criada ou obtida antes do registro de localização.
*   **Identidade:** `consultor_responsavel` deve ser sempre o `user.id` do consultor autenticado. O `consultor_profile_id` é usado apenas como referência complementar.
*   **Idempotência:** Uso de `client_uuid` em check-ins e arquivos para evitar duplicidade em sincronização offline.
*   **Segurança:** Arquivos de visita são privados. O acesso é restrito ao consultor, gestores e ao cliente (apenas após liberação).
*   **Rastreabilidade:** Novas solicitações de retorno devem obrigatoriamente referenciar o `registro_origem_id` da visita anterior.
*   **Integridade:** Não é permitido pular etapas (ex: aprovar sem diagnóstico ou recomendação).

## 4. Diferença entre Processos

*   **Visita Técnica:** Focada no diagnóstico e recomendação agronômica (O QUE fazer).
*   **Ordem de Serviço (OS):** Focada na execução laboratorial e logística (COMO produzir e entregar).
*   **Aplicação:** Registro de uso do produto em campo, geralmente responsabilidade do produtor, servindo como fechamento do ciclo de eficácia.

## 5. Implementação Técnica

O hook `src/hooks/useFluxoVisitaTecnica.ts` é a fonte central de verdade para todas as ações críticas da esteira de visita técnica. Qualquer nova funcionalidade ou regra de negócio deve ser implementada preferencialmente dentro deste hook para garantir consistência em todas as plataformas (Web e Mobile).

Ações centralizadas:
- `iniciarVisita`: Cria rascunho e vincula à solicitação.
- `registrarCheckin`: Registra presença com GPS e atualiza timeline.
- `liberarRecomendacaoParaProdutor`: Aciona RPC de liberação e atualiza status.
- `programarRetorno`: Cria nova demanda de retorno vinculada à visita original.
- `criarRetornoComRascunho`: Alias para `programarRetorno`, garantindo criação de solicitação e rascunho em fluxo único.

## 6. Regras de Retorno Técnico e Segurança (Fase 10.2.1.4)

O Retorno Técnico não deve ser tratado como uma nova solicitação isolada. Ele deve sempre manter o vínculo com a visita que o originou para garantir a continuidade do diagnóstico agronômico.

Regras obrigatórias:
1. **Vínculo Seguro:** Uso obrigatório de `registro_origem_id` apontando para o UUID da visita original.
2. **Uso de IDs Reais:** Jamais buscar a "última solicitação criada" por cliente. Deve-se capturar o ID retornado diretamente do comando `.insert().select("id").single()`.
3. **Fluxo Automático:** A criação do retorno deve gerar simultaneamente a solicitação (`portal_solicitacoes`) e a visita rascunho (`registros_consultor`), garantindo que o consultor já tenha o ambiente de trabalho pronto para a nova visita.
4. **Timeline Cruzada:** A programação de um retorno deve registrar um evento na timeline da solicitação original e na timeline da nova solicitação de retorno.
5. **Independência Operacional:** O retorno técnico é um processo de acompanhamento de campo e não deve disparar fluxos laboratoriais (PCP/OS) de forma automática. Qualquer nova OS deve ser gerada a partir da recomendação da visita de retorno, seguindo o fluxo normal.
6. **Prevenção de Duplicidade:** O sistema deve validar se já existe um retorno técnico em aberto para evitar a criação duplicada. Caso exista, redireciona o usuário para o registro existente.
7. **Visibilidade:** No portal do produtor, o retorno deve ser exibido como um desdobramento da visita anterior, permitindo navegar entre a visita original e seus retornos técnicos.
8. **Segurança de Status:** O hook `useFluxoVisitaTecnica.ts` jamais deve retornar `success: true` para operações críticas se houver falha em regras de integridade (ex: finalizar sem diagnóstico ou liberar sem recomendação).
9. **Governança de Mídia:** Novas evidências devem obrigatoriamente usar `arquivo_path` (storage path). O carregamento para exibição deve ser feito via Signed URL. O campo `arquivo_url` (público) é mantido apenas como legado para registros antigos.
10. **Categorias de Arquivo:** Fotos de check-in devem usar a categoria `checkin`. Outras categorias incluem `vistoria` e `retorno`.
11. **Idempotência Transacional:** Sincronização de status entre visita (`registros_consultor`) e solicitação (`portal_solicitacoes`) é tratada via RPC para garantir atomicidade.
12. **Visão Consolidada:** A view `vw_fluxo_visita_tecnica` integra toda a jornada desde a solicitação, garantindo que mesmo solicitações sem visita ou visitas avulsas sejam monitoradas em uma esteira única.
13. **Conversão Segura em OS (Fase 10.2.1.5):** A recomendação técnica aprovada deve ser convertida em OS On-Farm via `rpc_converter_visita_em_os`. A visita técnica é a origem técnica (O QUE fazer) e a OS é o ponto de entrada oficial no laboratório (COMO executar).
14. **Prevenção de Duplicidade OS:** A RPC valida se já existe OS vinculada ao `registro_consultor_id` antes de criar uma nova através de um índice único parcial na tabela `ordens_servico_onfarm`.
15. **Herança de Dados:** A OS On-Farm herda automaticamente cliente, fazenda, talhão, cultura, fase fenológica, problema principal, diagnóstico e recomendação da visita original.
16. **Status Inicial OS:** O status inicial de uma OS gerada via visita técnica é `aberta`, indicando que está aguardando o início do processamento laboratorial.
17. **Papéis Oficiais:** O sistema utiliza os papéis `administrador`, `gestor`, `consultor_tecnico` e `tecnico_agronomo`. Todas as RPCs e validações de interface devem seguir rigorosamente estes termos.
18. **Liberação de Recomendação Segura (Fase 10.2.1.7.1):** A liberação da recomendação ao produtor via `rpc_liberar_recomendacao_produtor` exige validação de autenticação, papel oficial, status da visita (bloqueia arquivado/reprovado/convertido) e existência de recomendação válida. Sincroniza automaticamente o status da solicitação para `aguardando_decisao_produtor`.
19. **Conversão Unificada e Segura em OS:** A conversão em OS On-Farm é blindada contra duplicidade via índice único parcial e validação em RPC. Uma visita `convertido_os` não pode ser convertida novamente. Garante atomicidade: se a criação da OS falhar, o status da visita não é alterado.
20. **Relação Visita → OS → Laboratório:** A visita técnica é o input de inteligência agronômica. A OS é o input de produção/logística. O laboratório consome as OSs geradas e aprovadas. Não há vínculo direto entre visita e estoque/produção sem a intermediação da OS.
21. **Evidências Privadas e Governança de Mídia (Fase 10.2.1.7.2):**
    *   **Padrão Seguro:** Novas evidências (fotos, áudios, anexos) devem obrigatoriamente usar `arquivo_path`.
    *   **Visualização:** O carregamento deve ser feito exclusivamente via **Signed URL** temporária.
    *   **Legado:** O campo `arquivo_url` é mantido apenas como fallback para registros antigos.
    *   **Check-in:** Fotos de check-in são tratadas como evidências técnicas, armazenadas via `foto_path` e registradas na tabela de arquivos com categoria `checkin`.
    *   **Bucket:** O bucket `consultor-arquivos` opera com políticas RLS restritivas para garantir que apenas usuários autorizados acessem os dados brutos.
    *   **Offline Sync:** A sincronização offline utiliza `client_uuid` para garantir que o upload e o registro no banco sejam atômicos e idempotentes.

## KPIs e Métricas Reais
- **Hook de Métricas**: `useMetricasOperacionais.ts` centraliza a coleta de dados reais das views `vw_fluxo_visita_tecnica` e `vw_esteira_laboratorio`.
- **Indicadores Disponíveis**:
    * Total de solicitações abertas.
    * Visitas realizadas e check-ins efetuados.
    * Recomendações emitidas e liberadas.
    * Taxa de conversão Recomendação → OS.
- **Transparência**: Indicadores sem dados suficientes são sinalizados como "Sem dados suficientes", evitando a exibição de números fictícios.
- **Preparação para BI**: A base de dados está pronta para o dashboard de BI da Fase 11, com views e RPCs blindadas por RLS e validações de perfil.
- **Isolamento de Dados**: Clientes/produtores acessam apenas seus dados; consultores acessam apenas visitas, solicitações e arquivos de clientes com vínculo operacional real (atribuição direta). O acesso amplo por role foi desativado para garantir a integridade do BI.
- **Views Consolidadas (Fase 10.2.1.12.2)**:
    * `vw_fluxo_visita_tecnica`: Unifica solicitações e visitas, incluindo as três origens (`solicitacao_sem_visita`, `visita_com_solicitacao`, `visita_avulsa`).
    * **Prevenção de Duplicidade**: Utiliza CTE com `DISTINCT ON` para garantir uma única linha por visita, mesmo que existam múltiplas OS vinculadas (seleciona a mais recente).
    * **Campos Avançados**: Retorna diagnósticos, evidências, recomendações e OS vinculada, com flags de integridade (`possui_recomendacao`, `possui_os`).
    * **Tempos de Funil**: Calcula tempos médios (em horas) entre solicitação, check-in, finalização, aprovação e conversão em OS.
    * **Bloqueios Operacionais**: Campo `bloqueios` (array de texto) que sinaliza problemas como `sem_diagnostico`, `sem_recomendacao`, `os_duplicada` (quando `total_os_vinculadas > 1`), `convertida_os_sem_os`, entre outros.
    * **Próxima Ação**: Campo `proxima_acao` refinado:
        - Se `status_visita = 'convertido_os'` e `os_id` é nulo: "Corrigir vínculo da OS".
        - Se `status_visita = 'convertido_os'` e `os_id` existe: "Concluído".
    * `security_invoker = true`: Garante que as views respeitem rigorosamente o RLS das tabelas base.
- **RPCs Blindadas (Fase 10.2.1.8.2)**:
    * `rpc_liberar_recomendacao_produtor`: Validação rigorosa de roles (`administrador`, `gestor`, `consultor_responsável`), existência de recomendação e sincronização atômica de status.
    * `rpc_converter_visita_em_os`: Garantia de unicidade (uma OS por visita), herança completa de dados técnicos e transacionalidade total. Bloqueia duplicidade via índice único parcial `idx_unique_os_onfarm_registro_consultor`.




## 7. Fase 10.2.1.10.1 — Blindagem do fluxo Visita → Recomendação → OS On-Farm

### Fluxo oficial blindado

1. Visita finalizada (com diagnóstico real) → `enviado_aprovacao`.
2. **Liberação ao produtor** via `public.rpc_liberar_recomendacao_produtor(p_registro_id)`:
   - Valida `auth.uid()`, papel oficial (`administrador`, `gestor`; `consultor_tecnico`/`tecnico_agronomo` apenas se forem `consultor_responsavel`).
   - Bloqueia status `arquivado`, `convertido_os`, `reprovado`.
   - Exige recomendação real (`recomendacao_tecnica`, `observacoes_finais` ou `estrategia_manejo` não vazios).
   - Atualiza `registros_consultor.status = 'aprovado'`.
   - Se houver `solicitacao_id`: `portal_solicitacoes.status = 'aguardando_decisao_produtor'`.
   - Registra `registros_consultor_status_log`, `visitas_logs (acao = 'recomendacao_liberada')` e `solicitacoes_timeline`.
3. **Conversão em OS On-Farm** via `public.rpc_converter_visita_em_os(p_registro_id, p_observacao)`:
   - Mesma matriz de permissão.
   - Exige status `aprovado`, cliente/fazenda/talhão e recomendação real.
   - Se já existir OS vinculada → retorna `{ success: true, already_exists: true, os_id, numero_os }` (idempotente).
   - Inserção transacional com `EXCEPTION` handler: falha não altera status da visita nem da solicitação.
   - Atualiza visita para `convertido_os`, solicitação para `convertida_os`.
   - Registra `registros_consultor_status_log`, `visitas_logs (acao = 'os_gerada')` e `solicitacoes_timeline`.
   - Índice único parcial `idx_unique_os_onfarm_registro_consultor` garante 1:1 visita↔OS.

### Contrato JSON das RPCs

```jsonc
// rpc_liberar_recomendacao_produtor
{ "success": true, "message": "...", "registro_id": "...", "solicitacao_id": "...|null", "status_anterior": "...", "status_novo": "aprovado" }

// rpc_converter_visita_em_os
{ "success": true, "already_exists": false, "os_id": "...", "numero_os": "...", "registro_id": "...", "solicitacao_id": "...|null", "status_anterior": "aprovado", "status_novo": "convertido_os" }
```

### Logs obrigatórios

| Etapa | `visitas_logs.acao` | `solicitacoes_timeline.tipo_evento` | `registros_consultor_status_log` |
|---|---|---|---|
| Liberação ao produtor | `recomendacao_liberada` | `recomendacao_liberada` | `* → aprovado` |
| Conversão em OS | `os_gerada` | `convertida_os` | `aprovado → convertido_os` |

### Regras estruturais

- Visita **não** toca PCP, lote, CQ, envase, estoque diretamente. A OS é o único canal para o laboratório.
- Sem fluxos paralelos. Sem `DELETE` destrutivo.
- BI será construído sobre os logs e views já consolidadas.

## 8. Fase 10.2.1.10.3 — Evidências Privadas e Segurança Final

### Governança de Mídia
- **Obrigatoriedade de path**: Novos registros em `registros_consultor_arquivos` devem salvar `arquivo_path`.
- **Signed URLs**: Toda visualização de mídias privadas (bucket `consultor-arquivos`) deve ser feita via Signed URL temporária gerada pelo backend.
- **Check-in**: Fotos capturadas no check-in são salvas como evidência técnica (categoria `checkin`) e vinculadas via `visitas_checkin.foto_path`.
- **Idempotência**: `client_uuid` é obrigatório em todos os registros de mídia para evitar duplicidade no sync offline.

### Auditoria Pré-BI
- Views consolidadas operam com `security_invoker = true`.
- RLS blindado para impedir que clientes vejam dados de outros clientes, mesmo através de views.
- Logs de auditoria (`visitas_logs` e `laboratorio_esteira_eventos`) são a base para métricas reais de BI.

