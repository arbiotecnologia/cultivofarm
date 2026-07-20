# FASE 1 — Auditoria técnica do acesso multiportal

> Objetivo: mapear a estrutura real (banco, autenticação, permissões, rotas) antes de qualquer migration ou alteração de login. Esta fase é **somente leitura** — nenhuma alteração estrutural.

Escopo do Bloco 1: permitir que um mesmo `auth.uid()` tenha simultaneamente acesso ao Portal Parceiro B2B e ao Portal Técnico/Agrônomo, com seletor de contexto quando aplicável. Este documento fecha a Fase 1; Fases 2-5 exigem novo aval.

---

## 1. Arquitetura atual (visão geral)

```
auth.users (Supabase)
   │
   ├── public.profiles                (1:1, dados de exibição, cliente_id p/ produtor)
   ├── public.user_roles              (N:1, UNIQUE(user_id, role) — já suporta múltiplos papéis)
   ├── public.partner_users           (N:1, vincula usuário a partner_accounts, campo `papel` gestor/tecnico)
   ├── public.partner_user_clients    (parceiro → clientes atendidos)
   ├── public.partner_technician_clients (técnico de parceiro → clientes)
   └── public.user_clientes           (consultor interno → clientes, com `principal`)
```

Ponto crítico: `user_roles` já possui `UNIQUE(user_id, role)` e **não** `UNIQUE(user_id)`. Logo, a base **já permite múltiplos papéis por usuário**. O que trava hoje é a leitura no frontend (`.maybeSingle()` em `useAuth`), não o schema.

---

## 2. Banco de dados

### 2.1 Perfis, papéis e vínculos
| Tabela | Colunas relevantes | Observação |
|---|---|---|
| `profiles` | `id`, `user_id`, `nome`, `email`, `telefone`, `cargo`, `cpf_cnpj`, `ativo`, `cliente_id`, `crea`, `especialidade`, `data_admissao` | 1:1 com `auth.users`. `cliente_id` liga produtor a `clientes`. |
| `user_roles` | `id`, `user_id`, `role app_role` | `UNIQUE(user_id, role)`; RLS: SELECT próprio + admin ALL. |
| `partner_users` | `id`, `partner_id`, `user_id`, `papel` (`gestor`/`tecnico`) | Vincula usuário a `partner_accounts`. |
| `partner_user_clients` | usuário parceiro → clientes | Escopo do que o parceiro enxerga. |
| `partner_technician_clients` | técnico do parceiro → clientes | Análogo para papel técnico dentro do parceiro. |
| `user_clientes` | `user_id`, `cliente_id`, `principal` | Usado por consultor interno. |
| `partner_accounts` | `id`, `codigo`, `razao_social`, `ativo`, `deleted_at`, `partner_type`, comerciais, financeiros | Fonte de verdade do parceiro B2B. |

### 2.2 Enum `app_role` (13 valores hoje)
```
administrador, tecnico_agronomo, producao, administrativo, gestor,
cliente_produtor, consultor_tecnico, aplicador, operador_onfarm,
financeiro, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico
```
Observações:
- Já existe `parceiro_b2b` (equivalente a "gestor B2B") e `parceiro_b2b_tecnico`.
- Papéis técnicos existentes: `tecnico_agronomo`, `consultor_tecnico`, `aplicador`.
- **Não existem** os valores `parceiro_b2b_gestor`, `agronomo`, `tecnico_campo` mencionados no prompt — o mapeamento a adotar na Fase 3 é:
  - `parceiro_b2b_gestor` → reutilizar `parceiro_b2b`
  - `agronomo`, `tecnico_campo` → reutilizar `tecnico_agronomo`/`consultor_tecnico`/`aplicador` (ou adicionar novos valores ao enum, sem remover os antigos).

### 2.3 Domínios operacionais reutilizáveis
- **Clientes/produtores/fazendas**: `clientes`, `fazendas`, `talhoes`, `talhao_safras`, `cliente_contatos`, `cliente_documentos`.
- **Visitas técnicas**: `visitas_checkin`, `visitas_logs`, `visita_diagnosticos`.
- **Consultor de campo**: `registros_consultor` (+ `_arquivos`, `_recomendacoes`, `_status_log`, `_pdf_versions`).
- **OS**: `ordens_servico`, `ordens_servico_onfarm` (+ `_status_history`), `os_faturamento_base`, `production_order_link`, `production_planning`, `production_timeline_events`.
- **B2B**: `partner_orders`, `partner_order_items`, `partner_order_messages`, `partner_order_payment_terms/schedule`, `partner_simulations`, `partner_simulation_items`, `partner_product_prices`, `partner_documents`, `partner_engagement_metrics`, `partner_risk_scores`, `partner_financial_settings`, `partner_order_templates`.
- **Financeiro**: `accounts_receivable*`, `accounts_payable*`, `financial_documents`, `financial_receipts`, `fiscal_invoices`, `partner_order_financial_links`.
- **Auditoria**: `clientes_audit_log`, `partner_audit_logs`, `partner_order_audit_logs`, `commercial_audit_log`, `financial_audit_log`, `catalog_technical_audit_logs`, `financial_governance_audit_log`, `audit_senha_log`.
- **Preferências existentes**: `bi_user_preferences`, `executivo_user_preferences` (por usuário; **não** guardam contexto de portal — precisa nova tabela específica na Fase 3).

---

## 3. Autenticação

Fluxo atual (não deve ser tocado na Fase 1):
1. `src/pages/Auth.tsx` — login por email/senha via `supabase.auth.signInWithPassword`. Sem OAuth. `signUp` público existe mas cadastro é gerenciado por admin (edge function `create-user`).
2. `src/hooks/useAuth.tsx` — `AuthProvider` global:
   - `onAuthStateChange` + `getSession` inicial.
   - Carrega `profiles` por `user_id` (`.maybeSingle`), bloqueia se `ativo=false`.
   - Carrega `user_roles` por `user_id` **com `.maybeSingle()`** → **hoje assume 1 papel por usuário**. Este é o único ponto que precisa mudar no Bloco 2 para expor `roles: string[]`. Retro-compatibilidade: manter `role` como "papel primário" derivado do array.
   - Validação especial: `cliente_produtor` sem `cliente_id` → erro.
3. `src/pages/Index.tsx` — redireciona por `role`:
   - `cliente_produtor` → `/portal`
   - `administrador`/`gestor` → `<PainelOperacional />`
   - `consultor_tecnico`/`tecnico_agronomo`/`aplicador` → `<DashboardAgronomico />`
   - fallback → `<DashboardAgronomico />`
4. `AppLayout` — bloqueia `cliente_produtor` (redir para `/portal`).
5. `MobileLayout` (`/app/*`) — bloqueia perfis não mobile via `isMobileProfile`.
6. `portal-parceiro/DashboardRouter` — roteia gestor vs. `parceiro_b2b_tecnico`.
7. Sessão/refresh: `persistSession: true`, `autoRefreshToken: true`; `ErrorRecovery` cobre falhas de perfil.

**Não há hoje** um ponto único que decida "portal B2B vs. portal técnico" para o mesmo usuário — o role é chave direta.

---

## 4. Permissões

### 4.1 Funções de segurança
- `public.has_role(_user_id uuid, _role app_role)` — `SECURITY DEFINER`, usada extensivamente nas RLS. Compatível com múltiplos papéis (`EXISTS`).
- Guards no frontend:
  - `src/components/RoleGuard.tsx` (usado nas rotas privadas)
  - `src/components/executivo/ExecutivoPermissionGate.tsx`
  - `MobileLayout` para PWA
  - `AppLayout` (bloqueia produtor)
  - Guards do portal parceiro (`portal-parceiro/*` layouts)
- Helpers:
  - `src/lib/permissions.ts` — `isMobileProfile`, `getHomeForRole`
  - `src/lib/alertasPermissions.ts`, `src/lib/biPermissions.ts`
  - Hooks `useMyPartner` / `usePartnerPapel` (retorna `gestor`/`tecnico` a partir de `partner_users.papel`).

### 4.2 RLS dependentes de papel
- Praticamente todas as tabelas listadas em §2.3 usam `has_role(auth.uid(), '<enum>')` ou `EXISTS` em `partner_users`/`user_clientes`/`partner_technician_clients`.
- Nenhuma RLS depende de "contexto ativo" — a autorização é sempre server-side por papel e vínculo. **Bom**: contexto pode ser puramente UX no Bloco 2 sem risco de bypass.

### 4.3 Dependências diretas do `user_roles.role`
- `useAuth.tsx` (leitura primária, `.maybeSingle()`)
- `Index.tsx` (redirect)
- `AppLayout`, `MobileLayout`, `DashboardRouter`
- `RoleGuard` (spread pelo `src/App.tsx`)
- Todas as políticas RLS que chamam `has_role`

---

## 5. Rotas (matriz condensada)

Extraída de `src/App.tsx`. Coluna "Risco" refere-se à possibilidade de regressão no Bloco 2.

| Rota | Layout | Guard | Perfis permitidos | Risco |
|---|---|---|---|---|
| `/auth` | — | pública | todos | baixo |
| `/` | `Index.tsx` | `useAuth` | todos autenticados | **médio** — redirect será decidido pela RPC de contexto |
| `/portal/*` | portal produtor | role `cliente_produtor` | produtor | baixo (não afetado) |
| `/portal-parceiro/dashboard` | portal parceiro | role `parceiro_b2b` / `parceiro_b2b_tecnico` + `partner_users` | B2B | baixo (mantido intacto) |
| `/portal-parceiro/{catalogo,simulador,pedidos,solicitacoes,simulacoes,simulacoes-equipe,fichas-tecnicas,favoritos,historico,financeiro}` | portal parceiro | idem | B2B | baixo |
| `/app/*` (PWA) | `MobileLayout` | `isMobileProfile` | consultor/técnico/aplicador/produtor | baixo |
| `/produtores`, `/clientes/*`, `/fazendas/*` | `AppLayout` | admin/gestor/comercial | interno | baixo |
| `/visitas*`, `/registros-consultor*` | `AppLayout` | técnico/admin | interno | baixo |
| `/ordens-servico`, `/os*` | `AppLayout` | operacional/admin | interno | baixo |
| `/financeiro/*` | `AppLayout` | `financeiro`/admin | interno | baixo |
| `/comercial/*` (inclui `/comercial/auditoria-motor-b2b`) | `AppLayout` | `gestor_comercial`/admin/financeiro | interno | baixo |
| `/executivo/*` | `AppLayout` | admin/gestor via `ExecutivoPermissionGate` | interno | baixo |
| `/operacao/*` | `AppLayout` | produção/admin | interno | baixo |
| `/auditoria*`, `/configuracoes*` | `AppLayout` | admin | interno | baixo |

O único ponto de mudança **efetiva** no Bloco 2 é o `Index.tsx` (redirect pós-login) e o `useAuth` (carregar array de papéis). Nada mais é renomeado, movido ou removido.

---

## 6. Portal Parceiro B2B — confirmação de integridade

Rotas confirmadas em `src/pages/portal-parceiro/*` e `src/App.tsx`, todas ativas:
```
/portal-parceiro/dashboard
/portal-parceiro/catalogo
/portal-parceiro/simulador
/portal-parceiro/pedidos
/portal-parceiro/solicitacoes
/portal-parceiro/simulacoes
/portal-parceiro/simulacoes-equipe
/portal-parceiro/fichas-tecnicas
/portal-parceiro/favoritos
/portal-parceiro/historico
/portal-parceiro/financeiro
```
Nenhuma será renomeada, duplicada ou removida no Bloco 1 nem no Bloco 2.

---

## 7. Fluxo técnico já existente

O sistema **já possui** o esqueleto do portal técnico/agrônomo, hoje acessado principalmente via `/app/*` (PWA) e áreas internas:

- Perfis: `tecnico_agronomo`, `consultor_tecnico`, `aplicador`, `operador_onfarm`.
- Produtores vinculados: via `user_clientes` (consultor interno) e `partner_technician_clients` (técnico de parceiro).
- **Agenda**: `src/pages/AgendaTecnica.tsx`, integração `sync-calendar-event`.
- **Visitas externas**: `src/pages/VisitaTecnicaLista.tsx`, hook `useFluxoVisitaTecnica`.
- **Check-in / offline**: `visitas_checkin`, `useOfflineSync`, `offlineCheckinQueue`, `offlineDb`.
- **Relatórios técnicos**: `registros_consultor` (+ PDF via `pdfVisita`, `pdfAplicacao`, versionamento em `registros_consultor_pdf_versions`).
- **Recomendações**: `registros_consultor_recomendacoes`, aprovações em `aprovacoes_tecnicas`, `recomendacao_comentarios`.
- **Geração de OS**: `ordens_servico`, `ordens_servico_onfarm` (com `_status_history`) — já disparada por aprovação técnica.
- **Anexos/fotos**: `registros_consultor_arquivos`, `aplicacao_evidencias(_vinculos)`, `useMediaUploadQueue`, `mediaUpload`, `mediaCompression`.
- **Histórico**: `visitas_logs`, `registros_consultor_status_log`, `ordens_servico_onfarm_status_history`, `production_timeline_events`.

**Conclusão**: nada precisa ser reconstruído. O Bloco 2 só criará uma "casca" (rota `/portal-tecnico/*` ou seletor) que aponta para telas já existentes.

---

## 8. Módulos reutilizáveis

- `has_role`, RLS por vínculo → **manter**.
- `AppLayout` e `MobileLayout` → reutilizados para o portal técnico.
- Guards `RoleGuard`, `ExecutivoPermissionGate` → reaproveitados.
- Hooks `useAuth`, `useMyPartner`, `useOfflineSync`.
- Componentes de visita/registro/OS.
- Fluxo de PDF/notificações.

---

## 9. Duplicidades e conflitos de nomenclatura

| Item | Nota |
|---|---|
| `parceiro_b2b` vs. `parceiro_b2b_gestor` (nome do prompt) | Reutilizar `parceiro_b2b`; NÃO criar novo valor. |
| `agronomo`/`tecnico_campo` (nome do prompt) vs. `tecnico_agronomo`/`consultor_tecnico`/`aplicador` (existentes) | Mapear semanticamente; opcional adicionar sinônimos ao enum na Fase 3. |
| `user_role_assignments` (prompt) vs. `user_roles` (existente) | **Reutilizar `user_roles`**. Ele já suporta múltiplos papéis (UNIQUE composto). Criar tabela nova seria duplicidade. |
| Preferências de usuário | `bi_user_preferences` e `executivo_user_preferences` existem, mas nenhuma guarda "contexto de portal ativo" — nova tabela `user_access_preferences` é justificada. |
| Auditoria genérica | Não há tabela dedicada a "eventos de acesso a contexto"; `user_context_access_logs` é nova e não conflita com auditorias de domínio. |

---

## 10. Riscos de regressão

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `useAuth.role` string única virar array e quebrar consumidores | Alta se feito sem cuidado | Fase 2/Bloco 2: expor `roles: string[]` + `role: string \| null` (papel primário) juntos. |
| Redirect `Index.tsx` mudar comportamento p/ usuário antigo | Média | RPC `get_my_available_portal_contexts` retorna `default_context` calculado; se só 1 contexto, redireciona direto (comportamento equivalente ao atual). |
| RLS quebrar por confiança indevida em "contexto ativo" | Baixa | Contexto é apenas UX; RLS continua por papel/vínculo. |
| Enum `app_role` alterado em produção | Média | Somente `ADD VALUE` (nunca remover); enum é aditivo. |
| Perda de acesso de usuário legado sem `partner_users` mas com role B2B | Baixa | RPC exige role **E** vínculo `partner_users` ativo para liberar B2B; caso contrário retorna lista vazia e Bloco 2 mostra erro amigável (não bloqueia login). |

---

## 11. Plano seguro de implementação (Fases 2-5)

1. **Fase 2** — Documento `docs/multiportal-arquitetura-fase2.md` fixando: reutilizar `user_roles`, contexto é UX, `has_role` inalterada, feature-flag para o seletor.
2. **Fase 3** — Uma migration aditiva:
   - (Opcional) `ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'agronomo'` e `'tecnico_campo'` (só se produto exigir nomes literais — recomendação: **não adicionar agora**, reutilizar existentes).
   - `CREATE TABLE public.user_access_preferences (user_id PK, last_context, preferred_context, skip_context_selector, updated_at)` + CHECK em (`b2b`,`technical`) + GRANT + RLS `auth.uid()=user_id` + trigger `updated_at`.
   - `CREATE TABLE public.user_context_access_logs (id, user_id, context_code, action, previous_context, metadata jsonb, created_at)` + GRANT (INSERT/SELECT p/ authenticated) + RLS append-only próprio + admin lê tudo.
   - Índice `idx_user_roles_user_id` (se ainda não existir sob outro nome) e `idx_user_context_logs_user_created`.
3. **Fase 4** — RPC `public.get_my_available_portal_contexts()` `SECURITY DEFINER`, `SET search_path = public`, retorna JSONB (§4 do plano aprovado). RPC auxiliar `public.set_my_context_preference(context text, remember bool)`.
4. **Fase 5** — Executar `supabase--linter`, testes SQL de RPC nos 13 cenários, smoke Playwright em `/portal-parceiro/pedidos`, `/portal`, `/app`, `/`. Gerar `docs/multiportal-fundacao-fase5.md` com status.

---

## 12. Arquivos que poderão ser alterados no Bloco 2 (NÃO na Fase 1)

- `src/hooks/useAuth.tsx` — expor `roles: string[]` + `role` primário.
- `src/pages/Index.tsx` — usar RPC para decidir redirect.
- `src/App.tsx` — adicionar rota do seletor (`/selecionar-portal`) e opcionalmente `/portal-tecnico/*` como alias.
- Novo: `src/pages/SelecionarPortal.tsx`.
- Novo: `src/hooks/useAvailableContexts.ts` (chama a RPC).

---

## 13. Itens intocáveis (Bloco 1 inteiro)

- `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`.
- Fluxo de login (`Auth.tsx`) e componentes de sessão.
- Rotas e layouts do Portal Parceiro B2B, Portal Produtor, PWA técnico, financeiro, executivo, operação.
- Policies RLS existentes de `partner_*`, `clientes`, `visitas_*`, `ordens_servico*`, `accounts_*`, `partner_orders*`.
- Enum `app_role` (não remover; adição opcional na Fase 3 se justificada).
- Função `has_role` — manter assinatura e semântica.

---

## 14. Status da Fase 1

**Fase 1 concluída — somente leitura, sem alterações estruturais.**

Antes de avançar para a Fase 2, confirme:
1. Aprova reutilizar `user_roles` (em vez de criar `user_role_assignments`)?
2. Aprova reutilizar `parceiro_b2b`/`tecnico_agronomo` etc. em vez de adicionar `parceiro_b2b_gestor`/`agronomo`/`tecnico_campo` ao enum?
3. Aprova o mapeamento de contexto: **B2B** = roles B2B + `EXISTS partner_users` ativo; **Technical** = roles técnicos internos.

Com o "ok" nesses três pontos, sigo para a Fase 2 (documento de arquitetura) e depois Fase 3 (migration aditiva).
