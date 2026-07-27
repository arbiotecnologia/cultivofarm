# Etapa 1 — Notificações de Solicitações do Produtor (PLANO)

Ambiente único de execução: **staging `ar-bio-temp` / `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` proibida. Baseline `67b9cf7…`. Custo desta rodada de planejamento: **~9 créditos** (leituras read-only, sem escrita).

## Inventário confirmado no banco

- Tabela `public.portal_solicitacoes` (26 colunas). Coluna `status` é **`text`** (não enum). Coluna `tipo_demanda` é `text`. Zero linhas em staging.
- Tabelas relacionadas: `public.solicitacoes_atribuicoes` (enum `status_atribuicao`), `public.solicitacoes_timeline` (metadata jsonb), `public.portal_notificacoes` (legado), `public.comunicacao_inapp_dispatch` (canônico in-app).
- Trigger legado ativo: `trg_notify_solicitacao` em `portal_solicitacoes` → `public.notify_solicitacao_atribuida()` insere direto em `portal_notificacoes` em `INSERT`, transição `atribuida` e `checkin_realizado`. **Este é o legado a extinguir/coexistir.**
- Triggers de avanço automático: `auto_advance_solicitacao_on_checkin` (visitas_checkin), `_on_registro` (registros_consultor), `_on_os` (ordens_servico_onfarm). Estas alteram `portal_solicitacoes.status` — devem continuar a disparar o novo publisher indiretamente pelo trigger de status.
- Sem RPCs específicas de aprovar/rejeitar/cancelar solicitação — mutações são via `.update()`/`.insert()` direto da UI (`PortalSolicitacao.tsx`, `MobileSolicitar.tsx`, `MobileSolicitacoes.tsx`) sob RLS. Papéis afetados hoje: `administrador`, `cliente_produtor` (criador), `consultor_tecnico`/`tecnico_agronomo` (via `consultor_atribuido` e `solicitacoes_atribuicoes`).
- Publisher canônico disponível: `public.rpc_publish_communication_event_v2(text,text,uuid,jsonb,text)`. `comunicacao_templates` e `comunicacao_regras` estão vazios em staging.
- Realtime canônico já certificado sobre `comunicacao_inapp_dispatch` + `portal_notificacoes` + `notificacoes_operacionais` (relatório e2e).

## Contrato de eventos proposto (a criar)

| event_key                          | Transição / gatilho                                                     | Ator                    | Destinatários (perfil)                                                   | Canais (fase inicial)      | Template chave                | Deep link                                | Prioridade | Obrigatório? |
|-----------------------------------|-------------------------------------------------------------------------|-------------------------|--------------------------------------------------------------------------|-----------------------------|-------------------------------|------------------------------------------|-----------|--------------|
| `solicitacao_criada`              | `INSERT` em `portal_solicitacoes`                                       | cliente_produtor / staff | produtor criador (source_participants), gestores do cliente             | in_app (obrig.) + email opt | `solicitacao_criada_v1`       | `/solicitacoes/{id}` / mobile equivalente| normal    | in_app sim   |
| `solicitacao_atribuida`           | `UPDATE` com `consultor_atribuido` NULL→UUID **ou** `status='atribuida'`| administrador           | produtor, consultor atribuído                                            | in_app + email              | `solicitacao_atribuida_v1`    | idem                                     | alta      | sim          |
| `solicitacao_aprovada`            | `UPDATE` com `status`→`aprovada`                                        | administrador           | produtor, consultor atribuído                                            | in_app + email              | `solicitacao_aprovada_v1`     | idem                                     | alta      | sim          |
| `solicitacao_rejeitada`           | `UPDATE` com `status`→`rejeitada`                                       | administrador           | produtor                                                                 | in_app + email              | `solicitacao_rejeitada_v1`    | idem                                     | alta      | sim          |
| `solicitacao_cancelada`           | `UPDATE` com `status`→`cancelada`                                       | produtor ou admin       | produtor, consultor atribuído (se houver)                                | in_app                      | `solicitacao_cancelada_v1`    | idem                                     | normal    | opcional     |
| `solicitacao_checkin_realizado`   | `UPDATE` com `status`→`checkin_realizado` (via trigger avanço)          | consultor               | produtor                                                                 | in_app + whatsapp (test)    | `solicitacao_checkin_v1`      | idem                                     | alta      | sim          |
| `solicitacao_atualizada`          | `UPDATE` de outros campos relevantes (data_prevista_atendimento, urgência) | admin                | produtor                                                                 | in_app                      | `solicitacao_atualizada_v1`   | idem                                     | normal    | opt-out      |

Confirmação do conjunto final de valores de `status` a suportar fica na Subfase 1A (consulta ao code path + `information_schema` sem inventar valores). Coluna é `text` livre; a matriz será revisada com a lista real observada nas migrations do fluxo do produtor.

## Subfases (fail-fast, pequenas e auditáveis)

### 1A — Inventário e contrato de eventos (teto 8 créditos)
- Escopo: mapear em código e migrations todos os valores de `status` realmente utilizados no fluxo produtor (`rg` em `src/`, `supabase/migrations/`); confirmar deep links reais por perfil (rotas `/solicitacoes*`, `PortalSolicitacao.tsx`, `MobileSolicitacoes.tsx`); listar RLS efetivas; congelar matriz evento×ator×destinatário×canal×template×deep link.
- Alterações: **nenhuma**. Entrega: matriz final versionada dentro do relatório.
- Aceite: matriz aprovada por revisão humana; nenhum valor inventado.
- Riscos: interpretar `status` inexistentes. Controle: só listar os observados em código/migrations.
- Testes: n/a. Rollback: n/a.

### 1B — Banco: publisher, trigger canônico e coexistência legado (teto 18 créditos)
- Escopo: migração aditiva/idempotente em staging criando:
  - função `public.trg_publish_solicitacao_events()` (SECURITY DEFINER, `search_path=public`) que detecta `TG_OP` + diff de `status`/`consultor_atribuido` e chama `rpc_publish_communication_event_v2` com `p_event_key` da matriz, `p_source_type='portal_solicitacoes'`, `p_source_id=NEW.id`, `p_payload` mínimo (`numero_solicitacao`, `tipo_demanda`, `urgencia`, `cliente_id`, `consultor_atribuido`, `fazenda_id`) e `p_idempotency_key = sha1(id||transição||versão_template)`.
  - trigger `trg_solicitacao_publish_comm` `AFTER INSERT OR UPDATE` em `public.portal_solicitacoes`, executando na **mesma transação** do UPDATE (`EXCEPTION WHEN OTHERS THEN` engolindo apenas erros de publisher para não quebrar o negócio, logando via `RAISE WARNING` — critério: falha no canônico não bloqueia mudança de status, mas gera row em `comunicacao_audit_log`).
  - Estratégia contra dupla notificação: manter `trg_notify_solicitacao` **temporariamente** e adicionar guard no legado: só insere em `portal_notificacoes` se `NEW.source_type IS DISTINCT FROM 'canonical'`. Flag de kill switch `SET LOCAL app.legacy_solicitacao_notifier = 'off'` opcional. Depreciação do legado marcada para Subfase 1G.
- Alterações prováveis: nova migration em `supabase/migrations/`; nada em produção.
- Aceite: `INSERT`/`UPDATE` simulado em transação de teste dispara `comunicacao_outbox` com `event_key` correto e **não** duplica `portal_notificacoes`.
- Testes: harness transacional (BEGIN/RAISE sentinel/ROLLBACK) validando (a) row em outbox, (b) idempotency, (c) ausência de duplicação legado.
- Rollback: `DROP TRIGGER trg_solicitacao_publish_comm; DROP FUNCTION trg_publish_solicitacao_events();` + restaurar legado sem guard.
- Riscos: ordem de execução com `auto_advance_solicitacao_*` (STATEMENT vs ROW). Controle: definir trigger como `AFTER … FOR EACH ROW` com nome que garanta ordem alfabética após avanço.

### 1C — Templates, regras e preferências (teto 14 créditos)
- Escopo: seeds idempotentes em `comunicacao_templates` (7 chaves acima, canal `in_app` + `email`; `whatsapp` só para `checkin`) status `draft`; regras em `comunicacao_regras` por `perfil` (`cliente_produtor`, `consultor_tecnico`, `tecnico_agronomo`, `administrador`) com estratégia `source_participants` para produtor/consultor e `by_role` para gestores restritos ao mesmo `cliente_id`; `enabled=false` até certificação.
- Preferências: nenhuma alteração; consumo do resolver existente (`_comunicacao_can_deliver`) respeitando `opt_out` do produtor por canal.
- Aceite: `comunicacao_templates` e `comunicacao_regras` populados; publisher não gera outbox enquanto regras `enabled=false` (dry-run).
- Testes: contract test sobre variáveis do template (allowlist) e sobre restrição `broadcast_role` proibida para eventos de OS/solicitação.
- Rollback: `DELETE` idempotente por `chave`/`event_key` recém-inseridos.
- Riscos: PII em payload. Controle: template usa apenas `numero_solicitacao`, `tipo_demanda`, `urgencia`, primeiro nome quando disponível.

### 1D — Integração nos RPCs/UI de transição (teto 10 créditos)
- Escopo: como as mutações hoje são via `supabase.from('portal_solicitacoes').update()`, **não** criar novos RPCs nesta etapa; a integração acontece no trigger 1B. Ajustar apenas chamadas do front que precisem enviar `updated_at`/campos necessários para o diff (nenhum breaking change).
- Aceite: cada transição da UI (`PortalSolicitacao.tsx`, `MobileSolicitacoes.tsx`, aprovação/rejeição administrativa se existir) resulta em outbox correto.
- Testes: unit tests de payload snapshot.
- Rollback: reverter ajustes de UI (mínimos).
- Riscos: transições feitas por triggers de avanço podem duplicar eventos → chave de idempotência inclui `NEW.status||OLD.status` para deduplicar.

### 1E — Frontend in-app / realtime / deep links (teto 12 créditos)
- Escopo: garantir que `MobileNotificacoes.tsx` e o consumidor do portal produtor leem também `comunicacao_inapp_dispatch` (já subscrito no realtime canônico), com fallback ao `portal_notificacoes` durante coexistência; badge de não-lido; navegação via deep link (`link`) validando rota por perfil (guardas existentes em `AppPortalGuard`).
- Aceite: notificação chega ≤ 3s após transição em staging (test_mode), abre página correta por perfil.
- Testes: Playwright cobrindo produtor recebendo `solicitacao_atribuida` e consultor recebendo `solicitacao_criada` (quando aplicável).
- Rollback: feature flag frontend `VITE_COMUNICACAO_SOLICITACOES_ENABLED` desliga leitura do canônico.
- Riscos: navegação para rota sem permissão; controle via allowlist de rotas por perfil já existente.

### 1F — Testes transacionais, RLS, E2E e certificação (teto 12 créditos)
- Escopo: harness `restoration/comunicacao-fase2/harness-solicitacoes.sql` cobrindo matriz completa com `RAISE SENTINEL/ROLLBACK`; smoke E2E Playwright; suite Vitest `src/test/comunicacao/`; `tsgo`, `bun run build`.
- Aceite: 100% verde; zero linha residual em `comunicacao_outbox`/`portal_notificacoes` após rollback; auditoria RLS confirma que produtor A não vê evento de produtor B; parceiro B2B e outros tenants sem acesso a eventos de solicitação.
- Rollback: script `rollback-solicitacoes-staging.sh` com detecção fail-closed de qualquer artefato criado.

### 1G — Auditoria final e decisão GO/NO-GO (teto 8 créditos)
- Escopo: relatório `.lovable/comunicacao-etapa1-solicitacoes-report.md`; decisão sobre desativar `trg_notify_solicitacao` (kill switch) após janela de observação; validar flags OFF em produção; publicar checklist de promoção para produção (fora desta etapa).
- Contingência: **~18 créditos** reservados para correções.

## Gates obrigatórios antes de qualquer execução (Subfase 1B em diante)

- `COMMUNICATION_DELIVERY_ENABLED=false`, `EMAIL_DELIVERY_ENABLED=false`, `WHATSAPP_DELIVERY_ENABLED=false`, `WHATSAPP_WEBHOOK_ENABLED=false`, `COMMUNICATION_INAPP_ADAPTER_ENABLED=false`, `COMMUNICATION_TEST_MODE_ENABLED=true`, allowlists vazias.
- Rede desligada nos primeiros testes (dry-run).
- Migrations idempotentes/aditivas exclusivamente em `ikaauvsflpmamgxmkhoq`; nenhuma DDL em produção.
- Publicação de evento **na mesma transação** da mudança de status; falha no publisher NÃO reverte o UPDATE (captura de erro isolada em `EXCEPTION` com WARNING) para não quebrar negócio.
- Idempotência por `solicitacao_id + transição + destinatário + canal` (chave determinística passada em `p_idempotency_key`).
- RLS: destinatários resolvidos apenas via `source_participants`/`by_role` com `cliente_id` como âncora; nada de `broadcast_role`.
- Payload mínimo, sem CPF/telefone completos.
- Deep links restritos ao conjunto atual de rotas por perfil.
- Suíte `src/test/comunicacao` 100%, `tsgo`, `bun run build`, smokes com rollback e zero resíduo.

## Divisão de créditos (teto 100)

| Fase | Teto | Observação |
|------|------|------------|
| 1A   | 8    | Só leitura/documentação |
| 1B   | 18   | Migration + trigger + guard legado |
| 1C   | 14   | Seeds templates/regras |
| 1D   | 10   | Ajustes mínimos de UI |
| 1E   | 12   | Realtime/deep links |
| 1F   | 12   | Testes/E2E/certificação |
| 1G   | 8    | Relatório + decisão |
| Contingência | 18 | Correções/auditoria final |
| **Total** | **100** | |

## Dependências e ordem fail-fast

`1A → 1B → 1C → 1D → 1E → 1F → 1G`. Cada subfase só avança após aceite verde. Kill switch legado é acionado apenas após 1F verde.

## Observações finais

- Não posso criar `.lovable/comunicacao-etapa1-solicitacoes-plano.md` em plan mode (contaria como edição). Este plano é o entregável desta rodada; o arquivo será materializado na Subfase 1A da execução.
- Custo desta rodada de planejamento: **~9 créditos** (dentro do teto de 12).
