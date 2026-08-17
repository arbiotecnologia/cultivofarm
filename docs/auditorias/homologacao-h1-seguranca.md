# FASE H1 — SEGURANÇA DE BANCO, MIGRATIONS E SUPERFÍCIE DE EXECUÇÃO

**Ambiente auditado e corrigido:** staging `ikaauvsflpmamgxmkhoq` (AR-Bio-TEMP).
**Produção `navfzbwgwzruipouyfnk`: NÃO tocada** (runner `restoration/os-e2e/staging-psql.sh` é fail-closed).
**Governança:** AUDITAR → RELATAR → CORRIGIR P0/P1 → RETESTAR → GATE.
**Escopo:** somente H1. H2 não iniciada.

---

## 1. Inventário do staging (evidência direta, read-only)

| Item | Valor confirmado |
| --- | --- |
| Tabelas `public` | 223 — **223/223 com RLS habilitada** |
| Policies | 535 (pré-H1) |
| Funções `public` | 907; 606 `SECURITY DEFINER` |
| `SECURITY DEFINER` sem `search_path` | **0** |
| `SECURITY DEFINER` com `anon EXECUTE` | 23 (pré-H1) → **2 (pós-H1)** |
| Buckets Storage | 14; 13 privados, apenas `logos` público |
| Migration history | 644 versões aplicadas; repo com 681 arquivos → 37 repo-only |
| Edge Functions implantadas | ~34; apenas `fiscal-xml-engine` com `verify_jwt=true` |

---

## 2. Achados H1

| ID | Severidade | Objeto | Descrição | Situação |
| --- | --- | --- | --- | --- |
| H1-001 | **P1** | `aplicacao_emails` | Policy `TO public/SELECT` cujo `USING` só verificava `EXISTS aplicacoes JOIN ordens_servico`, sem vínculo com `auth.uid()`/cliente. Expunha `email`, `enviado_por`, `status`, `idempotency_key` a qualquer autenticado. | **CORRIGIDO** |
| H1-002 | **P1** | `aplicacao_evidencias_vinculos` | `SELECT true`, `INSERT`/`DELETE` apenas com `auth.uid() IS NOT NULL`. Permitia ler e adulterar vínculos de evidência de qualquer aplicação (ID tampering). | **CORRIGIDO** |
| H1-003 | **P1** | `arquivos` | `SELECT true` e `INSERT auth.uid() IS NOT NULL` sobre modelo polimórfico (`entidade_tipo`, `entidade_id`, `arquivo_url`). Leitura cruzada de anexos entre clientes. | **CORRIGIDO** |
| H1-004 | **P1** | `registros_consultor_status_log` | `SELECT true` / `INSERT` livre. Trilha de status legível e forjável por qualquer autenticado. | **CORRIGIDO** |
| H1-005 | **P1** | `solicitacoes_timeline` | `SELECT true` / `INSERT` livre. Timeline de solicitações de outros clientes exposta e injetável. | **CORRIGIDO** |
| H1-006 | **P2** | `organizations` | `SELECT true` para `authenticated`, sem necessidade global comprovada. | **CORRIGIDO** (restrito ao vínculo existente: `profiles.organization_id`, `partner_users.partner_id`, admin/gestor) |
| H1-007 | **P3** | `financial_settings` | `SELECT true`. Classificado como configuração global única, não sensível (chave/valor de parametrização). Sem evidência de multiempresa. | **ACEITO** — sem alteração reflexa; reavaliar em H2 se surgir multiempresa |
| H1-008 | **P1** | 21 funções `SECURITY DEFINER` | `EXECUTE` concedido a `anon`/`PUBLIC` em 15 trigger functions e 6 RPCs internas/autenticadas. | **CORRIGIDO** |
| H1-009 | **P0** | `rpc_notificar_gestor` | Dependência do HEAD (`src/components/aplicacao/AplicacaoFormDialog.tsx`) **ausente** no staging → runtime error garantido no fluxo de aplicação. | **CORRIGIDO** (criada com validação de papel, limites de tamanho e allowlist de link) |
| H1-010 | P2 | Grants de tabela para `anon` | 130 tabelas com `INSERT/UPDATE/DELETE` para `anon`. Com RLS ativa em 223/223 e sem policy permissiva para `anon`, **não é P0 isolado**. Nenhum `REVOKE ALL` em massa executado. | **ACEITO COM RESSALVA** — tratar em H2 por tabela |
| H1-011 | P2 | 37 migrations repo-only | Reconciliadas por conteúdo, não por data do nome. | **CLASSIFICADO** (§4) |
| H1-012 | P2 | Edge `verify_jwt=false` | Auditoria de autenticação em código (§5). | **CLASSIFICADO** |
| H1-013 | P2 | Estoque — reserva | Laço por item sem transação única e sem idempotency key no diálogo de reserva. | **ABERTO (P2)** — motor `rpc_estoque_operar_v1` já é idempotente por chave; o risco residual é de UI |
| H1-014 | P3 | Harnesses de runtime | `*-runtime-harness` são staging-only; `tests/harnesses/README.md` já formaliza a proibição de deploy. | **ACEITO** |

### Classificação das 23 funções com `anon EXECUTE` (achado 9 do briefing)

**Trigger functions (15) — nunca são endpoint RPC; `anon EXECUTE` revogado:**
`comunicacao_dlq_replay_audit_no_mutation`, `enforce_checkin_immutability`, `enforce_diagnostico_immutability`, `enforce_visit_immutability`, `fn_estoque_produto_guard`, `fn_ledger_append_only`, `regulatory_audit_trigger`, `tg_b2b_block_receivable_before_approval`, `tg_block_pofl_delete`, `tg_commercial_price_rules_audit`, `tg_culturas_block_delete_in_use`, `tg_culturas_stamp_desativacao`, `tg_monitoramento_avisos_set_dref`, `tg_notify_payment_terms_pending`, `tg_pcp_audit`.
Triggers executam sob o dono da tabela, não sob o `EXECUTE` do chamador: a revogação **não** afeta o funcionamento.

**RPCs internas/autenticadas (6) — `anon` revogado, `authenticated`/`service_role` mantidos:**
`_notify_role` (interna, sem grant a authenticated), `fn_cultura_em_uso`, `get_visit_organization_id`, `rpc_check_monitoramento_and_notify` (interna), `rpc_create_notificacao_operacional`, `rpc_portal_partner_financial` (já escopada por `auth.uid()`, mas sem caso de uso anônimo).

**RPCs públicas token-scoped (2) — MANTIDAS com `anon EXECUTE`:**
`rpc_validar_comprovante_entrega(uuid)` e `rpc_validar_rastreio_produto(uuid)`. São a validação pública de comprovante/rastreio por identificador opaco (UUID v4, não enumerável). Ressalva P2: **não há rate limit** na borda; recomendação para H2 é limitar por IP na Edge/gateway.

---

## 3. Correção aplicada

**Arquivo:** `restoration/homologacao-h1/10-migration-20260906000000_h1_rls_hardening_v1.sql`
**Rollback:** `restoration/homologacao-h1/90-rollback-20260906000000.sql`
**Postcheck:** `restoration/homologacao-h1/20-postcheck.sql`
**Aplicação:** transação única (`psql -1`), via runner fail-closed, no staging. Exit 0.

> **Por que fora de `supabase/migrations/`:** o executor de migrations da plataforma está vinculado ao banco Sandbox `yzszl…` (blocker H0-001 residual). Aplicar por lá gravaria o DDL no banco errado. O SQL está versionado no repo, é idempotente, tem rollback e nome canônico `20260906000000_h1_rls_hardening_v1` — deve ser importado para `supabase/migrations/` assim que o executor for reapontado ao staging. **Pendência P2 rastreada: H1-015.**

### Helpers criados (todos `SECURITY DEFINER`, `search_path=public`, sem `anon`)
`is_operational_staff`, `can_user_access_aplicacao`, `can_user_manage_aplicacao`, `can_user_access_registro_consultor`, `can_user_access_solicitacao`, `can_user_access_arquivo`.

`can_user_access_arquivo` resolve o modelo polimórfico com **whitelist por `entidade_tipo`** e **default DENY** — tipo desconhecido não vaza. Admin/gestor mantêm administração do acervo.

Todas as policies novas reusam os helpers de vínculo já existentes (`get_cliente_ids_for_user`, `can_view_technical_visit`, `has_role`), preservando os perfis legítimos: administrador, gestor, administrativo, consultor técnico, técnico agrônomo, aplicador, produção, produtor (via cliente) e parceiro (via `partner_users`).

---

## 4. Reconciliação das 37 migrations repo-only

| Categoria | Qtd | Ação |
| --- | --- | --- |
| Bootstrap legado do Sandbox (enums `app_role`, tabelas stub, seeds de sandbox) | 20 | **NÃO aplicar.** Conflitariam com o schema real do staging. Marcadas como não requeridas. |
| Fase OS E2E / Entrega / Comprovante — **já incorporadas semanticamente** (objetos existem no staging, aplicados por SQL direto fora do history) | 16 | **Não reaplicar.** Divergência é de *history*, não de schema. |
| Dependência real do HEAD ausente no staging | 1 (`rpc_notificar_gestor`) | **APLICADA** nesta migration (H1-009). |

Nenhuma migration foi aplicada em lote. Não há schema drift incompatível remanescente com o HEAD.

---

## 5. Edge Functions — classificação de autenticação

`verify_jwt=false` **não é vulnerabilidade por si**: o padrão do projeto é validar o Bearer dentro da função (`supabase/functions/_shared/auth-guard.ts` → `authenticate()` + `hasAnyRole()`), o que é obrigatório sob o sistema de signing keys.

| Função | Auth em código | Privilégio | Veredito |
| --- | --- | --- | --- |
| `fiscal-certificate-upload` / `-revoke` | Bearer + role `administrador` via RPC, depois service_role; valida PFX; AES-256-GCM | alto | OK |
| `admin-update-user-password`, `create-user`, `list-portal-users` | `authenticate()` + `administrador` | alto | OK |
| `communication-provider-settings`, `generate-financial-report`, `generate-financial-receipt` | `authenticate()` + STAFF_ROLES | médio | OK |
| `process-communication-outbox`, `send-push-notification` | `x-internal-secret` = `INTERNAL_FUNCTION_SECRET` (cron interno) | alto | OK |
| `fiscal-preflight`, `fiscal-cnpj-lookup` | Bearer obrigatório | baixo | OK |
| `whatsapp-status-webhook` | webhook de provedor; assinatura verificada; `verify_jwt=false` correto | baixo | OK |
| `*-runtime-harness` (entrega, fase-e, hml-b2b) | staging-only, fora de deploy de produção | — | Ressalva P3 (H1-014) |
| `fiscal-xml-engine` | `verify_jwt=true` + role | alto | OK |

Nenhum endpoint externo sem autenticação suficiente combinado com privilégio elevado foi encontrado. **Nenhum JWT habilitado em massa.**

---

## 6. Testes e retestes

| Verificação | Resultado |
| --- | --- |
| Typecheck (`tsgo`, tsconfig.app) | **0 erros** |
| Vitest completo | **3073 passed / 4 skipped / 0 fail** (187 arquivos) |
| Build de produção | SUCCESS |
| `connection-binding.static.test.ts` (bloqueante) | **8/8 PASS** — `.env`, `client.ts`, `config.toml` apontam para `ikaauvsflpmamgxmkhoq`; produção ausente |
| Postcheck SQL no staging | Todas as 6 tabelas com RLS on; **0** policy `qual=true` remanescente nas tabelas alvo; `anon EXECUTE` reduzido de 23 → **2** (apenas as duas RPCs públicas token-scoped); `rpc_notificar_gestor` presente com `anon=f`, `authenticated=t`; 6 helpers criados |
| Lint | 3274 achados (majoritariamente `no-explicit-any`) — **dívida histórica**, fora do escopo H1 |

**Testes RLS positivos/negativos por perfil (ID tampering):** as novas policies são *expressões* que negam por construção (`can_user_access_*` exige vínculo por `auth.uid()`); a validação estrutural foi feita via postcheck. A execução de harness SQL multi-perfil com sessões reais (`set local role` + `request.jwt.claims`) para cada uma das 6 tabelas **não foi executada** — ver risco residual R-1.

---

## 7. Correção do gate H0

`docs/auditorias/homologacao-h0-baseline.md` fechava em "APROVADA COM RESSALVAS" listando P0/P1 abertos, violando o gate do projeto. Adendo C foi anexado àquele documento corrigindo severidades conforme a evidência direta e registrando que os bloqueadores concretos foram corrigidos nesta fase.

---

## 8. Risco residual e pendências

| ID | Risco | Severidade |
| --- | --- | --- |
| R-1 | Harness RLS multi-perfil com sessões JWT reais não executado; a prova é estrutural (expressão da policy), não comportamental. | **P1 aberto** |
| H1-015 | Migration canônica ainda não presente em `supabase/migrations/` porque o executor está vinculado ao Sandbox. | P2 |
| H1-013 | Diálogo de reserva de estoque: laço por item sem transação única na UI. | P2 |
| H1-010 | 130 tabelas com grants de escrita para `anon` (mitigadas por RLS). | P2 |
| — | `rpc_validar_comprovante_entrega` / `rpc_validar_rastreio_produto` sem rate limit de borda. | P2 |
| H1-007 | `financial_settings` global legível por autenticado. | P3 |
| H1-014 | Harnesses de runtime implantados no staging. | P3 |
| — | Lint: 3274 achados históricos. | P3 |

---

## 9. GATE FINAL H1

> ## **H1 — BLOQUEADA**

**Justificativa:** todos os achados P0 e P1 de *configuração* (H1-001 a H1-006, H1-008, H1-009) foram corrigidos e verificados por postcheck direto no staging, com suíte verde (3073 PASS) e build OK. Entretanto, permanece **R-1 (P1 aberto)**: a comprovação das novas policies é estrutural, não comportamental — não houve execução de teste RLS positivo/negativo por perfil com sessões autenticadas reais, que o próprio escopo H1 exige como obrigatório. Pela regra do projeto (**P0/P1 aberto ⇒ BLOQUEADA**), o gate não pode ser aprovado.

**Caminho de desbloqueio (escopo mínimo, sem nova frente):** executar harness SQL multi-perfil no staging para as 6 tabelas endurecidas — usuário A não lê/insere/deleta registro do cliente B; `anon` sem sessão não lê dado operacional; admin/gestor/técnico/operador/produtor/parceiro preservam acesso legítimo pelo registro pai; RPC pública com token inválido não revela existência; reserva de estoque com dupla submissão não duplica.

**H2 NÃO iniciada.** Relatório pronto para auditoria independente.
