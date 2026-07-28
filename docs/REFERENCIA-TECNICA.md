# Referência Técnica — AR Bio Manager

> Documento consolidado de arquitetura, ambientes, segurança e operação.
> Manual funcional correspondente: [`docs/MANUAL-DO-USUARIO.md`](./MANUAL-DO-USUARIO.md).
> Última revisão: julho/2026.

---

## Sumário

1. [Stack e estrutura do repositório](#1-stack-e-estrutura-do-repositório)
2. [Ambientes](#2-ambientes)
3. [Variáveis de ambiente e feature flags](#3-variáveis-de-ambiente-e-feature-flags)
4. [Autenticação, papéis e autorização](#4-autenticação-papéis-e-autorização)
5. [Navegação e roteamento](#5-navegação-e-roteamento)
6. [Domínios funcionais](#6-domínios-funcionais)
7. [Módulo de Comunicação](#7-módulo-de-comunicação)
8. [Módulo Fiscal](#8-módulo-fiscal)
9. [Edge Functions](#9-edge-functions)
10. [Segurança](#10-segurança)
11. [Qualidade e validações](#11-qualidade-e-validações)
12. [Processo de migrations e implantação](#12-processo-de-migrations-e-implantação)
13. [Convenções de código](#13-convenções-de-código)
14. [Mapa da documentação histórica](#14-mapa-da-documentação-histórica)

---

## 1. Stack e estrutura do repositório

**Stack:** React 18 + Vite 5 + TypeScript 5 + Tailwind CSS 3 + shadcn/ui, TanStack Query, React Router, Zod, Sonner. Backend em Supabase (Postgres + Auth + Storage + Edge Functions em Deno). Testes com Vitest e Playwright.

```text
src/
  components/        Componentes de UI e de domínio (executivo, alertas, notificações, fiscal…)
  config/
    navigation.ts    Fonte declarativa única da navegação (desktop e mobile)
    featureFlags.ts  Flags de funcionalidade (fiscal e comunicação)
  features/
    comunicacao/     Guard de rota, flags, tipos, API, render de template, UI admin
  hooks/             Hooks de dados (useAuth, useExecutivo*, useOfflineSync, …)
  integrations/supabase/  Cliente e tipos gerados
  lib/               permissions.ts, activePortalContext.ts, portalBroadcast.ts, fiscal/, utils
  pages/             Páginas por área: app/, portal/, executivo/, financeiro/, fiscal/, configuracoes/
  pwa/               Registro de service worker e prompts de atualização
  test/              Suítes Vitest por domínio
supabase/
  migrations/        Migrations versionadas
  functions/         Edge Functions (Deno), com _shared/ para código comum
restoration/         Kits de implantação, precheck/postcheck/rollback, harnesses SQL
docs/                Documentação (este arquivo, manual do usuário e histórico de fases)
e2e/, tests/         Playwright e testes de ponta a ponta
```

---

## 2. Ambientes

| Ambiente | Project ref | Uso |
|---|---|---|
| **Produção** | `navfzbwgwzruipouyfnk` (`ar-bio`) | Dados reais. **Nenhuma migration, deploy, seed ou teste destrutivo sem autorização humana explícita de promoção.** |
| **Staging/Teste** | `ikaauvsflpmamgxmkhoq` (`ar-bio-temp`) | Desenvolvimento, homologação, migração e integração. Ambiente padrão para todo trabalho novo. |

Mapeamento confirmado em auditoria comparativa read-only (2026-07-27); substitui associações anteriores.

**Regra operacional:** todo o trabalho do módulo de comunicação permanece em staging até o checklist resultar **GO**.

---

## 3. Variáveis de ambiente e feature flags

### 3.1 Frontend (`.env`, prefixo `VITE_`)

| Variável | Função |
|---|---|
| `VITE_SUPABASE_PROJECT_ID` | Ref do projeto Supabase |
| `VITE_SUPABASE_URL` | Endpoint da API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publicável (anon) — pode ficar no código |
| `VITE_COMUNICACAO_MODULE_ENABLED` | Liga o módulo de Comunicação (`"true"` exato) |
| `VITE_COMUNICACAO_BROADCAST_TAB_ENABLED` | Liga a aba de broadcast administrativo |

### 3.2 Flags em `src/config/featureFlags.ts`

| Flag | Estado | Observação |
|---|---|---|
| `fiscalConfigurationUi` | `true` | Central de configuração fiscal |
| `fiscalProductProfilesUi` / `fiscalServiceProfilesUi` / `fiscalCustomerProfilesUi` | `true` | Perfis fiscais |
| `fiscalDocumentWorkflowUi` | `true` | Wizard de rascunho NF-e/NFS-e |
| `fiscalReadinessCenterUi` | `true` | Central de Prontidão (somente leitura) |
| `fiscalDocumentManualEventRpc` | `false` | Aguarda certificação dedicada |
| `fiscalReconciliationUi` / `fiscalReconciliationWrite` | `false` | Reconciliação sem UI liberada |
| **`fiscalEmissionEnabled`** | **`false`** | **Trava de emissão — não alterar sem autorização** |
| `comunicacaoModule` | via env | Fonte única para rota, guard e menu |
| `comunicacaoBroadcastTab` | via env | Requer o módulo ligado |

### 3.3 Chaves de entrega (server-side)

Mantidas **OFF** durante migrations e deploy:

```text
COMMUNICATION_DELIVERY_ENABLED=false
EMAIL_DELIVERY_ENABLED=false
WHATSAPP_DELIVERY_ENABLED=false
COMMUNICATION_INAPP_ADAPTER_ENABLED=false
WHATSAPP_WEBHOOK_ENABLED=false
```

Segredos (SMTP, Meta, chaves fiscais) ficam em **Supabase Vault** / secrets das Edge Functions. Nunca registrar ou exibir DSN, senhas, tokens, JWTs ou certificados em log, toast ou documento.

---

## 4. Autenticação, papéis e autorização

### 4.1 Papéis

`administrador`, `gestor`, `gestor_comercial`, `consultor_tecnico`, `tecnico_agronomo`, `aplicador`, `operador_onfarm`, `producao`, `administrativo`, `financeiro`, `cliente_produtor`, `parceiro_b2b`, `parceiro_b2b_tecnico`.

Papéis são armazenados em tabela dedicada (`user_roles`), **nunca** no perfil/usuário, e checados por função `SECURITY DEFINER` (`has_role`) para evitar recursão de RLS e escalonamento de privilégio.

### 4.2 Camadas de autorização

1. **`src/lib/permissions.ts`** — `ACCESS_MAP` (papel → áreas) e `getHomeForRole` (destino inicial, fonte única usada por `Index.tsx`).
2. **Guards de rota** — `RoleGuard`, `AuthenticatedShell`, `AppPortalGuard`, `B2BRouteGuard`, `ExecutivoPermissionGate`, `RouteGuard` do módulo de comunicação.
3. **RLS no banco** — política por tabela; views de BI usam `security_invoker = true` para respeitar as políticas das tabelas base.
4. **Grants explícitos** — toda tabela nova em `public` recebe `GRANT` para os papéis correspondentes na mesma migration (RLS sozinha não basta para o PostgREST).

### 4.3 Contexto de portal

- `get_my_available_portal_contexts` retorna os contextos do usuário, `is_admin` e `skip_context_selector`.
- Administrador recebe `skip_context_selector: true` e **não** passa por `/selecionar-portal`.
- `activePortalContext.ts` persiste a escolha; `portalBroadcast.ts` sincroniza entre abas.
- `portalDisplayLabel.ts` centraliza os rótulos de papel exibidos.

### 4.4 `useAuth`

Expõe `user`, `profile`, `role`, `roles`, `loading`, `error`, `refresh`, `signOut`. Já corrigido contra corrida no carregamento de papéis e reflete alterações de papel em tempo real.

---

## 5. Navegação e roteamento

- **`src/config/navigation.ts`** é a fonte declarativa única: seções, subgrupos, rota, ícone, rótulo, apelidos de busca e plataformas (`desktop`, `mobile-consultor`, `mobile-produtor`). `itemsForPlatform()` deriva as abas do mobile — não duplicar listas em componentes.
- Seções desktop: Dashboard · Comercial e Relacionamento · Campo e Assistência Técnica · Produção On-Farm · Financeiro · Financeiro B2B · Inteligência e Controle · Administração.
- **`src/App.tsx`** mapeia rotas a componentes com lazy loading e os guards da seção 4.2.
- **Redirects legados** preservados: `/executivo`, `/painel-operacional`, `/auditoria-sync`, `/financeiro/configuracoes`, `/comercial/dashboard-b2b` e similares apontam para o destino atual, mantendo query params quando aplicável.
- **Layouts:** `AppLayout` (desktop, sidebar + header), `MobileLayout` (abas inferiores, FAB, indicador offline), layouts próprios de Portal e Portal Parceiro.

---

## 6. Domínios funcionais

| Domínio | Núcleo técnico |
|---|---|
| **Esteira laboratorial** | Ciclo Aberta → … → Finalizada; flag `pode_finalizar`; aplicação on-farm é pendência informativa, não bloqueio. Bloqueios reais: CQ reprovado, atraso PCP, falta de insumo. Estoque alimentado no Envase/Pronto Entrega; BI converte ml → litros. |
| **Executivo** | RPCs `rpc_executivo_plano_acao`, resumo, gargalos e timeline; hooks `useExecutivo*` com `staleTime` de 60s e sem refetch em foco. |
| **BI** | Views `vw_fluxo_visita_tecnica` e `vw_esteira_laboratorio` com `security_invoker`; `bi_user_preferences` protegida por RLS; `BIExportButton` valida permissão e sanitiza CSV. |
| **Financeiro** | Contas a receber/pagar, baixa/estorno, DRE, fluxo de caixa, recorrências, recibos, faturamento de entregas. |
| **B2B** | Motor de preços/condições auditável, governança de crédito, reserva de estoque com controle de concorrência. |
| **Offline (PWA)** | `useOfflineSync` com fila local, contador de pendências e progresso; service worker em `src/pwa/` e `public/push-sw.js`. |

---

## 7. Módulo de Comunicação

### 7.1 Arquitetura

```text
Evento de negócio (trigger/RPC)
  → rpc_publish_communication_event(_v2)   publicação transacional + idempotência SHA256
  → resolução de destinatários (server-side)
  → outbox (fila) com lease e tentativas
  → process-communication-outbox (worker)  concorrência determinística, máx. 8
  → adaptadores: SMTP · WhatsApp Cloud API (v24/v25) · In-App
  → comunicacao_provider_receipts + whatsapp-status-webhook (HMAC)
  → estados monotônicos: queued → sent → delivered → read | failed → DLQ
```

Pontos de projeto:
- Destinatários **nunca** vêm do cliente: são resolvidos no servidor a partir do evento.
- `payload_snapshot` congela os dados no momento da publicação; o renderer só aceita campos em allowlist e rejeita PII fora do contrato.
- Notificações in-app usam `pg_advisory_xact_lock` para evitar duplicidade.
- Erros SMTP 4xx são tratados como transitórios (retry); 5xx como definitivos.
- Envio por papel (`role`) é restrito a administrador; broadcast tem flag própria.
- Modo de teste (`isRecipientAllowedInTestMode`) restringe destinatários a uma allowlist.

### 7.2 Configuração de provedores

`public.communication_provider_settings` guarda **referências** ao Supabase Vault, nunca os segredos. Mutações passam por `rpc_service_apply_provider_settings` (atômica). Edge Functions leem via loader compartilhado `runtime-config`. UI: `src/pages/configuracoes/ComunicacaoConfigTab.tsx` (Zod + Sonner, presets SMTP, `SecretInput` com alternância de visibilidade, teste de e-mail com validação do destinatário e categorização de erro TLS/auth/rede).

### 7.3 UI administrativa

`src/features/comunicacao/ui/`: `ComunicacaoAdminPage.tsx` (eventos, regras, templates, destinatários, fila/DLQ, replay), `ObservabilidadePanel.tsx` (saúde, throughput 7 dias, snapshots sanitizados) e `ConsentimentoWhatsappPanel.tsx`.

### 7.4 Kit de implantação

`restoration/comunicacao-deploy/` — ordem fail-fast obrigatória:

```text
F1 postcheck → F2 atômica → F4 atômica → smokes → deploy das 3 Edge Functions → verify
```

Scripts: `apply-staging.sh`, `validate-staging.sh`, `deploy-functions-staging.sh`, `verify-staging.sh`, `rollback-staging.sh`, `smoke-staging*.sql`, `checklist-manual.md`. Migrations rodam com `psql --single-transaction`; smokes são estritamente read-only; rollback é fail-closed se qualquer artefato da fase 4 existir. Nenhum script imprime DSN ou credencial.

---

## 8. Módulo Fiscal

- **Estado:** preparação/homologação. `fiscalEmissionEnabled = false` é trava absoluta.
- `supabase/functions/_shared/fiscal/` é **server-only por convenção**; nenhum arquivo em `src/**` pode importar dele — o teste estático `src/test/fiscal/fase3_8.static.test.ts` falha se a regra for violada.
- `evaluatePreflight` é fail-closed: retorna `canTransmit: false` como literal-type em qualquer cenário; o status máximo é `PRECHECK_ONLY`.
- Validadores de domínio em `src/lib/fiscal/` (NCM, CEST, CNPJ alfanumérico, regras SINIEF 49/2025 e SINIEF 20/2026), usados pelo `RascunhoWizard.tsx`.
- Certificados digitais cifrados (AES-256-GCM); consulta de CNPJ endurecida via BrasilAPI.
- Variáveis documentais (sem leitura em runtime): `FISCAL_RUNTIME_MODE=DISABLED`, `FISCAL_PROVIDER=NONE`, `FISCAL_EMISSION_ENABLED=false`.
- Proibições ativas: sem SDK/fetch de provedor, sem PFX/P12/token/webhook, sem `service_role` para responder ao usuário, sem persistência de `fiscal_events`.

---

## 9. Edge Functions

| Função | Papel |
|---|---|
| `communication-health` | Snapshot sanitizado de saúde do módulo de comunicação |
| `process-communication-outbox` | Worker da fila (lease, retry, adaptadores) |
| `whatsapp-status-webhook` | Recebe status da Meta; HMAC + leitura em streaming; `verify_jwt = false` |
| `communication-provider-settings` | Aplica configurações de provedor via RPC atômica |
| `test-communication-email` | Teste isolado de SMTP com categorização de erro (TLS, auth, timeout, DNS, rede) |
| `create-user`, `list-portal-users`, `admin-update-user-password` | Administração de usuários |
| `admin-audit-produtos-orfaos`, `admin-wipe-produtos-catalog` | Manutenção de catálogo |
| `fiscal-certificate-upload`, `fiscal-certificate-revoke`, `fiscal-cnpj-lookup`, `fiscal-preflight` | Fiscal |
| `enviar-pdf-visita`, `enviar-pdf-aplicacao` | Geração e envio de PDFs |
| `generate-financial-receipt`, `generate-financial-report` | Documentos financeiros |
| `gerar-alertas-operacionais`, `aplicar-sla-alertas`, `enviar-alertas-notificacoes`, `enviar-alertas-resumo`, `check-monitoramentos-vencidos` | Motor de alertas e SLA |
| `ai-generate-ficha-campo`, `ai-refresh-fichas`, `ai-sugerir-alvos` | Recursos assistidos por IA |
| `send-push-notification`, `sync-calendar-event`, `sync-clima` | Integrações |

Padrão de autenticação: `getClaims` com cliente anônimo usando o JWT do usuário + verificação `has_role` via cliente admin (`supabase/functions/_shared/auth-guard.ts`). `service_role` nunca responde diretamente ao usuário.

---

## 10. Segurança

**Invariantes:**
- Papéis em tabela separada, checados por `has_role` (`SECURITY DEFINER`, `search_path = public`).
- RLS habilitada em toda tabela de `public`, com `GRANT` explícito na mesma migration.
- Views de BI com `security_invoker = true`.
- Consultor não acessa dados de outro território; `cliente_produtor`, `financeiro` e perfis não autorizados são bloqueados no BI operacional.
- Exportação CSV protegida contra injeção de fórmula: valores iniciando com `=`, `+`, `-`, `@`, `\t` ou `\r` recebem prefixo `'`.
- Erros de banco são mascarados antes de chegar ao cliente.
- `REVOKE ALL FROM PUBLIC, anon` aplicado em RPCs sensíveis; harness verifica com `has_function_privilege`.
- Deep links de notificação validados contra allowlist de destinos.
- Nenhum segredo em código, log, toast, screenshot ou documentação.

**Postura de RLS por perfil no BI:** Administrador/Gestor visão total · Consultor/Técnico apenas seus clientes · Cliente/Produtor/Financeiro bloqueados no BI geral · Produção/Operador On-Farm acesso a Laboratório, Estoque e Entregas.

---

## 11. Qualidade e validações

Validações obrigatórias antes de encerrar qualquer fase (lint indisponível no projeto):

```bash
bunx tsc --noEmit      # typecheck
bun run build          # build
bunx vitest run        # testes unitários
```

- **Vitest:** suítes por domínio em `src/test/` (comunicação, fiscal, permissões, navegação). Marcos registrados: 264 → 2300/2305 → 490/490 no escopo de comunicação; 404/404 na subfase 1C.
- **Playwright:** `e2e/` cobre RBAC (`rbac-admin-vs-nao-admin.spec.ts`), esteira de OS, reserva de estoque, hardening de visita técnica e fluxo financeiro de baixa/estorno/DRE.
- **Harnesses SQL:** `restoration/**/harness-rls.sql` validam RLS e privilégios dentro de transação, sem efeitos colaterais.
- **Scanners:** `scripts/fiscal-secrets-scan.sh` e `scripts/fiscal-integration-scan.sh` bloqueiam vazamento de segredo e integração indevida.

---

## 12. Processo de migrations e implantação

1. **Precheck** (`precheck.sql`) — confirma o estado esperado antes de tocar em qualquer coisa.
2. **Migration atômica** — `psql --single-transaction`; toda `CREATE TABLE` em `public` acompanhada de `GRANT` → `ENABLE ROW LEVEL SECURITY` → `CREATE POLICY`, nessa ordem.
3. **Postcheck** (`postcheck.sql`) — verifica objetos, políticas e privilégios criados.
4. **Harness RLS** — prova de isolamento por papel.
5. **Smoke read-only** — nenhuma escrita.
6. **Deploy de Edge Functions** — somente após os passos acima passarem.
7. **Verify** — validação final.
8. **Rollback** (`rollback.sql`) — fail-closed; aborta se detectar artefatos incompatíveis.

Regras inegociáveis:
- Trabalho ocorre em **staging**; promoção para produção exige autorização humana explícita, por escrito, por fase.
- Nunca alterar rotas, permissões ou dependências sem autorização explícita.
- Trabalho é organizado em **fases numeradas**; aguardar prompt específico antes de iniciar a próxima.
- Flags de entrega permanecem OFF durante migrations e deploy.

---

## 13. Convenções de código

- **Design system:** cores, gradientes e sombras vivem como tokens semânticos em `src/index.css` e `tailwind.config.ts`, consumidos por variantes shadcn. Não usar utilitários de cor fixa (`text-white`, `bg-black`, `bg-[#...]`) nos componentes.
- **Fonte única:** navegação em `config/navigation.ts`, permissões em `lib/permissions.ts`, rótulos de papel em `portalDisplayLabel.ts`, flags em `config/featureFlags.ts`. Não duplicar essas listas.
- **Dados:** TanStack Query com `queryKey` incluindo os filtros; `staleTime` explícito; sem refetch em foco nos painéis executivos.
- **Formulários:** Zod para validação, feedback inline com `aria-invalid`/`aria-describedby`, Sonner para toasts.
- **Idioma:** interface e documentação em português do Brasil; identificadores de código em inglês ou português conforme o módulo já estabelecido.
- **Componentes:** pequenos e focados; lógica de dados em hooks, apresentação em componentes.

---

## 14. Mapa da documentação histórica

Os demais arquivos de `docs/` são **registro de fases** e permanecem como histórico de decisão. Principais grupos:

| Grupo | Arquivos |
|---|---|
| Esteira e BI | `esteira-laboratorio.md`, `bi-operacional*.md`, `seguranca-rls-bi.md`, `auditoria-pre-bi.md` |
| Financeiro | `financeiro-*.md`, `faturamento-operacional.md`, `notas-fiscais-modulo.md` |
| Fiscal | `fiscal-fase*.md`, `fiscal-h1-candidato-homologacao.md`, `fiscal-types-provenance.md` |
| Portais e B2B | `portal-*.md`, `reformulacao-portais-b2b-*.md`, `multiportal-*.md`, `pedidos-b2b.md` |
| Operação | `entregas.md`, `estoque-embalagens.md`, `etiquetas-produto.md`, `qa/sync-duplicacao.md` |
| Comunicação | relatórios em `.lovable/comunicacao-*.md` e kits em `restoration/comunicacao-*/` |

Em caso de divergência entre um documento de fase e este par de documentos consolidados, **prevalecem o Manual do Usuário e esta Referência Técnica**.
