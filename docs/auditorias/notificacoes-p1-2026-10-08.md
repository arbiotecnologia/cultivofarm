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
- fn_notify_lab_on_programacao: fonte programacao_producao, destinatários ativos mesmo tenant; positivo SQL pelo fluxo OS→programação automática VERIFIED por evidência independente Codex no fechamento 04:37; não JWT/browser.
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
| Alertas config/dest/fila | cargo não autoriza | RESTRICTIVE false, queue trigger nega | Bloqueador Edge v60 implantado VERIFIED documental; HTTP anônimo503; Storage UNVERIFIED | contido, sem envio; não operacional PASS |
| PushSubscription/Edge | ator ativo/h15 | próprio subscription, policy inspecionada | Bloqueador Edge v60 implantado VERIFIED documental; HTTP anônimo401; autenticado503 não exercitado | entrega positiva UNVERIFIED |
| Global SISTEMA | não há produtor seguro provado | falso global negado, tipo não autoriza | sem envio | legítimo UNVERIFIED |
Menu nunca autoriza; plano intersecta RBAC; RLS é adicional. Nenhum upload de Storage realizado.

## 10. Cache/Realtime
Chaves user/org/role/cliente; portal recipient individual. Perfil inativo/tenant ausente limpa lista e contadores. Seletor geração ignora resposta tardia, seleção storage user/tenant. Realtime useEffect + filtro recipient + cleanup removeChannel; troca A→B verificada em mocks, transporte/logout real UNVERIFIED. AuthProvider existente preservado.

## 11. Links/global
Allowlist existente lida, regressões executadas; admin wildcard não ampliado e destino continua protegido por guards. Regex antiga ARE {0,500} excedia limite PostgreSQL; correção valida caracteres/comprimento e rejeita host/traversal. Falso global negado inclusive privilegiado; não legitimado apenas por tipo sistema.

## 12. Envios/impacto
Edge enviar-alertas-notificacoes e send-push-notification bloqueiam transporte sem filas/SMTP/webpush/enumeração. Atualização independente Codex 04:37: ambos implantados oficialmente no canônico swzpzcwiasxmjutrmvkm, versão60 ACTIVE; pacotes relidos idênticos ao código revisado, sem transporte. Deployment remoto **VERIFIED documental**, não releitura própria nesta rodada nem serviços operacionais PASS. verify_jwt=false preexistente preservado nos dois handlers; autenticação do push preservada. HTTP POST{} sem credenciais/destinatário: email503 `NOTIF_EXTERNAL_DELIVERY_DISABLED`, push401 `Não autenticado`; push autenticado503 não exercitado por HTTP. Flags hospedadas não certificadas separadamente. Banco bloqueia novas filas e suprime outbox inclusive service bypass; snapshot anterior outbox=0. Nenhuma mensagem enviada. Impacto: legados/portal/comunicação contidos deixam de entregar até contrato seguro; silêncio não é operacional PASS.

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
**NO-GO integral**: portal real sem organização/vínculo comprovado e client-source forgery com produtores realmente vinculados; fanout/legados B2B/visita/aplicação/estoque; concorrência, JWT/API/browser desktop/mobile, logout/cache/Realtime reais; global privilegiado legítimo sem dados tenant; Storage e flags hospedadas não certificadas separadamente. Laboratório positivo SQL e deployment dos dois bloqueadores foram comprovados documentalmente pelo Codex, não são mais pendências dessas categorias; entrega externa operacional permanece contida/não homologada, push autenticado503 HTTP não exercitado. Validação local final mobile pendente. UX a revisar futuramente: cartão **Permitir Notificações** ainda convida ativação de push mesmo com entrega contida; não alterar agora. Nada executa após turno; não iniciar complemento, outro módulo ou publicação.

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

### Fechamento exclusivamente documental — evidências independentes Codex, 04:37 UTC
Alterações funcionais concluídas e revisadas no HEAD `e2a8d80e`, conforme informado pelo usuário. Esta atualização modifica somente roadmap.md e este relatório; não executa retestes, SQL, Auth, migrations, ACL, código, AGENTS ou publicação. Mensagens antigas não autorizam duplicar trabalho concluído. Evidências abaixo fornecidas pelo proprietário e atribuídas ao Codex; não são execução/releitura própria desta rodada.

**Prova SQL independente FSF/ARBio:** próprio_read2/mark2/create2/replay1; mesma chave em tenants diferentes isolada; cross_read0/cross_mark0/inativo0; nove negativas, encerramento obrigatório `NOTIF_CODEX_FINAL_ROLLBACK`. **Laboratório:** fluxo OS→programação automática produziu aviso próprio FSF1, destinatários externos0 e leitura ARBio0; encerramento `NOTIF_LAB_CODEX_ROLLBACK`. Rollback integral, fixturecleanup0, 67 avisos históricos/hash `1dea25864d5e24f7464c83c02e7e4d39` preservados; nada persistido. Positivos SQL/role, não JWT/API/browser nem concorrência simultânea. IDs/manifestos adicionais não fornecidos nesta mensagem, não inventados.

**Deployment/HTTP:** dois handlers v60 ACTIVE no canônico, pacotes idênticos ao revisado e bloqueios HTTP anônimos conforme seção12. VERIFIED documental de implantação/negação, não certificação de transporte ou serviço operacional. Nenhum envio externo.

**Publicado pelo usuário:** build `build-muyzpwrm`; MeuPlanoFSF e rótulo de administrador corrigidos, sino6→0 após RLS. Novos hooks/mobile não publicados. Relato do publicado não substitui browser autenticado próprio nem demonstra funcionamento das novas ações mobile; nenhuma publicação realizada neste fechamento.

**Validações separadas por ambiente e revisão:** Windows815/818, três falhas ambientais identificadas — dois filtros de caminho backslash em fase02-static e um bit executável POSIX em fase3-deploy-kit — sem marcar suíte global PASS ou omitir falhas. Testes novos finais14/14 PASS. Lint focal/typecheck/build anteriores ao último ajuste mobile PASS segundo Codex; fechamento mobile final ainda em validação local. Linux remoto823/823 pertence à execução anterior independente; não somar com Windows nem extrapolar para validação final mobile. Registros históricos anteriores de typecheck NOT RUN referem-se ao harness daquela execução, não contradizem a prova local Codex. Nenhuma verificação repetida nesta rodada.

**Decisão final:** NO-GO integral mantido com pendências exatas da seção17; canais externos contidos, dados/históricos preservados. Rollback continua mantendo RLS/origem/destinatário/lido-only e bloqueios de transporte; nenhuma alteração de rollback ou ACL executada. Fechamento documental concluído, sem nova fase/complemento.

### NOTIF-2 — frontend sessão/push — 2026-10-08 12:19 UTC
**Baseline próprio confirmado:** `fb9c2dcce2f3d35a04f3a983e60ba3a3a4315b2a`. Uma única execução local, sem subagentes, SQL, Auth remoto, migration, ACL, alteração de conta/papel/tenant, envio ou publicação. Contenção banco/Edges v60 permanece intocada; evidências anteriores e D52 preservadas. SHA final é gerenciado pela plataforma, não foi criado commit manual nem antecipado SHA.

**Achados/correções:** hook push registrava worker no mount e solicitava permissão antes de configuração/identidade; as duas telas convidavam ativação com entrega contida. Agora `deliveryAvailable=false` explícito, sem caminho de habilitação por env: subscribe apenas informa indisponibilidade, nunca solicita permissão/registra worker/cria inscrição/escreve servidor ou anuncia ativação. Montagem só inspeciona inscrição do worker ativo `/push-sw.js` da mesma origem para permitir desativação local. Resultado de inspeção cercado por cancelamento/scope user+tenant; perfil ativo correspondente e Auth resolvido exigidos. Logout/troca esconde estado imediatamente. Desativação chama somente unsubscribe do navegador; não apaga push_subscriptions de propriedade não provada nem unregister de worker push/outro. Inscrições antigas no servidor não são apagadas nesta fase; entrega segue bloqueada. Não há atribuição presumida de organização/vínculo a Produtor1/Parceiro1.

**Worker:** novo arquivo suprime push sem parse/showNotification/fallback texto; cliques fecham aviso sem navegação enquanto bloqueado. Validação adicional aceita só URL relativa interna em prefixos app/notificacoes/portal/portal-parceiro, mesma origem, sem host externo/backslash/traversal (incluindo casos codificados testados). Não altera instalação/ativação/cache/claim de worker, não atualiza automaticamente workers antigos; avisos previamente exibidos por versões antigas não são retirados automaticamente. Proteção local nova não certifica o estado de navegador compartilhado já instalado, permanece limite browser.

**Sessão/cache:** três hooks antes ignoravam auth loading e correspondência profile.user_id; cache existente podia ser exposto com identidade ainda não resolvida/incompatível. Agora leituras/contadores/mutations operacionais exigem Auth resolvido, perfil ativo correspondente ao usuário, organização e papéis; chaves operacionais incluem papéis. Portal exige papel cliente_produtor, esconde imediatamente seleção em estados inválidos/role revogado e cerca respostas tardias/seleção armazenada pelo scope. Nenhum guard/role/plano ampliado, RLS continua autoridade. Testes usam QueryClient/QueryClientProvider reais (sem mock React Query ou hooks de portal), somente fronteiras Auth/servidor simuladas; cobrem A→B, mesmo UID/tenant diferente, logout/inativo/loading/perfil incompatível/papel removido, resposta antiga após nova, portal cached após revogação e removeChannel. Selector portal existente continua state/promise, não foi migrado artificialmente para React Query. Não representa teste de RLS/JWT/API nem transporte Realtime.

**Arquivos:** `src/hooks/usePushSubscription.ts`, `useNotificacoesUnificadas.ts`, `useNotificacoesOperacionais.ts`, `usePortalCliente.ts`, `src/hooks/AGENTS.md`; `src/pages/app/MobileNotificacoes.tsx`, `MobilePerfil.tsx`; `public/push-sw.js`; novos `src/test/comunicacao/notification-session-real.test.tsx` e `notification-push-contained.test.tsx`; ajustes de fixtures/contrato em `notification-p1-scope.test.tsx` e `notification-mobile-read.test.tsx`; roadmap e este relatório. Testes anteriores preservados, sem alterar banco/Edges.

**Verificações próprias Linux:** comando `bun run test -- src/test/comunicacao src/test/config/authProviderCallback.test.tsx src/test/config/authProviderTopology.test.ts src/test/multiportal.featureGuards.test.tsx src/test/multiportal.hardening.test.ts src/test/multiportal.guards.test.tsx src/test/multiportal.foundation.test.ts src/test/mobilePerfil.hardening.test.tsx`: **674/674 em34 arquivos PASS**. Dentro desse total, sessão real22/22, push/worker13/13, mobile4/4, P1scope11/11 (não somar separadamente). Lint de11 arquivos alterados PASS sem saída, scanners fiscal-secrets/fiscal-integration PASS, diff-check PASS; build automático observado OK12:21:58Z após alterações funcionais finais. Avisos React Router v7 preexistentes nos testes, não falhas. Typecheck explícito NOT RUN: execução manual de typechecks/builds vedada pelo harness, não alegar PASS separado. Windows não executado; 815/818 anterior e suas três falhas ambientais continuam evidência independente histórica, não mascaradas nem somadas.

**Matriz focal atualizada:** hook/UI push contenção PASS comportamental local; worker supressão/URL PASS em execução JavaScript real via VM, não browser instalado; cache/sessão/late promises/cleanup PASS com React Query real e servidor/auth mockados. APIJWT/browser/Realtime real/concorrência/Storage/portal com vínculos reais UNVERIFIED. Nenhum novo transporte ou canal global implementado. **PASS focal / NO-GO integral**, sem publicação/envios e sem retomada de produtores sem prova.

**Rollback seguro:** preservar indisponibilidade explícita, supressão de worker e exigências de sessão; não restaurar convite/registro automático/fallback texto/URL arbitrária nem remover bloqueios banco/Edges. Defeito futuro UI pode retirar só interface de desativação local mantendo ativação negada; rollback de hooks deve reter identidade/tenant/papel/fencing. Não excluir dados/subscrições de terceiros nem unregister de outro worker. Nenhum rollback executado. NOTIF-2 concluída localmente; nenhuma fase seguinte iniciada.

### NOTIF-3 — contenção P1 Comunicação global — 2026-10-08

**Escopo/decisão:** baseline próprio `a7add64e197cd58939ed49f570f78a8ddcc3a0df`; preservar NOTIF-2, estoque, D52 e todos os bloqueios externos. **PASS focal contenção SQL e handlers locais / NO-GO operacional/integral**. Evidência independente inicial Codex: FSF leu audit/event criados temporariamente com actor/created_by ARBio e health global; rollback `COMMUNICATION_GLOBAL_READ_ROLLBACK`. Identidade de autoria não foi convertida em empresa. Não houve consulta de secrets, envio, alteração de contas/consentimento real, publicação frontend, regrant ou edição AGENTS.

**Migration EXATA aplicada oficialmente:** `supabase/migrations/20261008123024_f0f1b7ab-f7e0-44e8-bcdd-dac1d00d4ba8.sql`, ledger `20261008123024`/nome `f0f1b7ab-f7e0-44e8-bcdd-dac1d00d4ba8` confirmado. Arquivo gerado pela ferramenta oficial, nenhuma cópia/edição manual/reaplicação. Nenhuma tabela criada e nenhum GRANT adicionado.

Policy `notif3_global_client_containment`: **11** tabelas, RESTRICTIVE ALL para anon/authenticated, USING(false)/WITH CHECK(false), confirmado vivo. Tabelas: `comunicacao_eventos`, `comunicacao_outbox`, `comunicacao_audit_log`, `comunicacao_consent_log`, `comunicacao_provider_receipts`, `comunicacao_dlq_replay_audit`, `comunicacao_regras`, `comunicacao_templates`, `communication_provider_settings`, `communication_provider_settings_audit`, `communication_provider_settings_rate_limit`. Policies anteriores preservadas. Data API global também bloqueada ao Platform Superadmin; não se introduziu exceção genérica por cargo.

**ACL e guards EXATOS:** PUBLIC/anon/authenticated sem EXECUTE, service_role preservado, negação `NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE` no primeiro BEGIN, antes de leitura/replay/efeitos, nas 16 assinaturas abaixo (releitura confirmou false/false/true e guard=true):
```text
rpc_activate_communication_template(uuid)
rpc_archive_communication_template(uuid)
rpc_create_communication_template(text,text,comunicacao_canal,text,text,jsonb)
rpc_update_communication_template(uuid,text,text,text,jsonb)
rpc_set_communication_template_metadata(uuid,text,text,jsonb,text)
rpc_upsert_communication_rule(uuid,text,app_role,text,comunicacao_canal,text,integer,jsonb,integer,boolean,integer)
rpc_preview_administrative_broadcast_count(app_role)
rpc_publish_communication_event(text,text,uuid,jsonb,text)
rpc_publish_communication_event_v2(text,text,uuid,jsonb,text)
rpc_admin_set_whatsapp_consent(uuid,uuid,text,text,text)
rpc_verify_communication_channel(uuid,uuid,comunicacao_canal,boolean,boolean)
rpc_admin_communication_health_snapshot()
rpc_admin_communication_outbox_metrics()
rpc_admin_list_communication_dead_letter(integer,integer)
rpc_admin_replay_communication_dead_letter(uuid)
rpc_admin_replay_communication_dead_letter_batch(integer)
```
`_comunicacao_require_admin()` nega incondicionalmente, search_path vazio e ACL cliente revogada. `_comunicacao_publish_system_event(text,text,uuid,jsonb,text)` retorna `{ok:false,suppressed:true,code:...}`, sem ler/publicar; ACL cliente revogada. Preserva operação-pai dos triggers, mas não significa entrega positiva nem prova dinâmica de cada pai.

**Inventário complementar de RPCs/helpers:** `_comunicacao_build_snapshot`/`_v2`, `_comunicacao_can_deliver`, `_comunicacao_expand_event`, `_comunicacao_resolve_recipients`/`_v2`, `_comunicacao_resolve_template`, `_comunicacao_write_audit`, `_comunicacao_write_consent`, `_comunicacao_dlq_replay_rate_check` e três `_comunicacao_trg_*`: cliente já fechado, não reaberto. Worker RPCs `rpc_claim_communication_outbox`, `rpc_resolve_outbox_address`, `rpc_complete_communication_delivery`, `rpc_skip_communication_delivery`, `rpc_cancel_communication_delivery`, `rpc_defer_communication_delivery`, `rpc_fail_communication_delivery`/`_v2`, `rpc_record_whatsapp_delivery_status` permanecem service-only, não homologados para entrega. Trigger functions de imutabilidade/touch que ainda têm ACL pública retornam trigger e não constituem RPC HTTP invocável como função ordinária; não ampliadas.

`rpc_update_communication_preferences(comunicacao_canal,boolean,boolean)` preservada: usa exclusivamente auth.uid, sem parâmetro user/cliente/tenant alvo, consulta/upsert da própria preferência e trilha própria; não lê auditoria global nem configura provedor. Esta revisão **não exercitou consentimento positivo**, não alterou consentimento real e não certifica permissões de conta inativa dessa RPC. Provider RPCs `rpc_service_load_provider_runtime_config`, `rpc_service_apply_provider_settings`, `rpc_service_set_provider_secret`, `rpc_service_clear_provider_secret`, `rpc_service_check_rate_limit`, `rpc_service_record_smtp_diagnostic` continuam service-only; credencial interna não autoriza caller HTTP. Nenhuma invocação real desses RPCs nesta fase.

**Edge source versus deployment — arquivos EXATOS alterados:**
| Fonte | Contenção/contrato | Prova local | Deployment NOTIF-3 |
|---|---|---|---|
| `supabase/functions/communication-health/index.ts` | tenant HTTP403; interno503 antes de snapshot; erro sem detalhe bruto | dois testes reais do handler em VM | UNVERIFIED |
| `supabase/functions/process-communication-outbox/index.ts` | autenticação interna preservada;503 antes de runtime secrets/claim/adapter/ledger | interno503 e zero efeitos | UNVERIFIED |
| `supabase/functions/whatsapp-status-webhook/index.ts` |503 antes de config/challenge/receipt; HMAC original mantido mas inalcançável durante contenção | interno503 e zero efeitos | UNVERIFIED |
| `supabase/functions/test-communication-email/index.ts` |503 após método/CORS, antes de config/secrets/socket/envio; autorização específica antiga preservada abaixo do gate |503 e zero efeitos | UNVERIFIED |
| `supabase/functions/communication-provider-settings/index.ts` | fluxo específico existente Platform Superadmin; agora exige também profile.user_id correspondente e ativo antes de rate/config/mutação; não dá acesso a audit/event global | tenant403/inativo403 antes de efeitos | UNVERIFIED |

Não houve chamada manual de deploy nem HTTP remoto nesta fase. Não inferir implantação pelo arquivo editado ou pela automação: Codex deverá conferir versão/pacote remoto. v60 VERIFIED documental anterior pertence somente aos bloqueadores `send-push-notification`/`enviar-alertas-notificacoes`, não a esses cinco handlers. `verify_jwt`/config.toml não alterados. Provider-settings positivo específico permanece **não exercitado**, não restaurado por esta fase.

**Outros wrappers/produtores revisados:** `entrega-termo-pdf` usa publicação v2 por referência: RPC agora nega mesmo sob service, erro de comunicação não reverte termo conforme fonte; positivo pai não executado. `entrega-runtime-harness` tem bloqueio explícito do projeto canônico antes de fixtures e consulta global, mantido. `platform-invite-org-admin` escreve audit por service dentro de fluxo específico de convite/fencing/autorização plataforma já existente; não é API de leitura global, não alterado/não exercitado e nenhum convite enviado. Produtores laboratoriais/portal/B2B/estoque enumerados na seção7 mantidos; publicação system é suprimida e fanout não restaurado. Os dois bloqueadores externos anteriores permanecem intactos.

**Frontend inventariado, sem ampliar acesso:** `src/features/comunicacao/api.ts` consulta templates/regras/eventos/outbox e chama health/métricas/lista/replay/publicação/preferências; `ConsentimentoWhatsappPanel.tsx` chama consentimento admin. Leituras globais agora vazias/negadas; RPCs globais indisponíveis por servidor, não autorizados pelo menu/feature. Guards/rotas/papéis/planos não modificados; UI de erro e cada portal real permanecem UNVERIFIED nesta fase.

**Matriz de superfícies contidas versus restauradas:**
| Superfície | Estado atual | Evidência/limite |
|---|---|---|
| 11 tabelas globais via Data API | CONTIDA para anon/authenticated, inclusive Superadmin |11 policies vivas +22 superfícies SQL FSF/ARBio |
|16 RPCs globais/health/broadcast/templates/regras/consent/verify/DLQ | CONTIDA, nenhum endpoint restaurado |ACL+guard vivos;12 negações focais, não execução dinâmica de todas16 |
| publicação automática system | SUPRIMIDA, pai preservado no contrato |retorno supressed comprovado, pais integrais UNVERIFIED |
| worker/webhook/diagnóstico/health HTTP | SOURCE CONTIDO |VM PASS;deployment/JWT remoto UNVERIFIED |
| provider-settings plataforma | PRESERVADO ESPECÍFICO, não liberação global |tenant/inativo negados localmente;positivo/deployment UNVERIFIED |
| preferência pessoal | PRESERVADA, sem alvo arbitrário |corpo vivo revisado, positivo mutante não executado |
| notificações próprias/lido-only e NOTIF-2 sessão/push | PRESERVADAS |regressões locais PASS;browser/API/Realtime UNVERIFIED |
| global legítimo, fanout e canais externos | NÃO RESTAURADOS |nenhum envio;contrato ainda não provado |

**Prova transacional própria:** `scripts/rbac-audit/communication-notif3-proof.sql`. UIDs reais FSF `cbdc4ef3-005a-4674-8ea3-4410c7d7d212` e ARBio `a7d45277-6dec-413d-bf6b-86620c1ef39f`, SET LOCAL ROLE authenticated e claims/iat atual. Fixtures somente audit/event TEMPORARY_AUDIT_NOTIF3 com autoria ARBio; **22** superfícies invisíveis ou negadas, **12** negações (health/publicação/consent/verify/INSERT por duas identidades mais health/publicação privilegiados), UPDATE fixture sem efeito; publicação system suprimida. Não são22 linhas de negócio positivas nem teste de JWT/API. Final obrigatório `NOTIF3_COMMUNICATION_ROLLBACK hidden=22 denied=12 parent_suppressed=true`, SQLSTATE P0001; nenhuma falha intermediária nesta prova.

Manifesto: run `0a17806b-ce02-4c79-a0db-1faa13bcd607`, evento `eba8e0e4-4a62-4189-9c40-a67875262a81`, audit `-1367359368935`. Releitura posterior por IDs exatos: resíduos **0/0**, sem DELETE. Hash anterior=posterior (mesma fórmula seção14): eventos1/`16c85f5f5e7f8ae49fe0f3693e84b439`, audit5/`a6712c33f658ae483a31b4d2345e6f26`, avisos67/`1dea25864d5e24f7464c83c02e7e4d39`, outbox0/`d41d8cd98f00b204e9800998ecf8427e`. Nada persistido, nenhum consentimento/secret alterado. Consulta pg_publication_tables: **nenhuma** das duas tabelas notificacoes_operacionais/portal_notificacoes publicada; não habilitar nem declarar Realtime runtime PASS.

**Testes/arquivos adicionais EXATOS:** novo `src/test/comunicacao/notif3-global-containment.test.ts`: **7/7**, executa source real transpiled em VM com Request/Response e dependências mockadas, não apenas grep. Ajustados `src/test/comunicacao/gate3-email.test.ts` e `gate4-whatsapp.test.ts` para localizar definição histórica CREATE FUNCTION e não migration posterior que só menciona nome; `fase2.test.ts` agora exige marker de contenção, não cargo administrador global. Testes históricos de contratos continuam preservados como históricos, não prova da ACL atual.

Verificação Linux: comando NOTIF-2 seção131 acrescido implicitamente do novo teste na pasta comunicacao, **681/681 em35 arquivos** (sete novos inclusos, não somar). Rodada inicial **670 PASS/11 FAIL**: dez seleções incorretas de migration pelo harness histórico e uma expectativa de health por cargo; corrigidas, sem restaurar permissões para fazer teste passar. Primeiro teste novo teve6/7 por VM sem exports, corrigido para execução do módulo, final7/7. Lint dos cinco sources Edge e quatro testes **PASS**, removidos dois `createClient<any>` preexistentes nos sources já alterados, sem contrato novo. Scanners fiscal-secrets/fiscal-integration **PASS**. Linter Supabase da migration reportou420 achados de baseline (15 RLS sem policy,2 PUBLIC DEFINER,402 authenticated DEFINER,1 leaked-password protection), não PASS global. Typecheck explícito **NOT RUN** por restrição do harness; Windows não executado nesta rodada, falhas históricas seção116 não somadas. Build automático/diff-check conferidos no fechamento.

**Rollback seguro/pendências:** não remover policies ou regrantar RPCs nem restaurar bodies globais antigos. Se houver regressão pai comprovada, corrigir apenas retorno de supressão preservando negação global; não fazer broadcast/atribuir tenant ao histórico. Fontes Edge devem manter gates503 e autorização específica; nunca recuperar caminho de transporte como rollback. Nenhum rollback de DDL executado. Resta certificar deployment dos cinco sources, JWT/API/browser/concorrência, perfis/vínculos reais, Realtime/Storage e cada pai preservado. Contenção não é tenantização nem aprovação do módulo. **NO-GO integral**, encerramento desta fase apenas.

### Complemento obrigatório NOTIF-2/3 — 2026-10-08 12:38 UTC

**Evidência independente Codex, não reteste próprio:** migration123024 confirmada; audit_cross1/event_cross1/healthoktrue →0/0/false. Dezesseis RPCs sem ACL anon/authenticated; execução service_role negada exatamente `NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE` antes de efeitos, provas em rollback. Comparação/deployment das Edges será feita pelo Codex; nenhuma implantação duplicada nesta rodada.

**NOTIF-2 compatibilidade focal:** `usePortalCliente.ready` aceita `cliente_produtor`, `administrador` ou `gestor`, como PortalLayout legado, mantendo Auth resolvido, profile.user_id=user.id, ativo===true, organização, resolução server-side e fencing. Dois cenários reais QueryClient: administrador e gestor, vínculos user_clientes CA + clientes CA resolvem CA; troca para financeiro limpa seleção. Sessão24/24 própria PASS. `useNotificacoesUnificadas.portalReady` intocado: exclusivamente cliente_produtor, filtro recipient_user_id; nenhuma ampliação de notificações, guards, papéis ou planos. Corrige a afirmação histórica de papel exclusivo na seleção da seção NOTIF-2, não a exclusividade de notificações.

**Preferência própria — achado confirmado e contido:** Codex informou UID legado inativo `d856140b-26c9-4d6a-a5aa-8bea47e78fff`, claims authenticated/iat atual, ready=false, RPC in_app=false retornava oktrue; marcador `COMMUNICATION_INACTIVE_PREF_ROLLBACK ready=f mutation_ok=true`. Tudo revertido, preferências/consent0/0. Não alegar exclusão Auth: perfil legado inativo permanece, referências preservadas; sem atribuição de org a Produtor1/Parceiro1.

Migration oficial adicional única **`20261008124100_6f41ecb2-d446-4837-82fc-db5adfbc169b.sql`**, canônico confirmado por `lovable supabase info` (ref e API URL exatos). RPC SECURITY DEFINER/search_path vazio exige auth.uid + `platform_private.platform_actor_access_ready` e `platform_private.h15_actor_organization` (perfil pronto/ativo, empresa ativa) antes da primeira leitura/escrita. Assinatura e semântica individuais preservadas, ownership sempre auth.uid, sem parâmetro de alvo. ACL authenticated preservada; PUBLIC/anon revogados, sem regrant global. Policy nova RESTRICTIVE ALL mantém user_id=auth.uid + h15 válido e vínculo/cliente no mesmo tenant quando aplicável. XOR existente permite usuário OU cliente: por exigir user_id próprio, preferência legada por cliente fica invisível, inclusive mesmo tenant; não restaura contrato de consentimento por cliente/global. Isso é contenção individual deliberada, não tenantização/backfill. Policy anterior preservada. Releitura do corpo e ACL confirmou gates/anon=false/authenticated=true. Nada de Auth/AGENTS/Edges alterado.

**Prova própria SQL, não HTTP/browser:** `scripts/rbac-audit/communication-preferences-notif3-proof.sql`; FSF/ARBio reais com claims locais atuais e SET LOCAL ROLE authenticated. Próprio RPC/read2 positivos; crossuser/crossclient (cliente ARBio com vínculo FSF temporário) invisíveis, forja de owner via INSERT negada; inativo/semorg/semJWT read+RPC negados:10 negativas. Exceção final esperada P0001 `NOTIF3_PREFERENCES_ROLLBACK own=2 denied=10`. Run `48681756-be16-4bc6-b22e-a1512f10409a`; cliente `1c11a53b-0bca-42ed-bf85-ea35806f6396`, preferência `b967fb0c-d028-4fac-81e0-ff30922e7671`, vínculo `8471763f-f1f3-47b4-9549-c304ab5e496a`. Próprias2 e consent2 existiram somente na transação revertida. Sem owner arbitrário no contrato RPC; forja direta não toma efeito.

Complemento de leitura **não vazia**: preferências individuais pré-semeadas para inativo e semorg; ambos e semJWT têm read0 e RPC negada,6 negativas, final P0001 `NOTIF3_PREFERENCES_SEEDED_ROLLBACK`. Run `bf6ce533-2bfc-4215-b726-753ecb7f97e4`; preferências `a55c0096-0919-4cf3-8423-9e528b782938` e `bc0633c2-353b-4070-a052-1ae9c28cc53f`. Script consolidado inclui essas sementes, versão consolidada ainda não reexecutada; evidências executadas foram os dois blocos separados descritos acima.

Duas tentativas iniciais de fixture falharam23514, não provas PASS: primeiro XOR (user+cliente simultâneos), segundo source fora de allowlist. Somente fixtures corrigidas para NULL/cliente_portal; constraints e assertions não relaxadas. Clientes abortados `2ffcbb02-6e3f-46dd-8e23-a03cc6e541a7` e `ff7429c2-cd9b-4271-9b8a-99318e03e888` confirmados ausentes. Resíduos finais clientes/vínculos0/0; preferências/consent0/0 antes e depois, MD5 ordenado to_jsonb/string_agg vazio **d41d8cd98f00b204e9800998ecf8427e** em ambos. Nenhum DELETE/consent real persistido/transporte.

**Verificações/evidências separadas:** própria Linux regressão Comunicação/Auth/multiportal/mobile **683/683 em35 arquivos PASS** (inclui24 sessão, não somar); lint2 arquivos/scanners fiscal-secrets/fiscal-integration/diff-check PASS, build automático OK12:43:39Z. Novo teste SQL estrutural `notif3-preferences-contract.test.ts` verifica ordem de gates/ownership/policy; não equivale a SQL dinâmico. Typecheck manual NOT RUN por restrição do harness. Independentes Codex: local603PASS3FAIL606, duas exclusões de caminhos Windows e bit executável POSIX; NOTIF2 local77/77 lint/typecheckPASS antes de dois novos cenários, sessão local24/24 após compatibilidade. Não alterar testes antigos para verde nem somar ambientes. Linter migration420 achados preexistentes, nenhum novo; não corrigidos neste escopo.

Verificação final própria: sessão+contrato **28/28 PASS em2 arquivos** (24 sessão previamente incluídos nos683,4 estruturais novos); lint3 arquivos PASS, diff-check PASS; build automático OK12:45:10Z. Sem somar28 aos683 como casos únicos.

**Rollback/decisão:** não restaurar RPC sem readiness/h15, policy permissiva sem contenção, globals ou ACLs; se necessário forward-fix focal mantendo identidade individual e tenant, sem remover dados. Portal mantém compatibilidade com papéis legados e vínculo sem ampliar notificações. **PASS focal SQL/compatibilidade local; Authenticated path: UNVERIFIED (HTTP/browser)**; guest/semJWT SQL negado, guest HTTP UNVERIFIED. JWT/API imediato, browser, concorrência, Realtime/Storage, positivos globais/fanout/portal sem vínculo e deployment Edge permanecem UNVERIFIED; Realtime não habilitado. **NO-GO operacional/integral**. Sem publicação/envios/secret fetch/outro módulo.
