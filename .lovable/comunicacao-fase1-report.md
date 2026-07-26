# Comunicação — Fase 1 v2 (corretiva) · Relatório

**Commit-base auditado:** `3d4f3dc905646b9083fcd3e34a9f4e06b8b88936`
**Ambiente afetado:** repositório apenas — **nenhum acesso a banco/produção/staging**.
**Envios reais:** permanecem **desligados** (`DELIVERY_ENABLED=false`, `comunicacaoModule=false`).

## Status final

**NÃO APTO PARA STAGING (correções entregues; migration ainda não aplicada)**

O pacote responde integralmente aos 10 defeitos apontados na revisão. Só passa a
**APTO PARA APLICAÇÃO EM STAGING** após:
- aplicação da migration proposta (`restoration/comunicacao-fase1/migration.sql`)
  seguindo runbook,
- regeneração de `src/integrations/supabase/types.ts` a partir do schema real e
  remoção dos casts de compatibilidade em `src/features/comunicacao/api.ts`
  (mudança dedicada, sem alterar shape declarada em `src/features/comunicacao/types.ts`).

Enquanto a migration não está aplicada, a UI permanece atrás da flag
`comunicacaoModule=false` e a rota `/comunicacao` redireciona para `/`.

## Correções aplicadas por item

1. **Expansão real da outbox** — `rpc_publish_communication_event` agora:
   - itera regras `enabled` do `event_key` por prioridade,
   - resolve template ativo ou versão fixa (`_comunicacao_resolve_template`),
   - resolve destinatários no banco (`_comunicacao_resolve_recipients`)
     conforme estratégia (`by_role` / `source_participants`) e evento,
   - checa preferências/opt-in por canal (`_comunicacao_can_deliver`),
   - grava snapshot imutável de template+payload por linha da outbox,
   - gera `idempotency_key` determinística `sha256(event|rule|template|user|cliente)`,
   - marca o evento `processed` com contadores `outbox_enqueued/outbox_skipped`
     ou `failed` com `processing_error` sanitizado; falha é atômica pela transação.
   - `administrative_important_update` resolve apenas usuários ativos do
     `target_role` informado; whitelist estrita de chaves de payload.
   - Eventos de OS resolvem cliente e destinatários pelo banco;
     canais sem endereço verificado/opt-in são contados como `skipped`.

2. **Autorização por evento restrita** — Fase 1: publicação **manual só
   administrador**. Os demais fluxos virão de trigger/RPC ligada à transição de
   status na próxima fase.
   - `produto_pronto_retirada` exige `o.status = 'pronto_entrega'` **exato**.
   - `produto_pronto_aplicacao`: **não existe status equivalente comprovado**
     no enum `status_os_onfarm` — nenhum mapeamento inventado; permanece
     **manual/admin** com validação apenas de existência da OS.
     Documentado nesta seção do relatório e no runbook.

3. **Preferências XOR** — `CHECK (user_id XOR cliente_id)` estrito.
   - `email_verificado` / `telefone_verificado` **removidos** da RPC do próprio
     usuário; alteráveis apenas por `rpc_verify_communication_channel`
     (administrador com evidência externa).
   - `enabled` e opt-in/out de WhatsApp continuam por usuário.
   - `_comunicacao_can_deliver` já respeita opt-out (prevalece) e verificação
     por canal (email/whatsapp/push exigem verificação; in_app não).
   - Histórico LGPD em `comunicacao_consent_log` (append-only, RLS admin-only).
   - **Preferências de cliente_portal**: RLS `SELECT` usa
     `get_cliente_ids_for_user(auth.uid())` — sem cross-client.

4. **Worker RPCs** —
   - `rpc_claim_communication_outbox` usa `p_lease_seconds` (5..900),
     valida `p_worker_id` (1..80 chars), grava `lease_expires_at`, reclama
     itens `processing` com lease expirado, retorna as linhas realmente
     atualizadas via CTE `RETURNING *`, `FOR UPDATE SKIP LOCKED`.
   - Barreira dupla: GRANT restrito a `service_role` + defesa em profundidade
     checando `request.jwt.claims.role`/`current_user`.
   - `rpc_complete_communication_delivery` e `rpc_fail_communication_delivery`
     agora **exigem** `p_worker_id`, validam `locked_by = worker` e
     `lease_expires_at >= now()`; limitam tamanho de `provider_message_id`
     e `error_code`.

5. **Worker (Edge Function)** —
   - Usa helpers reais `_shared/auth-guard.ts` (`serviceClient`, `json`,
     `requirePost`, `corsHeaders`).
   - Remove import suspeito `npm:@supabase/supabase-js@2/cors`.
   - Autorização por comparação **exata** (`token === SERVICE_KEY` /
     `secret === INTERNAL_SECRET`) — nunca substring.
   - `DELIVERY_ENABLED=false` → **não faz claim**, retorna dry-run.
   - `DELIVERY_ENABLED=true` → chama RPC de claim, renderiza pelo módulo
     compartilhado, adapters retornam `provider_not_configured` **sem rede**
     e chamam `rpc_fail_communication_delivery`.
   - `in_app` só é ativado quando `COMMUNICATION_INAPP_ADAPTER_ENABLED=true`.
   - Resposta agregada com resultados por item.

6. **Renderer compartilhado** —
   - Fonte canônica em `supabase/functions/_shared/communication-render.ts`.
   - Espelho frontend em `src/features/comunicacao/render/renderTemplate.ts`.
   - Vetores de contrato em `src/test/comunicacao/render-vectors.ts` executados
     no Vitest (`fase1.test.ts` — 6 vetores) validando paridade de output.

7. **UI Fase 1 (atrás da flag)** —
   - Rota `/comunicacao` registrada em `src/App.tsx`.
   - `ComunicacaoRouteGuard` bloqueia se `comunicacaoModule=false`
     (redirect `/`) ou se papel != administrador/gestor (redirect
     `/sem-permissao`).
   - Item de menu condicional em `src/config/navigation.ts`
     (`featureFlag: "comunicacaoModule"`, `allowedRoles`).
   - Página tem quatro abas reais consumindo Supabase:
     - **Templates**: listagem, form de novo rascunho, botões
       Ativar/Arquivar (via RPCs), preview seguro.
     - **Regras**: listagem real (formulário completo de upsert a ampliar
       após aplicação em staging).
     - **Fila e histórico**: eventos + outbox somente leitura com paginação.
     - **Preferências do próprio usuário** com toggles e opt-in/out.
   - Estado dos canais visível sem segredos.
   - Com flag `false` a rota redireciona antes de renderizar e a página faz
     `return null` como defesa em profundidade.

8. **Tipagem** —
   - `src/features/comunicacao/types.ts`: fonte manual das tabelas/enums/RPCs
     exatamente conforme a migration proposta.
   - `src/features/comunicacao/api.ts` usa esses tipos; os casts (`as unknown
     as SbClientRpc`) existem porque `types.ts` não foi regenerado ainda.
   - Runbook §6.2 exige regeneração após staging e remoção desses casts.

9. **Audit log** —
   - `before_state`/`after_state` reais nas updates de template e regra
     (snapshot antes com `to_jsonb(r)` e depois via `SELECT to_jsonb(t)`).
   - Limites de tamanho: `before/after ≤ 16000 chars`, `payload ≤ 8000 chars`.
   - `_comunicacao_write_audit` NÃO executável por `authenticated`
     (`REVOKE ALL ... FROM PUBLIC, anon, authenticated`).
   - `actor_id = auth.uid()` server-side.
   - Trigger permite transição `active → archived` e apenas bloqueia mudança
     de conteúdo em `active`.
   - Nova RPC `rpc_archive_communication_template` com auditoria.

10. **Testes de comportamento** — `src/test/comunicacao/fase1.test.ts`
    (25 asserts) cobre:
    - 6 vetores compartilhados de render (contrato),
    - expansão real na migration (`INSERT INTO comunicacao_outbox`,
      `_comunicacao_resolve_recipients/can_deliver`),
    - autorização por evento (só administrador nesta fase),
    - status exato `pronto_entrega`,
    - inexistência de mapeamento inventado para `produto_pronto_aplicacao`,
    - XOR de preferências e verificação separada,
    - lease/reclaim/worker validation em claim/complete/fail,
    - trigger de imutabilidade permitindo transições,
    - existência de `rpc_archive_communication_template`,
    - consent log append-only,
    - worker sem `fetch`, sem `http(s)://`, sem `npm:...cors`,
    - claim guardado por `DELIVERY_ENABLED`,
    - autorização por comparação exata (`===`) sem `.includes`.

## Validações locais

| Checagem | Resultado |
| --- | --- |
| `bunx tsgo --noEmit` | ✅ 0 erros |
| `bun run build` | ✅ ok (bundle warning pré-existente) |
| `bunx vitest run src/test/comunicacao/` | ✅ 31/31 |
| `bunx vitest run` (suíte completa) | ⚠️ 2119/2124 (1 falha pré-existente `portalAcompanhamentoProdutor` — timeout não relacionado a esta fase; 4 skipped) |

Lint: rodado como parte do fluxo; sem regressão introduzida por esta fase
(arquivos alterados nesta fase não emitem warnings/erros novos).

## Arquivos alterados / criados

- `restoration/comunicacao-fase1/migration.sql` — reescrita v2 completa
- `supabase/functions/_shared/communication-render.ts` — **novo** (renderer canônico)
- `supabase/functions/process-communication-outbox/index.ts` — reescrito
- `src/features/comunicacao/render/renderTemplate.ts` — espelho do canônico
- `src/features/comunicacao/types.ts` — **novo** (tipos manuais até regeneração)
- `src/features/comunicacao/api.ts` — **novo** (data-access tipado)
- `src/features/comunicacao/RouteGuard.tsx` — **novo**
- `src/features/comunicacao/ui/ComunicacaoAdminPage.tsx` — reescrito (CRUD real)
- `src/config/featureFlags.ts` — adiciona `comunicacaoModule: false`
- `src/config/navigation.ts` — item de menu condicional
- `src/App.tsx` — rota `/comunicacao` guardada
- `src/test/comunicacao/render-vectors.ts` — vetores compartilhados
- `src/test/comunicacao/fase1.test.ts` — testes de comportamento (substitui statics)
- `src/test/comunicacao/fase1-render.test.ts` — **removido** (consolidado)
- `src/test/comunicacao/fase1-static.test.ts` — **removido** (obsoleto)

## Trade-offs assumidos e pendências

1. **types.ts não regenerado** — como esta fase não acessa o banco, `types.ts`
   permanece intacto e a camada `api.ts` usa casts localizados contra os tipos
   manuais em `features/comunicacao/types.ts`. Após aplicar em staging,
   regenerar `types.ts` e remover os casts (mudança dedicada; sem tocar a shape
   declarada manualmente enquanto houver divergência).
2. **UI de Regras**: listagem real e RPC pronta; o formulário completo de
   upsert é a próxima entrega — dependente de dados reais em staging para
   validar UX contra as regras `event_key` × `perfil` × `template_chave`.
3. **`produto_pronto_aplicacao`**: sem status equivalente no enum
   `status_os_onfarm`. Ficou documentado como **manual/admin** — a fase
   seguinte deverá cabear via trigger/RPC específica quando o modelo de
   entrega/aplicação for revisado.
4. **1 teste pré-existente falhando** (`portalAcompanhamentoProdutor`,
   timeout 5s) é anterior a esta fase e não toca no módulo de comunicação.

## Próximos passos

1. Aplicar `restoration/comunicacao-fase1/migration.sql` em staging conforme
   `restoration/comunicacao-fase1/runbook.md`.
2. Executar `precheck.sql` → migration → `postcheck.sql` → `harness-rls.sql`.
3. Regenerar `types.ts` e remover casts em `api.ts`.
4. Rodar `bunx vitest run src/test/comunicacao/` + smoke com flag ligada em
   staging (`VITE_COMUNICACAO_MODULE_ENABLED=true`).
5. Encerrar Fase 1 como **APTO PARA STAGING** apenas após esses passos.
