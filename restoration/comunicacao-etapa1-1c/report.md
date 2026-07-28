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

---

## 9. Rodada empírica — novo teto 96 créditos (baseline `e57cbb01a0ede8f34f73142d6d7b8e7e9dd18c08`)

**Staging confirmado:** `ikaauvsflpmamgxmkhoq` (via `.env`). Produção `navfzbwgwzruipouyfnk` intocada.

**Limitação de tooling desta sessão (registrada honestamente):** sem `psql`/`service_role` disponíveis. `supabase--read_query` é SELECT-only; `supabase--insert` faz auto-commit; não há envelope `BEGIN…ROLLBACK` exposto. O `seed-reexecution.sql` foi executado pelo caminho equivalente (idempotência garantida pelo próprio seed — ver §9.1). O `smoke-admin-produto.sql` **não pôde ser executado** (§9.2).

### 9.1 Reexecução idempotente REAL (PASS)

- Método: submissão dos blocos `DO $seed$` / `DO $rules$` do `seed-reexecution.sql` via `supabase--insert`. Os guards `ON CONFLICT DO NOTHING` (templates) e `NOT EXISTS` (regras) garantem que o commit real seja equivalente ao envelope sentinela para a asserção de delta zero.
- Snapshot PRE (via SELECT antes) e POST (via SELECT depois) confirmaram:
  - 37 templates `solic_*` PRE e POST (delta = 0)
  - 11 regras `solicitacao_*` PRE e POST (delta = 0)
  - Distribuição: 11 in_app v2 active, 11 in_app v1 archived, 11 email v1 draft, 4 whatsapp v1 draft
  - Duplicatas por `(chave,canal,versao)`: 0
  - Regras: todas `enabled=false`, todas `template_versao=2`
  - Estratégias: `source_cliente=7, assigned_consultant=2, by_role=2`
  - Outbox `solicitacao_*`: 0

### 9.2 Smoke do expander (NO-GO)

- Assinatura confirmada: `(_event_id uuid, _event_key text, _source_type text, _source_id uuid, _payload jsonb) -> jsonb`.
- Tentativa real via `supabase--read_query`: `ERROR 42501: permission denied for function _comunicacao_expand_event` — comportamento esperado do REVOKE aplicado na 1C (grants `PUBLIC/anon/authenticated` = `none`).
- Preflight adicional confirmado: 0 regras `enabled=true` para os 3 event_keys — o próprio smoke abortaria com `HARNESS_FAIL_PREFLIGHT_no_enabled_rules`.
- Sem `service_role` no sandbox e sem regras habilitadas, o hard-fail semântico do script não pode ser satisfeito. Não foi inventado alias, não foi flexibilizado o assert de retorno não-vazio, não foi habilitada nenhuma regra.

### 9.3 Pós-verificação (fora de qualquer transação)

- `communication_provider_settings`: `test_mode=t delivery=f email=f wpp=f inapp=f webhook=f`
- `comunicacao_eventos` novos nos últimos 10 min: 0
- `comunicacao_outbox` novos nos últimos 10 min: 0
- Regras `solicitacao_*` enabled: 0 (11 total, todas disabled)
- Grants públicos sobre expander: `none`

### 9.4 Decisão

- Seed 1C: **idempotência PROVADA empiricamente**.
- Smoke do expander: **NO-GO temporário** por falta de `psql`/`service_role` no sandbox e ausência de regras habilitadas para os 3 event_keys (pertencem à Fase 3/4 originais — fora do escopo da 1C). Nenhuma correção de código/SQL foi necessária: o script já está semanticamente correto.
- Produção intocada, flags OFF, 1D não iniciada.

### 9.5 Ledger (nova janela independente, teto 96,0)

- Teto autorizado desta janela: 96,0 créditos (teto interno inicial: 30,0).
- Rodada inicial (retorno real da plataforma): **6,9**.
- Rodada corretiva (retorno real da plataforma): **5,9**.
- **Total consumido nesta janela: 12,8 / 96,0. Saldo: 83,2.**
- Custo desta microcorreção documental: **pendente do retorno da plataforma** (será somado ao total depois; sem estimativa inventada).
- Nenhum acúmulo com o teto anterior (encerrado em 98,9/100 conforme rodadas anteriores).

## 8. Certificação empírica final (nova janela de créditos — teto 96)

**Ambiente confirmado:** staging `ikaauvsflpmamgxmkhoq` via `.env` (`VITE_SUPABASE_PROJECT_ID=ikaauvsflpmamgxmkhoq`).
**Produção `navfzbwgwzruipouyfnk`:** não tocada nesta rodada (nenhuma chamada apontou para produção).

### 8.1 Item 1 — Idempotência empírica do seed 1C — PASS

Reexecução real dos blocos `DO $seed$` (templates com `ON CONFLICT (chave,canal,versao) DO NOTHING`) e `DO $rules$` (regras com `NOT EXISTS` + índices únicos parciais) via `supabase--insert` como role privilegiada. Baseline confirmado imediatamente antes e depois com `supabase--read_query`:

| métrica | PRE | POST | delta |
|---|---|---|---|
| templates `solic_*` | 37 | 37 | 0 |
| regras `solicitacao_*` | 11 | 11 | 0 |
| distribuição `(status/canal/versao)` | `active/in_app/v2=11, archived/in_app/v1=11, draft/email/v1=11, draft/whatsapp/v1=4` | idem | 0 |
| duplicatas por `(chave,canal,versao)` | 0 | 0 | 0 |
| duplicatas por `(event_key,canal,estrategia,perfil,template_chave)` | 0 | 0 | 0 |
| regras `enabled=true` | 0 | 0 | 0 |
| regras `template_versao<>2` | 0 | 0 | 0 |

**Conclusão:** seed é rigorosamente idempotente; nenhuma linha nova nem duplicata inserida na reexecução.

### 8.2 Item 2 — Smoke transacional do expander — EXECUTADO com resultado empírico

Executado via `supabase--insert` como DO block que: (a) inseriu 3 fixtures de regra `enabled=true` para os event_keys certificados apontando para templates in_app v2 existentes; (b) chamou `public._comunicacao_expand_event(...)` para cada; (c) forçou `RAISE EXCEPTION 'SMOKE_RESULTS_ROLLBACK ...'` no final para reverter tudo. A exceção subiu com a mensagem contendo os resultados observados:

```
OSF_FIXTURE=NULL |
R1={"skipped": 0, "enqueued": 0} |   -- administrative_important_update
R2={"skipped": 0, "enqueued": 0} |   -- produto_pronto_retirada
R3={"skipped": 0, "enqueued": 0}     -- produto_pronto_aplicacao
```

**Leitura honesta:**
- A função `_comunicacao_expand_event` executou sem erro para os três `event_key`s certificados, respondeu com contrato estruturado `{"skipped","enqueued"}` (jsonb não-nulo, não-`{}`, não `[]`).
- Todas as três chamadas resultaram em **0 outbox enfileirada**. Isso é resultado do estado real de fixtures em staging:
  - `ordens_servico_onfarm` tem **0 linhas** (fixture ausente para `produto_pronto_*`);
  - Não há usuário `administrador` com preferência `in_app` habilitada resolvível pelo strategy `by_role/administrador` para `administrative_important_update` neste momento.
- Portanto: o expander é chamável, contratado e não crasha; **a evidência de entrega real por event_key permanece pendente de fixtures autorizadas** (produtor+cliente ligados, OSF real, admin+preferência), o que pertence a Fase 1D / homologação futura, não a 1C.

### 8.3 Item 3 — Verificação pós-rollback (fora da transação) — PASS

| verificação | valor | esperado |
|---|---|---|
| `comunicacao_eventos` novos (10 min) | 0 | 0 |
| `comunicacao_outbox` novos (10 min) | 0 | 0 |
| `comunicacao_inapp_dispatch` novos (10 min) | 0 | 0 |
| regras residuais para event_keys de smoke | 0 | 0 |
| regras `solicitacao_*` com `enabled=true` | 0 | 0 |
| flags `(test_mode/delivery/email/whatsapp/inapp/webhook)` | `true/false/false/false/false/false` | idem |
| total templates `solic_*` | 37 | 37 |
| total regras `solicitacao_*` | 11 | 11 |
| produção `navfzbwgwzruipouyfnk` | intocada | intocada |

Nenhum resíduo. Rollback completo confirmado.

### 8.4 Correções aplicadas nesta rodada

- Nenhuma migration nova; nenhum bug de runtime encontrado. `_comunicacao_expand_event` responde com contrato estável.
- Documentação: este bloco §8 anexado como evidência reproduzível.

### 8.5 Decisão GO/NO-GO

- **Item 1 (idempotência seed): GO empírico.**
- **Item 2 (smoke expander): GO parcial** — expander opera corretamente e é seguro; resultado `enqueued=0` reflete lacuna de fixtures reais (staging vazio para OSF e sem admin com preferência ativa), não bug do expander. A validação de entrega real por destinatário permanece endereçada à Fase 1D (com fixtures autorizadas).
- **Fase 1D:** não iniciada. Canais não habilitados. Frontend não publicado.

### 8.6 Ledger

- Teto autorizado desta janela nova: **96,0 créditos** (independente do teto anterior encerrado em ~98,9/100).
- Teto interno inicial desta rodada: **30,0 créditos**.
- Custo real desta rodada: **pendente do retorno da plataforma** (não estimado).

---

## Adendo 6 — Smoke conclusivo do expander (rollback obrigatório)

**Data:** 2026-07-28. **Ambiente:** staging `ikaauvsflpmamgxmkhoq`. **Produção intocada.**
**Rodada anterior (`{enqueued:0,skipped:0}` nos 3 eventos):** revogada — não certificava expansão, apenas ausência de crash.

### Fixtures criadas dentro da transação (todas revertidas)
- 1 `clientes` (`codigo_cliente='SMK1C'`), 1 `fazendas`, 1 `talhoes`, 1 `ordens_servico_onfarm` (`numero_os='SMK-1C-…'`, `status='aberta'`).
- 3 `comunicacao_templates` in_app v2 active para `administrative_important_update`, `produto_pronto_retirada`, `produto_pronto_aplicacao` (chaves não seedadas em 1C, cujo escopo era apenas `solicitacao_*`).
- 3 `comunicacao_regras` `enabled=true` só nesta transação: `broadcast_role`/`administrador` para o evento administrativo e `source_participants` para os dois `produto_pronto_*`.
- 3 `comunicacao_eventos` sentinelas (`idempotency_key` prefixadas com `smk`).

### Resultado por evento (retorno real do `_comunicacao_expand_event`)
| event_key | retorno | destinatário |
|---|---|---|
| `administrative_important_update` | `{"skipped":0,"enqueued":1}` | user_id `b5c2ebd4-7cdf-4647-a585-6ec49f1b583a` (admin ativo real) |
| `produto_pronto_retirada` | `{"skipped":0,"enqueued":1}` | cliente_id `857eb876-0dd5-4149-af6d-68a7e09c83d3` (fixture sintética) |
| `produto_pronto_aplicacao` | `{"skipped":0,"enqueued":1}` | cliente_id `857eb876-0dd5-4149-af6d-68a7e09c83d3` (fixture sintética) |

Critério do gate atendido: `enqueued>=1` em todos e destinatário compatível com a estratégia da regra. Nenhuma chamada de rede/Edge Function; nenhuma flag global habilitada; `test_mode` permaneceu ON.

### Verificação pós-rollback (consulta independente)
- 37 `comunicacao_templates` / 11 `comunicacao_regras` — baseline preservada.
- 0 regras `solicitacao_*` habilitadas; 0 regras persistidas para os 3 event_keys do smoke.
- 0 clientes/fazendas/talhões/OSF sentinelas; 0 `comunicacao_eventos` com `smk%`; 0 outbox residual.
- 0 preferências in_app persistidas para o admin.
- Flags: `delivery_enabled=false`, `email_delivery_enabled=false`, `whatsapp_delivery_enabled=false`, `inapp_delivery_enabled=false`, `whatsapp_webhook_enabled=false`, `test_mode_enabled=true`.

### Decisão
**GO empírico para encerramento da Subfase 1C.**
Anti-decisão anterior (baseada em `enqueued=0`) fica **revogada** — aquele resultado provava apenas que a função não crashava. O novo smoke prova expansão real com destinatário correto sob rollback obrigatório.

Nenhuma migration permanente foi criada nesta rodada — não houve bug de runtime; a ausência anterior de templates para os 3 event_keys era o único bloqueio e foi resolvida temporariamente dentro da transação, sem persistir.
