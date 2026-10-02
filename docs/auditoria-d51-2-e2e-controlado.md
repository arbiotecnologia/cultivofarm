# Auditoria D51.2 — E2E controlado

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