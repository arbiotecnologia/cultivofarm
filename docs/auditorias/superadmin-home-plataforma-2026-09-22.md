# Home provisória do Superadmin de Plataforma — 2026-09-22

Backend canônico: `swzpzcwiasxmjutrmvkm`. Escopo: criar a home provisória do
papel de plataforma (`superadmin`) com **leitura** de planos, assinaturas e
histórico, sem tocar menus operacionais, e documentar o que ainda falta para a
Fase S2.

## 1. O que foi entregue

| Item | Caminho | Natureza |
| --- | --- | --- |
| Migration de leitura | `supabase/migrations/20260922211137_7eae146c-4343-4633-a7ea-844c9e857ee6.sql` | Policy `saas_platform_read` (SELECT) nas 6 tabelas SaaS |
| Rota `/plataforma` | `src/App.tsx` | Fora do `AppLayout`, fora do `ACCESS_MAP` |
| Guard | `src/components/guards/PlataformaGuard.tsx` | Exige sessão + `roles.includes("superadmin")` |
| Página | `src/pages/plataforma/PlataformaHome.tsx` | Abas Planos / Assinaturas / Histórico, somente leitura |
| Consultas | `src/hooks/usePlataformaSaaS.ts` | Cliente canônico, colunas explícitas, `retry:false`, limite 200 |
| Home do papel | `src/lib/permissions.ts` | `getHomeForRole("superadmin")`: `/sem-permissao` → `/plataforma` |
| Testes | `src/test/saas/superadmin-home-plataforma.test.ts` (14) | Invariantes estáticos |

## 2. Migration aplicada

`20260922211137` — transacional, idempotente, sem alteração de dados:

- Cria `saas_platform_read` (`FOR SELECT TO authenticated USING
  (public.is_platform_superadmin((SELECT auth.uid())))`) em `saas_modules`,
  `saas_features`, `saas_plans`, `saas_plan_features`,
  `organization_subscriptions` e `organization_subscription_history`.
- **Nenhuma** policy de INSERT/UPDATE/DELETE é criada; escrita segue exclusiva
  de `service_role` / rotinas SECURITY DEFINER.
- `anon` permanece sem qualquer acesso (grants inalterados: `SELECT` para
  `authenticated`, `ALL` para `service_role`).
- Validação final fail-closed `SUPERADMIN_HOME_VALIDACAO_FALHOU`: aborta se
  alguma das 6 tabelas ficar sem as duas policies de leitura, ou se surgir
  qualquer policy de escrita nessas tabelas.

Advisors/linter: **484 alertas, 4 tipos — idêntico ao estado anterior**
(16 RLS sem policy, 2 anon-exec, 465 auth-exec, 1 leaked password protection).
Nenhum alerta novo.

## 3. Isolamento do menu operacional

- `superadmin` continua **fora** de `ACCESS_MAP` e de `ACTIVE_ROLES`: nenhum
  módulo de empresa é liberado.
- Nenhum item foi adicionado a `src/config/navigation.ts` nem ao `AppSidebar`.
- `/plataforma` não está sob `RoleGuard`; usa guard próprio e layout próprio.
- Qualquer usuário sem o papel na lista completa de papéis é enviado para
  `/sem-permissao` no cliente — e, no servidor, a RLS devolve zero linhas.

## 4. Testes executados

- `src/test/saas` — 60/60 (14 novos).
- Suíte completa, typecheck e build: ver seção 7.
- Ledger de migrations 683 → 684 (`h7p-repo-only-manifest.json`,
  `h9c-applied-forwards.json` e as 11 asserções estáticas correspondentes).
- Exceções de freeze 28A/28B/28C atualizadas com a nova migration.

## 5. Dados operacionais

Nenhum dado alterado. Nenhum usuário criado; continuam **0 linhas** com o papel
`superadmin`, portanto a tela ainda não foi aberta por ninguém em sessão real.

## 6. O que ainda falta para iniciar a Fase S2 (entitlement engine)

Bloqueadores e pré-requisitos, em ordem:

1. **Usuário de plataforma inexistente.** Não há nenhum `superadmin`; a home só
   pode ser validada por login real depois que o proprietário autorizar a
   criação do usuário mestre (concessão exclusiva por `service_role`).
2. **Catálogo vazio.** `saas_modules`, `saas_features` e `saas_plan_features`
   não têm linhas; o único plano é o "Plano Base" sem funcionalidades. A S2
   precisa do mapa MÓDULO → FEATURE derivado da matriz da Fase S0.
3. **Nenhuma assinatura para a organização atual.** Decisão pendente: a S2 deve
   tratar "sem assinatura" como *fail-closed* (bloqueia) ou *grandfathered*
   (compatibilidade). Sem essa decisão, ligar o motor derruba a operação atual.
4. **`get_my_entitlements()` não existe.** É o objeto central da S2: RPC
   SECURITY DEFINER, `search_path` fixo, EXECUTE revogado de `PUBLIC`/`anon`,
   resolvendo organização ativa ∧ assinatura válida ∧ feature contratada ∧
   perfil ∧ vínculo — tudo no servidor.
5. **`organization_id` ausente na maioria das tabelas de negócio.** Enquanto o
   tenant não estiver materializado, o entitlement fica restrito à organização
   do `profile`; a migração por módulo é a Fase S6.
6. **Sem overrides e sem contadores de uso.** `organization_feature_overrides`
   e `saas_usage_counters` continuam fora de escopo até a S2/S5.
7. **Leitura do administrador ainda é global.** `saas_admin_read` permite que
   qualquer `administrador` leia assinaturas de todas as organizações —
   correto com uma só empresa, precisa ser escopado antes da segunda.
8. **Emitente fiscal global.** RPCs fiscais selecionam emitente sem filtro de
   organização (item 8 do plano H15): bloqueador na segunda organização.
9. **Pendências herdadas do gate**: *leaked password protection* desativada
   (ação do proprietário no painel Supabase) e ausência de bateria autenticada
   ponta a ponta por perfil (13 papéis × portais). As provas atuais são sondas
   transacionais e invariantes estáticos.

## 7. Resultados

- Suíte completa: **5227 testes**, exit 0.
- Typecheck: exit 0. Build: exit 0.
- Linter Supabase: 484 (sem alerta novo).

## 8. Conclusão

**PASS** para a home provisória. **S2 permanece bloqueada** até a decisão sobre
os itens 1–4 acima, que exigem autorização do proprietário.
