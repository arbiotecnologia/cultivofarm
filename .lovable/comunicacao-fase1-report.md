# Comunicação — Fase 1 v3 (correção final de consistência) · Relatório

**Commit-base auditado:** `face9ff26507254f4046cc5e6fa9cc4cffcf7821`
**Ambiente afetado:** repositório apenas — **nenhum acesso a banco/produção/staging**.
**Envios reais:** permanecem **desligados** (`COMMUNICATION_DELIVERY_ENABLED=false`,
`comunicacaoModule=false` via `VITE_COMUNICACAO_MODULE_ENABLED`).

## Status

**NÃO APTO PARA STAGING.** Migration v3 continua **NÃO APLICADA**. Este relatório
substitui o estado v2 (`comunicacao-fase1-report.md` anterior) e consolida a v3
(descrita em detalhe em `.lovable/comunicacao-fase1-correcao-final.md`) mais o
fechamento operacional deste ciclo.

Só passa a **APTO PARA APLICAÇÃO EM STAGING** após:
- aplicação de `restoration/comunicacao-fase1/migration.sql` v3 seguindo runbook,
- regeneração de `src/integrations/supabase/types.ts` a partir do schema real e
  remoção dos casts em `src/features/comunicacao/api.ts`.

## Correções da v3 (resumo)

1. Joins `profiles.user_id = user_roles.user_id` corretos.
2. `administrative_important_update` deduplica por `target_role` + `broadcast_role`.
3. Payload obrigatoriamente `{}` em eventos de OS; snapshot derivado do banco.
4. Eventos de OS restritos ao cliente da OS via `profiles.cliente_id`;
   `broadcast_role` bloqueado em OS pelo `rpc_upsert_communication_rule`.
5. Atomicidade real: falha na expansão faz rollback; enum
   `comunicacao_evento_status` **sem** label `failed`.
6. Contagem via `GET DIAGNOSTICS ROW_COUNT` (não depende de `FOUND`).
7. `rpc_verify_communication_channel` apenas admin; usuário só controla
   `enabled` / opt-in de WhatsApp em `rpc_update_communication_preferences`
   (3 args: canal, enabled, whatsapp_opt_in).
8. Preferências XOR `user_id` vs `cliente_id` (check constraint).
9. Worker: `worker_id` + lease + reclaim (inalterado da v2).

## Fechamento operacional deste ciclo

1. **Fonte única da flag** — `FEATURE_FLAGS.comunicacaoModule` em
   `src/config/featureFlags.ts` lê exclusivamente
   `import.meta.env.VITE_COMUNICACAO_MODULE_ENABLED === "true"` (ausente ⇒
   `false`). `src/features/comunicacao/flags.ts` virou wrapper fino sobre
   `isFeatureEnabled("comunicacaoModule")`. Rota (`RouteGuard`), menu
   (`navigation.ts` → `featureFlag: "comunicacaoModule"`) e busca consomem a
   mesma verdade.
2. **Sidebar respeita `item.featureFlag`** — `AppSidebar.tsx` e
   `searchNavItems` (via novo helper `isNavItemFeatureEnabled` em
   `src/lib/navigation/search.ts`) filtram itens com `featureFlag` desligada,
   tanto no nível de grupo quanto em `children`. Itens sem `featureFlag`
   seguem inalterados. Com `comunicacaoModule=false` (default), o item
   **Comunicação** não aparece nem na navegação nem nos resultados de busca.
3. **Artefatos SQL sincronizados com migration v3:**
   - `precheck.sql`: valida `profiles.user_id`, `profiles.cliente_id` e
     `get_cliente_ids_for_user`.
   - `postcheck.sql`: exige ausência de `failed` no enum de eventos, ausência
     de `usuarios_cliente_produtor`, e assinaturas atualizadas
     (`rpc_update_communication_preferences` com 3 args,
     `rpc_claim_communication_outbox` com 3 args).
   - `rollback.sql`: assinaturas realinhadas (RPCs 3-arg e 5-arg), inclui
     `comunicacao_consent_log` na checagem de vazio.
   - `harness-rls.sql`: cobre (estrutural) sem policies de escrita direta,
     RLS ligada, anon sem grants, enum sem `failed`, assinatura de RPC de
     preferências, grants de `rpc_claim_*` restritos a service_role, XOR de
     preferências e ausência de referência a `usuarios_cliente_produtor`.
     Cenários runtime documentados no `runbook.md`: dedup por `target_role`,
     payload vazio em OS, `source_participants`/`by_role` restritos ao
     cliente da OS, bloqueio de `broadcast_role` em OS, opt-out,
     lease/reclaim, worker mismatch, `verify_channel` só admin.
   - `runbook.md`: reflete v3, feature flag e assinaturas atuais.
   - `seeds.sql`: mantidos — templates `draft` e regras `disabled`;
     `administrative_important_update` tem exatamente **uma** regra por perfil
     (`broadcast_role + perfil = target_role`), sem multiplicação de
     destinatários.

## `types.ts`

Regenerado automaticamente pelo pipeline de migrations ao aplicar SQL no projeto
gerenciado; edição manual bloqueada por política. Enquanto migration v3 não é
aplicada, `src/features/comunicacao/api.ts` mantém casts
`as unknown as ...` — mudança dedicada logo após a aplicação em staging.

## Validações locais

- Referências obsoletas — `rg` limpo:
  - `usuarios_cliente_produtor` → nenhuma ocorrência no repo.
  - `comunicacao_evento_status.*failed` → nenhuma ocorrência.
  - `profiles.id = ur.user_id` (join antigo) → nenhuma ocorrência.
- `bunx tsgo --noEmit` — sem erros.
- `bun run build` — ok.
- `bunx vitest run src/test/comunicacao/` — verde.

## O que NÃO foi feito (intencional)

- Nenhuma migration aplicada em nenhum ambiente.
- Nenhuma feature flag ligada (env não setado; default continua `false`).
- Nenhum provedor real conectado; worker segue em dry-run.
- Nenhuma alteração de escopo além do fechamento operacional pedido.

## Follow-ups explícitos (fora desta correção)

- Após aplicar `migration.sql` v3 em staging: regenerar `types.ts` e remover
  casts em `src/features/comunicacao/api.ts`.
- Fase 2: gatilhos ligados a transições de status (`ordens_servico`) para
  publicar eventos automaticamente; hoje é publicação manual/admin.
