# Auditoria mestre — AUDIT-CF-20261002-01

## Estado executivo

- Projeto canônico: `swzpzcwiasxmjutrmvkm`.
- Fase 0: **PASS com riscos P2/P3 registrados**.
- Fase 1 / E01: **PASS**; E02: **FAIL no SMTP**, sem retry autorizado até corrigir a observabilidade do erro desconhecido.
- O antigo NO-GO baseado na impossibilidade de prefixar a razão social foi reclassificado: a razão oficial deve permanecer íntegra; a identificação segura da fixture será feita em `nome_fantasia`.
- Após o E01 humano, a auditoria abriu somente a janela SMTP global/e-mail pelo mecanismo auditável; nenhum convite, usuário ou envio foi criado.
- Leaked Password Protection: risco temporariamente aceito, aberto e não homologado.

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
| PWA | registro e notificador manual | service worker | consentimento explícito | versão/timestamp técnico local |

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
