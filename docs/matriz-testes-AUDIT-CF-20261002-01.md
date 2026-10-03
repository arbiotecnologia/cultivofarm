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

## Diagnóstico SMTP — integração da tela de plataforma

| Caso | Cenário | Resultado | Evidência |
|---|---|---|---|
| SMTP-UI-001 | Componente real da aba Comunicação em `/plataforma` | PASS | `PlataformaHome` importa e renderiza a instância única de `ComunicacaoConfigTab` |
| SMTP-UI-002 | Visibilidade das duas etapas | PASS | diagnóstico não depende mais de `smtp.password_configured`; os dois passos permanecem visíveis |
| SMTP-UI-003 | Conexão com entrega global/e-mail OFF | PASS contratual | habilitação usa somente a configuração técnica sanitizada; flags de entrega não integram o gate visual de conexão |
| SMTP-UI-004 | Envio com entrega OFF | PASS contratual | botão permanece desabilitado por `ready_for_controlled_test` e mostra motivo |
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
| SMTP-FINAL-003 | Paridade dos indicadores de senha | FAIL apresentação | `smtp.password_configured` compara UUID com `true` e retorna falso; readiness usa presença do UUID e retorna verdadeiro |
| SMTP-FINAL-004 | Configuração sanitizada canônica | PASS read-only | porta 465; host/usuário/remetente/referência Vault presentes; segredo resolvido no runtime; fonte DB; flags OFF/OFF; Test Mode ON |
| SMTP-FINAL-005 | Última tentativa classificada | FAIL controlado | `2026-10-03T16:20:46.740215Z`; `connect/smtp_tcp_refused`; 14 ms; antes de greeting/EHLO/AUTH |
| SMTP-FINAL-006 | Ausência de envio posterior | PASS read-only | zero `smtp_send_test`, tentativa/aceite de convite, outbox criada/enviada e alteração de configuração após a captura |
| SMTP-FINAL-007 | Compatibilidade do provedor | PASS documental | KingHost suporta SSL/TLS na porta 465; documentação exige SMTPi para origem externa ao Brasil; nenhuma configuração alterada |
| SMTP-FINAL-008 | Novo probe, envio ou correção operacional | NOT RUN | proibidos nesta rodada; somente leitura e documentação factual |

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

## Gate

Fase 0: **PASS**. E01: **PASS**. E02: **FAIL no SMTP (`email_unknown_error`)** após Auth/profile/papel concluídos. A porta efetiva é 465, portanto a restrição 25/587 não é causa comprovada do E02; o erro legado continua ambíguo. Forward-fix aplicado no código; janela SMTP **OFF/OFF** e **RETRY BLOCKED** até confirmação humana explícita de não recebimento. Fases 2–15: **NOT RUN**.
