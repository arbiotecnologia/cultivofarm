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

A confirmação manual informou empresa criada, convite gerado e mensagem recebida pelo endereço controlado, sem abertura do link. Entretanto, as leituras somente leitura do Supabase canônico não encontraram os registros correspondentes:

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

- **E01: FAIL** — organização do gate ausente no Supabase canônico.
- **E02: FAIL** — convite/job, Auth user, profile e papel esperados ausentes no Supabase canônico.
- **E03: FAIL / NÃO COMPROVÁVEL** — o recebimento foi confirmado manualmente, porém não existe job canônico nem tentativa/aceite SMTP correlacionável; não é possível provar destinatário único ou ausência de retry.
- **GO/NO-GO para E04:** **NO-GO**.

Há inconsistência entre a ação/recebimento relatados e o estado canônico. O link recebido **não deve ser aberto** até identificar em qual ambiente a ação foi efetivamente persistida e correlacionar, sem expor o link, a organização, o job e o Auth user esperados. D51.2 permanece aberto e bloqueado neste ponto; D52 não foi iniciado.

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

Houve uma única auditoria `apply` de provider settings às `04:31:55.246155Z`, coerente com acesso/configuração da aba Comunicação, não com criação de empresa, convite ou envio. Isso também exclui o botão de teste SMTP canônico como origem da mensagem relatada.

### 31.4 Service worker e hipótese de cache

O HTML e `/sw.js` atuais são entregues com `no-cache`; os chunks com hash são imutáveis. O SW atual contém precache versionado, `cleanupOutdatedCaches`, `clientsClaim`, `skipWaiting` e os caches `html-nav`/`static-assets`; o carregador possui recuperação para chunk obsoleto. Uma aba já aberta pode manter JavaScript em memória até recarregar, mas:

1. a combinação histórica “UI atual de E01/E02 + backend antigo” não existe no histórico auditado;
2. a Comunicação autenticada comprovada na mesma janela produziu auditoria no canônico;
3. não houve nenhuma requisição/efeito de E01/E02 no canônico.

Logo, cache antigo isoladamente não explica os fatos observados. Continua possível que E01/E02 tenham sido realizados em outra aba, domínio, instalação PWA ou projeto visualmente semelhante, mas o ref exato dessa execução não pode ser inferido com segurança a partir do canônico ou do bundle live atual.

### 31.5 Classificação, risco e decisão

**Classificação: D — ação manual ocorreu em outro contexto de ambiente/aplicação, comprovado por exclusão dos caminhos A, B e C no estado auditável.** O backend alternativo exato e o emissor da mensagem permanecem **não identificados**; não há autorização/evidência suficiente para consultar projetos antigos nem para extrair token/link do e-mail.

- A) frontend live apontando para backend errado: **refutado** pelo bundle publicado e binding fail-closed;
- B) fluxo E01/E02 não persiste como esperado: **refutado** pelos contratos transacionais e ausência de sucesso otimista;
- C) bundle/cache antigo: **não sustentado** — não existe versão histórica com o fluxo atual e ref antigo;
- D) outro ambiente/contexto: **confirmado por exclusão**, com destino exato ainda não atribuível;
- E) outro motivo: nenhuma evidência encontrada.

Risco: o link recebido não é correlacionável ao canônico e pode pertencer a outro projeto/ambiente. Ele permanece **não confiável e não deve ser aberto, copiado ou inspecionado**. E01/E02/E03 continuam FAIL/não comprováveis e E04 permanece NO-GO.

**Não repetir E01/E02.** Para decidir uma nova execução, o responsável deve primeiro, sem abrir o link, conferir no navegador onde realizou a ação o domínio completo visível e recarregar a página antes de qualquer operação. Uma repetição só poderá ser autorizada em nova rodada com captura prévia do domínio oficial, hash `App-D9d5jviP.js`, Network mostrando exclusivamente `swzpzcwiasxmjutrmvkm.supabase.co` e confirmação pós-E01 no canônico antes de E02. Nenhum dado, SMTP, usuário ou tenant foi alterado nesta investigação; D52 permanece bloqueado.

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

**Decisão:** janela SMTP canônica fechada e estado fail-closed restaurado. E01/E02/E03 permanecem FAIL/não comprováveis, E04 permanece NO-GO, D51.2 continua bloqueado e D52 não foi iniciado.