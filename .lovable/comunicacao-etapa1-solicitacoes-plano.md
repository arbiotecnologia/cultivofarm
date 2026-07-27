# Comunicação — Etapa 1 / Subfase 1A

**Escopo:** contrato definitivo de eventos de **Solicitações do Produtor** para integração ao módulo canônico de comunicação.
**Ambiente:** exclusivo `ar-bio-temp / ikaauvsflpmamgxmkhoq` (staging). Produção `navfzbwgwzruipouyfnk` proibida.
**Baseline:** commit `693a3e8ea28e98994955068787a0d709aa877c26`.
**Modo:** somente leitura — nenhuma migration, deploy, publicação, flag, credencial ou dado de negócio alterado nesta subfase.

Toda evidência abaixo foi obtida via `supabase--read_query` no schema live de staging e leitura de arquivos do repositório na baseline.

---

## 1. Inventário confirmado

### 1.1 `public.portal_solicitacoes`
- **Colunas relevantes** (`information_schema.columns`): `id uuid PK default gen_random_uuid`, `cliente_id uuid NOT NULL FK clientes(id) ON DELETE CASCADE`, `user_id uuid NOT NULL`, `fazenda_id uuid FK fazendas(id)`, `talhao_id uuid FK talhoes(id)`, `tipo_demanda text NOT NULL`, `descricao text`, `urgencia text NOT NULL default 'media'`, `status text NOT NULL default 'pendente'`, `numero_solicitacao text UNIQUE` (gerado por trigger `trg_gen_numero_solicitacao`), `consultor_atribuido uuid`, `origem_solicitacao text default 'portal_produtor'`, `data_prevista_atendimento timestamptz`, `created_by uuid`, `confirmacao_produtor text default 'pendente'`, `external_event_id text`, `registro_origem_id uuid FK registros_consultor(id)`, `created_at/updated_at timestamptz default now()`.
- **Constraints**: apenas PK, UNIQUE(numero_solicitacao) e FKs listadas. **Não existe** CHECK sobre `status`, `urgencia` ou `tipo_demanda`; nem enum dedicado. Todos os valores são livres na coluna `text`.
- **Índices** (`pg_indexes`): `idx_portal_solic_cliente_created(cliente_id, created_at DESC)`, `idx_portal_solic_consultor(consultor_atribuido, status)`, `idx_portal_solic_status_created(status, created_at DESC)`, `idx_portal_solicitacoes_data_prevista(data_prevista_atendimento)` e demais índices simples por FK.
- **RLS** (`pg_policies`): habilitado. Políticas ativas:
  - `INSERT`: `Portal users can insert own requests` (`cliente_id ∈ get_cliente_ids_for_user(auth.uid())`), `Staff can create requests` (administrador/gestor/consultor_tecnico/tecnico_agronomo).
  - `SELECT`: `Portal users can read own requests` (cliente do usuário), `Creators can view own requests` (`created_by = auth.uid() OR user_id = auth.uid()`), `Consultants can view their assigned requests` (`consultor_atribuido = auth.uid()` e role técnica), `Authenticated can read all requests` (gestor/administrador).
  - `UPDATE`: `Portal users can update own requests` (por cliente).
  - `ALL`: `Admins can manage all requests`.
- **Publicação Realtime**: `portal_solicitacoes` **NÃO** está em `supabase_realtime` — realtime já está apenas em `portal_notificacoes`, `notificacoes_operacionais`, `comunicacao_inapp_dispatch`.

### 1.2 `public.solicitacoes_atribuicoes`
- Trilha de atribuição a consultor. Índices: `idx_atribuicoes_solicitacao`, `idx_atribuicoes_consultor`. RLS: `auth_select_atribuicoes(true)`, `auth_insert_atribuicoes(auth.uid() IS NOT NULL)`, `auth_update_atribuicoes`, `admin_delete_atribuicoes`. Grants: authenticated + service_role.

### 1.3 `public.solicitacoes_timeline`
- Trilha textual de eventos por solicitação (`tipo_evento`, `descricao`, `usuario_id`, `created_at`). Índice `idx_solicitacoes_timeline_solicitacao(solicitacao_id, created_at DESC)`. RLS restringe por vínculo do usuário à solicitação. Populada hoje **apenas** pelo frontend (ex.: `SolicitacaoActions.cancelMutation` insere `tipo_evento='cancelada'`).

### 1.4 `public.portal_notificacoes` (legado in-app do produtor)
- Colunas: `cliente_id`, `titulo`, `mensagem`, `tipo`, `lido`, `idempotency_key` (unique parcial `ux_portal_notif_idempotency`), etc.
- RLS: INSERT/DELETE bloqueados no cliente (`with_check=false` / `qual=false`); apenas SECURITY DEFINER escreve. Portal lê por `cliente_id ∈ get_cliente_ids_for_user`. Já em `supabase_realtime`.

### 1.5 Tabelas canônicas de comunicação (Fases 1/2/4)
- `comunicacao_eventos`: `event_key text`, `source_type text`, `source_id uuid`, `payload jsonb NOT NULL default '{}'`, `idempotency_key text NOT NULL UNIQUE` (`ux_comunicacao_eventos_idem`), `status comunicacao_evento_status default 'received'`, contadores `outbox_enqueued/skipped`.
- `comunicacao_outbox`: chaves `event_id`, `rule_id`, `template_id`, `template_chave/versao/snapshot`, `canal`, `recipient_user_id`, `recipient_cliente_id`, `payload_snapshot jsonb`, `idempotency_key text UNIQUE`, campos de recibo WhatsApp (F4), lease, attempts. Índice worker parcial (`pending/processing`).
- `comunicacao_inapp_dispatch`: `outbox_id uuid PK`, `notification_id uuid NOT NULL`, `target_kind text NOT NULL`, `created_at`. Já publicada em realtime.
- `comunicacao_regras` / `comunicacao_templates` / `comunicacao_preferencias`: RLS admin/gestor (regras/templates) e por próprio usuário/cliente (preferências). Grants padrão authenticated + service_role.
- **Staging vazio hoje**: `SELECT ... FROM comunicacao_templates` e `comunicacao_regras` retornaram 0 linhas — nenhuma regra/template preexistente para solicitações.

### 1.6 Enums confirmados
- `comunicacao_canal = {email, whatsapp, in_app, push}`.
- `comunicacao_outbox_status = {pending, processing, sent, failed, cancelled, skipped, dead_letter}`.
- `comunicacao_evento_status = {received, processed, skipped}` (**não** contém `failed`; observação para 1B: `src/features/comunicacao/types.ts` declara `"failed"` — dívida de tipos sem impacto no runtime).
- `urgencia_consultor = {baixa, media, alta, critica}` — a coluna `portal_solicitacoes.urgencia` é `text`, não usa este enum.

---

## 2. Máquina de estados observada (nada inferido de dados)

Estados encontrados **em código/migrations reais** para `portal_solicitacoes.status`:

- `pendente` — default; usado por `trg_notify_solicitacao`.
- `atribuida` — `src/pages/Solicitacoes.tsx`, `AtribuicaoForm.tsx`, `PlanoMonitoramentoEditor.tsx` e `notify_solicitacao_atribuida`.
- `checkin_realizado` — `auto_advance_solicitacao_on_checkin` (trigger AFTER INSERT em `visitas_checkin`).
- `em_visita` — `auto_advance_solicitacao_on_registro` quando `hora_inicio` passa de NULL→valor em `registros_consultor`.
- `aguardando_recomendacao` — mencionado em guard de `auto_advance_solicitacao_on_checkin` (`status NOT IN (...,'aguardando_recomendacao')`). Nenhum caminho conhecido que grave este valor foi encontrado; **BLOQUEADOR menor**: confirmar em 1B se existe origem legada ou se é dead code.
- `aguardando_os` — `auto_advance_solicitacao_on_os` (trigger AFTER INSERT em `ordens_servico_onfarm` quando OS carrega `registro_consultor_id` vinculado a solicitação).
- `aguardando_decisao_produtor` — literal em `SolicitacaoActions.tsx` como pré-condição para "Gerar OS On-Farm". **Nenhum trigger/RPC grava este status** no schema atual; deve ser gravado externamente (frontend ou fluxo não localizado). Marcar como decisão pendente em 1B.
- `concluida` — `auto_advance_solicitacao_on_registro` quando `registros_consultor.status → convertido_os`; também usado como guard em vários triggers.
- `cancelada` — `SolicitacaoActions.cancelMutation` (`.update({status:'cancelada'})` + insere `solicitacoes_timeline`).

**Transições comprovadas** (arestas → destino, causa):

```text
INSERT           → pendente                 (default; trg_notify_solicitacao INSERT)
pendente|*       → atribuida                (Solicitacoes.tsx: aceitar/atribuir; AtribuicaoForm)
*                → checkin_realizado        (trg_auto_advance_solicitacao_checkin)
*                → em_visita                (trg_auto_advance_solicitacao_registro; hora_inicio set)
*                → aguardando_os            (trg_auto_advance_solicitacao_os; OS On-Farm criada)
*                → concluida                (trg_auto_advance_solicitacao_registro; registro→convertido_os)
* (menos concluida/cancelada) → cancelada  (SolicitacaoActions)
```

Guardas: nenhum dos `auto_advance_*` sobrescreve `concluida`/`cancelada`; `on_checkin` também ignora `aguardando_os`/`aguardando_recomendacao`.

---

## 3. Escritas reais em `portal_solicitacoes`

- **Frontend `INSERT`**: `src/pages/portal/PortalSolicitacao.tsx` (produtor via portal web), `src/pages/app/MobileSolicitar.tsx` (produtor mobile).
- **Frontend `UPDATE`**: `src/pages/Solicitacoes.tsx` (atribuir/aceitar → `atribuida`), `src/components/solicitacoes/SolicitacaoActions.tsx` (cancelar → `cancelada`), `src/components/solicitacoes/AtribuicaoForm.tsx`, `src/components/visita/PlanoMonitoramentoEditor.tsx`, `src/pages/FluxoTecnico.tsx`.
- **Sem RPC dedicada**: não existem RPCs `create/approve/reject/assign` para solicitações. Todas as escritas passam por RLS diretamente.
- **Triggers legados hoje ativos** (`pg_trigger` sobre `portal_solicitacoes`):
  - `trg_gen_numero_solicitacao` BEFORE INSERT.
  - `trg_notify_solicitacao` AFTER INSERT OR UPDATE → `notify_solicitacao_atribuida` — grava em `portal_notificacoes`.
  - `trg_notify_consultor_atribuido_op` AFTER INSERT OR UPDATE OF consultor_atribuido → `notify_consultor_atribuido_op` — grava em `notificacoes_operacionais`.
  - `trg_notify_consultor_confirmacao` AFTER UPDATE → `notify_consultor_on_confirmacao_produtor`.
  - `trigger_validate_retorno_tecnico` BEFORE INSERT OR UPDATE.
- **Triggers em tabelas correlatas que mexem em solicitação**: `trg_auto_advance_solicitacao_checkin` (`visitas_checkin` AFTER INSERT), `trg_auto_advance_solicitacao_registro` (`registros_consultor` AFTER UPDATE), `trg_auto_advance_solicitacao_os` (`ordens_servico_onfarm` AFTER INSERT).

### 3.1 O que o legado `notify_solicitacao_atribuida` faz hoje

Definição em pg_proc (evidenciada acima). Escreve `portal_notificacoes`:

- INSERT solicitação → `titulo='Solicitação recebida'`, `tipo='informativo'`.
- UPDATE com transição para `atribuida` **ou** primeira atribuição de consultor → `titulo='Sua solicitação foi atribuída'`.
- UPDATE para `checkin_realizado` → `titulo='Consultor chegou na sua área'`.

Riscos: **não usa `idempotency_key`** — reprocessamentos ou UPDATEs simultâneos podem duplicar; grava tanto por transição de status quanto por mudança de `consultor_atribuido`, o que pode disparar duas notificações contíguas.

---

## 4. Publisher canônico

Assinatura confirmada:

```text
public.rpc_publish_communication_event_v2(
  p_event_key text, p_source_type text, p_source_id uuid,
  p_payload jsonb, p_idempotency_key text
) RETURNS jsonb   SECURITY DEFINER   SET search_path=public
```

Grants: `EXECUTE` para `authenticated` e `service_role`; `anon` negado (`has_function_privilege` confirmado).

**Restrição crítica**: o corpo atual rejeita hard-coded qualquer `event_key` diferente de `produto_pronto_retirada | produto_pronto_aplicacao | administrative_important_update`. Também exige `payload` vazio para os dois primeiros e apenas `{target_role,titulo,mensagem}` para o terceiro. **Impossível publicar `solicitacao_*` pelo publisher atual** — este é o principal item de 1B.

Componentes internos existentes reutilizáveis:
- `_comunicacao_expand_event(event_id, event_key, source_type, source_id, payload)` seleciona regras `enabled=true` ordenadas por `prioridade`.
- `_comunicacao_resolve_recipients_v2(event_key, rule, source_type, source_id)` — hoje só resolve destinatários para `administrative_important_update` (por `perfil`/`broadcast_role`) e `produto_pronto_*` (produtor via `ordens_servico(_onfarm).cliente_id`). Precisará estender ramos para `solicitacao_*` (produtor + consultor atribuído + gestores).
- `_comunicacao_build_snapshot_v2` produz `payload_snapshot` para variáveis do template.
- `_comunicacao_can_deliver` gate por preferência/opt-out por canal.
- Idempotência de outbox: `sha256(event_id | rule_id | template_id | recipient_user_id | recipient_cliente_id)` — dedup natural por destinatário/canal/regra dentro do mesmo evento.

Nenhuma regra/template está cadastrada em staging: os dois SELECTs retornaram 0 linhas — logo, além de estender o publisher/resolver, 1C deverá criar templates e regras.

---

## 5. Roteamento / Deep links reais

Confirmado em `src/App.tsx` e `src/config/navigation.ts`:

- **Painel interno (admin/gestor/consultor)**: `/solicitacoes` (lista). **Não há** rota `/solicitacoes/:id` — o detalhe é renderizado como aba/modal na própria página. Deep link possível hoje: `/solicitacoes?focus=<id>` (proposto em 1E; hoje aceita `?urgencia=critica`, `VisaoGeral.tsx`).
- **Portal do Produtor (web)**: `/portal/solicitar` (criação). Listagem de solicitações do produtor no portal web **não foi localizada** como rota dedicada — decisão pendente para 1E.
- **Mobile Consultor**: `/app/solicitacoes` (lista) e `/app/checkin/:solicitacaoId` (check-in). Deep link viável: `/app/solicitacoes` (lista) e `/app/checkin/<id>` (para transição “atribuída → check-in”).
- **Mobile Produtor**: `/app/solicitar` (criação). Sem rota de detalhe.
- Não usar `/solicitacoes/{id}` — inexistente.

---

## 6. Diagrama textual — fluxo atual × futuro

```text
[Produtor cria] --INSERT--> portal_solicitacoes
    │                             │
    │                             ├── trg_gen_numero_solicitacao (numero)
    │                             ├── trg_notify_solicitacao ─► portal_notificacoes (LEGADO)
    │                             └── trg_notify_consultor_atribuido_op ─► notificacoes_operacionais
    │
[Admin/Gestor atribui] --UPDATE consultor_atribuido/status=atribuida-->
    └── mesmos triggers legados

[Consultor faz check-in] --INSERT visitas_checkin-->
    └── trg_auto_advance_solicitacao_checkin ─► status='checkin_realizado' ─► trg_notify_solicitacao

[Consultor inicia visita] --UPDATE registros_consultor.hora_inicio-->
    └── trg_auto_advance_solicitacao_registro ─► status='em_visita' (sem notificação hoje)

[Registro → convertido_os] ─► status='concluida'
[OS On-Farm criada] ─► status='aguardando_os'
[Admin cancela via UI] ─► status='cancelada' (+ solicitacoes_timeline)
```

**Futuro (Etapa 1 concluída):**

```text
Qualquer transição relevante em portal_solicitacoes
    └── trigger canônico `trg_comunicacao_solicitacao_*` (novo, 1B)
          └── _comunicacao_publish_system_event(event_key='solicitacao_<transição>',
                    source_type='portal_solicitacoes', source_id=NEW.id, payload={…mínimo…},
                    idem=sha256(id||transicao||NEW.status||OLD.status))
                └── comunicacao_eventos → _comunicacao_expand_event
                      └── comunicacao_regras (novas em 1C)
                            └── comunicacao_outbox (in_app hoje; email/wa test-mode)
                                  └── worker: in_app → portal_notificacoes / notificacoes_operacionais
                                              email/wa: adapters em TEST_MODE + allowlists (Etapa 2)

`trg_notify_solicitacao` legado desabilitado no mesmo migration transacional
que instala o trigger canônico (coexistência = OFF total; guard = existência do
trigger canônico + versão de configuração em `communication_provider_settings`).
```

---

## 7. Matriz definitiva (evento × transição × ator × destinatário × canal × obrig./opt-out × template × deep link × prioridade)

Convenção de `event_key`: `solicitacao_<transicao>` (namespace novo, exclusivo de `portal_solicitacoes`).
`source_type='portal_solicitacoes'`, `source_id=portal_solicitacoes.id`.
Prioridade: 1 (alta) > 3 (baixa).
Legenda: **existente legado (L)** = já notificado por `notify_solicitacao_atribuida`; **canônico novo (N)** = a ser criado em 1B/1C/1D/1E.

| Evento | Transição observada | Ator/gatilho | Destinatário | Canal | Obrig. / Opt-out | Template (chave, criar em 1C) | Deep link real | Prio | Classe |
|---|---|---|---|---|---|---|---|---|---|
| `solicitacao_criada` | INSERT | Produtor (portal/mobile) ou staff | Produtor (`cliente_id`) | in_app | obrigatório / opt-out permitido | `solicitacao_criada_produtor_v1` | `/portal/solicitar` (produtor); `/solicitacoes?focus=<id>` (interno) | 2 | substitui L |
| `solicitacao_criada` | INSERT | idem | Consultores por role (`consultor_tecnico`,`tecnico_agronomo`) do mesmo tenant/cliente | in_app | opt-out | `solicitacao_criada_consultor_v1` | `/solicitacoes?focus=<id>` | 2 | N |
| `solicitacao_criada` | INSERT | idem | Gestores/administradores | in_app | opt-out | `solicitacao_criada_gestor_v1` | `/solicitacoes?focus=<id>` | 3 | N |
| `solicitacao_atribuida` | UPDATE: `consultor_atribuido` NULL→X ou `status→atribuida` | staff | Produtor | in_app | obrig. / opt-out | `solicitacao_atribuida_produtor_v1` | `/portal/…` (lista futura) | 2 | substitui L |
| `solicitacao_atribuida` | idem | staff | Consultor atribuído (`consultor_atribuido`) | in_app | obrig. / opt-out | `solicitacao_atribuida_consultor_v1` | `/app/solicitacoes` | 1 | N |
| `solicitacao_checkin_realizado` | UPDATE: `status→checkin_realizado` (via `trg_auto_advance_solicitacao_checkin`) | trigger de `visitas_checkin` | Produtor | in_app | obrig. / opt-out | `solicitacao_checkin_produtor_v1` | `/portal/…` | 2 | substitui L |
| `solicitacao_em_visita` | UPDATE: `status→em_visita` | trigger de `registros_consultor` | Produtor | in_app | opt-out | `solicitacao_em_visita_produtor_v1` | `/portal/…` | 3 | N |
| `solicitacao_aguardando_os` | UPDATE: `status→aguardando_os` | trigger de `ordens_servico_onfarm` | Produtor + Gestor | in_app | opt-out | `solicitacao_aguardando_os_v1` | `/solicitacoes?focus=<id>` | 2 | N |
| `solicitacao_concluida` | UPDATE: `status→concluida` (registro→convertido_os) | trigger | Produtor + Consultor + Gestor | in_app | opt-out | `solicitacao_concluida_v1` | `/solicitacoes?focus=<id>` | 2 | N |
| `solicitacao_cancelada` | UPDATE: `status→cancelada` (`SolicitacaoActions`) | staff | Produtor + Consultor atribuído | in_app | obrig. / opt-out | `solicitacao_cancelada_v1` | `/solicitacoes?focus=<id>` | 2 | N |
| `solicitacao_aguardando_decisao_produtor` | UPDATE: `status→aguardando_decisao_produtor` | frontend (fonte não localizada) | Produtor | in_app | obrig. / opt-out | `solicitacao_decisao_produtor_v1` | `/portal/…` | 1 | **decisão pendente** — confirmar origem antes de 1D |
| `solicitacao_urgencia_critica` | INSERT/UPDATE com `urgencia='critica'` | qualquer | Gestor + Admin | in_app | opt-out | `solicitacao_urgencia_critica_v1` | `/solicitacoes?urgencia=critica&focus=<id>` | 1 | N (opcional; recomendo 1E se saldo permitir) |

**E-mail/WhatsApp**: mesmos eventos, mesmos templates com chaves paralelas `..._email_v1` e `..._wa_v1`, criados em 1C como `status='draft'`, `provider_template_status='draft'`. Nenhuma regra `enabled=true` fora de `in_app` na Etapa 1 — flags externas permanecem OFF e allowlists vazias até homologação de provedores (fora do escopo desta Etapa).

---

## 8. Estratégia de coexistência e anti-duplicidade

`portal_solicitacoes` **não possui campo utilizável como guard** (`source_type`/`origin_flag` inexistentes; `origem_solicitacao` refere-se ao canal do produtor, não à origem da notificação). Portanto, a coexistência é resolvida por **substituição transacional**:

1. Migration idempotente (1B) roda em única transação:
   - Cria trigger canônico `trg_comunicacao_solicitacao` (AFTER INSERT OR UPDATE em `portal_solicitacoes`).
   - `DROP TRIGGER IF EXISTS trg_notify_solicitacao ON public.portal_solicitacoes` no mesmo bloco.
   - Mantém `notify_solicitacao_atribuida()` no schema (rollback fácil), apenas desanexa o trigger.
2. Gates de reversibilidade: se `_comunicacao_publish_system_event` retornar erro interno, o trigger canônico **RAISE**s — cancelando a mudança de status. Contexto de negócio: como o legado grava em `portal_notificacoes` (não bloqueia OS/entrega), aceitamos que a *notificação* seja parte da transação de negócio da própria solicitação (que é o objeto notificado). Isso está alinhado ao padrão já usado por `_comunicacao_trg_os_pronto_retirada`.
3. `auto_advance_solicitacao_on_*` continua inalterado — mudanças de status por eles disparam automaticamente o trigger canônico.
4. Anti-dupla notificação: `idempotency_key` do evento derivado de `sha256(portal_solicitacoes.id || transicao || NEW.status || COALESCE(OLD.status,'')) `, garantindo que replays/dupla execução caiam em `ON CONFLICT DO NOTHING` no `comunicacao_eventos.idempotency_key`. Dentro do outbox, a idempotência por destinatário já existe (§4).
5. **Auditoria em 1G**: verificar que nenhuma linha nova entra em `portal_notificacoes` **fora** do path canônico (`comunicacao_inapp_dispatch → portal_notificacoes`); se houver, é vestígio do legado desanexado.

---

## 9. Política de falha do publisher no trigger

- **Proibido** `EXCEPTION WHEN OTHERS THEN NULL/CONTINUE` (violaria observabilidade).
- Tratar em três camadas:
  1. **Validação de payload** (assinatura) — se falhar, `RAISE EXCEPTION` normal: erro do desenvolvedor deve interromper a transação (fail-fast).
  2. **Falha de expansão/insert em outbox** — mesma política: `RAISE`. Como não há rede envolvida (adapters rodam depois no worker), qualquer falha aqui é lógica/DDL e deve reverter a mudança de status.
  3. **Falha externa** — impossível dentro do trigger (nenhum `pg_net`/`http` em `_comunicacao_expand_event`). Confirmado por leitura.
- Observabilidade: `_comunicacao_write_audit` já grava `event.publish.v2`; em 1B, o novo `_comunicacao_publish_system_event` acrescentará `entidade='portal_solicitacoes'`, `entity_id=NEW.id` e `after={ event_key, transicao }`.

---

## 10. Contrato mínimo de payload (sem PII excessiva)

Todos os `solicitacao_*` (menos `administrative_*`) usarão o mesmo shape estável:

```json
{
  "solicitacao_id": "<uuid>",
  "numero": "<numero_solicitacao|null>",
  "cliente_id": "<uuid>",
  "fazenda_id": "<uuid|null>",
  "tipo_demanda": "<text>",
  "urgencia": "<baixa|media|alta|critica>",
  "status_anterior": "<text|null>",
  "status_novo": "<text>",
  "consultor_atribuido": "<uuid|null>",
  "origem_solicitacao": "<text>",
  "ocorrido_em": "<timestamptz ISO>"
}
```

Explicitamente **fora** do payload: `descricao` livre do produtor, `solicitante_contato`, `audio_inicial_url`, `fotos_iniciais/_paths`, `external_event_id`, e qualquer dado do produtor além do `cliente_id`. Nome/telefone só entram no `payload_snapshot` construído por `_comunicacao_build_snapshot_v2` no momento da renderização, e apenas para o próprio destinatário — nunca cruzam tenants.

---

## 11. Fórmula de idempotência (compatível com schema atual)

- **Evento** (`comunicacao_eventos.idempotency_key`, UNIQUE):
  `sha256('solicitacao|' || portal_solicitacoes.id || '|' || transicao || '|' || COALESCE(OLD.status,'∅') || '→' || NEW.status || '|' || COALESCE(NEW.updated_at::text, now()::text))`
  Encoded em hex, prefixado por `solicitacao:` para facilitar troubleshooting (`length<=200` ok).
- **Outbox** (`comunicacao_outbox.idempotency_key`, UNIQUE): já calculado em `_comunicacao_expand_event` — sem alteração.
- Para transições disparadas pelos `auto_advance_*`, o `transicao` é derivado do `TG_OP` + `NEW.status` do trigger canônico em `portal_solicitacoes` (não dos triggers-origem), garantindo unicidade mesmo quando múltiplas cascatas ocorrem no mesmo comando.

---

## 12. RLS / Tenant isolation esperado

- **Publisher (`rpc_publish_communication_event_v2`)** hoje exige `administrador`. Para eventos de solicitação, a chamada será via **trigger** (SECURITY DEFINER), não via RPC pública, portanto não afeta RLS do front. Em 1B, o helper interno `_comunicacao_publish_system_event` é usado (não a RPC pública) — checagem de role deve ser bypassada por design (é evento de sistema originado por trigger).
- **Resolver de destinatários** deve garantir:
  - Produtor destinatário = **exatamente** o `cliente_id` da solicitação; nunca `get_cliente_ids_for_user` do publisher.
  - Consultor destinatário = `consultor_atribuido` **ou** consultores vinculados ao cliente via `partner_technician_clients`/`user_clientes` (a decidir em 1C conforme regra escolhida).
  - Gestor/admin destinatário = broadcast por role (`user_roles.role IN ('gestor','administrador')`), sem filtro por cliente (papel corporativo).
  - Parceiros B2B (`parceiro_b2b*`) **não** recebem por padrão nesta Etapa 1.
- **Realtime**: `portal_notificacoes`, `notificacoes_operacionais`, `comunicacao_inapp_dispatch` já em `supabase_realtime`. `portal_solicitacoes` **não precisa** entrar em realtime — o front escuta a notificação, não a linha da solicitação.

---

## 13. Classificação por subfase

- **Existente canônico (usa como está)**: `comunicacao_eventos`, `comunicacao_outbox`, `_comunicacao_expand_event`, `_comunicacao_build_snapshot_v2`, `_comunicacao_can_deliver`, publicação realtime das 3 tabelas in-app.
- **Existente legado (a desligar/substituir)**: trigger `trg_notify_solicitacao` (função `notify_solicitacao_atribuida`).
- **1B (banco/publisher)**: estender `_comunicacao_expand_event` p/ aceitar `solicitacao_*`; criar `_comunicacao_publish_system_event` de escopo interno (se ainda não existir com essa assinatura — confirmado que existe: `_event_key text, _source_type text, _source_id uuid, _payload jsonb, _idempotency_key text`); criar trigger canônico e desanexar legado; estender `_comunicacao_resolve_recipients_v2` com ramo `solicitacao_*`; migration inclui `REPLICA IDENTITY FULL` **apenas** se decidirmos publicar `portal_solicitacoes` em realtime (recomendação: **não**).
- **1C (templates/regras/preferências)**: criar templates in_app (10–13) + rascunhos email/wa (`draft`); criar `comunicacao_regras` `enabled=true` só para in_app; seed de preferências default por role.
- **1D (integração)**: nenhum RPC dedicado a criar — as escritas continuam via `.update`/`.insert` do front sob RLS; apenas o trigger canônico observa. Verificar em `FluxoTecnico.tsx`, `Solicitacoes.tsx`, `SolicitacaoActions.tsx`, `AtribuicaoForm.tsx`, `PlanoMonitoramentoEditor.tsx` que nenhuma escrita bypassa o padrão.
- **1E (frontend)**: consumo realtime já suportado; adicionar deep-link `?focus=<id>` em `/solicitacoes`; considerar tela de detalhe do produtor (decisão pendente, ver §14).
- **1F (testes)**: Vitest do harness estático + Playwright cross-role (usando `e2e/rbac-admin-vs-nao-admin.spec.ts` como base) — todos com `TEST_MODE_ENABLED=true` e allowlists vazias.
- **1G (auditoria/GO-NO-GO)**: relatório final.
- **Não aplicável nesta etapa**: entrega real por e-mail/WhatsApp, webhooks, adaptadores push.

---

## 14. Riscos, decisões pendentes que exigem o usuário e recomendações

- **DECISÃO PENDENTE 1** — Rota de listagem/detalhe de solicitações no **portal do produtor web**. Hoje só existe `/portal/solicitar` (criação). Sem uma rota destino, deep links do produtor caem na home. Recomendação: aprovar a criação em 1E de `/portal/solicitacoes` + `/portal/solicitacoes/:id`, ou definir que o CTA aponta para o app mobile (`/app/solicitacoes`).
- **DECISÃO PENDENTE 2** — Regra de destinatário “consultor”. Escolher entre (a) apenas `consultor_atribuido` (mais simples e sem vazamento) ou (b) também consultores vinculados ao cliente via `partner_technician_clients`/`user_clientes` (maior alcance, maior superfície de vazamento). Recomendação: **(a)** na Etapa 1; ampliar em iteração futura se o negócio pedir.
- **DECISÃO PENDENTE 3** — Status `aguardando_decisao_produtor` e `aguardando_recomendacao`: nenhum código-caminho localizado grava esses valores. Confirmar se são obsoletos ou se há fluxo legado. Se obsoletos, remover do plano; se ativos, identificar o gravador antes de criar regra/template.
- **BLOQUEADOR 1** — `rpc_publish_communication_event_v2` **rejeita** hoje qualquer `event_key` novo. Ampliar o publisher/expander em 1B é pré-requisito absoluto. Sem isso, nenhuma regra `solicitacao_*` funcionará.
- **BLOQUEADOR 2** — `_comunicacao_resolve_recipients_v2` só sabe resolver `administrative_important_update` e `produto_pronto_*`. Precisa ramo `solicitacao_*` em 1B.
- **RISCO** — Se optarmos por manter o legado ligado em paralelo, cliente vê duplicidade. Recomendação: **substituição transacional** (§8), sem coexistência longa.
- **RISCO** — `_comunicacao_write_audit` grava JSON no audit log; garantir que nenhum campo sensível de solicitação vá para lá (só usar campos do §10).
- **RISCO** — `src/features/comunicacao/types.ts` declara `ComunicacaoEventoStatus = "received"|"processed"|"skipped"|"failed"` mas o enum SQL não tem `failed`. Não bloqueante para 1A; anotar para regeneração de tipos em 1B.
- **RISCO** — `notify_consultor_atribuido_op` e `notify_consultor_on_confirmacao_produtor` continuam ativos e podem criar duplicidade in-app para consultor via `notificacoes_operacionais`. Decidir em 1B se também são desanexados/substituídos.

---

## 15. Gates GO / NO-GO para iniciar 1B

Todos obrigatórios; qualquer NO-GO reabre 1A.

1. Aprovação explícita das **3 decisões pendentes** do §14.
2. Confirmação de que produção `navfzbwgwzruipouyfnk` permanece off-limits em toda a Etapa.
3. Confirmação escrita de manter flags externas OFF e `COMMUNICATION_TEST_MODE_ENABLED=true` durante 1B–1F.
4. Aprovação do namespace `solicitacao_*` e das 8–11 chaves de evento propostas.
5. Aprovação da estratégia de substituição transacional do trigger legado (§8) — sem coexistência longa.
6. Aprovação da política fail-fast do trigger canônico (§9): notificação faz parte da transação de negócio da solicitação.
7. Aprovação da não-inclusão de `portal_solicitacoes` em `supabase_realtime` (front escuta `portal_notificacoes` / `comunicacao_inapp_dispatch`).

---

## 16. Orçamento revisado

- Autorizado Etapa 1: **100 créditos**. Consumido em 1A: **≈7 créditos** (leituras SQL + 1 arquivo).
- Saldo: **≈93 créditos**. Contingência mínima 20% (`≈20`) preservada.
- Sugestão de repartição das subfases restantes:
  - **1B** (migration publisher/expander/trigger canônico + drop legado, testes SQL locais): **≤22**.
  - **1C** (templates + regras + seeds + Vitest de existência): **≤14**.
  - **1D** (garantir que escritas do front continuam corretas; sem novas RPCs; testes de mutação sem-op): **≤6**.
  - **1E** (deep link `?focus=`, consumo realtime unificado, tela produtor conforme decisão 1): **≤14**.
  - **1F** (harness RLS + Vitest + Playwright cross-role em test mode): **≤12**.
  - **1G** (relatório final, checklist GO/NO-GO, decisão de deploy): **≤5**.
  - **Reserva/contingência**: **≥20**.

---

## 17. Auditoria da própria 1A — inconsistências no plano preliminar

- **Corrigido**: plano preliminar sugeria deep link `/solicitacoes/{id}` — inexistente; substituído por `/solicitacoes?focus=<id>` e `/app/solicitacoes` / `/app/checkin/:id`.
- **Corrigido**: plano preliminar assumia CHECK/enum em `status`. Não há: coluna é `text` livre; controle é feito por triggers/código. Impacto: idempotência precisa incluir explicitamente `OLD.status→NEW.status`.
- **Corrigido**: plano preliminar sugeria coexistência controlada por “flag/coluna origem”. Confirmei que **nenhum campo existente serve como guard**; a estratégia definitiva é substituição transacional (§8).
- **Adicionado**: BLOQUEADOR de publisher (`event_key` fechado) — não estava explícito no preliminar.
- **Adicionado**: BLOQUEADOR de `_comunicacao_resolve_recipients_v2` — não estava explícito.
- **Adicionado**: DECISÃO PENDENTE sobre `aguardando_decisao_produtor` (status usado no front sem gravador conhecido).
- **Adicionado**: risco de duplicidade também por `notify_consultor_atribuido_op` e `notify_consultor_on_confirmacao_produtor` (não só por `trg_notify_solicitacao`).
- **Adicionado**: dívida de tipos `ComunicacaoEventoStatus.failed` em `src/features/comunicacao/types.ts`.

---

## 18. Registro de execução desta subfase

- **Nenhuma** migration foi criada.
- **Nenhuma** alteração de banco, permissão, flag, secret ou dado ocorreu.
- **Nenhum** deploy, publicação ou envio de mensagem ocorreu.
- Apenas leituras `information_schema` / `pg_catalog` em staging `ikaauvsflpmamgxmkhoq` e leitura de arquivos do repositório (baseline `693a3e8ea28e98994955068787a0d709aa877c26`).
- Único artefato criado: este documento `.lovable/comunicacao-etapa1-solicitacoes-plano.md`.

Aguardando aprovação das decisões pendentes (§14) e dos gates (§15) para iniciar 1B.

---

## 19. Encerramento 1B (após correção pós-auditoria) — 2026-07-27

**Resultado:** GO para 1C. **Ambiente:** staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` não tocada. Flags OFF, zero envio.

**Custo real 1B (corrigido pela contabilidade da plataforma):** 12,1 (execução inicial) + 9,0 (correção pós-auditoria) = **21,1 créditos** (teto 22). Acumulado Etapa 1 até 1B: planejamento 2 + 1A 7,9 + 1B 21,1 = **31 créditos**. Saldo antes da 1C: 100 − 31 = **69 créditos**.

**Migrations aplicadas na 1B (nenhuma editada retroativamente):**
1. 1B inicial (publisher/resolver `solicitacao_*`, trigger canônico, drop legado, função legada preservada).
2. Hotfix D1 (`search_path=public,extensions` + `extensions.digest`).
3. Hotfix D2 (payload alinhado ao contrato §10: `status_novo`, `status_anterior`, `numero_solicitacao`, `origem_solicitacao`, `ocorrido_em`, `transicao`).
4. **Hardening pós-auditoria:** primeira atribuição por `consultor_atribuido` NULL→X com dedup joint; anti-spoof do publisher (source_id existente + cliente_id/consultor_atribuido coerentes + `solicitacao_id`=`source_id`); resolver `by_role` fail-closed (só `administrador`); `REVOKE ALL` explícito de `PUBLIC`/`anon`/`authenticated`.

**Testes:** harness com 22 asserts (`restoration/comunicacao-etapa1-1b/harness.sql`) — todos PASS, sentinela `HARNESS_1B_HARDENING_OK_ROLLBACK_SENTINEL`, zero resíduo confirmado por consulta independente pós-rollback.

**Grants efetivos (confirmados):** PUBLIC/anon/authenticated = false; service_role = true (herança de owner, necessário para o trigger). `SECURITY DEFINER` + `search_path` fixo nas três funções.

**Decisões pendentes de 1A ainda em aberto** (serão tratadas em 1C conforme escopo):
- Definição do vínculo tenant seguro para `by_role` de gestor/consultor/parceiro.
- Status `aguardando_decisao_produtor` (§14 do plano).
- Criação de `comunicacao_templates` e `comunicacao_regras` para `solicitacao_*`.

**Relatórios:**
- Executivo: `.lovable/comunicacao-etapa1-solicitacoes-1b-report.md`.
- Técnico: `restoration/comunicacao-etapa1-1b/report.md`.

Aguardo autorização explícita para iniciar 1C.

---

## 20. Encerramento 1C — 2026-07-27 (após auditoria final corretiva)

**Resultado:** GO para 1D. **Ambiente:** staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` intocada. Flags OFF, zero envio, 11 regras `solicitacao_*` persistem `enabled=false`.

**Ledger real corrigido pela contabilidade da plataforma:**
- Planejamento: 2,0
- 1A: 7,9
- 1B (execução + hardening): 21,1
- 1C inicial: 12,1
- Hardening 1C anterior: 15,5
- 1C rodada de correção final anterior (retorno real da plataforma): 18,6
- **Acumulado 1A→1C correção final anterior: 77,2 créditos**
- Saldo antes desta microcorreção: 100 − 77,2 = **22,8 créditos**
- Custo desta microcorreção (ajuste final mínimo 1C): **pendente do retorno da plataforma** (não estimado)

**Entregas da rodada de correção final:**
1. Migration nova idempotente: 11 regras `solicitacao_*` migradas de `template_versao=1` para `template_versao=2` (chave/canal preservados).
2. Harness funcional expandido para 22 asserts com preflight dinâmico de UUIDs (sem hardcoded IDs), executado com sentinela-rollback e todos PASS.
3. Teste TypeScript novo (`src/test/comunicacao/etapa1-1c-solic-templates.test.ts`) — 131/131 casos PASS cobrindo renderização e rejeição de placeholders proibidos nos 26 templates `solic_*`.
4. Consulta READ-ONLY independente pós-rollback confirmando zero resíduo.
5. Verificação de flags de entrega: todas OFF, `test_mode_enabled=true`, allowlists vazias.
6. Relatório final: `.lovable/comunicacao-etapa1-solicitacoes-1c-final-audit.md`.

**Decisões de 1A ainda pendentes** (agora para 1D/1E):
- Definição do vínculo tenant seguro para `by_role` de gestor/consultor/parceiro (Etapa 1E).
- Status `aguardando_decisao_produtor` (§14).
- Habilitação controlada das regras `solicitacao_*` fora do canal `in_app` (email/wa) — depende de homologação de provedores.

