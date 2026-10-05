# Matriz de testes — AUDIT-CF-20261002-01

## Convenções

- `PASS`: evidência objetiva obtida.
- `FAIL`: comportamento executado e divergente.
- `NO-GO`: gate bloqueado por pré-condição ou divergência.
- `NOT RUN`: não executado; nunca equivale a PASS.
- As escritas da campanha limitaram-se à abertura e à contenção posterior da janela SMTP, sempre pelas mesmas duas flags e pelo mecanismo auditável autorizado.
- O P0 PWA foi encerrado após validação e smoke; a campanha pode retomar somente no E02 SMTP, respeitando os bloqueios já registrados.

## P0 PWA — migração definitiva

| Caso | Cenário | Resultado | Evidência |
|---|---|---|---|
| PWA-001 | Detecção de bundle novo por HTML `no-store` | PASS | abre aviso e não navega |
| PWA-002 | Adiar, badge, mesma versão e formulário preenchido | PASS | uso e conteúdo preservados; sem repetição do aviso |
| PWA-003 | Atualizar agora | PASS | exatamente uma navegação após clique explícito, com trava anti-loop |
| PWA-004 | `visibilitychange`/`online` | PASS | somente detectam; zero navegação automática |
| PWA-005 | Migração `/sw.js` e caches legados | PASS | unregister e limpeza seletiva; zero navegação |
| PWA-006 | Push standalone | PASS | `/push-sw.js` direto, sem Workbox/app-shell ou lifecycle de versão |
| PWA-007 | Stale chunk e `?sw=off` | PASS | somente ações explícitas; limpeza sem loop |
| PWA-008 | Busca estática e artefatos | PASS | pacote sem overlay, textos/eventos legados e sem Workbox gerado |
| PWA-009 | Desktop/mobile/acessibilidade | PASS | aviso não bloqueante, controles acessíveis e sem sobreposição bloqueante |
| PWA-010 | Smoke oficial limpo e com legado simulado | PASS | URL estável, zero overlay/texto legado/erro; apenas push worker ao final |
| PWA-011 | Testes focados/typecheck/build/suíte/scanner | PASS | 23 focados; 5.372 globais/4 skipped; scanner 10 Info, zero Critical/Error/Warning |
| PWA-012 | Build ID explícito igual/diferente | PASS | meta igual mantém estado oculto; diferente abre aviso pelo HTML `no-store` |
| PWA-013 | Publicação altera apenas módulo interno | PASS | mesmo entry e build ID novo abrem aviso sem navegar |
| PWA-014 | Compatibilidade de sessão/HTML legado | PASS | fallback por hash e transição hash→meta cobertos |
| PWA-015 | Eventos, Adiar e Atualizar agora | PASS | detecção e badge sem navegação; uma navegação apenas após clique |
| PWA-016 | Regressão P0.1 completa | PASS pré-publicação | 32 focados; typecheck/build; 5.379 globais/4 skipped; scanner 10 Info e zero P0/P1 |
| PWA-017 | Publicação única e smoke oficial P0.1 | PASS | HTML com `cultivo-build-id`; detector `no-store`; pacote `/plataforma` com botão SMTP; URL estável, zero overlay/erro e nenhum clique SMTP |
| PWA-018 | Controle manual autenticado e acessível | PASS pré-publicação | botão global único, ausente sem login, `aria-label` e posição móvel com safe-area |
| PWA-019 | Resultado detalhado manual | PASS pré-publicação | current/offline/error mostram mensagem; update transfere o fluxo ao notificador sem toast redundante ou navegação |
| PWA-020 | Login silencioso e clique duplo | PASS pré-publicação | uma inspeção por sessão, sem toast de versão atual; clique concorrente gera uma única inspeção |
| PWA-021 | Atualização pendente, adiamento e aplicação | PASS pré-publicação | controle genérico oculto; badge persistente; navegação única somente após Atualizar agora |
| PWA-022 | Scheduler e eventos | PASS pré-publicação | scheduler global único de 10 minutos; intervalo, visibility e online apenas detectam |
| PWA-023 | Regressão P0.2 completa | PASS pré-publicação | 39 focados; typecheck/build; 5.390 globais/4 skipped; scanner 10 Info e zero P0/P1 |
| PWA-024 | Publicação frontend e smoke oficial P0.2 | PASS passivo | HTTP 200; build `build-musmjimn`; pacote contém botão, `aria-label` e mensagens; sem clique em Atualizar agora; visual autenticado não executado sem sessão |
| PWA-025 | Reauditoria final P0.2 | PASS técnico / visual autenticado pendente | 39 focados, typecheck, build, 5.390 globais/4 skipped, scanner 10 Info/zero P0/P1 e smoke oficial passivo; autenticação externa sem sessão automatizada |
| PWA-026 | P0.3 A–D — aviso, Adiar e ausência de badge | PASS pré-publicação | aviso não bloqueante; ações explícitas; Adiar produz estado oculto e persiste somente token |
| PWA-027 | P0.3 E–H — origem da inspeção | PASS pré-publicação | automático silencia versão adiada; login/manual reapresentam; versão carregada limpa deferência |
| PWA-028 | P0.3 I–L — controle nos cabeçalhos | PASS pré-publicação | componente reutilizável no topbar compartilhado e Superadmin; administrativo, produtor, parceiro e mobile usam o mesmo topbar; duplicidade do fallback produtor removida; texto desktop e tooltip mobile |
| PWA-029 | P0.3 M–P — cadência e navegação | PASS pré-publicação | observador pós-login único; scheduler único 10 min; visibility/online só detectam; stale-chunk e atualização navegam apenas por clique |
| PWA-030 | Regressão final P0.3 | PASS | 43 focados/A–P, typecheck e build PASS; scanner 10 Info/zero P0/P1; global 5.402 PASS/4 skipped, sem falhas |
| PWA-031 | Publicação única e smoke oficial P0.3 | PASS passivo | HTTP 200; build `build-musp27xr`; zero erro de página/requisição; módulo oficial contém controle manual, prompt e Adiar, sem badge ou textos de recarga automática; nenhum clique executado |
| PWA-032 | P0.3.1 — botão manual somente com ícone | PASS | 44 testes focados; `RefreshCw` e `Loader2`; zero texto visual persistente; tooltip e `aria-label` preservados; inspeção manual inalterada |
| PWA-033 | P0.3.1 — typecheck, build e scanner | PASS | typecheck/build verdes; scanner 10 Info e zero P0/P1; nenhuma área SMTP/Supabase alterada |
| PWA-034 | P0.3.1 — publicação única e smoke oficial | PASS passivo | HTTP 200; build `build-musqd5o5`; módulo oficial contém controle `h-9 w-9`, tooltip e rótulo acessível, sem texto desktop, recarga automática ou badge; nenhum clique executado |

## Diagnóstico SMTP — integração da tela de plataforma

| Caso | Cenário | Resultado | Evidência |
|---|---|---|---|
| SMTP-UI-001 | Componente real da aba Comunicação em `/plataforma` | PASS | `PlataformaHome` importa e renderiza a instância única de `ComunicacaoConfigTab` |
| SMTP-UI-002 | Visibilidade das duas etapas | PASS | diagnóstico não depende mais de `smtp.password_configured`; os dois passos permanecem visíveis |
| SMTP-UI-003 | Conexão com entrega global/e-mail OFF | PASS contratual | habilitação usa somente a configuração técnica sanitizada; flags de entrega não integram o gate visual de conexão |
| SMTP-UI-004 | Envio com entrega OFF | SUPERADO | o gate diagnóstico independente permite somente o teste controlado após PASS recente; envio operacional continua bloqueado |
| SMTP-UI-005 | Detector de publicação futura | PASS por harness | token futuro abre aviso sem navegação ou recarga automática |
| SMTP-UI-006 | Diagnóstico dentro do card SMTP | PASS | configuração, salvar, conexão e envio controlado aparecem em sequência no mesmo card; card redundante removido |
| SMTP-UI-007 | Resultado compacto e acessível | PASS | status amigável, etapa, código e latência em região `aria-live`; sem host, usuário ou segredo |
| SMTP-UI-008 | Responsividade | PASS contratual | grid no desktop e coluna única no mobile; ações não alteram dimensões do bloco |
| SMTP-DIAG-001 | Última tentativa real de conexão | FAIL controlado | 2026-10-03T13:44:53Z; HTTP 502; `connect/smtp_tls_failed`; 13 ms; TLS/auth false |
| SMTP-DIAG-002 | Configuração runtime sanitizada | PASS read-only | porta 465, senha presente por booleano, estrutura completa e entrega OFF/OFF; nenhum valor sensível exposto |
| SMTP-DIAG-003 | Localização da falha | PASS diagnóstico | rejeição em `Deno.connectTls`, antes de greeting/EHLO/AUTH; timeout de 5 s incompatível com latência de 13 ms |
| SMTP-DIAG-004 | Causa fina rede/DNS/TCP/certificado | INCONCLUSIVO | helper atual agrupa essas exceções em `smtp_tls_failed`; requer categorização interna allowlisted |
| SMTP-DIAG-005 | Novo probe ou envio nesta rodada | NOT RUN | proibido pelo escopo; nenhum botão acionado |
| SMTP-UI-009 | Testes/layout/regressão | PASS | 54 focados, 4 Deno, typecheck, build, 5.379 globais/4 skipped e scanner sem P0/P1 |
| SMTP-UI-010 | Smoke `/plataforma` sem sessão | PASS limitado | redirecionou a `/auth`, sem erro e sem chamada SMTP; DOM autenticado não disponível no Supabase externo |
| SMTP-TLS-001 | DNS nativo | PASS mock | normalizado para `smtp_dns_failed` |
| SMTP-TLS-002 | Conexão recusada | PASS mock | normalizado para `smtp_tcp_refused` |
| SMTP-TLS-003 | Rede/host inalcançável | PASS mock | normalizado para `smtp_tcp_unreachable` |
| SMTP-TLS-004 | Timeout | PASS mock | normalizado para `smtp_connect_timeout`; timeout do probe não foi duplicado |
| SMTP-TLS-005 | Certificado inválido | PASS mock | normalizado para `smtp_tls_certificate_failed` |
| SMTP-TLS-006 | Handshake/protocolo TLS | PASS mock | normalizado para `smtp_tls_handshake_failed` |
| SMTP-TLS-007 | TLS desconhecido | PASS mock | fallback `smtp_tls_failed` |
| SMTP-TLS-008 | Sanitização | PASS contratual | mensagem nativa descartada; resposta/log/auditoria recebem somente código allowlisted |
| SMTP-TLS-009 | 465 e SNI | PASS regressão | `connectTls({ hostname, port })`; hostname preservado |
| SMTP-TLS-010 | Fechamento e SMTP | PASS regressão | `finally` fecha socket; greeting/EHLO/AUTH e ausência de envelope preservados |
| SMTP-TLS-011 | Portas 25/587 | PASS regressão | bloqueio anterior ao socket preservado |
| SMTP-TLS-012 | Gates OFF/OFF | PASS regressão | connection continua independente das flags; send continua bloqueado |
| SMTP-TLS-013 | Probe real e envio | NOT RUN | nenhum socket ou mensagem nesta rodada; próximo clique é exclusivamente humano |
| SMTP-FINAL-001 | Build oficial versus HEAD | PASS com ressalva | `build-mushy2d3` = fallback temporal `2026-10-03T14:37:55.959Z`, posterior ao HEAD `2c7fecc3…` de `14:37:03Z`; sem SHA de deploy, equivalência criptográfica não é afirmada |
| SMTP-FINAL-002 | Gate no bundle oficial | PASS | `App-BwrXF4VX.js` exige host, porta compatível, usuário, senha e remetente; contém os novos safe codes |
| SMTP-FINAL-003 | Paridade dos indicadores de senha | PASS corrigido | os dois status usam presença da mesma referência; UUID presente=true e null/string vazia=false, sem resolver ou retornar segredo |
| SMTP-FINAL-004 | Configuração sanitizada canônica | PASS read-only | porta 465; host/usuário/remetente/referência Vault presentes; segredo resolvido no runtime; fonte DB; flags OFF/OFF; Test Mode ON |
| SMTP-FINAL-005 | Última tentativa classificada | FAIL controlado | `2026-10-03T16:20:46.740215Z`; `connect/smtp_tcp_refused`; 14 ms; antes de greeting/EHLO/AUTH |
| SMTP-FINAL-006 | Ausência de envio posterior | PASS read-only | zero `smtp_send_test`, tentativa/aceite de convite, outbox criada/enviada e alteração de configuração após a captura |
| SMTP-FINAL-007 | Compatibilidade do provedor | PASS documental | KingHost suporta SSL/TLS na porta 465; documentação exige SMTPi para origem externa ao Brasil; nenhuma configuração alterada |
| SMTP-FINAL-008 | Novo probe, envio ou correção operacional | NOT RUN | proibidos nesta rodada; somente leitura e documentação factual |
| SMTP-SECRET-001 | Referência UUID presente | PASS | indicador sanitizado retorna somente `true` |
| SMTP-SECRET-002 | Referência nula/vazia | PASS | indicador sanitizado retorna `false` |
| SMTP-SECRET-003 | Flags booleanas | PASS regressão | continuam usando igualdade booleana estrita, sem reutilizar helper de segredo |
| SMTP-SECRET-004 | Ausência de vazamento | PASS | shape público contém somente indicadores; nenhum valor de referência/segredo é retornado |
| SMTP-SECRET-005 | WhatsApp e webhook | PASS regressão | access token, app secret e verify token usam a mesma regra de presença |
| SMTP-SECRET-006 | Validação e scanner | PASS | 41 Vitest, 3 Deno, typecheck e build verdes; scanner 10 Info/zero P0/P1 |
| SMTP-SECRET-007 | Deploy e smoke GET | PASS limitado | somente `communication-provider-settings` implantada; GET sem sessão=401; autenticado NOT RUN por indisponibilidade de sessão Superadmin, sem bypass `service_role` |
| SMTPI-001 | KingHost doméstico → SMTPi | PASS mock | `smtp.kinghost.net` mapeia somente em memória para `smtpi.kinghost.net`, porta 465 |
| SMTPI-002 | Uni5 doméstico → SMTPi | PASS mock | `smtp.uni5.net` mapeia somente em memória para `smtpi.uni5.net`, porta 465 |
| SMTPI-003 | Host/porta não aplicável | PASS | falha fechada com `candidate_not_applicable`; cliente não fornece host arbitrário |
| SMTPI-004 | Probe candidato sem envio/persistência | PASS | clone preserva credenciais, porta e flags; mocks confirmam zero envelope SMTP e resposta sem host/segredo |
| SMTPI-005 | Auditoria candidata | PASS | ação específica `smtp_connection_candidate_test`, safe codes allowlisted e RPC exclusiva de `service_role` |
| SMTPI-006 | UI e aplicação explícita | PASS estrutural | bloco aparece após `smtp_tcp_refused`; PASS na sessão habilita confirmação; payload de aplicação contém somente `smtp.host` |
| SMTPI-007 | Validação completa | PASS | Deno check, 10 Deno, 54 focados, typecheck, build, 5.394 globais/4 skipped; scanner 10 Info/zero P0/P1 |
| SMTPI-008 | Deploy e smoke passivo | PASS | duas Edge Functions implantadas; negativas JWT=401; frontend publicado e domínio HTTP 200, sem clique candidato/aplicação |
| SMTPI-009 | Probe real, envio e alteração do host | NOT RUN | dependem de clique humano; nenhuma operação SMTP ou mudança operacional executada nesta rodada |
| SMTPI-010 | Configuração ativa sanitizada | PASS read-only | corte `2026-10-03T18:32:05.401961Z`: porta 465; família KingHost; rota SMTPi/internacional ativa; host/usuário/remetente/referência Vault presentes; global/e-mail OFF/OFF; Test Mode ON; allowlist exatamente `teste@refilinformatica.com.br` |
| SMTPI-011 | Última conexão normal | PASS canônico | auditoria `id=25`, `2026-10-03T18:32:05.401961Z`; `success/smtp_connection_ok/quit`; 105 ms; contrato concluiu TLS/greeting/EHLO/AUTH sem envelope ou mensagem |
| SMTPI-012 | Segredo resolvido | PASS funcional | runtime com fonte DB completou AUTH e alcançou `quit`; valor e referência não foram expostos |
| SMTPI-013 | Ausência de envio pós-conexão | PASS read-only | zero `smtp_send_test`, tentativa/aceite novo do convite, receipt, outbox criada/tentada/enviada e retry/reenvio após o PASS |
| SMTPI-014 | Integridade E02 | PASS read-only | um job, um Auth user, um profile no tenant e um papel administrador; zero superadmin; tentativas 1/1, `failed/email_unknown_error`, aceite nulo, leases limpos e nenhuma alteração após o PASS |
| SMTPI-015 | Gate de envio controlado | SUPERADO | condição antiga substituída pelo gate diagnóstico independente abaixo; flags operacionais permanecem OFF/OFF |
| SMTP-SEND-001 | OFF/OFF + PASS recente + Test Mode + allowlist exclusiva | PASS mock | teste diagnóstico liberado sem persistir flags; fluxos operacionais continuam bloqueados pelo adapter normal |
| SMTP-SEND-002 | PASS expirado após 30 minutos | PASS mock | `smtp_connection_stale`, zero chamada ao adapter |
| SMTP-SEND-003 | Configuração alterada após PASS | PASS mock | `smtp_configuration_changed`, zero chamada ao adapter |
| SMTP-SEND-004 | Test Mode/allowlist inválidos | PASS mock | falha fechada; allowlist deve conter exclusivamente o destinatário controlado |
| SMTP-SEND-005 | Confirmação e destinatário | PASS estrutural | confirmação literal obrigatória; endereço divergente e campos extras rejeitados; destinatário fixado no servidor |
| SMTP-SEND-006 | Conteúdo e resultado | PASS estrutural | assunto/corpo fixos; aceite não alega entrega; ambiguidade bloqueia repetição cega |
| SMTP-SEND-007 | ACL, limite e sanitização | PASS estrutural | Superadmin server-side; 3/5 min; auditoria allowlisted; sem host, usuário, senha ou resposta bruta |
| SMTP-SEND-008 | Validação sem envio | PASS | Deno check, 70 testes focados, typecheck, build, 5.395 globais/4 skipped e scanner 10 Info/zero P0/P1 |
| SMTP-SEND-009 | Deploy/smoke passivo | PASS | duas Edge Functions implantadas; HTTP 200 e marcadores do fluxo confirmados no módulo oficial publicado; nenhum probe, envio ou alteração operacional |
| SMTP-SEND-010 | Envio real controlado | GO condicionado / NOT RUN | PASS recente às `18:32:05Z`; autorizado somente um clique humano para `teste@refilinformatica.com.br`, com configuração inalterada e TTL de 30 min; flags operacionais permanecem OFF/OFF; nenhum envio ocorreu nesta auditoria |

## Planejamento multi-provedor de e-mail — sem implementação

| Caso | Cenário futuro obrigatório | Resultado desta rodada | Critério de aceite futuro |
|---|---|---|---|
| MP-001 | `custom_smtp` continua no adapter SMTP | PLANEJADO | dispatcher seleciona SMTP por default e regressão preserva resultados/gates |
| MP-002 | `smtp2go_api` nunca abre socket SMTP | PLANEJADO | mocks provam apenas HTTPS para origin allowlisted |
| MP-003 | API key ausente | PLANEJADO | readiness false e zero chamada externa |
| MP-004 | Connection test válido | PLANEJADO | `/v3/api_keys/permissions` autentica e inclui `/email/send`; PASS sanitizado, sem mensagem |
| MP-005 | Autenticação inválida | PLANEJADO | `smtp2go_auth_failed`, sem body/header bruto |
| MP-006 | Permissão insuficiente | PLANEJADO | `smtp2go_permission_denied` |
| MP-007 | Rate limit do provider/local | PLANEJADO | `smtp2go_rate_limited`, retry sujeito à política |
| MP-008 | Timeout/rede | PLANEJADO | `smtp2go_network_error`, sem dado sensível |
| MP-009 | Provider 5xx | PLANEJADO | `smtp2go_unavailable`; efeito classificado antes de retry |
| MP-010 | HTTP 200 com falha no payload | PLANEJADO | FAIL por `data.failed/failures`; HTTP isolado nunca significa aceite; `fastaccept=false` |
| MP-011 | Envio aceito | PLANEJADO | estado “aceito pelo provider”, nunca “entregue na caixa” |
| MP-012 | Troca com motivo/auditoria | PLANEJADO | lock, Superadmin, teste recente, old/new e motivo únicos |
| MP-013 | Tenant admin | PLANEJADO | 403 e nenhuma configuração global exposta |
| MP-014 | Alternância entre providers | PLANEJADO | configurações dos dois preservadas |
| MP-015 | Duplo clique/concorrência | PLANEJADO | uma troca/claim efetiva; demais falham ou observam estado final |
| MP-016 | Retry/idempotência | PLANEJADO | intenção local antes da chamada; ambíguo bloqueia automático; sem exactly-once |
| MP-017 | Convite/recovery/notificações | PLANEJADO | todos chamam dispatcher; nenhuma chamada direta fora dos adapters |
| MP-018 | Test Mode/allowlist/flags globais | PLANEJADO | gates comuns antes de qualquer provider |
| MP-019 | Troca não abre janela | PLANEJADO | `delivery_enabled` e `email_delivery_enabled` permanecem inalterados |
| MP-020 | Rollback manual | PLANEJADO | volta ao provider anterior sem apagar configurações/segredos |
| MP-021 | Failover automático | FORA DE ESCOPO | não implementar na primeira versão por risco de duplicação ambígua |
| MP-022 | Rodada atual sem mutação | PASS | somente documentação; zero banco, secret, flag, chamada externa ou envio |
| MP-023 | Emissores SMTP legados | ACHADO/BLOQUEIO M8 | duas funções leem `SMTP_*` e criam cliente próprio; atividade produtiva não comprovada |
| MP-024 | Referência `send-transactional-email` | ACHADO/BLOQUEIO M8 | dois fluxos de PDF invocam função ausente no repositório; não declarar envio operacional |
| MP-025 | Dispatcher verdadeiramente único | PLANEJADO | zero SMTP direto fora de adapters e zero referência órfã antes da homologação |

## Fase 0

| Caso | Cenário | Resultado | Evidência |
|---|---|---|---|
| F0-001 | Vínculo ao projeto canônico | PASS | ref `swzpzcwiasxmjutrmvkm` |
| F0-002 | Inventário frontend/backend/banco/storage/cron | PASS | contagens registradas no documento mestre |
| F0-003 | Tabelas públicas sem RLS | PASS | contagem 0 |
| F0-004 | Scanner profundo | PASS com riscos | 10 Info; 0 Critical/Error/Warning |
| F0-005 | Hardening das duas funções administrativas | PASS | CORS fail-closed, JWT explícito e erros sanitizados |
| F0-006 | Testes focados de segurança e D51.2 | PASS | 70/70 |
| F0-007 | Typecheck | PASS | saída sem erro |
| F0-008 | Suíte global oficial | PASS | 5.371 PASS, 4 skipped |
| F0-009 | Scan de dependências | INCONCLUSIVO | parser do lockfile falhou em `xlsx`; limitação registrada |
| F0-010 | Cross-tenant autenticado por perfis | NOT RUN | reservado às fases de domínio com fixtures em ROLLBACK |
| F0-011 | Concorrência/idempotência por domínio | NOT RUN | reservado às fases 1–14 |
| F0-012 | Desktop/mobile/a11y funcional | NOT RUN | reservado à Fase 13 |
| F0-013 | Build de produção/PWA | PASS com alerta | 4.669 módulos; bundle principal ~5,60 MB |
| F0-014 | ESLint global | FAIL histórico/P2 | 3.505 erros e 126 avisos em 543 arquivos |
| F0-015 | Linter Supabase | PASS como baseline | 492 alertas classificados; sem correção em massa |
| F0-016 | Slow queries | PASS como baseline | maiores custos em harnesses/auditorias, sem gargalo produtivo comprovado |

## Fase 1 — D51.2

| Caso | Cenário | Resultado | Evidência |
|---|---|---|---|
| F1-001 | Razão social/CNPJ oficiais preservados e marcador seguro possível em nome fantasia | PASS | razão read-only; nome fantasia editável e limitado a 200 caracteres; teste focado |
| F1-002 | Localizar organização por CNPJ autorizado | PASS | exatamente 1; `8f57c7dd…4626`; CNPJ/e-mail/status/ativo/timestamps conformes |
| F1-003 | Localizar organização pelo marcador em nome fantasia | PASS | exatamente 1; nenhuma outra organização com o marcador |
| F1-004 | Exatamente uma subscription do E01 | PASS | Completo (`completo`), TRIAL, início/criação `2026-10-02T20:10:49.499027Z`; sem segunda assinatura |
| F1-005 | Exatamente uma auditoria de organização | PASS | criação `NULL→aguardando_ativacao`, ator Superadmin, motivo e timestamp conformes |
| F1-006 | Zero convite/job do alvo e destinatário | PASS | contagem 0 |
| F1-007 | Zero Auth user/profile/papel do alvo | PASS | contagens 0 |
| F1-008 | SMTP fechado durante E01 | PASS | global/e-mail OFF antes da preparação de E02 |
| F1-009 | Test mode e allowlist controlada | PASS | ON; um endereço, controlado presente |
| F1-010 | Zero leases ativos | PASS | contagem 0 |
| F1-011 | Job AR BIO preservado | PASS | falhou; tentativa 1; e-mail 0; sem usuário/lease |
| F1-012 | Janela SMTP para E02 | PASS | RPC auditável; somente global/e-mail ON; readiness=true; auditoria 14; nenhum envio |
| F1-012A | Clique E02 / envio | FAIL | chamada humana em `2026-10-02T20:43Z`; Edge v18 retornou 503 após finalizer; SMTP ficou `failed/email_unknown_error` |
| F1-012B | Persistência pós-clique | PASS parcial | 1 job `22c70f4f…fbc1`; 1 Auth `cbdc4ef3…d212`; 1 profile no tenant correto; 1 papel administrador; zero superadmin; nenhuma duplicação |
| F1-012C | Estágio exato da falha | PASS diagnóstico | Auth create, generate link, finalizer, runtime config e claim SMTP retornaram 200; falha registrada no adapter SMTP antes do aceite local |
| F1-012D | Aceite do provedor/entrega | INCONCLUSIVO | SMTP direto, zero outbox/receipt/provider id; `email_unknown_error` não prova se o remoto aceitou antes de a conexão falhar |
| F1-012E | Segurança do retry real | BLOCKED | cooldown/leases estão limpos, mas novo envio pode duplicar mensagem; requer forward-fix de observabilidade/estado ambíguo antes do retry |
| F1-013 | Primeiro acesso/recovery | NOT RUN | depende de E02 verde e ação humana |
| F1-014 | Retry/cooldown/lease/fencing/provider failure | PASS contratual | testes isolados com mocks e contratos server-side; nenhum job real usado |
| F1-014A | Concorrência/takeover/hard-crash E2E com ROLLBACK | NOT RUN | sem conexão transacional PG; não simulado como PASS |
| F1-014B | Cross-tenant autenticado completo | NOT RUN | requer identidades controladas em transação; prova estática/ACL passou |
| F1-014C | Link usado/expirado ponta a ponta | NOT RUN | depende de E02 e identidade controlada; contrato de primeiro acesso passou |
| F1-014D | First-use fiscal/configurações gerais | PASS contratual | núcleo SaaS, plano/features e defaults cobertos nos testes focados; uso persistente aguarda E02/primeiro acesso |
| F1-014E | Idempotência/duplicidade/double-click/retry de criação | PASS contratual | guards server-side e fluxo sem retry automático; clique concorrente bloqueado; não repetiu E01 persistente |
| F1-015 | Cleanup | NOT RUN | campanha em andamento; preservar E01 e trilha |
| F1-016 | Negativa convite sem JWT/JWT inválido | PASS | 401/401; nenhuma mutação |
| F1-017 | Negativa provider settings sem JWT/JWT inválido | PASS | 401/401 |
| F1-018 | Negativa teste de e-mail sem JWT/JWT inválido | PASS | 401/401; nenhum envio |
| F1-019 | Testes Deno das três funções | NOT RUN | runner informou ausência de módulos de teste |
| F1-020 | Criar conta Superadmin temporária por mecanismo oficial | BLOCKED | Auth Admin existente confirma e-mail, mas bloqueia `superadmin`; RPC/trigger preservam a reserva; Supabase externo sem sessão automatizada |
| F1-021 | Fluxo preserva razão oficial e permite marcador no limite existente | PASS | 11/11 testes focados; typecheck e build verdes |
| F1-022 | Regressão global e scanner após refinamento | PASS | 5.372 testes PASS, 4 skipped; scanner 10 Info e zero P0/P1 |
| F1-023 | Provas focadas pré-E02 | PASS | 228/228 em 14 arquivos; criação/checkpoint, planos/features, ACL, convite, falhas, leases e primeiro acesso |
| F1-024 | REFIL e job AR BIO preservados | PASS | REFIL `rascunho` + Completo SUSPENDED; AR BIO falhou/tentativa 1/e-mail 0/sem usuário/lease |
| F1-025 | Config inválida antes do transporte | PASS | `email_config_invalid`, definitivo, sem `send` |
| F1-026 | Factory/conexão falha | PASS | `email_connect_network`/`email_connect_timeout`, definitivo, sem `send` |
| F1-026A | Falha real do envio controlado após PASS nativo | FAIL operacional / PASS diagnóstico | única tentativa `id=26`, `failure/smtp_send_failed/connect`, latência auditada nula; Edge HTTP 502 em 3060 ms e log `email_connect_network/connect`; falha na fábrica/conexão Denomailer antes de `client.send` |
| F1-026B | Paridade de transporte entre probe e envio | FAIL | probe usa `Deno.connectTls` e passou; envio usa `denomailer@1.6.0`/`SMTPClient` e falhou em `connect`; unificação recomendada, não implementada |
| F1-026C | Forward-fix transporte nativo compartilhado | PASS sem rede | `sendEmail` mantém contrato/injeção e fábrica padrão usa o mesmo núcleo TLS/EHLO/STARTTLS/AUTH do probe; 15/15 Deno e 47/47 focados PASS |
| F1-026D | Envelope e MIME nativos | PASS sem rede | MAIL 250, RCPT 250/251, DATA 354, final 250, multipart UTF-8 quoted-printable, CRLF e dot-stuffing cobertos por socket simulado |
| F1-026E | Certeza após DATA | PASS sem rede | 4xx/5xx inequívoco definitivo; reset/timeout/resposta final perdida após corpo classificado ambíguo; socket fechado |
| F1-027 | SMTP 421/451 inequívoco | PASS | `email_smtp_4xx`, definitivo/transiente |
| F1-028 | SMTP 550 inequívoco | PASS | `email_smtp_5xx`, definitivo/permanente |
| F1-029 | Timeout/reset/exceção desconhecida durante send | PASS | `email_send_ambiguous`; retry automático bloqueado |
| F1-030 | Send resolve e persistência do aceite falha | PASS | `email_accept_persistence_failed`; estado ambíguo |
| F1-031 | Ambíguo sem confirmação | PASS contratual | RPC retorna marker seguro antes de nova claim; zero incremento/send |
| F1-032 | Confirmação explícita | PASS contratual | Superadmin server-side, mesmo job, cooldown e auditoria existente |
| F1-033 | Duplo clique/5 retries concorrentes | PASS contratual | UI bloqueia clique em voo; row lock + lease/fencing permitem uma claim |
| F1-034 | Reuso de job/Auth/profile/papel | PASS | fluxo retoma a intenção existente; nenhuma recriação |
| F1-035 | Legacy `email_unknown_error` | PASS | tratado como ambíguo sem mutar previamente o job factual |
| F1-036 | Falha definitiva | PASS | mantém retry normal sujeito a cooldown |
| F1-037 | UI/modal/a11y | PASS | status, aviso, Cancelar e Confirmar e reenviar cobertos em desktop responsivo |
| F1-038 | Logs/resposta sem bruto/PII | PASS | somente campos allowlisted e job hash; resposta genérica |
| F1-039 | Open redirect/Auth/RLS | PASS | origem allowlisted, JWT inválido 401 e RPCs novas service-role-only |
| F1-040 | Deno check/typecheck/build/suítes | PASS | Deno check, typecheck e build; 63 focados e 5.376 globais PASS, 4 skipped |
| F1-041 | Scanner RBAC autenticado | NOT RUN | segredo de auditoria ausente; abortou antes de executar |
| F1-042 | Linter Supabase | PASS como baseline | 492 achados preexistentes; novas RPCs verificadas sem grants anon/authenticated |
| F1-043 | Deploy backend | PASS | somente `platform-invite-org-admin`; negativa JWT inválido 401 |
| F1-044 | Job factual pós-deploy | PASS | 1 job; tentativas 1/1; `failed/email_unknown_error`; zero leases; nenhum envio |
| F1-045 | Publicação frontend e smoke oficial | FAIL | Publish solicitado; Lovable e domínio oficial ainda servem `index-B6zZZyrG.js` sem os marcadores do modal ambíguo |
| F1-046 | Contenção imediata pós-forward-fix | PASS | auditoria 15; somente global/e-mail OFF; Test Mode ON, allowlist exclusiva, SMTP/Vault e demais canais preservados; jobs sem alteração ou lease |
| F1-047 | Porta efetiva da configuração/runtime | PASS read-only | porta 465 em ambos; sem leitura/exposição de host, usuário, senha ou remetente |
| F1-048 | Portas 25 e 587 no Supabase Edge Runtime | PASS contratual | readiness false e código `smtp_port_blocked_by_edge_runtime` antes de claim/socket |
| F1-049 | Porta 465 | PASS estrutural | configuração completa aceita estruturalmente; conectividade e suporte do provedor não afirmados nem testados |
| F1-050 | Teste/convite em porta bloqueada | PASS contratual | bloqueio fail-closed antes de factory SMTP e antes do claim de provisionamento; zero envio/incremento |
| F1-051 | Alternativa quando não houver porta permitida | DOCUMENTADO | integração HTTP oficial pelo adapter existente; nenhum provedor/API/credencial presumido |
| F1-052 | Regressão completa do complemento | PASS | 5.380 testes globais/4 skipped; 60 focados; typecheck/build; scanner 10 Info e zero Critical/Error/Warning |
| F1-053 | Testes Deno específicos do complemento | NOT RUN | runner informou ausência de módulos de teste nas duas funções; não promovido a PASS |
| F1-054 | Deploy e smoke do complemento | PASS | três funções implantadas; negativas JWT inválido 401; bundle oficial `App-Bdw25M7-.js` contém os marcadores novos |

| SMTP-NATIVE-001 | Novo envio controlado após forward-fix | PASS | exatamente 1 novo send; `id=28`, `2026-10-03T19:15:10.908320Z`, `success/smtp_send_accepted/response`, latência nula |
| SMTP-NATIVE-002 | Ambiguidade e duplo clique | PASS | zero resultado ambiguous; total histórico 2 e somente 1 após a falha `id=26` |
| SMTP-NATIVE-003 | Configuração preservada | PASS read-only | KingHost SMTPi, porta 465, OFF/OFF, Test Mode ON, allowlist exclusiva; configuração anterior ao PASS `id=27` |
| SMTP-NATIVE-004 | Ausência de efeitos colaterais | PASS read-only | zero Auth/profile/invite novo, outbox tentada/enviada e lease ativo após o PASS |
| SMTP-NATIVE-005 | Integridade E02 | PASS read-only | 1 job; mesmo Auth/profile/tenant; 1 administrador, zero superadmin; estado histórico failed/1/email_unknown_error, sem aceite/lease |
| E02-RETRY-001 | Retry único do job histórico | PASS | mesmo job/organização/usuário; contadores 1/1→2/2; zero segundo job ou destinatário |
| E02-RETRY-002 | Aceite do convite | PASS | `accepted`; tentativa `2026-10-03T19:26:20.621676Z`; aceite `2026-10-03T19:26:21.561898Z`; erro atual nulo |
| E02-RETRY-003 | Lease e concorrência | PASS com observação | leases geral/e-mail limpos e uma sequência claim→sent→accepted; `email_next_attempt_at` residual apesar de accepted |
| E02-RETRY-004 | Auth/profile/role | PASS | 1 Auth confirmado, 1 profile ativo no tenant, `senha_provisoria=true`, 1 administrador, zero superadmin e zero vínculo em outro tenant |
| E02-RETRY-005 | Empresa e assinatura | PASS | 1 organização da campanha e 1 assinatura TRIAL; zero nova organização/assinatura/profile no intervalo |
| E02-RETRY-006 | Transporte e logs | PASS | convite usou `sendEmail` com cliente SMTP nativo; logs somente com eventos/safe codes/job mascarado; responsável declarou recebimento |
| E02-RETRY-007 | Efeitos laterais | PASS | zero outbox operacional nova/tentada/enviada e somente o destinatário controlado teve job tentado |
| AUTH-REDIRECT-001 | Link anterior abriu localhost com fragmento sensível | FAIL / incidente real | evidência declarada pelo responsável; token não registrado; link marcado comprometido |
| AUTH-REDIRECT-002 | Contenção de comunicação | PASS read-only | global/e-mail OFF/OFF, Test Mode ON e allowlist exclusiva; zero novo convite/envio |
| AUTH-REDIRECT-003 | Redirect canônico no servidor | PASS implantado | destino fixo `https://app.cultivofarm.com.br/reset-password`; Origin continua gate e não compõe link; Edge implantada |
| AUTH-REDIRECT-004 | Origin localhost/preview altera destino | PASS mock | ambos preservam o destino canônico; origem não confiável continua 403 |
| AUTH-REDIRECT-005 | Fragmento após consumo Auth | PASS | Playwright com valores fictícios terminou em `/reset-password` sem fragmento e exibiu link inválido; zero logs/analytics de token |
| AUTH-REDIRECT-006 | Site URL e Redirect URLs no Auth | PASS declarado / não verificável diretamente | responsável confirmou Site URL corrigido e Redirect URL exata adicionada; ferramenta disponível não lê URL Configuration do Supabase externo |
| AUTH-REDIRECT-007 | Revogação global da sessão comprometida | PASS | autorização explícita; mecanismo oficial por user_id indisponível; fallback transacional removeu 1 refresh token e 1 sessão somente do usuário `cbdc4ef3-****-****-****-d212`; pós-contagens 0/0 |
| AUTH-REDIRECT-008 | Novo convite controlado | NOT RUN / GO | gate liberado após revogação e preservação de integridade; nenhum convite foi gerado ou enviado nesta rodada |
| AUTH-REDIRECT-009 | Validações e publicação | PASS | 47 testes focados, 17 Deno, suíte global 5.403 PASS/4 skipped, typecheck/build e scanner com 10 Info/zero P0/P1; frontend publicado e Edge implantada |
| AUTH-REDIRECT-010 | Prova recovery sem e-mail | BLOCKED seguro | tentativa via Admin Auth foi recusada pelo ambiente antes da chamada; nenhum action link/token foi gerado, persistido, impresso ou aberto |
| AUTH-REDIRECT-011 | Código e rota oficiais | PASS | Edge usa redirect server-side fixo e não compõe por Origin; 2/2 testes Deno; `/reset-password` respondeu 200 no build `build-musstglq` |
| AUTH-REDIRECT-012 | Isolamento E02 pós-correção | PASS read-only | 1 job, 1 Auth, 1 profile no tenant, 1 administrador, zero superadmin/outro tenant; estado `accepted`, contadores 2/2 e leases limpos |
| AUTH-REDIRECT-013 | Constraints e alvo da revogação | PASS | exatamente 1 Auth e 1 job coincidentes; FK de refresh token para sessão possui `ON DELETE CASCADE`; deleção explícita ocorreu antes da sessão, sem tocar users/identities/MFA |
| AUTH-REDIRECT-014 | Integridade após revogação | PASS | 1 Auth, 1 profile esperado, 1 administrador, zero superadmin, 1 job `pendente/accepted` 2/2 sem leases, 1 organização e 1 assinatura; flags OFF/OFF, Test Mode ON e allowlist exclusiva |
| E02-RETRY-008 | Fechamento da janela | PASS / superado | global/e-mail OFF/OFF, Test Mode ON e allowlist exclusiva; o link anterior permanece proibido pelo P0 Auth redirect |
| D51-UI-001 | Pendente + link + accepted | PASS | ação persistente `Reenviar convite` visível diretamente na linha |
| D51-UI-002 | Ativo ou senha temporária | PASS | ação de reenvio ausente |
| D51-UI-003 | Falha normal e ambiguidade | PASS | tentativa normal preservada; ambíguo mantém confirmação especial e flag verdadeira |
| D51-UI-004 | Mesmo registro e backend | PASS | payload reutiliza organização/e-mail/nome e demais dados da linha; flag ambígua falsa no reenvio normal; mesmo hook/Edge |
| D51-UI-005 | Concorrência e atualização | PASS | trava síncrona impede duplo clique; sucesso solicita refetch da lista |
| D51-UI-006 | Validação e publicação | PASS | 11 focados, 5.409 globais/4 skipped, typecheck/build e scanner 10 Info/zero P0/P1; publicação única e smoke passivo HTTP 200 no build `build-musuh9jx`, sem envio |
| D51-RETRY-DIAG-001 | Estado do job após tentativa humana | PASS read-only | mesmo job mascarado; `pendente/failed`, tentativas 3/3, `email_connect_network`, leases limpos, sem conclusão |
| D51-RETRY-DIAG-002 | Elegibilidade de `pendente+accepted` | PASS | RPCs aceitam o estado; claim ocorreu e gerou nova idempotência, descartando hipóteses de state mismatch ou RPC própria ausente |
| D51-RETRY-DIAG-003 | Correlação Edge da tentativa mais recente | FAIL operacional | HTTP 503; claim em preflight seguido de falha definitiva `connect/email_connect_network`; nenhum aceite SMTP |
| D51-RETRY-DIAG-004 | Payload persistente da linha | PASS estático | mesmos dados do registro, confirmação ambígua falsa, sem job_id e sem criação de job no cliente |
| D51-RETRY-DIAG-005 | Flags após tentativa | BLOCKER | global/e-mail ON/ON, Test Mode ON e allowlist exclusiva; fechar OFF/OFF antes de qualquer diagnóstico ou retry adicional |
| D51-MANUAL-001 | JWT ausente e tenant admin | PASS contratual | autenticação e `is_platform_superadmin` permanecem anteriores ao modo de entrega |
| D51-MANUAL-002 | Modo inválido ou senha temporária | PASS | allowlist `email|manual_link`; manual exige `modo_acesso=link` |
| D51-MANUAL-003 | Pendente/falho reutiliza job e conta | PASS | mesma RPC de claim, identidade e tenant; sem job/user/profile/role paralelo |
| D51-MANUAL-004 | Ativo/concluído | PASS | backend retorna conflito e UI não oferece a ação |
| D51-MANUAL-005 | Independência de SMTP | PASS | modo manual não carrega runtime, não chama claim de e-mail nem `deliverInviteEmail`/`sendEmail` |
| D51-MANUAL-006 | Estado do e-mail preservado | PASS contratual | sobrecarga manual não acessa RPC de entrega; tentativa/status de e-mail não são alterados |
| D51-MANUAL-007 | Redirect canônico | PASS | mesma política server-side fixa em `/reset-password`, independente de Origin |
| D51-MANUAL-008 | Resposta e cache | PASS | `manual_link` existe só na resposta manual e usa `no-store, private`; resposta e-mail permanece sem link |
| D51-MANUAL-009 | Auditoria sem segredo | PASS | evento no log existente contém ator/job/organização/origem/outcome/motivo, sem URL/token/hash/query/fragmento |
| D51-MANUAL-010 | UI Administradores | PASS | confirmação, ação elegível, aviso ambíguo, trava e cópia segura cobertos |
| D51-MANUAL-011 | UI Nova Empresa | PASS | fallback após empresa pronta/falha SMTP usa o mesmo componente/hook sem recriar empresa |
| D51-MANUAL-012 | Memória do navegador | PASS | link não é exibido por padrão nem gravado em local/session storage ou IndexedDB; fechar/desmontar limpa o estado React |
| D51-MANUAL-013 | Testes e qualidade | PASS | 50 focados, 5 Deno, typecheck, build automático e 5.414 globais/4 skipped |
| D51-MANUAL-014 | Scanner e linter | PASS com baseline | scanner 10 Info/zero P0/P1; linter 492 preexistentes; auditoria RBAC autenticada NOT RUN sem credencial |
| D51-MANUAL-015 | Deploy/publicação/smoke | PASS técnico | Edge implantada, frontend publicado uma vez e smoke passivo sem link real ou e-mail |

## Gate

Fase 0: **PASS**. E01: **PASS**. O PASS SMTPi de `2026-10-03` é histórico e não certifica a conectividade atual. `SMTP SEND CONTROLLED = PASS` histórico (`id=28`, recebido na caixa controlada). `SESSION REVOCATION = PASS`. `D51.2 UX REENVIO PERSISTENTE = PASS`. A tentativa humana de `2026-10-05T15:24:52Z` reutilizou o mesmo job, mas falhou definitivamente em `connect/email_connect_network`; job 3/3, sem leases. Novo retry E02: **BLOCKED** até fechar OFF/OFF e obter novo PASS SMTPi sem envio. Fases 2–15: **NOT RUN**.
| D51-FIRST-ACCESS-DIAG-001 | Unicidade e vínculo do usuário controlado | PASS read-only | 1 Auth, 1 profile ativo em `8f57c7dd…4626`, 1 papel `administrador`, zero `superadmin`; job único `22c70f4f…fbc1` ativo/concluído e no mesmo tenant |
| D51-FIRST-ACCESS-DIAG-002 | Estado atual de primeiro acesso | PASS read-only | `senha_provisoria=false`, zero estado provisório, `platform_first_access_pending=false`, zero sessões e refresh tokens |
| D51-FIRST-ACCESS-DIAG-003 | Causa da dupla definição de senha | BUG confirmado | `/reset-password` usa `auth.updateUser` + `signOut` sem concluir a pendência; `AppLayout` força `TrocaSenhaObrigatoria`, que chama `platform-complete-first-access` e somente então limpa o estado server-side |
| D51-FIRST-ACCESS-DIAG-004 | Papel após conclusão | PASS | papel único `administrador` é tenant-operacional; `superadmin` é distinto e ausente; destino esperado é `/dashboard/geral` |
| D51-FIRST-ACCESS-DIAG-005 | Isolamento tenant do dashboard geral | NO-GO | `profile.organization_id` existe, mas as RPCs `SECURITY DEFINER` e `is_executivo` não usam organização/tenant; agregações e políticas administrativas são globais por papel em banco com 5 organizações |
| D51.3-A-001 | Recovery com pendência | PASS | usa somente `platform-complete-first-access`; zero `auth.updateUser` direto e sign-out após sucesso |
| D51.3-A-002 | Recovery comum | PASS | diagnóstico falso mantém `auth.updateUser` e não chama conclusão de primeiro acesso |
| D51.3-A-003 | Diagnóstico/finalizador falha | PASS | alteração e sign-out bloqueados; mensagem sanitizada; fragmento continua removido |
| D51.3-B-001 | Inventário da Visão Geral | PASS | apenas duas RPCs; nenhuma query direta da página; fontes operacionais sem FK tenant determinística |
| D51.3-C-001 | Helper de organização | PASS | `auth.uid()`, profile ativo/org não nula, `search_path=''`; sem EXECUTE para PUBLIC/anon/authenticated |
| D51.3-D-001 | RPCs SECURITY DEFINER | PASS contenção | exigem organização e papel server-side; não aceitam organização do cliente; fontes sem ownership retornam indisponíveis |
| D51.3-D-002 | Superadmin sem vínculo operacional | PASS contratual | helper nega profile sem organização e RPC não concede visão global implícita |
| D51.3-E-001 | REST das fontes legadas | DÍVIDA BLOQUEADA | não ampliado nem alegado seguro; links detalhados fora da Visão Geral exigem auditoria tenant própria |
| D51.3-F-001 | Backfill legado | NOT RUN seguro | nenhuma associação determinística encontrada; nenhum dado foi inventado ou alterado |
| D51.3-G-001 | Isolamento A/B das RPCs | PASS estrutural | três organizações com admins ativos; RPCs não leem fontes operacionais e filtros cliente/fazenda são negados |
| D51.3-G-002 | Teste A/B autenticado com fixtures | NOT RUN | não foram criados Auth users/fixtures permanentes; contenção foi comprovada pela definição SQL e negativas sem execução pública |
| D51.3-H-001 | Índices | PASS | `profiles_organization_id_idx` já existe; nenhuma consulta tenant operacional foi habilitada para justificar novos índices |
| D51.3-I-001 | Rollback/forward-fix | DOCUMENTADO | restauração só após ownership tenant; reativação indicador a indicador com vínculo, RLS, índice e teste A/B |
| D51.3-I-002 | Qualidade global | PASS | 28 focados, 5.420 globais/4 skipped, typecheck e build verdes; scanner 10 Info/zero P0/P1 |
| D51.3-I-003 | Linter Supabase | PASS com baseline | 492 achados preexistentes; nenhum novo achado atribuído às migrations D51.3 |
| D51.3-I-004 | Smoke passivo recovery | PASS | `/reset-password` sem link exibe negativa segura, zero campo de senha e zero erro de página; nenhuma mutação |
