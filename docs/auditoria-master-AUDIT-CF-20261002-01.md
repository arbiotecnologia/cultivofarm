# Auditoria mestre — AUDIT-CF-20261002-01

## Estado executivo

- Projeto canônico: `swzpzcwiasxmjutrmvkm`.
- Fase 0: **PASS com riscos P2/P3 registrados**.
- Fase 1 / auditoria pós-E01: **NO-GO**.
- Motivo do NO-GO: não existe organização para o CNPJ autorizado nem para o prefixo da campanha; portanto E01 não foi comprovado e E02 permanece bloqueado.
- Nenhuma mutação de dados, abertura SMTP, envio, E02 ou cleanup foi executado nesta rodada.
- Leaked Password Protection: risco temporariamente aceito, aberto e não homologado.

## Regras e escopo

Todo dado persistente da campanha deve conter `HOMOLOGAÇÃO AUDIT-CF-20261002-01` ou motivo equivalente. O único CNPJ autorizado é `36.736.180/0001-11`; o contato corporativo é `renato@refilinformatica.com.br`; o único destinatário de convite autorizado é `teste@refilinformatica.com.br`. Tokens, links de ação e segredos não integram as evidências.

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
- Testes focados do hardening administrativo: **59 PASS**.
- Typecheck: **PASS**.
- Scanner profundo: **10 Info, zero Critical/Error/Warning**.
- O comando genérico `bun test` não é o runner do projeto e tentou carregar specs Playwright fora do ambiente correto; o script oficial `bun run test` passou integralmente.
- Scan de dependências permanece limitado pelo parser do lockfile no pacote `xlsx`; não foi feito bypass nem alteração de lockfile.
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

Não restou P0/P1 bloqueante após o hardening local e os testes, permitindo iniciar a Fase 1. As duas Edge Functions endurecidas só devem ser implantadas pelo fluxo controlado; nenhuma função ou dado foi acionado nesta auditoria read-only.

## Fase 1 — auditoria canônica pós-E01

### Capacidade do fluxo publicado

O fluxo consulta o CNPJ, fixa um snapshot da razão social oficial e envia essa razão como `_nome` para `platform_create_organization`. Quando a consulta oficial responde, a razão social fica somente leitura. Logo, o fluxo não permite prefixar a razão social com a identidade da campanha. O nome fantasia continua editável, mas a auditoria canônica não encontrou o prefixo em nome, razão social ou fantasia.

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

O job real AR BIO permanece intocado: status `falhou`, uma tentativa, `email_delivery_status=pending`, zero tentativa de e-mail, sem usuário e sem lease. Nenhum destinatário não autorizado foi usado.

### Decisão

**Fase 1 NO-GO.** O E01 manual informado não produziu registro localizável no canônico pelo CNPJ ou prefixo exigidos. Não é permitido marcar E01 como PASS, renomear dados, criar substituto automaticamente, abrir SMTP ou executar E02. A progressão para as Fases 2–15 está bloqueada.

## Rollback e forward-fix

- Dados: não aplicável; nenhuma mutação foi feita.
- Hardening das Edge Functions: rollback por reversão dos arquivos e dos blocos de configuração; forward-fix preferencial, caso surja incompatibilidade, mantendo CORS fail-closed, JWT obrigatório e respostas sanitizadas.
- E01: nenhuma correção automática. Requer nova execução humana controlada somente depois de reconciliar como o identificador obrigatório será persistido sem adulterar a razão social oficial.
