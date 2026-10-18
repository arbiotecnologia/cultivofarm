# Plano — Vínculos B2B zero/um/múltiplos por usuário (mesmo tenant) — 2026-10-18 (REVISÃO, nada aplicado)

Status: **PROPOSTA PARA REVISÃO**. Nenhum DDL/DML executado em produção. A constraint
`partner_users_user_id_key UNIQUE(user_id)` permanece intacta até aprovação explícita.

## 1. Estado atual comprovado (read-only, ref canônico swzpzcwiasxmjutrmvkm)

- `public.partner_users(id, partner_id, user_id, created_at, papel)` com `UNIQUE(user_id)`:
  um usuário só pode estar vinculado a **um** parceiro; desvincular hoje exigiria DELETE
  da linha (modelo "deleção como único caminho"), sem histórico, sem revogação, sem motivo.
- Não existem colunas de vigência/revogação (`ativo`, `is_active`, `revoked_at` etc.) —
  proposta anterior que referenciava `ativo` estava incorreta e foi descartada.
- `user_clientes` já possui modelo completo de revogação (valid_from/revoked_at etc.) e
  serve de referência de desenho, sem cópia automática.
- `partner_user_clients` deriva a carteira de clientes do técnico/gestor por vínculo.

## 2. Inventário de consumidores de `partner_users` (a auditar antes de qualquer DDL)

Cada consumidor precisa ser classificado: lê por `user_id` (assume 1 vínculo), lê por
`partner_id`, ou escreve. Categorias identificadas estaticamente:

- RLS/policies que usam `partner_users.user_id = auth.uid()` (portal B2B, pedidos,
  simulações, mensagens, preços) — assumem unicidade; com múltiplos vínculos passam a
  resolver "qualquer vínculo ativo" e precisam de predicado de vigência.
- Funções/RPCs: `b2b_commercial_context()`, guards `b2b_phase1_*`, `useMyPartner`
  (frontend), seletor de contexto do portal, Edge `list-portal-users`.
- `partner_user_clients` (FK e lógica de carteira) — múltiplos vínculos implicam
  carteiras por parceiro, não por usuário.
- Auditorias (`partner_audit_logs`, `partner_order_audit_logs`) — precisam registrar
  revogação/troca com ator e motivo.

A lista exata de objetos (nomes de policies/funções) deve ser extraída em preflight
read-only antes da Fase 0 da migração; este plano não pressupõe a lista completa.

## 3. Modelo alvo (recomendação)

Evolução controlada da própria `partner_users` (sem tabela paralela):

- Manter `id` como PK; adicionar:
  - `status` (`ativo`/`revogado`) ou derivar de `revoked_at IS NULL`;
  - `valid_from timestamptz NOT NULL DEFAULT now()`;
  - `revoked_at timestamptz NULL`, `revoked_by uuid NULL`, `revoke_reason text NULL`;
  - `tenant_id uuid NOT NULL` derivado do parceiro (`partner_accounts.commercial_owner_organization_id`),
    preenchido por trigger/backfill validado, para predicados RLS sem join extra;
  - `version`/timestamps de auditoria conforme padrão do projeto.
- Chaves:
  - `UNIQUE(user_id, partner_id)` (par único, incluindo histórico revogado);
  - índice parcial de unicidade de vínculo ATIVO por par: `UNIQUE(user_id, partner_id) WHERE revoked_at IS NULL`;
  - **remover** `UNIQUE(user_id)` somente na fase de cutover, após todos os consumidores
    tratarem múltiplos vínculos (ver Fase 2).
- Histórico append-only `partner_user_link_history` (trigger nega UPDATE/DELETE):
  ator, tenant, parceiro antigo/novo, ação (create/revoke/reactivate), motivo, correlação.
- Zero vínculos = usuário sem acesso B2B (papel pode permanecer, mas sem vínculo ativo
  nenhum guard resolve contexto — fail-closed).
- Transição entre parceiros NUNCA transfere carteira, pedidos, propostas, comissões ou
  documentos: pedidos mantêm snapshot do `partner_id` original; nova carteira exige
  vínculo expresso em `partner_user_clients` para o novo parceiro.

## 4. Fases da migração (cada fase = migration própria, reversível)

- **Fase 0 — Preflight read-only:** inventário exato de consumidores (policies, funções,
  triggers, FKs, Edge, hooks), contagem de vínculos, detecção de órfãos. Critério de
  aceite: lista fechada de objetos a alterar, sem surpresas no cutover.
- **Fase 1 — Aditiva:** novas colunas + histórico + triggers + backfill validado
  (`tenant_id` derivado e conferido linha a linha; falha = abort). `UNIQUE(user_id)`
  permanece. RLS passa a exigir `revoked_at IS NULL` (equivale ao estado atual, já que
  nada está revogado). Testes RLS A/B: admin tenant A não lê vínculos de B; usuário
  revogado (fixture transacional) perde acesso imediatamente.
- **Fase 2 — Cutover multi-vínculo (somente após Fase 1 homologada):** remover
  `UNIQUE(user_id)`, criar unicidade parcial ativa por par. Todos os consumidores já
  devem resolver "vínculo ativo" (Fase 1). Critério de aceite: suíte RLS A/B +
  concorrência (duas transações criando vínculos distintos para o mesmo usuário) verde.
- **Fase 3 — RPCs de gestão:** `tenant_admin_revoke_partner_link` e
  `tenant_admin_create_partner_link` (INVOKER público + core DEFINER privado), tenant
  derivado de `auth.uid()`, CAS por versão, locks ordenados (usuário→parceiro),
  idempotência por chave, motivo obrigatório, histórico append-only, invalidação de
  autorização server-side imediata (revogação efetiva na mesma transação).
- **Fase 4 — Frontend:** seletor de contexto passa a listar vínculos ativos; ao revogar
  o vínculo em uso, o frontend troca de contexto/recarrega; edição segue o fluxo F2.

## 5. Rollback

- Fase 1: DROP das colunas novas/triggers/histórico (histórico pode ser preservado por
  decisão); predicado `revoked_at IS NULL` é no-op enquanto tudo ativo.
- Fase 2: recriar `UNIQUE(user_id)` — **só é possível se não houver usuário com 2+
  vínculos ativos**; preflight de rollback obrigatório (contagem) antes de executar.
- Fase 3: DROP das RPCs/cores; histórico preservado.

## 6. Testes exigidos (harness local + transacional hosted pelo auditor)

- RLS A/B: admin A não lê/escreve vínculos de B; superadmin sem tenant não recebe dados.
- Concorrência: dois admins criando vínculos para o mesmo usuário em parceiros
  diferentes — ambos sucedem (Fase 2) sem violar unicidade parcial; mesmo par — um falha.
- Idempotência: replay da mesma chave retorna o mesmo resultado sem duplicar histórico.
- Revogação: acesso B2B cai na mesma transação; demais vínculos/papéis intactos.
- Integridade: `partner_user_clients` órfão de vínculo revogado deixa de autorizar
  (carteira depende de vínculo ativo).

## 7. Fora de escopo deste plano

- Conversão interno↔externo e Técnico B2B: permanecem bloqueados.
- Cache same-identity (gate false): a invalidação de sessão do titular em outro
  dispositivo depende desse recorte e é pré-requisito para liberar a UI de revogação.
- Nenhuma transferência automática de carteira/pedidos/propostas/comissões/documentos.
