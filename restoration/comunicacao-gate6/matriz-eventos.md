# Matriz canônica de eventos — Módulo de Comunicação AR Bio
Versão: 1.0.0 · Data: 2026-07-28 · Ambiente: staging `ikaauvsflpmamgxmkhoq`.

Regras permanentes ficam `enabled=false` até homologação externa. Deep links são validados por `src/lib/notificacoes/deepLinkAllowlist.ts`.

## Legenda de canais
`ep` = email · `wa` = whatsapp · `ia` = in-app · `push` = web push (não usado nesta fase).

## Legenda de destinatários
`adm` = administrador · `ges` = gestor · `tec` = tecnico_agronomo / consultor_tecnico · `pro` = producao/operador_onfarm · `fin` = financeiro · `com` = gestor_comercial · `pdt` = cliente_produtor · `par` = parceiro_b2b(_tecnico).

## Solicitações do produtor (Etapa 1)
| event_key | origem | destino | canal | template chave | severidade | deep link | preferência (enabled) |
|---|---|---|---|---|---|---|---|
| `solicitacao.created` | `portal_solicitacoes` | pdt (autor) + tec (assigned) | ep/wa/ia | `solicitacao.created.{canal}` | media | `/solicitacoes?focus={id}` (interno) / `/portal/solicitacoes/{id}` (produtor) | false |
| `solicitacao.assigned` | trigger `_comunicacao_trg_portal_solicitacao` | tec | ep/wa/ia | `solicitacao.assigned.{canal}` | media | `/solicitacoes?focus={id}` | false |
| `solicitacao.status_changed` | trigger | pdt + tec | ep/ia | `solicitacao.status_changed.{canal}` | media | `/portal/solicitacoes/{id}` | false |
| `solicitacao.checkin` | `auto_advance_solicitacao_on_checkin` | pdt + tec | ia | `solicitacao.checkin.ia` | baixa | `/app/checkin/{id}` | false |
| `solicitacao.registro_criado` | `auto_advance_solicitacao_on_registro` | pdt | ep/ia | `solicitacao.registro_criado.{canal}` | media | `/portal/registros/{id}` | false |
| `solicitacao.encerrada` | trigger | pdt + tec | ep/ia | `solicitacao.encerrada.{canal}` | baixa | `/portal/solicitacoes/{id}` | false |

## Ordens de serviço / produção / produto pronto
| event_key | origem | destino | canal | template chave | severidade | deep link | preferência |
|---|---|---|---|---|---|---|---|
| `os.criada` | `ordens_servico` insert | com/pro | ia | `os.criada.ia` | media | `/ordens-servico/{id}` | false |
| `os.pronto_entrega` | `_comunicacao_trg_os_pronto_retirada` | pdt + com + adm | ep/wa/ia | `os.pronto_entrega.{canal}` | alta | `/portal/entregas` (pdt) / `/ordens-servico/{id}` | false |
| `os_onfarm.pronto_entrega` | `_comunicacao_trg_os_onfarm_pronto_retirada` | pdt + com + adm | ep/wa/ia | `os_onfarm.pronto_entrega.{canal}` | alta | `/ordens-servico/{id}` | false |
| `producao.programada` | `_sync_planning_from_os` | pro/adm | ia | `producao.programada.ia` | media | `/ordens-servico` | false |
| `produto_etiqueta.emitida` | `produto_etiquetas` insert | pro/adm | ia | `produto_etiqueta.emitida.ia` | baixa | `/estoque` | false |
| `os.status_changed` | trigger | com/pro/adm | ia | `os.status_changed.ia` | media | `/ordens-servico/{id}` | false |

## Estoque
| event_key | origem | destino | canal | template chave | severidade | deep link | preferência |
|---|---|---|---|---|---|---|---|
| `estoque.baixo` | `alertas_operacionais` | pro/adm | ep/ia | `estoque.baixo.{canal}` | alta | `/estoque` | false |
| `estoque.embalagem.reserva` | `estoque_embalagem_movimentacoes` | pro | ia | `estoque.reserva.ia` | baixa | `/estoque/embalagens` | false |
| `lote.aprovado` | `lotes` update | pro/adm | ia | `lote.aprovado.ia` | media | `/lotes` | false |

## Financeiro / faturas
| event_key | origem | destino | canal | template chave | severidade | deep link | preferência |
|---|---|---|---|---|---|---|---|
| `financeiro.fatura_emitida` | `fiscal_invoices` update `status=autorizado` | fin/adm + pdt | ep/ia | `financeiro.fatura_emitida.{canal}` | alta | `/financeiro` (interno) / `/portal/financeiro` (pdt) | false |
| `financeiro.receivable_vencendo` | job `alertas_financeiro_vencimentos` | fin/adm | ep/ia | `financeiro.receivable_vencendo.{canal}` | alta | `/financeiro` | false |
| `financeiro.payable_vencendo` | job | fin/adm | ep/ia | `financeiro.payable_vencendo.{canal}` | alta | `/financeiro` | false |
| `financeiro.baixa_confirmada` | `financial_receipts` insert | fin/adm | ia | `financeiro.baixa_confirmada.ia` | media | `/financeiro` | false |

## Agenda / visitas
| event_key | origem | destino | canal | template chave | severidade | deep link | preferência |
|---|---|---|---|---|---|---|---|
| `visita.programada` | `technical_visit_assignments` | tec + pdt | ep/ia | `visita.programada.{canal}` | media | `/agenda/consultor` (tec) / `/portal/agenda` (pdt) | false |
| `visita.checkin` | `visitas_checkin` insert | tec + adm | ia | `visita.checkin.ia` | baixa | `/fluxo-tecnico` | false |
| `visita.concluida` | `visitas_campo` update | tec + adm + pdt | ep/ia | `visita.concluida.{canal}` | media | `/fluxo-tecnico` | false |
| `visita.reagendada` | update | tec + pdt | ep/ia | `visita.reagendada.{canal}` | media | `/agenda/consultor` | false |

## Administração (por perfil)
| event_key | origem | destino | canal | template chave | severidade | deep link | preferência |
|---|---|---|---|---|---|---|---|
| `admin.role_alterada` | `user_roles` insert/delete | adm + alvo | ia | `admin.role_alterada.ia` | alta | `/perfil` | forced-on (crítico) |
| `admin.senha_alterada` | `audit_senha_log` | adm + alvo | ia | `admin.senha_alterada.ia` | alta | `/perfil` | forced-on |
| `admin.provider_settings_changed` | `rpc_service_apply_provider_settings` | adm | ia | `admin.provider_settings_changed.ia` | alta | `/comunicacao` | forced-on |
| `admin.dlq_replay` | `rpc_admin_replay_communication_dead_letter*` | adm | ia | `admin.dlq_replay.ia` | media | `/comunicacao` | false |

> "forced-on" indica que eventos administrativos críticos ignoram `enabled=false` da preferência do usuário — enforçado no publisher `_comunicacao_publish_system_event` para o subset explicitamente listado.

## Validação
- Cada deep link marcado como interno DEVE começar com um prefixo autorizado em `deepLinkAllowlist.ts` para o perfil correspondente.
- Deep links do portal DEVEM começar com `/portal` ou `/app` para `cliente_produtor`.
- Nenhum canal externo real será exercido enquanto:
  - `COMMUNICATION_DELIVERY_ENABLED=false`
  - `EMAIL_DELIVERY_ENABLED=false`
  - `WHATSAPP_DELIVERY_ENABLED=false`
  - `COMMUNICATION_INAPP_ADAPTER_ENABLED=false`
  - `WHATSAPP_WEBHOOK_ENABLED=false`
- Regras `enabled=false` no banco reforçam a segunda linha de defesa.
