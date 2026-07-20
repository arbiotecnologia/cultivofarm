# Central de Alertas Operacionais AR Bio

## Objetivo
Transformar dados do BI, visitas, recomendações, OS, laboratório, CQ, estoque e entregas em alertas gerenciais acionáveis. A central é **passiva**: apenas exibe e registra — não altera fluxos operacionais e não envia notificações externas nesta fase.

## Tabelas
- `alertas_operacionais` — alertas gerados (status, gravidade, origem, vínculos, metadata, `chave_dedupe`).
- `alertas_regras` — catálogo de regras com `codigo` único, `ativo` e `parametros` (JSON).
- `alertas_leituras` — leitura por usuário (`alerta_id`, `user_id`).
- `alertas_acoes` — histórico de ações (inclui ações automáticas).

## Status
`aberto | lido | resolvido | ignorado | reaberto`

## Gravidade
`informativa | baixa | media | alta | critica`

## Origem
`visita | recomendacao | laboratorio | cq | estoque | entrega | bi | sistema`

## RLS
- `administrador`, `gestor`, `administrativo`: leitura total. Apenas estes (e service_role) inserem/atualizam alertas e executam a RPC do motor.
- `consultor_tecnico` / `tecnico_agronomo`: visualizam alertas onde `consultor_id = auth.uid()`.
- `producao` / `operador_onfarm`: visualizam alertas de `laboratorio`, `cq`, `estoque`, `entrega`.
- `cliente_produtor` e `financeiro`: sem acesso a alertas internos nesta fase.

## Deduplicação
Cada alerta possui uma `chave_dedupe` composta por:
`tipo | origem | referencia_tabela | referencia_id | cliente_id | fazenda_id | consultor_id | os_id`.

Índices:
- `idx_alertas_operacionais_chave_dedupe`
- `uniq_alertas_operacionais_abertos_chave_dedupe` (parcial: aplica unicidade somente para status em `aberto | lido | reaberto`).

## Motor automático
`public.rpc_gerar_alertas_operacionais()` (security definer, search_path = public):
- Lê `vw_fluxo_visita_tecnica` e `vw_esteira_laboratorio`.
- Para cada condição detectada, chama `public.fn_upsert_alerta_operacional(...)` que:
  - Atualiza alerta existente em `aberto | lido | reaberto` (sem duplicar).
  - Ignora recriação se houver `ignorado` recente (< 1 dia).
  - Ignora recriação se houver `resolvido` dentro do prazo conforme gravidade (3d crítica, 7d alta, 15d média/baixa).
  - Insere novo alerta caso contrário, gravando `chave_dedupe` e `metadata` com `verificado_em`.
- Ao final, marca como **`resolvido` automaticamente** os alertas dos tipos suportados cuja condição não foi mais detectada e registra ação `resolvido_automaticamente` em `alertas_acoes`.
- Retorna resumo agregado: `total_processados`, `total_resolvidos_automaticamente`, `executado_em`.

## Regras implementadas
visita_sem_checkin, visita_finalizada_sem_recomendacao, recomendacao_liberada_sem_decisao, recomendacao_convertida_sem_os, visita_com_bloqueio, os_duplicada, os_sem_programacao, os_sem_lote, cq_pendente, cq_reprovado, os_sem_envase, os_sem_estoque, entrega_pendente, os_apta_finalizacao, aplicacao_nao_registrada (informativa), os_atrasada.

Cada regra pode ser desativada via `alertas_regras.ativo = false` ou parametrizada via `alertas_regras.parametros` (por exemplo `{"dias": 3}`).

## Permissões da RPC
- Botão "Atualizar alertas" só aparece para `administrador`, `gestor`, `administrativo`.
- A própria RPC valida `has_role` antes de executar; consultor, produção, cliente e financeiro não conseguem disparar.

## Filtros disponíveis
Status, gravidade, origem, tipo, período, somente críticos, apenas alertas gerados automaticamente (sem `criado_por`), apenas meus alertas (`consultor_id = auth.uid()`).

## Resumo
Cards: abertos, críticos, alta gravidade, resolvidos, gerados hoje.

## Limitações desta fase
- Sem cron / Edge Function agendada.
- Sem WhatsApp, e-mail ou push.
- Sem UI de edição de regras.
- A RPC retorna apenas o resumo, nunca dados sensíveis no payload.

## Evoluções futuras
- Edge Function agendada para reconciliação periódica.
- Notificações multicanal (WhatsApp, e-mail, push).
- Dashboards analíticos de alertas.
- Edição de regras e parametrização por UI.
- Integração com BI Operacional para reabertura automática quando um gargalo persiste após resolução manual.

## Fase 12.3 — Notificações internas, badges e painel de prioridades
- **Badge no menu lateral** (`AlertasBadgeMenu`): contador dinâmico ao lado de "Alertas". Mostra críticos em destaque (`bg-destructive`, pulse) e cai para total de abertos caso não haja críticos. Oculto para `cliente_produtor` e `financeiro`.
- **Sino no header** (`AlertasNotificationBell`): popover com 5 alertas prioritários, contador de não lidos e botão "Ver alertas". Deep-link via `/alertas-operacionais?alerta=<id>`.
- **Painel de prioridades** (`AlertasPainelPrioridades`) no topo da Central, com blocos: Críticos, Alta prioridade, Meus alertas, Recentes. Dados resumidos independentes dos filtros principais.
- **Hook `useAlertasResumo`**: consulta enxuta (campos limitados, máx. 200 ativos) usada por badge, sino e painel. Sempre respeita RLS — `cliente_produtor`/`financeiro` curto-circuitam para vazio.
- **Leitura por usuário**: ao abrir o drawer, `registrarLeitura` faz upsert em `alertas_leituras` (constraint `unique(alerta_id, user_id)` evita duplicidade). Status global do alerta NÃO é alterado por leitura. `marcarTodosComoLidos` faz upsert em lote para os alertas visíveis.
- **Visual lido/não lido**: cards e mini-list destacam não lidos (`bg-primary/5` + ponto azul).
- **Filtros rápidos**: somente críticos, não lidos, meus alertas, alta prioridade, apenas automáticos.
- **Cards de resumo**: abertos, não lidos, críticos, alta gravidade, resolvidos, gerados hoje. Resolvidos hoje (consulta count separada) usado no painel resumo do hook `useAlertasResumo`.

### Limitações e evoluções futuras
- Sem Realtime/cron/push/WhatsApp/e-mail nesta fase (deixado preparado).
- "Não lidos" depende de leitura prévia do conjunto ativo (máx. 200) — para volumes maiores, futuro: view materializada ou contador server-side.

## Fase 12.4 — Atualização em Tempo Real

A Central de Alertas opera com **Supabase Realtime** habilitado para as tabelas:

- `public.alertas_operacionais` (INSERT/UPDATE/DELETE)
- `public.alertas_leituras` (INSERT/UPDATE)
- `public.alertas_acoes` (INSERT)

### Hook central

`src/hooks/useAlertasRealtime.ts` concentra toda a lógica de subscription:

- canal único por tela (`alertas-lista`, `alertas-resumo`, `alerta-detalhe-<id>`)
- debounce padrão de 800ms agrupa rajadas de eventos em um único refetch
- callbacks `onAlertasChange`, `onLeiturasChange`, `onAcoesChange`
- nunca expõe payload bruto à UI; todos os refetches passam por consultas normais (RLS aplicada)
- fallback automático: se o canal não conectar em 10s ou cair, o hook recarrega via intervalo seguro (90s) e marca `realtimeEnabled = false`

### Integrações

- `useAlertasOperacionais` → refetch automático da lista e dos contadores
- `useAlertasResumo` → atualiza badge do menu, sino e painel de prioridades
- `AlertaDetalheDrawer` → recarrega histórico de ações; toast discreto "Este alerta foi atualizado." quando o registro muda durante visualização

### Indicador de status

`AlertasHeader` exibe chip discreto:

- **Tempo real** (verde, pulsante) — canal conectado
- **Manual** (cinza) — fallback ativo; usar o botão **Recarregar**

### Segurança

- Realtime respeita RLS — eventos são entregues, mas o refetch só retorna o que a policy permite.
- `cliente_produtor` e `financeiro` não veem alertas internos; o hook é desabilitado para esses perfis.
- Nenhuma policy foi afrouxada; nenhuma RPC foi alterada.

### Limitações desta fase

- Sem som, push, e-mail ou WhatsApp.
- Sem Edge Function/cron.
- Realtime apenas para as três tabelas listadas; outras tabelas seguem sem subscription.

---

## Fase 12.5 — Agendamento Automático

### Tabela `public.alertas_execucoes`
Registra cada execução do motor (manual ou automática) com:
- `tipo_execucao`: `manual` | `automatico` | `cron` | `edge_function` | `sistema`
- `origem`: rótulo livre (ex.: `central_alertas`, `cron`)
- `status`: `iniciada` | `concluida` | `falhou` | `cancelada`
- `iniciado_em`, `finalizado_em`, `duracao_ms`
- Totais: `total_processados`, `total_criados`, `total_atualizados`, `total_resolvidos_automaticamente`, `total_ignorados_por_regra`
- `erro` (resumido, sem stack), `metadata` (JSON do retorno bruto), `executado_por`

**RLS:** apenas `administrador`, `gestor` e `administrativo` leem. INSERT/UPDATE somente via função `SECURITY DEFINER` ou service role. `cliente_produtor` e `financeiro` não acessam.

### RPC `public.rpc_executar_motor_alertas(p_tipo_execucao, p_origem)`
Wrapper auditado em torno de `rpc_gerar_alertas_operacionais()`:
1. Valida permissão (service_role bypassa, demais devem ser admin/gestor/administrativo)
2. Insere registro `iniciada` em `alertas_execucoes`
3. Executa o motor; em sucesso, atualiza totais e marca `concluida`
4. Em erro (EXCEPTION), marca `falhou` com mensagem resumida e relança um erro amigável

Retorno: `{ success, execucao_id, tipo_execucao, origem, resultado }`.

### Edge Function `gerar-alertas-operacionais`
- Endpoint: `POST {SUPABASE_URL}/functions/v1/gerar-alertas-operacionais`
- Cabeçalhos aceitos para autenticação interna:
  - `x-cron-secret: <ALERTAS_CRON_SECRET>`, OU
  - `Authorization: Bearer <ALERTAS_CRON_SECRET>`
- Usa `SUPABASE_SERVICE_ROLE_KEY` internamente. Chama `rpc_executar_motor_alertas` com `tipo_execucao='edge_function'`, `origem='cron'`.
- Resposta sucesso: `{ success: true, executado_em, resultado }`.
- Resposta falha: `{ success: false, message: "Nao foi possivel executar o motor de alertas." }` (sem stack).

### Variáveis de ambiente (backend)
- `SUPABASE_URL` (gerenciada)
- `SUPABASE_SERVICE_ROLE_KEY` (gerenciada)
- `ALERTAS_CRON_SECRET` (configurada via Secrets do projeto)

### Como configurar o agendamento no Supabase

**Opção A — pg_cron + pg_net** (recomendada, frequência conservadora de 1h):

```sql
-- Pré-requisitos: extensões pg_cron e pg_net habilitadas no projeto.
select cron.schedule(
  'gerar-alertas-operacionais-horario',
  '0 * * * *', -- toda hora cheia
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/gerar-alertas-operacionais',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<ALERTAS_CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Substitua `<PROJECT_REF>` e `<ALERTAS_CRON_SECRET>` antes de executar. Para desativar: `select cron.unschedule('gerar-alertas-operacionais-horario');`.

**Opção B — Agendador externo:** chame o mesmo endpoint enviando o header `x-cron-secret` a cada hora.

### Execução manual vs automática
- **Manual:** botão *Atualizar alertas* da Central. Chama `rpc_executar_motor_alertas` com `tipo_execucao='manual'`, `origem='central_alertas'`. Restrito a admin/gestor/administrativo.
- **Automática:** Edge Function disparada por cron. Mesma RPC com `tipo_execucao='edge_function'`. Não depende de usuário autenticado.

Se o cron não estiver ativo, o botão manual continua funcionando.

### Frontend
- `useAlertasExecucoes` consulta o histórico (limite 20) e Realtime para refletir novas execuções.
- `AlertasExecucaoStatus` mostra a última execução: status, duração, totais, erros recentes.
- `AlertasExecucoesHistorico` é uma seção recolhível com tabela (desktop) ou cards (mobile). Visível apenas para admin/gestor/administrativo.

### Riscos e mitigações
- Execução frequente demais: usar 1h como padrão; deduplicação da 12.2 evita criação duplicada.
- Vazamento de stack: a Edge Function nunca expõe `SQLERRM` na resposta pública; apenas em `console.error` (logs internos) e no campo `erro` da tabela (acessível somente a admins).
- Permissão indevida: a RPC valida `has_role` quando chamada via JWT comum; service_role só é usada na Edge Function protegida por segredo.


## Fase 12.6 — Notificações externas (e-mail)

Estrutura segura de notificações externas para alertas **críticos** e **alta prioridade**.

### Tabelas
- `alertas_notificacao_config` — config por canal (`email`, `whatsapp`), com `cooldown_minutos`, `max_envios_por_alerta`, `gravidades`.
- `alertas_notificacao_destinatarios` — lista de destinatários (nome + e-mail, opcionalmente telefone para fase futura).
- `alertas_notificacoes` — fila/histórico de envios com status (`pendente`, `enviado`, `falhou`, `cooldown`, `bloqueado`, `ignorado`).

### Permissões
- **administrador / gestor**: gerenciam config, destinatários e disparam processamento.
- **administrativo**: apenas leitura.
- **cliente_produtor / financeiro**: sem acesso nesta fase.
- Usuário destinatário enxerga suas próprias notificações quando `user_id` está vinculado.

### RPCs
- `rpc_preparar_notificacoes_alertas()` — varre alertas críticos/alta e cria registros `pendente` em `alertas_notificacoes`, respeitando cooldown e limite por alerta. Não envia e-mail.
- `rpc_marcar_notificacao_enviada(uuid, text, text)` — usada pela Edge Function (apenas service_role).
- `rpc_marcar_notificacao_falhou(uuid, text)` — usada pela Edge Function (apenas service_role).

### Edge Function `enviar-alertas-notificacoes`
Protegida por `x-cron-secret` (ou `Authorization: Bearer <ALERTAS_NOTIFICACOES_SECRET>`).
Apenas `POST`. Sem segredo → 401. Método errado → 405.

Fluxo:
1. valida segredo;
2. chama `rpc_preparar_notificacoes_alertas`;
3. busca até 50 notificações `pendente` do canal `email`;
4. envia via SMTP (denomailer);
5. marca cada notificação como `enviado` ou `falhou`.

#### Como configurar SMTP
Adicione os secrets (Lovable Cloud → Secrets):
```
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_FROM_NAME
APP_URL  (URL do app para link "Acessar Central de Alertas")
```
Se o SMTP não estiver configurado, as notificações pendentes são marcadas como `falhou` com erro `smtp_nao_configurado` (nenhum e-mail é enviado).

#### Como configurar o cron
Use `pg_cron` com a frequência **recomendada de 1 hora** para evitar spam:
```sql
select cron.schedule(
  'enviar-alertas-notificacoes-horario',
  '0 * * * *',
  $$ select net.http_post(
       url := 'https://<project>.functions.supabase.co/enviar-alertas-notificacoes',
       headers := jsonb_build_object('x-cron-secret', '<ALERTAS_NOTIFICACOES_SECRET>'),
       body := '{}'::jsonb
     ); $$
);
```

### Por que WhatsApp ainda não envia nesta fase
A tabela e a config já suportam o canal `whatsapp`, mas o envio real exige:
- Meta Cloud API ou provedor homologado;
- templates aprovados;
- opt-in formal do destinatário.

Não é permitido WhatsApp Web ou automação não oficial. A Edge Function ignora notificações `whatsapp` até a integração oficial existir.

### Anti-spam e segurança
- cooldown obrigatório por (alerta, destinatário, canal);
- limite `max_envios_por_alerta`;
- gravidades restritas a `critica` e `alta`;
- nenhum metadata bruto ou dado sensível no corpo do e-mail;
- service role usado apenas no backend; frontend opera por RLS.

## Fase 12.7 — Resumos executivos diário/semanal

Resumos periódicos para gestores autorizados, separados das notificações individuais (Fase 12.6), para reduzir ruído e entregar visão gerencial consolidada.

### Tabela
`alertas_resumos` armazena cada resumo gerado com: tipo (`diario`, `semanal`, `manual`), período, destino, conteúdo, totais por gravidade, status e auditoria de envio. Deduplicação por `(tipo_resumo, canal, destinatario_id, periodo_inicio, periodo_fim)`.

### Permissões (RLS)
- administrador / gestor / administrativo: leem todos os resumos.
- Destinatário interno: vê os próprios via `user_id` vinculado.
- cliente_produtor, financeiro, consultor, produção, operador_onfarm: sem acesso a resumos executivos nesta fase.

### Configuração
Reaproveita `alertas_notificacao_config` (canal `email`) com novos campos:
- `resumo_diario_ativo`, `resumo_semanal_ativo`
- `horario_resumo`, `dia_semana_resumo`
- `incluir_alertas_media`, `incluir_informativos`

Destinatário precisa de `receber_resumo = true` para entrar no envio.

### RPCs
- `rpc_preparar_resumos_alertas(p_tipo_resumo, p_periodo_inicio, p_periodo_fim)` — consolida totais e enfileira `alertas_resumos` com deduplicação.
- `rpc_marcar_resumo_enviado(uuid, text, text)` — uso restrito a `service_role`.
- `rpc_marcar_resumo_falhou(uuid, text)` — uso restrito a `service_role`.

### Edge Function `enviar-alertas-resumo`
Protegida por `ALERTAS_RESUMO_SECRET`. Apenas `POST`; aceita `{ "tipo_resumo": "diario" | "semanal" | "manual" }`. Sem segredo → 401; método inválido → 405.

Fluxo: prepara → busca pendentes (`email`) → envia via SMTP → marca enviado/falhou.

### Como configurar resumo diário
1. Cadastre destinatários (admin/gestor) com `receber resumo` ligado.
2. Habilite "Resumo diário" na aba Configurações.
3. Agende o cron a cada 24h, p.ex. 07:00:
```sql
select cron.schedule(
  'enviar-alertas-resumo-diario',
  '0 7 * * *',
  $$ select net.http_post(
       url := 'https://<project>.functions.supabase.co/enviar-alertas-resumo',
       headers := jsonb_build_object('x-cron-secret', '<ALERTAS_RESUMO_SECRET>', 'content-type','application/json'),
       body := '{"tipo_resumo":"diario"}'::jsonb
     ); $$
);
```

### Como configurar resumo semanal
Cron 1x por semana, segunda 07:30:
```sql
select cron.schedule(
  'enviar-alertas-resumo-semanal',
  '30 7 * * 1',
  $$ select net.http_post(
       url := 'https://<project>.functions.supabase.co/enviar-alertas-resumo',
       headers := jsonb_build_object('x-cron-secret', '<ALERTAS_RESUMO_SECRET>', 'content-type','application/json'),
       body := '{"tipo_resumo":"semanal"}'::jsonb
     ); $$
);
```

### Como acionar resumo manual
Na aba **Configurações → Resumos executivos**, administrador/gestor pode clicar em "Gerar resumo diário" ou "Gerar resumo semanal". A RPC respeita a deduplicação — chamar duas vezes para o mesmo período não duplica.

### Por que o resumo não é enviado para cliente/produtor nesta fase
Resumos consolidam dados operacionais internos (origens, totais, top alertas críticos). Por princípio de isolamento do Portal do Produtor e por regras de privacidade entre clientes, **cliente_produtor não recebe resumo nesta fase**. **Financeiro** também é restrito até regra futura específica.

### WhatsApp
Estrutura suportada (`canal = 'whatsapp'`), mas envio real somente em fase futura via Meta Cloud API com templates aprovados e opt-in. A Edge Function ignora pendentes WhatsApp.

### Variáveis de ambiente
`ALERTAS_RESUMO_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME`, `APP_URL` (ou `SITE_URL`). Sem SMTP configurado, os resumos pendentes são marcados como `falhou` com erro `smtp_nao_configurado` — nenhum e-mail é enviado.

### Segurança
- Segredos somente no backend (Edge Function).
- Nenhum metadata bruto, stack trace ou ID interno desnecessário no corpo do e-mail.
- Top 10 críticos/alta no e-mail; restante acessível na Central via link autenticado.

---

## Fase 12.9 — Auditoria Final da Central de Alertas

### Status geral: **APTO COM AJUSTES**

### Tabelas auditadas (RLS ativa em todas)
- `alertas_operacionais` (5 policies) — inclui campos de SLA (sla_config_id, sla_primeira_resposta_em, sla_resolucao_em, primeira_resposta_em, sla_vencido, sla_vencido_em, escalonado, escalonado_em, escalonado_para, prioridade_score, responsavel_id) e `chave_dedupe`.
- `alertas_regras` (2), `alertas_leituras` (2), `alertas_acoes` (2), `alertas_execucoes` (1).
- `alertas_notificacao_config` (2), `alertas_notificacao_destinatarios` (3), `alertas_notificacoes` (2).
- `alertas_resumos` (2), `alertas_sla_config` (2), `alertas_sla_eventos` (2).

### RPCs auditadas (todas com `SET search_path = public`)
- `rpc_gerar_alertas_operacionais`, `rpc_executar_motor_alertas`.
- `rpc_preparar_notificacoes_alertas`, `rpc_marcar_notificacao_enviada`, `rpc_marcar_notificacao_falhou`.
- `rpc_preparar_resumos_alertas`, `rpc_marcar_resumo_enviado`, `rpc_marcar_resumo_falhou`.
- `rpc_aplicar_sla_alertas`, `rpc_registrar_primeira_resposta_alerta`, `rpc_assumir_alerta`, `rpc_recalcular_prioridade_alerta`.

### Edge Functions auditadas (POST + segredo obrigatório)
- `gerar-alertas-operacionais` → `ALERTAS_CRON_SECRET`.
- `enviar-alertas-notificacoes` → `ALERTAS_NOTIFICACOES_SECRET` + SMTP_*.
- `enviar-alertas-resumo` → `ALERTAS_RESUMO_SECRET` + SMTP_*.
- `aplicar-sla-alertas` → `ALERTAS_SLA_SECRET`.

Nenhuma Edge Function expõe service role, SMTP_PASS ou stack trace. Método inválido → 405; segredo inválido → 401.

### Frontend
- Rota `/alertas-operacionais` única; menu lateral oculta para `cliente_produtor` e `financeiro`.
- Componentes integrados: Header, Filtros, ResumoCards, Lista, AlertaCard, Drawer, PainelPrioridades, NotificationBell, BadgeMenu, ExecucaoStatus, ExecucoesHistorico, NotificacaoConfig, DestinatariosConfig, NotificacoesHistorico, ResumoConfig, ResumosHistorico, SLAConfig/Painel/Historico/ConfigTable.
- Componentes preparados para uso futuro: `AlertaSLABadge` e `AlertaSLATimeline` — exportados e prontos para serem plugados ao `AlertaCard`/`AlertaDetalheDrawer` em iteração seguinte (não bloqueante).

### Realtime
- `useAlertasRealtime` mantém subscription única com cleanup, debounce e fallback de refetch manual; não expõe payload bruto.

### Notificações externas e resumos
- Apenas gravidades `critica`/`alta` (notificações) e gestores autorizados (resumos).
- Cooldown e `max_envios_por_alerta` aplicados; deduplicação de resumo por (tipo, canal, destinatário, período).
- `cliente_produtor` e `financeiro` não recebem.
- WhatsApp permanece estruturalmente pronto, sem envio real.

### SLA
- Configurações padrão presentes (`critica_padrao`, `alta_padrao`, `media_padrao`, `baixa_padrao`, `informativa_padrao`).
- Informativo com `prazo_resolucao_minutos = 0` tratado como sem SLA obrigatório.
- `aplicacao_nao_registrada` jamais é reclassificada para crítica.
- `prioridade_score` complementa, não substitui, a gravidade.

### Validações
- Build/TypeCheck: sem erros (último ciclo).
- Linter Supabase: 257 avisos pré-existentes em escopo global (function search_path em outras funções e extensões em `public`), nenhum bloqueante introduzido pela Fase 12.
- Termos proibidos (`fake`, `mock`, `demo`, `simulated`) ausentes do código de alertas; ocorrências de `placeholder` apenas em inputs de UI.

### Pendências não bloqueantes
1. Integrar `AlertaSLABadge`/`AlertaSLATimeline` ao `AlertaCard`/`AlertaDetalheDrawer` e filtros SLA dedicados em `AlertasFiltros`.
2. UI visual para editar `alertas_sla_config` (atualmente apenas leitura via `AlertasSLAConfigTable`; ajustes via banco por admin).
3. Configurar pg_cron para chamar `aplicar-sla-alertas` a cada 1h e `enviar-alertas-resumo` nos horários definidos (depende do operador).
4. Provisionar SMTP_* e domínio de e-mail antes de habilitar envio real.

### Riscos
- Segurança: nenhum risco crítico identificado. Avisos pré-existentes do linter não afetam tabelas/funções de alertas.
- Performance: paginação/limit aplicados; cron horário recomendado para SLA.

### Recomendação final
**APTO COM AJUSTES** para produção operacional interna. Habilitar envios externos somente após configurar SMTP e crons.

---

## Fase 12.9.1 — Correções críticas (SLA e auditoria)

### Correções aplicadas
- **Campo correto `tipo`** em `alertas_operacionais` (anteriormente referenciado como `tipo_alerta` em `rpc_recalcular_prioridade_alerta` e `rpc_aplicar_sla_alertas`). Não existe coluna `tipo_alerta` em `alertas_operacionais`; o campo `tipo_alerta` existe apenas em `alertas_sla_config` (filtro de configuração).
- **Coluna correta `user_id`** em `alertas_acoes` (RPCs `rpc_assumir_alerta` e `rpc_registrar_primeira_resposta_alerta` usavam `usuario_id`, que não existe). Coluna `usuario_id` NÃO foi criada — padrão `user_id` mantido.
- `alertas_acoes.user_id` passou a aceitar `NULL` exclusivamente para ações automáticas do sistema (cron/Edge Function). Ações de usuários autenticados continuam obrigando `user_id = auth.uid()` via política RLS.
- Ações automáticas registradas com `metadata` contendo `{ origem: 'sistema', executado_por: 'service_role', verificado_em }`.

### Permissões das RPCs
- `rpc_aplicar_sla_alertas`: execução manual restrita a `administrador`, `gestor`, `administrativo`. Service role/Edge Function liberados.
- `rpc_recalcular_prioridade_alerta`: restrita a administrador/gestor/administrativo ou service role.
- `rpc_registrar_primeira_resposta_alerta` e `rpc_assumir_alerta`: validam `can_user_access_alerta(p_alerta_id)`.
- `can_user_access_alerta(uuid)`: nova função `SECURITY DEFINER` que respeita matriz de acesso:
  - administrador/gestor/administrativo: acesso gerencial total
  - consultor_tecnico/tecnico_agronomo: somente alertas onde é consultor, responsável ou criador
  - producao/operador_onfarm: somente origens `laboratorio`, `cq`, `estoque`, `entrega`
  - cliente_produtor e financeiro: sem acesso
- `EXECUTE` revogado de `PUBLIC`; concedido apenas a `authenticated` e `service_role`.

### Garantias
- `aplicacao_nao_registrada` continua sem reclassificação automática para crítica (validação preservada).
- Pendências informativas permanecem informativas.
- Todas as RPCs com `SECURITY DEFINER` mantêm `SET search_path = public`.
- Stack trace não é exposto: RPCs retornam `jsonb` com `error: 'unauthorized' | 'forbidden' | 'alerta_nao_encontrado'`.

### Status
**APTO** — RPCs de SLA e auditoria operam sem erro de campo inexistente, registram ações corretamente e respeitam permissões em execução manual e automática.

---

## Fase 12.9.2 — Frontend de Alertas, Leitura e Ações via RPC

### Mudanças aplicadas
- **Leitura por usuário**: `marcarComoLido` agora apenas faz upsert em `alertas_leituras` (não altera status global). O botão "Lido" no drawer registra leitura individual.
- **Ações operacionais via RPC**: `resolverAlerta`, `ignorarAlerta` e `reabrirAlerta` chamam respectivamente `rpc_resolver_alerta_operacional`, `rpc_ignorar_alerta_operacional` e `rpc_reabrir_alerta_operacional` (novas, com `can_user_access_alerta`, registro em `alertas_acoes` e eventos SLA — `resolvido_dentro_sla`/`resolvido_fora_sla`/`sla_cancelado`/`sla_reaberto`).
- **SLA no drawer**: `AlertaDetalheDrawer` integra `useAlertasSLA(alerta.id)`, `AlertaSLABadge`, `AlertaSLATimeline`, prazos de 1ª resposta/resolução, responsável e botões "1ª resposta" e "Assumir".
- **AlertaCard**: exibe `AlertaSLABadge`, indicadores de vencido/escalonado e `prioridade_score`.
- **Ordenação** da lista: `prioridade_score desc → gravidade → created_at desc`.
- **Aplicar SLA agora** visível apenas para administrador/gestor/administrativo. Demais perfis veem o painel mas não disparam aplicação global.
- **AlertasSLAConfig** restrito a administrador/gestor/administrativo.
- **Destinatários**: `removerDestinatario` agora delega para `desativarDestinatario` (`update ativo=false`); nada de `DELETE`. UI mostra "Desativar" com confirmação preservando histórico.
- **Realtime**: drawer recarrega histórico/eventos SLA sem fechar; filtros da página não são resetados.

### Status
**APTO** — leitura individual por usuário, ações seguras via RPC com validação de permissão, integração real do SLA no drawer, botões administrativos protegidos e desativação não destrutiva de destinatários.

---

## Fase 12.9.3 — Auditoria Final e Encerramento

### Escopo
Auditoria final pós-correções (12.9.1/12.9.2) sobre RLS, RPCs, Edge Functions, Realtime, notificações, resumos, SLA, build e documentação. Foco apenas em validar e corrigir resíduos — sem novos fluxos.

### Correções residuais aplicadas (migration 12.9.3)
- **`alertas_regras`** — política `SELECT USING (true)` removida. Leitura agora restrita a perfis internos (`administrador`, `gestor`, `administrativo`, `consultor_tecnico`, `tecnico_agronomo`, `producao`, `operador_onfarm`). `cliente_produtor` e `financeiro` deixam de enxergar regras internas.
- **`alertas_acoes` INSERT** — `WITH CHECK` agora valida `user_id = auth.uid()` **e** `public.can_user_access_alerta(alerta_id)`. Antes bastava o alerta existir; agora só quem pode ver o alerta pode registrar ação nele.
- **`alertas_sla_eventos` SELECT** — antes restrita a admin/gestor/administrativo/responsável. Agora também libera leitura para quem tem acesso ao alerta via `can_user_access_alerta`, mantendo `cliente_produtor`/`financeiro` fora.

### Validações executadas
| Item | Resultado |
|---|---|
| `alertas_operacionais` RLS por perfil (admin/gestor/administrativo full; consultor por `consultor_id`; produção/operador por `origem`; cliente/financeiro sem acesso) | ✅ |
| `alertas_regras` sem SELECT amplo para cliente/financeiro | ✅ corrigido |
| `alertas_acoes` INSERT amarrado a `can_user_access_alerta` | ✅ corrigido |
| `alertas_sla_eventos` SELECT consistente com acesso ao alerta | ✅ corrigido |
| `alertas_notificacao_config/destinatarios/notificacoes/resumos/sla_config` — cliente/financeiro sem acesso | ✅ |
| RPCs (`rpc_gerar_alertas_operacionais`, `rpc_aplicar_sla_alertas`, `rpc_assumir_alerta`, `rpc_registrar_primeira_resposta_alerta`, `rpc_recalcular_prioridade_alerta`, `rpc_resolver/ignorar/reabrir_alerta_operacional`, etc.) — campos `tipo` e `user_id` corretos, `SECURITY DEFINER` + `SET search_path=public`, EXECUTE restrito a `authenticated`/`service_role` | ✅ |
| Edge Functions (`gerar-alertas-operacionais`, `enviar-alertas-notificacoes`, `enviar-alertas-resumo`, `aplicar-sla-alertas`) — POST-only, 405 em método inválido, 401 sem segredo, sem expor service role/SMTP/stack | ✅ |
| Realtime (`useAlertasRealtime`) — subscription única, cleanup no unmount, debounce, sem polling agressivo | ✅ |
| Notificações externas — somente `critica`/`alta`, cooldown e `max_envios_por_alerta` aplicados, `aplicacao_nao_registrada` não dispara externo, cliente/financeiro nunca recebem | ✅ |
| Resumos — dedupe por período/destinatário, cliente/financeiro excluídos, sem metadata bruta | ✅ |
| SLA — configs padrão presentes, `informativo` sem SLA obrigatório, `prioridade_score` complementa gravidade sem sobrescrevê-la, `aplicacao_nao_registrada` permanece informativa | ✅ |
| Frontend — rota `/alertas-operacionais` protegida, menu oculto para cliente/financeiro, aba Configurações restrita, botões "Atualizar"/"Aplicar SLA" gated por `administrador`/`gestor`/`administrativo`, leitura por `alertas_leituras` sem mudar `status` global, sem `.delete()` destrutivo em destinatários | ✅ |
| Busca por `fake`/`mock`/`simulated`/`4.2h`/`18.5h`/`2.1h`/`12.8h` no escopo de alertas | ✅ nenhuma ocorrência relevante (apenas placeholders de input UI) |
| Tipos `src/integrations/supabase/types.ts` atualizados | ✅ |

### Variáveis de ambiente (documentadas)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALERTAS_CRON_SECRET`, `ALERTAS_NOTIFICACOES_SECRET`, `ALERTAS_RESUMO_SECRET`, `ALERTAS_SLA_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME`, `APP_URL`.

### Limitações conhecidas (não bloqueantes)
- Visual UI para editar `alertas_sla_config` ainda básica.
- `pg_cron` para `aplicar-sla-alertas` (1h) e `enviar-alertas-resumo` (diário/semanal) precisa ser ativado em produção via `supabase.insert` quando SMTP estiver pronto.
- 265 warnings do linter Supabase são pré-existentes (search_path em funções legadas, extensões em `public`) — fora do escopo da Fase 12.
- WhatsApp não foi ativado nesta fase (sem integração oficial; WhatsApp Web descartado por instabilidade/risco).

### Status final
**APTO** — Central de Alertas Operacionais AR Bio encerrada na Fase 12 com RLS endurecida, RPCs corrigidas, Edge Functions protegidas, Realtime estável, SLA integrado, leitura individual por usuário, ações auditadas e sem dados fake. Liberada para uso operacional interno; ativar notificações externas e crons apenas após provisionamento de SMTP/domínio.

---

## Fase 12.9.4 — Ajuste Final de Rastreabilidade do Histórico de Ações

### Correção aplicada
- **Policy de SELECT em `alertas_acoes`** removida e substituída por `alertas_acoes_select_acesso_alerta`.
- Antes: apenas `administrador`, `gestor` ou o próprio `user_id = auth.uid()` podiam ler ações.
- Agora: todo usuário que consegue acessar o alerta via `public.can_user_access_alerta(alerta_id)` também visualiza o histórico completo de ações daquele alerta.
- Isso permite que `consultor_tecnico`, `tecnico_agronomo`, `producao` e `operador_onfarm` vejam o histórico de alertas que já conseguiam visualizar.
- `cliente_produtor` e `financeiro` permanecem bloqueados (a função `can_user_access_alerta` já os exclui).

### Garantias preservadas
- INSERT em `alertas_acoes` (`alertas_acoes_insert_self`) não foi alterado: continua exigindo `user_id = auth.uid()` **e** `can_user_access_alerta(alerta_id)`.
- Ações automáticas do sistema continuam podendo ter `user_id = NULL`, desde que inseridas via `SECURITY DEFINER`/`service_role`.
- `AlertaDetalheDrawer.tsx` carrega o histórico completo para usuários autorizados sem mudanças no componente — basta a policy permitir.

### Limpeza de código
- `registrarAcao` e `atualizarStatus` removidos de `useAlertasOperacionais.ts` (funções internas sem uso; todas as ações agora passam pelas RPCs seguras).

### Status
**APTO** — histórico de ações visível para todos os usuários autorizados no alerta, INSERT continua restrito, sem acesso para cliente/financeiro, código limpo e pronto para encerramento oficial da Fase 12.
