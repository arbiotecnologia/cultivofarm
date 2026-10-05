# Auditoria mestre — AUDIT-CF-20261002-01

## Estado executivo

- Projeto canônico: `swzpzcwiasxmjutrmvkm`.
- P0 PWA: **PASS após migração definitiva**. A campanha pode ser retomada exclusivamente no ponto E02 SMTP, que mantém seus próprios bloqueios de confirmação e autorização.
- Fase 0: **PASS com riscos P2/P3 registrados**.
- Fase 1 / E01: **PASS**; E02: **FAIL no SMTP**, sem retry autorizado até corrigir a observabilidade do erro desconhecido.
- O antigo NO-GO baseado na impossibilidade de prefixar a razão social foi reclassificado: a razão oficial deve permanecer íntegra; a identificação segura da fixture será feita em `nome_fantasia`.
- Após o E01 humano, a auditoria abriu somente a janela SMTP global/e-mail pelo mecanismo auditável; nenhum convite, usuário ou envio foi criado.
- Leaked Password Protection: risco temporariamente aceito, aberto e não homologado.

### D51.3.1 — refinamento UX do papel Administrador

O papel operacional interno permanece persistido como `administrador`, com os mesmos acessos e a mesma home. Seu rótulo centralizado passou de **Administrador** para **Administrador da empresa**, refletido em perfil, cadastro, edição, filtros e listagens de usuários. O seletor técnico de perfil no módulo Comunicação preserva `value="administrador"` e exibe o novo nome. A lista de provisionamento da plataforma também explicita que os registros são administradores da empresa. **Superadmin de Plataforma** permaneceu distinto; nenhuma rota, `ACCESS_MAP`, `getHomeForRole`, permissão, RLS ou objeto de banco foi alterado.

### D51.5 — isolamento horizontal multi-tenant

Os bloqueios P0/P1 de Financeiro, Storage, catálogo global, Portal, Produção e Fiscal foram contidos no Supabase canônico. Dezenove tabelas alcançáveis passaram a exigir `organization_id` igual ao tenant derivado de `auth.uid()` por policy restritiva e trigger; legado sem ownership determinístico permanece fail-closed. Treze RPCs financeiras elevadas foram bloqueadas para usuários autenticados até serem reescritas com escopo tenant completo. Wipe/auditoria global do catálogo agora são exclusivos de Superadmin, com confirmação explícita para wipe e sem fallback destrutivo no navegador. A Edge de usuários do portal valida o cliente no tenant antes de qualquer leitura privilegiada.

No fechamento vivo, `aplicacoes` e `entregas` elevaram o núcleo para 21 tabelas com guarda tenant restritiva; recibos e Storage validam organização e recurso-pai; caminhos novos incluem tenant; eventos fiscais vinculam nota, configuração e certificado da mesma organização; a auditoria do catálogo não devolve amostras de IDs. OnFarm, contas de parceiros e planejamento de produção também passaram a exigir cadeia determinística até a organização; uma conta de parceiro legada sem vínculo foi preservada e bloqueada. Relatórios financeiros cujas fontes ainda não têm ownership completo permanecem sem execução para usuários autenticados. Produtos, microrganismos, configuração visual e configuração financeira globais têm mutação intersectada por policy restritiva de Platform Superadmin. Validações finais: **66 testes focados PASS na implementação + 22 PASS na recertificação**, suíte global **5.436 PASS / 4 skipped**, typecheck/build PASS, scanner com **10 Info e zero P0/P1**, linter no baseline de **479** sem novos achados, ausência de recursão RLS nos logs recentes, ACL/policies/índices/EXPLAIN inspecionados e quatro Edges implantadas; smoke passivo retornou HTTP 200 sem erro de página. A retomada executou ainda a migration transacional `20261005204351_3ab227fc-40d7-48b2-94b6-a49162216da3.sql`: dois administradores de organizações distintas tiveram leituras cruzadas negadas em perfis, financeiro, fiscal e produção, e administrador tenant não alterou configuração global; nenhuma mutação foi preservada. Decisão atualizada: **PASS de isolamento horizontal, com FAIL-CLOSED explícito para relatórios e legado sem ownership determinístico**. Nenhum dado foi excluído nem houve ação fiscal, financeira ou destrutiva real.

#### Retomada P0-A — Financeiro/Storage

O recorte P0-A corrigiu o helper de `clientes-docs` para validar o caminho efetivamente usado (`organization_id/clientes/cliente_id/...`), adicionou isolamento restritivo à tabela `cliente_documentos` pela organização do cliente e implantou validação de integridade tenant para novos vínculos entre títulos, parcelas, pagamentos, recibos e clientes. A geração de recibo passou a validar separadamente recibo e cliente no mesmo tenant, exigir UUID canônico e falhar se a URL assinada não for criada. Nenhum dado foi preenchido, removido ou emitido.

As RPCs `get_report_*`, fluxo de caixa, DRE e registro de exportação continuam revogadas para `authenticated`, pois suas definições legadas não filtram todas as fontes e joins por organização. Portanto esse subconjunto está **FAIL-CLOSED**, sem reabertura funcional. A prova A/B transacional passou entre duas organizações, incluindo IDs e paths forjados; 12 testes focados e 5.440 testes globais passaram, com 4 ignorados; typecheck/build passaram; scanner retornou 10 Info e zero P0/P1; linter permaneceu no baseline de 479. A Edge `generate-financial-receipt` foi implantada. **P0-A = PASS de isolamento com relatórios analíticos FAIL-CLOSED; P0-B não iniciado.**

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

### P0.3 — refinamento da UX manual

O aviso autenticado permanece não bloqueante e oferece apenas **Atualizar agora** e **Adiar**. Adiar persiste somente o token da versão, fecha o aviso e não deixa badge flutuante; checks automáticos da mesma versão ficam silenciosos. Uma transição de login ou um clique manual reapresenta a atualização ainda pendente, e uma versão futura diferente também abre o aviso. Quando a página já carregou a versão publicada, o estado e a deferência são limpos. Somente **Atualizar agora** navega, uma vez, com a trava existente contra repetição; recuperação de chunk obsoleto continua exigindo ação explícita.

O antigo botão inferior foi removido. `PwaManualCheckButton` é reutilizado no cabeçalho compartilhado do administrativo, produtor, parceiro e mobile, além do cabeçalho próprio do Superadmin e do estado produtor sem cliente. O controle aparece apenas autenticado, mostra texto em desktop e ícone com nome acessível/tooltip em telas estreitas. O observador pós-login continua montado uma única vez dentro de `BrowserRouter` + `AuthProvider`; scheduler global de 10 minutos, `visibilitychange` e `online` somente detectam.

Validação final desta execução: **43/43 testes PWA e auditorias A–P PASS**, typecheck e build PASS; scanner **10 Info e zero P0/P1**. A suíte global registrou **5.402 PASS / 4 skipped**, sem falhas. A inspeção estática confirmou um único estado global, reutilização do mesmo controle nos layouts administrativo, produtor, parceiro e mobile, ausência de `deferred_badge`, ausência de `location.reload` e navegação somente por ação explícita. A duplicidade do botão no fallback produtor sem cliente foi removida. O frontend foi publicado uma única vez. O smoke passivo oficial respondeu HTTP 200 no build `build-musp27xr`, abriu `/auth` com corpo visível, zero erro de página e zero requisição falha; o módulo `App-BN4mp-Sy.js` contém **Verificar atualização**, **Nova versão disponível**, **Adiar** e a mensagem de versão atual, sem os textos legados de recarga automática. Nenhum botão foi clicado. Nenhuma operação Supabase/SMTP, envio, retry ou alteração de dados integrou esta rodada.

#### P0.3.1 — refinamento visual do controle manual

O controle autenticado passou a exibir somente o ícone `RefreshCw`, substituído pelo `Loader2` animado durante a inspeção. O texto deixou de existir no conteúdo visual persistente em desktop e mobile; o nome acessível **Verificar se há nova versão do Cultivo Farm** e o tooltip **Verificar atualização** foram preservados. O botão permanece compacto em `h-9 w-9`, sem alterar o cabeçalho, a detecção, o prompt, a deferência ou a navegação exclusivamente explícita.

Validação: **44/44 testes PWA focados PASS**, incluindo ícone, ausência de texto persistente, tooltip por foco, `aria-label`, loading e inspeção manual; typecheck e build PASS; scanner **10 Info e zero P0/P1**. O frontend foi publicado uma única vez. O smoke passivo oficial respondeu HTTP 200 no build `build-musqd5o5`, sem erro de página ou requisição; o módulo servido contém o rótulo acessível, tooltip e classe compacta, sem `hidden sm:inline`, `location.reload` ou `deferred_badge`. Nenhum clique, autenticação, SMTP, Supabase, E02, REFIL ou AR BIO integrou esta rodada.

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

### Fechamento D51.5 P0-B — catálogo

O catálogo foi confirmado como global: `produtos` não possui vínculo de organização, enquanto ordens, lotes, estoque, entregas e demais referências operacionais permanecem fora do escopo destrutivo. Auditoria e wipe exigem Platform Superadmin validado no servidor. O wipe passou a uma única RPC transacional e idempotente, restrita ao `service_role`, com confirmação explícita, motivo obrigatório, correlação e trilha de contagens antes/depois. Chaves estrangeiras para histórico operacional fazem a operação falhar por inteiro, sem cascata de dados tenant. Atalhos destrutivos no navegador foram removidos; nenhuma limpeza real foi executada. **P0-B = PASS.**

### Fechamento D51.5 P0-C — Portal

`list-portal-users` foi endurecida para validar JWT, ator ativo, organização derivada server-side e papel permitido antes do cliente; o cliente é validado por RLS no tenant antes da instanciação de service role. Vínculos corrompidos para outro tenant são descartados pelo filtro de perfis e os papéis são consultados somente para usuários já validados. O frontend descarta resposta assíncrona antiga na troca de cliente/identidade e limpa contexto local no logout. A Edge foi implantada; smoke com JWT inválido retornou 401 sem consultar cliente real. Testes focados **77/77**, global **5.447 PASS / 4 skipped**, typecheck/build PASS, scanner com 10 Info e zero P0/P1 e linter no baseline 479. A prova A/B dedicada ficou **NOT RUN** por ausência, no estado vivo, de dois tenants com administrador e cliente; nenhuma fixture foi inventada. **P0-C = PASS estrutural / NO-GO de homologação A/B funcional.**

### D51.5 P0-D — Produção/RBAC vivo

O estado vivo confirmou isolamento restritivo por `organization_id` nas sete tabelas diretas, legado sem ownership preservado e invisível, índices de organização presentes e cadeia de `ordens_servico_onfarm` até cliente. As policies foram alinhadas ao `ACCESS_MAP`: `administrativo` perdeu mutação de clientes/fazendas/talhões; gestor comercial mantém escrita somente em clientes; produção perdeu atualização de OS; policies históricas `true` de lote/envase/CQ foram removidas. Cinco RPCs/listagens da esteira com validação tenant incompleta perderam `EXECUTE` de `authenticated` e `anon`, mantendo o fluxo **FAIL-CLOSED funcional** em vez de permitir IDOR por UUID. Estado vivo final: **7 guards restritivos, 0 policy histórica true, 0 grants autenticados nas RPCs bloqueadas**. O frontend oculta mutações para papéis read-only e bloqueia submissão de CQ/envase fora do `ACCESS_MAP`.

Validação: 4/4 testes focados e **5.451 PASS / 4 skipped** globais; typecheck/build automáticos PASS; scanner com 10 Info e zero P0/P1; linter caiu de 479 para 474 achados preexistentes (17 Info, 456 Warn e proteção de senha vazada desativada). Smoke passivo sem operação destrutiva e sem escrita de produção. A prova autenticada com dois tenants permaneceu **NOT RUN**, pois não existem identidades/fixtures A/B adequadas e não foi inventado ownership. **P0-D = PASS estrutural de isolamento / FAIL-CLOSED funcional da esteira / NO-GO para homologação funcional A/B.** Fiscal/P1 não iniciado.

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

## Auditoria pós-configuração SMTPi — 2026-10-03

A leitura canônica sanitizada confirmou porta **465**, família **KingHost** e rota ativa classificada como **SMTPi/internacional**, sem registrar o host em claro. Host, usuário, remetente e referência Vault estão presentes. A resolução do segredo foi comprovada funcionalmente, sem leitura ou exposição do valor: o runtime de banco carregou a credencial e o probe completou autenticação SMTP. `delivery_enabled=false`, `email_delivery_enabled=false`, Test Mode **ON** e allowlist com exatamente `teste@refilinformatica.com.br` foram preservados.

A última auditoria normal `smtp_connection_test` é `id=23`, em `2026-10-03T16:59:02.720538Z`: `outcome=success`, `safe_code=smtp_connection_ok`, `stage=quit`, latência **117 ms**. Pelo contrato do probe, esse retorno só ocorre após conexão TLS, greeting 220, EHLO 250, AUTH 235 e QUIT, com `authenticated=true`. O caminho de conexão não contém `MAIL FROM`, `RCPT TO` ou `DATA`; respostas brutas não são persistidas nem reportadas.

Após esse horário foram confirmados: zero `smtp_send_test`; zero novo `email_accepted_at`; zero outbox de e-mail enviada ou aceita; zero receipt aceito; zero incremento de `email_attempt_count`; zero retry ou reenvio do convite. O E02 mantém exatamente um job, o mesmo Auth user, um profile no tenant correto e um papel `administrador`, sem `superadmin` ou duplicidade. O job permanece `pendente`, provisionamento/e-mail em **1/1**, `failed/email_unknown_error`, tentativa anterior à conexão, leases limpos. A conexão bem-sucedida não resolve retrospectivamente a ambiguidade do envio original e não libera seu retry.

**Decisão histórica naquele corte:** SMTP CONNECTION = **PASS**. O gate de envio diagnóstico foi posteriormente corrigido conforme a seção abaixo; as flags operacionais não devem ser abertas para esse teste. Nenhuma flag, configuração, segredo, job ou dado foi alterado nesta auditoria; nenhum e-mail foi enviado. Retry E02 continua **BLOCKED**. SMTP2GO permanece planejado e M1 não foi iniciado.

## Gate independente de envio diagnóstico — 2026-10-03

O readiness foi separado em três estados: `connection_ready` cobre apenas configuração técnica e porta compatível; `controlled_test_send_ready` exige também Test Mode ON, allowlist exclusiva para o endereço de homologação e último PASS de conexão de no máximo 30 minutos, anterior ou igual ao snapshot atual; `operational_email_ready` acrescenta as flags global e de e-mail. Assim, OFF/OFF continuam bloqueando convites, outbox, alertas e demais fluxos, mas não o teste diagnóstico isolado.

O modo `send` permanece exclusivo de Superadmin, exige `confirm_controlled_send=true`, rejeita campos extras e destinatário divergente, e fixa no servidor destinatário, assunto e corpo. A reutilização do adapter ocorre com um clone efêmero do runtime somente dentro desse diagnóstico; nenhuma flag é persistida. O limite é três tentativas por cinco minutos. Resultado aceito significa somente aceite SMTP; resultado ambíguo bloqueia repetição cega posterior. Auditoria usa a ação allowlisted existente `smtp_send_test`, sem host, usuário, senha ou mensagem bruta.

Validação sem rede SMTP: Deno check das duas funções, 70 testes focados, typecheck, build e suíte global com **5.395 PASS/4 skipped**; scanner com **10 Info e zero P0/P1**. `test-communication-email` e `communication-provider-settings` foram implantadas. O smoke passivo HTTP 200 confirmou no módulo oficial publicado os marcadores do aviso, confirmação, resultado de aceite e botão, sem abrir a área autenticada nem chamar a Edge. Não houve probe, envio, alteração de flags/configuração, retry E02 ou avanço de fase. Próxima ação humana: garantir um PASS normal recente e clicar uma única vez em **Enviar e-mail de teste**; não ligar flags operacionais. SMTP2GO permanece planejado e M1 não foi iniciado.

## Auditoria pós-teste SMTPi — 2026-10-03 18:32 UTC

A leitura somente no projeto canônico `swzpzcwiasxmjutrmvkm` confirmou a configuração sanitizada sem expor host, usuário, remetente, referência ou segredo: família **KingHost**, rota ativa classificada como **SMTPi/internacional**, porta **465**, host/usuário/remetente configurados e referência Vault presente. A credencial está funcionalmente resolvida: a configuração efetiva vem do singleton de banco e o probe normal completou AUTH antes de `quit`. As flags permanecem `delivery_enabled=false` e `email_delivery_enabled=false`; Test Mode está **ON** e a allowlist contém exatamente `teste@refilinformatica.com.br`.

A última auditoria `smtp_connection_test` é `id=25`, em `2026-10-03T18:32:05.401961Z`: `outcome=success`, `safe_code=smtp_connection_ok`, `stage=quit`, latência **105 ms**. Pelo contrato vigente, esse resultado sucede TLS, greeting, EHLO e AUTH e não executa `MAIL FROM`, `RCPT TO` ou `DATA`. Classificação: **SMTP CONNECTION PASS**.

Desde esse PASS há zero `smtp_send_test`, zero tentativa ou aceite novo no convite, zero outbox criada/tentada/enviada, zero receipt e zero ação de retry/reenvio. O E02 continua com exatamente um job, o mesmo Auth user, um profile no tenant correto e um papel `administrador`, sem `superadmin` ou duplicidade. O job permaneceu sem alteração posterior ao PASS, com provisionamento/e-mail em **1/1**, `failed/email_unknown_error`, aceite nulo e leases limpos.

**Decisão:** **GO condicionado** para um único envio diagnóstico controlado exclusivamente a `teste@refilinformatica.com.br`, pelo fluxo já implantado, mediante clique humano explícito enquanto o PASS estiver dentro do TTL de 30 minutos e a configuração permanecer inalterada. As flags operacionais devem continuar **OFF/OFF**. Este GO não autoriza retry/reenvio do E02, envio por outbox, mudança de configuração, abertura de flags ou avanço de fase. Nenhuma dessas ações foi executada nesta auditoria.

## Diagnóstico read-only da falha do envio controlado — 2026-10-03 18:44 UTC

No projeto canônico `swzpzcwiasxmjutrmvkm`, existe exatamente uma auditoria `smtp_send_test`: `id=26`, `created_at=2026-10-03T18:44:23.187606Z`, `outcome=failure`, `safe_code=smtp_send_failed`, `stage=connect` e `latency_ms=NULL`. A requisição Edge correlata foi um único `POST` para `test-communication-email`, concluído com HTTP **502** em **3060 ms**; o log sanitizado da função registrou `safe_code=email_connect_network`, `stage=connect` e latência nula. Não houve segunda tentativa.

As proteções permaneceram inalteradas: `delivery_enabled=false`, `email_delivery_enabled=false`, Test Mode **ON** e allowlist exatamente `teste@refilinformatica.com.br`. O último `smtp_connection_test` continua sendo o `id=25`, em `2026-10-03T18:32:05.401961Z`, com `success/smtp_connection_ok/quit` em **105 ms**.

O probe aprovado abre a porta 465 com `Deno.connectTls({ hostname, port })` e concluiu TLS, greeting, EHLO, AUTH e QUIT. Já o envio controlado chama o adapter compartilhado, cuja fábrica importa `denomailer@1.6.0` e instancia `SMTPClient`. O estágio permanece `connect` até essa fábrica resolver; portanto a falha ocorreu durante importação/construção/conexão do cliente, antes da atribuição do cliente e antes de `client.send`. Nenhum `MAIL FROM`, `RCPT TO` ou `DATA` foi iniciado por esse caminho.

**Decisão diagnóstica:** a divergência entre os dois transportes está comprovada e é a causa provável imediata: a mesma configuração passou pelo socket TLS nativo e falhou na fábrica/conexão do Denomailer poucos minutos depois. A causa interna exata no Denomailer não está comprovada porque o contrato descarta corretamente o erro bruto. Correção mínima recomendada, ainda não implementada: unificar o envio no mesmo transporte SMTP nativo e classificador seguro já usado pelo probe, preservando TLS/SNI, AUTH, timeouts, fechamento, estágios, fencing e tratamento accepted/definitive/ambiguous. **NO-GO** para novo teste, retry do E02 ou abertura de flags até esse forward-fix ser autorizado, testado e implantado.

## Forward-fix do transporte SMTP nativo unificado — 2026-10-03

O contrato público `sendEmail`/`SmtpLikeClient` e a injeção `deps.smtpClientFactory` foram preservados. A fábrica padrão deixou de importar Denomailer e passou a criar `NativeSmtpClient`, usando os mesmos primitives nativos Deno, parsing limitado, TLS/SNI, greeting, EHLO, STARTTLS, segundo EHLO e AUTH PLAIN/LOGIN do probe. O envio acrescenta a sequência estrita MAIL 250, RCPT 250/251, DATA 354, MIME multipart text/plain + text/html em UTF-8 quoted-printable, CRLF, dot-stuffing e aceite somente após resposta final 250; QUIT e fechamento são best-effort. Falhas SMTP 4xx/5xx inequívocas são definitivas; falha após início do corpo DATA é ambígua.

Validação foi totalmente simulada, sem rede SMTP: **15/15 testes Deno** passaram, incluindo probe, TLS implícito 465, AUTH PLAIN/LOGIN, envelope, RCPT 251, DATA, resposta final, MIME, dot-stuffing, CRLF, assunto UTF-8, ambiguidade e fechamento. **47/47 testes focados Vitest** passaram. Um timeout inicial da suíte global, em teste financeiro alheio, passou isoladamente junto aos focados (**59/59**) e a repetição integral terminou verde (**356 arquivos aprovados, 1 ignorado; 5403 testes aprovados, 4 ignorados**). Typecheck passou e o scanner permaneceu com **10 informativos e zero P0/P1**. Denomailer não aparece mais na fábrica padrão nem nos consumidores do adapter; dois emissores legados diretos permanecem fora deste fluxo e continuam dívida M8 já registrada. As três Edge Functions consumidoras foram implantadas e o smoke passivo com JWT inválido retornou 401 antes de qualquer operação SMTP. Nenhum SMTP real, envio, flag, configuração, job ou dado foi tocado.

## Auditoria pós-envio controlado recebido — 2026-10-03 19:15 UTC

No canônico, há **2** auditorias totais `smtp_send_test`: a tentativa histórica `id=26` e exatamente uma nova tentativa após o forward-fix, `id=28`, criada em `2026-10-03T19:15:10.908320Z`, com `outcome=success`, `safe_code=smtp_send_accepted`, `stage=response` e `latency_ms=null`. Há zero resultado ambíguo e apenas um send após a falha histórica, sem segunda tentativa por clique duplo. A conexão imediatamente anterior é `id=27`, `2026-10-03T19:14:49.143699Z`, `success/smtp_connection_ok/quit`, 89 ms. O responsável confirmou o recebimento na caixa controlada; o audit code comprova aceite SMTP, não entrega em mailbox por si só.

A configuração permanece sanitizadamente KingHost SMTPi/internacional, porta 465, global/e-mail OFF/OFF, Test Mode ON e allowlist exatamente `teste@refilinformatica.com.br`; `updated_at=2026-10-03T16:58:41.046492Z`, portanto não houve mudança após o PASS. Depois do PASS houve somente uma ação auditada `smtp_send_test`: zero Auth user novo, zero profile novo, zero outbox enviada/tentada, zero invite novo e zero lease ativo. O E02 permanece exatamente um job (`22c70f4f-21b5-45d4-83c8-8fade808fbc1`), com uma referência Auth, um profile no tenant, exatamente um papel `administrador`, zero `superadmin`, `status=pendente`, `email_delivery_status=failed`, uma tentativa histórica, `email_unknown_error`, sem aceite e sem lease; não houve retry ou duplicidade.

**Decisão:** `SMTP SEND CONTROLLED = PASS`. D51.2 fica liberado apenas para retry controlado do job E02 existente, reutilizando o mesmo job/Auth/profile/papel e sem recriar empresa, assinatura, usuário ou profile. Antes do retry operacional, exigir janela auditável com global/e-mail ON, Test Mode ON e allowlist exclusiva; após envio e confirmação de recebimento do convite, fechar novamente OFF/OFF. Nenhuma dessas ações foi executada nesta auditoria. SMTP2GO permanece planejado e M1 não iniciado.

## Auditoria pós-retry do convite E02 — 2026-10-03 19:26 UTC

No canônico `swzpzcwiasxmjutrmvkm`, o destinatário controlado continua associado a exatamente um job, o histórico `22c70f4f-21b5-45d4-83c8-8fade808fbc1`, na organização `8f57c7dd-0557-4041-b401-7a00f7244626` e com o mesmo usuário. O job permanece `pendente`, sem conclusão de primeiro acesso, mas o estado atual de e-mail passou para `accepted`: `attempt_count=2`, `email_attempt_count=2`, `email_last_attempt_at=2026-10-03T19:26:20.621676Z`, `email_accepted_at=2026-10-03T19:26:21.561898Z` e erro atual nulo. Os dois contadores aumentaram exatamente uma vez em relação ao histórico 1/1. `lease_token`, `lease_expires_at`, `email_lease_token` e `email_lease_expires_at` estão limpos. `email_next_attempt_at` ainda contém `2026-10-03T19:31:20.646645Z`; como o estado atual é `accepted` e não há lease, o valor é residual e não representa retry autorizado, mas deve ser observado antes de homologar automação futura.

Os logs sanitizados da Edge Function mostram uma única sequência no mesmo `job_ref` e correlação: `invite_email_claimed`, `invite_email_transport_result` com `sent/response/definitive` e `invite_email_accepted` com `accepted/response/definitive`, entre `19:26:20Z` e `19:26:21Z`. O fluxo implantado chama `deliverInviteEmail` → `sendEmail` → cliente SMTP nativo compartilhado; nenhum link, token, OTP, destinatário, host, usuário, senha, conteúdo ou resposta SMTP bruta aparece nos eventos. O responsável declarou recebimento na caixa controlada; o banco comprova aceite SMTP, e a entrega na caixa é evidência humana externa.

Integridade preservada: um Auth user, um profile ativo no tenant esperado, nenhum profile em outro tenant, exatamente um papel `administrador` e zero `superadmin`. A conta Auth está confirmada para viabilizar recovery, enquanto `senha_provisoria=true` mantém o primeiro acesso pendente. Há uma organização da campanha e uma assinatura única `TRIAL`; nenhuma organização, assinatura ou profile foi criada após a abertura da janela. Não houve nova outbox operacional, tentativa ou envio por outbox, e somente o job do destinatário controlado teve tentativa de e-mail no intervalo.

A janela foi aberta auditavelmente por duas ações `apply`, alterando apenas `delivery_enabled` às `2026-10-03T19:24:34.078534Z` e `email_delivery_enabled` às `2026-10-03T19:24:44.457533Z`. No corte desta auditoria ambas continuam **ON**; Test Mode permanece **ON**, allowlist contém exclusivamente `teste@refilinformatica.com.br`, porta 465 e rota KingHost SMTPi preservadas.

**Decisão:** `E02 EMAIL = PASS`, sem duplicidade, ambiguidade ou lease residual. O gate técnico de primeiro acesso está liberado, mas a execução humana está em **NO-GO operacional temporário** enquanto global/e-mail permanecerem ON/ON. Próximo passo obrigatório: o Superadmin fechar auditavelmente apenas essas duas flags para OFF/OFF; somente depois abrir o convite já recebido, definir a senha e efetuar login. Não gerar nem reenviar convite. SMTP2GO permanece planejado e M1 não iniciado.

## P0 Auth redirect localhost — 2026-10-03 19:37 UTC

O responsável declarou que o convite recebido abriu `http://localhost:3000/` com credenciais Auth no fragmento e conexão recusada. O valor sensível não foi reproduzido, armazenado ou incluído nesta auditoria. O link/sessão anterior passa a ser tratado como comprometido e não reutilizável para homologação.

A contenção read-only no projeto canônico `swzpzcwiasxmjutrmvkm` confirmou `delivery_enabled=false`, `email_delivery_enabled=false`, Test Mode ON e allowlist contendo exclusivamente o destinatário controlado. Nenhum novo convite, envio ou alteração de configuração foi executado.

A causa no código foi confirmada: `platform-invite-org-admin` validava o `Origin`, mas também o usava para compor `redirectTo`. A correção mínima mantém a rejeição de origem não confiável e fixa server-side o destino operacional em `https://app.cultivofarm.com.br/reset-password`; localhost e preview não conseguem mais alterar o destino. `ResetPassword` continua aguardando o consumo do implicit flow por `onAuthStateChange/getSession` e agora remove o fragmento sensível também quando o link está expirado ou usado, sem logs ou analytics.

As ferramentas disponíveis não leem nem alteram Auth > URL Configuration deste Supabase externo. Portanto, Site URL e Redirect URLs permanecem **não comprovados** e nenhuma hipótese foi registrada como fato. A revogação oficial de todas as sessões do usuário controlado também não está disponível sem uma sessão/token desse usuário ou operação administrativa oficial exposta; o usuário, profile, role e job foram preservados.

Validações da correção: 47 testes focados, 17 testes Deno, suíte global com 5.403 PASS/4 skipped, typecheck e build verdes, scanner com 10 Info e zero P0/P1. A Edge Function corrigida foi implantada e o frontend publicado. Smoke passivo confirmou `/reset-password` HTTP 200 e negativa 401 sem JWT; Playwright com credenciais fictícias confirmou remoção do fragmento e mensagem segura de link inválido. Nenhum convite, e-mail, probe ou sessão real foi criado durante a validação.

**Decisão:** `NO-GO` para novo convite e primeiro acesso. Antes de qualquer reenvio, um responsável deve corrigir e comprovar no Dashboard o Site URL e a Redirect URL exata, e revogar globalmente as sessões do usuário controlado por mecanismo oficial do Auth.

## Certificação pós-correção Auth sem envio — 2026-10-03 20:10 UTC

O responsável declarou que corrigiu o Site URL, adicionou a Redirect URL exata e revogou as sessões do usuário controlado. As ferramentas disponíveis continuam sem leitura direta de Auth URL Configuration, portanto os dois primeiros fatos permanecem como confirmação humana, sem inferência adicional.

A leitura canônica confirmou `delivery_enabled=false`, `email_delivery_enabled=false`, Test Mode ON e allowlist exatamente `teste@refilinformatica.com.br`. O E02 permanece íntegro: exatamente 1 job, 1 Auth user, 1 profile no tenant esperado, 1 papel `administrador`, zero `superadmin` e zero profile em outro tenant. O job segue `pendente/accepted`, com tentativas 2/2 e todos os leases limpos.

`auth.sessions` foi legível sem acessar material sensível e contém **1 sessão** vinculada ao `user_id` do E02, criada e atualizada em `2026-10-03T19:33:50.469291Z`, com `not_after` nulo e sem refresh posterior registrado. Nenhum token, refresh token, segredo, IP ou user agent foi consultado ou exposto. Como a linha continua sem expiração, a exigência de zero sessões válidas/ativas falhou e a revogação declarada não pôde ser certificada.

O código atual da Edge usa `getPlatformInviteRedirectUrl()` com destino fixo `https://app.cultivofarm.com.br/reset-password`; `Origin` permanece somente como gate e não compõe `redirectTo`. Os 2 testes Deno da política passaram. A rota oficial `https://app.cultivofarm.com.br/reset-password` respondeu HTTP 200 com build `build-musstglq`. A tentativa de gerar uma prova recovery sem envio via Auth Admin foi recusada pelo ambiente antes da chamada por proteção contra minting com service role; nenhum link foi gerado, persistido, impresso ou aberto.

**Decisão:** `AUTH REDIRECT = NO-GO`. O redirect no código e a rota publicada estão comprovados, mas a sessão residual impede liberar novo retry E02. Manter OFF/OFF, Test Mode ON e allowlist exclusiva; não abrir o link antigo nem gerar novo convite até `auth.sessions` comprovar zero sessões válidas/ativas. Nenhum e-mail, flag, job, Auth user, profile ou role foi alterado nesta certificação.

## D51.2 — fallback manual de link de acesso — 2026-10-05

O fluxo existente `platform-invite-org-admin` passou a aceitar o modo allowlisted `manual_link`, mantendo JWT, validação server-side de Superadmin, identidade, tenant, intenção, lease/fencing, mesma conta e redirect fixo `https://app.cultivofarm.com.br/reset-password`. O modo manual é restrito a acesso por link pendente/falho e bloqueia acesso concluído. Ele não carrega configuração SMTP, não executa claim/envio de e-mail, não depende das flags de entrega e não altera `email_attempt_count` ou `email_delivery_status`.

O link é devolvido somente na resposta manual com `Cache-Control: no-store, private`; não aparece no modo e-mail, banco, auditoria, logs, toast, URL da aplicação ou armazenamento persistente do navegador. A auditoria reutiliza `comunicacao_audit_log` com ação `manual_access_link_generated`, ator, job, organização, origem, resultado e motivo fixo, sem credencial. Falha ao gravar a auditoria impede a entrega do link ao cliente.

Em **Administradores provisionados**, registros elegíveis exibem **Gerar link** ao lado do reenvio. O mesmo fallback aparece no checkpoint da Nova Empresa após empresa pronta ou falha SMTP, sem recriar empresa ou usuário. Confirmação, trava contra clique concorrente, aviso para estado ambíguo, cópia pela Clipboard API e limpeza ao fechar/desmontar mantêm a credencial somente em memória.

Validação: 50 testes focados PASS, 5 testes Deno PASS, typecheck PASS, build automático PASS e suíte global com **5.414 PASS / 4 skipped**. Scanner profundo: 10 Info e zero P0/P1; linter permaneceu na baseline histórica de 492 achados, sem novo grant amplo na sobrecarga service-role-only. A auditoria RBAC autenticada ficou NOT RUN porque `RBAC_AUDIT_PASSWORD` não estava disponível e abortou antes de executar. A Edge Function foi implantada e a publicação frontend foi solicitada uma única vez. O smoke foi estritamente passivo: nenhum link real, e-mail, flag, job E02, Auth, profile ou papel foi alterado.

**Decisão:** `MANUAL LINK FALLBACK = PASS TÉCNICO`; pronto para teste humano controlado por Superadmin. O fallback não substitui a trilha do convite e o link deve ser enviado somente ao destinatário correto por canal confiável.

## Revogação autorizada de todas as sessões — 2026-10-03 20:15 UTC

O responsável autorizou explicitamente revogar todas as sessões somente do usuário controlado. O alvo foi resolvido no Supabase canônico por e-mail e validado em modo fail-closed: exatamente 1 `auth.users`, exatamente 1 job E02 e coincidência integral do `user_id` mascarado `cbdc4ef3-****-****-****-d212`. Antes da operação havia 1 sessão e 1 refresh token vinculados. As constraints comprovaram FK de `auth.refresh_tokens.session_id` para `auth.sessions.id` com `ON DELETE CASCADE`; não foi localizado mecanismo oficial disponível no ambiente para revogação administrativa por `user_id` sem JWT do usuário.

Por autorização explícita, o fallback SQL executou uma transação única: removeu explicitamente 1 refresh token do alvo e depois 1 sessão do mesmo usuário. As cardinalidades esperadas foram exigidas dentro da transação; qualquer divergência abortaria o commit. A primeira tentativa de comando falhou antes de qualquer deleção por incompatibilidade de agregação UUID e foi integralmente revertida. A execução corrigida concluiu sem acessar ou registrar token, hash, segredo, metadata, senha ou ID de sessão.

Pós-verificação: `auth.sessions=0` e `auth.refresh_tokens=0` para o alvo; permanecem 1 Auth user, 1 profile na organização do job, 1 papel `administrador`, zero `superadmin`, 1 job E02 `pendente/accepted` com tentativas 2/2 e leases limpos, 1 organização e 1 assinatura. Comunicação permaneceu `delivery_enabled=false`, `email_delivery_enabled=false`, Test Mode ON e allowlist exatamente `teste@refilinformatica.com.br`. Nenhum outro usuário, identidade, MFA, senha, metadata, convite, e-mail ou flag foi alterado.

**Decisão:** `SESSION REVOCATION = PASS`. O gate para um novo retry E02 controlado está liberado, mas nenhum convite foi gerado ou enviado nesta rodada. O link anterior permanece comprometido e proibido; manter OFF/OFF até a janela humana autorizada.

## D51.2 — reenvio persistente em Administradores — 2026-10-03 20:30 UTC

A lista **Administradores provisionados** passou a oferecer reenvio direto e persistente para registros `link/pendente` com `user_id`, inclusive após recarregar a página. O diálogo informa que será criado um novo link sem nova conta; o payload reaproveita organização, nome, e-mail, CPF, telefone, modo e responsável do mesmo registro e envia `confirmAmbiguousEmailRetry=false` no caso normal. Convites ambíguos preservam a confirmação especial e `confirmAmbiguousEmailRetry=true`; registros ativos e de senha temporária não oferecem reenvio. A trava síncrona e o estado da linha impedem duplo clique, e o sucesso atualiza a listagem.

Validação: 11 testes focados e suíte global com 5.409 testes PASS/4 skipped; typecheck e build PASS. Scanner completo: 10 Info e zero P0/P1. Frontend publicado uma única vez; smoke passivo em `https://app.cultivofarm.com.br` confirmou HTTP 200, build `build-musuh9jx` e os marcadores do novo fluxo no módulo público, sem autenticação, clique ou requisição operacional. Nenhum banco, schema, flag, Auth user, profile, role, job ou convite foi alterado ou enviado.

**Decisão:** `D51.2 UX REENVIO PERSISTENTE = PASS`. O botão está publicado e pronto para uso humano controlado pelo Superadmin; o envio não foi executado nesta rodada.

## D51.2 — diagnóstico read-only do reenvio recusado — 2026-10-05 15:28 UTC

A leitura canônica encontrou o mesmo job E02 `22c70f4f-****-****-****-fbc1`, agora `pendente/failed`, com tentativas de provisionamento/e-mail 3/3, `email_last_error_code=email_connect_network`, última tentativa em `2026-10-05T15:24:52.702500Z`, aceite histórico preservado em `2026-10-03T19:26:21.561898Z`, próxima tentativa registrada para `2026-10-05T15:29:53.033340Z`, leases de provisionamento/e-mail limpos, sem conclusão e atualização em `2026-10-05T15:24:53.030546Z`.

Foram observados dois POSTs HTTP 503: `15:23:21Z`, anterior à abertura auditada das flags, e `15:24:53Z`, após `delivery_enabled` e `email_delivery_enabled` serem alteradas para ON. Somente a tentativa mais recente avançou o job: o log sanitizado comprova `invite_email_claimed` em `preflight`, seguido de `invite_email_transport_result`, etapa `connect`, código seguro `email_connect_network`, certeza definitiva e correlação mascarada `9dd210d6-****-****-****-3353`. A resposta sanitizada correspondente é: “O acesso foi preparado, mas o e-mail não foi enviado. Tente novamente após configurar o SMTP.” Não houve aceite SMTP nessa tentativa.

As RPCs aceitam `pendente` com `email_delivery_status=accepted`: o claim de provisionamento valida identidade, tenant, lease, divergência de dados, ambiguidade e cooldown; depois incrementa a tentativa no mesmo job. O claim de e-mail também aceita `pendente` e `ativo`, cria nova chave de idempotência quando o estado anterior é `accepted`, bloqueia lease/cooldown e exige confirmação somente para estados ambíguos. Portanto, `accepted`, conclusão, mismatch, Auth recovery e ausência de RPC própria não causaram esta falha. O frontend enviou os dados do mesmo registro, `confirm_ambiguous_email_retry=false`, sem `job_id` e sem criação de job no cliente.

No momento da leitura, global/e-mail permaneciam ON/ON, Test Mode ON e allowlist exclusiva do endereço controlado. **Causa raiz comprovada: classe F — falha definitiva de conexão do transporte SMTP (`email_connect_network`) após claim bem-sucedido; não foi recusa do estado `pendente+accepted`.** O cooldown já expirou, mas a conectividade não foi revalidada. **Decisão: `RETRY BLOCKED`.** Correção mínima recomendada, sem código ou banco: fechar imediatamente OFF/OFF pelo mecanismo auditável, obter novo PASS de conexão SMTPi sem envio e somente então abrir uma janela controlada para uma única nova tentativa; fechar OFF/OFF após o resultado. Nenhuma mutação, clique ou envio foi executado durante este diagnóstico.

## D51.2 — diagnóstico read-only do primeiro acesso duplicado — 2026-10-05 18:09 UTC

A leitura do Supabase canônico confirmou exatamente 1 Auth user e 1 profile para o usuário controlado. O profile está ativo, vinculado à organização mascarada `8f57c7dd…4626`, com `senha_provisoria=false`; existe somente o papel `administrador`, sem `superadmin`. O único job E02, `22c70f4f…fbc1`, está `ativo`, concluído em `2026-10-05T18:03:02.986861Z`, e sua organização coincide com `profiles.organization_id`. Não existe linha em `platform_private.provisional_password_state`; portanto, `platform_first_access_pending(user_id)=false`. Sessões e refresh tokens atuais: zero.

**Causa raiz da senha duplicada:** `/reset-password` troca a senha diretamente com `supabase.auth.updateUser({ password })`, encerra a sessão e não conclui o estado server-side de primeiro acesso. Esse caminho não limpa `profiles.senha_provisoria` nem `platform_private.provisional_password_state`. No login seguinte, `AppLayout` encontra `senha_provisoria=true` e força `TrocaSenhaObrigatoria`, cuja chamada à Edge `platform-complete-first-access` valida a pendência, redefine a senha e executa a conclusão server-side. A duplicidade decorre de dois finalizadores independentes para a mesma jornada. No estado atual, a segunda conclusão já ocorreu e a pendência está limpa.

O papel percebido como “usuário administrador” é o papel esperado de administrador da empresa. Não há papel operacional distinto de “administrador global”: `administrador` vai para `/dashboard/geral`; `superadmin` é o papel separado de plataforma e vai para `/plataforma`. O usuário E02 tem somente `administrador`, está no tenant correto e não possui acesso de Superadmin. Assim, a nomenclatura percebida é questão de UX/rotulagem, não atribuição incorreta de papel.

Há, contudo, um achado de segurança independente e comprovado: o contexto de autenticação carrega `profile.organization_id`, mas `rpc_executivo_resumo_geral`, `rpc_dashboard_geral_lab_resumo` e `is_executivo` não referenciam `organization_id` nem `tenant_id`. As RPCs são `SECURITY DEFINER`, autorizam por papel e agregam tabelas operacionais sem escopo de organização. O banco possui 5 organizações, e políticas relevantes também concedem acesso amplo a `administrador` apenas por papel. Portanto, `/dashboard/geral` não está tenant-scoped e um administrador pode receber agregados de outras empresas. Nenhum teste destrutivo ou leitura de linhas de outro tenant foi necessário para comprovar a ausência do predicado de isolamento.

**Decisão:** `FIRST ACCESS STATE = PASS`, `ROLE/TENANT LINK = PASS`, `DUPLICATE PASSWORD UX = BUG CONFIRMADO` e `DASHBOARD TENANT ISOLATION = NO-GO`. Correção mínima recomendada: unificar o recovery de primeiro acesso no finalizador server-side já existente, mantendo uma única definição de senha; em trabalho separado e prioritário, derivar a organização exclusivamente de `auth.uid()` no servidor e aplicar o predicado tenant a todas as RPCs/tabelas do dashboard antes de considerar a visão geral segura em ambiente multiempresa. Nenhuma alteração de dados ou código foi feita nesta rodada.

## D51.3 — primeiro acesso único e contenção tenant do Dashboard — 2026-10-05

A rota `/reset-password` passou a consultar `platform-complete-first-access` em modo diagnóstico depois do consumo seguro da sessão recovery. Quando `pendente=true`, a senha é submetida somente ao finalizador server-side existente, que atualiza Auth e conclui `profiles.senha_provisoria`/estado provisório na mesma jornada; `auth.updateUser` direto não é chamado. Quando `pendente=false`, o recovery comum continua usando `auth.updateUser`. Resposta sem booleano ou falha de rede/servidor bloqueia qualquer alteração. O fragmento sensível continua removido e `TrocaSenhaObrigatoria` foi preservado como barreira para sessões legadas.

O inventário real de `/dashboard/geral` encontrou somente `rpc_executivo_resumo_geral(jsonb)` e `rpc_dashboard_geral_lab_resumo()` no carregamento da tela. Elas alcançavam `portal_solicitacoes`, `vw_fluxo_visita_tecnica`, `visitas_checkin`, `registros_consultor`, `ordens_servico_onfarm`, `lotes`, `estoque_embalagens`, `entregas`, `alertas_operacionais`, `clientes`, `accounts_receivable` e vínculos financeiros, `alertas_sla_eventos`, `produtos` e `estoque_produto`. Nenhuma dessas fontes possui `organization_id`/`tenant_id` ou cadeia FK determinística até organização. Não houve backfill inferido nem associação inventada.

As migrations `20261005181909_30d8dc63-5ce4-44c6-aac0-e9248249aa7e` e `20261005182025_fb90a3ee-08f1-4db9-be55-26db69e51e11` criaram `platform_private.current_user_organization_id()` e substituíram as duas RPCs. O helper usa `auth.uid()`, exige profile ativo e organização não nula, tem `search_path` vazio e não concede execução a `PUBLIC`, `anon` ou `authenticated`. As RPCs exigem também papel `administrador`/`gestor`, não dão visão global implícita a Superadmin e rejeitam filtros client-side de cliente/fazenda. Como as fontes operacionais não têm ownership comprovado, retornam lista explícita de indicadores indisponíveis em vez de agregados globais; a interface apresenta “Indisponível”, nunca zero. O índice existente `profiles_organization_id_idx` atende o único vínculo validado; não foram criados índices sem consultas tenant legítimas.

Rollback funcional: restaurar as definições anteriores das duas RPCs somente após introduzir e validar ownership tenant em todas as fontes; manter o helper privado é inócuo. Forward-fix recomendado: adicionar vínculo organizacional na origem de cada domínio com backfill exclusivamente determinístico, RLS `USING`/`WITH CHECK`, índices e testes A/B antes de reativar cada indicador. Os registros sem vínculo devem continuar excluídos.

Validação final: 28 testes focados, typecheck e build passaram; a suíte global concluiu com **5.420 PASS / 4 skipped**. O scanner retornou 10 achados informativos e zero P0/P1. O linter manteve a baseline preexistente de 492 achados (17 RLS sem policy, 2 funções SECURITY DEFINER executáveis por anônimo, 472 por autenticado e Leaked Password Protection desativada), sem achado novo atribuído às migrations. Smoke passivo de `/reset-password` sem link mostrou a negativa segura, zero campo de senha e zero erro de página; nenhuma senha, sessão ou usuário foi alterado.

**Decisão:** `FIRST ACCESS SINGLE FINALIZER = PASS`. `DASHBOARD CROSS-TENANT LEAK = CONTIDO/PASS`: nenhum agregado operacional global é devolvido pelas RPCs. `DASHBOARD OPERACIONAL COMPLETO = NO-GO` até as fontes legadas receberem ownership tenant determinístico. O gate D51.3 é **GO de segurança com degradação explícita**, não homologação funcional dos indicadores indisponíveis.
