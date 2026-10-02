# Auditoria mestre — AUDIT-CF-20261002-01

## Estado executivo

- Projeto canônico: `swzpzcwiasxmjutrmvkm`.
- Fase 0: **PASS com riscos P2/P3 registrados**.
- Fase 1 / E01: **BLOCKED por autenticação humana**, ainda não executado.
- O antigo NO-GO baseado na impossibilidade de prefixar a razão social foi reclassificado: a razão oficial deve permanecer íntegra; a identificação segura da fixture será feita em `nome_fantasia`.
- Nenhuma mutação de dados, abertura SMTP, envio, E02 ou cleanup foi executado nesta rodada.
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

### Resultado canônico read-only

| Verificação | Resultado |
|---|---|
| Organização pelo CNPJ autorizado ou prefixo | **0** |
| Organização criada desde o início desta rodada | **0** |
| Assinatura do alvo | **0** |
| Auditoria de status do alvo | **0** |
| Convite/job do alvo ou destinatário controlado | **0** |
| Auth user/profile/papel vinculado ao alvo | **0** |
| Leases ativos globais de convite/e-mail | **0** |
| SMTP global/e-mail | **OFF/OFF** |
| Test Mode | **ON** |
| Allowlist | 1 endereço; destinatário controlado presente |
| Outros canais | WhatsApp, webhook e in-app OFF |
| Negativas sem JWT válido | **3/3 PASS**; convite, settings e teste de e-mail retornaram 401 |

O job real AR BIO permanece intocado: status `falhou`, uma tentativa, `email_delivery_status=pending`, zero tentativa de e-mail, sem usuário e sem lease. Nenhum destinatário não autorizado foi usado.

### Decisão

**Fase 1 BLOCKED no clique autenticado de E01.** O falso bloqueio de identificação foi removido; a ausência de um mecanismo oficial para criar/conceder Superadmin temporário impede o browser E2E automatizado sem reduzir a segurança. O fluxo está preparado para a sessão humana executar somente **Criar empresa** e parar em **Empresa criada — pronta para auditoria**. SMTP e E02 continuam bloqueados até a auditoria canônica comprovar exatamente uma organização, uma assinatura TRIAL, uma auditoria e zero objetos do destinatário.

Os subcenários executáveis sem ação humana foram concluídos: contratos estáticos de checkpoint/retry, CORS/JWT, negativas implantadas, ausência de objetos controlados, SMTP fail-closed e leases. Criação E01, abertura SMTP, E02, recebimento, primeiro acesso e recovery exigem antes um E01 canônico válido e permanecem `NOT RUN`.

## Rollback e forward-fix

- Dados: não aplicável; nenhuma mutação foi feita.
- Hardening das Edge Functions: rollback por reversão dos arquivos e dos blocos de configuração; forward-fix preferencial, caso surja incompatibilidade, mantendo CORS fail-closed, JWT obrigatório e respostas sanitizadas.
- E01: o marcador usa `nome_fantasia`; não há mudança de esquema. A execução requer apenas sessão humana Superadmin e deve parar no checkpoint anterior ao convite.
