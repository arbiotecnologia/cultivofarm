# Auditoria D51.2 — E2E controlado

> **D51.2 RETOMADO:** incidente P0 pós-publicação encerrado. O gate avançou até a interação manual real E01/E02; não houve criação de empresa, usuário, convite ou envio nesta execução assistida.

Data da tentativa: 2026-10-02  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`  
Commit candidato confirmado no início do gate: `3e8fdae27bbbc3cab2d49fadb014725728665bf0`

## 1. Decisão

**NO-GO — execução interrompida no pré-gate, antes de E01 e antes de qualquer mutação.**

Foram encontrados dois bloqueios para uma execução E2E fiel ao plano:

1. **P1 — o fluxo de convite não envia SMTP.** A função atual cria a conta e gera um link por `generateLink`, mas apenas devolve o link à interface para cópia manual. Portanto, E03 não pode comprovar envio, aceitação pelo provedor e entrega da mensagem como parte do mesmo fluxo.
2. **Bloqueio operacional — sessão autenticada indisponível.** O ambiente de teste está classificado como Supabase externo não gerenciado e não disponibilizou sessão autenticada do superadmin. As operações E01/E02 devem comprovar a autorização server-side do ator real e não podem ser executadas anonimamente nem com credencial improvisada.

Conforme o checklist de parada, não foi tentada execução parcial, não foi criado usuário/tenant/convite e nenhum e-mail foi enviado. Não houve publicação nem avanço para D52.

## 2. Pré-condições

| Pré-condição | Status | Evidência sanitizada |
|---|---|---|
| Binding canônico | PASS | `supabase/config.toml` aponta exclusivamente para `swzpzcwiasxmjutrmvkm`; consultas canônicas responderam. |
| Commit candidato | PASS | `3e8fdae27bbbc3cab2d49fadb014725728665bf0`, coletado antes do início dos testes. |
| Suíte global verde | PASS | `npx vitest run`: exit 0; 342 arquivos aprovados, 1 ignorado; 5.281 testes aprovados, 4 ignorados. |
| Sete no-ops 1:1 | PASS | Ledger retornou as sete versões esperadas; os sete arquivos locais normalizam exclusivamente para `select1`. |
| Forward-fix Auth | PASS | Função canônica `platform_finalize_org_admin_provisioning` usa `raw_app_meta_data` e não usa `raw_user_meta_data`. |
| Grants internos | PASS | `claim`, `finalize`, `fail` e guard de senha sem EXECUTE para `anon`/`authenticated`; EXECUTE para `service_role`. |
| Leaked Password Protection | EXCEÇÃO ACEITA | Linter confirmou `Leaked Password Protection Disabled`; permanece **ADIADA / RISCO ACEITO TEMPORARIAMENTE**, não resolvida e não homologada. |
| E-mail controlado | PASS | `teste@refilinformatica.com.br` autorizado e sem supressão global observada. |
| Infraestrutura SMTP do fluxo | FAIL / P1 | Nenhum domínio de envio está configurado; principalmente, o convite atual não despacha mensagem, apenas gera link para cópia manual. |
| Sessão superadmin controlada | BLOQUEADO | Ambiente sem sessão autenticada disponível; nenhuma credencial foi solicitada, lida ou registrada. |

## 3. Contagens pré-teste e pós-parada

Leitura inicial sanitizada:

| Objeto | Antes | Depois da parada |
|---|---:|---:|
| Auth users | 6 | 6 |
| Profiles | 6 | 6 |
| Organizations | 2 | 2 |
| Subscriptions | 2 | 2 |
| Convites/jobs | 1 | 1 |
| Configurações fiscais | 1 | 1 |
| Pedidos B2B | 0 | 0 |
| Auth user do endereço controlado | 0 | 0 |
| Convite do endereço controlado | 0 | 0 |
| Organizações com prefixo D51.2 | 0 | 0 |

Estado dos jobs após a parada: 1 `ativo`, zero leases ativos. Não houve registro novo do gate.

## 4. Matriz E01–E21

Todos os cenários foram classificados como **NOT RUN** porque a parada ocorreu no pré-gate, antes da primeira mutação.

| ID | Status | Evidência/justificativa |
|---|---|---|
| E01 | NOT RUN | Nenhuma organização D51.2 criada. |
| E02 | NOT RUN | Nenhum convite criado. |
| E03 | NOT RUN | Fluxo não possui despacho SMTP; zero evento de entrega para o destinatário autorizado na janela. |
| E04 | NOT RUN | Nenhuma conta de teste criada. |
| E05 | NOT RUN | Nenhuma senha foi solicitada, lida ou alterada. |
| E06 | NOT RUN | Recovery depende da conta controlada e do fluxo autenticado. |
| E07 | NOT RUN | Sem convite inicial para reenviar. |
| E08 | NOT RUN | Sem link controlado criado; nenhum token foi exposto. |
| E09 | NOT RUN | Concorrência real não iniciada após condição de parada. |
| E10 | NOT RUN | Lease não foi criado ou expirado pelo gate. |
| E11 | NOT RUN | Takeover/fencing não executado. |
| E12 | NOT RUN | Fault injection não iniciada para evitar órfão sem sessão e cleanup comprovados. |
| E13 | NOT RUN | Retomada não iniciada. |
| E14 | NOT RUN | Reenvio simultâneo não iniciado. |
| E15 | NOT RUN | Segundo e-mail não autorizado; não foi inventada identidade B. |
| E16 | NOT RUN | Leitura estrutural encontrou zero superadmins com papel operacional, mas não substitui E2E. |
| E17 | NOT RUN | Nenhum tenant/plano de teste criado. |
| E18 | NOT RUN | Nenhuma tentativa de emissor executada. |
| E19 | NOT RUN | Nenhuma identidade fiscal criada. |
| E20 | NOT RUN | Terminalidade não exercitada com dado do gate. |
| E21 | NOT RUN | Não houve execução funcional para reconstruir; somente auditoria do pré-gate. |

## 5. P0/P1 e correções

### P1 confirmado — ausência de SMTP no convite

O fluxo `platform-invite-org-admin` usa Admin API para criar/retomar a conta e `generateLink` para produzir um link de recovery. `generateLink` não envia mensagem. A interface exibe o link completo e a senha temporária para cópia manual. Assim, o cenário E03 previsto não representa o comportamento implementado.

Nenhuma correção funcional foi aplicada nesta tentativa: incluir entrega SMTP altera o fluxo de autenticação e comunicação e exige desenho/revisão específica, preservando as flags de comunicação e o destinatário único. O gate permaneceu fail-closed.

### Bloqueio operacional — autenticação do executor

O E2E precisa de uma sessão controlada do superadmin para provar autorização negativa/positiva pela mesma fronteira usada pela aplicação. O projeto usa Supabase externo e esta sessão não estava disponível no ambiente. Não foi usado `service_role` como identidade chamadora e não foi solicitado segredo ao responsável.

## 6. SMTP

- Gerado: **não**.
- Aceito pelo provedor: **não testado**.
- Entregue: **não testado**.
- Link usado: **não**.
- Eventos visíveis para `teste@refilinformatica.com.br` desde o início do gate: **zero**.
- Supressão global do destinatário: **não encontrada**.
- Domínio de envio configurado no projeto: **não**.

Nenhum e-mail foi enviado nesta tentativa.

## 7. Auth, recovery e primeiro acesso

Não executados. O endereço autorizado tinha zero Auth users e zero convites antes do gate e permaneceu assim após a parada. Não houve criação, login, recovery, troca de senha, leitura de OTP ou revogação de sessão.

## 8. Concorrência, lease, fencing e hard crash

Não executados dinamicamente. A inspeção prévia confirmou os contratos estruturais — lock por e-mail, lease, token de fencing, validação de lease na finalização/falha e origem por `raw_app_meta_data` — mas isso não foi contabilizado como PASS E2E.

## 9. Isolamento A/B

Não executado. Não há segundo endereço autorizado e nenhuma identidade foi inventada. O cenário E15 continua pendente, salvo adaptação futura que demonstre isolamento sem criar segunda conta e seja aprovada antes da execução.

A leitura canônica encontrou zero superadmins simultaneamente associados ao papel operacional `administrador`.

## 10. Fiscal e planos

E17–E19 não foram executados. Nenhum cadastro geral, assinatura ou identidade fiscal de teste foi criado ou alterado.

## 11. Auditoria, logs e segredos

- Logs de Auth e Edge Functions na janela do gate: nenhum evento relacionado à execução.
- Eventos de e-mail para o destinatário autorizado: nenhum.
- Busca no frontend de produção por `SUPABASE_SERVICE_ROLE_KEY`/`service_role_key`: zero ocorrência.
- Nenhuma senha, token, OTP, cookie, Authorization, chave privilegiada ou link completo foi coletado ou registrado.
- Nenhuma screenshot foi produzida, pois não havia fluxo autenticado seguro a comprovar.

## 12. Leaked Password Protection

O linter antes da tentativa retornou 492 achados históricos, incluindo exatamente 1 warning `Leaked Password Protection Disabled`. O warning permanece aberto após a parada, sem mascaramento e sem declaração de resolução.

Status: **ADIADO / RISCO ACEITO TEMPORARIAMENTE**. A exceção não cobre nenhum outro P0/P1 de autenticação ou senha.

## 13. Cleanup

Não houve dado do gate para inativar ou remover. A contenção consistiu em não iniciar E01, E02 ou qualquer fault injection. As contagens e estados controlados permaneceram inalterados; auditoria histórica foi preservada.

## 14. Riscos e ações necessárias

1. Corrigir ou aprovar formalmente uma adaptação do E03 que realmente envie uma mensagem de autenticação ao único destinatário autorizado e permita observar aceitação sem expor o link.
2. Disponibilizar uma sessão autenticada controlada do superadmin na prévia; não fornecer credenciais por mensagem.
3. Definir uma adaptação aprovada para E15 sem segundo e-mail ou fornecer posteriormente um segundo endereço controlado.
4. Preparar fault injection e cleanup comprovadamente reversíveis antes de E09–E14.
5. Manter Leaked Password Protection visível como risco aceito e aberto.

## 15. Decisão objetiva

**NO-GO para encerrar D51 e NO-GO para considerar D52.**

O D51.2 foi iniciado apenas até o pré-gate e corretamente interrompido. Uma nova execução exige correção/revisão do caminho SMTP e sessão superadmin controlada. Não publicar e não avançar para D52.

## 16. D51.2-A — correção segura do caminho SMTP (sem envio real)

Data: 2026-10-02  
Commit candidato no início desta fase: `2218d95ff39c515e4f9565fa223e0059ce9d30a0`

### Diagnóstico da infraestrutura

- O Supabase canônico permanece `swzpzcwiasxmjutrmvkm`.
- O módulo Comunicação já possuía SMTP via `denomailer`, configuração server-side por `communication_provider_settings`/Vault com fallback de ambiente, flags de entrega, test mode com allowlist e adapter mockável.
- A fila geral já possui idempotency key, lease, tentativas, backoff e estados terminais. Os alertas legados síncronos não foram reutilizados porque não oferecem as mesmas garantias.
- Não foi encontrada configuração SMTP ativa: zero registros de provider e zero configuração com entrega/e-mail habilitados. Também não há domínio Lovable Email configurado.
- O mailer do Supabase Auth é uma infraestrutura distinta. `generateLink` somente cria o link; ele não comprova envio SMTP.
- Nenhum remetente ou domínio foi inventado. Nenhuma flag de entrega foi ativada.

### Arquitetura implementada

O fluxo existente `platform-invite-org-admin` agora:

1. persiste/reclama a intenção de provisionamento e retoma a mesma conta Auth por `raw_app_meta_data.provisioning_request_id`;
2. gera link de recovery apenas com redirect permitido para `/reset-password`;
3. conclui o vínculo Auth↔Postgres preservando o fencing existente;
4. reclama uma lease exclusiva de envio no mesmo job persistido;
5. carrega a configuração do módulo Comunicação e chama seu adapter SMTP;
6. confirma `accepted` ou registra `failed` com código sanitizado e cooldown;
7. nunca devolve `action_link`, token ou senha do modo link à interface.

A migration `20261002015343_ace68cd9-1438-46d2-a1dc-e6155763c467.sql` adicionou ao job os estados `pending/sending/accepted/failed`, tentativas, idempotency key, lease/token, cooldown, timestamps e erro sanitizado. As RPCs de claim/accept/fail validam `service_role` em código e têm EXECUTE revogado de `PUBLIC`, `anon` e `authenticated`.

Arquivos funcionais alterados:

- `supabase/functions/platform-invite-org-admin/index.ts`
- `supabase/functions/_shared/comunicacao/invite-email-delivery.ts`
- `src/hooks/usePlataformaSaaS.ts`
- `src/pages/plataforma/PlataformaAdmins.tsx`
- `supabase/migrations/20261002015343_ace68cd9-1438-46d2-a1dc-e6155763c467.sql`

### Semântica de idempotência e entrega

O contrato é **at-least-once com deduplicação local, lease, fencing e cooldown**, não exactly-once. SMTP/denomailer não fornece uma idempotency key reconhecida pelo provedor nem message id confiável. Se o SMTP aceitar a mensagem e a persistência de `accepted` falhar, o resultado fica explicitamente `ambiguous`; a conta não é removida, o link não é exposto e o operador deve aguardar o lease/cooldown antes de retomar. Essa janela pode produzir um reenvio limitado.

### Testes sem envio

| Verificação | Resultado |
|---|---|
| Typecheck | PASS |
| Testes focados D51.2-A | PASS — 4 arquivos, 60 testes |
| SMTP mock: sucesso/aceite | PASS |
| Provider falha → retomável | PASS |
| Crash antes do send | PASS |
| Crash após aceite e antes da persistência | PASS — estado ambíguo explícito |
| Destinatário derivado do claim server-side | PASS |
| Redirect/open redirect | PASS estrutural — origem inválida falha antes do claim; rota `/reset-password` confirmada |
| Resposta/UI sem action link | PASS |
| Grants RPC | PASS — somente `service_role`; `anon=false`, `authenticated=false` |
| Service role no cliente | PASS — nenhuma ocorrência funcional |
| Suíte global | PASS — 343 arquivos aprovados, 1 ignorado; 5.287 testes aprovados, 4 ignorados |
| Deno | PASS — 11/11 |
| Build automático | PASS após as alterações funcionais; typecheck final separado também PASS |

Nenhum e-mail, usuário, tenant ou pedido foi criado/processado nesta fase. As leituras finais mostraram um job histórico e zero leases de envio ativos.

### P1 e pré-condições para retomar D51.2

**P1 de código corrigido:** o modo link deixou de depender de cópia manual e possui caminho SMTP auditável, concorrente e fail-closed.

**Envio real ainda bloqueado**, até cumprir conjuntamente:

1. configurar no servidor o SMTP existente (host, porta, usuário, senha e remetente de domínio autorizado);
2. manter test mode ativo e allowlist contendo exclusivamente `teste@refilinformatica.com.br`;
3. habilitar deliberadamente as flags de entrega somente na janela controlada;
4. validar sender/domínio sem enviar para outro destinatário;
5. disponibilizar sessão controlada de superadmin e emitir novo comando explícito de E2E;
6. adaptar E15 sem segunda identidade ou fornecer segundo endereço previamente aprovado.

Leaked Password Protection permanece **ADIADA / RISCO ACEITO TEMPORARIAMENTE**, aberta, não resolvida e não homologada. Os 492 achados históricos do linter permanecem, incluindo esse warning; esta migration não acrescentou novos achados.

### Decisão D51.2-A

**GO técnico para configurar/homologar o SMTP existente; NO-GO para envio real, encerramento do D51 ou D52.**

## 17. D51.2-B — alinhamento do runtime e pré-condições manuais (sem envio)

Data: 2026-10-02  
Commit candidato confirmado: `8d7fb7e1dfe0902a9938773e4f6ef5525db569e7`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

### 17.1 Migration e objetos no runtime

A versão `20261002015343` consta uma vez no ledger remoto. O runtime contém, em `public.platform_org_admin_invites`, as dez colunas `email_*` previstas, os três constraints validados e o índice parcial `platform_org_admin_invites_email_delivery_idx`.

As RPCs remotas possuem as assinaturas esperadas:

- `platform_claim_org_admin_email_delivery(uuid, integer)`;
- `platform_accept_org_admin_email_delivery(uuid, uuid)`;
- `platform_fail_org_admin_email_delivery(uuid, uuid, text, integer)`.

As três são `SECURITY DEFINER`, têm `search_path` vazio e ACL efetiva apenas para `postgres` e `service_role`. Não há grant para `PUBLIC`, `anon` ou `authenticated`.

### 17.2 Estado fail-closed antes da implantação

Antes de implantar a função foram confirmados, somente por leitura:

- zero linhas em `communication_provider_settings`;
- entrega global efetiva desligada;
- entrega de e-mail efetiva desligada;
- test mode efetivo ligado por default fail-closed;
- allowlist efetiva vazia;
- host, porta, usuário, remetente e senha SMTP ausentes;
- zero leases de envio de convite ativos;
- zero registros com prefixo `TESTE D51.2`/`HOMOLOGAÇÃO D51.2`.

Logo, nenhum e-mail poderia ser disparado acidentalmente pelo fluxo de convite. Nenhuma configuração foi criada ou alterada.

### 17.3 Edge Function implantada e chamadas negativas

O runtime não expôs conteúdo/fingerprint remoto comparável e não havia histórico de invocação que permitisse provar equivalência com o repositório. Os fingerprints SHA-256 locais foram coletados sem conteúdo sensível; o arquivo principal tinha fingerprint `2c542a9e…1932b`.

Como todos os bloqueios de entrega foram comprovados antes, foi implantada **somente** `platform-invite-org-admin`, incluindo no bundle apenas suas dependências compartilhadas. O frontend e as demais funções não foram implantados. A implantação bem-sucedida passou a ser a evidência de alinhamento do código atual com o runtime.

Após a implantação:

- requisição sem `Authorization`: HTTP `401`, `UNAUTHORIZED_NO_AUTH_HEADER`;
- requisição com JWT deliberadamente inválido: HTTP `401`, `UNAUTHORIZED_INVALID_JWT_FORMAT`.

Os dois casos falharam no gateway antes de qualquer lógica de negócio. Não foi enviado destinatário, não houve mutação e nenhum segredo apareceu na resposta.

### 17.4 Interface existente e bloqueio do singleton ausente

A interface oficial já existe em **`/configuracoes?tab=comunicacao`**, aba **Comunicação**, visível para papel operacional `administrador` quando o módulo Comunicação está habilitado. Ela chama `communication-provider-settings`, exige JWT e papel `administrador`, aplica rate limit e grava tudo por uma RPC transacional server-side.

Campos necessários para homologação SMTP:

| Grupo | Campo/ação | Estado exigido no D51.2 |
|---|---|---|
| SMTP | host | Valor fornecido pelo provedor; não definido nesta auditoria. |
| SMTP | port | Valor fornecido pelo provedor; faixa 1–65535. |
| SMTP | username | Login fornecido pelo provedor. |
| SMTP | password/API key | Segredo fornecido pelo provedor. |
| SMTP | from/sender | E-mail remetente previamente autorizado/verificado no provedor. |
| TLS | secure | Não há campo separado: porta `465` ativa TLS implícito no adapter; demais portas usam o modo não implícito do cliente SMTP. Confirmar a modalidade exigida pelo provedor. |
| Homologação | test mode | Manter **ON**. |
| Homologação | allowed emails | Substituir a lista por exclusivamente `teste@refilinformatica.com.br`. |
| Entrega | Entrega global | Ativar somente na janela E2E, depois das demais validações. |
| Entrega | Entrega por e-mail (SMTP) | Ativar somente na janela E2E, depois das demais validações. |
| Demais canais | WhatsApp, in-app e webhook | Manter desligados. |

A senha não vai para segredo de Edge Function: a interface a grava no **Supabase Vault canônico**, sob nome lógico rotativo iniciado por `comm_smtp_password_`; `communication_provider_settings.secret_smtp_password` armazena somente o UUID da referência. O valor nunca retorna ao frontend.

Entretanto, a interface está atualmente **bloqueada**: o singleton esperado `communication_provider_settings.id = 1` não existe. A RPC falha fechada com `settings_row_missing` e não cria a linha implicitamente. Antes de qualquer configuração manual é obrigatório restaurar esse singleton por migration versionada, idempotente e auditada, preservando defaults desligados. Não usar edição manual ad hoc nem escrever diretamente no Vault.

### 17.5 Sender/domínio

Não há sender SMTP configurado e não existe evidência de domínio remetente verificado no mecanismo externo do projeto. Também não há domínio configurado na infraestrutura Lovable Emails. Isso não deve ser confundido com o SMTP próprio do módulo Comunicação nem com o mailer do Supabase Auth.

Para retomar, o responsável deve obter do provedor SMTP os valores reais e comprovar a autorização do endereço/domínio remetente no próprio provedor, sem enviar valores secretos por chat. A senha/API key deve ser digitada apenas na tela segura após o reparo do singleton.

### 17.6 Sessão superadmin controlada

O banco possui uma identidade com papel `superadmin`, mas nenhum identificador pessoal foi coletado ou registrado. O ambiente foi identificado como Supabase externo não gerenciado (`external_unmanaged`), portanto o mecanismo automatizado `lovable auth-session` não consegue cunhar/injetar uma sessão do Supabase deste app. Uma sessão Lovable da prévia também não substitui a sessão Auth do Cultivo Farm.

O caminho oficial disponível é o responsável autenticar manualmente a conta controlada na tela **`/auth`** da prévia, sem compartilhar senha no chat. A aplicação usa `signInWithPassword` e direciona o papel `superadmin` para **`/plataforma`**, onde o gate server-side continua obrigatório. `service_role` não será usado como identidade E2E.

Limitação operacional: a automação desta sessão não está disponível neste ambiente externo não gerenciado. A futura execução autenticada deve ocorrer com o responsável já conectado na prévia e com um mecanismo de observação aprovado, ou ser classificada como manual; nenhuma credencial deve ser fornecida ao agente.

### 17.7 Warning e decisão

O linter continua com 492 achados históricos, incluindo exatamente um `Leaked Password Protection Disabled`. O warning permanece **ADIADO / RISCO ACEITO TEMPORARIAMENTE**, aberto, não resolvido e não homologado.

Nenhum e-mail foi enviado, nenhum usuário/tenant foi criado, E01–E21 não foram executados, nenhum frontend foi publicado e D52 não foi iniciado.

**NO-GO para configurar SMTP e NO-GO para retomar o D51.2 neste estado.** Pré-condições restantes, em ordem:

1. aprovar e aplicar reparo versionado/idempotente do singleton `communication_provider_settings.id = 1`, com defaults fail-closed;
2. comprovar sender/domínio no provedor SMTP externo;
3. entrar como `administrador` operacional em `/configuracoes?tab=comunicacao` e configurar host, porta, usuário, remetente e senha pelo Vault, mantendo todas as flags OFF;
4. manter test mode ON e allowlist exclusiva `teste@refilinformatica.com.br`;
5. disponibilizar sessão manual controlada do `superadmin` em `/auth`, sem senha no chat;
6. receber comando explícito para a janela E2E e só então habilitar Entrega global + E-mail;
7. manter E15 pendente/adaptado sem inventar segundo destinatário.

## 18. D51.2-C — reparo do singleton SMTP com defaults fail-closed

Data: 2026-10-02  
Migration aplicada: `20261002020825_6f7efb7f-fd4c-4bc1-8dcc-ccec421cd9ed.sql`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

### 18.1 Preflight e desenho

Antes da escrita, o schema remoto confirmou `id smallint` com `CHECK (id = 1)` e chave primária, cinco flags de entrega com default `false`, `test_mode_enabled` com default `true`, allowlists vazias por default, SMTP e referências de segredo anuláveis. A tabela estava vazia, com RLS ativo, sem policies e sem triggers.

A migration insere explicitamente somente `id = 1`, com todas as flags de entrega desligadas, modo de teste ligado, allowlists vazias, SMTP/WhatsApp/segredos nulos e autoria nula. `ON CONFLICT (id) DO NOTHING` torna a execução idempotente e preserva integralmente uma linha que apareça entre preflight e aplicação. Não há `UPDATE`, acesso ao Vault, alteração de função, policy ou grant.

### 18.2 Aplicação e estado remoto

- Ledger: versão `20261002020825` presente exatamente uma vez.
- Tabela: exatamente uma linha total e exatamente uma linha com `id = 1`.
- Entrega global, e-mail, WhatsApp, in-app e webhook: **OFF**.
- Test mode: **ON**.
- Allowlist de e-mails e telefones: vazias.
- Host, porta, usuário, remetente e referência de senha SMTP: ausentes.
- Campos e referências secretas de WhatsApp: ausentes.
- `updated_by`: nulo.
- Vault: não acessado.

A configuração manual pela interface `/configuracoes?tab=comunicacao` deixa de estar bloqueada por `settings_row_missing`. Nenhum host, porta, usuário, senha, remetente ou destinatário autorizado foi configurado nesta fase.

### 18.3 RLS, grants, RPCs e advisors

RLS permanece ativo e não existem policies na tabela; portanto `anon` e `authenticated` não obtêm acesso direto efetivo. A migration não alterou ACLs. A auditoria encontrou ACLs históricas amplas para essas roles apesar do bloqueio por RLS; isso é divergência de hardening preexistente, não introduzida no D51.2-C, e deve ser tratada separadamente para não exceder a autorização de restaurar apenas o singleton.

As quatro RPCs de configuração continuam `SECURITY DEFINER`, com `search_path = public, vault` e ACL somente para `postgres`/`service_role`. O linter permaneceu em 492 achados históricos: 17 infos de RLS sem policy, 2 warnings de função `SECURITY DEFINER` pública, 472 warnings para autenticados e 1 warning de Leaked Password Protection. Delta do D51.2-C: **zero novo achado**. Leaked Password Protection segue **ADIADA / RISCO ACEITO TEMPORARIAMENTE**, aberta e não resolvida.

### 18.4 Testes e decisão

Foi adicionado contrato automatizado para provar bootstrap fail-closed, idempotência por conflito, ausência de sobrescrita e ausência de Vault/permissões na migration.

| Verificação | Resultado |
|---|---|
| Contrato D51.2-C | PASS — 3/3 |
| Suíte focada de provider settings | PASS — 35/35 em 2 arquivos |
| Typecheck | PASS |
| Suíte global | PASS — 344 arquivos aprovados, 1 ignorado; 5.290 testes aprovados, 4 ignorados |
| Linter Supabase | Sem delta — 492 achados históricos |
| Security scan | Sem achado relacionado ao singleton; achados históricos fora do escopo preservados |
| Build automático | PASS após a migration; revalidação final registrada pelo ambiente após os ajustes de teste/documentação |

Duas inferências de literal em mocks SMTP preexistentes foram explicitamente tipadas como `AdapterResult`; isso não altera o runtime e fecha o contrato do typecheck.

**D51.2-C concluído quanto ao reparo do singleton.** A configuração SMTP manual está desbloqueada, mas envio e E2E continuam em **NO-GO** até comprovar sender/domínio, configurar credenciais pela interface segura com flags OFF e obter sessão manual superadmin. Nenhum e-mail, usuário, tenant ou pedido foi criado; E01–E21 não foram executados, o frontend não foi publicado e D52 não foi iniciado.

## 19. D51.2-D — hardening ACL e preflight SMTP sem envio

Data: 2026-10-02  
Migration aplicada: `20261002021548_3e72386c-e049-42b4-8022-39f99b4d4cab.sql`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

### 19.1 ACL antes/depois

O preflight remoto confirmou owner `postgres`, RLS ativo, zero policies e ausência de sequência associada: `id` é `smallint DEFAULT 1`. Antes do reparo, `anon` e `authenticated` possuíam ACL histórica completa na tabela, embora a ausência de policies já impedisse acesso efetivo pela Data API. A UI não dependia dessas ACLs: `/configuracoes?tab=comunicacao` usa exclusivamente `supabase.functions.invoke("communication-provider-settings")`; a Edge Function valida JWT e papel `administrador`, usa `service_role` no servidor para leitura e chama RPC server-only para mutação.

A migration idempotente revogou todos os privilégios diretos de `PUBLIC`, `anon` e `authenticated`, preservou owner e `service_role`, e incluiu pós-condição fail-fast. Um bloco condicional também revoga uma eventual sequência legada, sem criar objeto. Estado após aplicação:

- ACL da tabela: somente `postgres` e `service_role`;
- `anon` e `authenticated`: `SELECT/INSERT/UPDATE/DELETE = false`;
- `service_role`: leitura e escrita preservadas;
- RLS continua ativa, sem policies;
- RPCs de configuração/runtime continuam `SECURITY DEFINER`, com `search_path` explícito e execução somente por `postgres`/`service_role`;
- ledger: versão `20261002021548` presente exatamente uma vez.

### 19.2 Preflight SMTP sanitizado

O GET administrativo existente de `communication-provider-settings` passou a incluir `smtp_readiness`, calculado no servidor sem abrir socket SMTP e sem enviar mensagem. A resposta contém somente:

- `singleton_exists`;
- flags `delivery_enabled`, `email_delivery_enabled` e `test_mode_enabled`;
- `allowed_email_count` e `test_email_allowlisted`, este último calculado exclusivamente para `teste@refilinformatica.com.br`;
- booleanos de presença de host, porta, usuário, referência de senha e remetente;
- `ready_for_controlled_test`.

`ready_for_controlled_test` somente é verdadeiro quando o singleton existe, entrega global/e-mail estão ligadas, test mode está ligado, o único destinatário controlado esperado consta da allowlist e todos os cinco itens SMTP estão configurados. O preflight não retorna senha, referência Vault, token ou allowlist em texto claro. Host/usuário/remetente antigos continuam no payload administrativo já existente, sem ampliação; a nova seção é somente booleana. A autorização administrativa e o rate limit ocorrem antes da leitura.

No estado pós-D51.2-D, o singleton continua fail-closed: entrega global/e-mail OFF, test mode ON, allowlist vazia e SMTP ausente. Portanto a prontidão esperada é **false**. O endpoint implantado respondeu HTTP 401 a JWT inválido; nenhum estado foi alterado. O teste Deno específico retornou `No test modules found`; a cobertura aplicável foi feita por cinco testes Vitest do helper puro e dos contratos estáticos.

### 19.3 E15A com identidade única — somente preparação

A adaptação é tecnicamente válida como prova **parcial e unidirecional**: criar futuramente Tenant B sem administrador/e-mail e, com a única sessão controlada do Admin A, tentar ler e mutar recursos conhecidos de B. Isso prova A → B sem inventar segundo destinatário, mas não prova B → A nem isolamento entre duas sessões administrativas; portanto deve ser registrada como **E15A parcial**, nunca como E15 completo.

Ordem preparada para futura execução autenticada, não executada nesta fase:

1. provisionar Tenant A e Admin A pelos fluxos D51.2 autorizados;
2. criar Tenant B de homologação sem convite, usuário ou segundo administrador;
3. registrar IDs mascarados de B por canal técnico de auditoria, sem expô-los ao Admin A pela aplicação;
4. com sessão real do Admin A, consultar `organizations` filtrando pelo ID de B e esperar zero linha/erro seguro;
5. tentar uma mutação suportada em recurso de B e esperar zero linha/negação de autorização;
6. confirmar no banco que nenhum vínculo, perfil, papel, tenant ou recurso B mudou;
7. repetir controles positivos apenas em A, preservar auditoria e executar cleanup suportado.

Não usar SQL privilegiado nem `service_role` como identidade do teste. Não usar RPC que possa inicializar configuração fiscal ou produzir efeito colateral antes de revisar nominalmente sua autorização. Sem uma sessão autenticada e sem executar essas ações, **E15A: NOT RUN / caminho autenticado não verificado**.

### 19.4 Validações e decisão

| Verificação | Resultado |
|---|---|
| Migration ACL idempotente e pós-condição | PASS |
| ACL remota `anon`/`authenticated` direta | PASS — nenhum privilégio |
| `service_role` e RPCs preservados | PASS — catálogo remoto + contratos |
| Preflight sanitizado/sem envio | PASS — 5/5 testes focados |
| Suíte focada provider/ACL | PASS — 40/40 |
| Typecheck | PASS |
| Suíte global | PASS — 345 arquivos aprovados, 1 ignorado; 5.295 testes aprovados, 4 ignorados |
| Chamada negativa da Edge Function | PASS — HTTP 401 com JWT inválido |
| Linter Supabase | Sem delta — 492 achados históricos |
| Estado de envio/lease | PASS — zero `sending`/`accepted` e zero lease ativo |

**D51.2-D concluído no escopo autorizado.** Continuam pendentes: comprovação de sender/domínio, configuração manual de SMTP/Vault com flags inicialmente OFF, allowlist exclusiva, sessão manual superadmin e comando explícito para E01–E21. Leaked Password Protection permanece **ADIADA / RISCO ACEITO TEMPORARIAMENTE**, aberta. Nenhum e-mail, credencial, usuário, tenant ou pedido foi criado/configurado; nenhum E2E foi executado, não houve publicação de frontend e D52 não foi iniciado.

## 20. D51.2-E — UX de prontidão e sanitização do teste SMTP

Data: 2026-10-02  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

### 20.1 Diagnóstico e correção

O `smtp_readiness` já era retornado pela função administrativa, mas não era exibido na aba Comunicação. O teste SMTP também possuía um desvio de segurança: apesar de validar JWT e papel `administrador`, aceitava qualquer e-mail sintaticamente válido, ignorava test mode/allowlist/flags, abria o SMTP por implementação própria e devolvia ao navegador host, porta, remetente, destinatário, exceção e mensagens brutas do provedor. A UI registrava esse corpo bruto no console e o mostrava parcialmente em toasts.

A tela `/configuracoes?tab=comunicacao` agora exibe o card **Prontidão SMTP para homologação**, derivado somente dos booleanos server-side existentes. O checklist cobre singleton, host, porta, usuário, senha, remetente, test mode, allowlist controlada, entrega global e entrega por e-mail, com resultado final **Não pronto** ou **Pronto para teste controlado**. Enquanto qualquer flag de entrega estiver desligada, a tela informa **Configuração preservada; envio bloqueado**. Salvar credenciais continua sem ativar flags.

O destinatário do teste foi fixado na interface e novamente no servidor como exclusivamente `teste@refilinformatica.com.br`. O botão permanece desabilitado quando `ready_for_controlled_test` é falso. A Edge Function agora:

1. restringe CORS às origens administrativas já aprovadas;
2. valida JWT e papel `administrador`;
3. aplica rate limit server-side de três tentativas por cinco minutos;
4. carrega a configuração efetiva fail-closed;
5. exige entrega global/e-mail ON, test mode ON, destinatário controlado na allowlist e configuração SMTP completa;
6. bloqueia destinatário diferente ou preflight incompleto **antes** de chamar o adapter/importar o cliente SMTP;
7. reutiliza o adapter SMTP compartilhado;
8. retorna somente `ok` e código allowlisted, sem host, porta, remetente, destinatário, detalhe bruto, exceção, token ou segredo.

A UI deixou de registrar `rawBody`, resposta integral ou exceções no console e passou a mostrar somente mensagens correspondentes a códigos sanitizados. Nenhuma chamada do teste SMTP foi feita nesta etapa.

Arquivos funcionais alterados:

- `src/pages/configuracoes/ComunicacaoConfigTab.tsx`;
- `supabase/functions/test-communication-email/index.ts`;
- `supabase/functions/_shared/comunicacao/controlled-smtp-test.ts`.

Teste adicionado: `src/test/comunicacao/d51-2-e-smtp-ux-security.test.ts`.

### 20.2 Validações

| Verificação | Resultado |
|---|---|
| Checklist e estados finais derivados de `smtp_readiness` | PASS |
| Botão bloqueado quando readiness é falso | PASS |
| Destinatário fixo/controlado na UI e no servidor | PASS |
| Destinatário externo bloqueado antes do adapter/socket | PASS |
| Preflight incompleto bloqueado antes do adapter/socket | PASS |
| Resposta e console sem corpo bruto/host/porta/detalhe/segredo | PASS |
| Autorização administrativa + rate limit | PASS |
| Testes focados | PASS — 4 arquivos, 57 testes |
| Typecheck | PASS |
| Suíte global | PASS — 346 arquivos aprovados, 1 ignorado; 5.300 testes aprovados, 4 ignorados |
| Build automático | PASS |

### 20.3 Estado e decisão

**D51.2-E concluído no escopo autorizado.** O SMTP permanece não configurado e não pronto; nenhum e-mail foi enviado, nenhuma credencial foi gravada, nenhum usuário/tenant foi criado, E01–E21 permanecem NOT RUN e não houve publicação ou avanço D52.

Próximos passos manuais permanecem: comprovar sender/domínio, configurar SMTP e allowlist exclusiva pela UI segura com flags inicialmente OFF, obter sessão manual superadmin e aguardar comando explícito para a janela E2E. Leaked Password Protection continua **ADIADA / RISCO ACEITO TEMPORARIAMENTE**, aberta e não resolvida.

## 21. D51.2-F — isolamento SaaS da configuração global SMTP

Data: 2026-10-02  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`  
Commit candidato verificado antes do deploy: `ccea57fac61f7b7e4966890dc3d88e733ddecab4`

### 21.1 Risco comprovado e classificação

`public.communication_provider_settings` é um singleton global (`id=1`) e não possui vínculo com organização. Antes da correção, `communication-provider-settings` e `test-communication-email` autorizavam o papel operacional `administrador`; como esse papel não identifica um administrador da plataforma, qualquer administrador tenant autenticado poderia alcançar leitura/alteração da configuração global e o teste SMTP. O risco foi classificado como **P1 de isolamento SaaS**.

A autorização não dependia de `user_metadata`, mas usava a categoria de papel errada para um recurso global. A RPC técnica de persistência permanece concedida somente a `postgres`/`service_role`; não há grant direto para `anon` ou `authenticated`, e workers continuam usando a fronteira técnica existente.

### 21.2 Correção aplicada

- ambas as Edge Functions agora validam o JWT e consultam `is_platform_superadmin(sub)` no servidor;
- retorno falso ou erro da verificação falha fechado com `403`; ausência ou JWT inválido retorna `401`, sempre com códigos sanitizados;
- papel tenant, `user_metadata` e estado informado pelo frontend não participam da autorização;
- readiness, test mode, allowlist, rate limit e bloqueio antes do socket foram preservados;
- `ComunicacaoConfigTab` continua sendo o componente único, removido de `/configuracoes` e reutilizado na aba **Comunicação** de `/plataforma`;
- `/plataforma` permanece protegida por `PlataformaGuard`, que exige `superadmin`, sem conceder papel operacional `administrador` ao superadmin;
- não foi criada rota, tabela, provider ou tela paralela.

Arquivos funcionais alterados:

- `supabase/functions/communication-provider-settings/index.ts`;
- `supabase/functions/test-communication-email/index.ts`;
- `src/pages/configuracoes/ComunicacaoConfigTab.tsx`;
- `src/pages/Configuracoes.tsx`;
- `src/pages/plataforma/PlataformaHome.tsx`.

Contratos adicionados/ajustados:

- `src/test/comunicacao/d51-2-f-saas-isolation.test.ts`;
- `src/test/comunicacao/d51-2-e-smtp-ux-security.test.ts`;
- `src/test/comunicacao/d51-2-d-acl-readiness.test.ts`.

### 21.3 Preflight, deploy restrito e verificações negativas

Imediatamente antes do deploy, o estado sanitizado do canônico confirmou: singleton único; entrega global OFF; entrega por e-mail OFF; test mode ON; allowlist vazia; host, porta, usuário, remetente e senha ausentes; zero lease de e-mail ativo. Portanto, nenhum envio acidental era possível.

Foram implantadas **somente** `communication-provider-settings` e `test-communication-email`, incluindo seus imports compartilhados. Nenhum frontend ou outra função foi publicado. Depois do deploy:

| Chamada negativa | Resultado |
|---|---|
| Provider settings sem JWT | HTTP 401, `unauthorized` sanitizado |
| Provider settings com JWT inválido | HTTP 401, `invalid_token` sanitizado |
| Teste SMTP sem JWT | HTTP 401, `unauthorized` sanitizado |
| Teste SMTP com JWT inválido | HTTP 401, `invalid_token` sanitizado |

O pós-deploy reconfirmou o mesmo estado fail-closed e zero lease ativo. Nenhuma chamada usou destinatário, nenhum socket SMTP foi aberto e nenhuma mutação operacional foi realizada. O caso tenant admin autenticado → 403 foi comprovado por contrato/mock estrutural; não foi executado contra produção por ausência deliberada de sessão tenant nesta fase.

### 21.4 Validações

| Verificação | Resultado |
|---|---|
| Tenant admin bloqueado antes de leitura/mutação/socket | PASS — contratos focados |
| Superadmin autorizado estruturalmente sem papel operacional | PASS — contratos focados |
| Anônimo/JWT inválido | PASS — contratos + HTTP 401 pós-deploy |
| Workers/RPC `service_role` preservados | PASS — ACL/contratos |
| UI tenant sem provider global | PASS |
| Mesmo componente reutilizado em `/plataforma` | PASS |
| Testes focados | PASS — 5 arquivos, 63 testes |
| Typecheck | PASS |
| Suíte global | PASS — 347 arquivos aprovados, 1 ignorado; 5.307 testes aprovados, 4 ignorados |
| Build | PASS |
| `git diff --check` | PASS |
| Linter Supabase | Sem delta — 492 achados históricos, incluindo Leaked Password Protection |

### 21.5 Estado e decisão

**P1 corrigido no código e nas duas Edge Functions do canônico. D51.2-F concluído no escopo autorizado.** O frontend foi apenas preparado na prévia/código e não publicado em produção.

O Gate D51.2 permanece **NO-GO para E01–E21 e para encerramento**: ainda faltam comprovação de sender/domínio, configuração manual de SMTP/Vault pelo Superadmin em `/plataforma` com flags inicialmente OFF, sessão manual superadmin controlada e novo comando explícito. E15A continua apenas planejado e parcial. Leaked Password Protection permanece **ADIADA / RISCO ACEITO TEMPORARIAMENTE**, aberta e não resolvida. Nenhum SMTP foi configurado, nenhum e-mail foi enviado, nenhum usuário/tenant foi criado e D52 não foi iniciado.

## 22. Retomada D51.2 — pré-check da janela E2E

Data/hora da parada: `2026-10-02T02:52:39Z`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`  
Commit candidato: `c8b2e65bfc16100f8c20b5bbf343c408536878a5`

### 22.1 Resultado somente leitura

| Pré-check | Resultado |
|---|---|
| Binding canônico | PASS |
| Commit candidato registrado | PASS |
| SMTP completo e flags global/e-mail ON | PASS — somente presença/booleanos, sem valores expostos |
| Test mode ON | PASS |
| Allowlist exclusivamente controlada | **FAIL — contém 3 endereços; esperado exatamente 1** |
| WhatsApp OFF | PASS |
| In-app OFF | **FAIL — estava ON** |
| Webhook WhatsApp OFF | PASS |
| Lease de envio anterior ativo | PASS — zero |
| Sessão real superadmin disponível às ferramentas | **FAIL — chamada autenticada não recebeu sessão e retornou HTTP 401** |
| Conflitos D51.2 preexistentes | PASS — zero Auth user controlado, zero convite controlado e zero organização D51.2 |
| Forward-fix `raw_app_meta_data` | PASS |
| Leaked Password Protection | EXCEÇÃO ACEITA — warning ainda presente e não mascarado |

Baseline sanitizado preservado: 6 Auth users, 6 profiles, 2 organizações, 2 assinaturas, 1 convite histórico, 1 configuração fiscal e 0 pedidos B2B.

### 22.2 Parada e ação necessária

Conforme a regra principal, a execução parou **antes de qualquer mutação e antes de E01**. Não houve criação de tenant, usuário ou convite; nenhum e-mail foi enviado; E01–E21 continuam `NOT RUN`.

Para uma nova retomada, o Superadmin de Plataforma deve, pela aba Comunicação de `/plataforma`, substituir a allowlist para conter somente `teste@refilinformatica.com.br` e desligar notificações in-app, preservando WhatsApp e webhook OFF. Depois, deve permanecer autenticado na prévia e iniciar uma nova mensagem de retomada para que a sessão possa ser validada sem senha, token ou `service_role`.

**Decisão: NO-GO.** Leaked Password Protection permanece **ADIADA / RISCO ACEITO TEMPORARIAMENTE**, aberta e não resolvida. D52 não foi iniciado.

## 23. Retomada D51.2 após correção da configuração

Data/hora UTC do fechamento desta tentativa: `2026-10-02T03:00:07Z`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`  
Commit candidato: `a324f0f447fc3848c13404d114ab1198205aa8b7`

### 23.1 Novo pré-check somente leitura

| Pré-check | Resultado |
|---|---|
| Binding canônico | PASS — ref canônico confirmado |
| Test mode | PASS — ON |
| Allowlist | PASS — exatamente 1 entrada, correspondente ao endereço controlado autorizado |
| Entrega global | PASS — ON |
| Entrega por e-mail | PASS — ON |
| WhatsApp | PASS — OFF |
| In-app | PASS — OFF |
| Webhook | PASS — OFF |
| SMTP | PASS — host, porta, usuário, referência de senha e remetente presentes; valores não coletados no relatório |
| Leases ativos | PASS — zero |
| Conflito Auth do endereço controlado | PASS — zero |
| Conflito de convite do endereço controlado | PASS — zero |
| Organização/convite com marca D51.2 | PASS — zero |
| Sessão real do Superadmin nas ferramentas | **FAIL — indisponível; endpoint administrativo respondeu HTTP 401** |
| Leaked Password Protection | EXCEÇÃO ACEITA — warning permanece presente, aberto e não mascarado |

O linter permaneceu com 492 achados históricos, incluindo o warning de Leaked Password Protection. Nenhuma configuração, credencial ou dado foi alterado neste pré-check.

### 23.2 Cobertura segura sem sessão de navegador

Como a configuração ficou verde, mas a sessão real continuou indisponível, foram executadas somente provas sem identidade simulada e sem mutação:

- `communication-provider-settings`, `test-communication-email` e `platform-invite-org-admin` rejeitaram JWT inválido com HTTP 401 e resposta sanitizada;
- contratos focados D51.2: 7 arquivos, 50 testes aprovados;
- suíte global: 347 arquivos aprovados, 1 ignorado; 5.307 testes aprovados, 4 ignorados;
- typecheck: PASS;
- build observado do candidato: PASS;
- testes Deno direcionados: `NOT RUN` técnico — as três funções não possuem módulos Deno de teste; o runner retornou `No test modules found`, sem chamada de runtime e sem mutação;
- estado remoto posterior: zero jobs `sending`, zero jobs `accepted` e zero lease ativo;
- grants das RPCs de envio permanecem restritos a papéis técnicos. As garantias de lease, fencing, cooldown, retomada por `raw_app_meta_data`, ausência de `action_link` na resposta e sanitização foram confirmadas por contratos/mocks, não como E2E remoto.

### 23.3 Matriz E01–E21 nesta retomada

| Cenário | Estado | Evidência/limite |
|---|---|---|
| E01 criação de empresa | NOT RUN | Exige sessão real de Superadmin; nenhuma organização criada. |
| E02 convite do administrador | NOT RUN | Exige sessão real; nenhum convite ou Auth user criado. |
| E03 entrega SMTP | NOT RUN | Nenhum e-mail enviado sem o fluxo autenticado. |
| E04 primeiro acesso | NOT RUN | Depende de E02/E03 e interação manual segura. |
| E05 definição/troca de senha | PARCIAL | Política e fluxo server-side aprovados por contratos; nenhum acesso real executado. |
| E06 recovery | PARCIAL | Rota, evento de recovery e remoção de token da URL aprovados por contratos; nenhum e-mail/link real usado. |
| E07 reenvio | PARCIAL | Reuso da conta e ausência de `listUsers` aprovados por contrato; nenhuma retomada remota executada. |
| E08 link usado/vencido | NOT RUN | Exige link real e interação manual; nenhum token foi gerado ou exposto. |
| E09 concorrência | PARCIAL | Serialização por e-mail e lock aprovados por contrato; sem concorrência remota em fixture. |
| E10 lease maior que duração | PARCIAL | Validade do lease aprovada por contrato; sem relógio/fixture remota. |
| E11 takeover/fencing | PARCIAL | Token distinto e rejeição de lease obsoleto aprovados por contrato; sem takeover remoto. |
| E12 hard crash Auth↔Postgres | PARCIAL | Retomada por marcador imutável e compensações aprovadas por contrato/mock; sem Auth user real. |
| E13 retomada sem duplicar usuário | PARCIAL | Reuso da conta e proibição de busca ampla aprovados por contrato; contagem preexistente permaneceu zero. |
| E14 reenvio simultâneo | PARCIAL | Claim server-side, fencing e cooldown aprovados por contrato; sem duas chamadas mutantes remotas. |
| E15 isolamento tenant A/B | NOT RUN | E15A também exige Admin A autenticado e Tenant B controlado; nenhuma segunda identidade foi inventada. |
| E16 superadmin sem papel operacional | PARCIAL | Guards e autorização server-side aprovados por contratos; sessão real indisponível. |
| E17 plano sem fiscal cria cadastro geral | NOT RUN | Exige criação controlada autenticada. |
| E18 plano sem fiscal não cria emissor | NOT RUN | Exige E17. |
| E19 plano com fiscal cria identidade fiscal | NOT RUN | Exige dados sintéticos válidos e fluxo autenticado. |
| E20 terminal/idempotente | PARCIAL | Estado terminal e retorno idempotente aprovados por contrato; nenhuma execução remota concluída. |
| E21 auditoria completa | PARCIAL | Pré/pós-contagens, chamadas negativas e logs sanitizados coletados; falta trilha de uma execução E2E real. |

Nenhum cenário foi promovido a `PASS E2E` com base apenas em contrato, mock ou inspeção. Não houve fault injection mutante no canônico, pois isso exigiria criar fixtures remotas e exercer RPCs técnicas sem uma identidade E2E real; `service_role` não foi usado para fingir Superadmin.

### 23.4 Estado, cleanup e decisão

Não houve mutação, portanto não existiam tenant, usuário, convite, sessão ou dado fiscal D51.2 para limpar. As flags global/e-mail permanecem ON porque a janela autorizada não chegou a realizar envio; isso requer decisão manual do responsável: manter a janela aberta para a próxima retomada imediata ou desligá-las na aba Comunicação de `/plataforma`.

**Decisão: NO-GO para encerrar o D51 e considerar D52.** A configuração SMTP está pronta, mas E01–E04, E08, E15A e os cenários fiscal/plano continuam sem prova E2E por ausência da sessão real nas ferramentas. Para avançar, o responsável deve manter o Superadmin autenticado na prévia e iniciar nova retomada; se a ferramenta continuar sem receber a sessão, será necessária execução manual assistida no navegador, sem compartilhar senha, link, token ou OTP. Leaked Password Protection continua **ADIADA / RISCO ACEITO TEMPORARIAMENTE**, aberta e não resolvida.

## 24. Fechamento da janela SMTP após o pré-check

Data/hora UTC: `2026-10-02T03:02:35Z`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`  
Commit candidato observado antes da atualização documental: `b63c008c68f3513fde453c0615392d2777b94f17`

### 24.1 Alteração controlada

A janela foi fechada pelo mecanismo server-side existente `rpc_service_apply_provider_settings`, com alteração exclusiva de:

- `delivery_enabled`: `true` → `false`;
- `email_delivery_enabled`: `true` → `false`.

A RPC retornou sucesso e registrou somente esses dois campos na auditoria, sem operação de segredo. Não houve envio de e-mail, criação de usuário, convite ou tenant.

### 24.2 Verificação posterior sanitizada

| Controle | Estado final |
|---|---|
| Entrega global | OFF |
| Entrega por e-mail | OFF |
| Test mode | ON |
| Allowlist | 1 entrada, exatamente o destinatário controlado autorizado |
| SMTP | host, porta, usuário, referência de senha e remetente presentes; valores não expostos |
| WhatsApp | OFF |
| In-app | OFF |
| Webhook WhatsApp | OFF |
| Lease de e-mail ativo | zero |
| Vault | referência preservada; nenhum segredo removido ou alterado |

A configuração SMTP permanece preservada, porém fail-closed: não está pronta para envio enquanto as duas flags de entrega estiverem OFF.

### 24.3 Retomada manual assistida — E01/E02

O Supabase é externo não gerenciado; a sessão real aberta pelo Superadmin no navegador não é disponibilizada às ferramentas. Não usar `service_role`, senha compartilhada ou identidade simulada para substituir essa sessão.

Passos exatos para iniciar a retomada pela UI:

1. Na prévia, entrar normalmente como Superadmin e abrir `/plataforma`.
2. Abrir a aba **Comunicação** e confirmar: Test mode ON; 1 e-mail permitido; SMTP com todos os itens configurados; WhatsApp, In-app e Webhook OFF.
3. Somente imediatamente antes da janela autorizada, ligar **Entrega global** e **E-mail**, salvar e confirmar “Pronto para teste controlado”. Não alterar a allowlist nem o Vault.
4. Abrir **Nova Empresa**. Informar o CNPJ sintético/controlado aprovado para o gate e selecionar **Buscar empresa**. Não usar CNPJ de cliente, produtor ou parceiro real.
5. Prosseguir somente se não houver conflito. Garantir que razão social e nome fantasia tenham prefixo `TESTE D51.2` ou `HOMOLOGAÇÃO D51.2`, informar o e-mail corporativo controlado quando aplicável, escolher o plano previsto no cenário e selecionar **Criar empresa**. Registrar horário UTC e o identificador mascarado. Isso inicia/conclui E01.
6. Abrir **Administradores**, selecionar exclusivamente a empresa recém-criada e preencher nome com prefixo `TESTE D51.2` ou `HOMOLOGAÇÃO D51.2`.
7. Informar exclusivamente `teste@refilinformatica.com.br`; deixar CPF e telefone vazios se não houver valores sintéticos previamente aprovados; escolher **Link de convite (ele cria a senha)** e manter **Responsável Principal** conforme o plano do gate.
8. Antes de selecionar **Gerar acesso**, confirmar novamente destinatário, empresa e modo link. A seleção de **Gerar acesso** inicia E02 e pode também disparar E03; fazer isso somente durante a janela de envio autorizada.
9. Se a UI informar aceite pelo servidor de e-mail, registrar apenas horário, estado e identificadores mascarados. Não copiar nem compartilhar link, token, OTP, cookie ou senha.
10. Quando o e-mail chegar, parar antes de abrir o link e solicitar a continuação assistida. Não colar o link no chat.

Qualquer conflito, destinatário divergente, erro de autorização, duplicidade ou suspeita de impacto real exige parada imediata e fechamento das duas flags. A decisão permanece **NO-GO**; E01–E21 não foram executados nesta etapa e D52 não foi iniciado.

## 25. Incidente P0 pós-publicação — inconsistência de versão do frontend

Data/hora UTC: `2026-10-02`  
Commit candidato diagnosticado: `d6a0eda69cb76251d8fac20aae9fbb9b758daa1a`

### 25.1 Sintoma e diagnóstico

O ambiente publicado exibiu `useAuth deve ser usado dentro de um AuthProvider`. A busca exata no repositório e em todo o histórico Git não encontrou essa mensagem. Existe uma única definição de `useAuth`/`AuthProvider`, em `src/hooks/useAuth.tsx`; o hook atual usa contexto com valor default e não pode emitir essa exceção. Todas as rotas permanecem sob o `AuthProvider` em `src/App.tsx`.

Em sessão limpa, `https://cultivofarm.lovable.app`, `https://app.cultivofarm.com.br`, `/auth` e `/plataforma` carregaram sem erro de provider; usuário não autenticado foi corretamente direcionado a `/auth`. Os assets servidos pelos dois endereços eram idênticos, a mensagem não existia em nenhum módulo JavaScript do precache e o service worker publicado tinha `cleanupOutdatedCaches`, `clientsClaim` e `skipWaiting`.

A causa provável é uma aba/sessão com bundle antigo durante troca de versão PWA. O projeto não tratava `vite:preloadError`; além disso, os caches de runtime `html-nav` e `static-assets` não são removidos por `cleanupOutdatedCaches`, que cobre os precaches Workbox. Assim, uma navegação ou import dinâmico durante deploy podia combinar o shell em memória com recursos de outra versão. O `catch` do import inicial também classificava qualquer falha de carregamento como conexão Supabase bloqueada.

### 25.2 Correção mínima

- recuperação centralizada para falhas de chunk obsoleto, com recarga única protegida contra loop;
- limpeza restrita aos caches de runtime do shell (`html-nav` e `static-assets`), preservando precache, fontes, dados e suporte offline;
- tratamento global de `vite:preloadError` antes do import da aplicação;
- `ErrorBoundary` aciona a mesma recuperação para erros de chunk ocorridos após a montagem;
- falha genérica do import inicial deixou de ser apresentada como bloqueio do Supabase;
- regressões estáticas garantem uma única definição do hook, todas as rotas sob o provider canônico e imports de produção direcionados ao mesmo hook.

Arquivos funcionais alterados: `src/pwa/registerSW.ts`, `src/main.tsx` e `src/components/ErrorBoundary.tsx`. Nenhuma rota, permissão, dependência, configuração Supabase/SMTP ou dado foi alterado.

### 25.3 Estado do gate

Validações da correção:

- regressões focadas: 3 arquivos e 31 testes aprovados;
- suíte global: 348 arquivos aprovados, 1 ignorado; 5.312 testes aprovados, 4 ignorados;
- typecheck: PASS;
- build automático: PASS;
- prévia em `/`, `/auth` e `/plataforma`: sem exceção de provider, sem erro de página e sem resposta HTTP com falha;
- produção em sessão limpa antes da correção: os mesmos três caminhos carregaram sem a exceção, reforçando que o incidente depende de estado antigo do navegador.

A publicação automática foi interrompida antes do deploy porque o scanner de segurança vigente possui achados críticos preexistentes de RLS fora do escopo deste incidente. A regra de não publicar com P0/P1 aberto foi preservada; nenhum banco, SMTP, usuário ou tenant foi tocado.

O D51.2 está **SUSPENSO** e E01–E21 não podem ser retomados até a correção ser publicada com autorização diante dos achados existentes e a produção ser verificada em sessão limpa e em atualização. D52 permanece bloqueado. Leaked Password Protection continua **ADIADA / RISCO ACEITO TEMPORARIAMENTE**, aberta e não resolvida.

## 26. Incidente P0 — bloqueio de publicação pelo scanner RLS

Data/hora UTC: `2026-10-02T03:17:29Z` a `2026-10-02T03:19:53Z`  
Commit candidato auditado: `320ecaace0d7919f369c060e9c5d1c821c8c80c0`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

### 26.1 Inventário nominal e classificação

O mesmo scanner que bloqueou a publicação encontrou seis `ERROR`, todos `RLS_EXPOSURE` do `lov_pgscan`. Nenhum foi introduzido pela correção PWA: as policies existem em migrations de março a junho de 2026, e os achados persistidos foram registrados em 8 ou 19 de setembro de 2026.

| Objeto | Policy original | Severidade | Impacto e fluxo dependente | Classificação |
|---|---|---:|---|---|
| `public.codigo_sequencias` | `codigo_sequencias leitura autenticada` | Critical/Error | Expunha o estado do contador atômico de códigos de produtos e microrganismos; o fluxo legítimo usa trigger e `proximo_codigo`, não leitura cliente | P0/P1 real, histórico |
| `public.configuracoes_sistema` | `Anyone can read config` | Critical/Error | Qualquer conta autenticada lia toda a configuração global de marca; login, PDFs, aparência e portais consomem o singleton | P0/P1 real, histórico |
| `public.financial_settings` | `fs_read_all_auth` | Critical/Error | Qualquer conta autenticada lia regras globais de comprovantes; baixas e configurações financeiras dependem do singleton | P0/P1 real, histórico |
| `public.monitoramento_avisos` | `Visualização para usuários autenticados` | Critical/Error | Permitiria leitura horizontal de avisos associados a visitas técnicas | P0/P1 real, histórico |
| `public.objetivos_visita_sugestoes` | `Authenticated can read objetivos sugestoes` | Critical/Error | Expunha catálogo interno de sugestões a qualquer conta; criação e configuração de visita dependem dele | P0/P1 real, histórico |
| `public.sla_configuracoes` | `Authenticated can read sla` | Critical/Error | Expunha configuração operacional global de prazos a qualquer conta autenticada | P0/P1 real, histórico |

O scan inicial tinha ainda três `WARN` (`etiqueta_templates`, `fiscal_environment_marker` e escrita ampla em `formulacoes`) e onze `INFO`. Embora não fossem o bloqueio crítico inicial, a triagem confirmou exploração real: leitura de configuração operacional/fiscal e escrita global de formulações por qualquer conta. Eles receberam hardening direcionado, sem correção em massa. Leaked Password Protection continua entre os `INFO`, sob a exceção formal já registrada. Não foi alegado falso positivo para nenhum dos seis `ERROR`.

### 26.2 Correção mínima aplicada

Migrations versionadas e aplicadas no canônico:

- `20261002031850_0968ac43-e9f3-4497-b7de-94c897702102.sql`;
- `20261002031922_7290e0ed-50e8-498d-9d07-026b960ae4a7.sql`;
- `20261002032503_87416ece-fc76-44d3-a72b-22f5c4849ea5.sql`.

As migrations não alteram registros. Elas removem as seis policies tautológicas, revogam grants diretos excedentes de `PUBLIC`/`anon`/`authenticated` e recompõem apenas os privilégios necessários:

- contador de códigos: cliente sem acesso direto; `service_role` preservado para execução server-side/trigger;
- configuração do sistema: leitura apenas por perfil ativo e alteração administrativa preexistente;
- configuração financeira: leitura e alteração somente por `is_financial_staff`;
- avisos: leitura herdando `can_view_technical_visit` da visita vinculada e nenhuma escrita cliente;
- objetivos de visita: leitura por administrador, gestor, consultor técnico e técnico agrônomo; gestão preexistente por administrador/gestor;
- SLA: leitura pelos papéis operacionais internos necessários; gestão preexistente por administrador.
- templates de etiqueta: leitura pela equipe interna do catálogo e gestão por administrador/gestor;
- marcador fiscal: sem acesso direto do navegador, preservando leitura técnica server-side;
- formulações: leitura pela equipe interna do catálogo e escrita somente pelos gestores técnicos canônicos.

Nenhuma autorização usa `user_metadata`, `raw_user_meta_data` ou tenant informado pelo frontend. As funções auxiliares consultadas usam identidade server-side, e nenhum `service_role` foi exposto ao cliente.

**Forward-fix:** as migrations removem nominalmente cada policy anterior antes da recriação determinística; correções futuras devem vir em nova migration, sem restaurar predicados tautológicos.  
**Rollback:** somente mediante incidente funcional comprovado, restaurar temporariamente o predicado anterior do objeto afetado em migration nova; não reverter dados nem as outras cinco fronteiras. A preferência é forward-fix do papel/predicado ausente, jamais restaurar acesso amplo em lote.

### 26.3 Evidências posteriores

- scanner profundo intermediário: **0 Critical/Error**, 3 Warn e 11 Info;
- scanner profundo final após a classificação e correção direcionada dos warnings: **0 Critical/Error/Warning** e 10 Info;
- as seis policies críticas desapareceram do resultado e foram marcadas como corrigidas;
- consulta de catálogo confirmou RLS ativa e predicados restritivos nos seis objetos;
- ACL final: `anon` sem grant nos seis; `authenticated` sem acesso ao contador, somente leitura nos avisos, leitura/alteração nos singletons conforme policies, e operações necessárias em objetivos/SLA sempre condicionadas por RLS;
- contagens permaneceram: contador 1; os outros cinco objetos 0; nenhuma linha foi inserida, atualizada ou removida;
- o linter geral ainda reporta dívida histórica ampla: 17 objetos com RLS sem policy, 2 funções `SECURITY DEFINER` executáveis por anônimo, 472 executáveis por autenticado e Leaked Password Protection desativada. Esses itens não foram promovidos pelo scanner profundo a `Critical/Error` neste gate e exigem auditoria separada, não correção indiscriminada.

Chamadas anônimas REST aos nove objetos corrigidos retornaram HTTP 401. A prova autenticada e cross-tenant dinâmica não foi executada porque este Supabase externo não fornece às ferramentas identidades controladas; a prova estrutural confirma que a única policy vinculada a tenant neste conjunto (`monitoramento_avisos`) reutiliza a autorização canônica da visita. Não foi usada `service_role` como identidade de usuário.

### 26.4 Gate de publicação

**Decisão objetiva: APTO PARA REPUBLICAÇÃO.** O scanner final não contém Critical, Error ou Warning; suíte global com 349 arquivos e 5.318 testes aprovados (1 arquivo/4 testes ignorados), typecheck e build passaram. O smoke signed-out abriu `/auth` sem erro de página e confirmou redirecionamento seguro de `/`, `/plataforma`, `/dashboard` e `/configuracoes`; a UI autenticada não foi testada por indisponibilidade de sessão controlada, sem substituição por `service_role`.

A publicação não foi executada automaticamente. Após autorização/republicação, ainda é obrigatório verificar a URL live em sessão limpa e durante atualização PWA antes de retirar a suspensão do D51.2. SMTP permaneceu intocado, D51.2 continua suspenso e D52 permanece bloqueado. Os 10 `INFO` do scanner final incluem catálogos intencionalmente globais, quatro trilhas de auditoria com inserção autenticada, bucket público de logos e Leaked Password Protection; este último permanece risco aceito, aberto e não resolvido. O linter geral mantém dívida histórica ampla já registrada, que não deve ser tratada por alteração indiscriminada neste incidente.

## 27. Pós-republicação — verificação live somente leitura

Data/hora UTC: `2026-10-02T04:11:15Z`  
Origem solicitada: `https://cultivofarm.lovable.app`  
Destino canônico servido após redirecionamento: `https://app.cultivofarm.com.br`

### 27.1 Resultado por rota

| Rota | Resultado | Evidência |
|---|---|---|
| `/` | PASS | HTTP 200; direcionamento concluído em `/auth`; tela de login íntegra. |
| `/auth` | PASS | HTTP 200; tela de login íntegra. |
| `/plataforma` | PASS | Sem sessão, redirecionamento seguro para `/auth`. |
| `/dashboard` | PASS | Sem sessão, redirecionamento seguro para `/auth`. |
| `/configuracoes` | PASS | Sem sessão, redirecionamento seguro para `/auth`. |

Em todas as rotas, ficaram ausentes `useAuth deve ser usado dentro de um AuthProvider`, `Erro de Renderização` e `Não foi possível carregar a aplicação`. Não houve exceção de página, `ChunkLoadError`, `vite:preloadError`, falha de requisição, loop de recarga ou resposta 404 de JavaScript/CSS com hash. Os assets publicados observados (`index-DhfJkLjP.js` e `index-RYk3Js3c.css`) responderam HTTP 200.

O console registrou somente HTTP 401 na leitura anônima de `configuracoes_sistema`; isso corresponde ao bloqueio RLS esperado para uma sessão sem login e não impediu a renderização. Nenhum segredo, token ou dado foi coletado.

### 27.2 PWA e service worker

- service worker ativo, controlando o escopo `https://app.cultivofarm.com.br/`, sem worker aguardando ou instalando;
- `/sw.js` respondeu HTTP 200 e contém tomada imediata de controle, ativação imediata, limpeza de caches antigos e import do worker de push;
- bundle principal publicado contém o listener `vite:preloadError`, reconhecimento de falha de import dinâmico e limpeza restrita dos caches `html-nav`/`static-assets`;
- nenhuma falha do service worker ou mistura de chunks foi observada.

### 27.3 Decisão

**PRODUÇÃO NORMALIZADA; INCIDENTE P0 ENCERRADO.** A correção publicada está presente e a navegação anônima funciona normalmente. Esta verificação não autenticou usuário, não usou `service_role` e não alterou código, banco, SMTP ou dados. D51.2 permanece suspenso nesta etapa e só poderá ser retomado por autorização explícita; D52 não foi iniciado.

## 28. Retomada D51.2 após produção normalizada

Data/hora UTC: `2026-10-02T04:14:39Z`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`  
Commit candidato local: `9dd003c7853ca5b208600e13ecbac3e163a1226e`

### 28.1 Pré-check somente leitura

| Controle | Resultado |
|---|---|
| Projeto canônico | PASS — consultas executadas exclusivamente no ref canônico |
| Produção corrigida | PASS — os commits PWA `320ecaac…` e RLS `ce7e9f54…` são ancestrais do candidato; a verificação live anterior confirmou os assets corrigidos |
| Singleton | PASS — uma linha, exclusivamente `id=1` |
| SMTP | PASS — host, porta, usuário, referência Vault e remetente presentes; valores não coletados |
| Test mode | PASS — ON |
| Allowlist | PASS — exatamente uma entrada, correspondente ao endereço controlado autorizado |
| Entrega antes da abertura | PASS — global OFF e e-mail OFF |
| Outros canais | PASS — WhatsApp, in-app e webhook OFF |
| Leases | PASS — zero lease de provisionamento/e-mail e zero job `sending` |
| Conflitos D51.2 | PASS — zero Auth user controlado, convite controlado ou organização prefixada |
| Forward-fix | PASS — duas funções remotas contêm o vínculo por `raw_app_meta_data.provisioning_request_id` |
| Superadmin | PASS estrutural — uma identidade Superadmin e zero papel operacional acumulado |
| Leaked Password Protection | EXCEÇÃO ACEITA — warning presente, aberto e não mascarado |

O linter geral continua registrando 492 itens históricos, incluindo exatamente um `Leaked Password Protection Disabled`; a exceção permanece **ADIADA / RISCO ACEITO TEMPORARIAMENTE**. O scanner profundo persistido consultado nesta rodada estava desatualizado em relação ao scan final já documentado e não foi usado para reabrir o incidente encerrado.

### 28.2 Janela SMTP controlada

Às `2026-10-02T04:13:57.410527Z`, a RPC técnica existente `rpc_service_apply_provider_settings` alterou somente `delivery_enabled` e `email_delivery_enabled` para `true`, com payload sem operação de segredo. A auditoria registrou `action=apply`, exatamente esses dois campos e ator com papel Superadmin.

Verificação posterior:

- `ready_for_controlled_test=true`;
- test mode ON e allowlist exclusiva preservados;
- host/porta/usuário/referência Vault/remetente preservados por presença;
- WhatsApp, in-app e webhook OFF;
- zero lease e zero job `sending`;
- nenhum e-mail enviado pela abertura.

A janela permanece aberta para o próximo passo manual imediato, protegida por test mode e destinatário único. Qualquer atraso, conflito ou risco exige desligar imediatamente as duas flags.

### 28.3 Sessão publicada e provas server-side

O navegador automatizado abriu `https://cultivofarm.lovable.app/plataforma`, foi direcionado ao domínio canônico e terminou em `/auth`, com formulário de login visível e zero erro de página. `LOVABLE_BROWSER_AUTH_STATUS=external_unmanaged`; portanto a sessão real do responsável não é transferida às ferramentas e não pode ser substituída por `service_role`.

Provas executadas sem identidade simulada e sem mutação operacional:

- `communication-provider-settings`: sem JWT e JWT inválido → HTTP 401 sanitizado;
- `platform-invite-org-admin`: sem JWT e JWT inválido → HTTP 401 no gateway;
- `test-communication-email`: sem JWT e JWT inválido → HTTP 401 sanitizado;
- tabela global e RPCs de provider/invite: `anon=false`, `authenticated=false`, `service_role=true` nas fronteiras técnicas verificadas;
- busca em `src/`/`public/`: zero chave `service_role` no cliente;
- 9 arquivos focados, 74 testes aprovados: intenção persistida, serialização, lease/fencing/cooldown, retomada sem `listUsers`, hard-crash antes do envio, resultado ambíguo após aceite SMTP, destinatário vindo do claim, open redirect, link não devolvido, recovery/primeiro acesso e isolamento da configuração global;
- E15A permanece apenas estrutural/parcial; não houve Tenant B nem sessão Admin A;
- E17–E19 permanecem contratuais/NOT RUN: nenhuma organização, assinatura ou identidade fiscal foi criada.

### 28.4 Matriz e ponto de parada

| Cenários | Estado nesta retomada |
|---|---|
| E01–E04 | NOT RUN — parada imediatamente antes de criar a empresa |
| E05–E07 | PARCIAL — contratos de senha, recovery e reenvio aprovados; sem conta/link real |
| E08 | NOT RUN — nenhum link real criado ou aberto |
| E09–E14 | PARCIAL — contratos/harness focados aprovados; sem fixture mutante no canônico |
| E15 | PARCIAL estrutural — A→B ainda não exercitado; segunda identidade não inventada |
| E16 | PARCIAL — zero papel operacional acumulado e autorização server-side comprovada; sem sessão positiva |
| E17–E19 | NOT RUN — nenhum fluxo real de plano/fiscal executado |
| E20 | PARCIAL — terminalidade/idempotência por contrato; sem job real concluído |
| E21 | PARCIAL — preflight, auditoria da janela, negativas e contagens coletados; falta trilha E2E |

**Ponto exato de interação manual:** autenticar o Superadmin no ambiente publicado e, em `/plataforma`, abrir **Nova Empresa**, antes de qualquer seleção de **Criar empresa**. E01/E02 não foram iniciados por estas ferramentas.

### 28.5 Decisão

**NO-GO para encerrar D51 ou iniciar D52.** O ambiente está pronto para E01/E02 manual controlado, mas nenhum cenário dependente de empresa/convite/e-mail real foi promovido a PASS. Leaked Password Protection permanece aberta sob a exceção formal.

## 29. Incidente CORS da aba Comunicação no ambiente publicado

Data/hora UTC: `2026-10-02T04:25Z`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

### 29.1 Causa confirmada

Antes da correção, o preflight `OPTIONS` de `communication-provider-settings` com origem `https://app.cultivofarm.com.br` retornou HTTP 403 sem `Access-Control-Allow-Origin`; o controle `https://cultivofarm.lovable.app` retornou HTTP 204 com a origem exata. Os logs Edge recentes registraram a mesma combinação 403/204. A UI publicada era redirecionada ao domínio customizado, mas esse host não constava na allowlist estática do helper compartilhado.

O secret opcional `COMMUNICATION_ADMIN_ORIGINS` não estava configurado entre os nomes disponíveis. Nenhum valor secreto foi consultado ou exposto. As duas funções estavam implantadas; os logs confirmaram execuções recentes de `communication-provider-settings`, enquanto `test-communication-email` não apresentou evento de execução anterior relevante.

**Classificação:** CORS confirmado como causa do erro de transporte da aba Comunicação.

### 29.2 Correção mínima

Arquivos alterados:

- `supabase/functions/_shared/comunicacao/cors.ts`: adicionada somente a origem exata `https://app.cultivofarm.com.br`; nenhum wildcard de domínio Cultivo Farm foi liberado;
- `supabase/config.toml`: `verify_jwt=true` declarado explicitamente para `communication-provider-settings` e `test-communication-email`;
- `src/test/comunicacao/fase-provider-settings-corr.test.ts`: regressões de origem canônica, origem Lovable, origem maliciosa, preflight 204 exato, ausência de wildcard no helper e manifesto JWT;
- este relatório e `roadmap.md`.

O helper permanece aceitando previews Lovable, localhost e extras explícitos via `COMMUNICATION_ADMIN_ORIGINS`. A busca de consumidores confirmou que apenas `communication-provider-settings` e `test-communication-email` importam esse helper. `platform-invite-org-admin` possui fronteira CORS própria e não foi alterada nem implantada neste incidente. JWT e `is_platform_superadmin` permaneceram inalterados nas duas funções administrativas.

### 29.3 Testes e deploy

- suíte focada oficial: 3 arquivos, 46 testes aprovados;
- typecheck: aprovado;
- build: aprovado, sem publicação de frontend;
- implantadas somente `communication-provider-settings` e `test-communication-email`, com as dependências compartilhadas empacotadas;
- nenhum e-mail, alteração SMTP, usuário, tenant ou dado operacional.

Validação remota pós-deploy, nas duas funções:

| Prova | Resultado |
|---|---|
| `OPTIONS` de `https://app.cultivofarm.com.br` | HTTP 204; `Access-Control-Allow-Origin` igual à origem exata |
| `OPTIONS` de `https://cultivofarm.lovable.app` | HTTP 204; origem exata preservada |
| `OPTIONS` de origem maliciosa semelhante | HTTP 403; sem `Access-Control-Allow-Origin` |
| requisição sem JWT no domínio customizado | HTTP 401 legível pelo navegador; nenhuma execução funcional |

O gateway Supabase, por executar `verify_jwt=true` antes do código da função, devolve seu próprio `Access-Control-Allow-Origin: *` apenas na resposta negativa 401 sem credencial. O código implantado nunca produz wildcard: preflights aprovados refletem exclusivamente a origem validada e respostas da função usam o mesmo helper. Essa resposta do gateway não expõe conteúdo protegido e confirma o bloqueio antes da função.

Uma prova browser sem sessão, executada a partir de `https://app.cultivofarm.com.br/auth`, leu normalmente o JSON sanitizado 401 e não registrou erro de página. Não foi simulada autenticação.

### 29.4 Decisão

**INCIDENTE CORS ENCERRADO.** Após a correção, o responsável confirmou no ambiente publicado, com sessão real de Superadmin, que a página `/plataforma` e a aba **Comunicação** abriram normalmente. A função `communication-provider-settings` carregou corretamente na UI autenticada, completando a prova positiva que permanecia pendente.

Esta confirmação foi exclusivamente observacional: não houve alteração de código, banco, SMTP, allowlist, usuário ou tenant; nenhum e-mail foi enviado. O Gate D51.2 permanece aberto e em andamento, com próximo passo em E01/E02 manual controlado. D52 não foi iniciado.

## 30. Auditoria E01/E02/E03 após ação manual

Data/hora da leitura UTC: `2026-10-02T04:37:00Z`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

### 30.1 Resultado canônico

A confirmação manual informou feedback visual de empresa criada e convite gerado. O responsável corrigiu posteriormente a evidência: **nenhum e-mail foi recebido** pelo endereço controlado e **nenhum link foi recebido ou aberto**. As leituras somente leitura do Supabase canônico também não encontraram os registros correspondentes:

| Controle obrigatório | Resultado canônico |
|---|---|
| Organizações com prefixo `HOMOLOGAÇÃO D51.2`/`TESTE D51.2` | **0**; esperado 1 |
| Organizações criadas desde `2026-10-02T04:00:00Z` | **0** |
| Convites/jobs para o endereço controlado | **0**; esperado 1 |
| Auth users para o endereço controlado | **0**; esperado 1 |
| Profiles para o endereço controlado | **0**; esperado 1 |
| Profiles criados desde `2026-10-02T04:00:00Z` | **0** |
| Eventos Lovable Email visíveis para o endereço controlado | **0**; não cobre o SMTP externo do módulo Comunicação |
| Logs recentes de `platform-invite-org-admin` | nenhum evento encontrado |

As contagens totais permaneceram no baseline anterior: 2 organizações, 1 job histórico e 6 Auth users. Os registros mais recentes continuam datados de `2026-10-01`, anteriores à ação manual informada. Portanto não existe no canônico um objeto do gate do qual seja possível mascarar ID, comprovar plano/assinatura, status, tentativas, lease, vínculo por `raw_app_meta_data.provisioning_request_id`, perfil, papéis, responsável principal ou sequência de auditoria.

Os logs Auth fornecidos mostram duas leituras `GET /user` com HTTP 200 entre `04:31:06Z` e `04:31:53Z`, e os logs de `communication-provider-settings` mostram inicializações na mesma janela. Essas evidências sustentam a sessão positiva e o carregamento da aba Comunicação, mas não comprovam criação de empresa, convite ou envio pelo fluxo `platform-invite-org-admin`.

Nenhum link, token, OTP, senha, cookie, cabeçalho de autorização ou metadado sensível foi lido ou registrado. Nenhuma escrita foi executada.

### 30.2 Classificação e decisão

- **E01: FAIL / NÃO COMPROVADO** — organização do gate ausente no Supabase canônico.
- **E02: FAIL / NÃO COMPROVADO** — convite/job, Auth user, profile e papel esperados ausentes no Supabase canônico.
- **E03: FAIL CONFIRMADO** — nenhum e-mail foi recebido e não existe tentativa/aceite SMTP canônico correlacionável.
- **E04: NOT APPLICABLE / NO-GO** — nenhum link foi recebido; não existe primeiro acesso a executar.

Há inconsistência entre os feedbacks visuais relatados e o estado canônico: não houve persistência nem envio real correlacionável. Não existe link a abrir. D51.2 permanece aberto e bloqueado neste ponto; D52 não foi iniciado.

## 31. Investigação da divergência de ambiente/persistência após E01/E02

Data/hora UTC da investigação: `2026-10-02T04:41:01Z`  
Commit candidato inspecionado: `ba5ad0a773824699485d2b7e736bd71ae29e9a3d`  
Supabase canônico exclusivo consultado: `swzpzcwiasxmjutrmvkm`

### 31.1 Bundle publicado e binding

O HTML atual de `https://app.cultivofarm.com.br` referencia `index-DhfJkLjP.js`; esse carregador referencia o chunk dinâmico `App-D9d5jviP.js`. Os artefatos foram coletados sem sessão e tiveram os seguintes fingerprints SHA-256:

- HTML: `cf74e8e…a72e`;
- carregador: `291a5613…076`;
- aplicação: `f72356ff…6dd`;
- service worker: `3250a5a7…192`.

O conjunto completo de JavaScript servido contém uma única URL/ref Supabase: `https://swzpzcwiasxmjutrmvkm.supabase.co`. Não contém `ikaauvsflpmamgxmkhoq`, `navfzbwgwzruipouyfnk`, `yzszlzjpovmcteuxjznj` ou outro host `*.supabase.co`.

O chunk live contém nominalmente `platform_create_organization`, `platform-invite-org-admin`, a mensagem de sucesso da empresa e a confirmação de aceite do convite pelo servidor de e-mail. Esses contratos coincidem com `src/hooks/usePlataformaSaaS.ts`, `PlataformaEmpresas.tsx` e `PlataformaAdmins.tsx`. `client.ts` usa URL canônica literal; `bindingGuard` recusa qualquer host diferente antes da montagem da aplicação; `previewAuthStorage` altera apenas o armazenamento de sessão em preview enquadrado e não escolhe backend; `.env` não é lido pelo cliente canônico e não existe fallback de URL.

O histórico reforça a exclusão: o fluxo de convite foi introduzido em 1º de outubro de 2026, quando `client.ts` já apontava para `swzpzcwiasxmjutrmvkm`. Os commits antigos que apontavam para `ikaauvsflpmamgxmkhoq` são de agosto e não continham `platform-invite-org-admin`, `platform_create_organization` nem a UI “Gerar acesso”. Portanto não foi encontrada versão histórica deste repositório que combine a tela/feedback atuais com um backend antigo.

### 31.2 Persistência obrigatória dos fluxos

**Nova Empresa:** a UI chama diretamente a RPC `platform_create_organization` e só mostra “Empresa criada” após `mutateAsync` retornar sem erro. A RPC remota e a migration versionada inserem, na mesma transação, `organizations`, `organization_subscriptions` e `organization_status_audit`. Não existe `onMutate`, inserção otimista no cache, armazenamento local ou caminho de “solicitação” que simule conclusão.

**Administradores:** a UI live chama exclusivamente `platform-invite-org-admin`. A função primeiro persiste/reclama `platform_org_admin_invites`, depois cria ou retoma o Auth user, finaliza `profiles`/papel e somente então tenta o SMTP. A interface só mostra aceite de e-mail após resposta `email_status=accepted`. Não existe fallback para `create-user`, `generateLink` no navegador, Lovable Email, SMTP local ou outra Edge Function.

Assim, no fluxo live atual, é impossível obter simultaneamente os dois feedbacks positivos sem deixar ao menos a organização e o job no canônico. Uma transação abortada também não explica a observação: nesse caso a UI mostraria erro e o convite não teria uma organização selecionável recém-criada.

### 31.3 Evidência de runtime canônico

Leituras posteriores reconfirmaram o baseline e a ausência de efeitos:

- `organizations`: 2; último `created_at` em `2026-10-01T12:33:23.890564Z`;
- `platform_org_admin_invites`: 1; último `created_at` em `2026-10-01T12:41:42.746726Z`;
- `profiles`: 6; último `created_at` em `2026-10-01T12:41:42.409516Z`;
- `organization_status_audit` desde `04:20Z`: zero;
- outbox, eventos e recibos de comunicação desde `04:20Z`: zero;
- logs recentes de `platform-invite-org-admin`: zero;
- logs recentes de `test-communication-email`: zero;
- rate limit de Comunicação na janela: somente `get` e `mutate` de configuração, sem ação de teste SMTP.

Houve uma única auditoria `apply` de provider settings às `04:31:55.246155Z`, coerente com acesso/configuração da aba Comunicação, não com criação de empresa, convite ou envio. Não houve chamada ao botão de teste SMTP canônico.

### 31.4 Service worker e hipótese de cache

O HTML e `/sw.js` atuais são entregues com `no-cache`; os chunks com hash são imutáveis. O SW atual contém precache versionado, `cleanupOutdatedCaches`, `clientsClaim`, `skipWaiting` e os caches `html-nav`/`static-assets`; o carregador possui recuperação para chunk obsoleto. Uma aba já aberta pode manter JavaScript em memória até recarregar, mas:

1. a combinação histórica “UI atual de E01/E02 + backend antigo” não existe no histórico auditado;
2. a Comunicação autenticada comprovada na mesma janela produziu auditoria no canônico;
3. não houve nenhuma requisição/efeito de E01/E02 no canônico.

Logo, cache antigo isoladamente não explica os fatos observados. Continua possível que E01/E02 tenham sido realizados em outra aba, domínio, instalação PWA ou projeto visualmente semelhante, mas o ref exato dessa execução não pode ser inferido com segurança a partir do canônico ou do bundle live atual.

### 31.5 Classificação, risco e decisão

A classificação preliminar “D — outro ambiente/contexto” foi posteriormente refutada pela confirmação do domínio oficial e não deve ser tratada como causa. O estado factual é **inconclusivo**: o bundle atual e os contratos atuais não explicam feedback visual de sucesso sem qualquer persistência canônica, enquanto o runtime exato carregado na aba no instante da ação não está preservado.

- A) frontend live atual apontando para backend errado: **refutado** pelo bundle publicado e binding fail-closed;
- B) fluxo atual sem persistência obrigatória: **refutado** pelos contratos transacionais e ausência de sucesso otimista;
- C) bundle/cache antigo: **possível, não comprovado**;
- D) outro domínio: **refutado** pela confirmação do responsável;
- E) versão intermediária ou outro estado no mesmo domínio: **possível, não comprovado**.

Não houve e-mail nem link recebido. E01 e E02 permanecem FAIL/não comprovados; E03 é FAIL confirmado; E04 é NOT APPLICABLE/NO-GO.

**Não repetir E01/E02.** O próximo passo é rastrear, sem nova ação mutante, por que a UI indicou sucesso sem persistência canônica e sem envio real. Nenhum dado, SMTP, usuário ou tenant foi alterado nesta investigação; D52 permanece bloqueado.

### 31.6 Testes somente leitura

- binding canônico único no bundle live: PASS;
- fluxos live atuais presentes no chunk publicado: PASS;
- ausência de fallback paralelo/cliente Supabase alternativo: PASS;
- sucesso de UI somente após confirmação server-side: PASS por inspeção e contratos;
- regressões focadas de binding, PWA, D51 e primeiro acesso: PASS — 4 arquivos, 45 testes;
- build vigente observado pelo ambiente: PASS;
- nenhum E2E mutante, envio, abertura de link ou consulta a dado de projeto alternativo foi realizado.

## 32. Contenção após divergência E01/E02/E03

Data/hora UTC da contenção: `2026-10-02T04:43:28.506892Z`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

Após confirmar que a janela permanecia aberta, o mecanismo técnico auditável existente `rpc_service_apply_provider_settings` foi usado com payload restrito e sem operação de segredo. A auditoria canônica registrou `action=apply`, ator presente e exatamente os campos:

- `delivery_enabled`: `true` → `false`;
- `email_delivery_enabled`: `true` → `false`.

Nenhum outro campo foi enviado à RPC. A leitura posterior confirmou:

| Controle | Estado pós-contenção |
|---|---|
| Entrega global | **OFF** |
| Entrega por e-mail | **OFF** |
| Modo de teste | **ON** |
| Allowlist | exatamente um endereço, o destinatário controlado aprovado |
| SMTP host/port/user/password-ref/from | todos presentes, verificados somente por booleanos |
| WhatsApp | **OFF** |
| In-app | **OFF** |
| Webhook | **OFF** |
| Leases de provisionamento ativos | **0** |
| Leases de e-mail ativos | **0** |
| Jobs em `sending` | **0** |
| Organizações `TESTE D51.2`/`HOMOLOGAÇÃO D51.2` | **0** |
| Jobs para o destinatário controlado | **0** |
| Operações de segredo/Vault na contenção | **0** |

A primeira tentativa técnica falhou fechada antes de qualquer escrita porque o binding do sandbox não estava disponível ao processo local. A restauração do binding confirmou a instância canônica, mas o processo ainda não recebeu as variáveis; por isso a execução foi feita diretamente no canônico pelo mecanismo server-side existente. Não houve envio, reenvio, criação de empresa, convite, usuário ou alteração de credenciais/Vault.

**Decisão:** janela SMTP canônica fechada e estado fail-closed restaurado. E01/E02 permanecem FAIL/não comprovados; E03 é FAIL confirmado por ausência de e-mail e de tentativa canônica; E04 é NOT APPLICABLE/NO-GO porque não existe link recebido. D51.2 continua bloqueado e D52 não foi iniciado.

## 33. Reinvestigação após confirmação do domínio oficial

Data/hora UTC: `2026-10-02T04:51:36Z`  
Nova evidência do responsável: E01/E02 foram executados em `https://app.cultivofarm.com.br`. Posteriormente, o responsável corrigiu o relato: **nenhum e-mail e nenhum link foram recebidos**.

### 33.1 Reclassificação obrigatória

A conclusão anterior “D — outro ambiente/contexto” fica **revogada como causa definitiva**. O domínio oficial foi confirmado pelo responsável. Isso não comprova qual JavaScript, service worker ou contrato de backend estava ativo na aba naquele instante, mas refuta a hipótese específica de ação em outro domínio.

Estado atualizado das hipóteses:

- **A — binding atual errado:** refutada para o bundle atualmente publicado, que contém exclusivamente `swzpzcwiasxmjutrmvkm`;
- **B — fluxo atual não persiste:** refutada; os dois sucessos atuais dependem de confirmação server-side e não usam escrita otimista;
- **C — aba antiga/JavaScript em memória/service worker:** reaberta e **plausível**, mas não comprovada;
- **D — outro domínio:** **refutada pela confirmação do responsável**;
- **E — versão publicada intermediária ou outro mecanismo no mesmo domínio:** reaberta e **plausível**, mas não comprovada.

### 33.2 Linha temporal dos fluxos

O histórico Git entre 1º e 2 de outubro foi reconstruído:

| UTC | Commit | Mudança relevante |
|---|---|---|
| `2026-10-01T02:56:03Z` | `8312cc8e…` | primeira `platform-invite-org-admin`: gera link Auth e depois registra o administrador pelo servidor; não usa SMTP do módulo Comunicação |
| `2026-10-01T02:58:21Z` | `54263fc1…` | primeira UI Administradores; sucesso “Acesso do administrador criado” e exibição/cópia do link |
| `2026-10-01T03:28:46Z` | `11a0b4f6…` | hook passa a chamar `platform_create_organization` |
| `2026-10-01T03:30:15Z` | `05d94578…` | primeira UI Nova Empresa; toast somente depois do `await` da RPC |
| `2026-10-02T00:20:44Z` | `814f82c7…` | intenção, lease/fencing e finalização do provisionamento |
| `2026-10-02T00:21:37Z` | `8dbc6663…` | link passa a usar conta Auth + recovery; ainda sem envio SMTP automático |
| `2026-10-02T01:54:53Z` | `5abbc6b2…` | SMTP automático integrado; `action_link` deixa a resposta e surge “Convite aceito pelo servidor de e-mail” |
| `2026-10-02T03:16:22Z` | `320ecaac…` | recuperação de bundle/chunk obsoleto do PWA |

Não foi encontrado commit em que “Empresa criada” apareça antes da confirmação de `platform_create_organization`. Também não foi encontrado commit que envie e-mail e conclua o convite sem persistir em `platform_org_admin_invites`. A string literal “Convite gerado” não existe nas versões auditadas; as mensagens encontradas foram “Acesso do administrador criado” e, depois, “Convite aceito pelo servidor de e-mail”.

A versão anterior ao SMTP automático podia gerar e exibir/copiar um link, mas não possuía envio SMTP no fluxo. A versão posterior que afirma aceite SMTP já cria/reclama o job antes do efeito externo. Portanto **nenhuma versão conhecida do repositório explica simultaneamente**: feedback visual de empresa e convite, ausência de e-mail/link e zero organização/job/Auth user no canônico.

Não existe no repositório um ledger confiável que associe cada publicação do domínio a um commit e horário. Os timestamps Git delimitam quando o código passou a existir, mas não provam qual commit estava servido ou já carregado na aba durante a ação.

### 33.3 Aba antiga e service worker no mesmo domínio

Antes de `320ecaac…`, a aplicação não tratava `vite:preloadError`/`ChunkLoadError` nem limpava os caches runtime antes de uma recarga única. Uma aba aberta podia manter JavaScript e chunks já carregados em memória, além da sessão, após uma publicação. O service worker usava atualização imediata, mas isso não encerra o contexto JavaScript de uma aba até recarga/navegação efetiva.

Logo, domínio oficial e barra de endereço correta **não provam** que a aba executava o bundle corrente. Entretanto, o histórico conhecido não contém uma versão antiga que combine os dois feedbacks observados com outro binding: quando Nova Empresa e Administradores passaram a coexistir, o cliente já usava o canônico. C permanece possível como estado misto/intermediário não preservado nos artefatos disponíveis, não como causa demonstrada.

### 33.4 Feedback visual e persistência local

- Nova Empresa executa `await criar.mutateAsync(...)` antes de toast, badge e limpeza do formulário;
- Administradores dispara o toast somente no callback `onSuccess` da chamada Edge;
- nenhum dos dois usa `onMutate`, `setQueryData`, entidade otimista ou cache React Query persistido;
- `localStorage`/`sessionStorage` não guardam organização, convite ou resultado dessas mutations;
- os botões são bloqueados por `isPending`; double-click não produz sucesso antecipado;
- remount pode perder estado visual local, mas não pode fabricar resposta positiva do servidor.

Assim, cache React Query, estado local ou double-click não explicam os sucessos relatados sem requisição correspondente.

### 33.5 E-mail e link não recebidos

Na janela aproximada `04:20Z–04:40Z`, as consultas aos logs canônicos de Edge, gateway, Auth e Postgres não localizaram chamadas a `platform-invite-org-admin`, `create-user`, `test-communication-email`, Auth invite/generateLink ou às RPCs E01/E02. O canônico também não possui outbox, evento, recibo, rate-limit de teste, job ou Auth user correlacionável.

A ausência de evento, job, tentativa e chamada canônica é compatível com a confirmação factual de que nenhum e-mail foi recebido. Não existe mensagem, link ou metadado de entrega a correlacionar. Hipóteses sobre Lovable Email, `create-user`, SMTP externo ou outro emissor deixam de ser necessárias para explicar o caso e ficam removidas da análise causal.

### 33.6 Decisão e informação mínima restante

**Causa comprovada:** nenhuma.  
**Causa mais provável, com confiança baixa a moderada:** C/E — aba no domínio oficial executando estado antigo/intermediário em memória, ou uma publicação intermediária não preservada no histórico acessível. A ausência total de requests canônicos na janela sustenta essa classe, mas não distingue suas variantes.

**Hipóteses refutadas:** outro domínio; binding errado no bundle corrente; sucesso otimista/cache persistido; fluxo corrente sem persistência.

O próximo passo documental/técnico é rastrear por que a UI indicou sucesso sem persistência canônica e sem envio real, usando apenas histórico de publicação, runtime e feedback visual já disponíveis. Não existe e-mail ou link do qual coletar metadados.

Até nova correlação, não repetir E01/E02. A janela SMTP canônica foi reconfirmada global/e-mail OFF, com modo de teste ON. E01/E02 permanecem FAIL/não comprovados; E03 é FAIL confirmado — nenhum e-mail recebido e nenhuma tentativa canônica correlacionável; E04 é NOT APPLICABLE/NO-GO porque não existe link recebido. D52 permanece NO-GO. Nenhum código, banco, SMTP ou dado operacional foi alterado nesta reinvestigação.

## 34. Correlação da captura “Administradores provisionados”

Data/hora UTC da leitura: `2026-10-02T05:13Z`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

### 34.1 Conclusão factual

A captura **não corresponde ao job histórico** citado nas leituras anteriores. O baseline lido às `04:37Z` continha duas organizações e um único job histórico, ambos com registros mais recentes em `2026-10-01`. A ação mostrada na captura ocorreu depois dessa auditoria e deixou novos registros no canônico:

| Objeto | Evidência sanitizada |
|---|---|
| Organização | `007bb519…0048`; `AR BIOTECNOLOGIA LTDA`; criada em `2026-10-02T05:10:25.377524Z`; status `aguardando_ativacao`; ativa; sem responsável definido |
| Assinatura | criada na mesma transação; plano `completo`; status `TRIAL` |
| Auditoria da organização | evento “criação pela plataforma” no mesmo timestamp, com ator mascarado `b2c9bb8c…4b2e` |
| Job da captura | `1d14f78b…c558`; criado em `2026-10-02T05:11:27.798905Z`; atualizado em `2026-10-02T05:11:31.135974Z` |
| Identidade informada | Renato Cunha; `arbiotecnologia@gmail.com`; modo `link`; responsável principal `true` |
| Provisionamento | status `falhou`; `attempt_count=1`; erro sanitizado `finalize_failed`; sem lease ativo; sem `user_id`; sem `auth_created_at`; sem conclusão |
| Entrega de e-mail | status `pending`; `email_attempt_count=0`; nenhum timestamp de tentativa, aceite ou falha; sem lease de e-mail |
| Auth/perfil/papel | zero Auth users para o endereço; zero profiles e zero user_roles; nenhuma identidade Auth criada na janela `05:10Z–05:13Z` permaneceu no canônico |

O horário exibido `02/10/2026, 02:11:31` é exatamente o `updated_at` do job convertido pela UI para `America/Sao_Paulo` (`05:11:31Z` → `02:11:31`). Essa correlação, junto de empresa, nome, e-mail, modo e status, identifica inequivocamente a linha da captura.

### 34.2 O que a interface executou

A lista “Administradores provisionados” lê globalmente os 200 jobs mais recentes, sem filtrar pela empresa selecionada no formulário. Entretanto, neste caso ela não estava apenas apontando para o registro histórico: o job da captura foi criado naquele momento e não existia antes de `05:11:27Z`.

O botão **Gerar acesso** invoca `platform-invite-org-admin`. A evidência persistida prova uma execução real do claim para `arbiotecnologia@gmail.com`: criação do job, `attempt_count=1` e posterior marcação `falhou`. O badge “Falhou — pode retentar” é gerado exclusivamente por `status='falhou'`; a coluna “Quando” usa `updated_at`, com fallback para `created_at`.

O fluxo falhou na finalização Auth↔banco (`last_error_code=finalize_failed`) antes de alcançar a entrega SMTP. A função remove a conta Auth recém-criada quando essa finalização falha, o que é consistente com `user_id` nulo no job e zero Auth users, profiles e papéis remanescentes. O erro interno original da RPC não foi preservado nessa coleta; a causa técnica foi fechada posteriormente pela auditoria estática e canônica da seção 35.

### 34.3 Reclassificação E01–E04

- **E01: executado, porém fora do cenário controlado — FAIL de conformidade.** Uma nova empresa foi criada no canônico: `AR BIOTECNOLOGIA LTDA`. Não é uma empresa com prefixo `TESTE D51.2`/`HOMOLOGAÇÃO D51.2` e não usa o endereço controlado aprovado.
- **E02: executado, porém não criou o convite controlado — FAIL.** Foi criado um job novo para `arbiotecnologia@gmail.com`, não para `teste@refilinformatica.com.br`; ele terminou em `falhou` sem usuário, profile ou papel. Continuam existindo zero jobs para o destinatário controlado.
- **E03: FAIL confirmado.** O job novo tem `email_attempt_count=0` e permaneceu `pending`; nenhuma etapa SMTP foi reclamada. Nenhum e-mail foi recebido.
- **E04: NOT APPLICABLE / NO-GO.** Não há Auth user nem link recebido.

A divergência anterior fica explicada pela linha do tempo e pela identificação do registro: a auditoria de `04:37Z` estava correta para aquele instante; a empresa e o job da captura foram criados depois, às `05:10Z–05:11Z`, e não eram o job legado. A ação também não correspondeu ao cenário D51.2 aprovado porque usou empresa e destinatário reais diferentes dos controles autorizados.

### 34.4 Contenção e decisão

O SMTP canônico permanece fail-closed: entrega global **OFF**, e-mail **OFF**, modo de teste **ON**, allowlist com um único endereço — o destinatário controlado aprovado — e os demais canais **OFF**. Existem zero leases de provisionamento e zero leases de e-mail ativos. Nenhuma escrita, reprocessamento, reenvio, alteração de status, criação de usuário ou envio foi realizado nesta auditoria.

**Decisão:** a captura não é o job legado. E01 criou uma nova empresa real no canônico; E02 criou um job novo, não controlado e incompleto; nenhum convite controlado foi criado. O job falho deve permanecer bloqueado e não pode ser usado em homologação futura, pois envolve empresa/endereço não aprovados e não possui vínculo Auth concluído. Qualquer decisão posterior sobre correção, arquivamento ou retomada exige revisão específica e nova autorização. Não repetir E01/E02 e não avançar D52.

## 35. Diagnóstico read-only de `finalize_failed`

Data/hora UTC da auditoria: `2026-10-02T05:17Z`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

### 35.1 Causa raiz comprovada

**Classificação C/F — colisão entre perfil automático e validação da RPC de finalização.**

A criação do Auth user dispara `auth.users.on_auth_user_created`, que executa `public.handle_new_user()` e insere imediatamente um `public.profiles` com `user_id`, nome e e-mail, deixando `organization_id=NULL`. Na sequência, `platform_finalize_org_admin_provisioning` rejeita qualquer perfil cujo `organization_id IS DISTINCT FROM` a organização do job. Em PostgreSQL, `NULL IS DISTINCT FROM <uuid>` é verdadeiro. Portanto, o perfil recém-criado pelo trigger é classificado incorretamente como vínculo de outro tenant antes que o `UPSERT` posterior possa atribuir a organização.

Sequência comprovada pelo contrato vigente:

1. a Edge Function reclama o job e recebe `job_id`, `request_id` e lease;
2. cria o Auth user com `app_metadata.provisioning_request_id=request_id`;
3. o trigger `on_auth_user_created` cria automaticamente o profile com `organization_id=NULL`;
4. a Edge Function chama `platform_finalize_org_admin_provisioning(p_job_id, p_lease_token, p_user_id)`;
5. a guarda de vínculo incompatível encontra o profile com organização nula e levanta `platform_conflict: conta possui vínculos incompatíveis` (`SQLSTATE 23505`);
6. a Edge Function remove o Auth user recém-criado; o `ON DELETE CASCADE` remove o profile automático;
7. a Edge Function marca o job como `falhou`, persistindo apenas o código genérico `finalize_failed`.

Isso explica conjuntamente `attempt_count=1`, `user_id` e `auth_created_at` nulos, ausência final de Auth user/profile/papel, `email_attempt_count=0` e os 3,34 segundos entre criação e atualização do job. A compensação ocorreu antes da etapa SMTP.

### 35.2 Contrato implantado e exclusões

- A função implantada e o código atual são idênticos no bloco de criação/finalização/compensação.
- A assinatura chamada pela Edge Function coincide com a RPC canônica: três UUIDs nomeados `p_job_id`, `p_lease_token` e `p_user_id`.
- `platform_finalize_org_admin_provisioning` é `SECURITY DEFINER`, usa `search_path=''`, valida internamente `service_role` e só concede execução a `service_role`; `anon` e `authenticated` não executam.
- O forward-fix de metadata está aplicado no ledger e no runtime: criação grava `app_metadata`; lookup e finalize leem `auth.users.raw_app_meta_data`. A versão antiga que lia `raw_user_meta_data` não é a definição ativa.
- Não há evidência de mismatch de assinatura, grant, lease expirada, `provisioning_request_id`, responsável principal ou FK como causa deste caso. O intervalo completo durou segundos, muito abaixo da lease de dois minutos.
- A RPC toca `platform_org_admin_invites`, `auth.users` (leitura), `profiles`, `user_roles`, `platform_private.provisional_password_state` e, quando responsável principal, `organizations`. Constraints e grants necessários estão presentes.

Os logs consultáveis de Edge, Auth e Postgres não retiveram eventos do intervalo `05:11:27Z–05:11:32Z`; o log da função mostra apenas boots próximos. Não foi recuperado um evento histórico com SQLSTATE. Ainda assim, a causa é determinística pelo encadeamento das definições canônicas, e o estado residual confirma a compensação. A deficiência de observabilidade é adicional: a Edge Function substitui qualquer erro real da RPC pela string fixa `finalize_failed`, apagando a classificação específica do banco.

### 35.3 Retry e tratamento do job

**Um retry no estado atual repetiria a mesma falha.** Como não restou Auth user, o fluxo criaria outro usuário; o trigger criaria novamente um profile sem organização; a mesma guarda voltaria a rejeitá-lo; e a compensação apagaria novamente a identidade. Não reprocessar.

O job é **tecnicamente recuperável após correção**, pois está em `falhou`, sem lease e sem identidade parcial, e preserva a intenção original. Porém, ele contém empresa e endereço reais não aprovados para o cenário controlado. Portanto, deve permanecer bloqueado e ser cancelado/arquivado por mecanismo auditável em fase posterior autorizada; não deve ser reutilizado como homologação D51.2.

### 35.4 Plano de correção por fase — não aplicado

1. **Fase 1 — migration da RPC:** permitir adoção somente do profile automático do mesmo `user_id` quando `organization_id IS NULL`; continuar rejeitando organização diferente; no `UPSERT`, aceitar `NULL` ou a mesma organização e preencher explicitamente `organization_id=excluded.organization_id`. Preservar assinatura, `SECURITY DEFINER`, `search_path=''`, ACL exclusiva de `service_role`, lease/fencing e validação de `raw_app_meta_data`.
2. **Fase 2 — observabilidade sanitizada:** fazer a Edge Function persistir um código allowlisted por classe (`stale_lease`, `identity_conflict`, `profile_tenant_conflict`, `authorization_failed`, `database_constraint`) sem mensagem SQL, e registrar apenas etapa/código/SQLSTATE permitido; manter ausência de PII, token, senha e action link.
3. **Fase 3 — testes sem produção:** cobrir em banco isolado/transação revertida o profile automático com organização nula, conflito cross-tenant, metadata divergente, lease expirada, responsável principal e compensação; adicionar mock da Edge Function para verificar argumentos, classificação e deleção apenas de usuário criado pela execução corrente.
4. **Fase 4 — implantação controlada:** aplicar primeiro a migration e depois somente `platform-invite-org-admin`; executar negativas sem JWT/JWT inválido e inspeção read-only de grants/definições. Não abrir SMTP nem reprocessar este job.
5. **Fase 5 — destinação do incidente:** após autorização específica, cancelar/arquivar auditavelmente o job real. Uma homologação futura deve começar com nova organização e destinatário controlados, nunca reutilizando este registro.

Rollback técnico: restaurar a definição anterior da RPC e a versão anterior da Edge Function somente se nenhuma execução tiver sido concluída pela correção. Depois de qualquer provisionamento concluído, preferir forward-fix, preservando profile, papel, vínculo da organização e trilha de auditoria. Nenhuma correção, escrita, retry, envio ou alteração de status foi feita nesta rodada. SMTP permaneceu global/e-mail OFF/OFF e D52 permaneceu bloqueado.

### 35.5 Prompt proposto para a próxima fase

> **D51.2 — Fase 1: corrigir colisão do profile automático na finalização.** Alterar somente `platform_finalize_org_admin_provisioning` por migration idempotente no Supabase canônico `swzpzcwiasxmjutrmvkm`. Permitir que o profile automático do mesmo `user_id`, ainda com `organization_id=NULL`, seja adotado pela organização do job; manter bloqueio absoluto para organização diferente e papéis incompatíveis. Atualizar o `UPSERT` para preencher `organization_id`, preservando assinatura, `SECURITY DEFINER`, `search_path=''`, grants exclusivos de `service_role`, validação de `raw_app_meta_data.provisioning_request_id`, lease/fencing, ticket de organização e compensação. Adicionar testes transacionais/mock para profile nulo, conflito cross-tenant, metadata divergente, lease expirada e responsável principal. Não reprocessar jobs, não criar usuário, não enviar e-mail, não abrir SMTP, não alterar o job real, não publicar e não avançar D52. Entregar migration proposta, testes, riscos e rollback/forward-fix; parar antes de implantar se qualquer pré-condição divergir.

## 36. Fases 1–5 executadas e pré-check da Fase 6

Data/hora UTC: `2026-10-02T05:39Z`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

### 36.1 Fluxo anterior versus fluxo refinado

Antes, **Nova Empresa** criava apenas a organização e exigia mudança para **Administradores**, nova seleção da mesma empresa e repetição dos dados do responsável. A ação corrente e a lista histórica ficavam misturadas; e-mail corporativo e e-mail de acesso não eram diferenciados; telefone e CPF normalmente vazios ocupavam a tabela principal.

O fluxo existente em `/plataforma` passou a ser uma jornada única, sem rota, módulo ou tabela paralela:

1. **Empresa:** CNPJ consultado pelo mecanismo já existente, razão social/nome fantasia, e-mail corporativo, plano e trial;
2. **Responsável:** nome, e-mail de login/convite, telefone e CPF opcionais, Responsável Principal e Link de convite como padrão;
3. **Revisão:** resumo não editável e ação única **Criar empresa e enviar convite**;
4. criação da empresa e convite continuam operações server-side separadas, mas são orquestradas pela UI;
5. se a empresa for criada e o convite falhar, o `organizationId` é preservado e **Tentar convite novamente** executa somente o convite;
6. sucesso oferece **Ver empresa** e **Ver administradores**; o segundo entrega o contexto da organização à aba histórica, sem nova seleção;
7. **Administradores** continua autônoma para acompanhamento e administrador adicional; a tabela principal agora usa Empresa, Responsável, E-mail, Forma de acesso, Status, Última atualização e Ação.

Estados humanos consolidados: **Preparando → Empresa criada → Criando acesso → Enviando convite → Convite enviado → Falhou — tentar novamente**. O botão fica bloqueado durante ambas as mutations e os hooks permanecem com `retry:false`.

### 36.2 Forward-fix e observabilidade

A migration versionada `20261002052628_99b10aea-64fa-4968-a315-285560c83671.sql` substituiu apenas `platform_finalize_org_admin_provisioning(uuid,uuid,uuid)`:

- perfil do mesmo `user_id` com `organization_id=NULL` pode ser adotado;
- perfil já ligado à organização do job é aceito idempotentemente;
- organização divergente continua bloqueada por `platform_profile_tenant_conflict`;
- o UPSERT preenche `organization_id` explicitamente e preserva nome/e-mail já não vazios;
- papel diferente de `administrador`, metadata divergente e lease vencida continuam bloqueados;
- responsável principal, ticket de escrita, `raw_app_meta_data.provisioning_request_id`, fencing e compensação foram preservados.

Validação pós-migration no canônico: `SECURITY DEFINER=true`, `search_path=''`, execução permitida a `service_role` e negada a `anon`/`authenticated`; guardas de profile nulo, mesma organização, cross-tenant e app metadata presentes. RLS permanece habilitada em `organizations`, `organization_subscriptions`, `platform_org_admin_invites`, `profiles` e `user_roles`.

A Edge Function passou a classificar a etapa de finalização somente nos códigos allowlisted `profile_tenant_conflict`, `auth_metadata_mismatch`, `stale_lease`, `authorization_failed`, `database_constraint` e `finalize_internal_error`. Mensagens SQL, token, senha, destinatário e action link não são persistidos nem retornados. A compensação Auth continua restrita ao usuário criado pela execução corrente. SMTP continua **at-least-once** com lease/cooldown local; não há alegação de exactly-once do provedor.

Também foi removido o CORS curinga dessa função, reutilizando a allowlist compartilhada. Após implantação isolada de `platform-invite-org-admin`, o preflight do domínio oficial retornou `204` com origem exata e a origem maliciosa retornou `403`; JWT inválido foi recusado pelo gateway com `401`.

### 36.3 Arquivos alterados

- `supabase/migrations/20261002052628_99b10aea-64fa-4968-a315-285560c83671.sql`;
- `supabase/functions/platform-invite-org-admin/index.ts`;
- `supabase/functions/_shared/platform-invite-errors.ts`;
- `supabase/tests/org-onboarding/d51_finalize_forward_fix.sql`;
- `src/pages/plataforma/OrganizationOnboardingFlow.tsx`;
- `src/pages/plataforma/PlataformaEmpresas.tsx`;
- `src/pages/plataforma/PlataformaAdmins.tsx`;
- `src/pages/plataforma/PlataformaHome.tsx`;
- `src/test/saas/d51-finalize-forward-fix.test.ts`;
- `src/test/saas/d51-unified-onboarding.test.ts`.

### 36.4 Testes, scanner e implantação

- typecheck: **PASS**;
- build de produção/PWA: **PASS**, incluindo geração de `sw.js`;
- testes focados finais: **43/43 PASS**;
- suíte global: **5.333 PASS**, 4 skipped, sem falha;
- harness SQL transacional adicionado para contrato, ACL, metadata e isolamento; não executado contra dados produtivos;
- runner Deno: nenhum módulo de teste foi encontrado para essa função; cobertura do helper e entrega foi executada pelo Vitest;
- scanner profundo: **0 Critical, 0 Error, 0 Warning; 10 Info**;
- linter geral: 492 avisos históricos já registrados, incluindo Leaked Password Protection desativada; nenhum delta P0/P1 causado pelo fix;
- migration aplicada no canônico; somente `platform-invite-org-admin` implantada; frontend republicado em `https://app.cultivofarm.com.br`;
- smoke HTTP: `/`, `/auth`, `/plataforma`, chunk principal e `/sw.js` retornaram `200`.

Rollback: antes de qualquer provisionamento concluído, é possível restaurar a definição anterior da RPC e a versão anterior da Edge/UI. Depois de conclusão, usar forward-fix e preservar profile, papel, organização e auditoria; não apagar histórico. A migration não altera dados existentes.

### 36.5 Preservação do incidente e pré-check Fase 6

O job real `1d14f78b…c558` permaneceu exatamente em `falhou`, `attempt_count=1`, `last_error_code=finalize_failed`, `email_delivery_status=pending`, `email_attempt_count=0`, sem `user_id` e sem leases. Ele não foi reprocessado, reenviado, cancelado ou alterado. Há zero organizações e zero jobs com prefixo D51.2 ou destinatário `teste@refilinformatica.com.br`; leases ativos de provisionamento/e-mail são zero.

SMTP canônico permaneceu fechado: entrega global **OFF**, e-mail **OFF**, Test Mode **ON**, allowlist exatamente `teste@refilinformatica.com.br`, configuração SMTP presente somente por booleanos e WhatsApp/in-app/webhook **OFF**. Nenhum segredo foi lido ou exposto.

A busca em código, migrations, testes, scripts e documentação **não encontrou mecanismo oficial ou fixture de CNPJ de teste para `platform_create_organization`**. O fluxo exige CNPJ válido no frontend e no servidor; os artefatos de homologação encontrados pertencem a outros módulos e não autorizam seu uso neste cadastro. Conforme a regra expressa da Fase 6, a execução parou antes de abrir SMTP ou criar empresa.

**Decisão:** Fases 1–5 concluídas e implantadas; Fase 6 **NO-GO por uma única pendência: ausência de CNPJ oficial de teste suportado pelo fluxo**. Não houve E2E, tentativa SMTP ou cleanup operacional novo. D51.2 permanece aberto e D52 bloqueado. Para retomar, o responsável deve fornecer ou aprovar um mecanismo oficial de CNPJ sintético/teste compatível com a validação existente; não usar CNPJ real nem burlar a validação de produção.

## 37. Fase 6 — pré-check do CNPJ controlado autorizado

Data/hora UTC: `2026-10-02T11:58:27Z`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

### 37.1 Resultado de existência e correlação

O CNPJ autorizado, normalizado como `41775946000107`, **já existe no canônico**:

- exatamente **1 organização** usa `organizations.cnpj_normalizado=41775946000107`;
- organização: **AR BIOTECNOLOGIA LTDA**, ID mascarado `007bb519…0048`, status `aguardando_ativacao`;
- a organização possui exatamente **1 assinatura TRIAL** e **1 auditoria** com motivo `criação pela plataforma`;
- existe ainda **1 configuração fiscal** com o mesmo CNPJ, vinculada à organização **CultivoFarm**, ID mascarado `8eae2bc1…93ca`;
- não foram encontrados registros com esse documento em `clientes`, `customer_fiscal_profiles`, `fiscal_invoices`, `partner_accounts`, `profiles.cpf_cnpj` ou `platform_org_admin_invites.cpf_cnpj`.

Assim, a nova autorização factual confirma que o CNPJ informado é precisamente o CNPJ da organização real AR BIOTECNOLOGIA anteriormente criada e também aparece em configuração fiscal de outra organização. Ele não pode identificar uma nova empresa de homologação.

### 37.2 Duplicidade e comportamento server-side

`organizations` possui índice UNIQUE parcial `uq_organizations_cnpj_normalizado` sobre `cnpj_normalizado` não nulo. Além disso, `platform_create_organization` normaliza e valida o documento no servidor e, antes da escrita, consulta `organizations.cnpj_normalizado`; em coincidência, encerra com `platform_duplicate: CNPJ já cadastrado` (`SQLSTATE 23505`).

Portanto, a RPC **não permitiria** criar uma segunda organização com esse CNPJ. O frontend unificado também detecta a organização existente e bloqueia a ação antes da RPC. O parâmetro de rascunho não contorna a unicidade e não existe modo de homologação, sandbox lógico ou clonagem não identificadora aplicável a essa RPC. As opções seguras, sem alterar regras de produção, são:

1. autorizar outro CNPJ controlado que seja válido e inexistente no canônico; ou
2. definir futuramente um mecanismo oficial de identificador sintético em ambiente isolado, submetido a revisão e autorização próprias.

Reutilizar AR BIOTECNOLOGIA ou seu job foi expressamente proibido e não é opção para este E2E.

### 37.3 Estado do gate e implantação

- zero organizações com prefixo `HOMOLOGAÇÃO D51.2`;
- zero jobs para `teste@refilinformatica.com.br`;
- SMTP global **OFF** e e-mail **OFF**;
- Test Mode **ON** e allowlist exclusiva `teste@refilinformatica.com.br`;
- WhatsApp, in-app e webhook **OFF**;
- zero leases de provisionamento e zero leases de e-mail;
- migration `20261002052628` presente no ledger; finalizer `SECURITY DEFINER`, `search_path=''`, execução somente por `service_role`;
- fluxo unificado confirmado no bundle publicado `App-y87BJCpA.js` pelos marcadores Empresa → Responsável → Revisão e ação única;
- job real mascarado `1d14f78b…c558` permaneceu em `falhou`, tentativa 1, `finalize_failed`, e-mail `pending`, zero tentativa SMTP, sem usuário e sem leases.

### 37.4 Decisão

Conforme a regra principal, o pré-check terminou em **NO-GO antes de qualquer mutação**. A janela SMTP não foi aberta e E01/E02 não foram executados. Não houve criação, convite, usuário, envio, retry, alteração do job real ou cleanup. D51.2 permanece aberto e D52 bloqueado.

## 38. Fase 6 — repetição com novo CNPJ autorizado

Data/hora UTC: `2026-10-02T12:16:56Z`  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`  
CNPJ autorizado: `36.736.180/0001-11` (`36736180000111`)

### 38.1 Pré-check somente leitura

O novo documento passou na validação de dígitos verificadores usada pelo frontend e pelo núcleo da consulta integrada (DVs calculados `11`). A BrasilAPI, provedor já integrado ao fluxo, respondeu `200` e informou situação cadastral **ATIVA**, razão social `FSF AGROSERVICE PRODUTOS AGRICOLAS E SERVICOS LTDA` e nome fantasia `FSF AGROSERVICE E COMERCIO`. O retorno não contém e-mail corporativo.

Contagens no canônico para o documento normalizado:

| Vínculo | Contagem |
|---|---:|
| `organizations` | 0 |
| `company_fiscal_settings` | 0 |
| `clientes` | 0 |
| `customer_fiscal_profiles` | 0 |
| `partner_accounts` | 0 |
| `profiles` | 0 |
| `fiscal_invoices` | 0 |
| `platform_org_admin_invites` | 0 |

O índice UNIQUE parcial `uq_organizations_cnpj_normalizado` e a guarda server-side de `platform_create_organization` continuam presentes. A RPC valida o CNPJ, rejeita duplicidade, exige Superadmin autenticado e cria, numa única transação, organização, assinatura `TRIAL` e auditoria de criação. O plano padrão ativo é `base` (`Plano Base`).

### 38.2 Estado D51.2 e implantação

- zero organizações com prefixo `HOMOLOGAÇÃO D51.2`;
- zero jobs, Auth users e profiles para `teste@refilinformatica.com.br`;
- SMTP global **OFF** e e-mail **OFF**;
- Test Mode **ON**, allowlist exclusiva `teste@refilinformatica.com.br`;
- configuração SMTP completa confirmada somente por booleanos;
- WhatsApp, in-app e webhook **OFF**;
- zero leases ativos;
- migration `20261002052628` presente; finalizer `SECURITY DEFINER`, `search_path=''`, `EXECUTE` apenas para `service_role`;
- bundle publicado `App-y87BJCpA.js` contém a RPC e o fluxo Empresa → Responsável → Revisão → Criar empresa e enviar convite;
- job real AR BIOTECNOLOGIA permaneceu em `falhou`, tentativa 1, `finalize_failed`, e-mail pendente, zero tentativa SMTP, sem usuário e sem leases.

### 38.3 Decisão e E01

O CNPJ está livre, válido e sem vínculo conflitante. Contudo, a execução controlada não dispõe de sessão real de Superadmin (`external_unmanaged`) e o lookup oficial não fornece o e-mail corporativo obrigatório para `platform_create_organization`. Não foi inventado um endereço nem usado `service_role` como sessão de usuário.

Por segurança, a janela SMTP **não foi aberta** e E01 ficou **NOT RUN/BLOQUEADO**, não FAIL funcional. Não houve mutação, criação, convite ou envio. O ponto exato de retomada é: fornecer o e-mail corporativo autorizado da empresa e executar o fluxo publicado com sessão real de Superadmin; então abrir somente as duas flags auditáveis e executar um único E01. E02 continua proibido até nova auditoria pós-E01. D52 permanece bloqueado.

## 39. Ajuste final — checkpoint explícito E01 → E02

Data: 2026-10-02

O e-mail corporativo `renato@refilinformatica.com.br` foi autorizado e o responsável confirmou sessão Superadmin no ambiente publicado. A revisão do bundle vigente confirmou que a ação **Criar empresa e enviar convite** ainda executava criação e convite em sequência, impedindo a auditoria obrigatória de organização, assinatura e evento antes de E02.

O frontend foi ajustado sem alterar backend, RPC, migration, rota, tabela, SMTP ou flags:

1. **Criar empresa** chama exclusivamente `platform_create_organization`;
2. no sucesso, preserva o `organizationId` e exibe **Empresa criada — pronta para auditoria**;
3. os campos e a navegação de volta ficam bloqueados após a criação, mantendo o resumo imutável;
4. **Enviar convite** surge como segunda ação explícita e usa somente o `organizationId` já persistido;
5. falha/retry do convite nunca chama novamente a criação;
6. o handoff **Ver empresa / Ver administradores** continua recebendo a organização criada.

Estados humanos: **Preparando → Criando empresa → Empresa criada — pronta para auditoria → Criando acesso → Enviando convite → Convite enviado → Falhou — tentar novamente**. Uma trava síncrona adicional protege as duas ações contra duplo clique antes da atualização visual do estado.

Nesta rodada não houve E01, E02, criação real, convite, usuário, e-mail, alteração SMTP ou acesso ao job real AR BIOTECNOLOGIA. O próximo ponto autorizado é exclusivamente E01 manual; E02 permanece bloqueado até a auditoria pós-E01 e D52 continua bloqueado.

## 40. Verificação pós-Update — checkpoint publicado e E01 manual liberado

Data: 2026-10-02

Verificação integralmente somente leitura no domínio oficial e no Supabase canônico `swzpzcwiasxmjutrmvkm`:

1. HTML, service worker e todos os chunks JavaScript atuais foram baixados com cache-busting. O deployment exposto foi identificado por `x-deployment-id` e o chunk de aplicação `App-DdDbgc5U.js` contém **Criar empresa**, **Empresa criada — pronta para auditoria** e **Enviar convite**;
2. a frase anterior **Criar empresa e enviar convite** não existe nos chunks publicados. Portanto, ela não é mais a ação operacional do checkpoint;
3. `/`, `/auth` e `/plataforma` responderam HTTP 200. Em sessão anônima, `/` e `/plataforma` redirecionaram corretamente para `/auth`, sem erro de página ou runtime. As respostas 401 observadas foram apenas negativas esperadas da sessão não autenticada;
4. o domínio está ativo, primário, publicado e com cache do HTML desabilitado. O pacote publicado contém o comportamento do checkpoint do commit `b29a84a3bcb6527a1e0a09bc35086449118bd671`; como o servidor não expõe hash Git, a equivalência foi confirmada pelos marcadores funcionais e pela ausência da ação antiga;
5. o pré-check canônico confirmou: CNPJ `36.736.180/0001-11` livre; zero organização **HOMOLOGAÇÃO D51.2**; zero job, Auth user ou profile para `teste@refilinformatica.com.br`; zero leases ativos; entrega global OFF e e-mail OFF; Test Mode ON; allowlist contendo exclusivamente `teste@refilinformatica.com.br`; WhatsApp, in-app e webhook OFF;
6. o job real AR BIOTECNOLOGIA permaneceu intocado: `falhou`, tentativa 1, `finalize_failed`, e-mail `pending`, zero tentativa SMTP, sem usuário e sem leases.

**Decisão: PASS.** O checkpoint está publicado e E01 manual está liberado exclusivamente com o CNPJ `36.736.180/0001-11` e o e-mail corporativo `renato@refilinformatica.com.br`. Após clicar **Criar empresa**, o responsável deve parar ao visualizar **Empresa criada — pronta para auditoria** e não clicar **Enviar convite**. SMTP permanece fechado; E02 e D52 continuam bloqueados.

## 41. Diagnóstico read-only do E01 com dados divergentes

Data: 2026-10-02

### 41.1 Evidência canônica

Às `2026-10-02 14:30:51.272028Z`, uma identidade com papel `superadmin` criou uma única organização `4e537fd6…8f9f` com os valores efetivamente recebidos pela RPC. O `ator_id` da auditoria e o `created_by` da assinatura são iguais; os registros não permitem comprovar que era a mesma aba ou sessão de navegador usada no pré-check:

- razão social/nome: `REFIL INFORMATICA LTDA`;
- nome fantasia: `Refil Informática`;
- CNPJ normalizado: `09.255.249/0001-12`;
- e-mail corporativo: `refilinformatica@gmail.com`;
- situação: `aguardando_ativacao`, ativa;
- uma assinatura `Completo`, status `TRIAL`;
- um evento de auditoria `NULL → aguardando_ativacao`, motivo `criação pela plataforma`.

O CNPJ autorizado `36.736.180/0001-11` e o e-mail corporativo autorizado `renato@refilinformatica.com.br` não aparecem em nenhuma organização. Para a organização REFIL e para `teste@refilinformatica.com.br`, permanecem zero jobs, Auth users, profiles e papéis. Portanto, o checkpoint funcionou: E02 não ocorreu.

### 41.2 Origem dos valores

Busca literal no repositório atual, em todos os commits Git e em todos os chunks JavaScript/CSS publicados encontrou **zero ocorrência** de `09255249000112`, `09.255.249/0001-12`, `REFIL INFORMATICA LTDA` ou `refilinformatica@gmail.com`. Não há default REFIL, fixture, seed ou valor oculto no frontend.

O fluxo `OrganizationOnboardingFlow` inicia CNPJ, razão, fantasia e e-mail vazios; não usa `localStorage`, `sessionStorage`, rascunho persistido nem cache React Query para esses campos. A consulta CNPJ chama diretamente `onboarding-cnpj-lookup` a cada busca. No servidor, o CNPJ é normalizado, validado e usado na URL da BrasilAPI; a resposta é rejeitada se o CNPJ retornado divergir do consultado. O rate limiter mantém apenas timestamps por usuário/escopo e não armazena resultados.

A consulta direta à mesma fonte confirmou:

- `36.736.180/0001-11` → `FSF AGROSERVICE PRODUTOS AGRICOLAS E SERVICOS LTDA`, sem e-mail retornado;
- `09.255.249/0001-12` → `REFIL INFORMATICA LTDA`, sem e-mail retornado.

Assim, não existe caminho demonstrado em que consultar `36.736.180/0001-11` retorne REFIL. A correspondência exata entre o CNPJ criado e a razão REFIL comprova que o estado enviado ao criar estava associado ao CNPJ `09.255.249/0001-12`. Como a fonte não devolve e-mail para esse CNPJ, `refilinformatica@gmail.com` entrou separadamente no campo editável, por digitação ou autofill. O plano `Completo` também não é o plano padrão (`Base`), mostrando outra seleção presente no formulário.

Os campos não declaram `autocomplete`, portanto autofill do navegador é tecnicamente possível. Também é possível uma aba já aberta conservar estado React em memória até recarga. Não há telemetria do navegador, corpo da requisição, log de lookup ou log PostgREST/Auth/Edge retido no intervalo `14:30:45Z–14:31:00Z`; logo não é possível distinguir factualmente digitação, autofill ou estado de aba antiga.

### 41.3 Classificação

- **A — hardcoded/default:** descartada;
- **B — estado persistido/localStorage:** descartada;
- **C — cache de lookup:** descartada;
- **D — browser autofill:** possível somente para campos editáveis, não comprovada;
- **E — aba antiga/estado em memória:** possível, não comprovada;
- **F — entrada manual equivocada:** possível, não comprovada;
- **G — outro motivo comprovado:** o servidor recebeu e persistiu um payload coerente com `09.255.249/0001-12`, não com o cenário autorizado; a origem humana/browser anterior ao clique não ficou registrada.

### 41.4 Logs e linha do tempo

O checkpoint foi commitado às `13:01:22Z`, verificado no pacote publicado antes de E01 e continua presente no bundle atual. A criação ocorreu às `14:30:51Z`. Consultas aos logs Postgres/PostgREST/Auth/Edge no intervalo exato não retornaram eventos, e a função de lookup não reteve entrada nem resultado correspondente. O corpo da chamada `platform_create_organization` não está disponível; não foi reconstruído ou inventado.

### 41.5 Estado seguro e prevenção proposta

SMTP continua global/e-mail **OFF/OFF**, Test Mode **ON**, allowlist exclusiva e demais canais OFF. O job real AR BIOTECNOLOGIA permanece `falhou`, tentativa 1, sem usuário/leases e sem tentativa SMTP.

A organização REFIL possui exatamente uma assinatura e uma auditoria, sem E02. Recomenda-se, em rodada separada e autorizada, cancelar ou inativar auditavelmente a organização e a assinatura, sem apagar o histórico.

Prevenção mínima proposta, ainda não implementada:

1. exibir CNPJ, razão social e e-mail corporativo em confirmação final explícita junto da ação **Criar empresa**;
2. guardar em memória um snapshot/token da última consulta e impedir criação se o CNPJ da revisão divergir do CNPJ consultado;
3. invalidar esse snapshot sempre que o CNPJ mudar ou uma nova consulta começar;
4. desabilitar autofill nos campos de CNPJ e e-mail corporativo onde aplicável;
5. registrar observabilidade sanitizada com hash/correlação do CNPJ consultado e criado, sem registrar dados pessoais ou corpo bruto.

**Decisão: E01 FAIL / E02 NO-GO.** Nenhuma alteração de dados, status, SMTP, usuário ou job foi executada nesta auditoria. D52 permanece bloqueado.

## 42. Prevenção de E01 divergente e análise de contenção

Data: 2026-10-02  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`

### 42.1 Mecanismos oficiais existentes

A leitura do runtime e das migrations confirmou:

- `platform_set_organization_status` exige sessão autenticada e `is_platform_superadmin(auth.uid())`, motivo mínimo, lock da organização, validação de transição e auditoria em `organization_status_audit`;
- a organização REFIL está em `aguardando_ativacao`. Desse estado, o servidor permite `onboarding`, `rascunho` ou `cancelada`;
- `cancelada` é terminal: não existe transição oficial de retorno. `suspensa` é reversível para `ativa`, mas não pode ser alcançada diretamente a partir de `aguardando_ativacao`;
- `platform_change_subscription` exige Superadmin e motivo, aceita `TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED` ou `EXPIRED` e registra a alteração automaticamente em `organization_subscription_history`;
- não existe acoplamento automático entre situação da organização e assinatura. Uma contenção coerente exige duas RPCs oficiais;
- a automação está em ambiente Supabase externo sem sessão injetável do Superadmin. `service_role` não foi usado como ator.

Conclusão refinada: existe contenção oficial e reversível sem cancelamento terminal: mover a organização de `aguardando_ativacao` para `rascunho` e a assinatura de `TRIAL` para `SUSPENDED`, sempre pelas duas RPCs auditáveis. A assinatura suspensa deixa de gerar direitos, embora `organizations.ativo` permaneça verdadeiro no estado `rascunho`; portanto isso é contenção de acesso, não inativação booleana da linha. O cancelamento de ambos seria inativação plena, mas terminal e incompatível com a exigência de reversibilidade. A execução automática não dispõe da sessão real Superadmin do Supabase externo e não usou `service_role` como ator; por isso a Fase 5 permaneceu sem escrita.

### 42.2 Proteções implementadas no frontend

O fluxo existente recebeu, sem nova rota, tabela ou persistência de PII:

1. snapshot em memória da resposta oficial com CNPJ normalizado, razão social, nome fantasia e horário da consulta;
2. rejeição imediata quando a resposta oficial traz CNPJ diferente do consultado;
3. invalidação do snapshot e da confirmação ao iniciar nova consulta, alterar o CNPJ ou reiniciar;
4. revisão separada em **Empresa que será criada** e **Responsável que receberá acesso**, exibindo CNPJ, razão social, nome fantasia, e-mail corporativo, plano/trial e identidade futura;
5. campo **Confirme o CNPJ**, limitado aos 14 dígitos, que precisa coincidir com o snapshot/revisão para habilitar **Criar empresa**;
6. revalidação imediatamente antes da RPC: CNPJ, razão oficial, e-mail corporativo, plano e demais valores precisam continuar idênticos ao snapshot de revisão;
7. mutation construída exclusivamente a partir do objeto imutável revisado, e não dos campos editáveis correntes;
8. `autocomplete="off"` em CNPJ, e-mail corporativo e e-mail do responsável;
9. preservação da trava de duplo clique, do checkpoint E01→E02 e do bloqueio de retorno/edição após `organizationId`.

Não foi usado `localStorage`, `sessionStorage` ou React Query para armazenar o formulário ou o snapshot.

### 42.3 Testes, scanner e publicação

- testes focados finais: **16/16 PASS**, incluindo CNPJ divergente, snapshot/razão oficial divergentes, e-mail corporativo revisado, reset, ausência de convite automático, checkpoint e retry exclusivo do convite;
- suíte global: **352 arquivos aprovados, 1 ignorado; 5.345 testes aprovados, 4 ignorados**;
- typecheck: **PASS**;
- build automático: **PASS**;
- scanner: **zero Critical/Error/Warning**, dez achados informativos históricos; Leaked Password Protection continua como risco aceito, não resolvido;
- publicação apenas do frontend: solicitada novamente a partir do HEAD `db2a68671924d87c34156e659ed4a7a9ed67f957`;
- smoke final do domínio oficial: `/`, `/auth` e `/plataforma` responderam 200. O carregador `index-CJm5d-jL.js` resolveu oito pacotes e o chunk `App-Hejg0VR9.js` contém **Confirme o CNPJ** e **Empresa que será criada**. A propagação da prevenção está comprovada.

### 42.4 Estado canônico preservado

- REFIL permanece `aguardando_ativacao`, ativa, com uma assinatura Completo/TRIAL, zero jobs e zero profiles; nenhuma contenção foi executada;
- CNPJ correto `36.736.180/0001-11`: zero organizações;
- zero organizações `HOMOLOGAÇÃO D51.2`;
- zero jobs/profiles para `teste@refilinformatica.com.br` e zero leases de e-mail ativos;
- Comunicação: global OFF, e-mail OFF, Test Mode ON, allowlist exclusiva, demais canais OFF;
- job AR BIOTECNOLOGIA: `falhou`, tentativa 1, `finalize_failed`, e-mail `pending`, zero tentativa SMTP, sem usuário ou lease.

**Decisão:** proteção aprovada, publicada e comprovada. A contenção reversível está definida, mas **NOT RUN** porque esta execução não recebeu sessão real Superadmin do Supabase externo; nenhuma escrita alternativa foi feita. **NO-GO para repetir E01** até aplicar e auditar REFIL como `rascunho` e sua assinatura como `SUSPENDED`. E02 e D52 permanecem bloqueados.

## 43. Verificação pós-deploy — proteção E01

Data: 2026-10-02

Smoke integralmente somente leitura, sem autenticação, banco, SMTP, publicação ou execução de E01/E02:

1. o domínio oficial `https://app.cultivofarm.com.br` foi carregado em contexto limpo, com service worker bloqueado e cache-busting no HTML e nos pacotes;
2. o HTML referenciou `index-CJm5d-jL.js`, e a varredura dos oito pacotes alcançáveis encontrou no pacote `App-Hejg0VR9.js` os quatro marcadores esperados: **Confirme o CNPJ**, **Empresa que será criada**, **Empresa criada — pronta para auditoria** e **Enviar convite**;
3. a ação antiga única **Criar empresa e enviar convite** não foi encontrada em nenhum dos pacotes verificados;
4. `/`, `/auth` e `/plataforma` responderam HTTP 200. Em sessão anônima, `/` e `/plataforma` redirecionaram corretamente para `/auth`;
5. não houve falha de navegação, pacote ou página. As quatro respostas 401 observadas vieram exclusivamente da consulta protegida `configuracoes_sistema` sem sessão e constituem negativas esperadas, não erro de runtime do fluxo;
6. nenhuma nova publicação foi solicitada e nenhuma autenticação ou operação funcional foi executada.

**Decisão: PASS.** A proteção E01 do candidato informado como `db2a68671924d87c34156e659ed4a7a9ed67f957` está publicada e comprovada pelos marcadores funcionais no domínio oficial. Ela está pronta para um novo E01, porém a execução continua bloqueada até a contenção auditável da organização REFIL. E02 e D52 permanecem bloqueados.

## 44. Incidente P0 frontend — overlay de atualização PWA

Data: 2026-10-02

### 44.1 Causa confirmada

O ciclo anterior disparava `pwa:updating-start` no mero `updatefound`, antes de o novo worker alcançar `installed`/`waiting`. O estado global `updateInProgress` não possuía evento de encerramento e permanecia verdadeiro quando a instalação ficava `redundant`, quando a ativação estagnava ou quando a trava de recarga de 15 segundos impedia a recarga. O fallback de oito segundos reutilizava a mesma recarga protegida e, quando bloqueado, também não encerrava o overlay.

### 44.2 Correção frontend

- eventos explícitos e idempotentes de início e fim centralizados em `registerSW.ts`;
- overlay iniciado somente para worker instalado/aguardando com controlador atual ou recuperação real de pacote obsoleto;
- encerramento central em worker redundante, ativação sem `controllerchange`, recarga bloqueada/falha, cleanup e timeout absoluto de 12 segundos;
- `controllerchange` limpa timers antes da tentativa única de recarga;
- recuperação de pacote obsoleto limpa somente caches runtime do app e encerra o estado se a recarga não puder ocorrer;
- timeout visual independente de 15 segundos remove o backdrop e restaura o uso da página mesmo diante de falha inesperada;
- `?sw=off`, recusa em preview/dev/iframe e `skipWaiting`/`clientsClaim` foram preservados.

### 44.3 Evidências antes da publicação

- testes focados PWA/reset/binding: **26/26 PASS**;
- suíte global: **354 arquivos aprovados, 1 ignorado; 5.354 testes aprovados, 4 ignorados**;
- typecheck: **PASS**;
- build automático: **PASS**;
- scanner: **zero Critical/Error/Warning**, dez achados informativos históricos; Leaked Password Protection permanece risco aceito.

Nenhum banco, Supabase, SMTP, organização, usuário, E01/E02 ou job foi tocado. D52 permanece bloqueado. Durante a propagação, o contorno emergencial preservado é `https://app.cultivofarm.com.br/?sw=off`, que desregistra o app-shell service worker daquele navegador.

### 44.4 Publicação e smoke do domínio oficial

Foi solicitada uma única publicação frontend para `https://app.cultivofarm.com.br`. No smoke posterior com navegador limpo:

- `/auth` respondeu HTTP 200 e o app-shell service worker `/sw.js` estava registrado;
- o pacote publicado ainda não continha `pwa:updating-end` nem `overlay-safety-timeout`, marcadores da correção;
- o overlay não apareceu espontaneamente na abertura, mas, ao simular somente o evento público de início, permaneceu visível e manteve o `body` bloqueado após 15,5 segundos, comprovando que o domínio ainda servia a implementação anterior;
- `/?sw=off` respondeu HTTP 200 e deixou zero registros de app-shell service worker no navegador de teste, confirmando o contorno emergencial;
- as respostas 401 observadas foram apenas consultas protegidas esperadas em sessão anônima.

**Decisão pós-publicação: FAIL por ausência de propagação no domínio customizado.** A correção está verde no candidato local, mas não pode ser declarada ativa no domínio oficial. Conforme a regra de parada, nenhuma nova publicação foi solicitada em loop. Aguardar a propagação e repetir somente o smoke antes de encerrar o P0. E01/E02 e D52 permanecem bloqueados.