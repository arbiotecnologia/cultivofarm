# Subfase 1C — Relatório técnico

**Ambiente:** staging `ikaauvsflpmamgxmkhoq` (ar-bio-temp). Produção `navfzbwgwzruipouyfnk` **não tocada**.
**Baseline:** commit `ce20a8b6884905ff0fc28b79e234f2641af6bf88`.
**Flags:** todas OFF; test mode ON; zero envio; nenhuma outbox real criada.
**Custo real 1C (retorno da plataforma):** 12,1 (execução inicial) + 15,5 (hardening) + 18,6 (rodada de correção final anterior) + 8,1 (ajuste final mínimo 1C) + 7,9 (microcorreção documental/SQL anterior) = **62,2 créditos** consumidos na subfase 1C até aqui. A última correção cirúrgica atual tem **custo pendente do retorno da plataforma** (não estimado). Ledger geral Etapa 1: 2 (plan) + 7,9 (1A) + 21,1 (1B) + 62,2 (1C) = **93,2 acumulados**; saldo antes desta última correção cirúrgica = **6,8**.

## 1. Migration aplicada

Aditiva/idempotente, sem editar migrations anteriores. Aplicada em uma única transação pela ferramenta oficial.

Conteúdo:

1. **CHECK `comunicacao_regras.estrategia`** estendido de `{by_role, source_participants, broadcast_role}` para `{... , source_cliente, assigned_consultant}`. Constraint recriada como `comunicacao_regras_estrategia_chk`.
2. **Índices únicos parciais** para idempotência de regras (contornam o cast enum→text que não é IMMUTABLE):
   - `ux_comunicacao_regras_evt_canal_estr_tpl_np` — `(event_key, canal, estrategia, template_chave) WHERE perfil IS NULL`
   - `ux_comunicacao_regras_evt_canal_estr_perfil_tpl_wp` — `(event_key, canal, estrategia, perfil, template_chave) WHERE perfil IS NOT NULL`
3. **`_comunicacao_resolve_recipients_v2`** estendido:
   - `source_cliente` → retorna somente `NULL, portal_solicitacoes.cliente_id`.
   - `assigned_consultant` → retorna somente `consultor_atribuido` **se** o profile estiver ativo.
   - `source_participants` preservada por compatibilidade (produtor + consultor).
   - `by_role` continua fail-closed: apenas `administrador` retorna destinatários; gestor/consultor/parceiro/outros → 0.
   - `broadcast_role` para `solicitacao_*` retorna 0.
4. **`_comunicacao_build_snapshot_v2`** estendido para `solicitacao_*`: busca da própria linha `portal_solicitacoes` e devolve `{nome_destinatario, numero, tipo_demanda, urgencia, status_novo, solicitacao_id}` — sem PII (descrição/contato/áudio/fotos/external_event_id fora).
5. **Grants** — `REVOKE ALL` explícito nas duas funções para `PUBLIC`, `anon`, `authenticated`. `service_role` mantém EXECUTE por herança do owner (necessário para trigger/publisher).
6. **Seeds — templates** (26 linhas, `ON CONFLICT (chave,canal,versao) DO NOTHING`):
   - 11 `in_app` ativos (7 produtor + 2 consultor + 2 admin).
   - 11 `email` draft (mesmos destinos, para futura homologação).
   - 4 `whatsapp` draft (produtor: atribuída, checkin, concluída, cancelada).
7. **Seeds — regras** (11 linhas, guardadas por `NOT EXISTS` respeitando os índices únicos parciais):

| # | event_key | canal | estrategia | perfil | template_chave |
|---|-----------|-------|------------|--------|----------------|
| 1 | solicitacao_criada | in_app | source_cliente | — | solic_produtor_criada |
| 2 | solicitacao_atribuida | in_app | source_cliente | — | solic_produtor_atribuida |
| 3 | solicitacao_checkin_realizado | in_app | source_cliente | — | solic_produtor_checkin |
| 4 | solicitacao_em_visita | in_app | source_cliente | — | solic_produtor_em_visita |
| 5 | solicitacao_aguardando_os | in_app | source_cliente | — | solic_produtor_aguardando_os |
| 6 | solicitacao_concluida | in_app | source_cliente | — | solic_produtor_concluida |
| 7 | solicitacao_cancelada | in_app | source_cliente | — | solic_produtor_cancelada |
| 8 | solicitacao_atribuida | in_app | assigned_consultant | — | solic_consultor_atribuida |
| 9 | solicitacao_cancelada | in_app | assigned_consultant | — | solic_consultor_cancelada |
| 10 | solicitacao_criada | in_app | by_role | administrador | solic_admin_criada |
| 11 | solicitacao_urgencia_critica | in_app | by_role | administrador | solic_admin_urgencia_critica |

Todas persistidas com `enabled=false`. Nenhuma regra para email/whatsapp (canais preparados apenas via templates draft; sem provider_template_name).

## 2. Erros corrigidos durante a aplicação

| # | Erro | Correção aplicada na mesma iteração |
|---|------|-------------------------------------|
| E1 | `functions in index expression must be marked IMMUTABLE` (cast `perfil::text` em índice único) | Substituído por dois índices únicos parciais. |
| E2 | `null value in column "nome"` — coluna NOT NULL não coberta pelo seed | Adicionado `nome = chave || ' (' || canal || ')'` no INSERT. |
| E3 | `violates check constraint "comunicacao_regras_estrategia_chk"` — constraint real tinha sufixo `_chk`, não `_check` | Adicionado DROP do nome real (`_chk`) antes de recriar. |

Nenhuma dessas falhas commitou parcialmente — cada tentativa era uma transação atômica.

## 3. Resultado do harness

`restoration/comunicacao-etapa1-1c/harness.sql` — 15 asserts booleanos executados via `SELECT`. Resultado real observado em staging:

```
h1_inapp_active            = true   (11)
h2_email_draft             = true   (11)
h3_whatsapp_draft          = true   (4)
h4_variaveis_allowlist     = true   (26 templates com numero+solicitacao_id)
h5_regras_all_disabled     = true   (11 regras, 11 disabled)
h6_distribuicao            = true   (source_cliente=7, assigned_consultant=2, by_role/admin=2, by_role/outros=0)
h7_sem_orfa                = true   (nenhuma regra sem template correspondente por canal)
h8_check_estendido         = true   (CHECK contém source_cliente + assigned_consultant)
h9a_resolver_revoked       = true   (PUBLIC/anon/authenticated = false)
h9b_snapshot_revoked       = true   (PUBLIC/anon/authenticated = false)
h10_indices_idempotencia   = true   (2 índices únicos parciais criados)
h11_templates_totais       = true   (26)
h12_outbox_zero            = true   (nenhuma linha em comunicacao_outbox gerada por regras solicitacao_*)
h13_uc_apenas_admin        = true   (solicitacao_urgencia_critica só administrador)
h14_ativos_por_par         = true   (11 pares chave×canal ativos)
h15_sem_pii                = true   (nenhum template referencia descricao/telefone/audio/foto/external_event_id/solicitante_contato)
```

## 4. Dívida técnica reconhecida e escopo diferido para 1D

O harness cobre invariantes estruturais e de segurança observáveis sem side-effects. Testes funcionais fim-a-fim das estratégias (produtor recebe / consultor atribuído recebe / cross-tenant recebe 0 / opt-out bloqueia) exigem fabricar linhas em `auth.users`, o que só é seguro via API do GoTrue e portanto está **fora do escopo da 1C**. A lógica das funções foi validada por:

- Inspeção de código (SECURITY DEFINER + search_path fixo + estruturas IF/ELSIF fail-closed).
- Verificação de grants efetivos.
- Confirmação de que nenhuma outbox foi gerada (regras persistidas com enabled=false).
- Testes negativos preservados do harness 1B (publisher rejeitando payload cross-tenant e event_key inválido).

A **1D** deverá:

- Prover fixtures autorizadas (`ikaauvsflpmamgxmkhoq`) com pelo menos 2 clientes, 1 consultor ativo, 1 produtor de outro tenant, 1 admin, para rodar harness funcional em transação com sentinel rollback, ativando regras temporariamente.
- Validar produção deterministicamente do outbox: `source_cliente` → 1 linha; `assigned_consultant` → 1 linha; `by_role/administrador` → N; gestor/parceiro/consultor não atribuído / outro tenant → 0.
- Validar `_comunicacao_can_deliver` respeita `whatsapp_opt_out_at` e `email_verificado`.

## 5. Segurança

- Todas as funções alteradas mantêm `SECURITY DEFINER` + `SET search_path = 'public'`.
- Nenhum GRANT novo a `PUBLIC`/`anon`/`authenticated`. `REVOKE ALL` explícito nas duas funções alteradas.
- Nenhuma nova RLS. Tabelas `comunicacao_*` inalteradas do lado de RLS.
- Nenhum secret armazenado.
- 354 warnings do linter Supabase são pré-existentes (herdados da baseline); nenhum novo introduzido.

## 6. Rollback

Rollback via nova migration:

```sql
-- Remover regras 1C
DELETE FROM public.comunicacao_regras
 WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\';
-- Remover templates 1C
DELETE FROM public.comunicacao_templates
 WHERE chave LIKE 'solic\_%' ESCAPE '\';
-- Remover índices únicos
DROP INDEX IF EXISTS public.ux_comunicacao_regras_evt_canal_estr_tpl_np;
DROP INDEX IF EXISTS public.ux_comunicacao_regras_evt_canal_estr_perfil_tpl_wp;
-- Restaurar CHECK antigo
ALTER TABLE public.comunicacao_regras DROP CONSTRAINT IF EXISTS comunicacao_regras_estrategia_chk;
ALTER TABLE public.comunicacao_regras
  ADD CONSTRAINT comunicacao_regras_estrategia_chk
  CHECK (estrategia = ANY (ARRAY['by_role','source_participants','broadcast_role']));
-- (Restaurar corpo anterior de resolver v2 / snapshot v2 se necessário)
```

## 7. GO / NO-GO para 1D

**NO-GO para 1D.** Estrutura, seeds, funções e segurança estruturais da 1C estão em conformidade (15/15 asserts do harness PASS; 22/22 asserts do harness funcional PASS em rodada anterior). Porém, dois itens permanecem sem execução empírica: (a) reexecução real do seed via `restoration/comunicacao-etapa1-1c/seed-reexecution.sql` com asserts por delta contra o baseline 37/11; (b) smoke reproduzível de `_comunicacao_expand_event` para `administrative_important_update`, `produto_pronto_retirada` e `produto_pronto_aplicacao` via `restoration/comunicacao-etapa1-1c/smoke-admin-produto.sql`. Ambos exigem `psql` como `service_role` em sentinel `BEGIN...ROLLBACK`. Enquanto essa execução real não for anexada como evidência, o gate permanece **NO-GO**; a 1D não deve ser iniciada.

## 8. Artefatos

- Migration: aplicada no schema — registrada em `supabase/migrations/` pela plataforma.
- Harness: `restoration/comunicacao-etapa1-1c/harness.sql`.
- Este relatório técnico.
- Relatório executivo: `.lovable/comunicacao-etapa1-solicitacoes-1c-report.md`.
- Plano atualizado: `.lovable/comunicacao-etapa1-solicitacoes-plano.md`.
