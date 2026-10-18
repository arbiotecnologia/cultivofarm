# Entrega 2 — Registro PÓS-IMPLANTAÇÃO em produção (2026-10-18)

**Status: IMPLANTADO, HOMOLOGAÇÃO PARCIAL.** Ref canônico `swzpzcwiasxmjutrmvkm`.
Aplicação realizada pelo auditor externo via Supabase `apply_migration`
`cultivofarm_b2b_entrega2_helpers_rev23_20261018`, usando o arquivo candidato
completo do commit `bb283766b27eab0142995622530c9343b3e01f35` (success=true).
Este agente não executou DDL/DML hosted nem publicação.

## 1. Evidências pós-live (reportadas pelo auditor externo)

- Hashes instalados idênticos aos fixos commitados/verificados no laboratório:
  - `get_user_partner_id()` = `b334c3a454ebc4233d3b9e0d0a700d78`
  - `get_partner_papel(uuid)` = `f84f898ead03dfd646ece50d16baf909`
  - `b2b_commercial_context()` = `a31d198c9a9fc9a5e7c397ab36fe0fa4`
- Entrega 1 inalterada: `can_user_access_cliente(uuid,uuid)` =
  `4e0c374caa04bb9bf9fac9cc4e6723f1`.
- ACL/owner/search_path idênticos ao preflight.
- Checksum agregado de TODAS as policies (`pg_policy`) =
  `6b919969e8c3c7cd4a4599f8f3ba2583` antes e depois — nenhuma policy tocada.
- Smoke SQL com role authenticated e UID real B2B (antes/depois): partner
  `7e52de9a-4bed-4d1e-8200-3255a805465c`, papel `gestor`, contexto
  `commercial_owner` preservados. **SQL authenticated NÃO é login JWT.**

## 2. Teste REAL em navegador (login feito pelo usuário)

- Admin AR Bio `arbiotecnologia@gmail.com` no publicado; B2B
  `teste4@refilinformatica.com.br` no preview.
- Portal B2B positivo correto; `/configuracoes` negado com `/sem-permissao`.

## 3. Teste de revogação real (operacional, controlado)

- Auditor alterou SOMENTE o vínculo existente de teste
  `3ae4462f-0351-46fd-bf4e-b45aec16eebe` (user
  `beb25695-3957-48b0-aff8-6316520ea189`), com guard `version=2`,
  `revoked_at` e `revoked_by` = admin `a7d45277-6dec-413d-bf6b-86620c1ef39f`,
  reason `AUDITORIA-E2-20261018-REVOGACAO-TEMPORARIA`, gatilhos ativos.
- Primeira tentativa sem `revoked_by` foi **rejeitada por constraint**, sem
  mudança (bom sinal de integridade).
- Tentativa correta passou com `version=3` em 2026-10-18 21:36:03 UTC:
  helpers passaram a retornar NULL; navegador B2B, após reload, bloqueou com
  `/sem-permissao`.
- Restauração imediata controlada (guard `version=3`/reason) zerou os campos
  de revogação, preservou o vínculo original e avançou para `version=4` pelos
  gatilhos. Após reload e "Voltar ao dashboard", o portal voltou.
- Sem dados comerciais novos; nenhuma conta criada.

## 4. Limites declarados (o que NÃO foi provado)

- NÃO prova UI de desvinculação/reativação — a mutação foi SQL operacional de
  teste, não o fluxo de interface dos contratos.
- NÃO prova todos os tenants: JWT cruzado A/B segue pendente (ver 4.1).
- Sem recarga, a tela não mudou na primeira observação imediata; TTL/cache
  residual NÃO medido nem afirmado (ver seção 5).
- Advisors antes/depois com mesmos counts (INFO 36; WARN: anon 2,
  authenticated 336, password 1) — não prova ausência de vulnerabilidades.

### 4.1 Evidência real adicional (2026-10-18, escopo honesto)

- Sessão publicada trocada pelo proprietário para `renato_cunha22@hotmail.com`
  (tenant B `8f57c7dd-0557-4041-b401-7a00f7244626`).
- Configurações/Usuários na sessão B mostrou apenas os 2 usuários de B; antes,
  o admin de A via seus 6 — isolamento de lista observado.
- Abrir cliente de A (`/clientes/33e9257d-ed39-4fc1-b959-680eb886ef6c`) na
  sessão B retornou "Cliente não encontrado" — negação cross-tenant observada.
- **Escopo:** teste real LIMITADO (um tenant B, duas telas/uma rota). NÃO é a
  matriz A/B completa de JWT/RLS; não cobre todas as rotas, papéis nem
  mutações. A homologação A/B continua PARCIAL.

## 5. Inspeção READ-ONLY: invalidação cliente/fingerprint no portal B2B

Como uma sessão aberta reage hoje a `partner_users.revoked_at` (e à
restauração), sem inventar mecanismo novo nem alterar hooks:

- **`src/components/guards/B2BRouteGuard.tsx:20-30`** — a autorização do
  portal `/portal-parceiro/*` é resolvida no servidor via
  `useAvailableContexts()` (RPC `get_my_available_portal_contexts`) +
  `useMyPartner()` (RPCs `get_my_commercial_partner_context` /
  `get_my_commercial_partner_projection`). Nenhum dos dois assina Realtime
  em `partner_users`.
- **`src/hooks/useAvailableContexts.ts:50-56`** — query
  `available-portal-contexts` com `staleTime: 0`, `refetchOnWindowFocus: true`,
  `gcTime: 2min`, `retry: 1`. Reage a: reload, foco da janela, remontagem/
  navegação. Não há gatilho por tempo nem por evento de banco.
- **`src/hooks/useMyPartner.ts:23-58`** — query `my-partner` com escopo de
  fence (`useStorageAccessScope`), `staleTime` padrão (0) e foco padrão do
  React Query; mesma conclusão: reage a reload/foco/remontagem.
- **Realtime:** os canais `postgres_changes` existentes
  (`usePartnerOrdersAdmin`, `useCommercial`, `useAlertas*`, etc.) cobrem
  pedidos/alertas — **nenhum assina `partner_users`**. Logo, com o gate
  fechado, uma revogação só é percebida no próximo refetch (foco, navegação
  ou reload) — compatível com o observado no teste real (tela não mudou sem
  recarga; bloqueou após reload).
- **Foundation de época (futura, gate FECHADO):**
  `src/lib/authz/authzEpochGate.ts:4` — `AUTHZ_CACHE_FOUNDATION_ENABLED =
  false`; enquanto fechado, o monitor não é criado e `authzReady` é sempre
  true (`useAuth.tsx:451-455`). Com o gate aberto (não é o caso hoje),
  `src/lib/authz/authzEpochMonitor.ts:59-60` faria poll a cada **10s** com
  lease máxima de **15s** (relógio monotônico, rechecada no acesso), fingerprint
  via RPC `get_my_authz_fingerprint` (`useAuth.tsx:381-389`), revalidação
  imediata em foco/visibilidade/online e expiração imediata em offline
  (`useAuth.tsx:423-431`); mudança de fingerprint (revogação/troca de vínculo)
  limpa caches e remonta o conteúdo via `AuthzEpochBoundary`
  (`src/components/authz/AuthzEpochBoundary.tsx`). **Tempo esperado hoje
  (gate fechado):** até o próximo refetch por foco/navegação/reload — sem
  bound de tempo garantido. **Com gate aberto (futuro), linguagem corrigida:**
  a lease de 15s é medida DESDE O INÍCIO do request que obteve a última
  resposta confirmada (não "poll 10s + lease 15s" somados); com a aba visível
  e online, um poll a cada 10s reconfirma antes do vencimento, mas **nenhum
  timer é prometido enquanto o navegador está suspenso** — ao acordar, o evento
  de foco/visibilidade força revalidação que ESCONDE o conteúdo até nova
  confirmação. Nenhum TTL foi medido no teste real; não afirmar número.
- **Testes existentes do mecanismo:** `src/test/config/authzEpochMonitor.test.ts`,
  `src/test/config/authzFoundation.integration.test.tsx`,
  `src/test/config/myPartner.session.test.tsx`,
  `src/test/multiportal.contexts.session.test.tsx`,
  `src/test/multiportal.guards.test.tsx`.

## 5.1 Fase revogação/cache — bloqueadores recuperados e correção concreta (2026-10-18)

Bloqueadores registrados da foundation (memória do projeto) reconfirmados:
SQL do fingerprint NÃO instalado/wired (o runtime chama
`get_my_authz_fingerprint`; o candidato revisado v6 define
`get_my_authz_fingerprint_v6` — nome deliberadamente separado, não conectado),
preflight de revisão monotônica/row-revision dos writers pendente, contenção
de anexos/buckets pendente, gate permanece FECHADO.

**Defeito concreto corrigido nesta fase (código + testes, gate fechado):**
o cabeçalho do SQL v6 exige que o monitor desconte o round-trip monotônico
completo de `server_remaining_ms` antes de qualquer aprovação de gate, e o
monitor ignorava o campo. Correção:
- `src/lib/authz/authzEpochMonitor.ts` — `AuthzFingerprintResult` ganha
  `server_remaining_ms?: number | null`; na resposta válida a lease concedida
  é `min(leaseMs, server_remaining_ms - RTT monotônico)` medida desde o início
  do request; orçamento já consumido pelo RTT expira imediatamente
  (`expire("timeout")`). O cliente nunca se autoriza além do boundary temporal
  calculado pelo servidor.
- `src/hooks/useAuth.tsx` — o fetcher passa a ler `server_remaining_ms` da
  resposta do RPC e repassá-lo ao monitor.
- Testes novos em `src/test/config/authzEpochMonitor.test.ts`: budget do
  servidor menor que a lease encurta a autorização; budget consumido pelo RTT
  expira na hora; RTT descontado corretamente (resposta em t4 com budget 15s
  autoriza só até t11); ausência do campo mantém lease local de 15s; revogação
  (ineligible) fecha e restauração com fingerprint novo reabre via revalidate.
- Resultados: `npx vitest run src/test/config/authzEpochMonitor.test.ts
  src/test/config/authzFoundation.integration.test.tsx` — **36/36 passou,
  exit 0**; `npx tsgo --noEmit` — exit 0. Testes locais NÃO são JWT/RLS real.

**O que falta para habilitação limitada do gate (lista precisa):**
1. SQL do fingerprint instalado e wired: decidir nome canônico
   (`get_my_authz_fingerprint` vs `_v6`), aplicar migration revisada com
   grants mínimos (core SECURITY DEFINER self-only + wrapper INVOKER) —
   hoje, abrir o gate faria o fetcher falhar e expirar (fail-closed, oculta
   dados), o que é seguro mas inutilizável.
2. Preflight monotônico transacional cobrindo writers de principal/vigência/
   revogação/parceiro/papel/identidade (candidatos em
   `scripts/authz-cache/monotonic*.sql.review`, não instalados).
3. Contenção server-side de emissores antigos de anexos e drenagem do TTL
   legado comprovadas; buckets `order-attachments`/`entrega-termos` ausentes
   do manifest — nunca criar bucket permissivo.
4. Homologação de navegador com o gate aberto em ambiente de teste: revogação
   real fecha sessão em ~um ciclo de poll (aba visível), restauração reabre,
   A→B→A descarta respostas antigas, offline expira imediatamente.
5. Revisão independente do conjunto antes de qualquer `AUTHZ_CACHE_FOUNDATION_ENABLED=true`.

**Riscos/rollback desta fase:** a correção é aditiva e atrás de gate fechado
— com o gate fechado o monitor nem é criado, logo o risco em produção é nulo;
rollback = reverter os 3 arquivos (monitor, useAuth, teste). Nenhum DDL/DML
hosted, nenhuma publicação, PUC/PTC e contratos intocados.

## 6. Autorizações registradas

- Usuário autorizou criação/reuso de contas de teste por perfil/tenant; login
  admin + B2B agora disponível externamente. Nenhuma conta foi criada por este
  agente neste recorte.
- Backup de produção: responsabilidade assumida pelo usuário (registrado em
  2026-10-18); não será solicitado novamente.

## 7. Status e gates

- **IMPLANTADO** em produção com evidências de hash/checksum preservados.
- **HOMOLOGAÇÃO PARCIAL:** smoke SQL authenticated + teste real de navegador
  (positivo, negativo `/configuracoes`, revogação e restauração) feitos;
  pendente JWT cruzado A/B entre tenants e prova da UI de
  desvinculação/reativação.
- Gate de contratos permanece FECHADO: sem próxima fase até resolver os
  críticos pendentes (JWT A/B cruzado; cache residual/TTL não medido).
- Rollback manual documentado
  (`vinculos-b2b-entrega2-helpers-rollback-20261018.sql`) sob avaliação; não
  executado.
