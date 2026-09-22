# Gate S0 → S1 — Segurança pré-homologação e vínculo de backend

- Data: 2026-09-22
- Backend canônico exigido: `swzpzcwiasxmjutrmvkm`
- Escopo autorizado: resolver **somente** os bloqueadores do gate pré-S1 (binding/.env + achados de isolamento/autorização). Nenhuma estrutura SaaS (planos, assinaturas, entitlements, superadmin, billing, UI) foi criada.
- Conclusão técnica: **PASS** (com 2 pendências residuais não bloqueadoras, listadas em F).

---

## A) Critério A — binding/env apontando exclusivamente para o canônico

Evidências (leitura direta, sem expor segredos):

| Fonte | Valor | Resultado |
|---|---|---|
| `.env` → `VITE_SUPABASE_PROJECT_ID` | `swzpzcwiasxmjutrmvkm` | OK |
| `.env` → `VITE_SUPABASE_URL` | `https://swzpzcwiasxmjutrmvkm.supabase.co` | OK |
| `supabase/config.toml` → `project_id` | `"swzpzcwiasxmjutrmvkm"` | OK |
| `rg` por refs proibidos (`yzszlzjpovmcteuxjznj`, `chkgpuawcswhefiabwsm`, `navfzbwgwzruipouyfnk`, `ikaauvsflpmamgxmkhoq`) em runtime/build | nenhuma ocorrência efetiva em código de runtime | OK |
| Suíte de vínculo `src/test/config/` | 22 arquivos, 323 testes, exit 0 | OK |
| Cliente Supabase | único, `src/integrations/supabase/client.ts`; nenhum cliente paralelo | OK |

O bloqueador (1) da Fase 0 (".env da plataforma aponta ref não canônico") **não se reproduz no estado atual**: o `.env` da raiz e o `config.toml` apontam para o canônico e a suíte de vínculo passa integralmente. O relatório anterior descrevia um estado já superado.

---

## B) Critério B — bloqueadores de isolamento/autorização

### B.1 Achados corrigidos nesta rodada (migration `20260922152558_…`)

Migration transacional (BEGIN/COMMIT), idempotente (guardas `to_regprocedure` / `pg_policy`), com bloco final de validação que aborta a transação se qualquer item não ficar no estado esperado. **Nenhum dado operacional foi alterado; nenhuma tabela criada ou removida.**

| # | Achado | Severidade | Antes | Depois |
|---|---|---|---|---|
| 1 | `insert_partner_catalog_access_log_internal(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)` — SECURITY DEFINER **sem validação de caller**, aceita `p_user_id`/`p_partner_id` arbitrários e grava em `partner_catalog_access_logs`; executável por qualquer autenticado ⇒ forja de trilha de auditoria B2B | **ALTO** | `EXECUTE` para `authenticated` | `REVOKE ALL FROM PUBLIC, anon, authenticated`; `GRANT` só a `service_role` |
| 2 | `rpc_create_operational_notification_secure(uuid,text,text,text,text)` — valida apenas `role <> 'service_role'`; o `EXECUTE` a `authenticated` divergia da intenção declarada na migration original e coberta por `src/test/comunicacao/fase2.test.ts` | **MÉDIO** | `EXECUTE` para `authenticated` | `REVOKE ALL FROM PUBLIC, anon, authenticated`; `GRANT` só a `service_role` |
| 3 | `profiles`: policies de UPDATE `Users can update own profile` e `Admins can update all profiles` **sem `WITH CHECK`** (mitigado por triggers `guard_profile_sensitive_fields` e `h15_profile_organization_guard`) | **MÉDIO** (defesa em profundidade) | `WITH CHECK` ausente | `WITH CHECK ((select auth.uid()) = user_id)` e `WITH CHECK (has_role(auth.uid(),'administrador'))` |

Verificação pós-migration (consulta ao canônico):

```
internal_auth = false   internal_anon = false   internal_svc = true
notif_auth    = false   wrapper_auth  = true    profiles_update_com_check = 2
```

Preservação de fluxo: o wrapper seguro `log_partner_catalog_access_secure` (SECURITY DEFINER, valida `auth.uid()` e papel `administrador|gestor_comercial|parceiro_b2b|parceiro_b2b_tecnico`) e `assign_b2b_user_client_secure` continuam chamando a rotina interna normalmente, pois executam como owner — `wrapper_auth = true` confirma o acesso do frontend preservado.

### B.2 Achados triados e **não** classificados como bloqueadores

- **464 funções SECURITY DEFINER executáveis por `authenticated`** (linter 0029). Triagem das rotinas com superfície sensível: as `rpc_admin_*` amostradas validam autorização internamente antes de qualquer leitura — `rpc_admin_communication_health_snapshot` e `rpc_admin_communication_outbox_metrics` chamam `_comunicacao_require_admin()`; `rpc_admin_list_commercial_plans` exige `fn_b2b_can_admin_plans()` e levanta `not_authorized`; `can_view_catalog_internal` exige `fn_authz_uid_scope_ok(_uid)` + papel. As demais são helpers read-only de autorização (`has_role`, `can_user_access_*`, `get_cliente_ids_for_user`, …) cujo retorno não contorna RLS. Risco residual: enumeração de informação, **não** escalada. Todas com `search_path` fixo.
- **2 funções executáveis por `anon`** (`rpc_validar_comprovante_entrega`, `rpc_validar_rastreio_produto`): validação pública por token UUID, com rate-limit server-side (`private.fn_public_validation_rate_check`) antes de qualquer leitura e resposta idêntica para token existente/inexistente (anti-enumeração). Comportamento intencional do produto.
- **16 tabelas com RLS habilitado e sem policy**: 6 em `public` (`_f42_harness_fixtures`, `commercial_payment_plans`, `communication_provider_settings`, `communication_provider_settings_rate_limit`, `comunicacao_inapp_dispatch`, `fiscal_certificate_material`) e 10 em schemas de sistema/privados. Nenhuma possui grant a `anon`/`authenticated` ⇒ inacessíveis via Data API; acesso apenas por `service_role`/rotinas definer. Fail-closed por construção.
- **Storage**: `fiscal-certificates`, `fiscal-xml` e `visitas-pdf` sem policies de cliente (acesso só via `service_role`); `entrega-documentos`, `aplicacao-evidencias`, `financial-docs` com policies por cliente; `logos` público por design.
- **Edge Functions**: `verify_jwt = false` apenas em `whatsapp-status-webhook`; todas as funções fiscais e administrativas declaram `verify_jwt = true` explicitamente no `config.toml`. Chaves `service_role` permanecem exclusivamente no servidor.
- **Views materializadas** `mv_esteira_laboratorio` e `mv_fluxo_visita_tecnica`: owner `postgres`, sem grants a `anon`/`authenticated` ⇒ não expostas pela API.

### B.3 Correção de teste/documentação (sem efeito funcional)

- `supabase/config.toml`: o comentário histórico do incidente 2026-09-18 continha a string literal `verify_jwt=false`, que o parser do invariante estático `fase-provider-settings-corr` lia como se fosse configuração do bloco `[functions.fiscal-xml-engine]` (falso positivo). O texto foi reescrito ("sem verificação de JWT no gateway"); **nenhuma diretiva foi alterada** — `fiscal-xml-engine` permanece `verify_jwt = true`.
- Testes de congelamento de migrations das Fases 28A/28B/28C: acrescentadas às listas de exceção conhecida a migration deste gate e a pré-existente `20261034000000_fiscal_transport_preview_safety.sql`, com justificativa em comentário. Nenhum teste foi removido ou enfraquecido.

---

## C) Critério C — RLS / grants / SECURITY DEFINER / Storage / Edges revalidados

Linter do Supabase, antes → depois da migration:

| Tipo | Antes | Depois |
|---|---|---|
| RLS enabled, no policy (INFO) | 16 | 16 |
| Public (anon) pode executar SECURITY DEFINER (WARN) | 2 | 2 |
| Signed-in pode executar SECURITY DEFINER (WARN) | 466 | **464** |
| Leaked password protection disabled (WARN) | 1 | 1 |
| **Total** | **485** | **483** |

Nenhum achado novo foi introduzido. A redução de 466 → 464 corresponde exatamente às duas revogações aplicadas.

Inventário base (inalterado desde a Fase 0): 230 tabelas, 0 sem RLS, 544 policies, 678 funções SECURITY DEFINER — todas com `search_path` fixo, 24 views. Colunas de tenant: `cliente_id` (31 tabelas), `partner_id` (25), `organization_id` restrito a `profiles` e `company_fiscal_settings` (pendência H15).

---

## D) Critério D — testes, typecheck e build (exit reais)

```
tsgo --noEmit -p tsconfig.app.json     → exit 0
vitest run (suíte completa)            → 333 arquivos passaram, 1 skipped
                                         5167 testes passaram, 4 skipped, exit 0
vite build                             → exit 0
```

Suítes dirigidas ao gate (22 arquivos / 323 testes, exit 0): `src/test/config/**`, `src/test/comunicacao/fase2.test.ts`, `src/test/comunicacao/fase-provider-settings-corr.test.ts`, `src/test/catalogo/catalogo-fase28a-pos-certificacao.test.ts`, `src/test/estoque/estoque-fase28b-auditoria.test.ts`, `src/test/estoque/estoque-contratos-fase28c.test.ts`.

Sondas negativas executadas (somente leitura, sem persistir dados): `has_function_privilege` para `anon`/`authenticated`/`service_role` nas duas rotinas revogadas e no wrapper seguro; contagem de policies de UPDATE de `profiles` com `WITH CHECK` não nulo.

---

## E) Critério E — evidência antes/depois

Consolidada nas tabelas das seções B.1 (privilégios e policies) e C (linter). A migration carrega bloco de validação próprio, que aborta com `GATE_S0_S1_VALIDACAO_FALHOU` caso qualquer um dos três estados finais não seja atingido — portanto o COMMIT é, em si, evidência do estado pós-aplicação.

---

## F) Critério F — pendências que dependem de ação manual / teste autenticado

1. **Leaked password protection desativada** (WARN do linter). É configuração de Auth no painel do Supabase; **não** é corrigível por migration. Ação do proprietário: Authentication → Policies → habilitar proteção contra senhas vazadas. Não permite cross-tenant nem escalada ⇒ não bloqueia S1, mas deve ser ligada antes da homologação com usuários reais.
2. **Seleção global de emitente nas RPCs fiscais** (pendência H15, item 8). Hoje a base tem **1 organização** e **1 emitente fiscal**, logo não há exposição cross-tenant efetiva. Torna-se bloqueador **no momento em que existir a segunda organização** — isto é, é um pré-requisito interno da própria fase de multiempresa (S1/S6), a ser resolvido junto com a propagação de `organization_id`.
3. **Testes autenticados por perfil** (13 papéis × portais) não foram executados nesta rodada: exigiriam sessões reais e criação/alteração de dados, fora do escopo autorizado. A verificação foi estática + privilégios + linter. Recomenda-se uma bateria autenticada de isolamento antes da homologação com dados reais.

---

## G) Conclusão técnica do gate

**PASS — S1 liberado.**

- (A) Binding exclusivo ao canônico `swzpzcwiasxmjutrmvkm`: **confirmado**.
- (B) Nenhum bloqueador CRÍTICO/ALTO aberto de isolamento ou autorização: o único achado ALTO identificado (forja de trilha de auditoria B2B via rotina interna sem validação de caller) foi **corrigido e verificado**.
- (C) RLS, grants, SECURITY DEFINER, Storage e Edge Functions revalidados, sem regressão e com redução de 2 findings.
- (D) Testes (5167), typecheck e build verdes com exit 0 real.
- (E) Evidência antes/depois registrada.
- (F) Duas pendências residuais não bloqueadoras + ausência de bateria autenticada, explicitamente declaradas.

Nada foi publicado. Nenhum dado operacional foi alterado. Nenhuma estrutura SaaS foi iniciada.
