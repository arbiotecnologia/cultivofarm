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

## Adendo 2026-10-18 (rev monitor + evidência tenant B)

### Evidência real limitada — tenant B (renato_cunha22@hotmail.com, 8f57c7dd-0557-4041-b401-7a00f7244626)
- Listas de clientes e parceiros de B aparecem VAZIAS na sessão B; banco confirmou B com zero registros e A com 3 clientes / 4 parceiros (3 ativos). Ou seja: o vazio é ausência real de cadastro próprio de B, NÃO prova de isolamento negativo — falta um positivo de cadastro próprio de B.
- Configurações/Usuários em B mostrou apenas 2 usuários de B (antes, admin A mostrava seus 6); cliente de A aberto na sessão B retornou "Cliente não encontrado". Escopo honesto: teste real limitado, NÃO matriz A/B completa.

### Gate da foundation de cache de autorização — PERMANECE FECHADO
- Consulta live independente confirma: `get_my_authz_fingerprint` e `get_my_authz_fingerprint_v6` NÃO existem no pg_proc de produção. `AUTHZ_CACHE_FOUNDATION_ENABLED` DEVE permanecer `false`.
- Candidatos v6 existentes (somente review local, não instalados):
  - Reader: `scripts/authz-cache/v6/reader.sql.review` (rollback: `scripts/authz-cache/v6/reader-rollback.sql.review`)
  - Preflight monotônico dos writers: `scripts/authz-cache/writer-preflight-readonly.sql` (design: `scripts/authz-cache/monotonic.sql.review`, testes: `monotonic-tests.sql.review`, rollback: `monotonic-rollback.sql.review`)
  - Contenção de anexos/buckets: `scripts/authz-cache/v6/attachments.sql.review` (+ `attachments-preflight.sql.review`, `attachments-rollback.sql.review`)

### Correções do monitor (rev 2672bb6 → ajuste pós-revisão)
- `src/lib/authz/authzEpochMonitor.ts`: `server_remaining_ms` ausente/null => lease local; presente porém não numérico finito ou negativo => falha fechada ("error"). Deadline calculado e verificado finito E estritamente futuro ANTES de transição para valid/fingerprint/epoch; sem poll nem callbacks após expiração (caso RTT 4s + budget 7s => deadline t+3 < now).
- `src/test/config/authzEpochMonitor.test.ts`: novos casos NaN/Infinity/negativo, deadline consumido com effective>0, ausência de valid/epoch/poll após expiry. 28/28.
- `src/test/config/authzFoundation.integration.test.tsx`: teste renomeado para "sessão única sem Broadcast" — monta UMA sessão; isolamento entre duas sessões reais NÃO é coberto.
- Verificação: vitest 40/40 exit 0; `npx tsgo --noEmit` exit 0; build OK. Testes locais NÃO são prova de JWT/RLS real.

### Riscos residuais
- Monitor NÃO está ativo em produção (gate fechado); riscos de integração (fingerprint RPC ausente, preflight monotônico e contenção de anexos pendentes) NÃO estão homologados. Rollback local: reverter monitor, useAuth e testes.

## Adendo 2026-10-18 (rev 2 do monitor — parser do fetcher + janela do arm)

Revisão independente de integração encontrou dois bypasses residuais, ambos corrigidos sem novo fluxo:

### 1. Parser do fetcher em `src/hooks/useAuth.tsx` rebaixava valor inválido para null
- Antes: `typeof row?.server_remaining_ms === 'number' ? ... : null` transformava string/objeto/bool presente em `null`, e o monitor concedia lease local indevida.
- Agora: ausente/null => `null` (contrato v6, lease local); valor PRESENTE é repassado bruto ao monitor, que falha fechado em não numérico/não finito/negativo. Sem fallback.
- Teste de integração AuthProvider (`authzFoundation.integration.test.tsx`): RPC entregando string `"15000"`, objeto `{ms:15000}` e booleano `true` => conteúdo sensível OCULTO, "Sessão de acesso pausada", sem poll agendado (fpCalls permanece 1 após 30s), sem fallback de lease local.

### 2. Janela entre pré-checagem e arm do timer no monitor
- O relógio monotônico podia cruzar o deadline entre a pré-checagem (deadline futuro) e `armLeaseDeadline()`: o estado ia a `valid`, o timer expirava, mas `onEpochChange` e `schedulePoll` ainda eram chamados.
- Agora: após `armLeaseDeadline()`, re-checa `state === "valid" && generation === myGen` ANTES de `onEpochChange`/`schedulePoll`. Nenhum callback de época nem poll sai após expiração.
- Teste unitário com relógio injetado (`authzEpochMonitor.test.ts`): `onStateChange` avança o relógio além do deadline dentro de `setState("valid")` => expira com "timeout", sem epoch change, sem poll (fetchCalls não cresce).

### Verificação
- Vitest focado: 44/44 (29 monitor + 15 integração), exit 0.
- Suíte completa: 7820 passed, 8 failed em 5 arquivos PRÉ-EXISTENTES e não relacionados (canonicalTypesGuard, cultivofarm-runtime.static, d51-4/d51-5, etapasVisita) — confirmado que não importam nem dependem dos arquivos alterados (ex.: d51-4 exige string `rpc("tenant_admin_list_users"` ausente já no HEAD).
- `npx tsgo --noEmit` exit 0; build OK.
- Testes locais NÃO são prova de JWT/RLS real; monitor NÃO está ativo em produção.

### Evidência externa registrada (não é aprovação)
- Captura externa de 52 corpos/ACL/hashes de writers live em `auditoria-20261018/writers-live-20261018.json` (workspace do auditor). Registrada como evidência; NÃO constitui aprovação de concorrência nem autoriza abrir gate.

### Gates inalterados
- `AUTHZ_CACHE_FOUNDATION_ENABLED` permanece `false`; `get_my_authz_fingerprint`/`_v6` ausentes no pg_proc; nenhuma publicação, DDL ou DML hosted neste recorte. Risco NÃO é nulo: integração permanece não homologada.

## Adendo 2026-10-18 (rev 3 — prova da janela do arm corrigida + helpers B2B revogação)

### Prova da janela do arm (correção do teste)
- O teste anterior (clock=4000, budget=7000) falhava ANTES de setState("valid") — não provava a janela. Corrigido: resposta em t0 com budget 15s atinge "valid"; revalidate em t10 com fingerprint novo e budget 15s (deadline t25, futuro na pré-checagem); onStateChange avança o relógio para t40 DENTRO do 2º "valid", antes de armLeaseDeadline.
- Asserts: onStateChange recebeu "valid" (2ª ocorrência) ANTES de "expired"; sem epoch change; sem poll.
- Prova de eficácia: com a guarda `if (state !== "valid" || generation !== myGen) return;` removida temporariamente, o teste FALHA em `onEpochChange` (disparado após expire); com a guarda restaurada, 29/29 PASS. Autorização não foi relaxada.

### Pendência de backend confirmada ao vivo: 3 helpers ignoram revoked_at
Correção pequena preparada nos PRÓPRIOS helpers (sem funções paralelas/contratos/UI), NÃO aplicada hosted:
- `public.get_b2b_user_role_for_partner(uuid,uuid)` — adiciona `pu.revoked_at IS NULL`.
- `public.is_valid_b2b_partner_user(uuid,uuid)` — adiciona `pu.revoked_at IS NULL` e `pa.deleted_at IS NULL`.
- `platform_private.b2b_actor_scope(uuid)` — conta TODOS os vínculos não revogados antes da elegibilidade (0/2+ falham fechado); `user_partner` só com vínculo único elegível (parceiro ativo, não deletado, owner não nulo, tenant=owner); `partner_valid` da org passa a exigir owner não nulo; `profile_ok`/`org_partner`/`has_catalog` preservados (acesso interno/legacy intacto). Sem recursão: actor_scope não chama b2b_commercial_context de volta.
- Arquivos: `scripts/b2b-helpers-revogacao/candidate.sql.review` (guarda fail-closed de hashes pré + verificação pós de ACL/owner/search_path), `rollback.sql.review` (corpos exatos pré-candidata, guarda anti-drift, confere retorno aos hashes), `callers.md` (mapa lexical de chamadores: trigger partner_users 20260702; cadeia platform_private 20261006/20261007/20261008; nenhum chamador frontend).
- Hashes pré (live revisado, md5 de pg_get_functiondef): role `b2596473d00151ef41b4b2ce82e044cb`, valid `7b17274fb6dce728741a2a9c77710a76`, actor_scope `c85cb35201682c3c86b9a327d24c8482`. Hashes pós serão computados pelo auditor na aplicação (a verificação pós exige mudança de hash + ACL/owner/search_path idênticos).
- Testes SQL locais (`test-local.py`, PostgreSQL descartável): 21/21 PASS com CORPOS REAIS extraídos dos arquivos (não réplicas) — negativos: revogado, tenant errado, parceiro inativo, parceiro deletado, sem papel B2B, 0 e 2 vínculos; positivo elegível; interno/legacy preservado; rollback fiel (restaura comportamento pré). Stubs declarados: has_role via fixture user_roles, entitlements_for_user via fixture; NÃO prova JWT/RLS real nem b2b_commercial_context (corpo próprio já alinhado na E2).

### Suíte ampla — 8 falhas pré-existentes (nomes/assertions exatos)
Comparação com o HEAD (parent): as 8 falham igualmente sem as mudanças deste recorte (verificado por inspeção de conteúdo — ex.: a string esperada por d51-4 está ausente já no HEAD). Nenhuma importa `useAuth.tsx` ou `authzEpochMonitor.ts` exceto d51-4, que lê useAuth.tsx estaticamente:
1. `src/test/security/d51-4-tenant-users.test.ts` > "lista usuários por RPC tenant paginada e chave de cache por identidade" — assertion: `expect(auth).toContain('rpc("tenant_admin_list_users"'` — a string está ausente no useAuth.tsx TAMBÉM no HEAD (pré-existente). TESTA AUTORIZAÇÃO (gate tenant), mas a falha é de drift estático do arquivo, não deste recorte.
2. `src/test/security/d51-4-tenant-users.test.ts` > "altera status somente pela RPC tenant" — mesma família de assertion estática sobre useAuth.tsx; pré-existente. TESTA AUTORIZAÇÃO.
3. `src/test/security/d51-5-p1-systemic.test.ts` > "valida Superadmin no servidor antes de usar service role no catálogo global" — assertion estática sobre guarda de superadmin; pré-existente. TESTA AUTORIZAÇÃO.
4. `src/test/visita/etapasVisita.test.ts` > "a tela usa o primeiro bloqueio antes de consultar o servidor" — assertion de ordem de validação na UI de visita; sem relação com authz. Pré-existente.
5. `src/test/visita/etapasVisita.test.ts` > "finalização tem trava de clique único e salvamento em andamento" — UI de visita; pré-existente.
6. `src/test/visita/etapasVisita.test.ts` > "seletores dependentes ficam desabilitados sem o pai" — UI de visita; pré-existente.
7. `src/test/config/canonicalTypesGuard.test.ts` > "nenhum arquivo de aplicação importa o types.ts legado" — guarda de tipos canônicos; pré-existente.
8. `src/test/config/cultivofarm-runtime.static.test.ts` > "permite somente o cliente canônico e nenhum contrato gerenciado em produção" — guarda estática de runtime; pré-existente.
Escopo honesto: as falhas de autorização (1–3) são assertions estáticas sobre conteúdo de arquivos e já falhavam no parent; não foram causadas nem agravadas por este recorte, mas permanecem ABERTAS como dívida fora do escopo.

### Gates inalterados
- `AUTHZ_CACHE_FOUNDATION_ENABLED` permanece `false`; nenhuma publicação, DDL ou DML hosted; candidata dos 3 helpers aguarda revisão e aplicação pelo auditor. Risco NÃO é nulo: monitor inativo em produção, integração não homologada, helpers revogação ainda não aplicados.
