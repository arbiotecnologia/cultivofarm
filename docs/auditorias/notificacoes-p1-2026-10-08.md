# Notificações P1 — 2026-10-08

## 1. Decisão
PASS focal SQL/mocks; **NO-GO operacional/integral**. Não certifica cada usuário/portal. Nenhuma publicação frontend; D52 preservada. Produtores sem origem e filas contidos, não restaurados.

## 2. Destino e reserva anterior
Supabase canônico swzpzcwiasxmjutrmvkm confirmado. Batch concluído antes desta fase, migrations 035712/035740/035936/040053/040156 não repetidas. Motor/batch authenticated=true; reserva interna=false, sem regrant nesta fase.

## 3. Baseline
67 avisos operacionais; hash próprio 1dea25864d5e24f7464c83c02e7e4d39. Relato independente: eventos compartilhados entre organizações e origem NULL. Confirmados produtores globais e UPDATE de conteúdo. Destinatário não define origem histórica.

## 4. Migrations oficiais
Arquivos exatos em supabase/migrations/<version>_*.sql; ledger inspecionado.
- 20261008041123: RLS RESTRICTIVE origem/recipiente, portal individual, lido-only, filas externas/push contidos.
- 20261008041233: helper privado e wrapper INVOKER; novo finding removido.
- 20261008041316: operacional autoriza antes de replay; chave ator/tenant/origem/recipient; laboratório tenant; legados fechados.
- 20261008041641: regex PostgreSQL antiga {0,500} inválida corrigida, limite/URL interna preservados.
- 20261008041815: writers privilegiados sem origem fechados; novo outbox suprimido.
- 20261008042050: origem-cliente portal exatamente coerente; origem estoque fechada até prova de cadeia completa.
Primeira prova abortou na regex, não PASS. Primeira migration corretiva falhou e reverteu; retry oficial 041641 sucedeu. Nenhuma duplicação do estoque.

## 5. Fonte/tenant
Fonte real deriva empresa por cliente/OS/recurso coerente e organização ativa; h15/identidade ativa antes de leitura/replay. Sem fonte comprovada: invisível/negado, sem backfill. Estoque não habilitado só por lote. Portal exige cliente da origem exatamente igual ao notificado.

## 6. Destinatário/imutabilidade
RLS recipient=auth.uid, tenant ativo da origem, destinatário ativo; portal também papel cliente_produtor e vínculo canônico. GRANT UPDATE(lido) e trigger negam corpo, destino, origem, tipo, link e autoria. Trigger valida privilegiados. Insert sem origem RETURN NULL, preserva histórico e operação-pai; não equivale a sucesso de entrega.

## 7. Inventário SQL vivo
Consulta pg_proc por INSERT nas tabelas e _notify_role, com assinaturas/ACL/hash lidos:
- fn_notify_lab_on_programacao: fonte programacao_producao, destinatários ativos mesmo tenant; positivo trigger runtime UNVERIFIED.
- rpc_create_notificacao_operacional: positivo SQL A/B, guard antes replay, chave escopada/lock/conflito conteúdo.
- _notify_role: no-op; rpc_notificar_gestor: exceção origem; ambos cliente bloqueado.
- rpc_create_operational_notification_secure, rpc_dispatch_inapp_notification: privilegiados sem origem também fechados.
- rpc_create_portal_notification_secure (4/8 args), rpc_check_monitoramento_and_notify: cliente bloqueado.
- notify_consultor_atribuido_op; notify_consultor_on_confirmacao_produtor; notify_managers_on_simulation_sent; tg_notify_payment_terms_pending: inserts sem origem suprimidos.
- notify_solicitacao_atribuida; notify_visita_finalizada: portal sem recipient/origem suprimido.
- approve_b2b_payment_terms_secure; reject_b2b_payment_terms_secure; request_b2b_payment_terms_adjustment_secure; approve_partner_order; reject_partner_order; create_partner_order_secure; recalc_partner_order_production; request_partner_order_items; respond_b2b_order_quote_secure; set_partner_order_delivery_date: avisos sem origem suprimidos, contratos/ACL comerciais-pai não alterados nem exercidos.
- log_estoque_movimentacao: _notify_role legado inerte; estoque/ledger preservados.
- rpc_preparar_notificacoes_alertas/rpc_preparar_resumos_alertas: filas/resumos negados por triggers; preparação notificações cliente revogada.
- _comunicacao_expand_event e publicação comunicação: novo outbox suprimido, fluxo não homologado para retomada.
Inventário não é cobertura dinâmica integral dos motores-pai.

## 8. Callers/superfícies
VisitaTecnica usa operacional/portal; MobileAplicacoes e AplicacaoFormDialog usam portal; check-monitoramentos-vencidos chama send-push; Comunicação usa dispatch. Hooks useNotificacoesUnificadas/useNotificacoesOperacionais/usePortalCliente/useAlertasNotificacoes; CentralNotificacoes, NotificacoesPopover, MobileNotificacoes e PushSubscription auditados no recorte. Callers portal podem receber erro de contenção; visitas/aplicações-pai não certificadas. Rotas/guards não alterados.

## 9. Matriz
| Rota/componente | Guard/role/plano | Tenant/fonte/RLS/RPC | Edge/Storage | Estado |
|---|---|---|---|---|
| /notificacoes, Central/Popover | guards existentes; admin FSF/AR, planos não ampliados | próprio/replay/lido-only SQL PASS | n/a | browser UNVERIFIED |
| /app/notificacoes, Mobile | guards existentes/papéis reais; 4×14 planos UNVERIFIED | hook unificado escopado mocks PASS | n/a | browser mobile UNVERIFIED |
| Portal produtor/cliente ativo | cliente_produtor e vínculo canônico | origem-cliente-recipient, RLS contida; positivo individual UNVERIFIED | n/a | fanout BLOCKED |
| Portal B2B | roles/features/guards existentes | legados sem origem suprimidos | n/a | positivo B2B UNVERIFIED |
| Alertas config/dest/fila | cargo não autoriza | RESTRICTIVE false, queue trigger nega | Edge código fechado; Storage UNVERIFIED | sem envio |
| PushSubscription/Edge | ator ativo/h15 | próprio subscription, policy inspecionada | Edge remoto UNVERIFIED | positivo UNVERIFIED |
| Global SISTEMA | não há produtor seguro provado | falso global negado, tipo não autoriza | sem envio | legítimo UNVERIFIED |
Menu nunca autoriza; plano intersecta RBAC; RLS é adicional. Nenhum upload de Storage realizado.

## 10. Cache/Realtime
Chaves user/org/role/cliente; portal recipient individual. Perfil inativo/tenant ausente limpa lista e contadores. Seletor geração ignora resposta tardia, seleção storage user/tenant. Realtime useEffect + filtro recipient + cleanup removeChannel; troca A→B verificada em mocks, transporte/logout real UNVERIFIED. AuthProvider existente preservado.

## 11. Links/global
Allowlist existente lida, regressões executadas; admin wildcard não ampliado e destino continua protegido por guards. Regex antiga ARE {0,500} excedia limite PostgreSQL; correção valida caracteres/comprimento e rejeita host/traversal. Falso global negado inclusive privilegiado; não legitimado apenas por tipo sistema.

## 12. Envios/impacto
Edge enviar-alertas-notificacoes e send-push-notification devolvem 503 sem filas/SMTP/webpush/enumeração. Runtime remoto/deploy automático e flags hospedadas NÃO verificados: não afirmar PASS remoto. Banco bloqueia novas filas e suprime outbox inclusive service bypass; snapshot outbox=0. Nenhum envio realizado. Impacto: legados/portal/comunicação contidos deixam de entregar até contrato seguro; silêncio não é operacional PASS.

## 13. Provas
scripts/rbac-audit/notification-p1-proof.sql via ferramenta oficial: SET LOCAL ROLE/claims SQL, **não JWT API/login**. Exceção final NOTIFICATION_P1_ROLLBACK: ownA=1 ownB=1 cross=0 updateRead=1 crossUpdate=0 legacy=0 replay=1 chave independente=1; 11 negativas corpo/destino, crossrecipient/crosssource, source forjado, falso global, conflito replay, target/actor inativo, source-less manager, cross-replay. Lock/chave escopada não prova concorrência simultânea.
Segunda prova final após 042050: NOTIFICATION_FINAL_ROLLBACK, quatro negativas portal não produtor/global privilegiado/portal legado/fila; sourceLessCreated=0 portalVisible=0 externalVisible=0. Positivo portal não executado: único cliente_produtor ativo vivo sem organization; não atribuído tenant nem alterado usuário para inventar PASS.

## 14. Manifesto/hashes
Run TEMPORARY_AUDIT_NOTIF_6c24866a-ab37-4f88-a781-ed6586e1766c. Clientes 52d54831-dcb2-450b-9d80-d57a39e88f3a / da493628-5226-44f7-8d15-67de745cae18; fontes dfe089e6-ad0e-4b56-80b8-f638985da1ab / f8a9e431-f1bc-4575-ba05-5ad44e99a7d9; avisos 5482e0ec-188c-46a5-8f46-bc440abe3891 / 8123b4a7-b2f0-4b49-82c8-78ecdf8c956b. Cleanup posterior por IDs: 0/0/0, sem DELETE.
Prova final cliente 21fd2276-8d96-48a9-955e-c2cdcd8eb7a0, fonte 40f41d9c-4f12-4b82-9edd-cb788d352862; cleanup posterior pelos dois IDs confirmado **0/0**; hashes históricos iguais.
Hash md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) próprio preservado: avisos67/1dea25864d5e24f7464c83c02e7e4d39; estoque1/0c1a052173a564454cd51e69fcb72947; movimentos2/f8b6fcf6aa756d745eaf205f606f7795. Portal/alertas/outbox/push=0. Invisível não significa excluído.

## 15. Verificações
820/820 testes,46 arquivos Comunicação/estoque/entregas;11 novos mocks/estrutura. Lint alterados PASS sem erros/avisos; scanners segredos/fiscal e diff-check PASS. Build automático OK04:21:05 UTC. Typecheck manual separado NOT RUN(harness); sinais automáticos corrigidos para colunas geradas defasadas com .filter, sem editar types. Falha inicial stock-test incluía migrations posteriores: intervalo teste limitado ao batch, sem alterar ACL. Supabase linter438 preexistentes:17 RLS sem policy,2 DEFINER PUBLIC,418 authenticated,1 senha; não PASS global. Novo helper finding removido em041233.

## 16. Rollback/arquivos
Preservar RLS/recipient/lido-only/guards; NÃO restaurar broadcast/regex inválida. Defeito futuro RPC operacional: revogar somente EXECUTE authenticated, manter dados e contenção. Rollback estoque anterior revoga só motor/batch, não executado aqui. UI não pode voltar à consulta global mobile.
Código: src/hooks/useNotificacoesUnificadas.ts,useNotificacoesOperacionais.ts,usePortalCliente.ts;src/pages/app/MobileNotificacoes.tsx;dois Edge handlers. Teste src/test/comunicacao/notification-p1-scope.test.tsx e ajuste stock-batch-hardening.test.ts; seis migrations oficiais, provas, este relatório/matriz, relatório principal,roadmap,AGENTS escopados. Revisão final gerida plataforma, sem commit manual nem SHA antecipado.

## 17. Pendências
NO-GO: portal positivo individual e client-source forgery com produtores realmente vinculados; fanout/legados B2B/visita/aplicação/estoque; laboratório positivo; JWT/API/browser desktop/mobile, logout/cache/Realtime reais; concorrência replay; global privilegiado legítimo sem dados tenant; Edge remoto/flags e Storage. Bloqueadores nomeados, nada executa após turno. Não iniciar outro módulo/publicar.

### Evidência de fechamento
Revisão observada `a4d38cf54f3c5ef03bb068191b90e26a1a8ed60a` antes desta atualização documental; commit final gerenciado pela plataforma. Build automático OK04:24:02 UTC; reteste focal11/11 PASS. SHA256 prova A/B `4c3dfd2856742082e420fc561563558de7ee19ee570708af05b0afee3d3e4647`; prova final `b9a31b43b01d30cb4021a8c03b78d6b79e5524977ec5a23e8e5be3ec94f5c175`. Cleanup final0/0 e hashes reais novamente iguais.

### Revalidação da mensagem pendente — 04:26 UTC
Baseline observado `d95ea76a19bb31b3b3de217b2c9515d058e78fbb`, árvore limpa antes da atualização documental. Conexão oficial confirmou ambiente production/ref `swzpzcwiasxmjutrmvkm` antes de qualquer consulta/prova. As seis versões 041123/041233/041316/041641/041815/042050 foram confirmadas separadamente no ledger; policies vivas operacionais/portal RESTRICTIVE ALL com USING e WITH CHECK pelo helper privado, quatro contenções externas false e push ligado a identidade ativa. Não houve nova migration, regrant, alteração funcional ou repetição de estoque.

Reexecutados os dois scripts pela ferramenta oficial. A/B atingiu exclusivamente a exceção final `NOTIFICATION_P1_ROLLBACK`: ownA=1, ownB=1, cross=0, updateRead=1, crossUpdate=0, legacy=0, replay=1 e onze negativas. A asserção de chave independente foi ultrapassada antes da exceção final; o valor textual correspondente foi redigido pela ferramenta. Prova final atingiu `NOTIFICATION_FINAL_ROLLBACK`: quatro negativas, sourceLessCreated=0, portalVisible=0, externalVisible=0. O retorno de erro nestes dois casos é a exceção deliberada que reverte a transação, não uma falha intermediária ou sucesso persistente. Continua sendo SQL/role, não JWT/API/browser.

Manifesto novo: run `TEMPORARY_AUDIT_NOTIF_3618265c-8f51-4e4a-a365-d64a5c353f6e`; clientes `e8ed7b7c-8ceb-4465-b8c8-0025bf2639b4`, `79857a0b-0f16-4de2-96e8-15e4353bec4b`; fontes `dc5bb37d-13a6-4ee7-b623-b8a6fd434bb3`, `37f2e626-dc8d-481a-a747-5251f1065117`; avisos `39f52ce5-8005-42e0-bb9d-701485f56d00`, `a6272275-325d-49e7-b9e3-a2d96684a454`. Consulta posterior por esses IDs: **0/0/0**. Prova final: cliente `57e8ff8f-18f0-4a6c-a71f-95f735e569f6`, fonte `4fc59f05-8a99-42a8-b798-00605ec6ead2`, consulta posterior **0/0**. Nenhuma exclusão de cleanup necessária.

Leitura posterior confirmou avisos67/hash `1dea25864d5e24f7464c83c02e7e4d39`, estoque/hash `0c1a052173a564454cd51e69fcb72947`, movimentos/hash `f8b6fcf6aa756d745eaf205f606f7795`; contagens anteriores estoque1/movimentos2. Portal/alertas/outbox/push continuam zero. Regressões próprias Comunicação/estoque/entregas **820/820 em 46 arquivos**; lint focal dos cinco arquivos de UI/teste, scanners segredos/fiscal e diff-check PASS. Typecheck separado NOT RUN conforme restrição do harness; build automático verificado no fechamento. Relatório/roadmap são os únicos arquivos alterados nesta rodada. As pendências da seção17 e o **NO-GO operacional/integral** permanecem, sem envio externo/publicação ou próximo módulo.

### Achados adicionais e leitura mobile — 04:31 UTC
Baseline local observado `42a98709ad65508ea20ba06b383087058f1b227f`, não o HEAD de estoque informado. Evidência independente Codex relata aceitação de origem inexistente cross-tenant e edição de corpo; não foi fornecido o instante/corpo remoto usado na prova. No estado vivo atual as seis migrations de contenção já existem; não repetir DDL nem interpretar a evidência anterior como reprodução posterior à contenção.

Prova nova `scripts/rbac-audit/notification-p1-additional-proof.sql` com iat e SET LOCAL ROLE: RPC crossrecipient com origem aleatória inexistente e UPDATE título/mensagem/source_type+source_id/link foram negados por insufficient_privilege, inclusive antes de procurar linha para UPDATE. Cinco negativas alcançaram `NOTIFICATION_ADDITIONAL_ROLLBACK`, exceção final obrigatória. Target `bd330219-9493-45ff-a37e-440d2fd74644`, source `1b97b8c6-d8a7-4d0d-b28b-dbe891fb211f`; leitura posterior resíduos0, avisos67/hash `1dea25864d5e24f7464c83c02e7e4d39`, outbox0/push0. Esta prova adicional é negativa de privilégios, não positivo de alteração lido; positivo lido e fixtures próprias foram comprovados separadamente na prova A/B anterior. Nenhuma fixture persistente, usuário ou ACL alterado.

Lacuna local comprovada: MobileNotificacoes não oferecia ações de leitura e tratava erro como lista vazia. Corrigido somente mobile para usar `all`, a mesma coleção de `unreadCount` do hook unificado usado pelo sino; ações individual/todas com pending, falha visível e atualização/retry. RLS/guard/cache permanecem canônicos. CentralNotificacoesHeader também agrega alertas em aba distinta: seu badge total não é necessariamente contagem exclusiva de notificações; sem evidência autenticada não atribuir os seis do publicado a uma origem específica. Não afirmar que a discrepância publicada FSF foi reproduzida/resolvida no browser.

Arquivos desta rodada: MobileNotificacoes.tsx, teste novo notification-mobile-read.test.tsx (três cenários mockados), prova SQL adicional, AGENTS.md e este relatório/roadmap. **823/823 testes em47 arquivos PASS**, lint dos dois arquivos alterados PASS, scanners/diff-check PASS, build automático OK04:33:19Z. Typecheck separado NOT RUN (restrição do harness). Rollback UI somente das adições desta rodada, preservando consulta unificada escopada e contenções do banco; não restaurar consulta global nem reabrir escritores. Nenhuma migration/regrant/estoque/publicação/envio. NO-GO operacional/integral e pendências da seção17 permanecem.
