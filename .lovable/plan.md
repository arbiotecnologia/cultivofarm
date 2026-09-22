# Fase 0 — Auditoria pré-homologação de segurança e isolamento multiempresa (somente leitura)

Nesta rodada nada é alterado: sem código, sem banco, sem migrations, sem policies, sem Edge Functions, sem usuários, secrets, Storage ou publicação. A entrega é um relatório de evidências do estado atual.

## Sondagens já feitas (estado atual, medido agora)

No Supabase canônico `swzpzcwiasxmjutrmvkm`, schema `public`:

- 230 tabelas; 0 sem RLS habilitada; 6 com RLS habilitada e nenhuma policy (bloqueio total via Data API — precisam ser nomeadas e classificadas).
- 0 tabelas com grant para `anon`.
- 678 funções SECURITY DEFINER; 0 sem `search_path` fixo.
- 24 views.
- Apenas 2 colunas chamadas `organization_id` em todo o schema — ou seja, o isolamento multiempresa hoje não é colunar/global; precisa ser mapeado caminho a caminho (cliente, parceiro, empresa fiscal).
- 38 Edge Functions no repositório; `src/config/permissions.ts`, `portalMenus.ts`, `navigation.ts` e guardas de rota existem e serão comparados ao backend.
- Plano H15 (isolamento fiscal por empresa) existe em `.lovable/plan/h15-...` e será confrontado com o schema atual.

Nada além disso está afirmado ainda; todo o resto do relatório será baseado em consultas e leituras feitas durante a execução.

## Como a auditoria será executada

Todas as etapas são leitura: consultas de catálogo (`pg_policies`, `pg_proc`, `information_schema`, `storage.buckets`), linter/advisors do Supabase e leitura de arquivos do repositório. Nenhuma sonda que grave dados, nenhum usuário de teste. Cenários que exigem sessão real de cada perfil serão marcados como "pendente de teste autenticado na Fase de homologação".

### Etapa A — Ambiente e identidade
Confirmar ref canônico em client, guards, `config.toml` e Edges; conferir divergências de `.env` gerenciado; nenhum segredo exibido.

### Etapa B — Tenants, perfis e vínculos
Inventariar `organizations`, `user_roles`, `partner_users`, `partner_user_clients`, `partner_technician_clients`, vínculos produtor↔cliente e técnicos. Contagens e estrutura, sem PII desnecessária.

### Etapa C — RLS, policies e grants
Para as 230 tabelas: RLS/FORCE RLS, policies por comando, roles alvo, predicados sem filtro de tenant, grants por role, tabelas sem policy efetiva.

### Etapa D — Isolamento multiempresa
Classificar cada tabela sensível pelo caminho de tenant real (direto, indireto via cliente/parceiro/OS, ou inexistente). Procurar policies com `TO authenticated` sem predicado de escopo, colunas de tenant atualizáveis pelo cliente, FKs cross-tenant e registros órfãos.

### Etapa E — Autorização de perfis
Matriz perfil × portal × rota × tabela/RPC: comparar `permissions.ts`, menus e guardas com o que o banco realmente permite. Cobre todos os 13 papéis do enum `app_role`.

### Etapa F — Funções e RPCs
Das 678 SECURITY DEFINER: owner, EXECUTE grants (incluindo `PUBLIC`/`anon`), uso de `auth.uid()`, parâmetros de identidade/organização manipuláveis, potencial de escalonamento.

### Etapa G — Edge Functions
`verify_jwt` por função, uso de service_role, validação de papel/tenant no servidor, CORS, webhooks, idempotência e endpoints que confiam em IDs vindos do cliente.

### Etapa H — Storage
Buckets públicos/privados, policies de `storage.objects`, isolamento por pasta, IDOR/enumeração.

### Etapa I — Auth e ciclo de vida do usuário
Provisionamento, edição de perfil/papel, senha, desativação, risco de autoelevação (inclui `create-user`, `admin-update-user-password`, `admin_edit_user_profile_v1`).

### Etapa J — Views e integridade
`security_invoker`/`security_barrier` nas 24 views; FKs, uniqueness por tenant, índices, cascatas, soft delete.

### Etapa K — Fiscal/financeiro + H15
Isolamento em `company_fiscal_settings`, `fiscal_invoices`, certificados, séries, AR/AP, documentos e pagamentos; o que do H15 já está no schema e o que segue pendente.

### Etapa L — Advisors e linter
Executar o linter do Supabase e consolidar alertas atuais.

## Entrega

Um documento em `docs/auditorias/fase0-seguranca-isolamento-2026-09-22.md` com as seções pedidas: (A) resumo executivo, (B) matriz empresa/perfil/portal/backend, (C) inventário RLS/policies/grants, (D) inventário SECURITY DEFINER/Edge/Storage, (E) vulnerabilidades priorizadas, (F) comparação com auditorias e planos existentes, (G) plano de correção em fases independentes e reversíveis, (H) critérios de aceite e testes por fase, (I) GO/NO-GO técnico para iniciar homologação.

Cada achado levará: classificação (CRÍTICO/ALTO/MÉDIO/BAIXO/INFORMATIVO), evidência concreta, cenário de exploração, correção recomendada, risco de regressão, dependências e se é bloqueador.

Escrever esse arquivo de relatório é a única gravação da rodada. Se preferir receber tudo apenas no chat, sem criar o arquivo, é só dizer.

## Premissas

- Volume alto (230 tabelas, 678 funções, 38 Edges): o relatório priorizará tabelas e caminhos sensíveis, com inventários completos em forma agregada e detalhamento nos pontos de risco.
- Nenhuma afirmação de "seguro" sem evidência coletada nesta rodada.
