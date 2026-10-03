# Auditoria mestre — AUDIT-CF-20261002-01

## Estado executivo

- Projeto canônico: `swzpzcwiasxmjutrmvkm`.
- P0 PWA: **PASS após migração definitiva**. A campanha pode ser retomada exclusivamente no ponto E02 SMTP, que mantém seus próprios bloqueios de confirmação e autorização.
- Fase 0: **PASS com riscos P2/P3 registrados**.
- Fase 1 / E01: **PASS**; E02: **FAIL no SMTP**, sem retry autorizado até corrigir a observabilidade do erro desconhecido.
- O antigo NO-GO baseado na impossibilidade de prefixar a razão social foi reclassificado: a razão oficial deve permanecer íntegra; a identificação segura da fixture será feita em `nome_fantasia`.
- Após o E01 humano, a auditoria abriu somente a janela SMTP global/e-mail pelo mecanismo auditável; nenhum convite, usuário ou envio foi criado.
- Leaked Password Protection: risco temporariamente aceito, aberto e não homologado.

### Correção de visibilidade do diagnóstico SMTP em `/plataforma`

A investigação confirmou que `/plataforma` já renderizava o componente global único `ComunicacaoConfigTab`; não havia segunda implementação nem necessidade de nova tela. O pacote oficial também continha os textos das duas etapas. A causa foi uma condição visual no próprio componente: todo o diagnóstico era renderizado somente quando `smtp.password_configured` era verdadeiro. Isso permitia que a aba carregasse normalmente, mas ocultasse tanto **Testar conexão do provedor** quanto **Enviar teste** conforme a resposta sanitizada recebida pela sessão.

O bloco foi movido para uma seção própria, sempre visível na aba Comunicação. O passo de conexão permanece independente das flags global/e-mail e só habilita quando a configuração técnica sanitizada está completa; o envio continua bloqueado pela prontidão integral e exibe o motivo. Nenhuma chamada SMTP, envio, mutação de dados ou alteração de permissões foi incluída. A ausência de aviso de versão é compatível com uma página que já carregou o mesmo token principal publicado; além disso, um bundle anterior ao detector não teria código capaz de avisar sobre sua própria substituição. O harness vigente comprova que uma versão atual detecta um token futuro via HTML `no-store`, mostra o aviso e não navega sem clique explícito.

### P0.1 — build ID explícito por publicação

A causa complementar foi confirmada no detector: ele comparava somente o hash do primeiro módulo do HTML. Uma publicação que alterasse apenas módulos internos poderia conservar esse arquivo de entrada e não gerar aviso. O build de produção agora injeta `meta[name="cultivo-build-id"]` com SHA público de publicação/commit quando disponível ou, como fallback, um timestamp único criado uma vez por processo de build. Nenhum segredo integra esse valor.

O detector prioriza o build ID tanto na página carregada quanto no HTML consultado com `no-store`; páginas antigas continuam usando o hash do módulo principal. Uma sessão antiga por hash reconhece HTML novo com meta e oferece o aviso. Diferenças somente mudam o estado para aviso ou badge: **Adiar**, `visibilitychange` e `online` não navegam; **Atualizar agora** permanece o único caminho de navegação e continua limitado a uma tentativa explícita.

### P0.2 — controle manual e visível após login

O detector passou a oferecer inspeção sanitizada com estados `update_available`, `current`, `offline` e `error`, preservando a API booleana anterior. Um único controle global, montado dentro do `AuthProvider`, aparece somente para usuários autenticados quando não existe atualização pendente; o clique informa versão atual, indisponibilidade de rede ou falha sem navegar. O login dispara uma verificação silenciosa única por sessão e o scheduler global passou de 60 para 10 minutos. Aviso, badge, retorno à aba e reconexão continuam apenas detectando; **Atualizar agora** permanece a única ação que navega.

Validação: **39/39 testes PWA focados**, typecheck e build PASS; suíte global **5.390 PASS / 4 skipped**; scanner com **10 Info e zero P0/P1**. Após publicação somente do frontend, o domínio oficial respondeu HTTP 200 com build `build-musmjimn`; o módulo oficial contém o botão, `aria-label` e as três mensagens de resultado. O smoke foi passivo, sem clicar em **Atualizar agora**. A presença visual em sessão autenticada não foi declarada como teste de navegador porque não havia sessão disponível no smoke.

Reauditoria final em `2026-10-03T16:48Z`: os **39 testes PWA focados**, typecheck, build e a suíte global (**5.390 PASS / 4 skipped**) passaram novamente; scanner permaneceu em **10 Info e zero P0/P1**. Smoke passivo confirmou HTTP 200, build oficial `build-musmjimn` e todos os marcadores do controle. Nenhuma navegação, recarga, atualização ou ação SMTP foi disparada. A autenticação externa não oferece sessão automatizada ao ambiente de auditoria; portanto, a comprovação visual pós-login continua explicitamente pendente de conferência humana, sem inventar PASS de navegador. O SMTP retorna ao estado anterior: sem novo probe, aguardando confirmação do SMTPi/endpoint KingHost antes de qualquer alteração operacional.

Validação: **32/32 testes focados PASS**, incluindo meta igual/diferente, mudança apenas de módulo interno, HTML e sessão legados, Adiar, navegação explícita única, eventos de detecção, limpeza legada, push e diagnóstico SMTP em `/plataforma`; typecheck e build PASS; suíte global **5.379 PASS/4 skipped**; scanner **10 Info e zero Critical/Error/Warning**. A única publicação autorizada foi concluída. O HTML oficial contém `cultivo-build-id`; o entry contém o detector `no-store`; o pacote da plataforma contém **Testar conexão do provedor**; smoke anônimo redirecionou `/plataforma` para `/auth` com URL estável após carga, zero overlay e zero erro. A visibilidade autenticada do botão já havia sido comprovada no pacote e na correção anterior; nenhum botão foi clicado e nenhuma conexão ou mensagem SMTP foi executada.

### Ajuste de layout e diagnóstico read-only do probe SMTP

O diagnóstico foi incorporado ao próprio card **Provedor de e-mail (SMTP)**, imediatamente após os campos e a ação de salvar. O mesmo estado e a mesma Edge Function foram preservados: não há formulário, hook ou endpoint duplicado. A subseção **Testar conexão do provedor** explica que valida rede, TLS, protocolo e autenticação sem mensagem, funciona com entrega global/e-mail OFF quando a configuração técnica está completa, bloqueia cliques concorrentes e anuncia o resultado compacto por `aria-live`. A subseção **Enviar e-mail de teste** mantém o destinatário fixo, explicita que é envio real, exige confirmação e informa o motivo fail-closed enquanto a readiness integral não estiver verde.

A última tentativa real ocorreu em `2026-10-03T13:44:53Z`, modo `connection`, HTTP **502**, `stage=connect`, `safe_code=smtp_tls_failed`, latência **13 ms**, TLS **false** e autenticação **false** no resultado. Edge log, gateway e auditoria convergem no mesmo evento; o gateway mediu 4.543 ms incluindo inicialização/chamada, enquanto os 13 ms pertencem ao helper. A configuração runtime read-only estava estruturalmente completa, senha presente por booleano, porta **465** e flags global/e-mail **OFF/OFF**. Nenhum host, usuário, senha ou remetente foi lido/exposto.

No helper, `smtp_tls_failed/connect` é produzido exclusivamente quando `Deno.connectTls` da porta 465 rejeita antes do greeting 220. Portanto estão excluídos como estágio observado: greeting, EHLO, STARTTLS, AUTH, parsing multiline e envio. A latência elimina o timeout interno de 5 s. O código atual agrupa no mesmo resultado seguro rejeição TCP/DNS e falha de handshake/certificado; assim, a causa comprovada é **falha imediata ao abrir o canal TLS implícito**, mas não é possível separar rede, DNS, TCP e certificado com a observabilidade atual. Classificação **P1 operacional do diagnóstico SMTP**, sem impacto de envio porque a janela permanece fechada.

Revisão técnica: limites de 16 KiB/64 linhas, timeout de 5 s por etapa e 20 s absoluto, parsing multiline, AUTH PLAIN/LOGIN somente depois de TLS e fechamento em `finally` estão presentes. Portas permitidas não implícitas usam `Deno.connect` seguido obrigatoriamente por STARTTLS; 25/587 falham antes do socket. `Deno.connectTls`/`Deno.startTls` recebem hostname, permitindo validação do certificado/SNI pelo runtime, mas o código não conserva uma categoria segura específica da exceção nativa.

**Forward-fix implementado:** `smtp-provider-probe-deno.ts` agora traduz erros nativos por nome e padrões internos estritamente limitados para `smtp_dns_failed`, `smtp_tcp_refused`, `smtp_tcp_unreachable`, `smtp_connect_timeout`, `smtp_tls_certificate_failed`, `smtp_tls_handshake_failed` ou fallback `smtp_tls_failed`. A mensagem original é descartada e nunca integra resultado, log ou auditoria. `smtp-provider-probe.ts` preserva a falha segura produzida pelas dependências sem duplicar timeouts; o timeout absoluto lê a etapa atual e encerra o socket pendente; porta 465 continua em `connectTls` com hostname/SNI, e STARTTLS preserva seu estágio. Greeting, EHLO, AUTH e envio não mudaram.

A RPC de auditoria recebeu apenas a allowlist adicional, mantendo `SECURITY DEFINER`, `search_path`, validação de Superadmin e `EXECUTE` exclusivo de `service_role`; RLS/grants não foram ampliados. A UI ganhou mensagens amigáveis no mesmo card SMTP, sem host, usuário, segredo ou erro bruto. Rollback: reverter o classificador e a allowlist mantendo o fallback anterior; forward-fix alternativo: adapter HTTP oficial se o transporte SMTP continuar incompatível. O envio de teste só pode ser liberado após probe PASS e readiness integral; retry do convite continua bloqueado até autorização humana separada e confirmação auditada.

Validação anterior do layout: **54/54 testes focados PASS**, **4/4 testes Deno do probe PASS**, typecheck PASS, build automático PASS, suíte global **5.379 PASS/4 skipped** e scanner com **10 Info, zero Critical/Error/Warning**. A validação específica do forward-fix está registrada na matriz. Nenhum controle SMTP foi acionado.

### Diagnóstico final somente leitura da captura `smtp_tcp_refused`

O HTML oficial consultado sem cache em `2026-10-03` serve `cultivo-build-id=build-mushy2d3`. Esse fallback temporal corresponde a `2026-10-03T14:37:55.959Z`, 53 segundos após o HEAD local `2c7fecc3d7772128f75c678283d4c06c93ec0d5a` (`2026-10-03T14:37:03Z`). Como o ambiente de publicação não forneceu SHA, o ID não prova criptograficamente o commit, mas o chunk oficial `App-BwrXF4VX.js` contém o classificador novo, as mensagens amigáveis e o gate `connectionConfigReady` exigindo host, porta compatível, usuário, senha e remetente. A captura das `16:20:46Z` pode ter vindo desse build atual; bundle anterior não é necessário para explicar o estado observado.

A inconsistência visual foi localizada no contrato GET, sem mutação: `smtp.password_configured` usava o helper booleano `row[k] === true`, embora `secret_smtp_password` seja UUID; por isso uma referência presente era exibida como **Não configurado**. Já `smtp_readiness.smtp_password_configured` usa presença da referência e ficava verdadeiro, habilitando **Testar conexão** quando os demais campos técnicos estavam completos. A correção mínima implantada adicionou uma verificação separada de presença, usada somente por `smtp.password_configured`, `whatsapp.access_token_configured`, `webhook.app_secret_configured` e `webhook.verify_token_configured`; o helper das flags booleanas permaneceu inalterado. Nenhum valor ou resolução Vault integra a resposta. SMTP e readiness agora mantêm paridade para a mesma linha. A linha canônica confirma porta **465**, host/usuário/remetente configurados, referência Vault presente, entrega global/e-mail **OFF/OFF** e Test Mode **ON**. O segredo efetivo também estava resolvido no runtime: a linha singleton torna a fonte **DB**, e `getSmtpConfigError` teria encerrado antes do socket se a senha decriptada estivesse ausente; a tentativa chegou a `Deno.connectTls` e recebeu recusa TCP. Portanto **não há evidência de necessidade de redigitar a senha**.

Validação da correção visual: **41/41 testes Vitest focados PASS**, **3/3 testes Deno PASS**, typecheck e build PASS; scanner com **10 Info e zero P0/P1**. Somente a Edge Function `communication-provider-settings` foi implantada. O smoke GET sem identidade retornou **401**, confirmando o gate. Como o projeto Supabase externo não disponibilizou sessão Superadmin ao harness, o GET autenticado não foi forçado com `service_role`, que permanece proibido como token de caller. Não houve probe SMTP, envio, leitura/escrita de Vault ou alteração de host, porta, senha, flags, E01/E02, REFIL ou AR BIO.

A última auditoria é `id=20`, `2026-10-03T16:20:46.740215Z`, ação `smtp_connection_test`, outcome `failure`, `safe_code=smtp_tcp_refused`, `stage=connect`, latência **14 ms**. Recusa em `connectTls` ocorre antes de criar conexão utilizável: zero greeting, EHLO e AUTH. O ramo `connection` não chama `sendEmail`; após essa tentativa há zero `smtp_send_test`, zero nova tentativa/aceite de convite, zero outbox criada/enviada e zero alteração de configuração. Nenhum novo probe ou envio foi executado nesta auditoria.

O provedor foi identificado apenas por família sanitizada como **KingHost**, sem registrar o host no relatório. A documentação oficial da KingHost suporta SMTP implícito SSL/TLS na porta **465**, portanto a porta isoladamente não está errada. Porém, a configuração usa a modalidade doméstica; a documentação do provedor orienta ativar e usar **SMTPi** quando o cliente/servidor está fora do Brasil. Como Supabase Edge é uma origem externa, a hipótese principal é restrição regional/SMTPi ou recusa do endpoint doméstico à origem. Em ordem: (1) modalidade/hostname internacional não habilitado para origem externa; (2) firewall/allowlist ou política de origem do provedor; (3) serviço não ouvindo momentaneamente; (4) hostname cadastrado incorreto, menos provável por pertencer à família esperada; (5) bloqueio específico de egress, menos provável porque houve recusa imediata e não timeout. A correção mínima é confirmar no painel/suporte KingHost se SMTPi está ativo e qual hostname oficial se aplica ao plano, sem trocar automaticamente porta ou host. Se o provedor não suportar de forma estável a origem Edge, preferir o adapter HTTPS planejado do SMTP2GO; M1 continua não iniciado.

### P0 PWA — migração definitiva

A evidência real confirmou que um cliente antigo ainda podia exibir uma tela bloqueante e prometer recarga automática. O app-shell Workbox foi removido como mecanismo de versão. O manifesto de instalação permanece estático; `/push-sw.js` é um worker standalone, sem Workbox, precache, claim de clientes ou controle de atualização; `/sw.js` foi substituído por um worker transitório de migração que remove apenas `html-nav`, `static-assets` e caches Workbox/precache identificáveis, e então se desregistra sem navegar ou recarregar clientes.

A aplicação nova também procura e desregistra `/sw.js` no startup, faz a mesma limpeza seletiva e registra somente o push estável. `?sw=off` remove os workers e caches pertinentes sem recarga. A versão publicada passou a ser detectada pelo token do módulo principal no HTML solicitado com `cache: no-store`, no máximo a cada 60 minutos e nos eventos de retorno à aba/online. Detecção apenas abre o aviso; **Adiar** preserva o uso e mantém o badge; somente **Atualizar agora** executa uma navegação explícita, única e protegida contra loop. Falha de chunk também apenas oferece ações manuais.

Validação final: **23/23 testes PWA focados**, typecheck, build e **5.372 testes globais PASS / 4 skipped**. Scanner: **10 Info e zero Critical/Error/Warning**. O pacote gerado contém manifesto, `push-sw.js` e o `/sw.js` de limpeza, sem Workbox gerado e sem os textos/eventos legados. Após publicação somente do frontend, o domínio oficial passou em contexto limpo e com `/sw.js` legado simulado: módulo atual carregado, apenas `/push-sw.js` registrado ao final, zero overlay bloqueante, zero texto legado, zero erro de página e nenhuma mudança de URL. **P0 encerrado; campanha liberada apenas para retomar no E02 SMTP.**

## Regras e escopo

Todo dado persistente da campanha deve conter `HOMOLOGAÇÃO AUDIT-CF-20261002-01` ou motivo equivalente em campo seguro já existente. Para E01, `razao_social` e CNPJ permanecem oficiais e somente leitura; `nome_fantasia` recebe `HOMOLOGAÇÃO AUDIT-CF-20261002-01 - <nome fantasia oficial>`, truncado com segurança em 200 caracteres. O único CNPJ autorizado é `36.736.180/0001-11`; o contato corporativo é `renato@refilinformatica.com.br`; o único destinatário de convite autorizado é `teste@refilinformatica.com.br`. Tokens, links de ação e segredos não integram as evidências.

## Fase 0 — inventário e baseline

### Inventário reproduzível

| Superfície | Evidência | Classificação |
|---|---:|---|
| Rotas declaradas no frontend | 175 ocorrências de `path=` em `src/App.tsx` | baseline |
| Edge Functions | 40 diretórios com `index.ts`; 39 usam `Deno.serve` | baseline |
| Migrations | 783 arquivos | baseline |
| Testes/specs | 368 arquivos | baseline |
| Tabelas públicas | 239 | baseline |
| Views/materialized views públicas | 26 | baseline |
| Tabelas públicas sem RLS | 0 | PASS |
| Tabelas com RLS e sem policy | 6 no catálogo canônico atual | P2, auditoria dedicada |
| Funções públicas | 853 | baseline |
| `SECURITY DEFINER` | 706; nenhuma sem `search_path` fixado | contexto legado, sem falha de search path |
| Triggers declarados nas migrations | 344 | baseline histórico |
| Policies declaradas nas migrations | 1.021 | baseline histórico |
| Storage | 7 buckets: 6 privados e `logos` público | revisar por domínio |
| Cron | 5 jobs ativos: views materializadas, monitoramentos, alertas operacionais e SLA | baseline |
| Integrações identificadas | SMTP, WhatsApp/Meta, SEFAZ, consulta CNPJ, clima e calendário | baseline; entregas externas continuam fail-closed |

As contagens de migrations, triggers e policies são históricas e podem incluir substituições; não equivalem ao total de objetos ativos.

### Mapa de arquitetura

| Domínio | Frontend | Backend/dados | Autorização | Auditoria/estado |
|---|---|---|---|---|
| Plataforma SaaS | `/plataforma`, `OrganizationOnboardingFlow` | `platform_*`, `organizations`, `saas_*`, subscriptions | Superadmin validado no servidor; RLS/RPC | status da organização e histórico de assinatura |
| Auth e perfis | `AuthProvider`, rotas protegidas | Auth, profiles, user roles | identidade da sessão; sem metadata como autoridade | jobs de provisionamento e auditorias |
| Comunicação | aba global de Comunicação | Edge Functions, provider settings, invite jobs | Superadmin server-side; workers técnicos | status, tentativas, lease/fencing e erros allowlisted |
| Cadastros/catálogo | rotas e hooks de catálogo | tabelas/RPCs de catálogo | guardas de rota, RLS e RPCs | logs técnicos de catálogo |
| Comercial/financeiro/fiscal | páginas e hooks dos módulos | RPCs transacionais e tabelas de domínio | RLS e funções server-side | históricos e logs por domínio |
| Entregas/campo/documentos | páginas de entrega e visitas | RPCs, storage privado e validação pública limitada | vínculo de usuário/tenant; paths permitidos | eventos, comprovantes e trilhas |
| PWA | detector por HTML e notificador manual | manifesto estático; push worker separado; `/sw.js` somente para migração legada | consentimento explícito | build ID explícito/fallback legado e timestamp técnico local |

### Baseline técnico

- Suíte global oficial: **356 arquivos PASS, 1 skipped; 5.371 testes PASS, 4 skipped**.
- Testes focados de segurança e D51.2: **70 PASS**.
- Typecheck: **PASS**.
- Build de produção: **PASS**; 4.669 módulos transformados e PWA gerada. O bundle principal de 5,60 MB gerou alerta de tamanho, classificado P2 de performance.
- ESLint: **FAIL de baseline histórico**, com 3.505 erros e 126 avisos em 543 arquivos, predominantemente `no-explicit-any`; não houve evidência de regressão introduzida pelo hardening focado.
- Scanner profundo: **10 Info, zero Critical/Error/Warning**.
- Linter Supabase: 492 alertas — 17 RLS sem policy, 2 funções `SECURITY DEFINER` executáveis por anônimo, 472 por autenticado e Leaked Password Protection desativada. São alertas contextuais que exigem classificação individual, não autorização para alteração em massa.
- Dependency scan: **inconclusivo**; o scanner não decodificou a origem URL do pacote `xlsx` no `bun.lock`.
- Slow queries: topo de 17.768 ms corresponde a harness histórico de concorrência; a seguinte, de 1.815 ms, também é auditoria com fixtures. Não foi comprovado gargalo funcional de produção nesse recorte.
- O comando genérico `bun test` não é o runner do projeto e tentou carregar specs Playwright fora do ambiente correto; o script oficial `bun run test` passou integralmente.
- Consultas lentas continham principalmente harnesses e auditorias; nenhuma regressão de produção foi comprovada por esse recorte.

### Achados e classificação

| ID | Nível | Achado | Tratamento |
|---|---|---|---|
| CF0-01 | P1 corrigido | Duas funções administrativas de catálogo tinham CORS wildcard e JWT não explícito; uma delas executa limpeza destrutiva. | CORS fail-closed compartilhado, erros sanitizados, `verify_jwt=true` e testes estáticos. Não houve chamada destrutiva. |
| CF0-02 | P2 | `/notificacoes` não tem `RoleGuard` próprio; hooks limitam leituras ao usuário/cliente e não houve exposição comprovada. | Manter para auditoria de RLS/perfis na Fase 3/10. |
| CF0-03 | P2 funcional | `ComunicacaoRouteGuard` considera papel primário, podendo negar usuário multipapel legitimamente autorizado. | Fail-closed; decidir/corrigir no domínio de Comunicação. |
| CF0-04 | P2 legado | Seis tabelas com RLS não têm policy ativa; linter histórico também lista grants executáveis amplos. | Não corrigir em massa; classificar objeto por objeto nas fases de domínio. |
| CF0-05 | P2 operacional | Dezoito Edge Functions não têm bloco `verify_jwt` explícito; incluem workers, cron, harnesses e geração de artefatos. | Não habilitar em massa: classificar invocador e contrato antes de alterar. |
| CF0-06 | P3/aceito | Leaked Password Protection desativada. | Risco temporariamente aceito, não resolvido nem homologado. |
| CF0-07 | P3 | Scanner informa leituras globais autenticadas de catálogos e inserções autenticadas em logs. | Dez achados Info; validar intenção e integridade nas fases correspondentes. |
| CF0-08 | P2 qualidade | ESLint possui 3.505 erros históricos e 126 avisos; typecheck, build e suíte global permanecem verdes. | Tratar incrementalmente por domínio; não realizar refatoração massiva nesta campanha sem isolar regressões. |
| CF0-09 | P2 performance | Bundle principal minificado mede aproximadamente 5,60 MB; Vite também detecta imports estáticos e dinâmicos sobrepostos. | Medir carregamento real e dividir por domínio na Fase 13/14. |
| CF0-10 | P3 cobertura | Não existem módulos Deno de teste para as três Edge Functions D51.2 selecionadas. | Negativas implantadas retornaram 401; adicionar testes Deno quando houver alteração funcional nessas funções. |

Não restou P0/P1 bloqueante após o hardening local e os testes, permitindo iniciar a Fase 1. As duas Edge Functions endurecidas só devem ser implantadas pelo fluxo controlado; nenhuma função ou dado foi acionado nesta auditoria read-only.

## Fase 1 — auditoria canônica pós-E01

### Regra de identificação refinada

O fluxo consulta o CNPJ, fixa um snapshot da razão social oficial e envia essa razão como `_nome` para `platform_create_organization`. A razão social permanece somente leitura. A identificação da campanha foi movida para o `nome_fantasia` editável, sem coluna ou tabela nova. Para não contaminar cadastros normais com uma identidade de auditoria, o marcador será preenchido no E01 humano; o checkpoint E01→E02 permanece intacto.

### Conta temporária de auditoria

Foi localizado o mecanismo oficial Auth Admin já existente em `create-user`, com `email_confirm=true`, mas ele bloqueia explicitamente o papel `superadmin`. A RPC de provisionamento também não pode receber esse papel, e o trigger `guard_superadmin_role_assignment` reserva sua atribuição ao mecanismo interno. Não existe endpoint/RPC oficial dedicado para criar uma conta Superadmin temporária. Como o Supabase é externo/não gerenciado, não há sessão oficial injetável pelo navegador automatizado. Nenhuma conta sintética, senha, perfil ou papel foi criado; não houve bypass por SQL/Auth e não existe cleanup de credencial a executar.

### Resultado canônico pós-E01

| Verificação | Resultado |
|---|---|
| Organização pelo CNPJ autorizado | **1** — `8f57c7dd…4626`, FSF AGROSERVICE PRODUTOS AGRICOLAS E SERVICOS LTDA, `aguardando_ativacao`, ativa, criada/atualizada em `2026-10-02T20:10:49.499027Z` |
| Marcador em `nome_fantasia` | **1** — contém `HOMOLOGAÇÃO AUDIT-CF-20261002-01`; nenhuma outra organização usa o marcador |
| CNPJ/e-mail corporativo | **PASS** — `36.736.180/0001-11` normalizado e `renato@refilinformatica.com.br` |
| Assinatura do alvo | **1** — plano `completo`/Completo, `TRIAL`, início/criação em `2026-10-02T20:10:49.499027Z`; sem segunda assinatura |
| Auditoria de status do alvo | **1** — `NULL→aguardando_ativacao`, motivo `criação pela plataforma`, ator com papel Superadmin, `2026-10-02T20:10:49.499027Z` |
| Convite/job do alvo ou destinatário controlado | **0** |
| Auth user/profile/papel vinculado ao alvo | **0** |
| Leases ativos globais de convite/e-mail | **0** |
| Tentativas de e-mail do destinatário | **0** |
| SMTP global/e-mail antes da preparação | **OFF/OFF** |
| SMTP global/e-mail após preparação auditável | **ON/ON**, readiness controlado `true` |
| Test Mode | **ON** |
| Allowlist | exatamente 1 endereço: `teste@refilinformatica.com.br` |
| Outros canais | WhatsApp, webhook e in-app OFF |
| Negativas sem JWT/JWT inválido | **6/6 PASS**; convite, settings e teste de e-mail retornaram 401 em ambos os casos |

REFIL permanece em `rascunho`, ativa, com assinatura Completo `SUSPENDED` desde `2026-10-02T18:57:42.689286Z`. O job real AR BIO permanece intocado: `1d14f78b…c558`, status `falhou`, uma tentativa, `email_delivery_status=pending`, zero tentativa de e-mail, sem usuário e sem lease. Nenhum destinatário não autorizado foi usado.

### Provas automatizáveis anteriores ao E02

- **228/228 testes focados PASS** em 14 arquivos: checkpoint e bloqueio de duplo clique, retry sem recriar empresa, idempotência/duplicidade por contratos server-side, ACL de RPCs de plataforma, isolamento e features do plano, lease/fencing/cooldown, retomada, falha/crash do provider, redirect allowlist, primeiro acesso e configuração de Comunicação.
- As três negativas implantadas, sem autenticação e com JWT inválido, retornaram 401; não houve mutação.
- Harnesses SQL que exigem identidades reais ou execução transacional com `ROLLBACK` ficaram **NOT RUN** porque esta sessão não possui conexão transacional `PG*`; consultas oficiais são somente leitura. Não foram simulados como PASS: cross-tenant autenticado completo, takeover concorrente real, link usado/expirado e hard-crash Auth↔Postgres ponta a ponta.
- A abertura SMTP foi feita por `rpc_service_apply_provider_settings`, com ator Superadmin do E01 e precondições fail-closed. A auditoria `id=14`, em `2026-10-02T20:28:25.664298Z`, registra somente `delivery_enabled` e `email_delivery_enabled`; segredos e demais campos não foram alterados.
- Pós-abertura: readiness `true`, Test Mode ON, allowlist exclusiva, demais canais OFF, zero leases, zero convite/job/Auth/profile/papel e zero tentativa de e-mail do destinatário.

### Decisão

**E01 PASS; E02 FAIL confirmado.** A chamada humana alcançou a versão implantada 18 da função `platform-invite-org-admin` às `2026-10-02T20:43:10Z–20:43:18Z` e terminou HTTP 503. O pipeline criou exatamente um job `22c70f4f…fbc1`, criou uma conta Auth `cbdc4ef3…d212`, gerou o link internamente, concluiu o finalizer e vinculou exatamente um profile ao tenant correto e exatamente um papel `administrador`, sem `superadmin`. O forward-fix está ativo no banco: a RPC vigente aceita profile com `organization_id IS NULL` ou do mesmo tenant, valida `raw_app_meta_data.provisioning_request_id`, usa a assinatura `(uuid, uuid, uuid)`, `SECURITY DEFINER` e `search_path` vazio.

O estágio que falhou foi o envio SMTP. O job ficou `status=pendente`, `attempt_count=1`, `email_delivery_status=failed`, `email_attempt_count=1`, `email_last_error_code=email_unknown_error`, sem lease ativo, sem aceite local e com cooldown até `2026-10-02T20:48:18.441905Z`. A sequência observada foi: claim 200 → criação Auth 200 → geração de link 200 → finalizer 200 → carga da configuração 200 → claim de e-mail 200 → gravação da falha de e-mail 200 → Edge Function 503. Não houve outbox/receipt nem identificador de mensagem do provedor; o envio usa SMTP direto. Portanto não há prova de aceite pelo provedor nem de entrega na caixa postal.

Classificação factual: **G/outro com ambiguidade de transporte**, não uma falha do finalizer. O adapter converte qualquer exceção SMTP não reconhecida em `email_unknown_error`; sem erro bruto retido de forma segura, não é possível distinguir falha anterior ao aceite remoto de desconexão posterior ao aceite. Assim, uma nova tentativa pode enviar um segundo e-mail. **RETRY BLOCKED** até um forward-fix mínimo registrar fase/categoria sanitizada do SMTP e tratar resultado desconhecido pós-envio como ambíguo, com testes de falha antes/depois do aceite e preservação do cooldown/fencing. Nenhum retry, reenvio, link aberto ou alteração de dados foi feito nesta rodada.

Os subcenários executáveis sem ação humana disponível foram concluídos. E02 falhou no transporte SMTP; recebimento, link usado/expirado ponta a ponta, primeiro acesso e recovery permanecem `NOT RUN`; os harnesses transacionais autenticados também permanecem `NOT RUN`, sem promoção indevida a PASS.

Baselines anteriores permanecem registrados: **5.372 testes globais PASS e 4 skipped**, typecheck/build PASS e scanner com 10 Info/zero Critical/Error/Warning. Nesta rodada, **228/228 testes focados PASS**; a consulta canônica final confirmou 1 organização, 1 assinatura, 1 auditoria, zero convites/Auth users/profiles/roles/tentativas/leases e job AR BIO preservado.

## Rollback e forward-fix

- Dados: o E01 persistente foi criado pelo responsável e permanece como evidência. A janela SMTP pode ser revertida pelo mesmo RPC auditável alterando somente `delivery_enabled` e `email_delivery_enabled` para `false`.
- Hardening das Edge Functions: rollback por reversão dos arquivos e dos blocos de configuração; forward-fix preferencial, caso surja incompatibilidade, mantendo CORS fail-closed, JWT obrigatório e respostas sanitizadas.
- E01: PASS, sem mudança de esquema. E02 permanece bloqueado antes de qualquer retry até correção da classificação/observabilidade SMTP desconhecida.

## Forward-fix E02 — transporte SMTP ambíguo

O forward-fix foi aplicado sem reprocessar o job da campanha. O adapter agora distingue preflight/configuração/conexão/envio/resposta e só considera retry comum quando existe falha definitiva. Timeout, reset ou exceção desconhecida durante `send`, além de falha ao persistir o aceite depois de `send` resolvido, resultam em estado `ambiguous` e código allowlisted. Logs estruturados contêm apenas evento, estágio, código seguro, certeza, referência hash do job e correlation id; e-mail, link, host, usuário, senha, token e corpo não são registrados ou devolvidos.

O bloqueio de retry é server-side e retrocompatível: `email_unknown_error` e os códigos legados sem prova de rejeição SMTP exigem `confirm_ambiguous_email_retry=true`. A confirmação depende de Superadmin validado no servidor, mantém o mesmo job/Auth/profile/papel, respeita cooldown e lease/fencing e cria auditoria em `comunicacao_audit_log`; não há promessa de exactly-once. A UI apresenta **Envio não confirmado**, exige verificação da caixa de entrada e um segundo clique explícito em **Confirmar e reenviar**.

Evidências: migration `20261002205411_56ad85cd-0235-4f93-9314-9b2a1b8931f9`, função `platform-invite-org-admin` implantada, Deno check PASS, typecheck PASS, build PASS, 63 testes focados PASS e suíte global 5.376 PASS/4 skipped. Negativa com JWT inválido retornou 401. O linter manteve a baseline de 492 achados preexistentes, incluindo Leaked Password Protection desativada; as três RPCs alteradas estão com `search_path` vazio, `SECURITY DEFINER`, sem EXECUTE para anon/authenticated e com EXECUTE apenas para `service_role` nas assinaturas novas.

Após o deploy, o job da campanha permaneceu único e intocado: provisionamento 1, SMTP 1, `failed/email_unknown_error`, sem lease de provisionamento ou e-mail. Não houve reenvio, novo job, novo Auth user ou alteração em REFIL/AR BIO.

**Decisão:** E02 continua **FAIL** e o retry continua **BLOCKED** até o responsável confirmar explicitamente o não recebimento. O forward-fix está implantado no backend. A publicação frontend foi solicitada, mas o smoke do domínio Lovable e do domínio oficial ainda encontrou o bundle anterior `index-B6zZZyrG.js`, sem os marcadores novos; portanto a UI publicada permanece **FAIL por propagação/publicação não comprovada**. Fase 2 e D52 não avançam.

## Contenção imediata pós-forward-fix

Em `2026-10-02T21:05:41.611689Z`, a janela SMTP foi fechada pelo mecanismo existente `rpc_service_apply_provider_settings`, com ator Superadmin validado e auditoria `id=15`. A operação alterou exclusivamente `delivery_enabled` e `email_delivery_enabled` para `false`; o registro auditável contém somente esses dois campos.

Pós-condições confirmadas: global/e-mail **OFF/OFF**, Test Mode **ON**, allowlist com exatamente `teste@refilinformatica.com.br`, WhatsApp/in-app/webhook **OFF** e presença da configuração SMTP/Vault preservada sem exposição de valores. O job da campanha permaneceu único em `failed/email_unknown_error`, com tentativas 1/1 e sem leases; o job AR BIO permaneceu com tentativa de provisionamento 1 e zero tentativa de e-mail. Nenhum envio, retry ou reprocessamento ocorreu.

## Complemento — compatibilidade de porta no Supabase Edge Runtime

A configuração canônica e o carregador efetivo usam a porta **465**. Essa constatação não prova suporte do provedor nem conectividade: nenhuma conexão, autenticação ou mensagem de teste foi realizada. Como a porta observada não é 25 nem 587, a restrição do runtime não explica de forma comprovada a falha SMTP original; o estado legado `email_unknown_error` permanece ambíguo e bloqueado.

O forward-fix passou a considerar as portas 25 e 587 incompatíveis com o Supabase Edge Runtime. A prontidão fica falsa com o código seguro `smtp_port_blocked_by_edge_runtime`; teste controlado e convite por link encerram antes de claim, socket ou incremento de tentativa. A porta 465 é aceita somente em nível estrutural. A tela apresenta orientação genérica para usar uma porta permitida suportada pelo provedor ou, se não houver, adotar futuramente uma API HTTP oficial por meio do adapter desacoplado existente, sem presumir provedor ou credenciais.

Validação: **60/60 testes focados** e **5.380 globais PASS/4 skipped**, typecheck e build PASS; scanner com 10 Info e zero Critical/Error/Warning. O runner Deno informou que não existem módulos de teste específicos nessas duas funções, registrado como NOT RUN. As três funções que consomem/exibem a prontidão foram implantadas; negativas com JWT inválido retornaram 401. O domínio oficial serviu o bundle `App-Bdw25M7-.js` com os novos marcadores. A janela continua OFF/OFF, o job factual permanece 1/1 sem lease e nenhum envio/retry ocorreu. Deploy e publicação não autorizam reabertura ou reprocessamento.
## Arquitetura multi-provedor de e-mail — planejamento (sem implementação)

### Decisão arquitetural

O singleton `public.communication_provider_settings (id=1)` é suficiente para a primeira versão. A plataforma possui exatamente um provedor de e-mail ativo por vez, enquanto Test Mode, allowlist e flags de entrega são globais. Uma tabela própria só passa a ser necessária se surgir requisito de múltiplas credenciais por provider/região/tenant, rotação simultânea, roteamento ponderado ou failover automático. Nada disso integra o escopo inicial; normalizar agora aumentaria superfície RLS, migração e risco operacional sem benefício.

### Mapa atual e separação de responsabilidades

- **Configuração global:** `test_mode_enabled`, `allowed_emails`, `allowed_phones`, `delivery_enabled`, `email_delivery_enabled`, flags WhatsApp/in-app/webhook, `updated_at` e `updated_by`.
- **SMTP personalizado:** `smtp_host`, `smtp_port`, `smtp_user`, `smtp_from` e a referência Vault `secret_smtp_password`.
- **Outros canais:** campos e referências Vault do WhatsApp permanecem ortogonais ao provedor de e-mail.
- **Carga runtime:** `rpc_service_load_provider_runtime_config` resolve referências Vault apenas para `service_role`; `runtime-config.ts` aplica precedência DB→env→fail-closed e mantém segredos somente em memória.
- **Configuração administrativa:** `communication-provider-settings` exige JWT e Superadmin server-side, aplica rate limit, modela payload allowlisted e grava atomicamente por `rpc_service_apply_provider_settings`; GET devolve somente configuração não secreta, máscaras e booleanos de presença.
- **Auditoria:** `communication_provider_settings_audit` registra ator, ação, campos alterados e slot lógico de segredo, nunca valor. Diagnósticos reutilizam a mesma tabela com outcome/código/estágio/latência sanitizados.
- **Consumo canônico atual:** outbox, teste controlado e convite chamam diretamente `sendEmail`; `invite-email-delivery` envolve o efeito externo com intenção, lease/fencing, persistência de aceite e estado ambíguo. O ponto comum de transporte existe, mas ainda é um adapter SMTP concreto, não um dispatcher por provider.
- **Exceções legadas encontradas:** `enviar-alertas-notificacoes` e `enviar-alertas-resumo` instanciam cliente SMTP próprio e leem `SMTP_*` do ambiente, sem singleton/Vault/runtime-config. A atividade produtiva dessas funções não foi comprovada nesta rodada; ainda assim, são desvio arquitetural e devem ser migradas ou formalmente desativadas antes de afirmar dispatcher único.
- **Referências sem implementação local:** `enviar-pdf-aplicacao` e `enviar-pdf-visita` invocam `send-transactional-email`, função ausente no repositório auditado. Não se afirma que o envio esteja operacional; M8 deve reconciliar esse contrato sem criar uma terceira via.
- **Recovery:** o link de recovery do convite é gerado server-side e entregue pelo mesmo caminho do convite. Qualquer recovery gerenciado diretamente pelo Auth precisa ser inventariado antes de M8 e não deve ser alegado como migrado sem prova.

### Extensão recomendada do singleton

Migration futura aditiva, versionada, idempotente e reversível:

- `active_email_provider text NOT NULL DEFAULT 'custom_smtp'`, validado por allowlist imutável `custom_smtp|smtp2go_api` no RPC/trigger de validação;
- preservar integralmente todos os `smtp_*` e `secret_smtp_password`;
- `smtp2go_api_base text NULL`, aceitando somente endpoints oficiais explicitamente allowlisted; preferir valor canônico server-side e persistir apenas quando região/base configurável for realmente necessária;
- `smtp2go_sender_email text NULL` e `smtp2go_sender_name text NULL`; não reutilizar `smtp_from`, pois endereço/nome da API têm semântica própria e a preservação independente simplifica rollback;
- `secret_smtp2go_api_key uuid NULL`, referência ao Vault no mesmo mecanismo atômico existente;
- metadados sanitizados de último teste por provider: provider, timestamp, resultado/código seguro e, se necessário ao gate de ativação, identidade/hash da configuração testada. Não guardar resposta bruta;
- a visão administrativa sanitizada expõe `smtp2go_api_key_configured` e readiness/status por provider, nunca chave ou cabeçalhos.

O default `custom_smtp` preserva comportamento. Novas colunas nullable não alteram a configuração existente. Rollback funcional troca apenas `active_email_provider` para o anterior; rollback de schema deve ocorrer somente após remover referências e nunca apagar configurações/segredos. A migration não deve tocar flags, E01/E02 ou jobs.

### Contrato único e dispatcher

Planejar um contrato `EmailProviderAdapter` com:

- `providerKey`;
- `capabilities` (connection test, provider id, idempotency remota conhecida, regiões suportadas);
- `validateConfig(runtime): ProviderReadiness`;
- `testConnection(runtime, deps): Promise<ConnectionResult>`;
- `sendEmail(runtime, message, context, deps): Promise<AdapterResult>`;
- `normalizeError(error, stage): AdapterResult`.

`CustomSmtpAdapter` encapsula o comportamento atual sem mudança funcional. `Smtp2GoApiAdapter` usa somente HTTPS. Um `dispatchEmailProvider(runtime)` seleciona estritamente pela allowlist; provider ausente/desconhecido falha fechado. Outbox, convite e `test-communication-email` chamam somente o dispatcher. Gates globais de entrega, Test Mode, allowlist, limites de conteúdo/header injection e política de ambiguidade ficam antes/depois do provider, em camada comum, para evitar divergência entre implementações.

### SMTP2GO por API HTTP

- envio por `POST /v3/email/send`, com `X-Smtp2go-Api-Key` somente no servidor;
- allowlist oficial inicial de bases: `https://api.smtp2go.com/v3`, `https://us-api.smtp2go.com/v3`, `https://eu-api.smtp2go.com/v3` e `https://au-api.smtp2go.com/v3`; HTTPS obrigatório, sem redirect para origem não allowlisted;
- remetente precisa estar verificado/autorizado no provider; tentativa com sender não verificado é rejeitada;
- teste sem envio usa `POST /v3/api_keys/permissions`: a documentação o declara disponível a todas as API keys e ele retorna endpoints permitidos, sem criar mensagem. Seu uso como health check é uma inferência arquitetural segura, não um endpoint oficialmente nomeado “validate key”; a permissão `/email/send` deve estar presente para PASS;
- resposta pública limitada a `ok`, `code`, `stage`, `tls`, `authenticated`, `latency_ms`;
- códigos allowlisted: `smtp2go_connection_ok`, `smtp2go_auth_failed`, `smtp2go_permission_denied`, `smtp2go_rate_limited`, `smtp2go_unavailable`, `smtp2go_network_error`, `smtp2go_config_invalid`;
- no envio, HTTP 200 é insuficiente: validar `data.failed`, `data.failures`, `data.succeeded` e `data.email_id`/`schedule_id` conforme o contrato oficial. Só então marcar aceite do provider; nunca declarar entrega na caixa postal;
- manter `fastaccept=false` na primeira versão: a documentação informa que `failed`/`failures`/`succeeded` podem não existir com `fastaccept=true`, o que enfraquece a certeza necessária ao gate;
- persistir `email_id` (ou `schedule_id`, se agendamento vier a ser autorizado) somente após validação de formato/tamanho e se útil à reconciliação; `request_id` pode servir à correlação operacional sanitizada, sem corpo/headers;
- idempotência local antes da chamada, timeout e retry controlado. Resultado sem rejeição inequívoca continua ambíguo e bloqueia retry automático; não há promessa de exactly-once.

### Troca manual segura e UX

No card único **Provedor de e-mail**, exibir seletor **SMTP personalizado | SMTP2GO**, apenas os campos do selecionado e status independente **Configurado / Testado / Ativo / Erro**. A configuração do provider inativo permanece preservada. **Testar conexão** e **Enviar e-mail de teste** usam o provider selecionado, sem duplicar estado, hook ou Edge Function. Test Mode, allowlist e flags continuam únicos.

Ativação exige configuração completa, teste PASS recente (TTL inicial recomendado: 30 minutos), correspondência entre o snapshot/hash testado e a configuração atual, confirmação explícita e motivo obrigatório. A RPC deve bloquear troca concorrente com lock do singleton, auditar `old_provider/new_provider`, motivo, ator e timestamp, e não habilitar `delivery_enabled` nem `email_delivery_enabled`. Troca e alteração da configuração invalidam o teste anterior. Rollback é a mesma operação manual auditada para o provider anterior, desde que ele continue configurado e tenha teste recente válido. Não implementar failover automático: um resultado ambíguo no provider anterior pode duplicar a mensagem.

### Segurança e riscos

- Somente Superadmin validado por `is_platform_superadmin` configura, testa ou troca; tenant admin recebe 403 e não vê configuração global.
- Vault continua sendo o único repositório da API key; browser, respostas, logs e auditoria recebem apenas booleano de presença/códigos seguros.
- CORS permanece restrito às origens confiáveis; `verify_jwt=true`; rate limits distintos para configuração, connection test e send test.
- A RPC de mutação continua service-role-only, com payload/slots allowlisted, lock e auditoria atômica.
- Risco principal: quebra de consumidores por seleção parcial. Mitigação: M1 introduz tipos/default sem alterar dispatch; M2 move SMTP atual e exige regressão integral antes de M3.
- Risco de bypass do provider ativo: dois emissores legados usam SMTP por ambiente e dois fluxos de PDF apontam para função ausente. Mitigação: inventário de acionamento e convergência ao dispatcher em M8, antes da homologação multi-provedor; nenhum secret legado deve ser copiado ao browser ou ao banco.
- Risco de falsa saúde: teste antigo aplicado a configuração nova. Mitigação: vincular PASS ao provider e hash/snapshot sanitizado da configuração.
- Risco de duplicação: timeout/5xx/resposta inválida após aceite. Mitigação: estado ambíguo, confirmação humana e ausência de failover/retry automático.
- Risco de endpoint malicioso/SSRF: base livre. Mitigação: allowlist fechada de origins oficiais e redirects desabilitados ou revalidados.
- Rate limiting: preservar limite local separado e tratar HTTP 429 com backoff; o SMTP2GO também pode limitar por API key, conta/plano e IP, sem taxa global fixa documentada para todos os endpoints.

**Fontes oficiais consultadas (2026-10-03):** [Send Standard Email](https://developers.smtp2go.com/reference/send-standard-email), [General API Resources](https://developers.smtp2go.com/reference/general-api-resources), [Authentication](https://developers.smtp2go.com/reference/authentication), [View API Key Permissions](https://developers.smtp2go.com/reference/view-api-key-permissions), [Response Codes](https://developers.smtp2go.com/docs/response-codes), [Rate Limiting](https://developers.smtp2go.com/docs/rate-limiting) e [Getting Started / Verified Senders](https://developers.smtp2go.com/docs/getting-started). Não houve chamada autenticada ao SMTP2GO.

### Ordem segura de implementação futura

1. **M1:** migration aditiva + tipos/contrato/dispatcher com default `custom_smtp`, sem trocar provider ativo.
2. **M2:** `CustomSmtpAdapter` por trás do dispatcher; regressão byte/semântica dos resultados e consumidores.
3. **M3:** `Smtp2GoApiAdapter`, normalização e connection test somente com mocks/fixtures oficiais.
4. **M4:** UI do seletor/configuração/status, confirmação/motivo e preservação das duas configs.
5. **M5:** um teste real connection-only SMTP2GO, por Superadmin, sem mensagem e com flags OFF/OFF.
6. **M6:** um envio real controlado somente para `teste@refilinformatica.com.br`, com readiness integral e autorização separada.
7. **M7:** troca/failover exclusivamente manual e auditável; nenhum failover automático.
8. **M8:** migrar ou desativar formalmente os dois emissores SMTP legados; reconciliar `send-transactional-email`; provar convite, recovery, PDFs, alertas e Comunicação pelo dispatcher único; documentar e decidir homologação.

### Critérios de aceite e rollback

Cada marco para no primeiro P0/P1, vazamento, destino não autorizado, ambiguidade não tratada ou necessidade humana. M1/M2 só avançam se `custom_smtp` mantiver contratos, gates e histórico. M3/M4 não fazem rede real. M5 não envia mensagem. M6 não significa entrega, apenas aceite remoto comprovado. M7 não pode ligar flags. M8 exige prova de que não resta chamada direta ao SMTP fora do adapter, nenhuma referência órfã a emissor e que convite/recovery/PDFs/alertas/notificações compartilham dispatcher, idempotência e estados ambíguos.

Rollback por fase: reverter UI/dispatcher para `custom_smtp`; manter colunas e referências de segredo intactas; selecionar manualmente o provider anterior por RPC auditada; jamais apagar configuração durante rollback. Forward-fix é preferível a down migration destrutiva.

## Forward-fix SMTPi KingHost — 2026-10-03

- Implementada rota candidata estritamente server-side para `smtp.kinghost.net → smtpi.kinghost.net` e `smtp.uni5.net → smtpi.uni5.net`, somente na porta 465. O cliente envia apenas `kinghost_smtpi`; host arbitrário é rejeitado.
- O probe usa clone efêmero da configuração atual e o adapter de conexão existente, sem `MAIL FROM`, `RCPT TO` ou `DATA`, sem persistir o candidato e sem retornar host, usuário ou segredo.
- Auditoria usa a ação allowlisted `smtp_connection_candidate_test`, com resultado, safe code, etapa e latência sanitizados. A RPC mantém `SECURITY DEFINER`, `search_path` fixo e execução exclusiva por `service_role`.
- A UI mostra **Testar SMTPi** somente para configuração KingHost doméstica aplicável cuja última tentativa normal foi `smtp_tcp_refused`. Apenas um PASS na sessão revela **Usar SMTPi como servidor**; a confirmação aplica payload contendo exclusivamente `smtp.host`, preservando porta, usuário, remetente, senha e flags, e invalida o resultado anterior.
- Validação: Deno check verde nas duas funções; 10 testes Deno, 54 testes focados, typecheck, build e suíte global com 5.394 PASS/4 skipped; scanner com 10 informativos e zero P0/P1. As duas Edge Functions foram implantadas e o frontend foi publicado.
- Smoke foi passivo: domínio oficial HTTP 200 e chamadas com JWT inválido retornaram 401 antes de runtime/rate limit/socket. Não houve probe real, envio, alteração de host, abertura de flags ou retry E02.
- Rollback/forward-fix: remover o bloco candidato e a action adicional não exige tocar configuração ou segredo; caso o host seja aplicado futuramente por clique e precise ser revertido, usar o mesmo endpoint autenticado para restaurar explicitamente o host anterior, sem alterar os demais campos. SMTP2GO permanece planejado e M1 não foi iniciado.
